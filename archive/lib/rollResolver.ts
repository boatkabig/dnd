/**
 * Roll Resolver — D&D 5e-specific roll types built on top of the Dice Engine.
 *
 * Knows game rules: which ability modifier to use, proficiency, conditions,
 * saving throws, skill checks, attack rolls, etc.
 *
 * The Dice Engine (separate file) handles pure dice math.
 */

import { roll, rollD20, rollDamage, rollSimple, type RollContext, type RollResult } from "./diceEngine";
import { mod, profByLevel } from "./gameData";

/* ================ Character Helpers ================ */

export function abilityMod(c: any, ability: string): number {
  return mod(c.abilities?.[ability] ?? 10);
}

export function savingThrowMod(c: any, ability: string): number {
  const cls = c.cls;
  const isProf = cls && (c.saves?.includes(ability) || false);
  // Use CLASSES from gameData — but to avoid circular import, we check c.saves
  // If character doesn't have saves array, compute from class data
  const prof = isProf ? profByLevel(c.level) : 0;
  let m0 = abilityMod(c, ability) + prof;
  // Ring of Protection etc.
  if (c.worn) {
    for (const item of c.worn) {
      // Check if it's a magic item with savePlus — we can't import MAGIC_ITEMS here
      // so we just check if the character has a saveBonus field
    }
  }
  return m0;
}

export function skillCheckMod(c: any, skillKey: string, classSkills: string[], extraSkills: string[]): number {
  const skillData = getSkillData(skillKey);
  if (!skillData) return abilityMod(c, "dex");
  const isProf = classSkills.includes(skillKey) || extraSkills.includes(skillKey);
  const isExpertise = (c.expertise || []).includes(skillKey);
  const pb = profByLevel(c.level);
  // D&D 5e/2024 Expertise: requires proficiency, then doubles PB (PB × 2, NOT PB + PB)
  // Source: roll20.net/compendium/dnd5e/Ability%20Scores#content
  //   "Expertise doubles the proficiency bonus for chosen skills."
  let profBonus = 0;
  if (isExpertise && isProf) profBonus = pb * 2;       // Expertise (must be proficient)
  else if (isProf) profBonus = pb;                     // Normal proficiency
  return abilityMod(c, skillData.abil) + profBonus;
}

// Inline skill data to avoid circular import
const SKILL_DATA: Record<string, { abil: string }> = {
  athletics: { abil: "str" }, acrobatics: { abil: "dex" }, sleight_of_hand: { abil: "dex" },
  stealth: { abil: "dex" }, arcana: { abil: "int" }, history: { abil: "int" },
  investigation: { abil: "int" }, nature: { abil: "int" }, religion: { abil: "int" },
  animal_handling: { abil: "wis" }, insight: { abil: "wis" }, medicine: { abil: "wis" },
  perception: { abil: "wis" }, survival: { abil: "wis" }, deception: { abil: "cha" },
  intimidation: { abil: "cha" }, performance: { abil: "cha" }, persuasion: { abil: "cha" },
};
function getSkillData(key: string) { return SKILL_DATA[key]; }

/* ================ Roll Types ================ */

export interface RollOptions {
  advantage?: boolean;
  disadvantage?: boolean;
  bonusDice?: string[];      // e.g. ["1d4"] for Bless
  penaltyDice?: string[];    // e.g. ["1d4"] for Bane
  rerollOnce?: boolean;      // Lucky feat
  replaceWith?: number;      // Portent
  critThreshold?: number;    // Champion = 19
}

/**
 * Ability Check: d20 + ability modifier + bonus
 * Used for: climbing, pushing, jumping, raw ability tests
 */
export function rollAbilityCheck(c: any, ability: string, dc: number, options?: RollOptions): {
  roll: RollResult; success: boolean; die: number; total: number;
} {
  const modifier = abilityMod(c, ability);
  const ctx: RollContext = {
    advantage: options?.advantage,
    disadvantage: options?.disadvantage,
    bonusDice: options?.bonusDice,
    penaltyDice: options?.penaltyDice,
    rerollOnce: options?.rerollOnce,
    replaceWith: options?.replaceWith,
    critThreshold: options?.critThreshold,
  };
  const result = roll(`1d20+${modifier}`, ctx);
  return {
    roll: result,
    success: result.total >= dc,
    die: result.naturalDie ?? 0,
    total: result.total,
  };
}

/**
 * Skill Check: d20 + ability mod + proficiency + bonus
 * Used for: Stealth, Perception, Acrobatics, Investigation, Persuasion, etc.
 */
export function rollSkillCheck(
  c: any, skillKey: string, dc: number,
  classSkills: string[], extraSkills: string[],
  options?: RollOptions
): { roll: RollResult; success: boolean; die: number; total: number; modifier: number } {
  const skillMod = skillCheckMod(c, skillKey, classSkills, extraSkills);
  const ctx: RollContext = {
    advantage: options?.advantage,
    disadvantage: options?.disadvantage,
    bonusDice: options?.bonusDice,
    penaltyDice: options?.penaltyDice,
    rerollOnce: options?.rerollOnce,
    replaceWith: options?.replaceWith,
  };
  const result = roll(`1d20+${skillMod}`, ctx);
  return {
    roll: result,
    success: result.total >= dc,
    die: result.naturalDie ?? 0,
    total: result.total,
    modifier: skillMod,
  };
}

/**
 * Saving Throw: d20 + saving throw modifier
 * Used for: dodging Fireball, resisting poison, resisting spells, avoiding traps
 */
export function rollSavingThrow(
  c: any, ability: string, dc: number,
  options?: RollOptions
): { roll: RollResult; success: boolean; die: number; total: number } {
  const svMod = savingThrowMod(c, ability);
  const ctx: RollContext = {
    advantage: options?.advantage,
    disadvantage: options?.disadvantage,
    bonusDice: options?.bonusDice,
    penaltyDice: options?.penaltyDice,
    rerollOnce: options?.rerollOnce,
    replaceWith: options?.replaceWith,
  };
  const result = roll(`1d20+${svMod}`, ctx);
  return {
    roll: result,
    success: result.total >= dc,
    die: result.naturalDie ?? 0,
    total: result.total,
  };
}

/**
 * Attack Roll: d20 + attack modifier (ability + prof + magic + bonus)
 * Natural 20 = automatic success + critical hit
 * Natural 1 = automatic failure
 */
export function rollAttack(
  attackModifier: number, targetAC: number,
  options?: RollOptions
): { roll: RollResult; hit: boolean; isCrit: boolean; isFumble: boolean; die: number; total: number } {
  const ctx: RollContext = {
    advantage: options?.advantage,
    disadvantage: options?.disadvantage,
    bonusDice: options?.bonusDice,
    penaltyDice: options?.penaltyDice,
    rerollOnce: options?.rerollOnce,
    replaceWith: options?.replaceWith,
    critThreshold: options?.critThreshold,
  };
  const result = roll(`1d20+${attackModifier}`, ctx);
  const die = result.naturalDie ?? 0;
  const isCrit = die >= (options?.critThreshold ?? 20);
  const isFumble = die === 1;
  // Natural 20 always hits, Natural 1 always misses
  const hit = !isFumble && (isCrit || result.total >= targetAC);
  return {
    roll: result,
    hit,
    isCrit,
    isFumble,
    die,
    total: result.total,
  };
}

/**
 * Damage Roll: weapon/spell dice + modifier (no d20)
 * On critical hit, double the dice (not the modifier)
 */
export function rollDamageRoll(
  damageExpr: string, isCrit: boolean = false,
  options?: RollOptions
): RollResult {
  return rollDamage(damageExpr, isCrit, options);
}

/**
 * Healing Roll: healing dice + modifier
 * e.g. Healing Word: 1d4+WIS, Potion: 2d4+2, Hit Dice: 1d10+CON
 */
export function rollHealing(healExpr: string): RollResult {
  return roll(healExpr);
}

/**
 * Initiative Roll: d20 + DEX modifier
 */
export function rollInitiative(dexMod: number, options?: RollOptions): {
  roll: RollResult; die: number; total: number;
} {
  const ctx: RollContext = {
    advantage: options?.advantage,
    disadvantage: options?.disadvantage,
    bonusDice: options?.bonusDice,
    rerollOnce: options?.rerollOnce,
  };
  const result = roll(`1d20+${dexMod}`, ctx);
  return {
    roll: result,
    die: result.naturalDie ?? 0,
    total: result.total,
  };
}

/**
 * Death Saving Throw: d20, no modifier
 * 1 = critical fail (2 death failures)
 * 2-9 = fail (1 death failure)
 * 10-19 = success (1 death success)
 * 20 = recover with 1 HP
 */
export function rollDeathSave(): {
  roll: RollResult; die: number; result: "critical_fail" | "fail" | "success" | "recover";
} {
  const result = roll("1d20");
  const die = result.naturalDie ?? 0;
  let outcome: "critical_fail" | "fail" | "success" | "recover";
  if (die === 1) outcome = "critical_fail";
  else if (die >= 20) outcome = "recover";
  else if (die >= 10) outcome = "success";
  else outcome = "fail";
  return { roll: result, die, result: outcome };
}

/**
 * Hit Dice Roll (Short Rest): 1d{hitDie} + CON modifier
 */
export function rollHitDice(hitDie: number, conMod: number): RollResult {
  return roll(`1d${hitDie}+${conMod}`);
}

/**
 * Contest Roll: both sides roll d20, compare totals
 * e.g. Grapple: Athletics vs Athletics/Acrobatics
 */
export function rollContest(
  modA: number, modB: number,
  advA: "none" | "advantage" | "disadvantage" = "none"
): { rollA: RollResult; rollB: RollResult; winner: "A" | "B" | "tie"; totalA: number; totalB: number } {
  const resultA = roll(`1d20+${modA}`, { advantage: advA === "advantage", disadvantage: advA === "disadvantage" });
  const resultB = roll(`1d20+${modB}`);
  let winner: "A" | "B" | "tie" = "tie";
  if (resultA.total > resultB.total) winner = "A";
  else if (resultB.total > resultA.total) winner = "B";
  return { rollA: resultA, rollB: resultB, winner, totalA: resultA.total, totalB: resultB.total };
}

/**
 * Passive Check: 10 + modifier (no roll)
 * e.g. Passive Perception = 10 + WIS mod + proficiency
 */
export function rollPassive(modifier: number): number {
  return 10 + modifier;
}
