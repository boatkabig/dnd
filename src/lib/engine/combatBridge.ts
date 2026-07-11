/**
 * ============================================================================
 * Combat Bridge — the single seam between app data shapes and the engine
 * ============================================================================
 *
 * Purpose: expose a pure/seeded combat API so the UI (or any future DM
 * layer) never does combat math directly. Everything here delegates to
 * src/lib/engine/{combat,actionEconomy,effects,movement,vision}.ts — this
 * file contains NO game rules of its own beyond mapping data shapes.
 *
 * Import discipline:
 *   - Runtime imports: src/lib/engine/* only.
 *   - App shapes (Open5e stat blocks, party data): TYPE-ONLY imports.
 *     Callers normalize their own data (e.g. via lib/open5e.ts's getCreature)
 *     and hand this bridge plain objects; the bridge never calls into
 *     lib/open5e.ts, lib/srd.ts, or lib/gameData.ts at runtime.
 *
 * RNG: reuses the engine's existing seed mechanism (mulberry32 via
 * dice.ts's `seed` option, threaded through rollInitiative/resolveAttack).
 * No parallel RNG is introduced.
 * ============================================================================
 */

import {
  createCombat,
  nextTurn,
  startTurn,
  endTurn as engineEndTurn,
  getCurrentCombatant,
  getCombatant,
  resolveAttack,
  applyDamage,
  spendAction,
  spendMovement,
  rollInitiative,
  DAMAGE_TYPES,
  type Combatant,
  type CombatState,
  type CombatPhase,
  type AttackRequest,
  type AttackResult,
  type AttackModifierEntry,
  type DamageRequest,
} from "./combat";
import { getActionDefinition, type ValidationResult } from "./actionEconomy";
import { type ActiveEffect, type TriggerOutcome } from "./effects";
import { SIZE_SPACE, SIZE_REACH, type Position } from "./movement";
import type { SenseProfile } from "./vision";
import type { DamageType } from "./equipment";
import type { AbilityName, CreatureSize } from "./character";

// Type-only references to app-side data shapes. No runtime import from open5e.ts.
import type { NormalizedCreature, NormalizedCreatureAttack, NormalizedCreatureAction } from "../open5e";

// ============================================================================
// 1. INPUT SHAPES — what callers hand the bridge to start a combat
// ============================================================================

/**
 * Minimal party-member input. The live app (src/components/DnDSolo.tsx,
 * src/lib/gameData.ts) builds its character as an untyped `any` blob — this
 * interface is the bridge's own explicit contract, listing only the fields
 * combat actually needs (mirrors the fields present on that object: name,
 * abilities, ac, hp, maxHp, speed in feet).
 */
export interface PartyMemberInput {
  id: string;
  name: string;
  abilities: Record<AbilityName, number>;
  ac: number;
  hp: number;
  maxHp: number;
  speed: number; // ft
  size?: CreatureSize; // defaults to "medium"
  resistances?: string[];
  vulnerabilities?: string[];
  immunities?: string[];
  position?: Position;
}

/** One enemy to add to the encounter, sourced from an Open5e v2 normalized creature. */
export interface EnemyMemberInput {
  id: string;
  creature: NormalizedCreature;
  position?: Position;
}

export interface StartCombatOptions {
  /** Seed for deterministic initiative rolls (offset per combatant index). */
  seed?: number;
  gridW?: number;
  gridH?: number;
  flankingEnabled?: boolean;
}

// ============================================================================
// 2. ENEMY STAT-BLOCK MAPPING — size, senses, attacks, Multiattack
// ============================================================================

/**
 * Per-enemy data the engine's `Combatant` doesn't model (size footprint,
 * senses, attack list, Multiattack plan) — kept in a side table keyed by
 * characterId alongside the engine's CombatState.
 */
export interface EnemyCombatProfile {
  id: string;
  size: CreatureSize;
  /** Space occupied, in feet (D&D size table via movement.ts's SIZE_SPACE). */
  spaceFeet: number;
  senses: SenseProfile;
  /** All structured attacks across every action on the stat block. */
  attacks: NormalizedCreatureAttack[];
  multiattack: MultiattackPlan | null;
}

export interface MultiattackEntry {
  /** Name of the referenced action (e.g. "Bite", "Claw", "Rend"). */
  actionName: string;
  count: number;
}

export interface MultiattackPlan {
  /** Total number of attacks per use of Multiattack. */
  totalAttacks: number;
  /** Attacks tied to a specific named action with an explicit count. */
  fixedEntries: MultiattackEntry[];
  /** Action names mentioned as a flexible pool (e.g. "using Scimitar or Shortbow in any combination"). */
  optionalActionNames: string[];
  /** Original Multiattack action text, for anything the parser couldn't resolve. */
  raw: string;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCountWord(word: string): number | undefined {
  const lower = word.toLowerCase();
  if (NUMBER_WORDS[lower] !== undefined) return NUMBER_WORDS[lower];
  const n = parseInt(word, 10);
  return Number.isFinite(n) ? n : undefined;
}

function splitClauses(text: string): string[] {
  return text
    .split(/,\s*|\.\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse a creature's "Multiattack" action description into a structured plan.
 *
 * D&D stat blocks describe Multiattack in free text, e.g.:
 *   - "The bear makes one Bite attack and one Claw attack." (Brown Bear)
 *   - "The owlbear makes two Rend attacks." (Owlbear)
 *   - "The goblin makes two attacks, using Scimitar or Shortbow in any combination." (Goblin Boss)
 *
 * We deliberately do NOT infer attack count from `attacks.length` — the
 * Multiattack action itself carries zero structured attacks in Open5e v2;
 * the count and the referenced actions only exist in this desc text.
 */
export function parseMultiattack(
  actions: Array<Pick<NormalizedCreatureAction, "name" | "desc">>,
): MultiattackPlan | null {
  const maAction = actions.find((a) => /multiattack/i.test(a.name));
  if (!maAction) return null;

  const otherNames = actions
    .filter((a) => a !== maAction && a.name.trim().length > 0)
    .map((a) => a.name);

  const clauses = splitClauses(maAction.desc);
  const fixedEntries: MultiattackEntry[] = [];
  const optionalActionNames = new Set<string>();
  let generalCount = 0;

  const countAttackPattern = /\b(one|two|three|four|five|six|\d+)\b\s+(.*?)\s*attacks?\b/i;

  for (const clause of clauses) {
    const m = clause.match(countAttackPattern);
    if (m) {
      const count = parseCountWord(m[1]) ?? 1;
      const namePart = m[2].trim();
      const matchedName = namePart
        ? otherNames.find((n) => new RegExp(`\\b${escapeRegExp(n)}\\b`, "i").test(namePart))
        : undefined;
      if (matchedName) {
        fixedEntries.push({ actionName: matchedName, count });
      } else {
        generalCount += count;
      }
      continue;
    }
    for (const n of otherNames) {
      if (new RegExp(`\\b${escapeRegExp(n)}\\b`, "i").test(clause)) {
        optionalActionNames.add(n);
      }
    }
  }

  const fixedTotal = fixedEntries.reduce((sum, e) => sum + e.count, 0);
  return {
    totalAttacks: fixedTotal + generalCount,
    fixedEntries,
    optionalActionNames: [...optionalActionNames],
    raw: maAction.desc,
  };
}

/**
 * Expand a creature's parsed Multiattack into the ORDERED list of structured
 * attacks to perform on its turn (e.g. Brown Bear → [Bite, Claw]; Owlbear →
 * [Rend, Rend]). Returns null when the creature has no usable Multiattack, so
 * callers fall back to a single attack.
 *
 * Rule source: the count and referenced actions live ONLY in the Multiattack
 * desc text (Open5e v2 carries no structured attacks on the Multiattack action
 * itself) — parseMultiattack decodes that, and this maps each referenced action
 * name to its first structured attack. `optionalActionNames` (flexible pools
 * like "Scimitar or Shortbow in any combination") fill any remaining generic
 * attack count round-robin.
 */
export function planMultiattackSequence(
  actions: Array<Pick<NormalizedCreatureAction, "name" | "desc" | "attacks">> | undefined | null,
): NormalizedCreatureAttack[] | null {
  if (!actions || actions.length === 0) return null;
  const plan = parseMultiattack(actions);
  if (!plan || plan.totalAttacks <= 1) return null;

  const attackByAction = new Map<string, NormalizedCreatureAttack>();
  const allAttacks: NormalizedCreatureAttack[] = [];
  for (const a of actions) {
    const atks = a.attacks ?? [];
    for (const atk of atks) allAttacks.push(atk);
    if (atks.length > 0) attackByAction.set(a.name.toLowerCase(), atks[0]);
  }
  if (allAttacks.length === 0) return null;

  const seq: NormalizedCreatureAttack[] = [];
  for (const fe of plan.fixedEntries) {
    const atk =
      attackByAction.get(fe.actionName.toLowerCase()) ??
      allAttacks.find((a) => a.name.toLowerCase() === fe.actionName.toLowerCase());
    if (atk) for (let i = 0; i < fe.count; i++) seq.push(atk);
  }

  const fixedCount = plan.fixedEntries.reduce((s, e) => s + e.count, 0);
  const generalCount = Math.max(0, plan.totalAttacks - fixedCount);
  const pool = plan.optionalActionNames
    .map((n) => attackByAction.get(n.toLowerCase()))
    .filter((a): a is NormalizedCreatureAttack => !!a);
  for (let i = 0; i < generalCount; i++) {
    seq.push(pool.length > 0 ? pool[i % pool.length] : allAttacks[0]);
  }

  if (seq.length <= 1) return null;
  return seq.slice(0, 8); // safety cap against pathological stat blocks
}

/** Build performAttack()-ready pieces from one structured stat-block attack. */
export function buildAttackRequestFromCreatureAttack(
  attack: NormalizedCreatureAttack,
): { modifiers: AttackModifierEntry[]; damageExpr: string; damageType: DamageType } {
  // Open5e v2 quirk: primary damage_type is sometimes null while the type is
  // only present on extra_damage_type — fall back defensively rather than
  // "fixing" open5e.ts (out of this bridge's scope).
  const damageType = normalizeDamageType(attack.damageType ?? attack.extraDamageType);
  const dice = attack.damageDice ?? "1d4";
  const bonus = attack.damageBonus;
  const damageExpr = bonus ? `${dice}${bonus >= 0 ? `+${bonus}` : `${bonus}`}` : dice;
  return {
    modifiers: [{ source: "stat_block", value: attack.toHit }],
    damageExpr,
    damageType,
  };
}

const VALID_SIZES: CreatureSize[] = ["tiny", "small", "medium", "large", "huge", "gargantuan"];

function normalizeSize(raw: string | undefined): CreatureSize {
  const key = (raw ?? "medium").toLowerCase();
  return (VALID_SIZES as string[]).includes(key) ? (key as CreatureSize) : "medium";
}

function normalizeDamageType(raw: string | undefined): DamageType {
  if (raw && (DAMAGE_TYPES as string[]).includes(raw)) return raw as DamageType;
  return "bludgeoning";
}

function filterDamageTypes(list: string[] | undefined): DamageType[] {
  if (!list) return [];
  return list.filter((d): d is DamageType => (DAMAGE_TYPES as string[]).includes(d));
}

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

// ============================================================================
// 3. BRIDGE STATE + START COMBAT
// ============================================================================

export interface CombatBridgeState {
  combat: CombatState;
  /** Enemy-only side table (size/senses/attacks/Multiattack), keyed by characterId. */
  enemyProfiles: Record<string, EnemyCombatProfile>;
}

/** Start a combat encounter from party members + enemies. */
export function startBridgeCombat(
  party: PartyMemberInput[],
  enemies: EnemyMemberInput[],
  options?: StartCombatOptions,
): CombatBridgeState {
  const combatants: Combatant[] = [];
  const enemyProfiles: Record<string, EnemyCombatProfile> = {};

  party.forEach((p, i) => {
    const size = p.size ?? "medium";
    const dexMod = abilityMod(p.abilities.dex);
    const seed = options?.seed !== undefined ? options.seed + i : undefined;
    const { total } = rollInitiative(dexMod, false, seed);
    combatants.push({
      characterId: p.id,
      name: p.name,
      initiative: total,
      isPlayer: true,
      position: p.position ?? { x: 0, y: 0 },
      ac: p.ac,
      hp: p.hp,
      maxHp: p.maxHp,
      speed: p.speed,
      reach: SIZE_REACH[size],
      resistances: filterDamageTypes(p.resistances),
      vulnerabilities: filterDamageTypes(p.vulnerabilities),
      immunities: filterDamageTypes(p.immunities),
      conditionIds: [],
      surprised: false,
      deathSaves: { successes: 0, failures: 0 },
      conscious: true,
    });
  });

  enemies.forEach((e, i) => {
    const c = e.creature;
    const size = normalizeSize(c.sizeKey ?? c.size);
    const dexMod = c.modifiers?.dex ?? abilityMod(c.abilities.dex);
    const seed = options?.seed !== undefined ? options.seed + party.length + i : undefined;
    const { total } = rollInitiative(c.initiativeBonus ?? dexMod, false, seed);

    const attacks: NormalizedCreatureAttack[] = [];
    for (const action of c.actions) {
      for (const atk of action.attacks) attacks.push(atk);
    }

    combatants.push({
      characterId: e.id,
      name: c.name,
      initiative: total,
      isPlayer: false,
      position: e.position ?? { x: 0, y: 0 },
      ac: c.ac,
      hp: c.hp,
      maxHp: c.hp,
      speed: c.speed,
      reach: SIZE_REACH[size],
      resistances: filterDamageTypes(c.damageResistances),
      vulnerabilities: filterDamageTypes(c.damageVulnerabilities),
      immunities: filterDamageTypes(c.damageImmunities),
      conditionIds: [],
      surprised: false,
      deathSaves: { successes: 0, failures: 0 },
      conscious: true,
    });

    enemyProfiles[e.id] = {
      id: e.id,
      size,
      spaceFeet: SIZE_SPACE[size],
      senses: {
        darkvisionRange: c.darkvision,
        blindsightRange: c.blindsight,
        tremorsenseRange: c.tremorsense,
        truesightRange: c.truesight,
      },
      attacks,
      multiattack: parseMultiattack(c.actions),
    };
  });

  const combat = createCombat(combatants, options?.gridW, options?.gridH, {
    flankingEnabled: options?.flankingEnabled,
  });
  return { combat, enemyProfiles };
}

// ============================================================================
// 3b. HP-MIGRATION SEAM — build a bridge from loose app blobs + apply raw damage
// ============================================================================
//
// The live app (DnDSolo.tsx) keeps its combatants as loosely-typed bestiary/SRD
// blobs, NOT NormalizedCreature, so it can't feed startBridgeCombat directly.
// These two helpers are the minimal adapter that lets the persistent bridge OWN
// enemy HP while the UI keeps its blob shapes:
//   - buildBridgeState: blob → Combatant (id/name/ac/hp/speed) → CombatBridgeState.
//   - applyBridgeDamage: apply an ALREADY-FINAL damage amount (resistances +
//     feature dice already layered by the caller) to a target and return the new
//     persistent state + newHP. Empty resistances are used on the seeded
//     combatants, so this is a pure `newHP = max(0, hp - amount)` — the caller
//     reads newHP back as its projected `hpNow` (single owner = the bridge).

/** Minimal combatant descriptor for building a bridge state from app blobs. */
export interface RawCombatantInput {
  id: string;
  name: string;
  ac: number;
  hp: number;
  maxHp?: number;
  speed?: number;
  isPlayer: boolean;
  /**
   * Stage C (combat-state migration): the caller's already-rolled initiative
   * total. When provided, the bridge OWNS this value and the UI derives its
   * initiative order/pointer from getCombatView() instead of holding a parallel
   * copy. When omitted, a placeholder (players before enemies) keeps the
   * HP-only migration path unchanged.
   */
  initiative?: number;
}

/** Build a CombatBridgeState from loose app combatant blobs (empty enemyProfiles). */
export function buildBridgeState(inputs: RawCombatantInput[]): CombatBridgeState {
  const combatants: Combatant[] = inputs.map((o) => ({
    characterId: o.id,
    name: o.name,
    // Stage C: when the caller seeds its already-rolled initiative, the bridge
    // owns it (UI order/pointer projects from getCombatView). Otherwise fall
    // back to the HP-migration placeholder (players before enemies).
    initiative: o.initiative ?? (o.isPlayer ? 20 : 10),
    isPlayer: o.isPlayer,
    position: { x: 0, y: 0 },
    ac: o.ac,
    hp: o.hp,
    maxHp: o.maxHp ?? o.hp,
    speed: o.speed ?? 30,
    reach: 5,
    // Empty resistances on purpose: the caller has already applied the full
    // resist/vuln/immune + feature-dice pipeline, so applyBridgeDamage must not
    // touch the amount again (see applyBridgeDamage / CombatView.mkCombatant).
    resistances: [],
    vulnerabilities: [],
    immunities: [],
    conditionIds: [],
    surprised: false,
    deathSaves: { successes: 0, failures: 0 },
    conscious: true,
  }));
  const combat = createCombat(combatants, 12, 10);
  return { combat, enemyProfiles: {} };
}

export interface ApplyBridgeDamageResult {
  state: CombatBridgeState;
  newHP: number;
  /** false when the target id isn't in the bridge (caller should degrade). */
  found: boolean;
}

/**
 * Apply an already-final damage amount to a target in the persistent bridge
 * state and return the updated state + newHP. Because seeded combatants carry
 * empty resistances, this is exactly `newHP = max(0, hp - amount)` — the same
 * arithmetic the legacy inline `hpNow = Math.max(0, hpNow - dmg)` produced.
 */
export function applyBridgeDamage(
  state: CombatBridgeState,
  targetId: string,
  amount: number,
  damageType: DamageType = "bludgeoning",
): ApplyBridgeDamageResult {
  const target = getCombatant(state.combat, targetId);
  if (!target) return { state, newHP: 0, found: false };
  const dmgResult = applyDamage(
    { targetId, amount, damageType, source: "custom", isCritical: false },
    target.hp,
    !!target.concentratingOn,
  );
  const combat: CombatState = {
    ...state.combat,
    initiativeOrder: state.combat.initiativeOrder.map((c) =>
      c.characterId === targetId
        ? { ...c, hp: dmgResult.newHP, conscious: dmgResult.newHP > 0 ? c.conscious : false }
        : c,
    ),
  };
  return { state: { ...state, combat }, newHP: dmgResult.newHP, found: true };
}

// ============================================================================
// 4. COMBAT VIEW — read-only projection for the UI / AI DM
// ============================================================================

export interface CombatantView {
  id: string;
  name: string;
  isPlayer: boolean;
  initiative: number;
  hp: number;
  maxHp: number;
  ac: number;
  conscious: boolean;
  conditionIds: string[];
  actionBudget: {
    action: number;
    bonusAction: number;
    reactionAvailable: boolean;
    movementRemaining: number;
  };
}

export interface CombatView {
  active: boolean;
  round: number;
  phase: CombatPhase;
  currentCombatantId?: string;
  order: CombatantView[];
  activeEffects: ActiveEffect[];
}

/** Read a combat view: initiative order, current combatant, round, phase, budgets, effects. */
export function getCombatView(state: CombatBridgeState): CombatView {
  const combat = state.combat;
  const current = getCurrentCombatant(combat);
  return {
    active: combat.active,
    round: combat.round,
    phase: combat.phase,
    currentCombatantId: current?.characterId,
    order: combat.initiativeOrder.map((c) => {
      const tracker = combat.actionTrackers[c.characterId];
      return {
        id: c.characterId,
        name: c.name,
        isPlayer: c.isPlayer,
        initiative: c.initiative,
        hp: c.hp,
        maxHp: c.maxHp,
        ac: c.ac,
        conscious: c.conscious,
        conditionIds: c.conditionIds,
        actionBudget: tracker
          ? {
              action: tracker.actionCharges,
              bonusAction: tracker.bonusActionCharges,
              reactionAvailable: tracker.reactionAvailable,
              movementRemaining: tracker.movementRemaining,
            }
          : { action: 0, bonusAction: 0, reactionAvailable: false, movementRemaining: 0 },
      };
    }),
    activeEffects: combat.activeEffects,
  };
}

// ============================================================================
// 5. ATTACK — spend the action, resolve, apply damage, update state
// ============================================================================

export interface PerformAttackParams {
  attackerId: string;
  targetId: string;
  modifiers: AttackModifierEntry[];
  damageExpr: string;
  damageType: DamageType;
  advantage?: boolean;
  disadvantage?: boolean;
  coverAC?: number;
  sneakAttackDice?: string;
  powerAttack?: boolean;
  /** Seed for deterministic testing — threaded straight into the engine's resolveAttack. */
  seed?: number;
  /** Skip spending the "attack" action (e.g. a bonus-action extra attack already tracked by the caller). */
  skipActionSpend?: boolean;
}

export interface PerformAttackOutcome {
  state: CombatBridgeState;
  spend: ValidationResult;
  result?: AttackResult;
}

/** Perform an attack vs. a chosen target id. */
export function performAttack(state: CombatBridgeState, params: PerformAttackParams): PerformAttackOutcome {
  let combat = state.combat;
  let spend: ValidationResult = { valid: true };

  if (!params.skipActionSpend) {
    const def = getActionDefinition("attack")!;
    const spent = spendAction(combat, params.attackerId, def);
    combat = spent.state;
    spend = spent.result;
    if (!spend.valid) {
      return { state, spend, result: undefined };
    }
  }

  const attacker = getCombatant(combat, params.attackerId);
  const target = getCombatant(combat, params.targetId);
  if (!attacker || !target) {
    return { state: { ...state, combat }, spend: { valid: false, reason: "attacker or target not found" } };
  }

  const req: AttackRequest = {
    attackerId: params.attackerId,
    targetId: params.targetId,
    modifiers: params.modifiers,
    advantage: params.advantage,
    disadvantage: params.disadvantage,
    coverAC: params.coverAC ?? 0,
    damageExpr: params.damageExpr,
    damageType: params.damageType,
    sneakAttackDice: params.sneakAttackDice,
    powerAttack: params.powerAttack,
    seed: params.seed,
  };
  const result = resolveAttack(req, {
    ac: target.ac,
    hp: target.hp,
    resistances: target.resistances,
    vulnerabilities: target.vulnerabilities,
    immunities: target.immunities,
  });

  let finalCombat = combat;
  if (result.hit) {
    // resolveAttack already applied resist/vuln/immune to `result.damage`,
    // so applyDamage is reused here purely for newHP + concentration-check —
    // no resistances passed, or it would double-apply the pipeline.
    const dmgReq: DamageRequest = {
      targetId: params.targetId,
      amount: result.damage,
      damageType: result.damageType,
      source: "weapon",
      isCritical: result.critical,
    };
    const dmgResult = applyDamage(dmgReq, target.hp, !!target.concentratingOn);
    finalCombat = {
      ...combat,
      initiativeOrder: combat.initiativeOrder.map((c) =>
        c.characterId === params.targetId
          ? { ...c, hp: dmgResult.newHP, conscious: dmgResult.newHP > 0 ? c.conscious : false }
          : c
      ),
    };
  }

  return { state: { ...state, combat: finalCombat }, spend, result };
}

// ============================================================================
// 6. MOVEMENT — spend movement budget by feet
// ============================================================================

/** Move by feet — spends movement budget; guards against exceeding remaining movement. */
export function moveBy(state: CombatBridgeState, characterId: string, feet: number): { state: CombatBridgeState; ok: boolean } {
  const spent = spendMovement(state.combat, characterId, feet);
  return { state: { ...state, combat: spent.state }, ok: spent.ok };
}

// ============================================================================
// 7. END TURN — advance turn, fire start/end triggers, reset budgets
// ============================================================================

export interface EndTurnOutcome {
  state: CombatBridgeState;
  /** on_turn_end triggers for the departing combatant (ticks its own durations too). */
  onEndTriggers: TriggerOutcome[];
  /** on_turn_start triggers for the arriving combatant (budgets already reset by the time this returns). */
  onStartTriggers: TriggerOutcome[];
}

/** End turn: advance to the next combatant, fire start/end triggers, reset action/move budget. */
export function endTurn(state: CombatBridgeState): EndTurnOutcome {
  const ended = engineEndTurn(state.combat);
  const advanced = nextTurn(ended.state);
  const started = startTurn(advanced);
  return {
    state: { ...state, combat: started.state },
    onEndTriggers: ended.triggers,
    onStartTriggers: started.triggers,
  };
}

// ============================================================================
// 8. ENEMY TURN SEAM — minimal hook point, no AI logic
// ============================================================================

export type EnemyIntent =
  | {
      type: "attack";
      targetId: string;
      modifiers: AttackModifierEntry[];
      damageExpr: string;
      damageType: DamageType;
      advantage?: boolean;
      disadvantage?: boolean;
      coverAC?: number;
      seed?: number;
    }
  | { type: "move"; feet: number }
  | { type: "pass" };

export interface EnemyTurnOutcome {
  state: CombatBridgeState;
  intent: EnemyIntent;
  attack?: PerformAttackOutcome;
  move?: { ok: boolean };
  endTurn: EndTurnOutcome;
}

/**
 * Run one enemy's turn. `decide` is the ONE seam for enemy AI — it receives a
 * read-only view + this enemy's stat-block profile and returns a single
 * intent. This function only executes that intent via the bridge's own
 * primitives and ends the turn; it contains no decision-making of its own.
 */
export function runEnemyTurn(
  state: CombatBridgeState,
  enemyId: string,
  decide: (view: CombatView, profile: EnemyCombatProfile | undefined) => EnemyIntent,
): EnemyTurnOutcome {
  const view = getCombatView(state);
  const profile = state.enemyProfiles[enemyId];
  const intent = decide(view, profile);

  let working = state;
  let attack: PerformAttackOutcome | undefined;
  let move: { ok: boolean } | undefined;

  if (intent.type === "attack") {
    attack = performAttack(working, {
      attackerId: enemyId,
      targetId: intent.targetId,
      modifiers: intent.modifiers,
      damageExpr: intent.damageExpr,
      damageType: intent.damageType,
      advantage: intent.advantage,
      disadvantage: intent.disadvantage,
      coverAC: intent.coverAC,
      seed: intent.seed,
    });
    working = attack.state;
  } else if (intent.type === "move") {
    const moved = moveBy(working, enemyId, intent.feet);
    working = moved.state;
    move = { ok: moved.ok };
  }

  const ended = endTurn(working);
  return { state: ended.state, intent, attack, move, endTurn: ended };
}
