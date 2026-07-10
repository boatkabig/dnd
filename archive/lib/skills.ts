/**
 * Skills System — D&D 5e check resolution.
 *
 * Architecture: 2-step flow as recommended.
 *   1. Intent Analysis  — what is the player trying to do?
 *   2. Check Resolution — pick the check type, DC, modifier, and resolve.
 *
 * Supports flexible ability+skill pairing (e.g. "STR (Intimidation)")
 * without hardcoding skill names into logic.
 */

import { roll, rollD20, type RollContext } from "./diceEngine";
import { mod, profByLevel } from "./gameData";

/* ======================================================================
 * CONSTANTS
 * ====================================================================== */

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = typeof ABILITIES[number];

export const SKILL_MAP: Record<string, { abil: Ability; name: string; nameTh: string }> = {
  athletics:       { abil: "str", name: "Athletics",        nameTh: "กรีฑา" },
  acrobatics:      { abil: "dex", name: "Acrobatics",       nameTh: "กายกรรม" },
  sleight_of_hand: { abil: "dex", name: "Sleight of Hand",  nameTh: "มือสัมผัส" },
  stealth:         { abil: "dex", name: "Stealth",           nameTh: "ซ่อนเร้น" },
  arcana:          { abil: "int", name: "Arcana",            nameTh: "เวทมนตร์" },
  history:         { abil: "int", name: "History",           nameTh: "ประวัติศาสตร์" },
  investigation:   { abil: "int", name: "Investigation",     nameTh: "สืบสวน" },
  nature:          { abil: "int", name: "Nature",            nameTh: "ธรรมชาติ" },
  religion:        { abil: "int", name: "Religion",          nameTh: "ศาสนา" },
  animal_handling: { abil: "wis", name: "Animal Handling",  nameTh: "ควบคุมสัตว์" },
  insight:         { abil: "wis", name: "Insight",           nameTh: "สังเกตใจ" },
  medicine:        { abil: "wis", name: "Medicine",          nameTh: "การแพทย์" },
  perception:      { abil: "wis", name: "Perception",       nameTh: "รับรู้" },
  survival:        { abil: "wis", name: "Survival",          nameTh: "เอาชีวิตรอด" },
  deception:       { abil: "cha", name: "Deception",         nameTh: "หลอกลวง" },
  intimidation:    { abil: "cha", name: "Intimidation",     nameTh: "ข่มขู่" },
  performance:     { abil: "cha", name: "Performance",       nameTh: "การแสดง" },
  persuasion:      { abil: "cha", name: "Persuasion",       nameTh: "โน้มน้าว" },
};

/* ======================================================================
 * 5.10 DIFFICULTY CLASS (DC)
 * ====================================================================== */

export type DCTier = "very_easy" | "easy" | "medium" | "hard" | "very_hard" | "nearly_impossible";

export const DC_TIERS: Record<DCTier, { dc: number; name: string; nameTh: string }> = {
  very_easy:         { dc: 5,  name: "Very Easy",         nameTh: "ง่ายมาก" },
  easy:              { dc: 10, name: "Easy",              nameTh: "ง่าย" },
  medium:            { dc: 13, name: "Medium",            nameTh: "ปานกลาง" },
  hard:              { dc: 15, name: "Hard",              nameTh: "ยาก" },
  very_hard:         { dc: 18, name: "Very Hard",         nameTh: "ยากมาก" },
  nearly_impossible: { dc: 25, name: "Nearly Impossible", nameTh: "เกือบเป็นไปไม่ได้" },
};

/* ======================================================================
 * 5.13 PROFICIENCY LEVELS
 * ====================================================================== */

export type ProficiencyLevel = "none" | "half" | "proficient" | "expertise";

export function proficiencyBonus(level: number, profLevel: ProficiencyLevel): number {
  const prof = profByLevel(level);
  switch (profLevel) {
    case "none": return 0;
    case "half": return Math.floor(prof / 2);
    case "proficient": return prof;
    case "expertise": return prof * 2;
  }
}

/* ======================================================================
 * 5.14 SKILL MODIFIER SOURCES
 * ====================================================================== */

export interface SkillModifierSources {
  ability: number;          // from ability score
  proficiency: number;      // from prof level
  magic?: number;           // from spells/items (e.g. Guidance +1d4)
  item?: number;            // from magic items (e.g. Gloves of Thievery +5)
  feature?: number;         // from class features (e.g. Jack of All Trades)
  condition?: number;       // from conditions (usually 0, but some reduce)
  temporary?: number;       // from temp effects (buffs/debuffs)
}

export function totalModifier(sources: SkillModifierSources): number {
  return (sources.ability || 0) + (sources.proficiency || 0) + (sources.magic || 0) +
         (sources.item || 0) + (sources.feature || 0) + (sources.condition || 0) +
         (sources.temporary || 0);
}

/* ======================================================================
 * 5.11 / 5.12 ADVANTAGE & AUTO SUCCESS/FAILURE
 * ====================================================================== */

export interface CheckContext {
  advantage?: boolean;
  disadvantage?: boolean;
  bonusDice?: string[];      // Bless +1d4, Guidance +1d4
  penaltyDice?: string[];    // Bane -1d4
  rerollOnce?: boolean;      // Lucky
  replaceWith?: number;      // Portent
  // NOTE: Ability/Skill/Saving Throw checks do NOT have auto success/failure
  // on nat 1 or nat 20 per RAW. Only Attack Rolls do.
}

/* ======================================================================
 * 5.16 CHECK OUTCOMES
 * ====================================================================== */

export type CheckOutcome = "critical_success" | "success" | "partial_success" | "failure" | "critical_failure";

export interface CheckResult {
  die: number;               // raw d20
  total: number;             // die + modifier + bonus dice
  modifier: number;          // total modifier
  dc: number;                // target DC
  outcome: CheckOutcome;
  history: string;           // readable breakdown
  isSuccess: boolean;
  // Optional details
  contestedResult?: { winner: "A" | "B" | "tie"; totalA: number; totalB: number };
  groupResult?: { successes: number; failures: number; total: number; groupSuccess: boolean };
}

/* ======================================================================
 * 5.1 ABILITY CHECK
 * ====================================================================== */

export function rollAbilityCheck(
  abilityScore: number,
  dc: number,
  profLevel: ProficiencyLevel = "none",
  charLevel: number = 1,
  extraMods: Partial<SkillModifierSources> = {},
  ctx: CheckContext = {},
): CheckResult {
  const sources: SkillModifierSources = {
    ability: mod(abilityScore),
    proficiency: proficiencyBonus(charLevel, profLevel),
    ...extraMods,
  };
  return resolveCheck(sources, dc, ctx);
}

/* ======================================================================
 * 5.2 SKILL CHECK
 * ====================================================================== */

export function rollSkillCheck(
  abilityScore: number,
  skillKey: string,
  dc: number,
  profLevel: ProficiencyLevel,
  charLevel: number,
  extraMods: Partial<SkillModifierSources> = {},
  ctx: CheckContext = {},
): CheckResult {
  const sources: SkillModifierSources = {
    ability: mod(abilityScore),
    proficiency: proficiencyBonus(charLevel, profLevel),
    ...extraMods,
  };
  return resolveCheck(sources, dc, ctx);
}

/**
 * Flexible skill check: allows any ability + any skill pairing.
 * e.g. Intelligence (Persuasion) — persuade with logic instead of charm.
 * e.g. Strength (Intimidation) — flex muscles to intimidate.
 */
export function rollFlexibleCheck(
  abilityScore: number,    // the ability being used (may differ from skill's default)
  skillKey: string | null, // skill being applied (null = pure ability check)
  dc: number,
  profLevel: ProficiencyLevel,
  charLevel: number,
  extraMods: Partial<SkillModifierSources> = {},
  ctx: CheckContext = {},
): CheckResult {
  return rollSkillCheck(abilityScore, skillKey || "_none", dc, profLevel, charLevel, extraMods, ctx);
}

/* ======================================================================
 * 5.3 SAVING THROW
 * ====================================================================== */

export function rollSavingThrow(
  abilityScore: number,
  isProficient: boolean,
  charLevel: number,
  dc: number,
  ctx: CheckContext = {},
): CheckResult {
  const sources: SkillModifierSources = {
    ability: mod(abilityScore),
    proficiency: isProficient ? profByLevel(charLevel) : 0,
  };
  return resolveCheck(sources, dc, ctx);
}

/* ======================================================================
 * 5.4 PASSIVE CHECK
 * ====================================================================== */

export function passiveScore(
  abilityScore: number,
  profLevel: ProficiencyLevel = "none",
  charLevel: number = 1,
  extraMods: Partial<SkillModifierSources> = {},
): number {
  const sources: SkillModifierSources = {
    ability: mod(abilityScore),
    proficiency: proficiencyBonus(charLevel, profLevel),
    ...extraMods,
  };
  return 10 + totalModifier(sources);
}

/* ======================================================================
 * 5.5 CONTESTED CHECK
 * ====================================================================== */

export function rollContestedCheck(
  modA: number, ctxA: CheckContext = {},
  modB: number, ctxB: CheckContext = {},
): CheckResult & { contestedResult: { winner: "A" | "B" | "tie"; totalA: number; totalB: number } } {
  const resultA = resolveCheck({ ability: modA, proficiency: 0 }, 0, ctxA);
  const resultB = resolveCheck({ ability: modB, proficiency: 0 }, 0, ctxB);
  let winner: "A" | "B" | "tie" = "tie";
  if (resultA.total > resultB.total) winner = "A";
  else if (resultB.total > resultA.total) winner = "B";
  return {
    ...resultA,
    total: resultA.total,
    outcome: winner === "A" ? "success" : winner === "B" ? "failure" : "partial_success",
    isSuccess: winner === "A" || winner === "tie",
    dc: resultB.total,
    contestedResult: { winner, totalA: resultA.total, totalB: resultB.total },
  };
}

/* ======================================================================
 * 5.6 GROUP CHECK
 * ====================================================================== */

export function rollGroupCheck(
  checks: Array<{ modifier: number; ctx?: CheckContext }>,
  dc: number,
): CheckResult & { groupResult: { successes: number; failures: number; total: number; groupSuccess: boolean } } {
  const results = checks.map((c) => resolveCheck({ ability: c.modifier, proficiency: 0 }, dc, c.ctx || {}));
  const successes = results.filter((r) => r.isSuccess).length;
  const failures = results.length - successes;
  const groupSuccess = successes >= Math.ceil(results.length / 2);
  return {
    ...results[0],
    outcome: groupSuccess ? "success" : "failure",
    isSuccess: groupSuccess,
    groupResult: { successes, failures, total: results.length, groupSuccess },
  };
}

/* ======================================================================
 * 5.7 HELP / TEAMWORK
 * ====================================================================== */

export function applyHelp(ctx: CheckContext): CheckContext {
  // Help action gives advantage on the next ability check
  return { ...ctx, advantage: true };
}

/* ======================================================================
 * 5.8 TOOL CHECK
 * ====================================================================== */

export function rollToolCheck(
  abilityScore: number,
  isProficient: boolean,
  charLevel: number,
  dc: number,
  ctx: CheckContext = {},
): CheckResult {
  return rollSavingThrow(abilityScore, isProficient, charLevel, dc, ctx);
}

/* ======================================================================
 * 5.9 IMPROVISED CHECK
 * ====================================================================== */

/**
 * Improvised check: DM determines which ability and optionally which skill.
 * e.g. "Use CON for an intimidation check" (stare down contest)
 * e.g. "Use INT for persuasion" (convince with logic)
 */
export function rollImprovisedCheck(
  abilityScore: number,
  ability: Ability,
  skillKey: string | null,
  dc: number,
  profLevel: ProficiencyLevel,
  charLevel: number,
  ctx: CheckContext = {},
): CheckResult & { intent: string } {
  const result = rollFlexibleCheck(abilityScore, skillKey, dc, profLevel, charLevel, {}, ctx);
  const skillName = skillKey ? SKILL_MAP[skillKey]?.name || skillKey : "raw ability";
  const intent = `${ability.toUpperCase()} (${skillName})`;
  return { ...result, intent };
}

/* ======================================================================
 * CORE RESOLVE FUNCTION
 * ====================================================================== */

function resolveCheck(sources: SkillModifierSources, dc: number, ctx: CheckContext): CheckResult {
  const total = totalModifier(sources);

  const rollCtx: RollContext = {
    advantage: ctx.advantage,
    disadvantage: ctx.disadvantage,
    bonusDice: ctx.bonusDice,
    penaltyDice: ctx.penaltyDice,
    rerollOnce: ctx.rerollOnce,
    replaceWith: ctx.replaceWith,
  };

  const result = roll(`1d20+${total}`, rollCtx);
  const die = result.naturalDie ?? 0;
  const rollTotal = result.total;

  // Determine outcome
  // NOTE: Per RAW, ability/skill/save checks do NOT auto-succeed on nat 20
  // or auto-fail on nat 1. Only attack rolls do.
  // But we track natural die for optional house rules.
  let outcome: CheckOutcome;
  if (rollTotal >= dc) {
    outcome = die === 20 ? "critical_success" : "success";
  } else {
    outcome = die === 1 ? "critical_failure" : "failure";
  }

  const isSuccess = rollTotal >= dc;

  const history = `d20(${die})${total >= 0 ? "+" : ""}${total}${result.terms.length > 1 ? " +bonus" : ""} = ${rollTotal} vs DC ${dc} → ${isSuccess ? "สำเร็จ" : "ล้มเหลว"}`;

  return {
    die,
    total: rollTotal,
    modifier: total,
    dc,
    outcome,
    isSuccess,
    history,
  };
}

/* ======================================================================
 * INTENT ANALYSIS (Step 1 of 2-step flow)
 * ====================================================================== */

export interface CheckIntent {
  action: string;             // what the player wants to do
  ability: Ability;           // which ability governs
  skill?: string;             // optional skill (can be different ability than default)
  dc: number;                 // suggested DC
  dcTier: DCTier;             // DC tier label
  checkType: "ability" | "skill" | "tool" | "contested" | "saving_throw";
  descriptionTh: string;      // Thai description of what's being checked
}

/**
 * Intent Analysis: parse a player's action description into a CheckIntent.
 * This lets the AI DM be flexible — e.g. "ใช้กำลังข่มขู่" → STR (Intimidation).
 *
 * This is a helper for the AI DM — it suggests a check, but the DM can override.
 */
export function analyzeIntent(
  actionTh: string,
  suggestDC: number = 13,
): CheckIntent {
  const lower = actionTh.toLowerCase();

  // Detect ability from keywords
  let ability: Ability = "str";
  if (/แอบ|ซ่อน|เงียบ|stealth|hide|sneak/.test(lower)) ability = "dex";
  else if (/ปีน|ยก|ดัน|พัง|ผลัก|climb|lift|push|break/.test(lower)) ability = "str";
  else if (/จำ|วิเคราะห์|คำนวณ|remember|analyze|investigate/.test(lower)) ability = "int";
  else if (/สังเกต|ฟัง|ดม|เห็น|perceive|hear|sense/.test(lower)) ability = "wis";
  else if (/พูด|โน้มน้าว|หลอก|ข่มขู่|persuade|deceive|intimidate/.test(lower)) ability = "cha";
  else if (/อดทน|ต้าน|หายใจ|endure|resist/.test(lower)) ability = "con";

  // Detect skill from keywords
  let skill: string | undefined;
  if (/แอบ|ซ่อน|เงียบ/.test(lower)) skill = "stealth";
  else if (/ปีน|กระโดด|วิ่ง/.test(lower)) skill = "athletics";
  else if (/กายกรรม|ทรงตัว|กระโดดข้าม/.test(lower)) skill = "acrobatics";
  else if (/งัด|แกะ|มือสัมผัส|sleight/.test(lower)) skill = "sleight_of_hand";
  else if (/เวทมนตร์|arcana|เสียมนตร์/.test(lower)) skill = "arcana";
  else if (/ประวัติ|history|โบราณ/.test(lower)) skill = "history";
  else if (/สืบ|ค้นหา|ตรวจสอบ|investigate/.test(lower)) skill = "investigation";
  else if (/ธรรมชาติ|nature|พืช|สัตว์/.test(lower)) skill = "nature";
  else if (/ศาสนา|religion|พระเจ้า/.test(lower)) skill = "religion";
  else if (/สัตว์|animal/.test(lower)) skill = "animal_handling";
  else if (/สังเกตใจ|insight|นึก/.test(lower)) skill = "insight";
  else if (/แพทย์|medicine|รักษา/.test(lower)) skill = "medicine";
  else if (/รับรู้|perception|เห็น|ได้ยิน/.test(lower)) skill = "perception";
  else if (/เอาชีวิตรอด|survival|ติดตามรอย/.test(lower)) skill = "survival";
  else if (/หลอก|deception|โกหก/.test(lower)) skill = "deception";
  else if (/ข่มขู่|intimidate|ขู่/.test(lower)) skill = "intimidation";
  else if (/แสดง|perform|ดนตรี/.test(lower)) skill = "performance";
  else if (/โน้มน้าว|persuade|พูดโน้ม/.test(lower)) skill = "persuasion";

  // Detect check type
  let checkType: CheckIntent["checkType"] = "ability";
  if (skill) checkType = "skill";
  if (/ต้าน|หลบ|save|resist/.test(lower)) checkType = "saving_throw";
  if (/แข่ง|contested|vs|ประลอง/.test(lower)) checkType = "contested";

  // DC tier
  let dcTier: DCTier = "medium";
  if (suggestDC <= 5) dcTier = "very_easy";
  else if (suggestDC <= 10) dcTier = "easy";
  else if (suggestDC <= 13) dcTier = "medium";
  else if (suggestDC <= 15) dcTier = "hard";
  else if (suggestDC <= 18) dcTier = "very_hard";
  else dcTier = "nearly_impossible";

  // Special: STR (Intimidation) — flex muscles to intimidate
  if (/ข่มขู่|intimidate/.test(lower) && ability === "str") {
    skill = "intimidation"; // override: use STR for Intimidation
  }
  // Special: INT (Persuasion) — use logic to persuade
  if (/โน้มน้าว|persuade/.test(lower) && ability === "int") {
    skill = "persuasion";
  }

  const skillName = skill ? SKILL_MAP[skill]?.nameTh || skill : ability.toUpperCase();
  const descriptionTh = `${ability.toUpperCase()} (${skillName}) — DC ${suggestDC} (${DC_TIERS[dcTier].nameTh})`;

  return {
    action: actionTh,
    ability,
    skill,
    dc: suggestDC,
    dcTier,
    checkType,
    descriptionTh,
  };
}
