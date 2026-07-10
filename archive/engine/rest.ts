/**
 * ============================================================================
 * D&D Engine Design Document — Chapter 10: Rest & Recovery
 * ============================================================================
 *
 * Version: 1.0
 * Target: D&D 5e / 2024 Compatible
 * Architecture: Rest Pipeline + Recovery Rules + Downtime Activities
 *
 * Core Principles:
 *   1. RestType = Short Rest (1 hr) or Long Rest (8 hr).
 *   2. Short Rest: spend Hit Dice to heal, recover class resources (Action Surge,
 *      Bardic Inspiration, Second Wind), refresh Pact Magic slots.
 *   3. Long Rest: restore HP to max, recover **ALL** Hit Dice (2024 change from 5e's "half"),
 *      restore all standard spell slots, clear short/long-rest effects, reduce exhaustion by 1.
 *   4. Rest requirements: safe location, no interruptions (combat breaks rest).
 *   5. Rest interruption: any combat or strenuous activity cancels the rest.
 *   6. Recovery rules: HP (Hit Dice), spell slots (long rest), features (per-rest
 *      refresh), resources (Action Surge, Superiority Dice, etc.), exhaustion.
 *   7. Downtime activities: crafting, training, research, work, recuperating,
 *      carousing — each is a data-driven definition.
 *
 * Rest Pipeline:
 *   1. canRest(character, restType, environment) → validate (safe? at least 1 hr free?)
 *   2. performShortRest / performLongRest → apply recovery rules
 *   3. checkInterruption() → if interrupted, rest fails (no benefits)
 *   4. trigger on_rest event (Effects system clears until_short_rest effects)
 *
 * Recovery Rules:
 *   - HP (Short Rest): spend Hit Dice (max = character level); each die = class
 *     hit die + CON mod; player chooses how many to spend.
 *   - HP (Long Rest): restore to max HP (no HD spend needed).
 *   - Hit Dice (Long Rest): recover **ALL** spent Hit Dice (D&D 2024 change from 5e's "half total, min 1").
 *   - Spell Slots (Long Rest): restore all standard slots to max.
 *   - Pact Magic (Short Rest): restore pact magic slots.
 *   - Features (per-rest): refresh per their definition (Short Rest or Long Rest).
 *   - Exhaustion (Long Rest): reduce by 1 level.
 *
 * Cross-References:
 *   - Character.ts (Chapter 01) → HP, max HP, Hit Dice, level, exhaustion
 *   - Magic.ts (Chapter 04) → SpellSlotState, restoreAllSlots, restorePactMagicSlots
 *   - Effects.ts (Chapter 06) → clearOnShortRest, clearOnLongRest
 *   - ActionEconomy.ts (Chapter 02) → extraResources reset per rest
 * ============================================================================
 */

import type { AbilityName } from "./character";
import type { SpellSlotState } from "./magic";
import {
  restoreAllSlots,
  restorePactMagicSlots,
} from "./magic";
import type { ActiveEffect } from "./effects";
import { clearOnShortRest, clearOnLongRest } from "./effects";
import { rollDamage } from "./dice";

// ============================================================================
// 1. REST TYPES
// ============================================================================

export type RestType = "short_rest" | "long_rest";

export interface RestTypeDef {
  type: RestType;
  name: string;
  /** Required duration in minutes (Short = 60, Long = 480). */
  durationMinutes: number;
  description: string;
}

export const REST_TYPES: Record<RestType, RestTypeDef> = {
  short_rest: {
    type: "short_rest",
    name: "Short Rest",
    durationMinutes: 60,
    description: "1 hour of rest. Spend Hit Dice to recover HP. Refresh short-rest resources.",
  },
  long_rest: {
    type: "long_rest",
    name: "Long Rest",
    durationMinutes: 480,
    description: "8 hours of rest (6 sleeping, 2 light activity). Restore HP to max, recover half Hit Dice, refresh all spell slots, reduce exhaustion by 1.",
  },
};

// ============================================================================
// 2. HIT DICE TRACKING
// ============================================================================

/**
 * Per-character Hit Dice pool.
 * Each class level grants 1 Hit Die of that class's hit die type (d6/d8/d10/d12).
 * Multiclass characters have a mixed pool.
 */
export interface HitDicePool {
  /** Total hit dice by die size (e.g. { "d8": 5, "d6": 2 }). */
  bySize: Record<string, { max: number; current: number }>;
  /** Total hit dice across all sizes. */
  totalMax: number;
  totalCurrent: number;
}

/**
 * Create a HitDicePool from a list of class levels.
 * Each entry: { classLevel: number, hitDie: number (6/8/10/12) }
 */
export function createHitDicePool(
  classLevels: Array<{ level: number; hitDie: number }>,
): HitDicePool {
  const bySize: Record<string, { max: number; current: number }> = {};
  let totalMax = 0;
  for (const cl of classLevels) {
    const size = `d${cl.hitDie}`;
    if (!bySize[size]) bySize[size] = { max: 0, current: 0 };
    bySize[size].max += cl.level;
    bySize[size].current += cl.level;
    totalMax += cl.level;
  }
  return { bySize, totalMax, totalCurrent: totalMax };
}

/**
 * Spend a Hit Die during a Short Rest.
 * Returns the heal amount (die roll + CON mod) and the updated pool.
 */
export function spendHitDie(
  pool: HitDicePool,
  dieSize: string,
  conModifier: number,
  seed?: number,
): { heal: number; newPool: HitDicePool } {
  const entry = pool.bySize[dieSize];
  if (!entry || entry.current <= 0) {
    return { heal: 0, newPool: pool };
  }
  const heal = rollDamage(`1${dieSize}`, false, { seed }).total + conModifier;
  const newPool: HitDicePool = {
    bySize: {
      ...pool.bySize,
      [dieSize]: { ...entry, current: entry.current - 1 },
    },
    totalMax: pool.totalMax,
    totalCurrent: pool.totalCurrent - 1,
  };
  return { heal: Math.max(1, heal), newPool };
}

/**
 * Recover Hit Dice after a Long Rest: D&D 2024 — restore ALL spent Hit Dice.
 * Source: D&D Beyond Free Rules 2024 — "Long Rest": "You regain all lost Hit Points
 * and all spent Hit Point Dice."
 *
 * 5e (2014) recovered only half total (min 1). 2024 restores everything for faster pacing.
 */
export function recoverHitDice(pool: HitDicePool): HitDicePool {
  // D&D 2024: restore ALL Hit Dice to max
  const bySize: Record<string, { max: number; current: number }> = {};
  let totalCurrent = 0;
  for (const [size, entry] of Object.entries(pool.bySize)) {
    bySize[size] = { max: entry.max, current: entry.max };
    totalCurrent += entry.max;
  }
  return { bySize, totalMax: pool.totalMax, totalCurrent };
}

// ============================================================================
// 3. REST REQUIREMENTS — Validation
// ============================================================================

export interface RestEnvironment {
  /** Is the location safe from random encounters? */
  isSafe: boolean;
  /** Is the location comfortable (bed, fire)? Affects some optional rules. */
  isComfortable: boolean;
  /** Weather conditions (affects interruption chance). */
  weather: "clear" | "rain" | "storm" | "snow" | "extreme";
  /** Hostile creatures nearby? */
  hasHostilesNearby: boolean;
}

export interface RestRequirement {
  valid: boolean;
  reason?: string;
  /** Required duration in minutes. */
  requiredMinutes: number;
}

/**
 * Check if a character can rest in the given environment.
 *
 * D&D 2024 (D&D Beyond Free Rules — "Long Rest"): "After you finish a Long Rest, you must
 * wait at least **16 hours** before starting another one."
 * (5e used "1 per 24 hours" — 2024 changed this to "16 hours between rests".)
 *
 * D&D 2024 interruption triggers (D&D Beyond Free Rules — "Short Rest" & "Long Rest"):
 *   - Rolling Initiative (combat)
 *   - Casting a spell other than a cantrip
 *   - Taking any damage (new in 2024 — did not exist in 5e)
 *   - 1 hour of walking or other physical exertion (Long Rest only)
 *
 * Short Rest interruption: first three triggers — no benefits conferred, no resume possible.
 * Long Rest interruption: all four triggers; if rested ≥1 hour before, gain Short Rest benefits;
 * can resume with +1 hour per interruption.
 */
export function canRest(
  restType: RestType,
  environment: RestEnvironment,
  lastLongRestHoursAgo: number = 17,
): RestRequirement {
  const def = REST_TYPES[restType];
  if (restType === "long_rest") {
    // D&D 2024: must wait at least 16 hours between Long Rests (was 24 in 5e)
    if (lastLongRestHoursAgo < 16) {
      return {
        valid: false,
        reason: `ต้องรออย่างน้อย 16 ชั่วโมงหลัง Long Rest ก่อนหน้า (D&D 2024 — เหลือ ${16 - lastLongRestHoursAgo} ชม.)`,
        requiredMinutes: def.durationMinutes,
      };
    }
    if (environment.weather === "extreme") {
      return {
        valid: false,
        reason: "Extreme weather makes long rest impossible without shelter.",
        requiredMinutes: def.durationMinutes,
      };
    }
    if (environment.hasHostilesNearby) {
      return {
        valid: false,
        reason: "Cannot rest safely with hostile creatures nearby.",
        requiredMinutes: def.durationMinutes,
      };
    }
  }
  if (restType === "short_rest") {
    if (environment.hasHostilesNearby) {
      return {
        valid: false,
        reason: "Cannot short rest with hostile creatures nearby.",
        requiredMinutes: def.durationMinutes,
      };
    }
  }
  return { valid: true, requiredMinutes: def.durationMinutes };
}

// ============================================================================
// 4. REST INTERRUPTION
// ============================================================================

export type InterruptionType =
  | "combat"               // Rolling Initiative (D&D 2024: cancels both Short & Long Rest)
  | "non_cantrip_spell"    // Casting a spell other than a cantrip (D&D 2024: cancels)
  | "damage_taken"         // Taking any damage (D&D 2024 NEW: cancels — did not exist in 5e)
  | "strenuous_activity"   // 1 hour of walking or other physical exertion (Long Rest only)
  | "environmental_hazard"
  | "noise"
  | "hostile_encounter"
  | "magical_disturbance"
  | "none";

export interface RestInterruption {
  type: InterruptionType;
  description: string;
  /** Minutes into the rest when interruption occurred. */
  minutesIntoRest: number;
  /** Does this completely cancel the rest? (D&D 2024: more interruptions cancel than 5e.) */
  cancelsRest: boolean;
  /** D&D 2024 Long Rest only: if interrupted after ≥1 hr, gain Short Rest benefits. */
  grantsShortRestBenefitsInstead: boolean;
  /** D&D 2024 Long Rest only: can resume with +1 hour per interruption. */
  canResume: boolean;
}

/**
 * Check if a rest is interrupted by a given event.
 *
 * D&D 2024 (D&D Beyond Free Rules — "Short Rest" & "Long Rest"):
 *   Short Rest interrupted by: Rolling Initiative / non-cantrip spell / any damage.
 *   → No benefits, NO resume possible.
 *
 *   Long Rest interrupted by: Rolling Initiative / non-cantrip spell / any damage / 1 hr exertion.
 *   → If rested ≥1 hr before interruption → gain Short Rest benefits.
 *   → Can resume with +1 hour per interruption.
 */
export function checkInterruption(
  restType: RestType,
  interruption: InterruptionType,
  minutesIntoRest: number,
  totalInterruptionMinutes: number = 0,
): RestInterruption {
  if (interruption === "none") {
    return {
      type: "none", description: "No interruption.",
      minutesIntoRest, cancelsRest: false,
      grantsShortRestBenefitsInstead: false, canResume: false,
    };
  }
  const descriptions: Record<Exclude<InterruptionType, "none">, string> = {
    combat: "Rolling Initiative (combat) — D&D 2024: hard-interrupts any rest.",
    non_cantrip_spell: "Casting a non-cantrip spell — D&D 2024: hard-interrupts any rest.",
    damage_taken: "Taking damage — D&D 2024 NEW: hard-interrupts any rest.",
    strenuous_activity: "1 hour of walking or physical exertion — D&D 2024: interrupts Long Rest.",
    environmental_hazard: "Environmental hazard (storm, earthquake) interrupted the rest.",
    noise: "Loud noise disturbed the rest.",
    hostile_encounter: "A hostile creature was encountered.",
    magical_disturbance: "A magical disturbance (telepathic intrusion, etc.) disrupted rest.",
  };

  // D&D 2024 hard-interrupt triggers (cancel both Short & Long Rest)
  const hardInterrupts: InterruptionType[] = ["combat", "non_cantrip_spell", "damage_taken"];
  const isHardInterrupt = hardInterrupts.includes(interruption);

  let cancelsRest = false;
  let grantsShortRestBenefitsInstead = false;
  let canResume = false;

  if (restType === "short_rest") {
    // Short Rest: any hard interrupt cancels — no benefits, no resume
    if (isHardInterrupt) cancelsRest = true;
    if (interruption === "environmental_hazard" || interruption === "magical_disturbance") {
      cancelsRest = true; // DM-fiat environmental effects
    }
  } else {
    // Long Rest
    if (isHardInterrupt) {
      cancelsRest = true;
      // D&D 2024: if rested ≥1 hour before interruption → gain Short Rest benefits
      if (minutesIntoRest >= 60) {
        grantsShortRestBenefitsInstead = true;
      }
      // D&D 2024: can resume with +1 hour per interruption
      canResume = true;
    } else if (interruption === "strenuous_activity") {
      // 1 hour of walking/physical exertion — only interrupts Long Rest
      cancelsRest = totalInterruptionMinutes + 60 > 60; // cancels if total strenuous time exceeds threshold
      if (cancelsRest && minutesIntoRest >= 60) grantsShortRestBenefitsInstead = true;
      canResume = true;
    } else if (interruption === "environmental_hazard" || interruption === "magical_disturbance") {
      cancelsRest = true;
      canResume = true;
    }
  }

  return {
    type: interruption,
    description: descriptions[interruption as Exclude<InterruptionType, "none">],
    minutesIntoRest,
    cancelsRest,
    grantsShortRestBenefitsInstead,
    canResume,
  };
}

// ============================================================================
// 5. SHORT REST — Recovery rules
// ============================================================================

export interface ShortRestRequest {
  characterId: string;
  /** Hit dice to spend (player chooses how many). */
  hitDiceToSpend: Array<{ dieSize: string; count: number }>;
  conModifier: number;
  currentHP: number;
  maxHP: number;
  hitDicePool: HitDicePool;
  /** Resources that refresh on short rest (e.g. Action Surge, Bardic Inspiration). */
  shortRestResources: Array<{ id: string; max: number }>;
  /** Pact magic slots (Warlock). */
  spellSlots?: SpellSlotState;
  /** Active effects. */
  activeEffects: ActiveEffect[];
  seed?: number;
}

export interface ShortRestResult {
  newHP: number;
  hpRegained: number;
  newHitDicePool: HitDicePool;
  /** Resources restored to max. */
  restoredResources: string[];
  newSpellSlots?: SpellSlotState;
  newActiveEffects: ActiveEffect[];
  logSummary: string;
}

/**
 * Perform a Short Rest.
 * Pipeline:
 *   1. Spend Hit Dice (heal = sum of rolls + CON mod each)
 *   2. Restore short-rest resources to max
 *   3. Restore Pact Magic slots (if Warlock)
 *   4. Clear effects with duration "until_short_rest"
 *
 * D&D 5e: a character can choose to spend 0 Hit Dice if they wish.
 */
export function performShortRest(req: ShortRestRequest): ShortRestResult {
  let hp = req.currentHP;
  let hitDicePool = req.hitDicePool;
  let totalHeal = 0;
  const healLog: string[] = [];
  let seedCounter = req.seed ?? 0;

  // Spend Hit Dice
  for (const { dieSize, count } of req.hitDiceToSpend) {
    for (let i = 0; i < count; i++) {
      const result = spendHitDie(hitDicePool, dieSize, req.conModifier, seedCounter);
      if (result.heal > 0) {
        totalHeal += result.heal;
        hitDicePool = result.newPool;
        healLog.push(`${dieSize}=${result.heal}`);
      }
      seedCounter++;
    }
  }
  hp = Math.min(req.maxHP, hp + totalHeal);

  // Restore Pact Magic slots
  let newSpellSlots = req.spellSlots;
  if (req.spellSlots?.pactMagicSlots) {
    newSpellSlots = restorePactMagicSlots(req.spellSlots);
  }

  // Restore short-rest resources
  const restoredResources = req.shortRestResources.map(r => r.id);

  // Clear until_short_rest effects
  const newActiveEffects = clearOnShortRest(req.activeEffects);

  return {
    newHP: hp,
    hpRegained: totalHeal,
    newHitDicePool: hitDicePool,
    restoredResources,
    newSpellSlots,
    newActiveEffects,
    logSummary: `Short rest: healed ${totalHeal} HP [${healLog.join(", ") || "no HD spent"}], restored ${restoredResources.length} resources.`,
  };
}

// ============================================================================
// 6. LONG REST — Recovery rules
// ============================================================================

export interface LongRestRequest {
  characterId: string;
  currentHP: number;
  maxHP: number;
  hitDicePool: HitDicePool;
  /** Resources that refresh on long rest (includes short-rest resources). */
  longRestResources: Array<{ id: string; max: number }>;
  /** All spell slots (standard + pact magic). */
  spellSlots?: SpellSlotState;
  /** Active effects. */
  activeEffects: ActiveEffect[];
  /** Current exhaustion level (0 = none, 6 = dead). */
  exhaustionLevel: number;
  seed?: number;
}

export interface LongRestResult {
  newHP: number;
  hpRegained: number;
  newHitDicePool: HitDicePool;
  restoredResources: string[];
  newSpellSlots?: SpellSlotState;
  newActiveEffects: ActiveEffect[];
  newExhaustionLevel: number;
  logSummary: string;
}

/**
 * Perform a Long Rest.
 * Pipeline:
 *   1. Restore HP to max (no Hit Dice spend needed)
 *   2. Recover ALL spent Hit Dice (D&D 2024 change — was half in 5e)
 *   3. Restore ALL spell slots (standard + pact magic)
 *   4. Restore all long-rest resources to max
 *   5. Clear effects with duration "until_short_rest" or "until_long_rest"
 *   6. Reduce exhaustion by 1 (min 0)
 */
export function performLongRest(req: LongRestRequest): LongRestResult {
  // HP restoration
  const newHP = req.maxHP;
  const hpRegained = newHP - req.currentHP;

  // Hit Dice recovery: D&D 2024 — restore ALL spent Hit Dice (was "half total, min 1" in 5e)
  const newHitDicePool = recoverHitDice(req.hitDicePool);

  // Spell slot restoration
  let newSpellSlots = req.spellSlots;
  if (req.spellSlots) {
    newSpellSlots = restoreAllSlots(req.spellSlots);
    if (newSpellSlots?.pactMagicSlots) {
      newSpellSlots = restorePactMagicSlots(newSpellSlots);
    }
  }

  // Restore resources
  const restoredResources = req.longRestResources.map(r => r.id);

  // Clear effects
  const newActiveEffects = clearOnLongRest(req.activeEffects);

  // Reduce exhaustion by 1 (min 0)
  const newExhaustionLevel = Math.max(0, req.exhaustionLevel - 1);

  return {
    newHP,
    hpRegained,
    newHitDicePool,
    restoredResources,
    newSpellSlots,
    newActiveEffects,
    newExhaustionLevel,
    logSummary: `Long rest: HP ${req.currentHP}→${newHP}, HD ${req.hitDicePool.totalCurrent}→${newHitDicePool.totalCurrent}, exhaustion ${req.exhaustionLevel}→${newExhaustionLevel}.`,
  };
}

// ============================================================================
// 7. DOWNTIME ACTIVITIES — Data-Driven
// ============================================================================

export type DowntimeType =
  | "crafting"
  | "training"
  | "research"
  | "work"
  | "recuperating"
  | "carousing"
  | "spell_scribing"
  | "exploration"
  | "religious_service"
  | "custom";

export interface DowntimeDef {
  type: DowntimeType;
  name: string;
  description: string;
  /** Required days to complete one unit of activity. */
  daysRequired: number;
  /** Cost in gold per day. */
  costPerDay: number;
  /** Required proficiency (e.g. "smiths_tools" for crafting armor). */
  requiredProficiency?: string;
  /** Outcome: what the activity produces. */
  outcome: {
    type: "item" | "gold" | "xp" | "skill_proficiency" | "feature" | "information" | "favor" | "custom";
    /** ID of the produced item/feature/etc. */
    id?: string;
    /** Amount of gold earned (for "work"). */
    goldAmount?: number;
    /** XP earned (rare; usually milestone). */
    xpAmount?: number;
    /** Description of the outcome (for "information" or "favor"). */
    description?: string;
  };
}

/**
 * Standard downtime activities. Adding new types = appending to this array.
 */
export const STANDARD_DOWNTIME: DowntimeDef[] = [
  {
    type: "crafting", name: "Crafting",
    description: "Craft a non-magical item using appropriate tools.",
    daysRequired: 1, costPerDay: 0,
    outcome: { type: "item" },
  },
  {
    type: "training", name: "Training",
    description: "Learn a new language, tool proficiency, or skill.",
    daysRequired: 250, costPerDay: 1,
    outcome: { type: "skill_proficiency" },
  },
  {
    type: "research", name: "Research",
    description: "Research lore, spells, or information in a library.",
    daysRequired: 7, costPerDay: 5,
    outcome: { type: "information" },
  },
  {
    type: "work", name: "Work",
    description: "Perform skilled or unskilled labor for wages.",
    daysRequired: 1, costPerDay: 0,
    outcome: { type: "gold", goldAmount: 5 },
  },
  {
    type: "recuperating", name: "Recuperating",
    description: "Recover from disease, poison, or frailty.",
    daysRequired: 3, costPerDay: 2,
    outcome: { type: "custom", description: "Cures disease, poison, or frailty condition." },
  },
  {
    type: "carousing", name: "Carousing",
    description: "Socialize, drink, and make friends in town.",
    daysRequired: 5, costPerDay: 10,
    outcome: { type: "favor" },
  },
  {
    type: "spell_scribing", name: "Spell Scribing",
    description: "Scribe a spell scroll into a spellbook (Wizard).",
    daysRequired: 2, costPerDay: 10,
    requiredProficiency: "arcana",
    outcome: { type: "item" },
  },
  {
    type: "religious_service", name: "Religious Service",
    description: "Perform religious service at a temple.",
    daysRequired: 1, costPerDay: 0,
    outcome: { type: "favor" },
  },
];

export function getDowntimeDef(type: DowntimeType): DowntimeDef | undefined {
  return STANDARD_DOWNTIME.find(d => d.type === type);
}

// ============================================================================
// 8. RECOVERY RULES — Data-driven
// ============================================================================

/**
 * What gets recovered on a rest. Each class/feature declares its recovery type.
 */
export type RecoveryType = "short_rest" | "long_rest" | "per_use" | "permanent";

export interface ResourceDef {
  id: string;
  name: string;
  max: number;
  recovery: RecoveryType;
  /** Description of what this resource does. */
  description?: string;
}

/**
 * Standard D&D 5e resources with their recovery types.
 */
export const STANDARD_RESOURCES: ResourceDef[] = [
  { id: "action_surge", name: "Action Surge", max: 1, recovery: "short_rest", description: "Take an additional action on your turn (Fighter L2)." },
  { id: "action_surge_improved", name: "Action Surge (Improved)", max: 2, recovery: "short_rest", description: "Two uses per short rest (Fighter L17)." },
  { id: "second_wind", name: "Second Wind", max: 1, recovery: "short_rest", description: "Bonus action heal 1d10+Fighter level HP (Fighter L1)." },
  { id: "bardic_inspiration", name: "Bardic Inspiration", max: 1, recovery: "long_rest", description: "Grant an ally a 1d6 bonus die (Bard L1). D&D 2024: short rest at L5+." },
  { id: "superiority_dice", name: "Superiority Dice", max: 4, recovery: "short_rest", description: "Maneuver dice (Battle Master L3)." },
  { id: "ki", name: "Ki Points", max: 1, recovery: "short_rest", description: "Monk resource for Flurry of Patient Defense (Monk L2)." },
  { id: "channel_divinity", name: "Channel Divinity", max: 1, recovery: "short_rest", description: "Cleric/Paladin special ability (L1)." },
  { id: "lay_on_hands", name: "Lay on Hands", max: 5, recovery: "long_rest", description: "Heal pool = 5 × Paladin level HP (Paladin L1)." },
  { id: "rage", name: "Rage", max: 2, recovery: "long_rest", description: "Barbarian rage uses (L1: 2, L20: unlimited)." },
  { id: "wild_shape", name: "Wild Shape", max: 2, recovery: "short_rest", description: "Druid shapechange (L2)." },
  { id: "indomitable", name: "Indomitable", max: 1, recovery: "long_rest", description: "Reroll a failed save (Fighter L9)." },
  { id: "arcane_recovery", name: "Arcane Recovery", max: 1, recovery: "long_rest", description: "Recover spell slots on short rest once per day (Wizard L1)." },
];

export function getResourceDef(resourceId: string): ResourceDef | undefined {
  return STANDARD_RESOURCES.find(r => r.id === resourceId);
}

/**
 * Filter resources by recovery type (for rest pipelines).
 */
export function getResourcesByRecovery(
  resources: ResourceDef[],
  recovery: RecoveryType,
): ResourceDef[] {
  return resources.filter(r => r.recovery === recovery);
}

// ============================================================================
// 9. EXHAUSTION SYSTEM
// ============================================================================

export interface ExhaustionLevel {
  level: number;                    // 0-6 (6 = death)
  effects: string[];
  speedMultiplier: number;          // 1 at L0, 0.5 at L1, 0 at L5
  /** HP max multiplier (1.0 normal, 0.5 at L4). */
  hpMaxMultiplier: number;
}

export const EXHAUSTION_LEVELS: ExhaustionLevel[] = [
  { level: 0, effects: [], speedMultiplier: 1, hpMaxMultiplier: 1 },
  { level: 1, effects: ["Ability checks disadvantage"], speedMultiplier: 0.5, hpMaxMultiplier: 1 },
  { level: 2, effects: ["Speed halved", "Ability checks disadvantage"], speedMultiplier: 0.5, hpMaxMultiplier: 1 },
  { level: 3, effects: ["Speed halved", "Ability checks + attacks disadvantage"], speedMultiplier: 0.5, hpMaxMultiplier: 1 },
  { level: 4, effects: ["Speed halved", "Disadvantage on attacks/saves/checks", "HP max halved"], speedMultiplier: 0.5, hpMaxMultiplier: 0.5 },
  { level: 5, effects: ["Speed 0", "Disadvantage on attacks/saves/checks", "HP max halved"], speedMultiplier: 0, hpMaxMultiplier: 0.5 },
  { level: 6, effects: ["Death"], speedMultiplier: 0, hpMaxMultiplier: 0 },
];

export function getExhaustionLevel(level: number): ExhaustionLevel {
  return EXHAUSTION_LEVELS[Math.max(0, Math.min(6, level))];
}

// ============================================================================
// 10. SUMMARY — For AI DM / UI
// ============================================================================

/** Summarize a rest result for the player. */
export function summarizeRestResult(
  restType: RestType,
  result: ShortRestResult | LongRestResult,
): string {
  const restName = REST_TYPES[restType].name;
  return `${restName}: ${result.logSummary}`;
}

/** Summarize a character's hit dice pool. */
export function summarizeHitDice(pool: HitDicePool): string {
  const parts: string[] = [];
  for (const [size, entry] of Object.entries(pool.bySize)) {
    parts.push(`${size}:${entry.current}/${entry.max}`);
  }
  return parts.length > 0 ? `HD ${pool.totalCurrent}/${pool.totalMax} [${parts.join(" ")}]` : "No Hit Dice";
}

/** Summarize a character's available downtime options. */
export function summarizeDowntimeOptions(
  resources: ResourceDef[],
): string {
  return resources
    .filter(r => r.recovery === "short_rest" || r.recovery === "long_rest")
    .map(r => `${r.name} (${r.recovery})`)
    .join(" · ");
}
