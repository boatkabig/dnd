/**
 * Character — Root Entity / Aggregator.
 *
 * Instead of embedding all data in the character object, this uses a reference-based
 * approach: Species, Class, Background, Features, Feats are referenced by key
 * and resolved at runtime. This supports Homebrew, rule updates, and reduces
 * data duplication.
 */

/* ================ Character Interface ================ */

export interface Character {
  // Identity
  id: string;
  name: string;
  species: string;        // reference to RACES key
  cls: string;            // reference to CLASSES key
  subclass?: string;      // reference to subclass key (if any)
  background: string | null;
  alignment?: string;
  level: number;
  xp: number;

  // Ability Scores (with temp overrides)
  abilities: {
    str: number; dex: number; con: number; int: number; wis: number; cha: number;
  };
  abilityOverrides?: Partial<Record<string, number>>; // from items like Gauntlets of Ogre Power

  // Proficiency
  extraSkills: string[];
  expertise: string[];
  feats: string[];

  // Combat Stats
  maxHp: number;
  hp: number;
  tempHp?: number;
  ac: number;
  speed: number;
  hitDiceLeft: number;

  // Resources
  slots: number[];
  slotsMax: number[];
  knownSpells: string[];
  rageUsed: number;
  kiUsed: number;
  sorceryPoints: number;
  layOnHandsPool: number;
  bardicInspirationUsed: number;
  secondWindUsed: boolean;
  actionSurgeUsed: boolean;
  preserveLifeUsed: boolean;
  arcaneRecoveryUsed: boolean;
  venomUsed: boolean;

  // Equipment
  weapon: string;
  ranged: string | null;
  worn: string[];
  inventory: string[];
  gold: number;

  // State
  conditions: string[];
  buffs: any[];
  deathSaves: { s: number; f: number };
  dead: boolean;
  hiddenAdv: boolean;
  raging?: boolean;
  mageArmor?: boolean;

  // Details
  details?: {
    age?: string; height?: string; appearance?: string;
    ideal?: string; bond?: string; flaw?: string; backstory?: string;
  };

  // Vision
  vision?: string[]; // ["darkvision", "truesight", etc.]

  // Resistances
  resistances?: string[];
  vulnerabilities?: string[];
  immunities?: string[];

  // Metadata
  pendingAsi?: number;
}

/* ================ Combat State (for Action System) ================ */

export interface CombatState {
  hasAction: boolean;
  hasBonusAction: boolean;
  hasReaction: boolean;
  movementLeft: number;
  extraAction: boolean;     // Action Surge
  bonusUsed: boolean;
  surprise: boolean;
  dodge: boolean;
  invisible: boolean;
  round: number;
}

import type { CharacterState } from "./actionSystem";
import { getAvailableActions } from "./actionSystem";

/**
 * Build a CharacterState snapshot from Character + CombatState for the Action System.
 */
export function buildCharacterState(c: Character, combat?: CombatState): CharacterState {
  return {
    class: c.cls,
    level: c.level,
    caster: (c.slotsMax?.length || 0) > 0,
    hasAction: combat?.hasAction ?? true,
    hasBonusAction: combat ? !combat.bonusUsed : true,
    hasReaction: true, // reactions reset at start of turn
    movementLeft: combat?.movementLeft ?? 30,
    incapacitated: c.conditions.some((cond) =>
      ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"].includes(cond)
    ),
    raging: c.raging || false,
    secondWindUsed: c.secondWindUsed,
    actionSurgeUsed: c.actionSurgeUsed,
    rageUsed: c.rageUsed,
    maxRages: c.level >= 6 ? 4 : c.level >= 3 ? 3 : 2,
    kiUsed: c.kiUsed,
    maxKi: c.level,
    bardicInspirationUsed: c.bardicInspirationUsed,
    maxBardicInspiration: Math.max(1, Math.floor((c.abilities.cha - 10) / 2)),
    spellSlots: c.slots || [],
    knownSpells: c.knownSpells || [],
    hasLightWeapon: true, // simplified — check weapon properties at runtime
    conditions: c.conditions,
  };
}

/**
 * Check if character can take a specific action given current state.
 */
export function canTakeAction(c: Character, actionId: string, combat?: CombatState): boolean {
  const state = buildCharacterState(c, combat);
  const available = getAvailableActions(state);
  return available.some((a) => a.id === actionId);
}
