/**
 * Phase 5 — Solo Oracle Engine.
 *
 * A GM-emulator "oracle" for solo play: lets a lone player resolve narrative
 * uncertainty WITHOUT the LLM DM. Inspired by Mythic GME's Fate Chart + Meaning
 * tables, but self-contained and deterministic.
 *
 * HARD RULE: every function here is pure. NO Math.random / Date.now inside the
 * decision logic — callers inject a d100 roll (1-100) or a numeric seed, and a
 * small deterministic PRNG (mulberry32) turns a seed into rolls. This makes the
 * whole oracle unit-testable and reproducible.
 *
 *   askOracle(likelihood, roll)          -> yes/no with and/but + random-event flag
 *   askOracleSeeded(likelihood, seed)    -> same, seed-driven
 *   rollRandomEvent(focusRoll, ...)      -> event focus + meaning (action/subject)
 *   rollMeaning(actionRoll, themeRoll)   -> two-word inspiration prompt
 *   checkRandomEncounter(chance, roll)   -> exploration encounter gate
 */

/* ======================================================================
 * DETERMINISTIC PRNG (seed -> rolls). Only used when a caller passes a seed
 * instead of an explicit roll; the core decision fns never call it implicitly.
 * ====================================================================== */

/** mulberry32 — tiny deterministic PRNG. Returns a fn yielding floats in [0,1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roll an integer in [1, sides] from a seeded PRNG fn (advances the stream). */
export function rngInt(rng: () => number, sides: number): number {
  return Math.floor(rng() * sides) + 1;
}

/* ======================================================================
 * YES/NO ORACLE
 * ====================================================================== */

/** How likely a "yes" is, before the roll. Drives the yes-threshold. */
export type Likelihood =
  | "certain"
  | "likely"
  | "50-50"
  | "unlikely"
  | "impossible";

/** The six graded oracle answers (Mythic-style extremes). */
export type OracleAnswer =
  | "yes-and" // yes, and something extra in your favor
  | "yes"
  | "yes-but" // yes, but with a complication
  | "no-but" // no, but a small consolation
  | "no"
  | "no-and"; // no, and it gets worse

export interface OracleResult {
  answer: OracleAnswer;
  affirmative: boolean; // true for any yes-*
  roll: number; // the d100 used (1-100)
  likelihood: Likelihood;
  yesChance: number; // threshold that was applied
  randomEvent: boolean; // doubles → a random event interrupts the scene
  /** Thai label suitable for surfacing straight into the game log. */
  label: string;
}

/** d100 threshold: roll <= yesChance ⇒ yes. */
export const YES_CHANCE: Record<Likelihood, number> = {
  certain: 90,
  likely: 75,
  "50-50": 50,
  unlikely: 25,
  impossible: 10,
};

export const LIKELIHOOD_ORDER: Likelihood[] = [
  "certain",
  "likely",
  "50-50",
  "unlikely",
  "impossible",
];

const ANSWER_LABELS: Record<OracleAnswer, string> = {
  "yes-and": "ใช่ และยิ่งกว่านั้น",
  yes: "ใช่",
  "yes-but": "ใช่ แต่มีข้อแม้",
  "no-but": "ไม่ แต่ยังมีทางออก",
  no: "ไม่",
  "no-and": "ไม่ และแย่ลงไปอีก",
};

/** A "doubles" roll (11,22,…,99,100) signals a random event, Mythic-style. */
export function isRandomEventRoll(roll: number): boolean {
  if (roll === 100) return true;
  return roll >= 11 && roll <= 99 && roll % 11 === 0;
}

/**
 * Ask the oracle a yes/no question.
 * @param likelihood how likely a "yes" is
 * @param roll a d100 result (1-100). Lower rolls trend toward "yes".
 */
export function askOracle(likelihood: Likelihood, roll: number): OracleResult {
  const r = clampRoll(roll, 100);
  const yesChance = YES_CHANCE[likelihood];
  // width of the "extreme" band at each end (min 1)
  const yesBand = Math.max(1, Math.floor(yesChance / 5));
  const noBand = Math.max(1, Math.floor((100 - yesChance) / 5));

  let answer: OracleAnswer;
  if (r <= yesChance) {
    // affirmative
    if (r <= yesBand) answer = "yes-and";
    else if (r > yesChance - yesBand) answer = "yes-but";
    else answer = "yes";
  } else {
    // negative
    if (r >= 100 - noBand + 1) answer = "no-and";
    else if (r <= yesChance + noBand) answer = "no-but";
    else answer = "no";
  }

  return {
    answer,
    affirmative: answer.startsWith("yes"),
    roll: r,
    likelihood,
    yesChance,
    randomEvent: isRandomEventRoll(r),
    label: ANSWER_LABELS[answer],
  };
}

/** Seed-driven variant — deterministic given the same seed. */
export function askOracleSeeded(likelihood: Likelihood, seed: number): OracleResult {
  const rng = makeRng(seed);
  return askOracle(likelihood, rngInt(rng, 100));
}

/* ======================================================================
 * RANDOM EVENT — focus + meaning
 * ====================================================================== */

export type EventFocus =
  | "remote_event"
  | "npc_action"
  | "new_npc"
  | "move_toward_thread"
  | "move_away_thread"
  | "close_a_thread"
  | "pc_negative"
  | "pc_positive"
  | "ambiguous_event";

interface FocusEntry {
  max: number; // upper bound on a d100 roll (inclusive)
  focus: EventFocus;
  label: string;
}

/** Weighted d100 event-focus table (Mythic-inspired distribution). */
export const EVENT_FOCUS_TABLE: FocusEntry[] = [
  { max: 7, focus: "remote_event", label: "เหตุการณ์ไกลตัว" },
  { max: 28, focus: "npc_action", label: "NPC ลงมือทำบางอย่าง" },
  { max: 35, focus: "new_npc", label: "NPC ใหม่ปรากฏตัว" },
  { max: 45, focus: "move_toward_thread", label: "เรื่องราวคืบหน้า" },
  { max: 52, focus: "move_away_thread", label: "เรื่องราวถอยหลัง" },
  { max: 55, focus: "close_a_thread", label: "ปมเรื่องถูกปิด" },
  { max: 67, focus: "pc_negative", label: "เรื่องร้ายกับตัวละคร" },
  { max: 75, focus: "pc_positive", label: "เรื่องดีกับตัวละคร" },
  { max: 100, focus: "ambiguous_event", label: "เหตุการณ์กำกวม" },
];

export interface RandomEvent {
  focus: EventFocus;
  focusLabel: string;
  focusRoll: number;
  meaning: MeaningResult;
}

export function rollEventFocus(roll: number): FocusEntry {
  const r = clampRoll(roll, 100);
  for (const e of EVENT_FOCUS_TABLE) {
    if (r <= e.max) return e;
  }
  return EVENT_FOCUS_TABLE[EVENT_FOCUS_TABLE.length - 1];
}

/**
 * Roll a full random event: a focus plus a two-word meaning prompt.
 * @param focusRoll d100 for the focus
 * @param actionRoll roll into the ACTION table (1-100)
 * @param themeRoll roll into the SUBJECT/theme table (1-100)
 */
export function rollRandomEvent(
  focusRoll: number,
  actionRoll: number,
  themeRoll: number,
): RandomEvent {
  const f = rollEventFocus(focusRoll);
  return {
    focus: f.focus,
    focusLabel: f.label,
    focusRoll: clampRoll(focusRoll, 100),
    meaning: rollMeaning(actionRoll, themeRoll),
  };
}

/* ======================================================================
 * MEANING TABLES — inspiration prompts (Action + Subject)
 * ====================================================================== */

/** Verbs — "what happens". 100-entry feel compressed into a representative set. */
export const ACTION_MEANINGS: string[] = [
  "โจมตี", "ปกป้อง", "หลอกลวง", "ช่วยเหลือ", "ขัดขวาง", "เปิดเผย", "ซ่อนเร้น",
  "ล่อลวง", "ทรยศ", "มอบให้", "ขโมย", "ทำลาย", "สร้าง", "ค้นหา", "หลบหนี",
  "ไล่ตาม", "เจรจา", "ข่มขู่", "ปลอบโยน", "ท้าทาย", "ยอมจำนน", "เฝ้ารอ",
  "เร่งรีบ", "หยุดยั้ง", "ปลดปล่อย", "จองจำ", "รักษา", "ทำร้าย", "เชื่อมโยง", "แบ่งแยก",
];

/** Nouns/themes — "about what". */
export const SUBJECT_MEANINGS: string[] = [
  "อันตราย", "สมบัติ", "พันธมิตร", "ศัตรู", "ความลับ", "อดีต", "อนาคต",
  "อำนาจ", "ความตาย", "ความรัก", "การทรยศ", "โชคชะตา", "ธรรมชาติ", "เวทมนตร์",
  "ศาสนา", "การเดินทาง", "บ้านเกิด", "ความกลัว", "ความหวัง", "หนี้สิน",
  "ข่าวสาร", "อาวุธ", "ประตู", "เส้นทาง", "คำสาป", "พร", "ผู้นำ", "ฝูงชน",
  "สัตว์ร้าย", "วิญญาณ",
];

export interface MeaningResult {
  action: string;
  subject: string;
  actionRoll: number;
  subjectRoll: number;
  /** e.g. "เปิดเผย · ความลับ" — a compact two-word idea seed. */
  prompt: string;
}

/** Map a 1-100 roll onto a table by proportion (so tables can be any length). */
function pickFromTable<T>(table: T[], roll: number): { value: T; index: number } {
  const r = clampRoll(roll, 100);
  const index = Math.min(table.length - 1, Math.floor(((r - 1) / 100) * table.length));
  return { value: table[index], index };
}

export function rollMeaning(actionRoll: number, subjectRoll: number): MeaningResult {
  const a = pickFromTable(ACTION_MEANINGS, actionRoll);
  const s = pickFromTable(SUBJECT_MEANINGS, subjectRoll);
  return {
    action: a.value,
    subject: s.value,
    actionRoll: clampRoll(actionRoll, 100),
    subjectRoll: clampRoll(subjectRoll, 100),
    prompt: `${a.value} · ${s.value}`,
  };
}

/** Seed-driven meaning prompt (two consecutive rolls off one seed). */
export function rollMeaningSeeded(seed: number): MeaningResult {
  const rng = makeRng(seed);
  return rollMeaning(rngInt(rng, 100), rngInt(rng, 100));
}

/* ======================================================================
 * RANDOM ENCOUNTER GATE (for exploration/travel turns)
 * ====================================================================== */

export interface EncounterCheck {
  triggered: boolean;
  roll: number; // d20
  chance: number; // 1..20 threshold (roll <= chance ⇒ encounter)
}

/**
 * Roll to see if a random encounter occurs on an exploration/travel turn.
 * @param chanceOutOf20 how many faces of a d20 count as "encounter" (e.g. 3 = 15%)
 * @param roll a d20 result (1-20)
 */
export function checkRandomEncounter(chanceOutOf20: number, roll: number): EncounterCheck {
  const chance = Math.max(0, Math.min(20, Math.floor(chanceOutOf20)));
  const r = clampRoll(roll, 20);
  return { triggered: r <= chance, roll: r, chance };
}

/* ======================================================================
 * HELPERS
 * ====================================================================== */

function clampRoll(roll: number, sides: number): number {
  if (!Number.isFinite(roll)) return 1;
  const n = Math.round(roll);
  if (n < 1) return 1;
  if (n > sides) return sides;
  return n;
}
