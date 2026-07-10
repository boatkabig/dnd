/**
 * Domain 23: Rest & Recovery (การพักและฟื้นฟู)
 *
 * จัดการการพัก การฟื้นทรัพยากร และผลหลังพัก
 *
 * Sub-systems:
 *  23.1 Rest Type         — Short / Long
 *  23.2 Short Rest        — Hit Dice + resource recovery, duration
 *  23.3 Long Rest         — HP, spell slots, feature uses restored
 *  23.4 Rest Requirement  — safe location / interrupt / duration
 *  23.5 Rest Interruption — combat / encounter / environment
 *  23.6 Recovery Rules    — HP / spell slot / feature / resource
 *  23.7 Downtime          — crafting / training / research / work
 *
 * Delegates actual HP/Resource mutation to character/resources modules.
 * This module computes the *result* of a rest; callers apply it.
 */

import { rollTable } from "./diceEngine.js";

/* ======================================================================
 * 23.1 REST TYPE
 * ====================================================================== */

export type RestType = "short" | "long";

export interface RestDefinition {
  type: RestType;
  defaultDurationMinutes: number;
  maxPerDay: number;
  requirements: RestRequirement;
}

export const REST_DEFINITIONS: Record<RestType, RestDefinition> = {
  short: {
    type: "short",
    defaultDurationMinutes: 60,
    maxPerDay: 0, // unlimited
    requirements: { safeLocation: false, minDurationMinutes: 60 },
  },
  long: {
    type: "long",
    defaultDurationMinutes: 480,
    maxPerDay: 1,
    requirements: { safeLocation: true, minDurationMinutes: 480 },
  },
};

/* ======================================================================
 * 23.2 SHORT REST
 * ====================================================================== */

export interface ShortRestInput {
  hitDiceAvailable: number;
  hitDiceSize: number; // d6/d8/d10/d12
  constitutionModifier: number;
  featuresWithShortRestRecharge: Array<{ id: string; usesMax: number; usesCurrent: number }>;
  resourcesWithShortRestRecharge: Array<{ id: string; usesMax: number; usesCurrent: number }>;
}

export interface ShortRestResult {
  hpRecovered: number;
  hitDiceSpent: number;
  hitDiceRemaining: number;
  featuresRestored: Array<{ id: string; restored: number }>;
  resourcesRestored: Array<{ id: string; restored: number }>;
}

export function performShortRest(
  input: ShortRestInput,
  hitDiceToSpend: number,
): ShortRestResult {
  const spend = Math.min(hitDiceToSpend, input.hitDiceAvailable);
  let hpRecovered = 0;
  for (let i = 0; i < spend; i++) {
    const heal = rollTable(input.hitDiceSize) + input.constitutionModifier;
    hpRecovered += Math.max(0, heal);
  }
  return {
    hpRecovered,
    hitDiceSpent: spend,
    hitDiceRemaining: input.hitDiceAvailable - spend,
    featuresRestored: input.featuresWithShortRestRecharge.map((f) => ({
      id: f.id,
      restored: f.usesMax - f.usesCurrent,
    })),
    resourcesRestored: input.resourcesWithShortRestRecharge.map((r) => ({
      id: r.id,
      restored: r.usesMax - r.usesCurrent,
    })),
  };
}

/* ======================================================================
 * 23.3 LONG REST
 * ====================================================================== */

export interface LongRestInput {
  currentHP: number;
  maxHP: number;
  hitDiceAvailable: number;
  hitDiceMax: number;
  constitutionModifier: number;
  spellSlots: Array<{ level: number; max: number; current: number }>;
  featuresWithLongRestRecharge: Array<{ id: string; usesMax: number; usesCurrent: number }>;
  resourcesWithLongRestRecharge: Array<{ id: string; usesMax: number; usesCurrent: number }>;
  exhaustionLevel?: number;
}

export interface LongRestResult {
  hpRecovered: number;
  hpNow: number;
  hitDiceRecovered: number;
  hitDiceNow: number;
  spellSlotsRestored: Array<{ level: number; restored: number }>;
  featuresRestored: Array<{ id: string; restored: number }>;
  resourcesRestored: Array<{ id: string; restored: number }>;
  exhaustionReduced: number;
}

export function performLongRest(input: LongRestInput): LongRestResult {
  const hpRecovered = input.maxHP - input.currentHP;
  const hpNow = input.maxHP;
  const hitDiceRecovered = Math.max(1, Math.floor(input.hitDiceMax / 2));
  const hitDiceNow = Math.min(input.hitDiceMax, input.hitDiceAvailable + hitDiceRecovered);
  const exhaustionReduced = input.exhaustionLevel ? Math.min(1, input.exhaustionLevel) : 0;
  return {
    hpRecovered,
    hpNow,
    hitDiceRecovered,
    hitDiceNow,
    spellSlotsRestored: input.spellSlots.map((s) => ({
      level: s.level,
      restored: s.max - s.current,
    })),
    featuresRestored: input.featuresWithLongRestRecharge.map((f) => ({
      id: f.id,
      restored: f.usesMax - f.usesCurrent,
    })),
    resourcesRestored: input.resourcesWithLongRestRecharge.map((r) => ({
      id: r.id,
      restored: r.usesMax - r.usesCurrent,
    })),
    exhaustionReduced,
  };
}

/* ======================================================================
 * 23.4 REST REQUIREMENT
 * ====================================================================== */

export interface RestRequirement {
  safeLocation?: boolean;
  minDurationMinutes: number;
  foodRequired?: boolean;
  waterRequired?: boolean;
}

export function canRest(
  type: RestType,
  context: {
    locationSafe: boolean;
    durationMinutes: number;
    hasFood?: boolean;
    hasWater?: boolean;
  },
): { canRest: boolean; reasons: string[] } {
  const def = REST_DEFINITIONS[type];
  const reasons: string[] = [];
  if (def.requirements.safeLocation && !context.locationSafe) {
    reasons.push("ต้องการสถานที่ปลอดภัย");
  }
  if (context.durationMinutes < def.requirements.minDurationMinutes) {
    reasons.push(`ต้องพักอย่างน้อย ${def.requirements.minDurationMinutes} นาที`);
  }
  if (def.requirements.foodRequired && !context.hasFood) {
    reasons.push("ต้องการอาหาร");
  }
  if (def.requirements.waterRequired && !context.hasWater) {
    reasons.push("ต้องการน้ำ");
  }
  return { canRest: reasons.length === 0, reasons };
}

/* ======================================================================
 * 23.5 REST INTERRUPTION
 * ====================================================================== */

export type RestInterruptionType = "combat" | "encounter" | "environment";

export interface RestInterruption {
  type: RestInterruptionType;
  description: string;
  durationLostMinutes: number;
  cancelsRest: boolean; // if 1+ hour of activity or combat > 1 round
}

export function applyInterruption(
  restType: RestType,
  interruption: RestInterruption,
): { mustRestart: boolean; note: string } {
  // Adventurers can take 1 hour of light activity; combat breaks a long rest if > 1 hr
  const cancels = interruption.cancelsRest || restType === "long" && interruption.type === "combat";
  return {
    mustRestart: cancels,
    note: cancels
      ? `ถูกขัดขวาง (${interruption.description}) — ต้องเริ่มพักใหม่`
      : `ขัดขวางเล็กน้อย (${interruption.description}) — เพิ่มเวลา ${interruption.durationLostMinutes} นาที`,
  };
}

/* ======================================================================
 * 23.6 RECOVERY RULES
 * ====================================================================== */

export interface RecoveryPolicy {
  hpShortRest?: "hit_dice" | "none";
  hpLongRest?: "full" | "half";
  hitDiceLongRest?: "half_max" | "quarter_max" | "none";
  spellSlotsLongRest?: "all" | "none" | "warlock_pact";
  featureUsesShortRest?: "all" | "none";
  featureUsesLongRest?: "all" | "none";
  exhaustionLongRest?: "reduce_one" | "none";
}

export const DEFAULT_RECOVERY: RecoveryPolicy = {
  hpShortRest: "hit_dice",
  hpLongRest: "full",
  hitDiceLongRest: "half_max",
  spellSlotsLongRest: "all",
  featureUsesShortRest: "all",
  featureUsesLongRest: "all",
  exhaustionLongRest: "reduce_one",
};

/* ======================================================================
 * 23.7 DOWNTIME
 * ====================================================================== */

export type DowntimeActivity = "crafting" | "training" | "research" | "work" | "recuperating" | "carousing";

export interface DowntimePlan {
  activity: DowntimeActivity;
  days: number;
  inputGold?: number;
  toolModifier?: number;
}

export interface DowntimeResult {
  activity: DowntimeActivity;
  daysSpent: number;
  goldEarned?: number;
  goldSpent?: number;
  itemsCrafted?: string[];
  xpGained?: number;
  notes: string;
}

export function resolveDowntime(plan: DowntimePlan): DowntimeResult {
  switch (plan.activity) {
    case "work":
      return {
        activity: "work",
        daysSpent: plan.days,
        goldEarned: plan.days * 2, // 2 gp/day lifestyle wages
        notes: `ทำงาน ${plan.days} วัน ได้ ${plan.days * 2} gp`,
      };
    case "crafting": {
      const itemsCrafted: string[] = [];
      const progressPerDay = 5; // 5 gp/day of progress
      const totalProgress = progressPerDay * plan.days + (plan.toolModifier ?? 0);
      return {
        activity: "crafting",
        daysSpent: plan.days,
        goldSpent: plan.inputGold,
        itemsCrafted,
        notes: `คราฟต์ความคืบหน้า ${totalProgress} gp`,
      };
    }
    case "training":
      return {
        activity: "training",
        daysSpent: plan.days,
        xpGained: plan.days * 5,
        notes: `ฝึกฝน ${plan.days} วัน ได้ XP ${plan.days * 5}`,
      };
    case "research": {
      const roll = rollTable(20) + (plan.toolModifier ?? 0);
      return {
        activity: "research",
        daysSpent: plan.days,
        notes: `วิจัย ${plan.days} วัน — Intelligence check ${roll}`,
      };
    }
    case "recuperating":
      return {
        activity: "recuperating",
        daysSpent: plan.days,
        notes: `พักฟื้น ${plan.days} วัน — ลด Exhaustion 1 ระดับ`,
      };
    case "carousing": {
      const goldSpent = plan.days * 10;
      return {
        activity: "carousing",
        daysSpent: plan.days,
        goldSpent,
        notes: `เลี้ยงฉลอง ${plan.days} วัน ใช้ ${goldSpent} gp`,
      };
    }
  }
}
