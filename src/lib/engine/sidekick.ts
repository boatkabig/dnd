/**
 * Phase 5 — Sidekick Engine (D&D 2024 sidekick rules).
 *
 * A solo player often wants ONE loyal companion. The 2024 rules (carried from
 * Tasha's) let any creature become a sidekick of one of three classes:
 *   - Warrior     — martial muscle (extra attacks, tough)
 *   - Expert      — skills, Cunning Action, Reliable Talent
 *   - Spellcaster — arcane/divine support (cantrips + slots)
 *
 * This module is a PURE, deterministic data model + builder:
 *   buildSidekick(spec, level) -> a scaled stat block
 *   sidekickTurnIntent(block, ctx) -> what the sidekick should DO this turn
 *
 * No Math.random / Date.now. Any roll needed by the turn logic is INJECTED.
 */

import { getProficiencyBonus } from "./character";

export type SidekickClass = "warrior" | "expert" | "spellcaster";

/** The base creature the sidekick is built from (before class levels). */
export interface SidekickBase {
  name: string;
  /** ability modifiers (already computed, e.g. +3), not raw scores */
  mods: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  baseAc: number; // AC from natural armor / worn armor before Dex is folded in
  /** average HP the base creature has at "level 0" (before sidekick hit dice) */
  baseHp: number;
  hitDie: 6 | 8 | 10; // d6 expert-ish, d8 default, d10 warrior
  speed: number;
  /** primary attack the base creature makes */
  attack: {
    name: string;
    ability: keyof SidekickBase["mods"]; // which mod drives to-hit/damage
    /** damage dice per hit, e.g. "1d6" — proficiency/ability added by builder */
    damageDice: string;
    reach: number; // feet
    ranged?: boolean;
  };
  proficientSkills?: string[];
  spellcastingAbility?: keyof SidekickBase["mods"]; // for spellcaster archetype
}

export interface SidekickFeature {
  level: number;
  key: string;
  name: string;
  desc: string;
}

/** A fully-built, level-scaled sidekick stat block. */
export interface SidekickBlock {
  name: string;
  klass: SidekickClass;
  level: number;
  proficiencyBonus: number;
  ac: number;
  maxHp: number;
  speed: number;
  mods: SidekickBase["mods"];
  attacksPerAction: number;
  attack: {
    name: string;
    toHit: number;
    damageDice: string;
    damageBonus: number;
    reach: number;
    ranged: boolean;
    critRange: number; // 20 normally, 19 with Improved Critical
  };
  features: SidekickFeature[];
  /** spellcaster only */
  spellcasting?: {
    ability: keyof SidekickBase["mods"];
    saveDc: number;
    attackBonus: number;
    cantripsKnown: number;
    /** slot count per spell level, index 1..5 */
    slots: Record<number, number>;
    maxSpellLevel: number;
  };
}

/* ======================================================================
 * ARCHETYPE FEATURE PROGRESSIONS (2024, condensed to the mechanically
 * load-bearing features a solo companion actually uses)
 * ====================================================================== */

const WARRIOR_FEATURES: SidekickFeature[] = [
  { level: 1, key: "martial_role", name: "Bolstered Fortitude", desc: "HP hit die d10; proficient with all armor & weapons." },
  { level: 3, key: "improved_critical", name: "Improved Critical", desc: "Critical hits on 19-20." },
  { level: 5, key: "extra_attack", name: "Extra Attack", desc: "Attack twice per Attack action." },
  { level: 7, key: "second_wind", name: "Second Wind", desc: "Regain 1d10 + level HP as a bonus action (1/rest)." },
];

const EXPERT_FEATURES: SidekickFeature[] = [
  { level: 1, key: "helpful", name: "Helpful", desc: "Grant the Help action as a bonus action." },
  { level: 2, key: "cunning_action", name: "Cunning Action", desc: "Dash/Disengage/Hide as a bonus action." },
  { level: 3, key: "expertise", name: "Expertise", desc: "Double proficiency on two skills." },
  { level: 5, key: "extra_attack", name: "Extra Attack", desc: "Attack twice per Attack action." },
  { level: 7, key: "evasion", name: "Evasion", desc: "Take no damage on a successful Dex save (half on fail)." },
];

const SPELLCASTER_FEATURES: SidekickFeature[] = [
  { level: 1, key: "spellcasting", name: "Spellcasting", desc: "Cast cantrips and leveled spells from a chosen list." },
  { level: 3, key: "potent_cantrips", name: "Potent Cantrips", desc: "Targets take half damage from cantrips even on a miss/save." },
  { level: 5, key: "expanded_slots", name: "Empowered Casting", desc: "Access to higher-level spell slots." },
];

const FEATURES_BY_CLASS: Record<SidekickClass, SidekickFeature[]> = {
  warrior: WARRIOR_FEATURES,
  expert: EXPERT_FEATURES,
  spellcaster: SPELLCASTER_FEATURES,
};

/** Default hit die each class uses if the base creature doesn't override it. */
const CLASS_HIT_DIE: Record<SidekickClass, 6 | 8 | 10> = {
  warrior: 10,
  expert: 8,
  spellcaster: 6,
};

/** Spellcaster slot table (subset of the full caster table, levels 1-10). */
const CASTER_SLOTS: Record<number, Record<number, number>> = {
  1: { 1: 2 },
  2: { 1: 3 },
  3: { 1: 4, 2: 2 },
  4: { 1: 4, 2: 3 },
  5: { 1: 4, 2: 3, 3: 2 },
  6: { 1: 4, 2: 3, 3: 3 },
  7: { 1: 4, 2: 3, 3: 3, 4: 1 },
  8: { 1: 4, 2: 3, 3: 3, 4: 2 },
  9: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
};

function cantripsKnownFor(level: number): number {
  if (level >= 10) return 4;
  if (level >= 4) return 3;
  return 2;
}

/** Average HP contributed by one hit die at a given CON mod ("take average"). */
function avgHitDie(die: 6 | 8 | 10, conMod: number): number {
  const avg = die / 2 + 1; // d6→4, d8→5, d10→6 (2024 "take average" rule)
  return Math.max(1, avg + conMod);
}

/** Features unlocked at or below `level`. */
export function getSidekickFeatures(klass: SidekickClass, level: number): SidekickFeature[] {
  return FEATURES_BY_CLASS[klass].filter((f) => f.level <= level);
}

export function hasSidekickFeature(klass: SidekickClass, level: number, key: string): boolean {
  return getSidekickFeatures(klass, level).some((f) => f.key === key);
}

/* ======================================================================
 * BUILDER
 * ====================================================================== */

/**
 * Build a level-scaled sidekick stat block from a base creature + class.
 * @param level sidekick class level (1-10 supported; clamped)
 */
export function buildSidekick(
  base: SidekickBase,
  klass: SidekickClass,
  level: number,
): SidekickBlock {
  const lvl = Math.max(1, Math.min(10, Math.floor(level)));
  const pb = getProficiencyBonus(lvl);
  const die = klass ? CLASS_HIT_DIE[klass] : base.hitDie;

  // HP: base creature HP + (level) hit dice averaged, first die maximized.
  const conMod = base.mods.con;
  let hp = base.baseHp + (die + conMod); // level 1 die maxed
  for (let i = 2; i <= lvl; i++) hp += avgHitDie(die, conMod);
  hp = Math.max(1, hp);

  const features = getSidekickFeatures(klass, lvl);
  const attacksPerAction = features.some((f) => f.key === "extra_attack") ? 2 : 1;

  // AC: warriors gain modest scaling from martial training.
  let ac = base.baseAc;
  if (klass === "warrior" && lvl >= 5) ac += 1;

  const atkMod = base.mods[base.attack.ability];
  const critRange = hasSidekickFeature(klass, lvl, "improved_critical") ? 19 : 20;

  const block: SidekickBlock = {
    name: base.name,
    klass,
    level: lvl,
    proficiencyBonus: pb,
    ac,
    maxHp: hp,
    speed: base.speed,
    mods: base.mods,
    attacksPerAction,
    attack: {
      name: base.attack.name,
      toHit: atkMod + pb,
      damageDice: base.attack.damageDice,
      damageBonus: atkMod,
      reach: base.attack.reach,
      ranged: !!base.attack.ranged,
      critRange,
    },
    features,
  };

  if (klass === "spellcaster") {
    const ability = base.spellcastingAbility ?? "int";
    const castMod = base.mods[ability];
    const slots = CASTER_SLOTS[lvl] ?? {};
    const maxSpellLevel = Object.keys(slots).reduce((m, k) => Math.max(m, Number(k)), 0);
    block.spellcasting = {
      ability,
      saveDc: 8 + pb + castMod,
      attackBonus: pb + castMod,
      cantripsKnown: cantripsKnownFor(lvl),
      slots,
      maxSpellLevel,
    };
  }

  return block;
}

/* ======================================================================
 * TURN INTENT — a pure "what should the sidekick do?" decision.
 * ====================================================================== */

export type SidekickAction = "attack" | "cast_attack" | "heal_ally" | "help" | "dodge" | "disengage";

export interface SidekickTurnContext {
  /** sidekick's current HP fraction 0..1 */
  selfHpFraction: number;
  /** most-wounded ally HP fraction 0..1 (the PC), null if none */
  woundedAllyHpFraction: number | null;
  /** is there a valid enemy in reach/range? */
  enemyInReach: boolean;
  /** does the sidekick still have leveled slots available? */
  hasSpellSlot: boolean;
  /** can this sidekick heal (spellcaster with a healing spell prepared)? */
  canHeal: boolean;
}

export interface SidekickTurnIntent {
  action: SidekickAction;
  reason: string;
  targetsAlly: boolean;
}

/**
 * Decide the sidekick's turn. Deterministic priority ladder:
 *  1. If badly wounded (<25%) and no healing available → Dodge to survive.
 *  2. If an ally is critically wounded (<35%) and we can heal → heal.
 *  3. If an enemy is in reach → attack (spell attack for casters with slots).
 *  4. If a caster is out of slots but an enemy is in reach → weapon attack.
 *  5. Otherwise Help an ally, or Disengage if cornered.
 */
export function sidekickTurnIntent(
  block: SidekickBlock,
  ctx: SidekickTurnContext,
): SidekickTurnIntent {
  const isCaster = block.klass === "spellcaster";

  if (ctx.selfHpFraction < 0.25 && !(ctx.canHeal && ctx.hasSpellSlot)) {
    return { action: "dodge", reason: "บาดเจ็บหนัก ตั้งรับเพื่อเอาตัวรอด", targetsAlly: false };
  }

  if (
    ctx.canHeal &&
    ctx.hasSpellSlot &&
    ctx.woundedAllyHpFraction !== null &&
    ctx.woundedAllyHpFraction < 0.35
  ) {
    return { action: "heal_ally", reason: "พันธมิตรใกล้ล้ม รักษาก่อน", targetsAlly: true };
  }

  if (ctx.enemyInReach) {
    if (isCaster && ctx.hasSpellSlot) {
      return { action: "cast_attack", reason: "ร่ายเวทโจมตีศัตรู", targetsAlly: false };
    }
    return { action: "attack", reason: "โจมตีศัตรูที่อยู่ในระยะ", targetsAlly: false };
  }

  if (ctx.woundedAllyHpFraction !== null) {
    return { action: "help", reason: "ไม่มีศัตรูในระยะ ช่วยเหลือพันธมิตร", targetsAlly: true };
  }

  return { action: "disengage", reason: "ถอนตัวเพื่อหาตำแหน่งที่ดีกว่า", targetsAlly: false };
}

/* ======================================================================
 * ATTACK RESOLUTION — pure, deterministic (dice INJECTED)
 * ====================================================================== */

export interface SidekickAttackParams {
  /** target's (effective) AC */
  targetAc: number;
  /** the natural d20 roll (1-20), injected by the caller */
  d20: number;
  /** total of the weapon's damage DICE only (ability/prof added here). */
  damageDiceTotal: number;
  /** extra dice total rolled again for a crit (D&D 2024 "roll dice twice"). */
  critDiceTotal?: number;
}

export interface SidekickAttackResult {
  hit: boolean;
  crit: boolean;
  toHit: number;
  /** d20 + toHit */
  total: number;
  /** final damage (0 on a miss), always >= 1 on a hit. */
  damage: number;
}

/**
 * Resolve one sidekick weapon/spell attack against a target AC.
 *
 * Pure and deterministic — every random input (the d20, the damage dice) is
 * injected. A natural 1 always misses; a natural 20 always hits. A crit occurs
 * on a hit whose d20 met the block's critRange (20, or 19 with Improved
 * Critical) and rolls the weapon dice twice (2024 rule).
 *
 * NOTE: this resolves the sidekick's OWN roll only. It never writes enemy HP —
 * the caller applies `result.damage` through the app's bridge seam
 * (hitEnemy/applyEnemyDamage), keeping the combat bridge the single HP owner.
 */
export function resolveSidekickAttack(
  block: SidekickBlock,
  params: SidekickAttackParams,
): SidekickAttackResult {
  const toHit = block.attack.toHit;
  const total = params.d20 + toHit;
  const isNat20 = params.d20 === 20;
  const isNat1 = params.d20 === 1;
  const hit = !isNat1 && (isNat20 || total >= params.targetAc);
  const crit = hit && params.d20 >= block.attack.critRange;
  let damage = 0;
  if (hit) {
    const critDice = crit ? (params.critDiceTotal ?? params.damageDiceTotal) : 0;
    damage = Math.max(1, params.damageDiceTotal + critDice + block.attack.damageBonus);
  }
  return { hit, crit, toHit, total, damage };
}

/* ======================================================================
 * READY-MADE BASE CREATURES (common solo companions)
 * ====================================================================== */

export const SIDEKICK_BASES: Record<string, SidekickBase> = {
  guard: {
    name: "องครักษ์ (Guard)",
    mods: { str: 1, dex: 1, con: 2, int: 0, wis: 0, cha: 0 },
    baseAc: 16,
    baseHp: 5,
    hitDie: 10,
    speed: 30,
    attack: { name: "Spear", ability: "str", damageDice: "1d6", reach: 5 },
    proficientSkills: ["perception"],
  },
  scout: {
    name: "หน่วยสอดแนม (Scout)",
    mods: { str: 0, dex: 2, con: 1, int: 0, wis: 1, cha: 0 },
    baseAc: 13,
    baseHp: 4,
    hitDie: 8,
    speed: 30,
    attack: { name: "Shortbow", ability: "dex", damageDice: "1d6", reach: 80, ranged: true },
    proficientSkills: ["stealth", "survival", "nature"],
  },
  acolyte: {
    name: "นักบวช (Acolyte)",
    mods: { str: 0, dex: 0, con: 1, int: 0, wis: 2, cha: 1 },
    baseAc: 12,
    baseHp: 3,
    hitDie: 6,
    speed: 30,
    attack: { name: "Mace", ability: "str", damageDice: "1d6", reach: 5 },
    spellcastingAbility: "wis",
    proficientSkills: ["religion", "medicine"],
  },
};
