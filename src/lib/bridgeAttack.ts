"use client";

/**
 * Bridge-backed weapon-attack resolver — extracted from game/CombatView.tsx
 * (Phase 3 de-monolith). Pure: every player weapon attack's to-hit + base weapon
 * damage flows through the engine (combatBridge.performAttack) via a throwaway
 * two-combatant CombatBridgeState, returning the pure result for the caller to
 * apply. No React, no component state — lives in lib so weaponAttack.ts and the
 * component can share it without a component→component import. Moved verbatim.
 */
import { performAttack } from "./engine/combatBridge";
import { createCombat, DAMAGE_TYPES, type Combatant } from "./engine/combat";
import type { DamageType } from "./engine/equipment";

export interface BridgeCombatantInput {
  id: string;
  name: string;
  ac: number;
  hp: number;
  maxHp?: number;
  speed?: number;
}

export interface BridgeAttackInput {
  attacker: BridgeCombatantInput;
  target: BridgeCombatantInput;
  /** Summed attack-roll bonus (ability mod + proficiency + situational). */
  attackBonus: number;
  /** Base weapon damage expression, e.g. "1d8+3". */
  damageExpr: string;
  damageType: DamageType;
  advantage?: boolean;
  disadvantage?: boolean;
  /** Cover AC bonus on the target (0 / 2 / 5). */
  coverAC?: number;
  /** Optional deterministic seed (tests). */
  seed?: number;
}

export interface BridgeAttackResult {
  hit: boolean;
  critical: boolean;
  /** Natural d20 value (kept die after adv/disadv). */
  roll: number;
  /** d20 + attackBonus. */
  total: number;
  /** Base weapon damage from the engine (UNRESISTED — caller layers feature
   *  dice then applies resistance once, matching legacy behaviour). */
  damage: number;
  damageType: DamageType;
}

/** Coerce a loose weapon damage-type string into a valid engine DamageType. */
export function toDamageType(raw: string | undefined | null): DamageType {
  const key = (raw ?? "slashing").toLowerCase();
  return (DAMAGE_TYPES as string[]).includes(key) ? (key as DamageType) : "slashing";
}

function mkCombatant(o: BridgeCombatantInput, isPlayer: boolean): Combatant {
  return {
    characterId: o.id,
    name: o.name,
    initiative: isPlayer ? 20 : 10,
    isPlayer,
    position: { x: 0, y: 0 },
    ac: o.ac,
    hp: o.hp,
    maxHp: o.maxHp ?? o.hp,
    speed: o.speed ?? 30,
    reach: 5,
    // Empty damage-type interactions on purpose: the engine returns unresisted
    // base damage so the caller can apply resist/vuln/immune ONCE to the full
    // total (base + feature dice), exactly as the legacy inline path did.
    resistances: [],
    vulnerabilities: [],
    immunities: [],
    conditionIds: [],
    surprised: false,
    deathSaves: { successes: 0, failures: 0 },
    conscious: true,
  };
}

/**
 * Resolve one player weapon attack through the engine and return the pure
 * result. No persistent combat state is retained — a fresh two-combatant
 * bridge state is created and discarded each call.
 */
export function resolveBridgeAttack(input: BridgeAttackInput): BridgeAttackResult {
  const attacker = mkCombatant(input.attacker, true);
  const target = mkCombatant(input.target, false);
  const combat = createCombat([attacker, target], 12, 10);
  const outcome = performAttack(
    { combat, enemyProfiles: {} },
    {
      attackerId: input.attacker.id,
      targetId: input.target.id,
      modifiers: [{ source: "attack", value: input.attackBonus }],
      damageExpr: input.damageExpr,
      damageType: input.damageType,
      advantage: input.advantage,
      disadvantage: input.disadvantage,
      coverAC: input.coverAC ?? 0,
      skipActionSpend: true,
      seed: input.seed,
    },
  );
  const r = outcome.result;
  if (!r) {
    // Should not happen with skipActionSpend, but degrade safely to a miss.
    return { hit: false, critical: false, roll: 0, total: 0, damage: 0, damageType: input.damageType };
  }
  return {
    hit: r.hit,
    critical: r.critical,
    roll: r.roll,
    total: r.total,
    damage: r.damage,
    damageType: input.damageType,
  };
}
