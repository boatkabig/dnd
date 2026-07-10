/**
 * Conditions System — D&D 5e standard conditions ONLY.
 *
 * Conditions are standardized states defined by the rules (Prone, Poisoned, Stunned, etc.)
 * Buffs/Debuffs like Bless, Haste, Hex are NOT conditions — they live in Effects System.
 *
 * Architecture:
 *   Spell/Feature/Item → Effect Engine → (may apply) → Condition → Character State
 *
 * 10 sub-systems:
 *   7.1 Apply    7.5 Source      7.9 Effects
 *   7.2 Remove   7.6 Immunity    7.10 Events
 *   7.3 Active   7.7 Interaction
 *   7.4 Duration 7.8 Standard
 */

/* ======================================================================
 * 7.8 STANDARD CONDITIONS (D&D 5e — all 15)
 * ====================================================================== */

export type ConditionId =
  | "blinded" | "charmed" | "deafened" | "exhaustion" | "frightened"
  | "grappled" | "incapacitated" | "invisible" | "paralyzed" | "petrified"
  | "poisoned" | "prone" | "restrained" | "stunned" | "unconscious";

export interface ConditionDef {
  id: ConditionId;
  name: string;
  nameTh: string;
  description: string;
  descriptionTh: string;
  // 7.9 Condition Effects — what this condition does mechanically
  attackDisadvantage?: boolean;       // your attacks have disadvantage
  attackAdvantageAgainstYou?: boolean; // attacks against you have advantage
  checkDisadvantage?: boolean;         // ability checks have disadvantage
  saveDisadvantage?: { abilities: string[] }; // specific saves have disadvantage
  speedMultiplier?: number;            // 0 = can't move, 0.5 = half speed
  incapacitates?: boolean;             // can't take actions/reactions
  autoFailSaves?: string[];           // abilities whose saves auto-fail
  autoFailChecks?: string[];          // abilities whose checks auto-fail
  dropsConcentration?: boolean;        // drops concentration when applied
  cannotSpeak?: boolean;
  cannotMove?: boolean;
  fallsProne?: boolean;                // automatically falls prone
  // 7.7 Condition Interaction
  stacks?: boolean;                    // can this be applied multiple times?
  replaces?: ConditionId[];            // replaces these conditions when applied
  cancels?: ConditionId[];             // cancels these conditions when applied
  // 7.4 Duration defaults
  defaultDurationType?: "instant" | "until_end_of_turn" | "until_start_of_turn" | "rounds" | "minutes" | "concentration" | "permanent";
}

export const STANDARD_CONDITIONS: Record<ConditionId, ConditionDef> = {
  blinded: {
    id: "blinded", name: "Blinded", nameTh: "ตาบอด",
    description: "Can't see. All checks requiring sight auto-fail. Attacks against you have advantage, your attacks have disadvantage.",
    descriptionTh: "มองไม่เห็น — check ที่ต้องใช้สายตาล้มเหลวอัตโนมัติ, โจมตีใส่คุณได้เปรียบ, คุณโจมตีเสียเปรียบ",
    attackDisadvantage: true, attackAdvantageAgainstYou: true, checkDisadvantage: true,
    autoFailChecks: ["perception"],
    defaultDurationType: "concentration",
  },
  charmed: {
    id: "charmed", name: "Charmed", nameTh: "ถูกเสน่ห์",
    description: "Can't attack the charmer. Charmer has advantage on social ability checks against you.",
    descriptionTh: "โจมตีผู้เสกเสน่ห์ไม่ได้, ผู้เสกได้เปรียบในการเจรจากับคุณ",
    defaultDurationType: "concentration",
  },
  deafened: {
    id: "deafened", name: "Deafened", nameTh: "หูหนวก",
    description: "Can't hear. All checks requiring hearing auto-fail.",
    descriptionTh: "ไม่ได้ยิน — check ที่ต้องใช้การได้ยินล้มเหลวอัตโนมัติ",
    autoFailChecks: ["perception"],
    defaultDurationType: "rounds",
  },
  exhaustion: {
    id: "exhaustion", name: "Exhaustion", nameTh: "อ่อนเพลีย",
    description: "D&D 2024 Condition. Each level: -2 to D20 Tests AND -5 ft Speed per level. Level 6 = death.",
    descriptionTh: "D&D 2024: ทุกระดับ -2 ต่อ D20 Test และ -5 ฟุต Speed ต่อระดับ — Lv6: ตาย",
    stacks: true, // exhaustion stacks in levels (D&D 2024: 1 Long Rest removes 1 level)
    defaultDurationType: "permanent",
  },
  frightened: {
    id: "frightened", name: "Frightened", nameTh: "หวาดกลัว",
    description: "Disadvantage on ability checks and attack rolls while source is visible. Can't move closer to source.",
    descriptionTh: "เสียเปรียบ check/โจมตี ขณะเห็นต้นเหตุ, เข้าใกล้ต้นเหตุไม่ได้",
    attackDisadvantage: true, checkDisadvantage: true,
    defaultDurationType: "concentration",
  },
  grappled: {
    id: "grappled", name: "Grappled", nameTh: "ถูกจับ",
    description: "Speed becomes 0. Ends if grappler is moved away or becomes incapacitated.",
    descriptionTh: "ความเร็วเป็น 0 — หายถ้าผู้จับถูกดึงออกหรือไร้ความสามารถ",
    speedMultiplier: 0,
    defaultDurationType: "permanent",
  },
  incapacitated: {
    id: "incapacitated", name: "Incapacitated", nameTh: "ไร้ความสามารถ",
    description: "Can't take actions or reactions.",
    descriptionTh: "ไม่สามารถทำ action หรือ reaction ได้",
    incapacitates: true,
    defaultDurationType: "rounds",
  },
  invisible: {
    id: "invisible", name: "Invisible", nameTh: "ล่องหน",
    description: "Impossible to see without magic. Attacks against you have disadvantage, your attacks have advantage.",
    descriptionTh: "มองเห็นไม่ได้ — โจมตีใส่คุณเสียเปรียบ, คุณโจมตีได้เปรียบ",
    attackDisadvantage: false, // you have advantage
    attackAdvantageAgainstYou: false, // they have disadvantage
    defaultDurationType: "concentration",
  },
  paralyzed: {
    id: "paralyzed", name: "Paralyzed", nameTh: "ชา",
    description: "Incapacitated, can't move or speak. STR/DEX saves auto-fail. Attacks within 5ft have advantage and are critical hits.",
    descriptionTh: "ไร้ความสามารถ, เคลื่อนไหว/พูดไม่ได้, STR/DEX save ล้มเหลวอัตโนมัติ, โจมตีในระยะ 5 ฟุตได้เปรียบและเป็นคริติคอล",
    incapacitates: true, cannotMove: true, cannotSpeak: true,
    autoFailSaves: ["str", "dex"],
    attackAdvantageAgainstYou: true,
    defaultDurationType: "concentration",
  },
  petrified: {
    id: "petrified", name: "Petrified", nameTh: "กลายเป็นหิน",
    description: "Transformed to stone. Weight ×10. Incapacitated, unaware. STR/DEX saves auto-fail. Attacks against you have advantage.",
    descriptionTh: "กลายเป็นหิน — น้ำหนัก x10, ไร้ความสามารถ, ไม่รับรู้, STR/DEX save ล้มเหลวอัตโนมัติ, โจมตีใส่คุณได้เปรียบ",
    incapacitates: true, cannotMove: true, cannotSpeak: true,
    autoFailSaves: ["str", "dex"],
    attackAdvantageAgainstYou: true,
    defaultDurationType: "permanent",
  },
  poisoned: {
    id: "poisoned", name: "Poisoned", nameTh: "ถูกพิษ",
    description: "Disadvantage on attack rolls and ability checks.",
    descriptionTh: "เสียเปรียบการโจมตีและ ability check",
    attackDisadvantage: true, checkDisadvantage: true,
    defaultDurationType: "rounds",
  },
  prone: {
    id: "prone", name: "Prone", nameTh: "ล้ม",
    description: "Only crawl movement. Attacks against you within 5ft have advantage, ranged attacks have disadvantage. Your attacks have disadvantage.",
    descriptionTh: "เคลื่อนไหวแบบคลานเท่านั้น, โจมตีในระยะ 5 ฟุตได้เปรียบ, โจมตีระยะไกลเสียเปรียบ, คุณโจมตีเสียเปรียบ",
    attackDisadvantage: true, attackAdvantageAgainstYou: true,
    speedMultiplier: 0.5,
    defaultDurationType: "permanent",
  },
  restrained: {
    id: "restrained", name: "Restrained", nameTh: "ถูกตรึง",
    description: "Speed 0. Attacks against you have advantage, your attacks have disadvantage. DEX saves have disadvantage.",
    descriptionTh: "ความเร็ว 0, โจมตีใส่คุณได้เปรียบ, คุณโจมตีเสียเปรียบ, DEX save เสียเปรียบ",
    speedMultiplier: 0, attackDisadvantage: true, attackAdvantageAgainstYou: true,
    saveDisadvantage: { abilities: ["dex"] },
    defaultDurationType: "rounds",
  },
  stunned: {
    id: "stunned", name: "Stunned", nameTh: "มึนงง",
    description: "Incapacitated, can't move. Attacks against you have advantage. Saves auto-fail.",
    descriptionTh: "ไร้ความสามารถ, เคลื่อนไหวไม่ได้, โจมตีใส่คุณได้เปรียบ, save ล้มเหลวอัตโนมัติ",
    incapacitates: true, cannotMove: true,
    attackAdvantageAgainstYou: true,
    autoFailSaves: ["str", "dex", "con"],
    defaultDurationType: "rounds",
  },
  unconscious: {
    id: "unconscious", name: "Unconscious", nameTh: "หมดสติ",
    description: "Incapacitated, unaware, drops items, falls prone. Attacks within 5ft have advantage and are critical hits. STR/DEX saves auto-fail.",
    descriptionTh: "ไร้ความสามารถ, ไม่รับรู้, ทำของหล่น, ล้ม, โจมตีในระยะ 5 ฟุตได้เปรียบและเป็นคริติคอล, STR/DEX save ล้มเหลวอัตโนมัติ",
    incapacitates: true, cannotMove: true, cannotSpeak: true, fallsProne: true,
    autoFailSaves: ["str", "dex"],
    attackAdvantageAgainstYou: true,
    defaultDurationType: "permanent",
  },
};

/* ======================================================================
 * 7.5 CONDITION SOURCE
 * ====================================================================== */

export type ConditionSource = "spell" | "feature" | "item" | "trap" | "monster" | "environment" | "effect";

/* ======================================================================
 * 7.4 CONDITION DURATION
 * ====================================================================== */

export type DurationType = "instant" | "until_end_of_turn" | "until_start_of_turn" | "rounds" | "minutes" | "concentration" | "permanent";

export interface ConditionInstance {
  id: ConditionId;
  source: ConditionSource;
  sourceName?: string;        // e.g. "Hold Person", "Poison Spray"
  durationType: DurationType;
  durationValue?: number;     // for "rounds" or "minutes"
  roundsRemaining?: number;   // ticked down each round
  appliedAtRound?: number;
  level?: number;             // for exhaustion (1-6)
}

/* ======================================================================
 * 7.1 APPLY CONDITION
 * ====================================================================== */

export interface ApplyResult {
  success: boolean;
  reason: string;
  reasonTh: string;
  replaced?: ConditionId[];   // conditions that were replaced
  cancelled?: ConditionId[];  // conditions that were cancelled
}

export function applyCondition(
  activeConditions: ConditionInstance[],
  conditionId: ConditionId,
  source: ConditionSource,
  sourceName?: string,
  durationType?: DurationType,
  durationValue?: number,
  immunityList: ConditionId[] = [],
  round: number = 1,
): { conditions: ConditionInstance[]; result: ApplyResult } {
  const def = STANDARD_CONDITIONS[conditionId];
  if (!def) {
    return {
      conditions: activeConditions,
      result: { success: false, reason: "Unknown condition", reasonTh: "ไม่รู้จักสถานะนี้" },
    };
  }

  // 7.6 Immunity check
  if (immunityList.includes(conditionId)) {
    return {
      conditions: activeConditions,
      result: { success: false, reason: `Immune to ${def.name}`, reasonTh: `ภูมิคุ้มกัน ${def.nameTh}` },
    };
  }

  let conditions = [...activeConditions];
  const replaced: ConditionId[] = [];
  const cancelled: ConditionId[] = [];

  // 7.7 Condition interaction — cancels
  if (def.cancels) {
    for (const cancelId of def.cancels) {
      const idx = conditions.findIndex((c) => c.id === cancelId);
      if (idx >= 0) {
        conditions.splice(idx, 1);
        cancelled.push(cancelId);
      }
    }
  }

  // 7.7 Condition interaction — replaces
  if (def.replaces) {
    for (const replaceId of def.replaces) {
      const idx = conditions.findIndex((c) => c.id === replaceId);
      if (idx >= 0) {
        conditions.splice(idx, 1);
        replaced.push(replaceId);
      }
    }
  }

  // Check if already active and doesn't stack
  const existing = conditions.find((c) => c.id === conditionId);
  if (existing && !def.stacks) {
    // Replace with new instance (refresh duration)
    conditions = conditions.filter((c) => c.id !== conditionId);
  }

  // Apply
  const dt = durationType || def.defaultDurationType || "rounds";
  const instance: ConditionInstance = {
    id: conditionId,
    source,
    sourceName,
    durationType: dt,
    durationValue,
    roundsRemaining: dt === "rounds" ? durationValue || 1 : undefined,
    appliedAtRound: round,
    level: conditionId === "exhaustion" ? (existing ? (existing.level || 1) + 1 : 1) : undefined,
  };

  conditions.push(instance);

  return {
    conditions,
    result: {
      success: true,
      reason: `${def.name} applied${sourceName ? ` by ${sourceName}` : ""}`,
      reasonTh: `${def.nameTh} ติดสถานะ${sourceName ? ` จาก ${sourceName}` : ""}`,
      replaced: replaced.length > 0 ? replaced : undefined,
      cancelled: cancelled.length > 0 ? cancelled : undefined,
    },
  };
}

/* ======================================================================
 * 7.2 REMOVE CONDITION
 * ====================================================================== */

export function removeCondition(
  activeConditions: ConditionInstance[],
  conditionId: ConditionId,
): { conditions: ConditionInstance[]; removed: boolean } {
  const idx = activeConditions.findIndex((c) => c.id === conditionId);
  if (idx < 0) return { conditions: activeConditions, removed: false };
  const conditions = [...activeConditions];
  conditions.splice(idx, 1);
  return { conditions, removed: true };
}

export function removeAllConditions(activeConditions: ConditionInstance[]): ConditionInstance[] {
  // Only remove non-permanent conditions (permanent ones like petrified need explicit removal)
  return activeConditions.filter((c) => c.durationType === "permanent");
}

/* ======================================================================
 * 7.3 ACTIVE CONDITIONS
 * ====================================================================== */

export function getActiveConditions(activeConditions: ConditionInstance[]): ConditionInstance[] {
  return activeConditions;
}

export function hasCondition(activeConditions: ConditionInstance[], conditionId: ConditionId): boolean {
  return activeConditions.some((c) => c.id === conditionId);
}

export function getConditionLevel(activeConditions: ConditionInstance[], conditionId: ConditionId): number {
  const c = activeConditions.find((c) => c.id === conditionId);
  return c?.level || 0;
}

/* ======================================================================
 * 7.9 CONDITION EFFECTS — query helpers
 * ====================================================================== */

export function hasAttackDisadvantage(activeConditions: ConditionInstance[]): boolean {
  return activeConditions.some((c) => STANDARD_CONDITIONS[c.id]?.attackDisadvantage);
}

export function hasAttackAdvantageAgainstYou(activeConditions: ConditionInstance[]): boolean {
  return activeConditions.some((c) => STANDARD_CONDITIONS[c.id]?.attackAdvantageAgainstYou);
}

export function hasCheckDisadvantage(activeConditions: ConditionInstance[]): boolean {
  return activeConditions.some((c) => STANDARD_CONDITIONS[c.id]?.checkDisadvantage);
}

export function isIncapacitated(activeConditions: ConditionInstance[]): boolean {
  return activeConditions.some((c) => STANDARD_CONDITIONS[c.id]?.incapacitates);
}

export function cannotMove(activeConditions: ConditionInstance[]): boolean {
  return activeConditions.some((c) => STANDARD_CONDITIONS[c.id]?.cannotMove || STANDARD_CONDITIONS[c.id]?.speedMultiplier === 0);
}

export function autoFailSave(activeConditions: ConditionInstance[], ability: string): boolean {
  return activeConditions.some((c) => {
    const def = STANDARD_CONDITIONS[c.id];
    return def?.autoFailSaves?.includes(ability);
  });
}

export function autoFailCheck(activeConditions: ConditionInstance[], skill: string): boolean {
  return activeConditions.some((c) => {
    const def = STANDARD_CONDITIONS[c.id];
    return def?.autoFailChecks?.includes(skill);
  });
}

export function getExhaustionLevel(activeConditions: ConditionInstance[]): number {
  return getConditionLevel(activeConditions, "exhaustion");
}

/* ======================================================================
 * 7.10 CONDITION EVENTS
 * ====================================================================== */

export type ConditionEvent =
  | "on_apply" | "on_remove" | "on_duration_end"
  | "on_saving_throw" | "on_turn_start" | "on_turn_end";

export interface ConditionEventCallback {
  conditionId: ConditionId;
  event: ConditionEvent;
  callback: (character: any, condition: ConditionInstance) => void;
}

/* ======================================================================
 * DURATION TICKING
 * ====================================================================== */

export function tickConditionDurations(
  activeConditions: ConditionInstance[],
  isEndOfRound: boolean = true,
): { conditions: ConditionInstance[]; expired: ConditionId[] } {
  const expired: ConditionId[] = [];
  const remaining: ConditionInstance[] = [];

  for (const c of activeConditions) {
    if (c.durationType === "permanent" || c.durationType === "instant") {
      remaining.push(c);
      continue;
    }
    if (c.durationType === "rounds" && c.roundsRemaining !== undefined) {
      c.roundsRemaining -= 1;
      if (c.roundsRemaining <= 0) {
        expired.push(c.id);
        continue;
      }
    }
    if (c.durationType === "until_end_of_turn" && isEndOfRound) {
      expired.push(c.id);
      continue;
    }
    remaining.push(c);
  }

  return { conditions: remaining, expired };
}
