/**
 * ============================================================================
 * D&D Engine Design Document — Chapter 03: Combat System
 * ============================================================================
 *
 * Version: 1.0
 * Target: D&D 5e / 2024 Compatible
 * Architecture: Flow Controller — Combat owns the turn lifecycle, but
 *   delegates ALL game logic to other systems (Dice, Effects, ActionEconomy).
 *
 * Core Principles:
 *   1. Combat = Flow Controller. It contains NO game logic.
 *   2. Start/End Combat: turn order, initiative, round counter.
 *   3. Turn Management: startTurn → action → endTurn → nextCombatant.
 *   4. Attack Resolution Pipeline: roll → compare AC → apply damage → trigger events.
 *   5. Damage Type System: 13 standard types (slashing, fire, etc.).
 *   6. Resistance/Vulnerability/Immunity: pure data on the target.
 *   7. Critical Hit: natural 20 → double damage dice.
 *   8. Death Saves: 3 successes stabilize, 3 failures = death.
 *   9. Opportunity Attacks: leaving enemy reach provokes.
 *  10. Grapple/Shove: contested Athletics vs Athletics/Acrobatics.
 *  11. Flanking (optional rule): ally on opposite side = advantage on attacks.
 *
 * Combat Lifecycle:
 *   createCombat() → startCombat() → startTurn() → (player acts) → endTurn()
 *     → nextCombatant() → ... → endCombat()
 *
 * Each combatant has:
 *   - ActionTracker (Chapter 02) for action economy
 *   - ActiveEffects[] (Chapter 06) for ongoing effects/conditions
 *   - DeathSave tracking (3 success / 3 fail)
 *
 * Cross-References:
 *   - Character.ts (Chapter 01) → provides stats, AC, HP, attack bonus
 *   - ActionEconomy.ts (Chapter 02) → per-turn resource tracking
 *   - Magic.ts (Chapter 04) → spell attacks (resolveSpell called by resolveAttack)
 *   - Equipment.ts (Chapter 05) → weapon damage, armor AC
 *   - Effects.ts (Chapter 06) → damage modifiers, conditions, triggers
 *   - Movement.ts (Chapter 08) → opportunity attacks, reach
 *   - Dice.ts (Chapter 09) → attack/damage rolls
 * ============================================================================
 */

import { roll, rollD20, rollDamage, type RollResult } from "./dice";
import type { DamageType } from "./equipment";
import type { Position } from "./movement";
import {
  type ActionTracker, type ActionDefinition, type ValidationResult,
  createActionTracker, resetTurnActions, validateAction, consumeAction, consumeMovement,
} from "./actionEconomy";
import { type ActiveEffect, type TriggerOutcome, fireTriggers, tickEffect } from "./effects";

// ============================================================================
// 1. COMBAT STATE
// ============================================================================

export type CombatPhase =
  | "initiative"
  | "round_start"
  | "turn_start"
  | "action"
  | "turn_end"
  | "round_end"
  | "ended";

export interface Combatant {
  characterId: string;
  name: string;
  initiative: number;
  isPlayer: boolean;
  position: Position;
  /** AC as of combat start (effects may modify at runtime). */
  ac: number;
  /** HP at combat start. */
  hp: number;
  maxHp: number;
  speed: number;                    // ft
  reach: number;                    // ft
  /** Damage type interactions. */
  resistances: DamageType[];
  vulnerabilities: DamageType[];
  immunities: DamageType[];
  /** Conditions active on this combatant (condition IDs). */
  conditionIds: string[];
  /** Whether this combatant was surprised (D&D 2024: rolls Initiative with Disadvantage, no turn skip). */
  surprised: boolean;
  /** Death save tracking. */
  deathSaves: { successes: number; failures: number };
  /** Whether the combatant is conscious and able to act. */
  conscious: boolean;
  /** Concentration spell currently maintained (if any). */
  concentratingOn?: string;
}

export interface CombatState {
  active: boolean;
  round: number;
  phase: CombatPhase;
  initiativeOrder: Combatant[];
  currentTurnIndex: number;
  grid: { width: number; height: number };
  log: CombatLogEntry[];
  encounterXP: number;
  encounterDifficulty: string;
  /** Lair action initiative count (typically 20, lose ties). */
  lairInitiative?: number;
  /** Optional: flanking rule enabled? */
  flankingEnabled: boolean;
  /** Per-turn resource tracker (Chapter 02) for each combatant, keyed by characterId. */
  actionTrackers: Record<string, ActionTracker>;
  /** Active effects/conditions (Chapter 06) across all combatants. */
  activeEffects: ActiveEffect[];
}

export interface CombatLogEntry {
  round: number;
  turn: number;
  actorId: string;
  action: string;
  result: string;
  timestamp: number;
}

// ============================================================================
// 2. COMBAT FLOW — Start, Next Turn, End
// ============================================================================

/**
 * Initialize a combat encounter.
 * Combatants are sorted by initiative (descending); ties broken by DEX mod
 * (caller should pre-sort or pass a tiebreaker).
 */
export function createCombat(
  combatants: Combatant[],
  gridW: number = 12,
  gridH: number = 10,
  options?: { flankingEnabled?: boolean; lairInitiative?: number },
): CombatState {
  const sorted = [...combatants].sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    // Tie-break: player wins (DM convention)
    return a.isPlayer ? -1 : 1;
  });
  const actionTrackers: Record<string, ActionTracker> = {};
  for (const c of sorted) {
    actionTrackers[c.characterId] = createActionTracker({ characterId: c.characterId, speed: c.speed });
  }
  return {
    active: true,
    round: 1,
    phase: "round_start",
    initiativeOrder: sorted,
    currentTurnIndex: 0,
    grid: { width: gridW, height: gridH },
    log: [],
    encounterXP: 0,
    encounterDifficulty: "unknown",
    lairInitiative: options?.lairInitiative,
    flankingEnabled: options?.flankingEnabled ?? false,
    actionTrackers,
    activeEffects: [],
  };
}

/** Alias: startCombat = createCombat (D&D 5e doesn't have a separate "start" phase). */
export const startCombat = createCombat;

/**
 * Advance to the next combatant's turn.
 * Handles round rollover and lair actions at initiative 20.
 */
export function nextTurn(state: CombatState): CombatState {
  const nextIdx = (state.currentTurnIndex + 1) % state.initiativeOrder.length;
  const newRound = nextIdx === 0 ? state.round + 1 : state.round;
  // D&D 2024: surprise no longer skips the first turn (it applies Disadvantage on Initiative,
  // which is resolved at combat start). We clear the `surprised` flag at end of round 1 for
  // UI display purposes only.
  const combatants = state.initiativeOrder.map((c, i) => {
    if (i === nextIdx && newRound > 1) {
      return { ...c, surprised: false };
    }
    return c;
  });
  return {
    ...state,
    currentTurnIndex: nextIdx,
    round: newRound,
    phase: "turn_start",
    initiativeOrder: combatants,
  };
}

/**
 * End combat. Sets active=false and phase=ended.
 * Victor is logged for narrative purposes.
 */
export function endCombat(state: CombatState, victorId?: string): CombatState {
  const log: CombatLogEntry = {
    round: state.round,
    turn: state.currentTurnIndex,
    actorId: victorId ?? "system",
    action: "end_combat",
    result: victorId ? `Victory: ${victorId}` : "Combat ended",
    timestamp: Date.now(),
  };
  return { ...state, active: false, phase: "ended", log: [...state.log, log] };
}

/** Get the combatant whose turn it currently is. */
export function getCurrentCombatant(state: CombatState): Combatant | undefined {
  return state.initiativeOrder[state.currentTurnIndex];
}

/** Find a combatant by character ID. */
export function getCombatant(state: CombatState, characterId: string): Combatant | undefined {
  return state.initiativeOrder.find(c => c.characterId === characterId);
}

/** Log a combat event for replay / AI narrative generation. */
export function logCombatEvent(
  state: CombatState,
  actorId: string,
  action: string,
  result: string,
): CombatState {
  const entry: CombatLogEntry = {
    round: state.round,
    turn: state.currentTurnIndex,
    actorId,
    action,
    result,
    timestamp: Date.now(),
  };
  return { ...state, log: [...state.log, entry] };
}

// ============================================================================
// 2A. ACTION ECONOMY WIRING (Chapter 02 bridge)
// ============================================================================

/** Get the action tracker for a combatant. Throws if missing (indicates a wiring bug — every combatant gets one from createCombat). */
export function getActionTracker(state: CombatState, characterId: string): ActionTracker {
  const tracker = state.actionTrackers[characterId];
  if (!tracker) throw new Error(`No action tracker for combatant ${characterId}`);
  return tracker;
}

/**
 * Spend an action/bonus action/reaction (per ActionDefinition.cost) for a combatant.
 * Delegates validation to actionEconomy.validateAction — guards against overspend by
 * leaving state unchanged when invalid. Caller inspects `result.valid` to know whether
 * the spend succeeded.
 */
export function spendAction(
  state: CombatState,
  characterId: string,
  def: ActionDefinition,
): { state: CombatState; result: ValidationResult } {
  const tracker = getActionTracker(state, characterId);
  const result = validateAction(def, tracker);
  if (!result.valid) {
    return { state, result };
  }
  const updated = consumeAction(def, tracker);
  return {
    state: { ...state, actionTrackers: { ...state.actionTrackers, [characterId]: updated } },
    result,
  };
}

/**
 * Spend movement (in feet) for a combatant. Guards against exceeding remaining
 * movement — returns `ok: false` and unchanged state rather than throwing, so
 * callers can offer a partial move / reject cleanly.
 */
export function spendMovement(
  state: CombatState,
  characterId: string,
  feet: number,
): { state: CombatState; ok: boolean } {
  const tracker = getActionTracker(state, characterId);
  if (tracker.movementRemaining < feet) {
    return { state, ok: false };
  }
  return {
    state: { ...state, actionTrackers: { ...state.actionTrackers, [characterId]: consumeMovement(tracker, feet) } },
    ok: true,
  };
}

// ============================================================================
// 2B. TURN START / END — wires actionEconomy budget reset + effects triggers
// ============================================================================

/**
 * Start the current combatant's turn:
 *   - Resets their action economy budget (1 action, 1 bonus action, movement = speed).
 *     D&D 2024: reaction refreshes at the start of ITS OWN turn only (other
 *     combatants' turns do not touch it).
 *   - Fires any "on_turn_start" effect triggers (e.g. ongoing poison damage).
 * Caller applies the returned `triggers` (deal damage / heal / apply effect) via
 * the appropriate system; this function only resolves what should fire.
 */
export function startTurn(state: CombatState): { state: CombatState; triggers: TriggerOutcome[] } {
  const current = getCurrentCombatant(state);
  if (!current) return { state, triggers: [] };

  const tracker = state.actionTrackers[current.characterId];
  const actionTrackers = tracker
    ? { ...state.actionTrackers, [current.characterId]: resetTurnActions(tracker, current.speed) }
    : state.actionTrackers;

  const triggers = fireTriggers(state.activeEffects, current.characterId, "on_turn_start");
  return { state: { ...state, actionTrackers }, triggers };
}

/**
 * End the current combatant's turn:
 *   - Fires any "on_turn_end" effect triggers (e.g. regeneration).
 *   - Ticks that combatant's own timed effects (durations measured in rounds
 *     decrement once per their own turn cycle; expired effects are removed).
 * Only the current combatant's effects are ticked — other combatants' durations
 * are untouched until their own turn ends.
 */
export function endTurn(state: CombatState): { state: CombatState; triggers: TriggerOutcome[] } {
  const current = getCurrentCombatant(state);
  if (!current) return { state, triggers: [] };

  const triggers = fireTriggers(state.activeEffects, current.characterId, "on_turn_end");
  const activeEffects = tickEffect(state.activeEffects, current.characterId);
  return { state: { ...state, activeEffects }, triggers };
}

// ============================================================================
// 3. ATTACK RESOLUTION PIPELINE
// ============================================================================

/** One additive component of an attack bonus, tagged with its source for audit/UI display. */
export interface AttackModifierEntry {
  /** e.g. "ability_mod", "proficiency", "magic_weapon", "bless", "other". */
  source: string;
  value: number;
}

export interface AttackRequest {
  attackerId: string;
  targetId: string;
  /**
   * Auditable breakdown of additive attack-roll modifiers (ability mod,
   * proficiency, magic bonus, other effects). Summed to form the attack bonus —
   * callers no longer pass a single opaque number so the "why" is reconstructable.
   */
  modifiers: AttackModifierEntry[];
  /** Forced advantage/disadvantage (e.g. from Reckless Attack). */
  advantage?: boolean;
  disadvantage?: boolean;
  /** Cover AC bonus on the target (0, 2, 5, or Infinity for full cover). */
  coverAC: number;
  /** Damage expression (e.g. "1d8+3"). */
  damageExpr: string;
  damageType: DamageType;
  /** Sneak attack dice (Rogue) — added on hit if conditions met. */
  sneakAttackDice?: string;
  /** Whether the attack benefits from Great Weapon Master / Sharpshooter (-5/+10). */
  powerAttack?: boolean;
  /** Seed for deterministic testing. */
  seed?: number;
}

export interface AttackResult {
  hit: boolean;
  critical: boolean;
  roll: number;                     // natural d20
  total: number;                    // d20 + attackBonus
  targetAC: number;                 // effective AC (with cover)
  damage: number;
  damageType: DamageType;
  damageBreakdown: string;
  effectsApplied: string[];
  killed: boolean;
  resisted: boolean;
  vulnerable: boolean;
  immune: boolean;
  advantageUsed: boolean;
  disadvantageUsed: boolean;
  /** Auditable per-source attack modifiers, echoing the request (ability mod, proficiency, other bonuses). */
  attackModifiers: AttackModifierEntry[];
  /** REAL dice breakdown of the attack roll: d20 value(s) rolled, kept/dropped die, crit/fumble, history string. */
  rollResult: RollResult;
}

/**
 * Resolve an attack: roll → compare AC → apply damage.
 *
 * D&D 5e rules:
 *   - Nat 1: automatic miss
 *   - Nat 20: automatic hit, critical (double damage dice)
 *   - Otherwise: hit if (d20 + attackBonus) >= targetAC
 *
 * Damage pipeline:
 *   1. Roll damage dice (doubled if crit)
 *   2. Add sneak attack dice (doubled if crit)
 *   3. Apply resistance/vulnerability/immunity
 *   4. Apply to target HP
 */
export function resolveAttack(
  req: AttackRequest,
  target: { ac: number; hp: number; resistances?: DamageType[]; vulnerabilities?: DamageType[]; immunities?: DamageType[] },
): AttackResult {
  // Determine advantage state
  let adv: "advantage" | "disadvantage" | "none" = "none";
  if (req.advantage && !req.disadvantage) adv = "advantage";
  else if (req.disadvantage && !req.advantage) adv = "disadvantage";
  // (Both = cancel to none per D&D 5e)

  // Roll the REAL d20 (no modifier baked into the expression, so the per-source
  // modifier breakdown below stays the single source of truth for the bonus —
  // and we sidestep the dice parser's negative-flat-modifier quirk entirely).
  const attackRoll = roll("1d20", {
    advantage: adv === "advantage",
    disadvantage: adv === "disadvantage",
    seed: req.seed,
  });
  const naturalDie = attackRoll.terms[0].kept[0];
  const attackBonus = req.modifiers.reduce((sum, m) => sum + m.value, 0);
  const total = naturalDie + attackBonus;
  const effectiveAC = target.ac + req.coverAC;

  // Hit determination
  let hit: boolean;
  let critical = false;
  if (naturalDie === 1) {
    hit = false;
  } else if (naturalDie === 20) {
    hit = true;
    critical = true;
  } else if (req.coverAC >= 999) {
    // Full cover: unhittable
    hit = false;
  } else {
    hit = total >= effectiveAC;
  }

  // Damage calculation
  let damage = 0;
  let damageBreakdown = "";
  let resisted = false;
  let vulnerable = false;
  let immune = false;
  const effectsApplied: string[] = [];

  if (hit) {
    const dmg = rollDamage(req.damageExpr, critical, { seed: req.seed });
    let totalDmg = dmg.total;
    damageBreakdown = `${req.damageExpr}${critical ? " (crit)" : ""}=${dmg.total}`;

    // Sneak attack
    if (req.sneakAttackDice) {
      const sneak = rollDamage(req.sneakAttackDice, critical, { seed: req.seed });
      totalDmg += sneak.total;
      damageBreakdown += ` + sneak(${req.sneakAttackDice})=${sneak.total}`;
    }

    // Damage type modifiers
    if (target.immunities?.includes(req.damageType)) {
      damage = 0;
      immune = true;
      damageBreakdown += ` (immune)`;
    } else if (target.resistances?.includes(req.damageType)) {
      damage = Math.floor(totalDmg / 2);
      resisted = true;
      damageBreakdown += ` (resisted → ${damage})`;
    } else if (target.vulnerabilities?.includes(req.damageType)) {
      damage = totalDmg * 2;
      vulnerable = true;
      damageBreakdown += ` (vulnerable → ${damage})`;
    } else {
      damage = totalDmg;
    }
  }

  return {
    hit,
    critical,
    roll: naturalDie,
    total,
    targetAC: effectiveAC,
    damage,
    damageType: req.damageType,
    damageBreakdown,
    effectsApplied,
    killed: hit && target.hp - damage <= 0,
    resisted,
    vulnerable,
    immune,
    advantageUsed: adv === "advantage",
    disadvantageUsed: adv === "disadvantage",
    attackModifiers: req.modifiers,
    rollResult: attackRoll,
  };
}

// ============================================================================
// 4. DAMAGE APPLICATION
// ============================================================================

export interface DamageRequest {
  targetId: string;
  amount: number;
  damageType: DamageType;
  source: "weapon" | "spell" | "trap" | "fall" | "environment" | "poison" | "custom";
  isCritical: boolean;
  resistances?: DamageType[];
  vulnerabilities?: DamageType[];
  immunities?: DamageType[];
}

export interface DamageResult {
  rawDamage: number;
  modifiedDamage: number;
  damageType: DamageType;
  modifier: "normal" | "resisted" | "vulnerable" | "immune";
  killed: boolean;
  newHP: number;
  /** Concentration check required (if target was concentrating). */
  concentrationCheckRequired?: { dc: number };
}

/**
 * Apply damage to a target after resistance/vulnerability/immunity pipeline.
 * Pure function — caller updates Combatant HP from result.
 */
export function applyDamage(
  req: DamageRequest,
  currentHP: number,
  isConcentrating: boolean = false,
): DamageResult {
  let damage = req.amount;
  let modifier: DamageResult["modifier"] = "normal";

  if (req.immunities?.includes(req.damageType)) {
    damage = 0;
    modifier = "immune";
  } else if (req.resistances?.includes(req.damageType)) {
    damage = Math.floor(damage / 2);
    modifier = "resisted";
  } else if (req.vulnerabilities?.includes(req.damageType)) {
    damage = damage * 2;
    modifier = "vulnerable";
  }

  const newHP = Math.max(0, currentHP - damage);
  const result: DamageResult = {
    rawDamage: req.amount,
    modifiedDamage: damage,
    damageType: req.damageType,
    modifier,
    killed: newHP <= 0 && currentHP > 0,
    newHP,
  };

  // Flag concentration check needed (DC = max(10, damage/2), capped at 30 per D&D 2024)
  if (isConcentrating && damage > 0) {
    result.concentrationCheckRequired = {
      dc: Math.min(30, Math.max(10, Math.floor(damage / 2))),
    };
  }
  return result;
}

// ============================================================================
// 5. DAMAGE TYPE SYSTEM
// ============================================================================

export const DAMAGE_TYPES: DamageType[] = [
  "slashing", "piercing", "bludgeoning",
  "fire", "cold", "lightning", "thunder", "acid", "poison",
  "psychic", "necrotic", "radiant", "force",
];

/** Categorize damage types for AI decision-making. */
export type DamageCategory = "physical" | "elemental" | "energy" | "mental" | "pure";

export const DAMAGE_CATEGORIES: Record<DamageType, DamageCategory> = {
  slashing: "physical",
  piercing: "physical",
  bludgeoning: "physical",
  fire: "elemental",
  cold: "elemental",
  lightning: "elemental",
  acid: "elemental",
  poison: "elemental",
  thunder: "energy",
  radiant: "energy",
  necrotic: "energy",
  psychic: "mental",
  force: "pure",
};

// ============================================================================
// 6. DEATH SAVE TRACKING
// ============================================================================

export interface DeathSaveResult {
  successes: number;
  failures: number;
  /** Final state after this save. */
  state: "unconscious" | "stable" | "dead" | "revived";
  /** Roll value. */
  roll: number;
}

/**
 * Process a death saving throw.
 * D&D 5e rules:
 *   - Roll d20 (no modifiers, unless feature like Aura of Protection)
 *   - 10+: 1 success
 *   - < 10: 1 failure
 *   - Nat 20: revive with 1 HP
 *   - Nat 1: 2 failures
 *   - 3 successes: stable (unconscious but no more saves)
 *   - 3 failures: dead
 */
export function rollDeathSave(
  current: { successes: number; failures: number },
  roll: number,
  bonus: number = 0,
): DeathSaveResult {
  let successes = current.successes;
  let failures = current.failures;
  let state: DeathSaveResult["state"] = "unconscious";

  const total = roll + bonus;
  if (roll === 20) {
    state = "revived";
    successes = 0;
    failures = 0;
  } else if (total >= 10) {
    successes += 1;
    if (successes >= 3) state = "stable";
  } else {
    if (roll === 1) failures += 2;
    else failures += 1;
    if (failures >= 3) state = "dead";
  }

  return { successes, failures, state, roll };
}

/**
 * Apply healing to a downed character — resets death saves and revives.
 */
export function reviveFromDowned(combatant: Combatant): Combatant {
  return {
    ...combatant,
    deathSaves: { successes: 0, failures: 0 },
    conscious: true,
  };
}

// ============================================================================
// 7. OPPORTUNITY ATTACK TRIGGERS
// ============================================================================

export interface OpportunityAttackTrigger {
  moverId: string;
  fromPosition: Position;
  toPosition: Position;
  threatCharacterIds: string[];
}

/**
 * Determine which combatants get an opportunity attack against a mover.
 * Uses Movement.isWithinReach under the hood, but Combat owns the threat list.
 */
export function getOpportunityAttackTargets(
  state: CombatState,
  moverId: string,
  fromPosition: Position,
  toPosition: Position,
): string[] {
  const attackers: string[] = [];
  for (const c of state.initiativeOrder) {
    if (c.characterId === moverId) continue;
    if (!c.conscious) continue;
    const wasInReach = chebyshev(fromPosition, c.position) * 5 <= c.reach;
    const isInReach = chebyshev(toPosition, c.position) * 5 <= c.reach;
    if (wasInReach && !isInReach) {
      attackers.push(c.characterId);
    }
  }
  return attackers;
}

/** Internal: Chebyshev distance between two positions. */
function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// ============================================================================
// 8. GRAPPLE & SHOVE — D&D 2024 Rules (Saving Throw, not Contested Check)
// ============================================================================

export type ContestedActionType = "grapple" | "shove_push" | "shove_prone";

export interface ContestedActionRequest {
  type: ContestedActionType;
  attackerId: string;
  targetId: string;
  /** Attacker's Strength modifier (D&D 2024: grapple/shove always uses STR). */
  attackerAthleticsMod: number;
  /** Attacker's Proficiency Bonus (D&D 2024: DC = 8 + STR mod + PB). */
  attackerProficiencyBonus: number;
  /** Target's STR save modifier (defender can choose STR or DEX — caller picks best). */
  targetDefenseMod: number;
  /** Target's DEX save modifier (for D&D 2024: defender chooses STR or DEX). */
  targetDexSaveMod?: number;
  advantage?: boolean;
  disadvantage?: boolean;
  seed?: number;
}

export interface ContestedActionResult {
  success: boolean;
  attackerRoll: number;
  attackerTotal: number;
  /** D&D 2024: this is the target's save roll (not attacker's contested check). */
  targetRoll: number;
  targetTotal: number;
  /** The DC the target had to beat: 8 + STR mod + PB (D&D 2024). */
  saveDC: number;
  conditionApplied?: string;
  /** For shove_push: distance pushed in feet (5 ft normal, 10 ft with Shove mastery). */
  pushDistance?: number;
}

/**
 * Resolve a Grapple or Shove (D&D 2024 rules).
 *
 * D&D 2024 (D&D Beyond Free Rules — "Grappling, Shoving"):
 *   - Both are types of Unarmed Strike.
 *   - Attacker rolls no check; instead, the **target makes a saving throw**.
 *   - Target chooses: STR save OR DEX save (defender's choice).
 *   - Save DC = 8 + attacker's STR mod + attacker's Proficiency Bonus.
 *   - Attacker must have a free hand to grapple.
 *   - Success → condition applied (grappled / prone) or pushed 5 ft (10 ft with Push mastery).
 *
 * 5e (2014) used a contested Athletics vs Athletics/Acrobatics check — that rule is GONE in 2024.
 */
export function resolveContestedAction(req: ContestedActionRequest): ContestedActionResult {
  // D&D 2024: Save DC = 8 + attacker's STR mod + attacker's PB
  const saveDC = 8 + req.attackerAthleticsMod + (req.attackerProficiencyBonus || 0);

  // Defender picks the better save (STR or DEX) — D&D 2024 rule
  const strSave = req.targetDefenseMod;
  const dexSave = req.targetDexSaveMod ?? req.targetDefenseMod;
  const bestSaveMod = Math.max(strSave, dexSave);

  // Target rolls the save (with optional adv/dis from external effects)
  let saveAdv: "none" | "advantage" | "disadvantage" = "none";
  if (req.advantage && !req.disadvantage) saveAdv = "advantage"; // adv for attacker = disadv for target
  else if (req.disadvantage && !req.advantage) saveAdv = "disadvantage";

  // Note: adv/dis on attacker translates inversely to the target's save
  const targetSaveAdv: "none" | "advantage" | "disadvantage" =
    saveAdv === "advantage" ? "disadvantage" :
    saveAdv === "disadvantage" ? "advantage" : "none";

  const tgtRoll = rollD20(bestSaveMod, targetSaveAdv, {
    seed: req.seed !== undefined ? req.seed + 1 : undefined,
  });

  const success = tgtRoll.total < saveDC; // target failed save → attacker succeeds
  let conditionApplied: string | undefined;
  let pushDistance: number | undefined;

  if (success) {
    if (req.type === "grapple") conditionApplied = "grappled";
    else if (req.type === "shove_prone") conditionApplied = "prone";
    else if (req.type === "shove_push") pushDistance = 5; // 5 ft push (10 ft with Push mastery applied separately)
  }

  return {
    success,
    attackerRoll: 0, // D&D 2024: attacker doesn't roll
    attackerTotal: saveDC, // For UI display: the DC
    targetRoll: tgtRoll.die,
    targetTotal: tgtRoll.total,
    saveDC,
    conditionApplied,
    pushDistance,
  };
}

// ============================================================================
// 9. FLANKING (Optional Rule)
// ============================================================================

/**
 * Check if a target is flanked by two allies.
 * D&D 5e optional rule: ally on opposite side of target → advantage on melee attacks.
 *
 * Grid rule: attacker and ally must be on directly opposite sides of the target.
 */
export function isFlanking(
  attackerPos: Position,
  targetPos: Position,
  allyPositions: Position[],
): boolean {
  // Vector from target to attacker
  const dx = attackerPos.x - targetPos.x;
  const dy = attackerPos.y - targetPos.y;
  // Opposite position
  const opposite: Position = { x: targetPos.x - dx, y: targetPos.y - dy };
  return allyPositions.some(p => p.x === opposite.x && p.y === opposite.y);
}

// ============================================================================
// 10. CRITICAL HIT CALCULATION
// ============================================================================

/**
 * Calculate critical hit damage (D&D 5e: roll damage dice twice, add modifiers once).
 * Pure function — caller passes the base damage expression.
 */
export function calculateCriticalDamage(
  baseDamageExpr: string,
  modifiers: number = 0,
  seed?: number,
): { total: number; expression: string; breakdown: RollResult } {
  // Double the dice count in the expression
  const doubledExpr = doubleDiceExpression(baseDamageExpr);
  const result = rollDamage(doubledExpr, false, { seed });
  return {
    total: result.total + modifiers,
    expression: doubledExpr,
    breakdown: result,
  };
}

/**
 * Double the dice count in a dice expression.
 * "1d8+3" → "2d8+3", "2d6" → "4d6", "1d8+1d6" → "2d8+2d6"
 */
export function doubleDiceExpression(expr: string): string {
  return expr.replace(/(\d+)d(\d+)/g, (_, count, sides) => `${parseInt(count) * 2}d${sides}`);
}

// ============================================================================
// 11. INITIATIVE HELPERS
// ============================================================================

/**
 * Roll initiative for a combatant.
 * D&D 5e: d20 + DEX modifier (some features add other abilities — initiative style).
 */
export function rollInitiative(
  dexModifier: number,
  advantage: boolean = false,
  seed?: number,
): { roll: number; total: number } {
  const r = rollD20(dexModifier, advantage ? "advantage" : "none", { seed });
  return { roll: r.die, total: r.total };
}

/**
 * Sort combatants by initiative (descending).
 * Tiebreaker: DEX mod (higher first), then player wins.
 */
export function sortInitiative(
  combatants: Array<{ initiative: number; isPlayer?: boolean; dexMod?: number }>,
): typeof combatants {
  return [...combatants].sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    if ((b.dexMod ?? 0) !== (a.dexMod ?? 0)) return (b.dexMod ?? 0) - (a.dexMod ?? 0);
    return (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0);
  });
}

// ============================================================================
// 12. SURPRISE — D&D 2024 Rules
// ============================================================================

/**
 * D&D 2024 Surprise rules (D&D Beyond Free Rules — "Initiative"):
 *   - Surprise is NOT a condition and does NOT skip turns.
 *   - A surprised creature simply has **Disadvantage on its Initiative roll**.
 *   - The creature can still act, move, and react normally on round 1.
 *
 * 5e (2014) said surprised creatures skip their first turn — that rule is GONE in 2024.
 * This engine follows 2024 rules. Apply disadvantage at initiative-rolling time,
 * not by skipping the turn.
 *
 * Note: the `surprised` field is retained for backwards-compatibility / logging only;
 * it does NOT cause turn-skipping. Use `rollInitiative(disadvantage=true)` when the
 * combatant is surprised.
 */

/**
 * Mark a combatant as surprised — they will roll Initiative with Disadvantage.
 * (D&D 2024: no turn skip; no reaction restriction.)
 */
export function setSurprised(state: CombatState, characterId: string): CombatState {
  return {
    ...state,
    initiativeOrder: state.initiativeOrder.map(c =>
      c.characterId === characterId ? { ...c, surprised: true } : c
    ),
  };
}

/**
 * Check if a combatant can act this turn.
 * D&D 2024: surprise does NOT prevent acting — only conscious check applies.
 */
export function canActThisTurn(combatant: Combatant): boolean {
  return combatant.conscious;
}

// ============================================================================
// 13. SUMMARY — For AI DM / UI
// ============================================================================

/** Produce a human-readable summary of the combat state. */
export function summarizeCombat(state: CombatState): string {
  if (!state.active) return "Combat ended";
  const current = getCurrentCombatant(state);
  const order = state.initiativeOrder
    .map(c => `${c.name}(${c.initiative})${c.conscious ? "" : "✗"}`)
    .join(" → ");
  return `Round ${state.round} | ${current?.name ?? "—"}'s turn | Order: ${order}`;
}

/** Summarize a combatant's status for AI DM / UI. */
export function summarizeCombatant(c: Combatant): string {
  const conditions = c.conditionIds.length > 0 ? ` [${c.conditionIds.join(", ")}]` : "";
  const saves = !c.conscious ? ` (saves: ${c.deathSaves.successes}✓/${c.deathSaves.failures}✗)` : "";
  return `${c.name} HP ${c.hp}/${c.maxHp} AC ${c.ac}${conditions}${saves}`;
}
