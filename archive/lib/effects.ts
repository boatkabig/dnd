/**
 * Effects Engine — manages spell/feature/item effects (Buffs/Debuffs).
 *
 * Effects are NOT Conditions. Effects are the LOGIC layer:
 *   Spell/Feature/Item → Effect Engine → (may apply) → Condition → Character State
 *
 * Examples:
 *   Bless (Effect) → +1d4 to attacks/saves (Modifier, NOT a Condition)
 *   Hold Person (Effect) → applies Paralyzed (Condition)
 *   Rage (Effect) → +damage, resistance (Modifier, NOT a Condition)
 *   Hex (Effect) → +1d6 damage, disadvantage on chosen ability (Modifier)
 *   Slow (Effect) → -2 AC, half speed (Modifier, may apply no Condition)
 *
 * Architecture:
 *   Effect Engine
 *     ├── Modifiers (bonuses/penalties to rolls, AC, speed, etc.)
 *     ├── Duration tracking (rounds, concentration, until rest)
 *     ├── Stacking rules (don't stack same-name effects)
 *     ├── Triggers (on attack, on damage, on turn start, etc.)
 *     └── Condition application (delegates to Conditions System)
 */

import { applyCondition, removeCondition, type ConditionId, type ConditionInstance } from "./conditions";

/* ======================================================================
 * TYPES
 * ====================================================================== */

export type EffectType = "buff" | "debuff" | "aura" | "ongoing" | "transformation";
export type EffectDurationType = "instant" | "rounds" | "minutes" | "hours" | "concentration" | "until_short_rest" | "until_long_rest" | "permanent";
export type EffectSource = "spell" | "feature" | "item" | "class" | "race" | "environment" | "monster";

export interface EffectModifier {
  // Roll modifiers
  attackBonus?: number;          // flat bonus to attack rolls
  attackBonusDice?: string;      // e.g. "1d4" for Bless
  attackDisadvantage?: boolean;
  saveBonus?: number;
  saveBonusDice?: string;        // e.g. "1d4" for Bless
  saveDisadvantage?: boolean;
  checkBonus?: number;
  checkBonusDice?: string;       // e.g. "1d4" for Guidance
  checkDisadvantage?: boolean;
  // Combat modifiers
  acBonus?: number;              // e.g. Shield +5, Shield of Faith +2
  acPenalty?: number;            // e.g. Slow -2
  damageBonus?: number;          // flat damage bonus
  damageBonusDice?: string;      // e.g. "1d6" for Hunter's Mark
  damageResistance?: string[];   // damage types resisted
  damageImmunity?: string[];
  damageVulnerability?: string[];
  // Movement modifiers
  speedMultiplier?: number;      // e.g. Haste x2, Slow x0.5
  speedBonus?: number;           // e.g. Longstrider +10
  // Special
  extraAction?: boolean;         // Haste: +1 action
  cannotTakeActions?: boolean;   // Slow/Stun-like
  disadvantageOnAbility?: string[]; // Hex: disadvantage on chosen ability
}

export interface EffectTrigger {
  event: "on_attack_hit" | "on_attack_miss" | "on_damaged" | "on_turn_start" | "on_turn_end" | "on_concentration_check";
  action?: string;               // what to do when triggered
}

export interface ActiveEffect {
  id: string;                    // unique instance ID
  name: string;                  // e.g. "Bless", "Rage", "Hex"
  nameTh: string;
  type: EffectType;
  source: EffectSource;
  sourceName?: string;           // spell/feature that created it
  casterUid?: string;            // who cast it (for concentration tracking)
  targetUid: string;             // who it's on
  modifiers: EffectModifier;
  durationType: EffectDurationType;
  roundsRemaining?: number;      // for "rounds"
  concentration?: boolean;       // requires concentration?
  conditionsApplied?: ConditionId[]; // conditions this effect applied (for cleanup)
  triggers?: EffectTrigger[];
  stackable?: boolean;
  level?: number;                // spell level cast at
}

/* ======================================================================
 * STANDARD EFFECTS LIBRARY
 * ====================================================================== */

export const EFFECT_LIBRARY: Record<string, Omit<ActiveEffect, "id" | "targetUid" | "roundsRemaining">> = {
  bless: {
    name: "Bless", nameTh: "Bless", type: "buff", source: "spell",
    modifiers: { attackBonusDice: "1d4", saveBonusDice: "1d4" },
    durationType: "concentration", concentration: true,
  },
  bane: {
    name: "Bane", nameTh: "Bane", type: "debuff", source: "spell",
    modifiers: { attackBonus: 0, saveBonus: 0 }, // -1d4 implemented as penalty dice
    durationType: "concentration", concentration: true,
  },
  haste: {
    name: "Haste", nameTh: "Haste", type: "buff", source: "spell",
    modifiers: { acBonus: 2, speedMultiplier: 2, extraAction: true },
    durationType: "concentration", concentration: true,
  },
  slow: {
    name: "Slow", nameTh: "Slow", type: "debuff", source: "spell",
    modifiers: { acPenalty: 2, speedMultiplier: 0.5, cannotTakeActions: false },
    durationType: "concentration", concentration: true,
  },
  rage: {
    name: "Rage", nameTh: "Rage", type: "buff", source: "feature",
    modifiers: { damageBonus: 2, damageResistance: ["bludgeoning", "piercing", "slashing"] },
    durationType: "rounds",
  },
  hex: {
    name: "Hex", nameTh: "Hex", type: "debuff", source: "spell",
    modifiers: { damageBonusDice: "1d6", disadvantageOnAbility: [] }, // ability chosen at cast
    durationType: "concentration", concentration: true,
  },
  hunters_mark: {
    name: "Hunter's Mark", nameTh: "Hunter's Mark", type: "buff", source: "spell",
    modifiers: { damageBonusDice: "1d6" },
    durationType: "concentration", concentration: true,
  },
  shield: {
    name: "Shield", nameTh: "Shield", type: "buff", source: "spell",
    modifiers: { acBonus: 5 },
    durationType: "rounds",
  },
  shield_of_faith: {
    name: "Shield of Faith", nameTh: "Shield of Faith", type: "buff", source: "spell",
    modifiers: { acBonus: 2 },
    durationType: "concentration", concentration: true,
  },
  bardic_inspiration: {
    name: "Bardic Inspiration", nameTh: "Bardic Inspiration", type: "buff", source: "feature",
    modifiers: { attackBonusDice: "1d6", saveBonusDice: "1d6", checkBonusDice: "1d6" },
    durationType: "minutes",
  },
  guidance: {
    name: "Guidance", nameTh: "Guidance", type: "buff", source: "spell",
    modifiers: { checkBonusDice: "1d4" },
    durationType: "concentration", concentration: true,
  },
  longstrider: {
    name: "Longstrider", nameTh: "Longstrider", type: "buff", source: "spell",
    modifiers: { speedBonus: 10 },
    durationType: "hours",
  },
  magic_weapon: {
    name: "Magic Weapon", nameTh: "Magic Weapon", type: "buff", source: "spell",
    modifiers: { attackBonus: 1, damageBonus: 1 },
    durationType: "concentration", concentration: true,
  },
  spirit_guardians: {
    name: "Spirit Guardians", nameTh: "Spirit Guardians", type: "aura", source: "spell",
    modifiers: { damageResistance: [] }, // actually deals damage to enemies — handled by triggers
    durationType: "concentration", concentration: true,
    triggers: [{ event: "on_turn_start", action: "deal_3d8_radiant_to_enemies" }],
  },
  spirit_guardians_slow: {
    name: "Spirit Guardians Slow", nameTh: "Spirit Guardians Slow", type: "debuff", source: "spell",
    modifiers: { speedMultiplier: 0.5 },
    durationType: "concentration", concentration: true,
    conditionsApplied: ["restrained"],
  },
  mage_armor: {
    name: "Mage Armor", nameTh: "Mage Armor", type: "buff", source: "spell",
    modifiers: { acBonus: 0 }, // AC becomes 13+DEX — handled specially in AC computation
    durationType: "hours",
  },
  fly: {
    name: "Fly", nameTh: "Fly", type: "buff", source: "spell",
    modifiers: {}, // grants fly speed — handled specially
    durationType: "concentration", concentration: true,
  },
  freedom_of_movement: {
    name: "Freedom of Movement", nameTh: "Freedom of Movement", type: "buff", source: "spell",
    modifiers: {}, // immune to restraint/paralysis — handled specially
    durationType: "hours",
  },
};

/* ======================================================================
 * APPLY EFFECT
 * ====================================================================== */

let effectIdCounter = 0;

export function createEffect(
  effectName: string,
  targetUid: string,
  roundsRemaining?: number,
  level?: number,
  casterUid?: string,
): ActiveEffect | null {
  const template = EFFECT_LIBRARY[effectName];
  if (!template) return null;

  const effect: ActiveEffect = {
    ...template,
    id: `effect_${++effectIdCounter}`,
    targetUid,
    roundsRemaining: roundsRemaining ?? (template.durationType === "rounds" ? 10 : undefined),
    level,
    casterUid,
  };

  return effect;
}

export function applyEffect(
  activeEffects: ActiveEffect[],
  effect: ActiveEffect,
): { effects: ActiveEffect[]; conditionsToApply?: { conditionId: ConditionId; source: any }[]; applied: boolean } {
  // Stacking check: don't stack same-name effects unless stackable
  if (!effect.stackable) {
    const existing = activeEffects.find((e) => e.name === effect.name && e.targetUid === effect.targetUid);
    if (existing) {
      // Replace with new instance (refresh duration)
      activeEffects = activeEffects.filter((e) => e !== existing);
    }
  }

  const effects = [...activeEffects, effect];

  // Check if this effect applies conditions
  let conditionsToApply: { conditionId: ConditionId; source: any }[] | undefined;
  if (effect.conditionsApplied && effect.conditionsApplied.length > 0) {
    conditionsToApply = effect.conditionsApplied.map((conditionId) => ({
      conditionId,
      source: { type: effect.source, name: effect.name },
    }));
  }

  return { effects, conditionsToApply, applied: true };
}

/* ======================================================================
 * REMOVE EFFECT
 * ====================================================================== */

export function removeEffect(
  activeEffects: ActiveEffect[],
  effectId: string,
): { effects: ActiveEffect[]; conditionsToRemove?: ConditionId[]; removed: boolean } {
  const effect = activeEffects.find((e) => e.id === effectId);
  if (!effect) return { effects: activeEffects, removed: false };

  const effects = activeEffects.filter((e) => e.id !== effectId);
  return {
    effects,
    conditionsToRemove: effect.conditionsApplied,
    removed: true,
  };
}

export function removeEffectsByName(
  activeEffects: ActiveEffect[],
  name: string,
): { effects: ActiveEffect[]; conditionsToRemove: ConditionId[]; removed: boolean } {
  const toRemove = activeEffects.filter((e) => e.name === name);
  if (toRemove.length === 0) return { effects: activeEffects, conditionsToRemove: [], removed: false };

  let effects = [...activeEffects];
  const allConditions: ConditionId[] = [];
  for (const e of toRemove) {
    effects = effects.filter((x) => x.id !== e.id);
    if (e.conditionsApplied) allConditions.push(...e.conditionsApplied);
  }
  return { effects, conditionsToRemove: allConditions, removed: true };
}

/* ======================================================================
 * CONCENTRATION MANAGEMENT
 * ====================================================================== */

export function breakConcentration(
  activeEffects: ActiveEffect[],
  casterUid: string,
): { effects: ActiveEffect[]; removed: ActiveEffect[]; conditionsToRemove: ConditionId[] } {
  const concentrationEffects = activeEffects.filter(
    (e) => e.concentration && e.casterUid === casterUid,
  );

  let effects = [...activeEffects];
  const removed: ActiveEffect[] = [];
  const conditionsToRemove: ConditionId[] = [];

  for (const e of concentrationEffects) {
    effects = effects.filter((x) => x.id !== e.id);
    removed.push(e);
    if (e.conditionsApplied) conditionsToRemove.push(...e.conditionsApplied);
  }

  return { effects, removed, conditionsToRemove };
}

/* ======================================================================
 * EFFECT DURATION TICKING
 * ====================================================================== */

export function tickEffectDurations(
  activeEffects: ActiveEffect[],
): { effects: ActiveEffect[]; expired: ActiveEffect[]; conditionsToRemove: ConditionId[] } {
  const expired: ActiveEffect[] = [];
  const remaining: ActiveEffect[] = [];
  const conditionsToRemove: ConditionId[] = [];

  for (const e of activeEffects) {
    if (e.durationType === "permanent" || e.durationType === "until_long_rest" || e.durationType === "until_short_rest" || e.durationType === "hours") {
      remaining.push(e);
      continue;
    }
    if (e.durationType === "rounds" && e.roundsRemaining !== undefined) {
      e.roundsRemaining -= 1;
      if (e.roundsRemaining <= 0) {
        expired.push(e);
        if (e.conditionsApplied) conditionsToRemove.push(...e.conditionsApplied);
        continue;
      }
    }
    remaining.push(e);
  }

  return { effects: remaining, expired, conditionsToRemove };
}

/* ======================================================================
 * EFFECT MODIFIER QUERIES
 * ====================================================================== */

export function getActiveModifiersForTarget(activeEffects: ActiveEffect[], targetUid: string): EffectModifier {
  const targetEffects = activeEffects.filter((e) => e.targetUid === targetUid);
  const combined: EffectModifier = {
    attackBonus: 0,
    saveBonus: 0,
    checkBonus: 0,
    acBonus: 0,
    acPenalty: 0,
    damageBonus: 0,
    speedBonus: 0,
  };

  const bonusDice: string[] = [];
  const penaltyDice: string[] = [];

  for (const e of targetEffects) {
    const m = e.modifiers;
    if (m.attackBonus) combined.attackBonus! += m.attackBonus;
    if (m.attackBonusDice) bonusDice.push(m.attackBonusDice);
    if (m.saveBonus) combined.saveBonus! += m.saveBonus;
    if (m.saveBonusDice) bonusDice.push(m.saveBonusDice);
    if (m.checkBonus) combined.checkBonus! += m.checkBonus;
    if (m.checkBonusDice) bonusDice.push(m.checkBonusDice);
    if (m.acBonus) combined.acBonus! += m.acBonus;
    if (m.acPenalty) combined.acPenalty! += m.acPenalty;
    if (m.damageBonus) combined.damageBonus! += m.damageBonus;
    if (m.damageBonusDice) bonusDice.push(m.damageBonusDice);
    if (m.speedBonus) combined.speedBonus! += m.speedBonus;
    if (m.speedMultiplier) {
      combined.speedMultiplier = combined.speedMultiplier
        ? combined.speedMultiplier * m.speedMultiplier
        : m.speedMultiplier;
    }
    if (m.attackDisadvantage) combined.attackDisadvantage = true;
    if (m.saveDisadvantage) combined.saveDisadvantage = true;
    if (m.checkDisadvantage) combined.checkDisadvantage = true;
    if (m.extraAction) combined.extraAction = true;
    if (m.cannotTakeActions) combined.cannotTakeActions = true;
    if (m.damageResistance) {
      combined.damageResistance = [...(combined.damageResistance || []), ...m.damageResistance];
    }
    if (m.disadvantageOnAbility) {
      combined.disadvantageOnAbility = [...(combined.disadvantageOnAbility || []), ...m.disadvantageOnAbility];
    }
  }

  if (bonusDice.length > 0) {
    (combined as any)._bonusDice = bonusDice;
  }

  return combined;
}

export function getACBonusFromEffects(activeEffects: ActiveEffect[], targetUid: string): number {
  const mods = getActiveModifiersForTarget(activeEffects, targetUid);
  return (mods.acBonus || 0) - (mods.acPenalty || 0);
}

export function getSpeedBonusFromEffects(activeEffects: ActiveEffect[], targetUid: string, baseSpeed: number): number {
  const mods = getActiveModifiersForTarget(activeEffects, targetUid);
  let speed = baseSpeed + (mods.speedBonus || 0);
  if (mods.speedMultiplier) speed = Math.floor(speed * mods.speedMultiplier);
  return speed;
}

export function hasConcentrationEffect(activeEffects: ActiveEffect[], casterUid: string): boolean {
  return activeEffects.some((e) => e.concentration && e.casterUid === casterUid);
}
