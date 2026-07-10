/**
 * Domain 21: Exploration (การสำรวจ การเดินทาง กับดัก)
 *
 * จัดการการเล่นนอก Combat เช่น เดินทาง สำรวจ Dungeon ค้นหา สิ่งแวดล้อม และอุปสรรค
 *
 * Sub-systems:
 *  21.1 Exploration Mode  — Free/Dungeon/Travel/Investigation/Downtime
 *  21.2 Travel            — point-to-point journey
 *  21.3 Travel Pace       — Fast/Normal/Slow + effects
 *  21.4 Navigation        — Survival/Nature/Map check vs getting lost
 *  21.5 Exploration Turn  — turn-based dungeon/stealth crawl
 *  21.6 Search            — Perception/Investigation vs DC
 *  21.7 Investigation     — analyze clues
 *  21.8 Traps             — definition + detection/disarm
 *  21.9 Trap Trigger      — step/open/touch/time/condition
 * 21.10 Exploration Events — random/discovery/hazard/NPC/treasure
 *
 * Data-Driven: trap definitions, pace effects, event tables are JSON.
 */

import { rollTable } from "./diceEngine.js";

/* ======================================================================
 * 21.1 EXPLORATION MODE
 * ====================================================================== */

export type ExplorationMode =
  | "free" // open-world wander
  | "dungeon" // room-by-room
  | "travel" // overland A→B
  | "investigation" // search a scene
  | "downtime"; // between-adventure activity

export interface ExplorationState {
  mode: ExplorationMode;
  location: string;
  timeElapsedMinutes: number;
  actionsTaken: number;
  log: ExplorationLogEntry[];
}

export interface ExplorationLogEntry {
  turn: number;
  minute: number;
  action: string;
  result: string;
}

export function createExplorationState(
  mode: ExplorationMode = "free",
  location = "Unknown",
): ExplorationState {
  return {
    mode,
    location,
    timeElapsedMinutes: 0,
    actionsTaken: 0,
    log: [],
  };
}

export function logExplorationAction(
  state: ExplorationState,
  action: string,
  result: string,
  minutesSpent = 10,
): ExplorationState {
  const entry: ExplorationLogEntry = {
    turn: state.actionsTaken + 1,
    minute: state.timeElapsedMinutes,
    action,
    result,
  };
  return {
    ...state,
    timeElapsedMinutes: state.timeElapsedMinutes + minutesSpent,
    actionsTaken: state.actionsTaken + 1,
    log: [...state.log, entry],
  };
}

/* ======================================================================
 * 21.2 TRAVEL
 * ====================================================================== */

export interface TravelPlan {
  from: string;
  to: string;
  distanceMiles: number;
  route: string; // narrative description or waypoints
  speedMph: number; // base miles per hour
}

export function estimateTravelTime(plan: TravelPlan, pace: TravelPace = "normal"): {
  hours: number;
  days: number;
  milesPerDay: number;
} {
  const mult = PACE_EFFECTS[pace].speedMultiplier;
  const effectiveMph = plan.speedMph * mult;
  const hours = plan.distanceMiles / effectiveMph;
  const milesPerDay = effectiveMph * 8; // 8 hours travel/day
  return {
    hours: Math.ceil(hours),
    days: Math.ceil(hours / 8),
    milesPerDay: Math.floor(milesPerDay),
  };
}

/* ======================================================================
 * 21.3 TRAVEL PACE
 * ====================================================================== */

export type TravelPace = "fast" | "normal" | "slow";

export interface PaceEffect {
  speedMultiplier: number; // vs normal
  stealthDisadvantage: boolean; // fast pace = -5 passive; can't sneak
  detectionBonus: number; // to noticing threats
  encounterModifier: number; // +/- to encounter chance
  description: string;
}

export const PACE_EFFECTS: Record<TravelPace, PaceEffect> = {
  fast: {
    speedMultiplier: 1.33,
    stealthDisadvantage: true,
    detectionBonus: -5,
    encounterModifier: 0,
    description: "เร็ว: +33% ระยะทาง แต่ -5 ตรวจจับภัยคุกคาม",
  },
  normal: {
    speedMultiplier: 1,
    stealthDisadvantage: false,
    detectionBonus: 0,
    encounterModifier: 0,
    description: "ปกติ",
  },
  slow: {
    speedMultiplier: 0.66,
    stealthDisadvantage: false,
    detectionBonus: 0,
    encounterModifier: -1,
    description: "ช้า: สามารถ Stealth ได้ ลดโอกาส Encounter",
  },
};

/* ======================================================================
 * 21.4 NAVIGATION
 * ====================================================================== */

export type NavigationMethod = "survival" | "nature" | "map" | "tool";

export interface NavigationCheck {
  method: NavigationMethod;
  modifier: number;
  dc: number;
  advantage: boolean;
  disadvantage: boolean;
}

export function resolveNavigation(check: NavigationCheck): {
  success: boolean;
  roll: number;
  lost: boolean;
  note: string;
} {
  let roll = rollTable(20);
  if (check.advantage && !check.disadvantage) {
    const r2 = rollTable(20);
    roll = Math.max(roll, r2);
  } else if (check.disadvantage && !check.advantage) {
    const r2 = rollTable(20);
    roll = Math.min(roll, r2);
  }
  const total = roll + check.modifier;
  const success = total >= check.dc;
  return {
    success,
    roll: total,
    lost: !success,
    note: success
      ? "พบเส้นทางถูกต้อง"
      : "หลงทาง — เสียเวลาเพิ่ม 1d6 ชั่วโมง และอาจเข้าใกล้อันตราย",
  };
}

/* ======================================================================
 * 21.5 EXPLORATION TURN
 * ====================================================================== */

export interface ExplorationTurn {
  turnNumber: number;
  timePassedMinutes: number;
  actionsThisTurn: string[];
  eventsThisTurn: string[];
}

export function startExplorationTurn(state: ExplorationState): ExplorationTurn {
  return {
    turnNumber: state.actionsTaken + 1,
    timePassedMinutes: state.timeElapsedMinutes,
    actionsThisTurn: [],
    eventsThisTurn: [],
  };
}

export function advanceExplorationTurn(
  state: ExplorationState,
  turn: ExplorationTurn,
  minutesPerTurn = 10,
): ExplorationState {
  return logExplorationAction(
    state,
    turn.actionsThisTurn.join(", ") || "สำรวจ",
    turn.eventsThisTurn.join("; ") || "ไม่พบเหตุการณ์พิเศษ",
    minutesPerTurn,
  );
}

/* ======================================================================
 * 21.6 SEARCH
 * ====================================================================== */

export type SearchTarget =
  | "hidden_door"
  | "trap"
  | "treasure"
  | "secret"
  | "clue"
  | "creature";

export interface SearchAttempt {
  skill: "perception" | "investigation";
  modifier: number;
  passiveScore?: number; // if passive
  dc: number;
  advantage: boolean;
  disadvantage: boolean;
  target: SearchTarget;
}

export function resolveSearch(attempt: SearchAttempt): {
  success: boolean;
  roll: number;
  found: boolean;
  note: string;
} {
  // Passive check used when not actively searching
  if (attempt.passiveScore !== undefined) {
    const success = attempt.passiveScore >= attempt.dc;
    return {
      success,
      roll: attempt.passiveScore,
      found: success,
      note: success
        ? `Passive ${attempt.skill} ${attempt.passiveScore} ≥ DC ${attempt.dc}`
        : `Passive ${attempt.skill} ${attempt.passiveScore} < DC ${attempt.dc}`,
    };
  }
  let roll = rollTable(20);
  if (attempt.advantage && !attempt.disadvantage) {
    const r2 = rollTable(20);
    roll = Math.max(roll, r2);
  } else if (attempt.disadvantage && !attempt.advantage) {
    const r2 = rollTable(20);
    roll = Math.min(roll, r2);
  }
  const total = roll + attempt.modifier;
  const success = total >= attempt.dc;
  return {
    success,
    roll: total,
    found: success,
    note: success
      ? `พบ${targetLabel(attempt.target)}`
      : `ไม่พบ${targetLabel(attempt.target)}`,
  };
}

function targetLabel(t: SearchTarget): string {
  const map: Record<SearchTarget, string> = {
    hidden_door: "ประตูลับ",
    trap: "กับดัก",
    treasure: "สมบัติ",
    secret: "ความลับ",
    clue: "เบาะแส",
    creature: "สิ่งมีชีวิต",
  };
  return map[t];
}

/* ======================================================================
 * 21.7 INVESTIGATION
 * ====================================================================== */

export interface InvestigationClue {
  id: string;
  description: string;
  insightDC: number;
  revealed: boolean;
  insight?: string; // shown when DC met
}

export function investigateClue(clue: InvestigationClue, modifier: number): {
  revealed: boolean;
  roll: number;
  insight?: string;
} {
  const roll = rollTable(20) + modifier;
  const revealed = roll >= clue.insightDC;
  return {
    revealed,
    roll,
    insight: revealed ? clue.insight : undefined,
  };
}

/* ======================================================================
 * 21.8 TRAPS
 * ====================================================================== */

export interface TrapDefinition {
  id: string;
  name: string;
  description: string;
  trigger: TrapTriggerType;
  detectionDC: number; // Perception/Investigation to find
  disableDC: number; // Thieves' Tools / similar
  effect: TrapEffect;
  damage?: string; // dice string e.g. "2d6+3"
  damageType?: string;
  save?: { ability: "dex" | "str" | "con" | "wis"; dc: number };
  CR?: string;
}

export interface TrapEffect {
  type: "damage" | "condition" | "relocate" | "alarm" | "combined";
  condition?: string;
  conditionDuration?: number; // rounds
  relocateFeet?: number;
  alarmRadius?: number; // feet — alerts enemies
}

/* ======================================================================
 * 21.9 TRAP TRIGGER
 * ====================================================================== */

export type TrapTriggerType =
  | "step_on"
  | "open"
  | "touch"
  | "time"
  | "condition";

export function isTrapTriggered(
  trap: TrapDefinition,
  context: { action?: string; steppedOn?: boolean; opened?: boolean; touched?: boolean; timeTriggered?: boolean },
): { triggered: boolean; reason?: string } {
  switch (trap.trigger) {
    case "step_on":
      return context.steppedOn
        ? { triggered: true, reason: "เหยียบจุดทำงาน" }
        : { triggered: false };
    case "open":
      return context.opened
        ? { triggered: true, reason: "เปิด/ขยับกลไก" }
        : { triggered: false };
    case "touch":
      return context.touched
        ? { triggered: true, reason: "สัมผัสวัตถุ" }
        : { triggered: false };
    case "time":
      return context.timeTriggered
        ? { triggered: true, reason: "หมดเวลา" }
        : { triggered: false };
    case "condition":
      return { triggered: false, reason: "เงื่อนไขพิเศษ ต้องตรวจสอบแยก" };
  }
}

export function detectTrap(trap: TrapDefinition, perceptionMod: number, passive = false): {
  detected: boolean;
  roll: number;
} {
  if (passive) {
    return {
      detected: 10 + perceptionMod >= trap.detectionDC,
      roll: 10 + perceptionMod,
    };
  }
  const roll = rollTable(20) + perceptionMod;
  return { detected: roll >= trap.detectionDC, roll };
}

export function disableTrap(trap: TrapDefinition, toolMod: number): {
  success: boolean;
  roll: number;
  triggered?: boolean; // fail by 5+ may trigger
} {
  const roll = rollTable(20) + toolMod;
  const success = roll >= trap.disableDC;
  return {
    success,
    roll,
    triggered: !success && roll < trap.disableDC - 5,
  };
}

/* ======================================================================
 * 21.10 EXPLORATION EVENTS
 * ====================================================================== */

export type ExplorationEventType =
  | "random_encounter"
  | "discovery"
  | "hazard"
  | "npc_encounter"
  | "treasure"
  | "nothing";

export interface ExplorationEventEntry {
  type: ExplorationEventType;
  weight: number;
  description: string;
}

export const DEFAULT_EVENT_TABLE: ExplorationEventEntry[] = [
  { type: "nothing", weight: 50, description: "เดินทางเรียบร้อย" },
  { type: "discovery", weight: 15, description: "พบสถานที่น่าสนใจ" },
  { type: "random_encounter", weight: 15, description: "พบสัตว์/ศัตรู" },
  { type: "npc_encounter", weight: 8, description: "พบ NPC" },
  { type: "hazard", weight: 7, description: "อันตรายจากธรรมชาติ" },
  { type: "treasure", weight: 5, description: "พบสมบัติเล็ก ๆ" },
];

export function rollExplorationEvent(
  table: ExplorationEventEntry[] = DEFAULT_EVENT_TABLE,
  pace: TravelPace = "normal",
): ExplorationEventEntry {
  const modified = table.map((e) => ({
    ...e,
    weight: e.type === "random_encounter"
      ? Math.max(1, e.weight + PACE_EFFECTS[pace].encounterModifier * 5)
      : e.weight,
  }));
  const total = modified.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of modified) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return modified[0];
}

/* ======================================================================
 * FACTORY + HELPERS
 * ====================================================================== */

export function createTrapFromDefinition(def: TrapDefinition): TrapDefinition {
  return { ...def };
}

export function summarizeExploration(state: ExplorationState): string {
  const hours = Math.floor(state.timeElapsedMinutes / 60);
  const mins = state.timeElapsedMinutes % 60;
  return `โหมด ${state.mode} | สถานที่ ${state.location} | เวลา ${hours}ชม. ${mins}น. | การกระทำ ${state.actionsTaken}`;
}
