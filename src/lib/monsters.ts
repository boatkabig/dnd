/**
 * Domain 25: Monsters & NPCs
 *
 * จัดการสิ่งมีชีวิตที่ไม่ใช่ Player Character
 *
 * Sub-systems:
 *  25.1 Creature Base    — Name/Type/Size/Alignment/CR
 *  25.2 Monster Stats    — HP/AC/Speed/Ability/Saves/Skills
 *  25.3 Monster Actions  — Action/Bonus/Reaction/Legendary
 *  25.4 Monster Abilities — Feature/Spell/Trait/Attack
 *  25.5 AI Behavior      — Aggressive/Defensive/Tactical/Escape/Social
 *  25.6 NPC Data         — Personality/Goal/Memory/Relationship/Knowledge
 *  25.7 Creature State   — Alive/Dead/Injured/Hostile/Friendly
 *
 * Delegates stat/HP/AC logic to character module when needed.
 * AI Behavior is *data*, not hardcoded — separate from creature data per architecture advice #10.
 */

import { rollTable } from "./diceEngine.js";

/* ======================================================================
 * 25.1 CREATURE BASE
 * ====================================================================== */

export type CreatureType =
  | "aberration"
  | "beast"
  | "celestial"
  | "construct"
  | "dragon"
  | "elemental"
  | "fey"
  | "fiend"
  | "giant"
  | "humanoid"
  | "monstrosity"
  | "ooze"
  | "plant"
  | "undead";

export type CreatureSize = "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";

export type Alignment =
  | "lawful_good" | "neutral_good" | "chaotic_good"
  | "lawful_neutral" | "true_neutral" | "chaotic_neutral"
  | "lawful_evil" | "neutral_evil" | "chaotic_evil"
  | "unaligned";

export interface CreatureBase {
  id: string;
  name: string;
  type: CreatureType;
  size: CreatureSize;
  alignment: Alignment;
  cr: string; // Challenge Rating e.g. "1/4", "5", "17"
  source?: string; // SRD/homebrew
}

export const SIZE_TO_SPACE_FT: Record<CreatureSize, number> = {
  tiny: 2.5,
  small: 5,
  medium: 5,
  large: 10,
  huge: 15,
  gargantuan: 20,
};

/* ======================================================================
 * 25.2 MONSTER STATS
 * ====================================================================== */

export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface MonsterStats {
  hp: number;
  maxHp: number;
  ac: number;
  speed: number; // ft
  speeds?: { fly?: number; swim?: number; climb?: number; burrow?: number };
  abilities: AbilityScores;
  savingThrows: Partial<Record<keyof AbilityScores, number>>;
  skills: Record<string, number>; // skill name -> modifier
  damageResistances?: string[];
  damageImmunities?: string[];
  conditionImmunities?: string[];
  senses?: { darkvision?: number; blindsight?: number; tremorsense?: number; truesight?: number };
  languages?: string[];
  passivePerception: number;
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function crToXP(cr: string): number {
  const table: Record<string, number> = {
    "0": 10, "1/8": 25, "1/4": 50, "1/2": 100,
    "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
    "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
    "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000,
    "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
    "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000,
    "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000,
  };
  return table[cr] ?? 0;
}

export function crToProficiencyBonus(cr: string): number {
  const crNum = cr.includes("/") ? eval(cr) : parseInt(cr, 10);
  if (crNum < 5) return 2;
  if (crNum < 9) return 3;
  if (crNum < 13) return 4;
  if (crNum < 17) return 5;
  if (crNum < 21) return 6;
  if (crNum < 25) return 7;
  if (crNum < 29) return 8;
  return 9;
}

/* ======================================================================
 * 25.3 MONSTER ACTIONS
 * ====================================================================== */

export type ActionType = "action" | "bonus_action" | "reaction" | "legendary" | "mythic" | "lair";

export interface MonsterAction {
  id: string;
  name: string;
  type: ActionType;
  description: string;
  recharge?: string; // e.g. "5-6"
  rechargeRoll?: number; // last roll
  usesPerDay?: number;
  usesRemaining?: number;
  legendaryCost?: number; // 1, 2, or 3 — for legendary actions
}

export function canUseAction(action: MonsterAction): boolean {
  if (action.usesPerDay !== undefined && action.usesRemaining !== undefined) {
    return action.usesRemaining > 0;
  }
  if (action.recharge !== undefined) {
    // already recharged this round if rechargeRoll >= threshold
    return action.rechargeRoll === undefined;
  }
  return true;
}

export function useAction(action: MonsterAction): MonsterAction {
  if (action.usesPerDay !== undefined && action.usesRemaining !== undefined) {
    return { ...action, usesRemaining: Math.max(0, action.usesRemaining - 1) };
  }
  return action;
}

export function rollRecharge(action: MonsterAction): MonsterAction {
  if (action.recharge === undefined) return action;
  const threshold = parseInt(action.recharge.split("-")[0], 10);
  const r = rollTable(6);
  if (r >= threshold) {
    return { ...action, rechargeRoll: r };
  }
  return { ...action, rechargeRoll: r };
}

export function resetRecharge(action: MonsterAction): MonsterAction {
  if (action.recharge !== undefined) {
    return { ...action, rechargeRoll: undefined };
  }
  return action;
}

/* ======================================================================
 * 25.4 MONSTER ABILITIES
 * ====================================================================== */

export type AbilityKind = "feature" | "spell" | "trait" | "attack" | "legendary" | "legendary_resistance" | "lair_action";

export interface MonsterAbility {
  id: string;
  kind: AbilityKind;
  name: string;
  description: string;
  // For attacks:
  attackBonus?: number;
  damage?: string; // dice string e.g. "1d8+3"
  damageType?: string;
  reach?: number; // ft
  range?: number; // ft
  // For spells:
  spellcastingLevel?: number;
  spellcastingAbility?: keyof AbilityScores;
  spellsKnown?: string[];
  // For traits/features:
  passive?: boolean; // always-on trait
}

/* ======================================================================
 * 25.5 AI BEHAVIOR (data, not code)
 * ====================================================================== */

export type AIPattern =
  | "aggressive" // rush, attack nearest
  | "defensive"  // protect location, attack if approached
  | "tactical"   // use terrain, flank, focus healers
  | "escape"     // flee when bloodied
  | "social"     // negotiate, only fight if cornered
  | "guardian"   // protect specific ally
  | "ambusher";  // wait hidden, surprise attack

export interface AIBehavior {
  pattern: AIPattern;
  priorities: AIPriority[];
  fleeThreshold?: number; // HP% below which flee
  preferTarget?: "nearest" | "weakest" | "caster" | "healer" | "tank";
  abilityPriority?: string[]; // ability IDs in preferred order
  tacticalNotes?: string[]; // DM hints
}

export type AIPriority =
  | "attack"
  | "defend"
  | "flee"
  | "cast_spell"
  | "buff_ally"
  | "debuff_enemy"
  | "use_legendary"
  | "negotiate"
  | "ambush";

export function decideAIAction(
  behavior: AIBehavior,
  context: {
    hpPercent: number;
    alliesAlive: number;
    enemiesVisible: number;
    hasBonusAction: boolean;
    hasReaction: boolean;
    legendaryPoints?: number;
  },
): AIPriority {
  // Flee check
  if (
    behavior.fleeThreshold !== undefined &&
    context.hpPercent <= behavior.fleeThreshold &&
    behavior.priorities.includes("flee")
  ) {
    return "flee";
  }
  // Use legendary if available and prioritized
  if (
    context.legendaryPoints &&
    context.legendaryPoints > 0 &&
    behavior.priorities.includes("use_legendary")
  ) {
    return "use_legendary";
  }
  // Pattern-based defaults
  switch (behavior.pattern) {
    case "aggressive":
      return context.hasBonusAction ? "cast_spell" : "attack";
    case "defensive":
      return context.alliesAlive < 2 ? "defend" : "attack";
    case "tactical":
      return context.enemiesVisible > 2 ? "debuff_enemy" : "attack";
    case "escape":
      return context.hpPercent < 50 ? "flee" : "attack";
    case "social":
      return context.enemiesVisible > 0 ? "negotiate" : "defend";
    case "guardian":
      return context.alliesAlive > 0 ? "buff_ally" : "attack";
    case "ambusher":
      return "ambush";
  }
}

/* ======================================================================
 * 25.6 NPC DATA (separate from combat stats)
 * ====================================================================== */

export interface NPCData {
  id: string;
  name: string;
  personalityTraits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
  goals: string[];
  fears?: string[];
  relationships: Record<string, number>; // characterId -> -100..100
  knowledge: string[]; // info IDs the NPC knows
  memory: NPCMemoryEntry[];
  voice?: string; // description for DM
  appearance?: string;
}

export interface NPCMemoryEntry {
  id: string;
  timestamp: number; // in-world seconds
  description: string;
  importance: number; // 1-5
  emotion?: string;
}

export function npcRemembers(npc: NPCData, memoryId: string): boolean {
  return npc.memory.some((m) => m.id === memoryId);
}

export function addNPCMemory(npc: NPCData, entry: Omit<NPCMemoryEntry, "id">): NPCData {
  const id = `mem_${npc.memory.length + 1}`;
  return {
    ...npc,
    memory: [...npc.memory, { ...entry, id }],
  };
}

export function adjustRelationship(npc: NPCData, characterId: string, delta: number): NPCData {
  const cur = npc.relationships[characterId] ?? 0;
  const clamped = Math.max(-100, Math.min(100, cur + delta));
  return {
    ...npc,
    relationships: { ...npc.relationships, [characterId]: clamped },
  };
}

/* ======================================================================
 * 25.7 CREATURE STATE
 * ====================================================================== */

export type CreatureStatus =
  | "alive"
  | "dead"
  | "unconscious"
  | "injured" // < 50% HP
  | "stable"
  | "hostile"
  | "friendly"
  | "neutral";

export interface CreatureState {
  creatureId: string;
  status: CreatureStatus;
  hp: number;
  maxHp: number;
  conditions: string[]; // condition IDs
  position?: { x: number; y: number };
  initiative?: number;
  hasUsedReaction: boolean;
  legendaryPointsRemaining?: number;
  lairActionReady?: boolean;
}

export function updateCreatureHP(state: CreatureState, newHP: number): CreatureState {
  const clamped = Math.max(0, Math.min(state.maxHp, newHP));
  let status: CreatureStatus = state.status;
  if (clamped <= 0) status = "unconscious";
  else if (clamped < state.maxHp / 2) status = "injured";
  else status = "alive";
  return { ...state, hp: clamped, status };
}

export function markDead(state: CreatureState): CreatureState {
  return { ...state, status: "dead", hp: 0 };
}

export function canAct(state: CreatureState): boolean {
  return state.status === "alive" || state.status === "injured" || state.status === "hostile" || state.status === "friendly";
}

/* ======================================================================
 * FULL CREATURE ASSEMBLY (Monster = Base + Stats + Actions + Abilities + Behavior)
 * ====================================================================== */

export interface MonsterDefinition {
  base: CreatureBase;
  stats: MonsterStats;
  actions: MonsterAction[];
  abilities: MonsterAbility[];
  behavior: AIBehavior;
}

export interface NPCTemplate {
  base: CreatureBase;
  stats: MonsterStats;
  npc: NPCData;
  behavior: AIBehavior;
}

/* ======================================================================
 * LAIR ACTIONS & LEGENDARY
 * ====================================================================== */

export interface LairAction {
  id: string;
  description: string;
  initiativeCount: number; // acts on this count (e.g. initiative 20)
  recharge?: string;
}

export function shouldTriggerLairAction(action: LairAction, currentInitiative: number): boolean {
  return currentInitiative === action.initiativeCount;
}
