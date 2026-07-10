/**
 * ============================================================================
 * D&D Engine Design Document — Chapter 07: Skills & Checks
 * ============================================================================
 *
 * Version: 1.0
 * Target: D&D 5e / 2024 Compatible
 * Architecture: Data-Driven Skill Definitions + Unified Check Resolution
 *
 * Core Principles:
 *   1. SkillDefinition = pure data (ability, proficiencies, description).
 *   2. Skill modifier = ability mod + proficiency + expertise + effect modifiers.
 *   3. Check resolution pipeline: roll d20 + modifiers vs DC (with adv/dis).
 *   4. Advantage/Disadvantage sources are tracked (effects, environment, etc.).
 *   5. Passive checks: 10 + modifier (D&D 5e Passive Perception).
 *   6. Group checks: majority of party succeeds (D&D 5e rule).
 *   7. Contested checks: A vs B (Grapple, Stealth vs Perception).
 *   8. Tool checks: Thieves' Tools, Herbalism Kit — uses proficiency + ability.
 *
 * 18 Standard Skills (D&D 5e):
 *   Strength:     Athletics
 *   Dexterity:    Acrobatics, Sleight of Hand, Stealth
 *   Intelligence: Arcana, History, Investigation, Nature, Religion
 *   Wisdom:       Animal Handling, Insight, Medicine, Perception, Survival
 *   Charisma:     Deception, Intimidation, Performance, Persuasion
 *
 * Resolution Pipeline:
 *   1. Compute modifier (ability + prof + expertise + effects)
 *   2. Determine advantage/disadvantage (effects, environment)
 *   3. Roll d20 (with adv/dis, bonus dice like Guidance +1d4)
 *   4. Compare total vs DC (or vs opponent's total for contests)
 *   5. Trigger on_skill_check effects (e.g. Bardic Inspiration)
 *
 * Cross-References:
 *   - Character.ts (Chapter 01) → provides ability scores, proficiencies, PB
 *   - Effects.ts (Chapter 06) → provides active effect modifiers
 *   - Dice.ts (Chapter 09) → provides rollD20, rollContest, passiveCheck
 * ============================================================================
 */

import type { AbilityName } from "./character";
import { rollD20, rollContest, passiveCheck, type RollResult } from "./dice";

// ============================================================================
// 1. SKILL DEFINITION — Pure data
// ============================================================================

/**
 * Standard D&D 5e skill IDs + extensible for homebrew.
 */
export type StandardSkillId =
  | "athletics"
  | "acrobatics"
  | "sleight_of_hand"
  | "stealth"
  | "arcana"
  | "history"
  | "investigation"
  | "nature"
  | "religion"
  | "animal_handling"
  | "insight"
  | "medicine"
  | "perception"
  | "survival"
  | "deception"
  | "intimidation"
  | "performance"
  | "persuasion";

export interface SkillDef {
  id: string;
  name: string;
  nameTh?: string;
  /** Primary ability (D&D 5e default). */
  ability: AbilityName;
  description: string;
  /** Optional alternative ability (e.g. Athletics can use STR or DEX). */
  alternativeAbilities?: AbilityName[];
  /** Whether this skill is in the standard list. */
  isStandard: boolean;
}

/**
 * Master table of 18 standard D&D 5e skills.
 * Adding a custom skill: just append to this object or use registerSkill().
 */
export const STANDARD_SKILLS: Record<StandardSkillId, SkillDef> = {
  athletics: { id: "athletics", name: "Athletics", ability: "str", description: "Climbing, jumping, swimming, grappling.", isStandard: true },
  acrobatics: { id: "acrobatics", name: "Acrobatics", ability: "dex", description: "Balancing, tumbling, escaping grapples.", isStandard: true },
  sleight_of_hand: { id: "sleight_of_hand", name: "Sleight of Hand", ability: "dex", description: "Pickpocketing, palming objects, legerdemain.", isStandard: true },
  stealth: { id: "stealth", name: "Stealth", ability: "dex", description: "Hiding, moving quietly, sneaking.", isStandard: true },
  arcana: { id: "arcana", name: "Arcana", ability: "int", description: "Magic traditions, spells, magical writing.", isStandard: true },
  history: { id: "history", name: "History", ability: "int", description: "Past events, legends, historical figures.", isStandard: true },
  investigation: { id: "investigation", name: "Investigation", ability: "int", description: "Finding clues, deducing facts, puzzling out.", isStandard: true },
  nature: { id: "nature", name: "Nature", ability: "int", description: "Plants, animals, weather, terrain.", isStandard: true },
  religion: { id: "religion", name: "Religion", ability: "int", description: "Gods, holy symbols, cults, prayers.", isStandard: true },
  animal_handling: { id: "animal_handling", name: "Animal Handling", ability: "wis", description: "Calming, training, riding animals.", isStandard: true },
  insight: { id: "insight", name: "Insight", ability: "wis", description: "Reading body language, detecting lies.", isStandard: true },
  medicine: { id: "medicine", name: "Medicine", ability: "wis", description: "Diagnosing illness, stabilizing dying.", isStandard: true },
  perception: { id: "perception", name: "Perception", ability: "wis", description: "Spotting, hearing, detecting hidden things.", isStandard: true },
  survival: { id: "survival", name: "Survival", ability: "wis", description: "Foraging, tracking, navigating wilderness.", isStandard: true },
  deception: { id: "deception", name: "Deception", ability: "cha", description: "Lying, fast-talking, disguising.", isStandard: true },
  intimidation: { id: "intimidation", name: "Intimidation", ability: "cha", description: "Coercing via threats or displays of power.", isStandard: true, alternativeAbilities: ["str"] },
  performance: { id: "performance", name: "Performance", ability: "cha", description: "Playing music, acting, dancing, storytelling.", isStandard: true },
  persuasion: { id: "persuasion", name: "Persuasion", ability: "cha", description: "Influencing via appeals to reason or emotion.", isStandard: true },
};

/** Custom skill registry — homebrew skills can be added at runtime. */
const _customSkills = new Map<string, SkillDef>();

export function registerSkill(def: SkillDef): void {
  _customSkills.set(def.id, def);
}

export function getSkillDef(skillId: string): SkillDef | undefined {
  if (skillId in STANDARD_SKILLS) return STANDARD_SKILLS[skillId as StandardSkillId];
  return _customSkills.get(skillId);
}

// ============================================================================
// 2. SKILL INSTANCE — Per-character skill proficiency + modifiers
// ============================================================================

/**
 * A character's skill state. Stored in character.skills[].
 */
export interface SkillInstance {
  skillId: string;
  ability: AbilityName;              // default ability
  abilityOverride?: AbilityName;     // alternate ability if chosen
  proficient: boolean;
  expertise: boolean;                // double proficiency (Rogue, Bard)
  /** Effect modifiers (Guidance +1d4, Jack of All Trades +half prof, etc.). */
  modifiers: Array<{
    source: string;                  // effect instance ID or feature ID
    value: number;                   // flat bonus
    diceBonus?: string;              // "1d4" for Guidance
    type: "bonus" | "advantage" | "disadvantage";
  }>;
}

// ============================================================================
// 3. SKILL MODIFIER CALCULATION
// ============================================================================

/**
 * Inputs needed to compute a skill modifier.
 * Decouples from Character — caller pulls ability mod + PB from Character.
 */
export interface SkillModifierInput {
  skill: SkillInstance;
  abilityModifier: number;           // from Character.getMod()
  proficiencyBonus: number;          // from Character.getPB()
}

/**
 * Compute the skill modifier.
 *   modifier = ability + (prof ? PB : 0) + (expertise ? PB : 0) + sum(bonuses)
 *
 * Jack of All Tales (Bard 2): half proficiency on non-proficient skills.
 *   Caller passes a "halfProficiencyBonus" flag in modifiers.
 */
export function getSkillModifier(input: SkillModifierInput): number {
  const { skill, abilityModifier, proficiencyBonus } = input;
  let mod = abilityModifier;
  if (skill.proficient) mod += proficiencyBonus;
  if (skill.expertise) mod += proficiencyBonus; // double prof
  mod += skill.modifiers
    .filter(m => m.type === "bonus")
    .reduce((s, m) => s + m.value, 0);
  return mod;
}

/**
 * Determine advantage/disadvantage state for a skill check.
 * Returns "advantage" | "disadvantage" | "none".
 * (D&D 5e: if you have both, they cancel.)
 */
export function getSkillAdvantageState(skill: SkillInstance): "advantage" | "disadvantage" | "none" {
  const hasAdv = skill.modifiers.some(m => m.type === "advantage");
  const hasDis = skill.modifiers.some(m => m.type === "disadvantage");
  if (hasAdv && hasDis) return "none";
  if (hasAdv) return "advantage";
  if (hasDis) return "disadvantage";
  return "none";
}

/** Get all dice bonuses currently applied to a skill (e.g. Guidance +1d4). */
export function getSkillDiceBonuses(skill: SkillInstance): string[] {
  return skill.modifiers
    .filter(m => m.type === "bonus" && m.diceBonus)
    .map(m => m.diceBonus as string);
}

// ============================================================================
// 4. CHECK RESOLUTION — Roll d20 + modifiers vs DC
// ============================================================================

export interface CheckRequest {
  skill: SkillInstance;
  abilityModifier: number;
  proficiencyBonus: number;
  /** Target Difficulty Class (DC). */
  dc: number;
  /** Forced advantage/disadvantage (e.g. from environment). */
  forcedAdvantage?: boolean;
  forcedDisadvantage?: boolean;
  /** Override ability (e.g. Athletics using DEX). */
  abilityOverride?: AbilityName;
  /** Seed for deterministic testing. */
  seed?: number;
  /** External bonus dice (Bardic Inspiration +1d6). */
  bonusDice?: string[];
  /** External penalty dice (Bane -1d4 — rare on skill checks). */
  penaltyDice?: string[];
  /**
   * D&D 2024 Tool + Skill Advantage rule (D&D Beyond Free Rules — "Tool Proficiency"):
   *   "If you have proficiency with a tool, add your Proficiency Bonus to any ability check
   *    you make that uses the tool. If you have proficiency in a skill that's used with that
   *    check, you have Advantage on the check too."
   * Pass `hasToolProficiency: true` AND `hasSkillProficiency: true` to grant advantage.
   */
  hasToolProficiency?: boolean;
  hasSkillProficiencyForTool?: boolean;
}

export interface CheckResult {
  success: boolean;
  roll: number;                      // natural d20
  total: number;                     // d20 + modifier + bonus dice
  modifier: number;                  // applied skill modifier
  dc: number;
  isCritSuccess: boolean;            // nat 20 (D&D 5e: not auto-success by RAW, but often house-ruled)
  isCritFail: boolean;               // nat 1
  advantage: "advantage" | "disadvantage" | "none";
  diceBonuses: string[];
  history: string;
  rollResult?: RollResult;
}

/**
 * Resolve a skill check against a fixed DC.
 * Pure function — no side effects. Returns full breakdown for UI + audit.
 *
 * Usage:
 *   const result = resolveCheck({
 *     skill: char.skills.stealth,
 *     abilityModifier: getMod(char, "dex"),
 *     proficiencyBonus: getPB(char),
 *     dc: 15,
 *   });
 *   if (result.success) { ... hide successfully ... }
 */
export function resolveCheck(req: CheckRequest): CheckResult {
  const modifier = getSkillModifier({
    skill: req.skill,
    abilityModifier: req.abilityModifier,
    proficiencyBonus: req.proficiencyBonus,
  });

  // Determine advantage
  const skillAdv = getSkillAdvantageState(req.skill);
  let adv: "advantage" | "disadvantage" | "none" = skillAdv;
  if (req.forcedAdvantage) adv = "advantage";
  if (req.forcedDisadvantage) adv = "disadvantage";
  // Forced advantage + skill disadvantage → cancel
  if (req.forcedAdvantage && skillAdv === "disadvantage") adv = "none";
  if (req.forcedDisadvantage && skillAdv === "advantage") adv = "none";

  // D&D 2024 Tool + Skill Advantage: proficiency with both a tool AND a skill
  // on the same ability check grants Advantage.
  // Source: D&D Beyond Free Rules 2024 — "Tool Proficiency".
  if (req.hasToolProficiency && req.hasSkillProficiencyForTool && adv === "none") {
    adv = "advantage";
  }

  // Collect dice bonuses
  const diceBonuses = [...getSkillDiceBonuses(req.skill), ...(req.bonusDice ?? [])];

  const roll = rollD20(modifier, adv, {
    seed: req.seed,
    bonusDice: diceBonuses.length > 0 ? diceBonuses : undefined,
    penaltyDice: req.penaltyDice,
  });

  const success = roll.total >= req.dc;

  return {
    success,
    roll: roll.die,
    total: roll.total,
    modifier,
    dc: req.dc,
    isCritSuccess: roll.die === 20,
    isCritFail: roll.die === 1,
    advantage: adv,
    diceBonuses,
    history: `d20(${roll.die})${modifier >= 0 ? "+" : ""}${modifier}${diceBonuses.length ? `+dice` : ""}=${roll.total} vs DC ${req.dc} → ${success ? "SUCCESS" : "FAIL"}`,
  };
}

// ============================================================================
// 5. CONTESTED CHECKS — A vs B
// ============================================================================

export interface ContestRequest {
  skillA: SkillInstance;
  abilityModifierA: number;
  proficiencyBonusA: number;
  advantageA?: "advantage" | "disadvantage" | "none";
  skillB: SkillInstance;
  abilityModifierB: number;
  proficiencyBonusB: number;
  advantageB?: "advantage" | "disadvantage" | "none";
  seed?: number;
  bonusDiceA?: string[];
  bonusDiceB?: string[];
}

export interface ContestResult {
  winner: "A" | "B" | "tie";
  totalA: number;
  totalB: number;
  rollA: number;
  rollB: number;
  modifierA: number;
  modifierB: number;
  history: string;
}

/**
 * Resolve a contested check (Grapple: Athletics vs Athletics/Acrobatics).
 * Both sides roll d20 + their skill modifier; higher total wins.
 */
export function resolveContest(req: ContestRequest): ContestResult {
  const modA = getSkillModifier({
    skill: req.skillA,
    abilityModifier: req.abilityModifierA,
    proficiencyBonus: req.proficiencyBonusA,
  });
  const modB = getSkillModifier({
    skill: req.skillB,
    abilityModifier: req.abilityModifierB,
    proficiencyBonus: req.proficiencyBonusB,
  });

  const rollA = rollD20(modA, req.advantageA ?? "none", {
    seed: req.seed,
    bonusDice: req.bonusDiceA,
  });
  const rollB = rollD20(modB, req.advantageB ?? "none", {
    seed: req.seed !== undefined ? req.seed + 1 : undefined,
    bonusDice: req.bonusDiceB,
  });

  // Use rollContest as fallback if no advantage/dice
  // (rollContest doesn't support advantage/dice, so we use rollD20 directly)
  let winner: "A" | "B" | "tie" = "tie";
  if (rollA.total > rollB.total) winner = "A";
  else if (rollB.total > rollA.total) winner = "B";

  return {
    winner,
    totalA: rollA.total,
    totalB: rollB.total,
    rollA: rollA.die,
    rollB: rollB.die,
    modifierA: modA,
    modifierB: modB,
    history: `A: d20(${rollA.die})+${modA}=${rollA.total} vs B: d20(${rollB.die})+${modB}=${rollB.total} → ${winner} wins`,
  };
}

// ============================================================================
// 6. GROUP CHECKS — Majority succeeds
// ============================================================================

export interface GroupCheckEntry {
  skill: SkillInstance;
  abilityModifier: number;
  proficiencyBonus: number;
  advantage?: "advantage" | "disadvantage" | "none";
}

export interface GroupCheckResult {
  success: boolean;
  individualResults: CheckResult[];
  successCount: number;
  failureCount: number;
  history: string;
}

/**
 * Resolve a group check (D&D 5e): majority of party must succeed.
 * Used for group Stealth, group Survival (navigation), etc.
 *
 * Rule: if at least half the members succeed, the group succeeds.
 */
export function resolveGroupCheck(
  entries: GroupCheckEntry[],
  dc: number,
  seed?: number,
): GroupCheckResult {
  const individualResults: CheckResult[] = entries.map((entry, idx) =>
    resolveCheck({
      skill: entry.skill,
      abilityModifier: entry.abilityModifier,
      proficiencyBonus: entry.proficiencyBonus,
      dc,
      forcedAdvantage: entry.advantage === "advantage",
      forcedDisadvantage: entry.advantage === "disadvantage",
      seed: seed !== undefined ? seed + idx : undefined,
    })
  );
  const successCount = individualResults.filter(r => r.success).length;
  const failureCount = individualResults.length - successCount;
  const success = successCount >= Math.ceil(individualResults.length / 2);

  return {
    success,
    individualResults,
    successCount,
    failureCount,
    history: `Group check: ${successCount}/${individualResults.length} succeeded → ${success ? "GROUP SUCCESS" : "GROUP FAIL"}`,
  };
}

// ============================================================================
// 7. PASSIVE CHECKS — 10 + modifier
// ============================================================================

export interface PassiveCheckRequest {
  skill: SkillInstance;
  abilityModifier: number;
  proficiencyBonus: number;
  /** Flat bonus from features (e.g. Observant feat +5 to passive Perception). */
  flatBonus?: number;
}

/**
 * Compute a passive check score (D&D 5e Passive Perception, Passive Investigation).
 * Formula: 10 + skill_modifier + flat_bonus
 *
 * Disadvantage: -5 (per D&D 5e rule).
 * Advantage: +5 (per D&D 5e rule).
 */
export function passiveCheckScore(req: PassiveCheckRequest): number {
  const modifier = getSkillModifier({
    skill: req.skill,
    abilityModifier: req.abilityModifier,
    proficiencyBonus: req.proficiencyBonus,
  });
  const advState = getSkillAdvantageState(req.skill);
  const advBonus = advState === "advantage" ? 5 : advState === "disadvantage" ? -5 : 0;
  return passiveCheck(modifier, { bonus: (req.flatBonus ?? 0) + advBonus });
}

// ============================================================================
// 8. TOOL CHECKS — Thieves' Tools, Herbalism Kit, etc.
// ============================================================================

export interface ToolProficiency {
  toolId: string;
  ability: AbilityName;
  proficient: boolean;
  expertise: boolean;
  modifiers: Array<{
    source: string;
    value: number;
    diceBonus?: string;
    type: "bonus" | "advantage" | "disadvantage";
  }>;
}

export interface ToolCheckRequest {
  tool: ToolProficiency;
  abilityModifier: number;
  proficiencyBonus: number;
  dc: number;
  seed?: number;
  bonusDice?: string[];
}

/**
 * Resolve a tool check (Thieves' Tools to pick lock, Herbalism Kit to craft potion).
 * Same pipeline as skill check but uses tool proficiency instead.
 */
export function resolveToolCheck(req: ToolCheckRequest): CheckResult {
  // Build a pseudo-skill instance from the tool proficiency
  const pseudoSkill: SkillInstance = {
    skillId: req.tool.toolId,
    ability: req.tool.ability,
    proficient: req.tool.proficient,
    expertise: req.tool.expertise,
    modifiers: req.tool.modifiers,
  };
  return resolveCheck({
    skill: pseudoSkill,
    abilityModifier: req.abilityModifier,
    proficiencyBonus: req.proficiencyBonus,
    dc: req.dc,
    seed: req.seed,
    bonusDice: req.bonusDice,
  });
}

// ============================================================================
// 9. ABILITY CHECKS — Raw ability, no skill
// ============================================================================

export interface AbilityCheckRequest {
  ability: AbilityName;
  abilityModifier: number;
  proficiencyBonus: number;
  /** Optional: is the character proficient with this ability check (rare)? */
  proficient?: boolean;
  dc: number;
  advantage?: "advantage" | "disadvantage" | "none";
  seed?: number;
  bonusDice?: string[];
}

/**
 * Resolve a raw ability check (no skill proficiency, just d20 + ability mod).
 * Example: pure Strength check to break down a door.
 */
export function resolveAbilityCheck(req: AbilityCheckRequest): CheckResult {
  const pseudoSkill: SkillInstance = {
    skillId: `ability_${req.ability}`,
    ability: req.ability,
    proficient: req.proficient ?? false,
    expertise: false,
    modifiers: [],
  };
  return resolveCheck({
    skill: pseudoSkill,
    abilityModifier: req.abilityModifier,
    proficiencyBonus: req.proficiencyBonus,
    dc: req.dc,
    forcedAdvantage: req.advantage === "advantage",
    forcedDisadvantage: req.advantage === "disadvantage",
    seed: req.seed,
    bonusDice: req.bonusDice,
  });
}

// ============================================================================
// 10. STANDARD DC TABLE — Data-driven difficulty
// ============================================================================

export type DifficultyClass =
  | "very_easy"
  | "easy"
  | "medium"
  | "hard"
  | "very_hard"
  | "formidable"
  | "heroic"
  | "nearly_impossible";

/**
 * D&D 5e standard DC table (DMG p. 238).
 */
export const STANDARD_DCS: Record<DifficultyClass, number> = {
  very_easy: 5,
  easy: 10,
  medium: 15,
  hard: 20,
  very_hard: 25,
  formidable: 30,
  heroic: 35,
  nearly_impossible: 40,
};

/** Look up a DC by difficulty name. */
export function getDC(difficulty: DifficultyClass): number {
  return STANDARD_DCS[difficulty];
}

// ============================================================================
// 11. ADVANTAGE SOURCES — Track WHY a check has adv/dis
// ============================================================================

export type AdvantageSource =
  | "condition"        // from a condition (Restrained → disadv on attacks)
  | "effect"           // from a magical effect (Bless → no, but Guidance)
  | "feature"          // from a class/race feature (Reckless Attack)
  | "environment"      // from terrain/weather (heavy rain → disadv on Perception)
  | "equipment"        // from equipment (Darkvision → no disadv in dim light)
  | "spell"            // from a spell (Enhance Ability → adv on chosen ability)
  | "dm_ruling"        // DM grants situational advantage
  | "custom";

export interface AdvantageEntry {
  source: AdvantageSource;
  sourceId: string;                  // effect ID, feature ID, etc.
  type: "advantage" | "disadvantage";
  reason: string;
  /** Duration in rounds (0 = until removed). */
  duration?: number;
}

/**
 * Aggregate multiple advantage/disadvantage sources.
 * D&D 5e rule: any number of adv sources + any number of dis sources cancel;
 * if both present → neither applies (just roll 1d20).
 */
export function resolveAdvantage(entries: AdvantageEntry[]): "advantage" | "disadvantage" | "none" {
  const hasAdv = entries.some(e => e.type === "advantage");
  const hasDis = entries.some(e => e.type === "disadvantage");
  if (hasAdv && hasDis) return "none";
  if (hasAdv) return "advantage";
  if (hasDis) return "disadvantage";
  return "none";
}

// ============================================================================
// 12. SUMMARY — For AI DM / UI
// ============================================================================

/** Produce a human-readable summary of a character's skill modifiers. */
export function summarizeSkills(
  skills: Record<string, SkillInstance>,
  getMod: (ability: AbilityName) => number,
  proficiencyBonus: number,
): string {
  const parts: string[] = [];
  for (const skillId of Object.keys(STANDARD_SKILLS) as StandardSkillId[]) {
    const skill = skills[skillId];
    if (!skill) continue;
    const mod = getSkillModifier({
      skill,
      abilityModifier: getMod(skill.abilityOverride ?? skill.ability),
      proficiencyBonus,
    });
    const prof = skill.proficient ? (skill.expertise ? "×2" : "✓") : "—";
    parts.push(`${STANDARD_SKILLS[skillId].name} ${mod >= 0 ? "+" : ""}${mod} (${prof})`);
  }
  return parts.join(" · ");
}

/** Get the ability modifier override (e.g. Athletics using STR or DEX). */
export function resolveSkillAbility(skill: SkillInstance): AbilityName {
  return skill.abilityOverride ?? skill.ability;
}

// Convenience re-export for callers that want the dice helpers
export { rollContest };
