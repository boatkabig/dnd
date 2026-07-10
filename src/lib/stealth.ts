/**
 * Stealth & Detection System — ซ่อนตัวและตรวจพบ (19.1–19.7)
 */

import { roll } from "./diceEngine";
import { detectWithPassive, detectWithActive, type DetectionResult } from "./vision";

/* ======================================================================
 * 19.1 HIDE — check if character can hide
 * ====================================================================== */

export interface HideCheck {
  canHide: boolean;
  reasonTh: string;
  hasCover: boolean;
  isObscured: boolean;
  outOfSight: boolean;
}

export function canHide(
  hasCover: boolean,
  isObscured: boolean,     // dim light, fog, etc.
  outOfSight: boolean,     // completely behind a wall
  conditions: string[] = [],
): HideCheck {
  // Can't hide if visible to enemies and no cover/obscurement
  if (!hasCover && !isObscured && !outOfSight) {
    return { canHide: false, reasonTh: "ต้องมีที่กำบัง, ความมืด หรืออยู่นอกสายตา", hasCover, isObscured, outOfSight };
  }
  // Invisible creatures can always try to hide (for Stealth vs perception)
  if (conditions.includes("invisible")) {
    return { canHide: true, reasonTh: "ล่องหน — ซ่อนได้ทุกที่", hasCover, isObscured, outOfSight };
  }
  return { canHide: true, reasonTh: "มีที่กำบัง/ความมืด — ซ่อนได้", hasCover, isObscured, outOfSight };
}

/* ======================================================================
 * 19.2 STEALTH CHECK
 * ====================================================================== */

export interface StealthResult {
  roll: number;            // d20 + DEX + proficiency
  die: number;
  success: boolean;
  descriptionTh: string;
}

export function rollStealth(
  dexMod: number,
  proficient: boolean = false,
  charLevel: number = 1,
  advantage: boolean = false,
  disadvantage: boolean = false,
  passivePerceptions: { name: string; score: number }[] = [],
): StealthResult {
  const prof = proficient ? Math.ceil(charLevel / 4) + 1 : 0;
  const modifier = dexMod + prof;
  const adv = advantage && !disadvantage ? "advantage" : disadvantage && !advantage ? "disadvantage" : "none";
  const result = roll(`1d20+${modifier}`, { advantage: adv === "advantage", disadvantage: adv === "disadvantage" });
  const total = result.total;
  const die = result.naturalDie ?? 0;

  // Check against highest passive perception
  const highest = Math.max(...passivePerceptions.map((p) => p.score), 0);
  const success = total > highest;

  const detectedBy = passivePerceptions.filter((p) => p.score >= total).map((p) => p.name);

  return {
    roll: total,
    die,
    success,
    descriptionTh: success
      ? `Stealth: d20(${die})+${modifier}=${total} > Passive Perception ${highest} → ซ่อนสำเร็จ!`
      : `Stealth: d20(${die})+${modifier}=${total} ≤ Passive Perception ${highest} → ถูกตรวจพบ${detectedBy.length > 0 ? ` โดย ${detectedBy.join(", ")}` : ""}`,
  };
}

/* ======================================================================
 * 19.3 HIDDEN STATE
 * ====================================================================== */

export interface HiddenState {
  isHidden: boolean;
  hiddenFrom: string[];      // uids of creatures that can't see this character
  lastKnownPosition?: { x: number; y: number };
  stealthRoll: number;       // the stealth roll to beat passive perception
  hiddenSinceRound: number;
}

export function createHiddenState(stealthRoll: number, round: number): HiddenState {
  return { isHidden: true, hiddenFrom: [], stealthRoll, hiddenSinceRound: round };
}

export function revealHidden(state: HiddenState, reasonTh: string): HiddenState {
  return { ...state, isHidden: false, hiddenFrom: [] };
}

export function updateHiddenFrom(
  state: HiddenState,
  creatures: { uid: string; passivePerception: number }[],
): HiddenState {
  const hiddenFrom = creatures
    .filter((c) => c.passivePerception < state.stealthRoll)
    .map((c) => c.uid);
  return { ...state, hiddenFrom };
}

/* ======================================================================
 * 19.4 DETECTION — active search
 * ====================================================================== */

export function activeSearch(
  perceptionRoll: number,
  stealthRoll: number,
  searcherName: string = "ผู้ค้นหา",
  targetName: string = "เป้าหมาย",
): DetectionResult {
  return detectWithActive(perceptionRoll, stealthRoll, stealthRoll);
}

/* ======================================================================
 * 19.5 INVISIBILITY vs HIDDEN
 * ====================================================================== */

export function isInvisible(conditions: string[]): boolean {
  return conditions.includes("invisible");
}

export function isHidden(hiddenState: HiddenState | null): boolean {
  return hiddenState?.isHidden ?? false;
}

/**
 * Invisible + Hidden = very hard to detect
 * Invisible but not Hidden = can be detected by sound (hearing) but not sight
 * Hidden but not Invisible = detected if passive perception beats stealth
 */
export function getDetectionDifficulty(
  invisible: boolean,
  hidden: boolean,
): { difficulty: "normal" | "hard" | "very_hard"; reasonTh: string } {
  if (invisible && hidden) return { difficulty: "very_hard", reasonTh: "ล่องหน + ซ่อน — ตรวจพบยากมาก" };
  if (invisible) return { difficulty: "hard", reasonTh: "ล่องหน — ตรวจพบยาก (ต้องพึ่งเสียง/สัมผัส)" };
  if (hidden) return { difficulty: "hard", reasonTh: "ซ่อน — ต้องเทียบกับ Stealth" };
  return { difficulty: "normal", reasonTh: "มองเห็นปกติ" };
}

/* ======================================================================
 * 19.6 SURPRISE FROM STEALTH
 * ====================================================================== */

export function checkSurprise(
  stealthRoll: number,
  passivePerception: number,
): { surprised: boolean; reasonTh: string } {
  const surprised = stealthRoll > passivePerception;
  return {
    surprised,
    reasonTh: surprised
      ? `Stealth ${stealthRoll} > Passive Perception ${passivePerception} → ศัตรูไม่ทันตั้งตัว! (Surprise Round)`
      : `Stealth ${stealthRoll} ≤ Passive Perception ${passivePerception} → ศัตรูตื่นตัว`,
  };
}

/* ======================================================================
 * 19.7 TRACKING
 * ====================================================================== */

export interface TrackResult {
  success: boolean;
  roll: number;
  dc: number;
  descriptionTh: string;
}

export function rollTracking(
  survivalMod: number,
  dc: number = 15,
  advantage: boolean = false,
): TrackResult {
  const result = roll(`1d20+${survivalMod}`, { advantage });
  const success = result.total >= dc;
  return {
    success,
    roll: result.total,
    dc,
    descriptionTh: success
      ? `Survival: d20(${result.naturalDie})+${survivalMod}=${result.total} vs DC ${dc} → ติดตามร่องรอยพบ!`
      : `Survival: d20(${result.naturalDie})+${survivalMod}=${result.total} vs DC ${dc} → สูญเสียร่องรอย`,
  };
}

/* ======================================================================
 * STEALTH MODIFIERS — from equipment, conditions, environment
 * ====================================================================== */

export function getStealthModifiers(
  conditions: string[],
  equipmentTags: string[] = [],
  weatherStealthBonus: number = 0,
): { total: number; breakdown: string } {
  let total = 0;
  const parts: string[] = [];

  // Disadvantage from conditions
  if (conditions.includes("poisoned")) { total -= 2; parts.push("Poisoned -2"); }
  if (conditions.includes("frightened")) { total -= 2; parts.push("Frightened -2"); }

  // Heavy armor disadvantage
  if (equipmentTags.includes("heavy_armor")) { total -= 2; parts.push("Heavy armor -2"); }

  // Weather bonus (rain/storm noise)
  if (weatherStealthBonus > 0) { total += weatherStealthBonus; parts.push(`Weather +${weatherStealthBonus}`); }

  return { total, breakdown: parts.join(", ") || "none" };
}
