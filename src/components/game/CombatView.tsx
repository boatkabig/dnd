/**
 * ============================================================================
 * CombatView — the combat slice, re-plumbed onto the engine via combatBridge
 * ============================================================================
 *
 * Background (see PROGRESS.md § Problems): the app historically shipped THREE
 * parallel combat implementations; only the buggy inline monolith in
 * DnDSolo.tsx ever ran, while the tested engine sat dead. This module starts
 * paying that down for the player weapon-attack path:
 *
 *   1. `resolveBridgeAttack` — the single mutation seam. Every player weapon
 *      attack's to-hit + base weapon damage now flows through the engine
 *      (`combatBridge.performAttack` → `resolveAttack`), NOT hand-rolled dice
 *      inline. The engine is the source of truth for the roll, crit, cover and
 *      base damage.
 *   2. `CombatEnemyList` — the enemy target picker. Clicking an enemy card
 *      records it as the selected target so the attack lands on the enemy the
 *      player chose (the target-selection bug this task fixes), not always the
 *      first alive enemy.
 *
 * Data-shape note: the app keeps its combat UI state in DnDSolo's `cb` object
 * (enemies as loosely-typed blobs). Rather than maintain a second persistent
 * combat state (the very "parallel implementations" disease we're curing),
 * `resolveBridgeAttack` builds a throwaway two-combatant `CombatBridgeState`
 * per attack, asks the bridge to resolve it, and returns the pure result. The
 * caller applies the returned damage to its own `cb.enemies` — one UI state,
 * one engine math seam.
 */

import React from "react";
import { performAttack } from "@/lib/engine/combatBridge";
import { createCombat, DAMAGE_TYPES, type Combatant } from "@/lib/engine/combat";
import type { DamageType } from "@/lib/engine/equipment";

// ---------------------------------------------------------------------------
// Bridge-backed attack resolver (the "mutations go through combatBridge" seam)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Enemy target picker (the target-selection UI)
// ---------------------------------------------------------------------------

export interface CombatEnemyListProps {
  enemies: any[];
  /** Currently selected target uid (null = none → attacks fall back to first alive). */
  selectedTargetId: string | null;
  onSelectTarget: (uid: string) => void;
  thinking: boolean;
  downed: boolean;
}

/**
 * Renders the horizontal strip of enemy cards. Clicking a living enemy card
 * selects it as the attack target; the selected card is highlighted. Preserves
 * the legacy `.enemy-card` / `.hpbar-label` markup the e2e net asserts on.
 */
export function CombatEnemyList({
  enemies,
  selectedTargetId,
  onSelectTarget,
  thinking,
  downed,
}: CombatEnemyListProps): React.ReactElement {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
      {enemies.map((e: any) => {
        const alive = e.hpNow > 0;
        const selectable = alive && !thinking && !downed;
        const isSelected = selectedTargetId === e.uid && alive;
        return (
          <div
            key={e.uid}
            className={"enemy-card" + (e.hpNow <= 0 ? " dead" : "") + (isSelected ? " selected" : "")}
            style={{
              cursor: selectable ? "pointer" : "default",
              borderColor: isSelected ? "#E0A83E" : alive ? "#6E3448" : undefined,
              boxShadow: isSelected ? "0 0 8px rgba(224,168,62,0.45)" : undefined,
            }}
            onClick={() => {
              if (selectable) onSelectTarget(e.uid);
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {e.hpNow <= 0 ? "💀 " : ""}
              {isSelected ? "🎯 " : ""}
              {e.th}
            </div>
            <div style={{ fontSize: 11, color: "#8A7F9E" }}>
              AC {e.ac}
              {e.cr ? ` · CR ${e.cr}` : ""}
            </div>
            <div className="hpbar" style={{ height: 12, marginTop: 4 }}>
              <div
                className="hpbar-fill"
                style={{ width: Math.max(0, (e.hpNow / e.hp) * 100) + "%", background: "#C74B44" }}
              />
              <span className="hpbar-label" style={{ fontSize: 9 }}>
                {e.hpNow}/{e.hp}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CombatEnemyList;
