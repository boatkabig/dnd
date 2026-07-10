/**
 * ============================================================================
 * D&D Engine Design Document — Chapter 06: Effects & Conditions
 * ============================================================================
 *
 * Version: 1.0
 * Target: D&D 5e / 2024 Compatible
 * Architecture: Data-Driven Effect Definitions + Modifier Pipeline
 *
 * Core Principles:
 *   1. Condition = Standardized status (15 core D&D 5e conditions + custom).
 *   2. Effect = Anything that modifies a character's stats or behavior.
 *      (buffs, debuffs, auras, ongoing damage, transformations, conditions).
 *   3. Duration system: instant, rounds, minutes, hours, concentration,
 *      until_short_rest, until_long_rest, permanent.
 *   4. Stacking rules: replace, stack, refresh, ignore (data-driven per effect).
 *   5. Modifier pipeline: each effect can modify attack, damage, AC, save, skill,
 *      speed, initiative, or any other derived stat.
 *   6. Concentration: ONE concentration spell at a time per character.
 *      CON save DC = max(10, damage_taken / 2) on each damage instance.
 *   7. Trigger system: on_attack, on_hit, on_damage_taken, on_turn_start, etc.
 *      Enables reactive effects (e.g. Fire Shield, Aura of Protection).
 *
 * Effect Lifecycle:
 *   1. applyEffect(character, effect) → adds to character.refs.effectIds[]
 *   2. Each round, tickEffect() decrements remaining duration
 *   3. On trigger, fireTrigger() evaluates optional callback
 *   4. removeEffect() cleans up — also removes modifiers from derived stats
 *   5. On concentration break, all concentration effects end immediately
 *
 * Cross-References:
 *   - Character.ts (Chapter 01) → character.refs.effectIds[] holds active effect IDs
 *   - Combat.ts (Chapter 03) → triggers on_attack, on_hit, on_damage_taken
 *   - Magic.ts (Chapter 04) → spells apply effects with concentration flag
 *   - Equipment.ts (Chapter 05) → magic items grant passive effects when equipped
 * ============================================================================
 */

import type { AbilityName } from "./character";

// ============================================================================
// 1. DURATION SYSTEM
// ============================================================================

export type EffectDurationType =
  | "instant"              // applies once, then gone (e.g. damage)
  | "rounds"               // N rounds (1 round = 6 seconds in combat)
  | "minutes"              // N minutes (out of combat)
  | "hours"                // N hours
  | "concentration"        // until concentration breaks or max duration
  | "until_short_rest"     // clears on short rest
  | "until_long_rest"      // clears on long rest
  | "permanent";           // never expires (curses, lycanthropy)

export interface EffectDuration {
  type: EffectDurationType;
  /** Max duration in the type's unit (rounds, minutes, hours). */
  max?: number;
  /** Remaining duration (decremented by tickEffect). */
  remaining?: number;
}

// ============================================================================
// 2. STACKING RULES
// ============================================================================

export type StackingRule =
  | "replace"    // new effect replaces old of same ID
  | "stack"      // multiple instances allowed (rare; e.g. different sources)
  | "refresh"    // new effect refreshes duration of existing
  | "ignore";    // if already applied, ignore new (no-op)

// ============================================================================
// 3. MODIFIER PIPELINE — Effect modifies derived stats
// ============================================================================

/**
 * Targets that an effect's modifier can apply to.
 * Data-driven — derived stats are computed by aggregating all active modifiers.
 */
export type ModifierTarget =
  | "attack_roll"       // attack bonus
  | "damage_roll"       // damage bonus
  | "ac"                // armor class
  | "saving_throw"      // save bonus (all saves or specific ability)
  | "skill_check"       // skill bonus (specific skill)
  | "speed"             // movement speed
  | "initiative"        // initiative roll
  | "ability_score"     // ability score (Belt of Giant Strength)
  | "spell_save_dc"     // spell save DC
  | "spell_attack";     // spell attack bonus

export interface EffectModifier {
  target: ModifierTarget;
  /** Flat bonus (e.g. +1 AC from Ring of Protection). */
  bonus?: number;
  /** Dice bonus (e.g. +1d4 from Bless to attack rolls). */
  diceBonus?: string;
  /** Advantage on rolls of this type. */
  advantage?: boolean;
  /** Disadvantage on rolls of this type. */
  disadvantage?: boolean;
  /** Specific ability/skill filter (e.g. "str" saves, "stealth" skill). */
  filter?: string;
  /** Condition for the modifier to apply (e.g. "against fiends"). */
  condition?: string;
}

// ============================================================================
// 4. TRIGGER SYSTEM — Reactive effects
// ============================================================================

export type EffectTrigger =
  | "on_attack"             // when owner makes an attack
  | "on_hit"                // when owner hits with an attack
  | "on_miss"               // when owner misses with an attack
  | "on_damage_dealt"       // when owner deals damage
  | "on_damage_taken"       // when owner takes damage
  | "on_turn_start"         // at start of owner's turn
  | "on_turn_end"           // at end of owner's turn
  | "on_round_start"        // at start of round
  | "on_round_end"          // at end of round
  | "on_kill"               // when owner kills a creature
  | "on_death"              // when owner dies
  | "on_concentration_check"// when owner makes a concentration save
  | "on_save"               // when owner makes a save
  | "on_skill_check"        // when owner makes a skill check
  | "on_critical_hit"       // when owner rolls a nat 20
  | "on_critical_fail";     // when owner rolls a nat 1

export interface EffectTriggerDef {
  trigger: EffectTrigger;
  /** What happens when this trigger fires. */
  action: "deal_damage" | "heal" | "apply_effect" | "grant_bonus" | "log_only";
  /** Damage expression if action is "deal_damage" (e.g. Fire Shield: "2d8"). */
  damageExpr?: string;
  /** Damage type if action is "deal_damage". */
  damageType?: string;
  /** Heal expression if action is "heal". */
  healExpr?: string;
  /** Effect ID to apply if action is "apply_effect". */
  applyEffectId?: string;
  /** Bonus to grant if action is "grant_bonus". */
  bonus?: EffectModifier;
  /** Optional condition (free-form, AI DM interprets). */
  condition?: string;
}

// ============================================================================
// 5. EFFECT DEFINITION
// ============================================================================

export type EffectCategory =
  | "buff"           // positive effect (Bless, Haste)
  | "debuff"         // negative effect (Bane, Slow)
  | "aura"           // emanation centered on owner (Aura of Protection)
  | "ongoing_damage" // recurring damage each turn (Poison, Bleeding)
  | "transformation" // shape change (Polymorph, Wild Shape)
  | "condition"      // standard D&D condition (see STANDARD_CONDITIONS)
  | "passive"        // always-on from equipment/feature (no duration)
  | "custom";

export interface EffectDef {
  id: string;
  name: string;
  nameTh?: string;
  category: EffectCategory;
  description: string;
  duration: EffectDuration;
  stacking: StackingRule;
  /** Modifiers this effect applies while active. */
  modifiers: EffectModifier[];
  /** Triggers this effect listens for. */
  triggers?: EffectTriggerDef[];
  /** If true, effect ends if caster loses concentration. */
  requiresConcentration?: boolean;
  /** If true, effect can be ended by the owner at will (no action). */
  dismissible?: boolean;
  /** Conditions that this effect grants (e.g. Haste grants no condition, but
   *  Slow grants the slow condition). */
  conditionsApplied?: string[];
  /** Tags for AI search (e.g. "magical", "poison", "frightened"). */
  tags?: string[];
  /** Source: "spell", "feature", "item", "environment", "homebrew". */
  source?: string;
}

// ============================================================================
// 6. ACTIVE EFFECT INSTANCE — Per-character applied effect
// ============================================================================

export interface ActiveEffect {
  /** Unique instance ID (different from EffectDef.id; allows multiple instances). */
  instanceId: string;
  effectId: string;
  sourceCharacterId?: string;     // who applied it
  targetCharacterId: string;      // who has it
  /** Remaining duration (mutable, decremented by tickEffect). */
  remainingRounds: number;        // -1 = permanent / until-rest
  /** Total rounds applied (for refresh logic). */
  totalRounds: number;
  /** Snapshot of the EffectDef at apply time (so changes don't retroact). */
  snapshot: EffectDef;
  /** Stack count (for stackable effects). */
  stackCount: number;
  /** Whether this is a concentration effect (cached for fast lookup). */
  isConcentration: boolean;
  /** Custom metadata (e.g. upcast level). */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 7. STANDARD CONDITIONS — 15 D&D 5e Conditions + Custom
// ============================================================================

/**
 * The 15 standard D&D 5e conditions. Each is defined as an EffectDef with
 * category "condition". Custom conditions can be added via the registry.
 */
export type StandardConditionId =
  | "blinded"
  | "charmed"
  | "deafened"
  | "frightened"
  | "grappled"
  | "incapacitated"
  | "invisible"
  | "paralyzed"
  | "petrified"
  | "poisoned"
  | "prone"
  | "restrained"
  | "stunned"
  | "unconscious"
  | "exhaustion";

/**
 * Master registry of standard conditions. Each entry is a partial EffectDef
 * (full defs are constructed at apply time).
 *
 * Adding a custom condition: just add an entry here, or call registerCondition().
 */
export const STANDARD_CONDITIONS: Record<StandardConditionId, EffectDef> = {
  blinded: {
    id: "blinded", name: "Blinded", category: "condition",
    description: "Cannot see. Auto-fail sight-based checks. Attackers have advantage; attacks by you have disadvantage.",
    duration: { type: "until_short_rest" },
    stacking: "replace",
    modifiers: [
      { target: "attack_roll", disadvantage: true },
      { target: "skill_check", filter: "perception", disadvantage: true },
    ],
    tags: ["sense_loss"],
  },
  charmed: {
    id: "charmed", name: "Charmed", category: "condition",
    description: "Cannot attack the charmer. Charmer gains advantage on social checks against you.",
    duration: { type: "rounds", max: 10 },
    stacking: "replace",
    modifiers: [],
    tags: ["mind_affecting"],
  },
  deafened: {
    id: "deafened", name: "Deafened", category: "condition",
    description: "Cannot hear. Auto-fail hearing-based checks.",
    duration: { type: "until_short_rest" },
    stacking: "replace",
    modifiers: [
      { target: "skill_check", filter: "perception", disadvantage: true },
    ],
    tags: ["sense_loss"],
  },
  frightened: {
    id: "frightened", name: "Frightened", category: "condition",
    description: "Disadvantage on ability checks and attacks while source is in sight. Cannot move closer to source.",
    duration: { type: "rounds", max: 10 },
    stacking: "replace",
    modifiers: [
      { target: "attack_roll", disadvantage: true, condition: "source_visible" },
      { target: "skill_check", disadvantage: true, condition: "source_visible" },
    ],
    tags: ["mind_affecting", "fear"],
  },
  grappled: {
    id: "grappled", name: "Grappled", category: "condition",
    description: "Speed becomes 0. Ends if grappler is moved away or incapacitated.",
    duration: { type: "rounds", max: 99 },
    stacking: "replace",
    modifiers: [
      { target: "speed", bonus: -9999 }, // set speed to 0 (computed by movement)
    ],
    tags: ["movement_restriction"],
  },
  incapacitated: {
    id: "incapacitated", name: "Incapacitated", category: "condition",
    description: "Cannot take actions or reactions.",
    duration: { type: "rounds", max: 10 },
    stacking: "replace",
    modifiers: [],
    tags: ["action_restriction"],
  },
  invisible: {
    id: "invisible", name: "Invisible", category: "condition",
    description: "Heavily obscured for purposes of hiding. Attacks against you have disadvantage; your attacks have advantage.",
    duration: { type: "rounds", max: 10 },
    stacking: "replace",
    modifiers: [
      { target: "attack_roll", advantage: true },
      { target: "ac", disadvantage: false }, // attacks vs invisible creature have disadv (handled by combat)
    ],
    tags: ["stealth_buff"],
  },
  paralyzed: {
    id: "paralyzed", name: "Paralyzed", category: "condition",
    description: "Incapacitated, cannot move or speak. Auto-fail STR/DEX saves. Attacks within 5 ft have advantage and are critical hits.",
    duration: { type: "rounds", max: 10 },
    stacking: "replace",
    modifiers: [],
    tags: ["action_restriction", "movement_restriction"],
  },
  petrified: {
    id: "petrified", name: "Petrified", category: "condition",
    description: "Transformed to stone. Incapacitated, cannot move. Weight ×10. Auto-fail STR/DEX saves.",
    duration: { type: "permanent" },
    stacking: "replace",
    modifiers: [],
    tags: ["transformation", "action_restriction"],
  },
  poisoned: {
    id: "poisoned", name: "Poisoned", category: "condition",
    description: "Disadvantage on attack rolls and ability checks.",
    duration: { type: "rounds", max: 10 },
    stacking: "replace",
    modifiers: [
      { target: "attack_roll", disadvantage: true },
      { target: "skill_check", disadvantage: true },
    ],
    tags: ["poison"],
  },
  prone: {
    id: "prone", name: "Prone", category: "condition",
    description: "Only crawling movement. Disadvantage on attacks. Attacks within 5 ft have advantage; ranged attacks have disadvantage.",
    duration: { type: "until_short_rest" },
    stacking: "replace",
    modifiers: [
      { target: "attack_roll", disadvantage: true },
    ],
    tags: ["position"],
  },
  restrained: {
    id: "restrained", name: "Restrained", category: "condition",
    description: "Speed 0. Attacks have disadvantage. Attacks against you have advantage. DEX saves disadvantage.",
    duration: { type: "rounds", max: 10 },
    stacking: "replace",
    modifiers: [
      { target: "speed", bonus: -9999 },
      { target: "attack_roll", disadvantage: true },
      { target: "saving_throw", filter: "dex", disadvantage: true },
    ],
    tags: ["movement_restriction"],
  },
  stunned: {
    id: "stunned", name: "Stunned", category: "condition",
    description: "Incapacitated, cannot move. Attacks against you have advantage. Auto-fail STR/DEX saves.",
    duration: { type: "rounds", max: 1 },
    stacking: "replace",
    modifiers: [],
    tags: ["action_restriction", "movement_restriction"],
  },
  unconscious: {
    id: "unconscious", name: "Unconscious", category: "condition",
    description: "Incapacitated, unaware. Drops concentration. Attacks within 5 ft are critical hits. Auto-fail STR/DEX saves.",
    duration: { type: "until_short_rest" },
    stacking: "replace",
    modifiers: [],
    tags: ["action_restriction"],
  },
  exhaustion: {
    id: "exhaustion", name: "Exhaustion", category: "condition",
    description: "Levels 1-6. Speed halved (L1), speed reduced to 0 + disadv on attacks/saves (L2), disadvantage on attacks/saves/checks (L3), HP max halved (L4), speed 0 (L5), death (L6).",
    duration: { type: "until_long_rest" },
    stacking: "stack",
    modifiers: [],
    tags: ["fatigue"],
  },
};

/**
 * Custom condition registry. Conditions can be added at runtime by homebrew content.
 */
const _customConditions = new Map<string, EffectDef>();

export function registerCondition(def: EffectDef): void {
  if (def.category !== "condition") {
    throw new Error(`registerCondition: ${def.id} is not category "condition"`);
  }
  _customConditions.set(def.id, def);
}

export function getConditionDef(conditionId: string): EffectDef | undefined {
  if (conditionId in STANDARD_CONDITIONS) {
    return STANDARD_CONDITIONS[conditionId as StandardConditionId];
  }
  return _customConditions.get(conditionId);
}

// ============================================================================
// 8. EFFECT REGISTRY — Custom effect definitions
// ============================================================================

const _customEffects = new Map<string, EffectDef>();

export function registerEffect(def: EffectDef): void {
  _customEffects.set(def.id, def);
}

export function getEffectDef(effectId: string): EffectDef | undefined {
  if (effectId in STANDARD_CONDITIONS) {
    return STANDARD_CONDITIONS[effectId as StandardConditionId];
  }
  return _customEffects.get(effectId);
}

// ============================================================================
// 9. APPLY EFFECT — Add an effect to a character
// ============================================================================

let _effectInstanceSeq = 0;

function generateEffectInstanceId(): string {
  _effectInstanceSeq++;
  return `eff_${Date.now()}_${_effectInstanceSeq}`;
}

/**
 * Apply an effect to a character. Returns the new ActiveEffect instance and the
 * updated list of active effects for that character.
 *
 * Stacking rules:
 *   - replace: remove existing instance of same effectId, apply new
 *   - stack: add new instance alongside existing
 *   - refresh: extend duration of existing instance
 *   - ignore: if existing instance, do nothing
 */
export function applyEffect(
  activeEffects: ActiveEffect[],
  effectDef: EffectDef,
  targetCharacterId: string,
  sourceCharacterId?: string,
  metadata?: Record<string, unknown>,
): { activeEffects: ActiveEffect[]; newEffect: ActiveEffect | null } {
  const existing = activeEffects.find(ae => ae.effectId === effectDef.id);

  // Stack handling
  if (existing && effectDef.stacking === "ignore") {
    return { activeEffects, newEffect: null };
  }
  if (existing && effectDef.stacking === "refresh") {
    const refreshed: ActiveEffect = {
      ...existing,
      remainingRounds: effectDef.duration.max ?? existing.remainingRounds,
    };
    return {
      activeEffects: activeEffects.map(ae => ae === existing ? refreshed : ae),
      newEffect: refreshed,
    };
  }
  if (existing && effectDef.stacking === "replace") {
    const replaced: ActiveEffect = {
      ...existing,
      snapshot: effectDef,
      remainingRounds: effectDef.duration.max ?? -1,
      totalRounds: effectDef.duration.max ?? -1,
      metadata,
    };
    return {
      activeEffects: activeEffects.map(ae => ae === existing ? replaced : ae),
      newEffect: replaced,
    };
  }

  // New instance (stack or no existing)
  const newEffect: ActiveEffect = {
    instanceId: generateEffectInstanceId(),
    effectId: effectDef.id,
    sourceCharacterId,
    targetCharacterId,
    remainingRounds: effectDef.duration.max ?? -1,
    totalRounds: effectDef.duration.max ?? -1,
    snapshot: effectDef,
    stackCount: existing ? existing.stackCount + 1 : 1,
    isConcentration: effectDef.requiresConcentration ?? false,
    metadata,
  };
  return { activeEffects: [...activeEffects, newEffect], newEffect };
}

// ============================================================================
// 10. REMOVE EFFECT
// ============================================================================

/**
 * Remove an effect instance by its instance ID.
 * Returns the updated active effects list.
 */
export function removeEffect(activeEffects: ActiveEffect[], instanceId: string): ActiveEffect[] {
  return activeEffects.filter(ae => ae.instanceId !== instanceId);
}

/**
 * Remove all instances of a given effect ID (e.g. remove all "poisoned" instances).
 */
export function removeAllOfEffect(activeEffects: ActiveEffect[], effectId: string): ActiveEffect[] {
  return activeEffects.filter(ae => ae.effectId !== effectId);
}

/**
 * Remove all concentration effects (used when caster loses concentration).
 */
export function breakConcentration(activeEffects: ActiveEffect[], targetCharacterId: string): ActiveEffect[] {
  return activeEffects.filter(ae =>
    !(ae.targetCharacterId === targetCharacterId && ae.isConcentration)
  );
}

/**
 * Remove all effects that clear on a short rest.
 */
export function clearOnShortRest(activeEffects: ActiveEffect[]): ActiveEffect[] {
  return activeEffects.filter(ae =>
    ae.snapshot.duration.type !== "until_short_rest" &&
    ae.snapshot.duration.type !== "instant"
  );
}

/**
 * Remove all effects that clear on a long rest.
 * (Includes short-rest effects + exhaustion level reduction handled separately.)
 */
export function clearOnLongRest(activeEffects: ActiveEffect[]): ActiveEffect[] {
  return activeEffects.filter(ae =>
    ae.snapshot.duration.type !== "until_short_rest" &&
    ae.snapshot.duration.type !== "until_long_rest" &&
    ae.snapshot.duration.type !== "instant"
  );
}

// ============================================================================
// 11. TICK EFFECT — Decrement durations per round
// ============================================================================

/**
 * Tick all timed effects at the start/end of a character's turn.
 * - "rounds" duration: decrement remainingRounds; remove if 0
 * - "minutes"/"hours": out-of-combat only (handled by rest system)
 * - "concentration": also tick if has max duration
 * - Others: no tick
 *
 * Returns the new active effects list (with effects removed if expired).
 */
export function tickEffect(activeEffects: ActiveEffect[], characterId: string): ActiveEffect[] {
  const surviving: ActiveEffect[] = [];
  for (const ae of activeEffects) {
    if (ae.targetCharacterId !== characterId) {
      surviving.push(ae);
      continue;
    }
    const dur = ae.snapshot.duration;
    if (dur.type !== "rounds" && dur.type !== "concentration") {
      surviving.push(ae);
      continue;
    }
    const newRemaining = ae.remainingRounds - 1;
    if (newRemaining > 0) {
      surviving.push({ ...ae, remainingRounds: newRemaining });
    }
    // Else: effect expired, drop from list
  }
  return surviving;
}

/**
 * Tick ALL effects (called at end of round).
 */
export function tickAllEffects(activeEffects: ActiveEffect[]): ActiveEffect[] {
  const surviving: ActiveEffect[] = [];
  for (const ae of activeEffects) {
    const dur = ae.snapshot.duration;
    if (dur.type !== "rounds" && dur.type !== "concentration") {
      surviving.push(ae);
      continue;
    }
    const newRemaining = ae.remainingRounds - 1;
    if (newRemaining > 0) {
      surviving.push({ ...ae, remainingRounds: newRemaining });
    }
  }
  return surviving;
}

// ============================================================================
// 12. CONCENTRATION CHECKS
// ============================================================================

/**
 * Calculate the concentration check DC after taking damage.
 * D&D 2024 rule (D&D Beyond Free Rules — "Concentration"):
 *   DC = max(10, damage_taken / 2), up to a **maximum DC of 30** (new in 2024).
 * 5e (2014) had no cap.
 */
export function concentrationCheckDC(damageTaken: number): number {
  return Math.min(30, Math.max(10, Math.floor(damageTaken / 2)));
}

/**
 * Determine if a character can maintain concentration after taking damage.
 * Caller supplies the d20 roll + CON save modifier.
 */
export function checkConcentration(
  damageTaken: number,
  conSaveRoll: number,
  conSaveModifier: number,
): { success: boolean; dc: number; total: number } {
  const dc = concentrationCheckDC(damageTaken);
  const total = conSaveRoll + conSaveModifier;
  return { success: total >= dc, dc, total };
}

/**
 * Check if a character can begin concentrating on a new spell.
 * (Only one concentration spell allowed at a time in D&D 5e.)
 */
export function canConcentrate(activeEffects: ActiveEffect[], characterId: string): boolean {
  return !activeEffects.some(ae =>
    ae.targetCharacterId === characterId && ae.isConcentration
  );
}

/**
 * Begin concentrating on a new spell: drop any existing concentration effect.
 * Returns the updated active effects list.
 */
export function beginConcentration(
  activeEffects: ActiveEffect[],
  characterId: string,
): ActiveEffect[] {
  return breakConcentration(activeEffects, characterId);
}

// ============================================================================
// 13. MODIFIER PIPELINE — Aggregate modifiers from all active effects
// ============================================================================

/**
 * Collect all modifiers of a given target type from active effects on a character.
 * Used by combat/skills/movement to compute derived stats.
 *
 * Example: getAllModifiers(effects, charId, "attack_roll")
 *   → [{ bonus: 1, source: "bless_instance" }, { bonus: 2, source: "ring_of_protection_instance" }]
 */
export function getAllModifiers(
  activeEffects: ActiveEffect[],
  characterId: string,
  target: ModifierTarget,
  filter?: string,
): Array<{ modifier: EffectModifier; source: string }> {
  const result: Array<{ modifier: EffectModifier; source: string }> = [];
  for (const ae of activeEffects) {
    if (ae.targetCharacterId !== characterId) continue;
    for (const mod of ae.snapshot.modifiers) {
      if (mod.target !== target) continue;
      if (filter && mod.filter && mod.filter !== filter) continue;
      result.push({ modifier: mod, source: ae.instanceId });
    }
  }
  return result;
}

/**
 * Get total flat bonus from all modifiers of a given target.
 * (Does not include dice bonuses or advantage — those are applied separately.)
 */
export function getTotalBonus(
  activeEffects: ActiveEffect[],
  characterId: string,
  target: ModifierTarget,
  filter?: string,
): number {
  return getAllModifiers(activeEffects, characterId, target, filter)
    .reduce((sum, { modifier }) => sum + (modifier.bonus ?? 0), 0);
}

/**
 * Check if any modifier grants advantage on a given target.
 */
export function hasAdvantage(
  activeEffects: ActiveEffect[],
  characterId: string,
  target: ModifierTarget,
  filter?: string,
): boolean {
  return getAllModifiers(activeEffects, characterId, target, filter)
    .some(({ modifier }) => modifier.advantage);
}

/**
 * Check if any modifier imposes disadvantage on a given target.
 */
export function hasDisadvantage(
  activeEffects: ActiveEffect[],
  characterId: string,
  target: ModifierTarget,
  filter?: string,
): boolean {
  return getAllModifiers(activeEffects, characterId, target, filter)
    .some(({ modifier }) => modifier.disadvantage);
}

/**
 * Collect all dice bonuses (e.g. Bless +1d4 to attack rolls).
 */
export function getDiceBonuses(
  activeEffects: ActiveEffect[],
  characterId: string,
  target: ModifierTarget,
  filter?: string,
): string[] {
  return getAllModifiers(activeEffects, characterId, target, filter)
    .map(({ modifier }) => modifier.diceBonus)
    .filter((b): b is string => !!b);
}

// ============================================================================
// 14. TRIGGER PIPELINE — Fire reactive effects
// ============================================================================

/**
 * Find all triggers of a given type currently active on a character.
 * AI DM uses this to apply reactive effects (e.g. Fire Shield damage on attacker).
 */
export function getActiveTriggers(
  activeEffects: ActiveEffect[],
  characterId: string,
  trigger: EffectTrigger,
): Array<{ triggerDef: EffectTriggerDef; source: string }> {
  const result: Array<{ triggerDef: EffectTriggerDef; source: string }> = [];
  for (const ae of activeEffects) {
    if (ae.targetCharacterId !== characterId) continue;
    if (!ae.snapshot.triggers) continue;
    for (const trig of ae.snapshot.triggers) {
      if (trig.trigger === trigger) {
        result.push({ triggerDef: trig, source: ae.instanceId });
      }
    }
  }
  return result;
}

/**
 * Fire all triggers of a given type for a character.
 * Returns a list of resolved trigger outcomes (for combat to apply).
 */
export interface TriggerOutcome {
  source: string;
  action: EffectTriggerDef["action"];
  damageExpr?: string;
  damageType?: string;
  healExpr?: string;
  applyEffectId?: string;
  bonus?: EffectModifier;
  description: string;
}

export function fireTriggers(
  activeEffects: ActiveEffect[],
  characterId: string,
  trigger: EffectTrigger,
): TriggerOutcome[] {
  return getActiveTriggers(activeEffects, characterId, trigger).map(({ triggerDef, source }) => ({
    source,
    action: triggerDef.action,
    damageExpr: triggerDef.damageExpr,
    damageType: triggerDef.damageType,
    healExpr: triggerDef.healExpr,
    applyEffectId: triggerDef.applyEffectId,
    bonus: triggerDef.bonus,
    description: `Triggered ${triggerDef.trigger} → ${triggerDef.action}`,
  }));
}

// ============================================================================
// 15. SUMMARY — For AI DM / UI
// ============================================================================

/** Human-readable summary of all active effects on a character. */
export function summarizeActiveEffects(activeEffects: ActiveEffect[], characterId: string): string {
  const mine = activeEffects.filter(ae => ae.targetCharacterId === characterId);
  if (mine.length === 0) return "No active effects";
  return mine.map(ae => {
    const dur = ae.snapshot.duration;
    const durStr = dur.type === "permanent" ? "permanent"
      : dur.type === "until_short_rest" ? "until short rest"
      : dur.type === "until_long_rest" ? "until long rest"
      : `${ae.remainingRounds} rounds`;
    const conc = ae.isConcentration ? " [C]" : "";
    return `${ae.snapshot.name}${conc} (${durStr})`;
  }).join(" · ");
}

/** Check if a character has a specific condition (by ID). */
export function hasCondition(activeEffects: ActiveEffect[], characterId: string, conditionId: string): boolean {
  return activeEffects.some(ae =>
    ae.targetCharacterId === characterId &&
    ae.effectId === conditionId &&
    ae.snapshot.category === "condition"
  );
}

/** List all condition IDs active on a character. */
export function listActiveConditions(activeEffects: ActiveEffect[], characterId: string): string[] {
  return activeEffects
    .filter(ae =>
      ae.targetCharacterId === characterId &&
      ae.snapshot.category === "condition"
    )
    .map(ae => ae.effectId);
}

/**
 * Helper: check if a character is incapacitated (cannot take actions).
 * Used by actionEconomy.validateAction() and Combat.
 */
export function isIncapacitatedByEffects(activeEffects: ActiveEffect[], characterId: string): boolean {
  const incapConditions = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"];
  return activeEffects.some(ae =>
    ae.targetCharacterId === characterId &&
    incapConditions.includes(ae.effectId)
  );
}

/** Convenience: check if a character is currently concentrating. */
export function isConcentrating(activeEffects: ActiveEffect[], characterId: string): boolean {
  return activeEffects.some(ae =>
    ae.targetCharacterId === characterId && ae.isConcentration
  );
}

/** Get the ability score override (e.g. Belt of Giant Strength sets STR to fixed value). */
export function getAbilityOverride(
  activeEffects: ActiveEffect[],
  characterId: string,
  ability: AbilityName,
): number | undefined {
  for (const ae of activeEffects) {
    if (ae.targetCharacterId !== characterId) continue;
    for (const mod of ae.snapshot.modifiers) {
      if (mod.target === "ability_score" && mod.filter === ability && mod.bonus !== undefined && mod.bonus >= 1) {
        // Override convention: bonus >= 1 means "set to this value"
        return mod.bonus;
      }
    }
  }
  return undefined;
}
