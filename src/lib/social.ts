/**
 * Domain 22: Social (การพูดคุย เจรจา โน้มน้าว)
 *
 * จัดการปฏิสัมพันธ์ระหว่างตัวละครกับ NPC และโลก
 *
 * Sub-systems:
 *  22.1 Social Interaction  — conversation/negotiation/persuasion/threat/deception/trade
 *  22.2 NPC Attitude        — Friendly / Indifferent / Hostile
 *  22.3 Dialogue System     — topic/response/knowledge/emotion/memory
 *  22.4 Social Checks       — Persuasion/Deception/Intimidation/Insight/Performance
 *  22.5 Influence           — Trust / Reputation / Favor / Fear
 *  22.6 Reputation          — NPC / Faction / Region
 *  22.7 Bargaining          — price / discount / negotiation
 *  22.8 Information System  — secret / rumor / quest / location
 *
 * Data-Driven: attitude modifiers, dialogue definitions, info tables are JSON.
 */

import { rollTable } from "./diceEngine.js";

/* ======================================================================
 * 22.1 SOCIAL INTERACTION
 * ====================================================================== */

export type SocialInteractionType =
  | "conversation"
  | "negotiation"
  | "persuasion"
  | "threat"
  | "deception"
  | "trade";

export interface SocialInteraction {
  type: SocialInteractionType;
  participantA: string; // character id
  participantB: string; // npc id
  topic?: string;
  rounds: number;
}

/* ======================================================================
 * 22.2 NPC ATTITUDE
 * ====================================================================== */

export type NPCAttitude = "friendly" | "indifferent" | "hostile";

/**
 * D&D 2024 Influence Action (D&D Beyond Free Rules — "Influence"):
 *   - If the request is something the NPC would do anyway → automatic success (no check).
 *   - If the request is repugnant / against the NPC's nature → automatic failure (no check).
 *   - If the NPC is "Hesitant" → check vs DC = max(15, target's Intelligence score).
 *     Use Persuasion (tact/social grace), Deception (mislead), or Intimidation (threats).
 *
 * 5e (2014) used attitude-based fixed DCs (Friendly 10, Indifferent 15, Hostile 20) with
 * DM-fiat modifiers. 2024 codifies a single DC benchmark for "Hesitant" requests.
 *
 * We retain the attitude-based DCs for backwards-compat / DM-fiat, but the recommended
 * path is `influenceDC()` which implements the 2024 rule.
 */

/**
 * Hesitant: NPC won't do the request without a successful Influence check.
 * DC = max(15, target's Intelligence score) per D&D 2024.
 *
 * @param targetIntScore The target creature's Intelligence ability SCORE (not modifier).
 *                       E.g., Int 8 (mod -1) → score 8 → DC 15.
 *                       E.g., Int 16 (mod +3) → score 16 → DC 16.
 */
export function influenceDC(targetIntScore: number = 10): number {
  // D&D 2024: DC = max(15, target's Intelligence score)
  return Math.max(15, targetIntScore);
}

/**
 * Resolve an Influence action (D&D 2024).
 * @param requestReasonable If true: NPC will just do it — auto success, no roll.
 * @param requestRepugnant If true: against NPC's nature — auto fail, no roll.
 * @param hesitant If true (and not auto-success/auto-fail): roll vs DC = max(15, targetIntScore).
 * @param skillRollTotal The Persuasion/Deception/Intimidation roll total (d20 + skill mod).
 * @param targetIntScore The target's Intelligence SCORE (e.g., 10 for average).
 */
export interface InfluenceResult {
  outcome: "auto_success" | "auto_fail" | "success" | "failure";
  rolled: boolean;
  dc?: number;
  rollTotal?: number;
  description: string;
  descriptionTh: string;
}

export function resolveInfluence(
  requestReasonable: boolean,
  requestRepugnant: boolean,
  hesitant: boolean,
  skillRollTotal: number,
  targetIntScore: number = 10,
): InfluenceResult {
  // D&D 2024: auto-success cases
  if (requestReasonable) {
    return {
      outcome: "auto_success", rolled: false,
      description: "NPC agrees without a check (request is something they would do anyway).",
      descriptionTh: "NPC ยินยอมโดยไม่ต้องทอย (เป็นสิ่งที่ทำอยู่แล้ว)",
    };
  }
  if (requestRepugnant) {
    return {
      outcome: "auto_fail", rolled: false,
      description: "NPC refuses without a check (request is repugnant / against their nature).",
      descriptionTh: "NPC ปฏิเสธโดยไม่ต้องทอย (ขัดกับนิสัยของ NPC)",
    };
  }
  if (!hesitant) {
    // NPC is willing and not hesitant — auto-success (no roll)
    return {
      outcome: "auto_success", rolled: false,
      description: "NPC is willing (not Hesitant) — agrees without a check.",
      descriptionTh: "NPC ยินยอม (ไม่ Hesitant) — ไม่ต้องทอย",
    };
  }
  // D&D 2024: Hesitant → roll vs DC = max(15, target's Int score)
  const dc = influenceDC(targetIntScore);
  const success = skillRollTotal >= dc;
  return {
    outcome: success ? "success" : "failure",
    rolled: true,
    dc,
    rollTotal: skillRollTotal,
    description: success
      ? `Influence success (roll ${skillRollTotal} ≥ DC ${dc}).`
      : `Influence failure (roll ${skillRollTotal} < DC ${dc}).`,
    descriptionTh: success
      ? `สำเร็จ (ทอย ${skillRollTotal} ≥ DC ${dc})`
      : `ล้มเหลว (ทอย ${skillRollTotal} < DC ${dc})`,
  };
}

/**
 * Legacy 5e-style attitude-based DCs (retained for DM-fiat / backwards-compat).
 * D&D 2024 recommends using `influenceDC()` + `resolveInfluence()` instead.
 */
export const ATTITUDE_MODIFIERS: Record<NPCAttitude, {
  persuasionDC: number;
  deceptionDC: number;
  intimidationDC: number;
  startingTrust: number;
  description: string;
}> = {
  friendly: {
    persuasionDC: 10,
    deceptionDC: 15,
    intimidationDC: 20,
    startingTrust: 30,
    description: "เป็นมิตร: พร้อมช่วยเหลือ",
  },
  indifferent: {
    persuasionDC: 15,
    deceptionDC: 15,
    intimidationDC: 15,
    startingTrust: 0,
    description: "เป็นกลาง: ไม่สนใจเป็นพิเศษ",
  },
  hostile: {
    persuasionDC: 20,
    deceptionDC: 20,
    intimidationDC: 10,
    startingTrust: -30,
    description: "เป็นศัตรู: อาจโจมตีหรือปฏิเสธ",
  },
};

/* ======================================================================
 * 22.3 DIALOGUE SYSTEM
 * ====================================================================== */

export interface DialogueNode {
  id: string;
  topic: string;
  prompt: string; // what NPC says
  responses: DialogueResponse[];
  emotion?: string;
  knowledgeRevealed?: string[]; // info IDs unlocked
  requiresAttitude?: NPCAttitude;
}

export interface DialogueResponse {
  id: string;
  text: string;
  skillCheck?: {
    skill: "persuasion" | "deception" | "intimidation" | "performance";
    dc: number;
  };
  insightDC?: number; // see through NPC deception
  nextNodeId?: string;
  attitudeShift?: number; // +/- trust
  unlocksInfo?: string[];
}

export interface DialogueState {
  npcId: string;
  currentNodeId: string;
  emotion: string;
  memory: string[]; // facts NPC remembers
  revealedInfo: string[];
  visitedNodes: string[];
}

export function startDialogue(npcId: string, startNodeId: string, initialEmotion = "neutral"): DialogueState {
  return {
    npcId,
    currentNodeId: startNodeId,
    emotion: initialEmotion,
    memory: [],
    revealedInfo: [],
    visitedNodes: [startNodeId],
  };
}

export function chooseDialogueResponse(
  state: DialogueState,
  node: DialogueNode,
  response: DialogueResponse,
  skillModifier = 0,
): {
  newState: DialogueState;
  success: boolean;
  note: string;
} {
  let success = true;
  let note = response.text;
  if (response.skillCheck) {
    const roll = rollTable(20) + skillModifier;
    success = roll >= response.skillCheck.dc;
    note = success
      ? `สำเร็จ (roll ${roll} ≥ DC ${response.skillCheck.dc})`
      : `ล้มเหลว (roll ${roll} < DC ${response.skillCheck.dc})`;
  }
  const newState: DialogueState = {
    ...state,
    currentNodeId: response.nextNodeId ?? state.currentNodeId,
    emotion: success && response.attitudeShift && response.attitudeShift > 0
      ? "happy"
      : !success
        ? "annoyed"
        : state.emotion,
    revealedInfo: response.unlocksInfo
      ? [...state.revealedInfo, ...response.unlocksInfo]
      : state.revealedInfo,
    visitedNodes: response.nextNodeId
      ? [...state.visitedNodes, response.nextNodeId]
      : state.visitedNodes,
    memory: success && node.knowledgeRevealed
      ? [...state.memory, ...node.knowledgeRevealed]
      : state.memory,
  };
  return { newState, success, note };
}

/* ======================================================================
 * 22.4 SOCIAL CHECKS
 * ====================================================================== */

export type SocialSkill = "persuasion" | "deception" | "intimidation" | "insight" | "performance";

export interface SocialCheckRequest {
  skill: SocialSkill;
  modifier: number;
  targetAttitude: NPCAttitude;
  advantage: boolean;
  disadvantage: boolean;
}

export function resolveSocialCheck(req: SocialCheckRequest): {
  success: boolean;
  roll: number;
  dc: number;
  note: string;
} {
  const dcMap: Record<SocialSkill, Record<NPCAttitude, number>> = {
    persuasion: {
      friendly: ATTITUDE_MODIFIERS.friendly.persuasionDC,
      indifferent: ATTITUDE_MODIFIERS.indifferent.persuasionDC,
      hostile: ATTITUDE_MODIFIERS.hostile.persuasionDC,
    },
    deception: {
      friendly: ATTITUDE_MODIFIERS.friendly.deceptionDC,
      indifferent: ATTITUDE_MODIFIERS.indifferent.deceptionDC,
      hostile: ATTITUDE_MODIFIERS.hostile.deceptionDC,
    },
    intimidation: {
      friendly: ATTITUDE_MODIFIERS.friendly.intimidationDC,
      indifferent: ATTITUDE_MODIFIERS.indifferent.intimidationDC,
      hostile: ATTITUDE_MODIFIERS.hostile.intimidationDC,
    },
    insight: { friendly: 10, indifferent: 12, hostile: 15 },
    performance: { friendly: 10, indifferent: 13, hostile: 18 },
  };
  const dc = dcMap[req.skill][req.targetAttitude];
  let roll = rollTable(20);
  if (req.advantage && !req.disadvantage) {
    const r2 = rollTable(20);
    roll = Math.max(roll, r2);
  } else if (req.disadvantage && !req.advantage) {
    const r2 = rollTable(20);
    roll = Math.min(roll, r2);
  }
  const total = roll + req.modifier;
  return {
    success: total >= dc,
    roll: total,
    dc,
    note: total >= dc
      ? `${req.skill} สำเร็จ (${total} ≥ ${dc})`
      : `${req.skill} ล้มเหลว (${total} < ${dc})`,
  };
}

/* ======================================================================
 * 22.5 INFLUENCE
 * ====================================================================== */

export interface InfluenceState {
  trust: number;     // 0-100, higher = more trusted
  reputation: number; // -100 to +100, with NPC/faction/region
  favor: number;     // outstanding favors owed to player
  fear: number;      // 0-100, how much NPC fears player
}

export function createInfluence(attitude: NPCAttitude): InfluenceState {
  const t = ATTITUDE_MODIFIERS[attitude].startingTrust;
  return {
    trust: t,
    reputation: t / 2,
    favor: 0,
    fear: attitude === "hostile" ? 10 : 0,
  };
}

export function applyInfluenceChange(
  state: InfluenceState,
  changes: Partial<InfluenceState>,
): InfluenceState {
  return {
    trust: clamp(state.trust + (changes.trust ?? 0), -100, 100),
    reputation: clamp(state.reputation + (changes.reputation ?? 0), -100, 100),
    favor: Math.max(0, state.favor + (changes.favor ?? 0)),
    fear: clamp(state.fear + (changes.fear ?? 0), 0, 100),
  };
}

export function attitudeFromInfluence(inf: InfluenceState): NPCAttitude {
  if (inf.trust >= 30) return "friendly";
  if (inf.trust <= -20) return "hostile";
  return "indifferent";
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/* ======================================================================
 * 22.6 REPUTATION
 * ====================================================================== */

export type ReputationScope = "npc" | "faction" | "region";

export interface ReputationEntry {
  scope: ReputationScope;
  targetId: string; // NPC id, faction id, or region id
  value: number; // -100 to +100
}

export interface ReputationTracker {
  entries: Record<string, ReputationEntry>; // key = `${scope}:${targetId}`
}

export function setReputation(
  tracker: ReputationTracker,
  scope: ReputationScope,
  targetId: string,
  value: number,
): ReputationTracker {
  const key = `${scope}:${targetId}`;
  return {
    entries: {
      ...tracker.entries,
      [key]: { scope, targetId, value: clamp(value, -100, 100) },
    },
  };
}

export function adjustReputation(
  tracker: ReputationTracker,
  scope: ReputationScope,
  targetId: string,
  delta: number,
): ReputationTracker {
  const key = `${scope}:${targetId}`;
  const cur = tracker.entries[key]?.value ?? 0;
  return setReputation(tracker, scope, targetId, cur + delta);
}

export function getReputation(
  tracker: ReputationTracker,
  scope: ReputationScope,
  targetId: string,
): number {
  return tracker.entries[`${scope}:${targetId}`]?.value ?? 0;
}

/* ======================================================================
 * 22.7 BARGAINING
 * ====================================================================== */

export interface BargainingContext {
  basePrice: number;
  sellerAttitude: NPCAttitude;
  playerPersuasionMod: number;
  reputationWithSeller: number;
}

export function resolveBargaining(ctx: BargainingContext): {
  finalPrice: number;
  discount: number; // percentage 0-100
  roll: number;
  success: boolean;
} {
  const dc = ctx.sellerAttitude === "friendly" ? 10 : ctx.sellerAttitude === "indifferent" ? 15 : 20;
  const repBonus = Math.floor(ctx.reputationWithSeller / 20); // +/- 5
  const roll = rollTable(20) + ctx.playerPersuasionMod + repBonus;
  const success = roll >= dc;
  let discount = 0;
  if (success) {
    const over = roll - dc;
    discount = Math.min(50, 10 + over * 2); // up to 50%
  } else {
    // hostile may raise price
    if (ctx.sellerAttitude === "hostile") discount = -10;
  }
  const finalPrice = Math.max(1, Math.floor(ctx.basePrice * (1 - discount / 100)));
  return { finalPrice, discount, roll, success };
}

/* ======================================================================
 * 22.8 INFORMATION SYSTEM
 * ====================================================================== */

export type InfoType = "secret" | "rumor" | "quest" | "location";

export interface InfoPiece {
  id: string;
  type: InfoType;
  content: string;
  knownBy: string[]; // NPC IDs
  revealedTo: string[]; // character IDs
  insightDC: number; // to coax out
}

export function revealInfo(
  info: InfoPiece,
  toCharacterId: string,
): InfoPiece {
  if (info.revealedTo.includes(toCharacterId)) return info;
  return { ...info, revealedTo: [...info.revealedTo, toCharacterId] };
}

export function attemptInfoGather(
  info: InfoPiece,
  characterId: string,
  insightMod: number,
): { revealed: boolean; roll: number; content?: string } {
  if (info.revealedTo.includes(characterId)) {
    return { revealed: true, roll: 0, content: info.content };
  }
  const roll = rollTable(20) + insightMod;
  const revealed = roll >= info.insightDC;
  return {
    revealed,
    roll,
    content: revealed ? info.content : undefined,
  };
}

/* ======================================================================
 * FACTORY
 * ====================================================================== */

export function createNPCSocialProfile(
  npcId: string,
  attitude: NPCAttitude,
  knownInfo: InfoPiece[] = [],
): {
  npcId: string;
  attitude: NPCAttitude;
  influence: InfluenceState;
  knownInfo: InfoPiece[];
  dialogueState?: DialogueState;
} {
  return {
    npcId,
    attitude,
    influence: createInfluence(attitude),
    knownInfo,
  };
}
