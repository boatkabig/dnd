/**
 * ============================================================================
 * D&D Engine Design Document — Chapter 04: Magic System
 * ============================================================================
 *
 * Version: 1.0
 * Target: D&D 5e / 2024 Compatible
 * Architecture: Data-Driven Spell Definitions + Slot Manager + Concentration
 *
 * Core Principles:
 *   1. SpellDefinition = pure data. Adding new spells requires NO code changes.
 *   2. SpellSlotManager tracks per-caster slots (level 1-9, pact magic separate).
 *   3. Spellcasting types: Prepared, Known, Spellbook, Pact Magic, Innate.
 *   4. Concentration: ONE spell at a time per caster; CON save on damage.
 *   5. Ritual casting: cast without expending a slot (10 min extra time).
 *   6. Spell resolution pipeline: validate → consume slot → resolve → trigger.
 *   7. Upcasting: spell data includes scalingDamage + per-level effects.
 *
 * Spell Pipeline:
 *   1. castSpell(req) → validate (caster has slots? components? line of sight?)
 *   2. expendSlot() → consume from SpellSlotManager
 *   3. resolveSpell() → apply attack/save/heal/auto effect per target
 *   4. applyConcentration() → track concentration if spell is concentration
 *   5. trigger on_cast, on_spell_hit events (via Effects system)
 *
 * Spellcasting Types (D&D 5e):
 *   - Prepared: Cleric, Druid, Paladin, Wizard — prepare N spells per day,
 *     can change after long rest.
 *   - Known: Bard, Ranger, Sorcerer, Warlock (non-pact), Rogue (Arcane Trickster),
 *     Fighter (Eldritch Knight) — fixed list, learn new on level up.
 *   - Spellbook: Wizard — has a spellbook of all known spells; prepares subset.
 *   - Pact Magic: Warlock — separate slot pool, all slots same level, refresh
 *     on short rest.
 *   - Innate: Innate Spellcasting (monsters, races) — fixed spells, 1/day or
 *     at-will; no slots.
 *
 * Cross-References:
 *   - Character.ts (Chapter 01) → caster level, spellcasting ability
 *   - ActionEconomy.ts (Chapter 02) → casting time maps to ActionCost
 *   - Combat.ts (Chapter 03) → spell attack rolls, damage application
 *   - Effects.ts (Chapter 06) → concentration tracking, spell effects
 *   - Dice.ts (Chapter 09) → rollD20, rollDamage for spell attacks/saves
 * ============================================================================
 */

import type { AbilityName } from "./character";
import { rollD20, rollDamage, type RollResult } from "./dice";
import type { DamageType } from "./equipment";

// ============================================================================
// 1. SPELL DEFINITION — Pure data
// ============================================================================

export type SpellSchool =
  | "abjuration"
  | "conjuration"
  | "divination"
  | "enchantment"
  | "evocation"
  | "illusion"
  | "necromancy"
  | "transmutation";

export type SpellLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type SpellKind =
  | "attack"        // ranged or melee spell attack
  | "save"          // target makes a saving throw
  | "heal"          // restore HP
  | "buff"          // apply beneficial effect to allies
  | "debuff"        // apply negative effect to enemies
  | "auto"          // no roll needed (Magic Missile, Shield)
  | "utility"       // non-combat effect (Light, Detect Magic)
  | "summon"        // bring creatures from elsewhere
  | "aoe_damage";   // area damage with save

export type CastingTime =
  | "action"
  | "bonus_action"
  | "reaction"
  | "minute"        // 1 minute = 10 rounds (ritual)
  | "hour"          // 1+ hour (some rituals)
  | "special";

export type SpellRange =
  | "self"
  | "touch"
  | number;         // ft

export type SpellDuration =
  | "instant"
  | "rounds"
  | "minutes"
  | "hours"
  | "concentration"
  | "permanent"
  | "until_dispelled";

export interface SpellComponent {
  verbal: boolean;
  somatic: boolean;
  material?: string;                // material component description
  /** Material cost in gp (for expensive components like Revivify's 300gp diamond). */
  materialCost?: number;
  /** Whether the material is consumed on cast. */
  materialConsumed?: boolean;
}

/**
 * Master spell definition. Adding a new spell = adding a new SpellDef object.
 * No code changes required.
 */
export interface SpellDef {
  id: string;
  name: string;
  nameTh?: string;
  level: SpellLevel;
  school: SpellSchool;
  castingTime: CastingTime;
  range: SpellRange;
  duration: SpellDuration;
  /** Max duration in the duration's unit (e.g. 10 minutes for concentration). */
  maxDuration?: number;
  concentration: boolean;
  ritual: boolean;
  kind: SpellKind;
  components: SpellComponent;
  description: string;
  descriptionTh?: string;
  // Attack spells
  attackType?: "melee" | "ranged";
  damage?: string;                  // dice expr: "8d6"
  damageType?: DamageType;
  /** Additional damage dice per upcast level (e.g. Fireball: "+1d6"). */
  scalingDamage?: string;
  // Save spells
  saveAbility?: AbilityName;
  saveSuccess?: "half" | "none" | "full";  // effect on save
  saveDCFormula?: "standard";              // 8 + prof + spellcasting mod
  // AoE
  aoeType?: "sphere" | "cone" | "line" | "cube" | "cylinder";
  aoeSize?: number;                 // ft
  // Buff/Debuff
  conditionsApplied?: string[];     // condition IDs to apply
  effectIds?: string[];             // effect IDs to apply (referenced by Effects system)
  // Class lists (which classes can learn this spell)
  classes: string[];
  // Source book
  source?: string;
  tags?: string[];
}

// ============================================================================
// 2. SPELLCASTING TYPES
// ============================================================================

export type SpellcastingType =
  | "prepared"      // Cleric, Druid, Paladin, Wizard (prepare N from full list)
  | "known"         // Bard, Ranger, Sorcerer — fixed list, learn on level up
  | "spellbook"     // Wizard — has spellbook, prepares subset
  | "pact_magic"    // Warlock — separate slot pool, refresh on short rest
  | "innate";       // Innate Spellcasting — fixed spells, 1/day or at-will

export interface SpellcastingCapability {
  type: SpellcastingType;
  ability: AbilityName;              // INT, WIS, CHA
  /** Spell save DC = 8 + proficiencyBonus + spellcastingMod. */
  spellSaveDC: number;
  /** Spell attack bonus = proficiencyBonus + spellcastingMod. */
  spellAttackBonus: number;
  /** Ritual casting allowed? D&D 2024: ANY caster who prepares spells can cast as ritual. */
  ritualCasting: boolean;
  /** List of prepared/known spell IDs. */
  preparedSpellIds: string[];
  /** For spellbook: all known spells (Wizard's spellbook). */
  spellbookSpellIds?: string[];
  /** Innate spells with usage limits (e.g. { "spell_id": { per: "day", max: 1 } }). */
  innateUsages?: Record<string, { per: "day" | "short_rest" | "long_rest"; max: number; current: number }>;
}

/**
 * D&D 2024 Prepared Spells — Fixed Table Value (decoupled from ability modifier).
 *
 * Source: D&D Beyond "2024 Wizard vs. 2014 Wizard":
 *   "Wizards no longer use their Intelligence modifier plus Wizard level to determine their
 *    number of prepared spells, instead referring to a fixed value listed in the Wizard table."
 *
 * 5e (2014) used `level + spellcasting_modifier`. 2024 uses a fixed per-class table.
 * Full casters (Bard/Cleric/Druid/Sorcerer/Warlock/Wizard) cap at ~22 prepared spells at Lv.20.
 * Wizards get slightly more; Warlocks get fewer.
 *
 * This helper returns the 2024 max prepared spells for a given class + level.
 * Known-spell casters (Bard/Ranger/Sorcerer/Warlock) follow the same fixed table.
 */
export function maxPreparedSpells2024(
  className: string,
  level: number,
): number {
  // D&D 2024 fixed-table progression (approximation from RPGBot transition guide):
  // Lv.1: 4, Lv.2: 5, Lv.3: 6, Lv.4: 7, Lv.5: 9, Lv.6: 10, Lv.7: 11, Lv.8: 12,
  // Lv.9: 14, Lv.10: 15, Lv.11: 17, Lv.12: 18, Lv.13: 19, Lv.14: 20, Lv.15+: 22
  // Wizards get +2 at all levels (slightly higher cap); Warlocks get -2.
  const baseTable: number[] = [
    4, 5, 6, 7, 9, 10, 11, 12, 14, 15,  // Lv.1-10
    17, 18, 19, 20, 22, 22, 22, 22, 22, 22, // Lv.11-20
  ];
  const idx = Math.min(19, Math.max(0, level - 1));
  let max = baseTable[idx];
  if (className === "wizard") max += 2;        // Wizards get slightly more prepared spells
  if (className === "warlock") max = Math.max(2, max - 2); // Warlocks get fewer (they're known-spell casters with Pact Magic)
  // Rangers & Paladins (half-casters) follow a smaller progression
  if (className === "ranger" || className === "paladin") {
    max = Math.max(2, Math.floor(max / 2));
  }
  return max;
}

/**
 * D&D 2024 Ritual Casting: ANY caster with a ritual-tagged spell prepared can cast it as a ritual.
 * (5e restricted ritual casting to specific class features; 2024 made it universal for prepared casters.)
 *
 * Wizard's Ritual Adept feature is separate: it lets Wizards cast rituals from their spellbook
 * WITHOUT preparing them. This is a Wizard-specific feature, not a universal rule.
 */
export function canCastAsRitual(
  capability: SpellcastingCapability,
  spellId: string,
  isRitualTagged: boolean,
  isWizardWithSpellbookRitual: boolean = false,
): { canCast: boolean; reason: string } {
  if (!isRitualTagged) {
    return { canCast: false, reason: "Spell does not have the Ritual tag." };
  }
  // D&D 2024: any prepared caster can ritual-cast a prepared spell
  if (capability.preparedSpellIds.includes(spellId)) {
    return { canCast: true, reason: "D&D 2024: prepared spell with Ritual tag." };
  }
  // Wizard Ritual Adept: cast from spellbook without preparing
  if (isWizardWithSpellbookRitual && capability.spellbookSpellIds?.includes(spellId)) {
    return { canCast: true, reason: "Wizard Ritual Adept: spell is in spellbook." };
  }
  return { canCast: false, reason: "Spell not prepared and not in spellbook (if Wizard)." };
}


// ============================================================================
// 3. SPELL SLOT SYSTEM — Per-caster slot tracking
// ============================================================================

/**
 * Spell slot pool for one caster.
 * D&D 5e: standard slots per level (1-9), refreshed on long rest.
 * Pact Magic: separate pool, all slots same level, refreshed on short rest.
 */
export interface SpellSlotState {
  /** Standard slots: level → { max, current }. */
  slots: Record<number, { max: number; current: number }>;
  /** Pact Magic slots (Warlock) — separate pool. */
  pactMagicSlots?: Record<number, { max: number; current: number }>;
}

/**
 * Standard D&D 5e slot progression table by character level (full casters).
 * Index 0 = level 1, etc. Each entry is [s1, s2, s3, s4, s5, s6, s7, s8, s9].
 * Half casters (Paladin, Ranger) and third casters use scaled-down versions.
 */
export const FULL_CASTER_SLOTS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // L1
  [3, 0, 0, 0, 0, 0, 0, 0, 0], // L2
  [4, 2, 0, 0, 0, 0, 0, 0, 0], // L3
  [4, 3, 0, 0, 0, 0, 0, 0, 0], // L4
  [4, 3, 2, 0, 0, 0, 0, 0, 0], // L5
  [4, 3, 3, 0, 0, 0, 0, 0, 0], // L6
  [4, 3, 3, 1, 0, 0, 0, 0, 0], // L7
  [4, 3, 3, 2, 0, 0, 0, 0, 0], // L8
  [4, 3, 3, 3, 1, 0, 0, 0, 0], // L9
  [4, 3, 3, 3, 2, 0, 0, 0, 0], // L10
  [4, 3, 3, 3, 2, 1, 0, 0, 0], // L11
  [4, 3, 3, 3, 2, 1, 0, 0, 0], // L12
  [4, 3, 3, 3, 2, 1, 1, 0, 0], // L13
  [4, 3, 3, 3, 2, 1, 1, 0, 0], // L14
  [4, 3, 3, 3, 2, 1, 1, 1, 0], // L15
  [4, 3, 3, 3, 2, 1, 1, 1, 0], // L16
  [4, 3, 3, 3, 2, 1, 1, 1, 1], // L17
  [4, 3, 3, 3, 3, 1, 1, 1, 1], // L18
  [4, 3, 3, 3, 3, 2, 1, 1, 1], // L19
  [4, 3, 3, 3, 3, 2, 2, 1, 1], // L20
];

/**
 * Warlock Pact Magic slot progression.
 * All slots are the same level; refreshed on short rest.
 */
export const PACT_MAGIC_SLOTS: Array<{ count: number; level: number }> = [
  { count: 1, level: 1 }, // L1
  { count: 2, level: 1 }, // L2
  { count: 2, level: 2 }, // L3
  { count: 2, level: 2 }, // L4
  { count: 2, level: 3 }, // L5
  { count: 2, level: 3 }, // L6
  { count: 2, level: 4 }, // L7
  { count: 2, level: 4 }, // L8
  { count: 2, level: 5 }, // L9
  { count: 2, level: 5 }, // L10
  { count: 3, level: 5 }, // L11
  { count: 3, level: 5 }, // L12
  { count: 3, level: 5 }, // L13
  { count: 3, level: 5 }, // L14
  { count: 3, level: 5 }, // L15
  { count: 3, level: 5 }, // L16
  { count: 4, level: 5 }, // L17
  { count: 4, level: 5 }, // L18
  { count: 4, level: 5 }, // L19
  { count: 4, level: 5 }, // L20
];

/**
 * Create a SpellSlotManager for a full caster at given level.
 */
export function createFullCasterSlots(characterLevel: number): SpellSlotState {
  const table = FULL_CASTER_SLOTS[Math.min(20, Math.max(1, characterLevel)) - 1];
  const slots: Record<number, { max: number; current: number }> = {};
  for (let lv = 1; lv <= 9; lv++) {
    const max = table[lv - 1] || 0;
    if (max > 0) slots[lv] = { max, current: max };
  }
  return { slots };
}

/**
 * Create a SpellSlotManager for a Warlock (Pact Magic).
 */
export function createPactMagicSlots(characterLevel: number): SpellSlotState {
  const entry = PACT_MAGIC_SLOTS[Math.min(20, Math.max(1, characterLevel)) - 1];
  const pactSlots: Record<number, { max: number; current: number }> = {
    [entry.level]: { max: entry.count, current: entry.count },
  };
  return { slots: {}, pactMagicSlots: pactSlots };
}

/**
 * Create a SpellSlotManager for a half caster (Paladin, Ranger) at given level.
 * Half casters round up: effectiveCasterLevel = ceil(characterLevel / 2).
 */
export function createHalfCasterSlots(characterLevel: number): SpellSlotState {
  const effectiveLevel = Math.ceil(characterLevel / 2);
  return createFullCasterSlots(effectiveLevel);
}

// ============================================================================
// 4. SLOT MANIPULATION — Pure functions
// ============================================================================

/**
 * Check if a slot of given level is available (or higher).
 * Cantrips (level 0) never consume a slot.
 */
export function canCastSpell(state: SpellSlotState, spellLevel: number): boolean {
  if (spellLevel === 0) return true;
  // Check standard slots
  for (let lv = spellLevel; lv <= 9; lv++) {
    if (state.slots[lv]?.current > 0) return true;
  }
  // Check pact magic (only if spell level <= pact slot level)
  if (state.pactMagicSlots) {
    for (const lv of Object.keys(state.pactMagicSlots)) {
      const lvl = parseInt(lv);
      if (lvl >= spellLevel && state.pactMagicSlots[lvl].current > 0) return true;
    }
  }
  return false;
}

/**
 * D&D 2024 in-play cast legality, evaluated against the app's FLAT spell-slot
 * array (index 0 = level-1 slots ... index 8 = level-9 slots), the exact
 * representation DnDSolo/gameData use (getSlotTable → number[]).
 *
 * This is the single authority for "may this cast happen?" and enforces the
 * three 2024 rules the UI must respect:
 *   (b) the spell must be KNOWN / PREPARED for the caster;
 *   — cantrips (level 0) are always legal once known and never spend a slot;
 *   (c) UPCASTING: the slot spent must be at least the spell's own level
 *       (you can cast a lower-level spell with a higher slot, never the reverse);
 *   (a) a SLOT of the chosen level must actually be available.
 *
 * The check is deliberately tied to the *specific* slot level the caller
 * intends to spend (`slotLevel`), because the caller expends exactly that slot
 * (slots[slotLevel-1]); it does not silently auto-upcast into a higher slot.
 * Returns a machine-readable reason so the UI owns the (Thai) wording.
 */
export type SpellLegalityReason =
  | "ok"
  | "not_known"
  | "below_spell_level"
  | "slot_out_of_range"
  | "no_slot";

export interface SpellLegality2024 {
  ok: boolean;
  reason: SpellLegalityReason;
}

export function canCast2024(params: {
  /** Spell's own level (0 = cantrip). */
  spellLevel: number;
  /** Slot level the caster intends to spend (== spellLevel for a base cast, higher = upcast). */
  slotLevel: number;
  /** Current remaining slots, flat array: slots[i] = number of level-(i+1) slots left. */
  slots: number[];
  /** Whether the spell is in the caster's known / prepared list. */
  isKnownOrPrepared: boolean;
}): SpellLegality2024 {
  const { spellLevel, slotLevel, slots, isKnownOrPrepared } = params;
  // (b) known / prepared gate — applies to cantrips too.
  if (!isKnownOrPrepared) return { ok: false, reason: "not_known" };
  // Cantrips: always legal once known, never consume a slot.
  if (spellLevel === 0) return { ok: true, reason: "ok" };
  // (c) upcasting: cannot spend a slot below the spell's own level.
  if (slotLevel < spellLevel) return { ok: false, reason: "below_spell_level" };
  if (slotLevel < 1 || slotLevel > 9) return { ok: false, reason: "slot_out_of_range" };
  // (a) a slot of the chosen level must be available.
  if ((slots[slotLevel - 1] ?? 0) <= 0) return { ok: false, reason: "no_slot" };
  return { ok: true, reason: "ok" };
}

/**
 * Expend a spell slot of given level (or higher).
 * Prefers the lowest available slot to allow upcasting flexibility.
 */
export function expendSpellSlot(state: SpellSlotState, spellLevel: number): SpellSlotState {
  if (spellLevel === 0) return state;
  // Try standard slots first
  for (let lv = spellLevel; lv <= 9; lv++) {
    if (state.slots[lv]?.current > 0) {
      return {
        ...state,
        slots: {
          ...state.slots,
          [lv]: { ...state.slots[lv], current: state.slots[lv].current - 1 },
        },
      };
    }
  }
  // Try pact magic
  if (state.pactMagicSlots) {
    for (const lv of Object.keys(state.pactMagicSlots)) {
      const lvl = parseInt(lv);
      if (lvl >= spellLevel && state.pactMagicSlots[lvl].current > 0) {
        return {
          ...state,
          pactMagicSlots: {
            ...state.pactMagicSlots,
            [lvl]: { ...state.pactMagicSlots[lvl], current: state.pactMagicSlots[lvl].current - 1 },
          },
        };
      }
    }
  }
  return state; // No slot found (caller should have checked canCastSpell)
}

/**
 * Restore all standard slots to max (long rest).
 */
export function restoreAllSlots(state: SpellSlotState): SpellSlotState {
  const restored: Record<number, { max: number; current: number }> = {};
  for (const [lv, slot] of Object.entries(state.slots)) {
    restored[parseInt(lv)] = { ...slot, current: slot.max };
  }
  return { ...state, slots: restored };
}

/**
 * Restore pact magic slots (short rest).
 */
export function restorePactMagicSlots(state: SpellSlotState): SpellSlotState {
  if (!state.pactMagicSlots) return state;
  const restored: Record<number, { max: number; current: number }> = {};
  for (const [lv, slot] of Object.entries(state.pactMagicSlots)) {
    restored[parseInt(lv)] = { ...slot, current: slot.max };
  }
  return { ...state, pactMagicSlots: restored };
}

/**
 * Restore a specific number of slots of a given level (Arcane Recovery).
 * D&D 5e: Arcane Recovery restores spell levels totaling up to half wizard level.
 */
export function restoreSlots(
  state: SpellSlotState,
  slotsToRestore: Array<{ level: number; count: number }>,
): SpellSlotState {
  let newState = { ...state, slots: { ...state.slots } };
  for (const { level, count } of slotsToRestore) {
    if (!newState.slots[level]) continue;
    newState.slots[level] = {
      ...newState.slots[level],
      current: Math.min(
        newState.slots[level].max,
        newState.slots[level].current + count,
      ),
    };
  }
  return newState;
}

// ============================================================================
// 5. CONCENTRATION TRACKING
// ============================================================================

export interface ConcentrationInstance {
  casterId: string;
  spellId: string;
  spellName: string;
  /** Round on which concentration started. */
  startedAtRound: number;
  /** Max duration in rounds (if spell has concentration duration). */
  maxRounds?: number;
  /** Targets affected by this concentration spell (for cleanup on break). */
  targetIds: string[];
  /** Last concentration check result (for audit). */
  lastCheck?: { damage: number; dc: number; roll: number; success: boolean };
}

/**
 * Concentration check DC = max(10, damage / 2), capped at 30 (D&D 2024).
 * Source: D&D Beyond Free Rules 2024 — "Concentration": "up to a maximum DC of 30".
 * D&D 5e: each instance of damage triggers a separate check (no cap).
 */
export function concentrationCheckDC(damageTaken: number): number {
  return Math.min(30, Math.max(10, Math.floor(damageTaken / 2)));
}

/**
 * Resolve a concentration check after the caster takes damage.
 * Returns whether concentration is maintained.
 */
export function checkConcentration(
  concentration: ConcentrationInstance,
  damageTaken: number,
  conSaveRoll: number,
  conSaveModifier: number,
): { maintained: boolean; dc: number; total: number; updated: ConcentrationInstance } {
  const dc = concentrationCheckDC(damageTaken);
  const total = conSaveRoll + conSaveModifier;
  const success = total >= dc;
  return {
    maintained: success,
    dc,
    total,
    updated: {
      ...concentration,
      lastCheck: { damage: damageTaken, dc, roll: conSaveRoll, success },
    },
  };
}

/**
 * Check if a caster can begin concentrating on a new spell.
 * D&D 5e: only ONE concentration spell at a time.
 */
export function canConcentrate(activeConcentrations: ConcentrationInstance[], casterId: string): boolean {
  return !activeConcentrations.some(c => c.casterId === casterId);
}

/**
 * Begin concentrating on a new spell: drop any existing concentration.
 */
export function beginConcentration(
  activeConcentrations: ConcentrationInstance[],
  casterId: string,
): ConcentrationInstance[] {
  return activeConcentrations.filter(c => c.casterId !== casterId);
}

/**
 * Drop concentration voluntarily (no action required).
 */
export function dropConcentration(
  activeConcentrations: ConcentrationInstance[],
  casterId: string,
  spellId: string,
): ConcentrationInstance[] {
  return activeConcentrations.filter(c => !(c.casterId === casterId && c.spellId === spellId));
}

// ============================================================================
// 6. RITUAL CASTING — D&D 2024
// ============================================================================
// D&D 2024: ANY caster with a ritual-tagged spell prepared can cast as ritual.
// (5e restricted to specific class features; 2024 made it universal for prepared casters.)
// Wizard's Ritual Adept feature: cast from spellbook WITHOUT preparing (handled in canCastAsRitual above).

/**
 * Check if a spell can be cast as a ritual (legacy signature — kept for backwards-compat).
 * D&D 2024 rule:
 *   - Spell must have `ritual=true`.
 *   - Caster's `ritualCasting` capability must be true (in 2024, ALL prepared casters have this).
 *   - Spell must be prepared OR (for Wizards with Ritual Adept) in the spellbook.
 */
export function canCastRitual(
  spell: SpellDef,
  capability: SpellcastingCapability,
  isPrepared: boolean,
): boolean {
  if (!spell.ritual) return false;
  if (!capability.ritualCasting) return false;
  // D&D 2024 Wizards (Ritual Adept): cast from spellbook without preparing.
  if (capability.type === "spellbook") {
    return capability.spellbookSpellIds?.includes(spell.id) ?? false;
  }
  // D&D 2024: any prepared caster can ritual-cast a prepared spell.
  return isPrepared;
}

/**
 * Ritual casting adds 10 minutes to casting time, but does NOT expend a slot.
 */
export function ritualCastingTime(spell: SpellDef): string {
  switch (spell.castingTime) {
    case "action": return "10 minutes";
    case "bonus_action": return "10 minutes";
    case "minute": return "10 minutes + base casting time";
    case "hour": return "1 hour + base casting time";
    default: return "10 minutes";
  }
}

// ============================================================================
// 7. SPELL CAST PIPELINE
// ============================================================================

export interface SpellCastRequest {
  spell: SpellDef;
  casterId: string;
  casterLevel: number;
  spellcastingMod: number;
  /** Slot level used (for upcast). Equals spell.level for base cast. */
  slotLevel: number;
  /** Target IDs for the spell. */
  targetIds: string[];
  /** Skip slot cost (ritual, innate casting, magic item). */
  ignoreSlotCost?: boolean;
  /** Forced advantage on spell attacks (e.g. height advantage). */
  advantage?: boolean;
  disadvantage?: boolean;
  /** Seed for deterministic testing. */
  seed?: number;
}

export interface SpellEffectResult {
  targetId: string;
  hit?: boolean;
  critical?: boolean;
  damage?: number;
  damageType?: string;
  heal?: number;
  conditionsApplied?: string[];
  effectIdsApplied?: string[];
  saveRoll?: number;
  saveSuccess?: boolean;
  killed?: boolean;
}

export interface SpellCastResult {
  spellId: string;
  spellName: string;
  kind: SpellKind;
  slotLevel: number;
  concentrationRequired: boolean;
  effects: SpellEffectResult[];
  logSummary: string;
  /** Full dice breakdowns for audit. */
  attackRolls?: Array<{ targetId: string; roll: number; total: number; crit: boolean }>;
  damageRolls?: Array<{ targetId: string; expression: string; total: number }>;
}

/**
 * Resolve a spell cast against a list of targets.
 * Pure function — caller handles slot consumption + concentration tracking.
 *
 * Each target object provides: id, AC (for attacks), HP, save modifiers.
 */
export function castSpell(
  req: SpellCastRequest,
  targets: Array<{
    id: string;
    ac: number;
    hp: number;
    saveModifiers: Record<string, number>;
    resistances?: string[];
    vulnerabilities?: string[];
    immunities?: string[];
  }>,
): SpellCastResult {
  const { spell, slotLevel, spellcastingMod } = req;
  const effects: SpellEffectResult[] = [];
  const attackRolls: Array<{ targetId: string; roll: number; total: number; crit: boolean }> = [];
  const damageRolls: Array<{ targetId: string; expression: string; total: number }> = [];

  // Calculate upcast damage
  let damageExpr = spell.damage || "";
  if (spell.scalingDamage && slotLevel > spell.level) {
    const upcastLevels = slotLevel - spell.level;
    for (let i = 0; i < upcastLevels; i++) {
      damageExpr += "+" + spell.scalingDamage;
    }
  }

  const spellSaveDC = 8 + req.casterLevel + spellcastingMod; // simplified; caller can override

  switch (spell.kind) {
    case "attack": {
      const atkBonus = req.casterLevel + spellcastingMod; // simplified; should be PB + mod
      for (const target of targets) {
        const adv = req.advantage ? "advantage" : req.disadvantage ? "disadvantage" : "none";
        const r = rollD20(atkBonus, adv, { seed: req.seed });
        const hit = r.die !== 1 && (r.die === 20 || r.total >= target.ac);
        const critical = hit && r.die === 20;
        attackRolls.push({ targetId: target.id, roll: r.die, total: r.total, crit: critical });

        let damage = 0;
        if (hit && damageExpr) {
          const dmg = rollDamage(damageExpr, critical, { seed: req.seed });
          damage = applyDamageModifiers(dmg.total, spell.damageType, target);
          damageRolls.push({ targetId: target.id, expression: damageExpr, total: damage });
        }
        effects.push({
          targetId: target.id,
          hit,
          critical,
          damage,
          damageType: spell.damageType,
          killed: target.hp - damage <= 0,
        });
      }
      break;
    }
    case "save":
    case "aoe_damage": {
      for (const target of targets) {
        const saveMod = target.saveModifiers[spell.saveAbility ?? "dex"] ?? 0;
        const r = rollD20(saveMod, "none", { seed: req.seed });
        const success = r.total >= spellSaveDC;
        let damage = 0;
        if (damageExpr) {
          const dmg = rollDamage(damageExpr, false, { seed: req.seed });
          let rawDamage = dmg.total;
          if (success && spell.saveSuccess === "half") rawDamage = Math.floor(rawDamage / 2);
          if (success && spell.saveSuccess === "none") rawDamage = 0;
          damage = applyDamageModifiers(rawDamage, spell.damageType, target);
          damageRolls.push({ targetId: target.id, expression: damageExpr, total: damage });
        }
        effects.push({
          targetId: target.id,
          saveRoll: r.total,
          saveSuccess: success,
          damage,
          damageType: spell.damageType,
          conditionsApplied: success ? undefined : spell.conditionsApplied,
          killed: target.hp - damage <= 0,
        });
      }
      break;
    }
    case "heal": {
      const healRoll = damageExpr
        ? rollDamage(damageExpr, false, { seed: req.seed }).total + spellcastingMod
        : spellcastingMod;
      for (const target of targets) {
        effects.push({
          targetId: target.id,
          heal: healRoll,
        });
      }
      break;
    }
    case "auto": {
      // Magic Missile: auto-hit, no save
      const dmg = damageExpr ? rollDamage(damageExpr, false, { seed: req.seed }).total : 0;
      for (const target of targets) {
        const modifiedDmg = applyDamageModifiers(dmg, spell.damageType, target);
        effects.push({
          targetId: target.id,
          hit: true,
          damage: modifiedDmg,
          damageType: spell.damageType,
          killed: target.hp - modifiedDmg <= 0,
        });
        damageRolls.push({ targetId: target.id, expression: damageExpr, total: modifiedDmg });
      }
      break;
    }
    case "buff":
    case "debuff": {
      for (const target of targets) {
        effects.push({
          targetId: target.id,
          conditionsApplied: spell.conditionsApplied,
          effectIdsApplied: spell.effectIds,
        });
      }
      break;
    }
    case "utility":
    case "summon":
      // No mechanical resolution — DM narrates
      for (const target of targets) {
        effects.push({ targetId: target.id });
      }
      break;
  }

  return {
    spellId: spell.id,
    spellName: spell.name,
    kind: spell.kind,
    slotLevel,
    concentrationRequired: spell.concentration,
    effects,
    logSummary: `${spell.name} (slot ${slotLevel}) → ${effects.length} target(s)`,
    attackRolls: attackRolls.length > 0 ? attackRolls : undefined,
    damageRolls: damageRolls.length > 0 ? damageRolls : undefined,
  };
}

/**
 * Apply resistance/vulnerability/immunity to spell damage.
 */
function applyDamageModifiers(
  damage: number,
  damageType: DamageType | undefined,
  target: { resistances?: string[]; vulnerabilities?: string[]; immunities?: string[] },
): number {
  if (!damageType) return damage;
  if (target.immunities?.includes(damageType)) return 0;
  if (target.resistances?.includes(damageType)) return Math.floor(damage / 2);
  if (target.vulnerabilities?.includes(damageType)) return damage * 2;
  return damage;
}

// ============================================================================
// 8. COMPONENT VALIDATION
// ============================================================================

export interface ComponentCheckResult {
  valid: boolean;
  missingComponents: string[];
  missingMaterial?: string;
}

/**
 * Check if a caster has the required components to cast a spell.
 * D&D 5e: V/S components need free hands/speech; M needs the material.
 * Spellcasting focus (Arcane Focus, Holy Symbol) can substitute for M (no cost) materials.
 */
export function checkComponents(
  spell: SpellDef,
  hasVerbalCapability: boolean,
  hasSomaticCapability: boolean,
  hasMaterial: boolean,
  hasFocus: boolean,
): ComponentCheckResult {
  const missing: string[] = [];
  if (spell.components.verbal && !hasVerbalCapability) missing.push("verbal");
  if (spell.components.somatic && !hasSomaticCapability) missing.push("somatic");
  if (spell.components.material) {
    // Focus can substitute for non-cost materials
    const needsActualMaterial = !!spell.components.materialCost;
    if (needsActualMaterial && !hasMaterial) {
      missing.push("material");
      return { valid: false, missingComponents: missing, missingMaterial: spell.components.material };
    }
    if (!needsActualMaterial && !hasMaterial && !hasFocus) {
      missing.push("material_or_focus");
    }
  }
  return { valid: missing.length === 0, missingComponents: missing };
}

// ============================================================================
// 9. SPELL SCHOOL SPECIALIZATION
// ============================================================================

export interface SchoolSpecialization {
  school: SpellSchool;
  /** Bonus to spell save DC for this school. */
  dcBonus?: number;
  /** Bonus to spell attack for this school. */
  attackBonus?: number;
  /** Discount on spell slot cost (e.g. Transmutation Wizard savant: 1 less gp). */
  scribeTimeDiscount?: number;
}

// ============================================================================
// 10. SUMMARY — For AI DM / UI
// ============================================================================

/** Produce a human-readable summary of a spell. */
export function summarizeSpell(spell: SpellDef): string {
  const lvl = spell.level === 0 ? "Cantrip" : `Level ${spell.level}`;
  const comps: string[] = [];
  if (spell.components.verbal) comps.push("V");
  if (spell.components.somatic) comps.push("S");
  if (spell.components.material) comps.push("M");
  const conc = spell.concentration ? "Conc. " : "";
  const ritual = spell.ritual ? "Ritual " : "";
  return `${spell.name} ${lvl} ${spell.school} — ${conc}${ritual}${spell.castingTime}, ${typeof spell.range === "number" ? spell.range + " ft" : spell.range}, ${comps.join("")}`;
}

/** Summarize a caster's slot usage. */
export function summarizeSlots(state: SpellSlotState): string {
  const parts: string[] = [];
  for (let lv = 1; lv <= 9; lv++) {
    const slot = state.slots[lv];
    if (slot && slot.max > 0) {
      parts.push(`L${lv}: ${slot.current}/${slot.max}`);
    }
  }
  if (state.pactMagicSlots) {
    for (const [lv, slot] of Object.entries(state.pactMagicSlots)) {
      parts.push(`Pact L${lv}: ${slot.current}/${slot.max}`);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : "No spell slots";
}

/** Convenience re-exports */
export type { RollResult };
