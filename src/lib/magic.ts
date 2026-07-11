/**
 * Magic Engine — manages spellcasting rules and spell resolution.
 *
 * Architecture:
 *   Player → Cast Spell → Magic Engine
 *     ├── Validate (slot, component, range)
 *     ├── Consume Resource
 *     ├── Select Target
 *     └── Resolve Spell → delegates to:
 *         ├── Effects Engine (buffs/debuffs/conditions)
 *         ├── Combat Engine (damage/healing/death)
 *         └── Dice Engine (rolls)
 *
 * 17 sub-systems (8.1–8.17)
 */

import { roll, type RollContext } from "./diceEngine";
import { mod, profByLevel } from "./gameData";
import type { ConditionId } from "./conditions";

/* ======================================================================
 * TYPES
 * ====================================================================== */

export type SpellcastingAbility = "int" | "wis" | "cha";
export type SpellSchool = "Abjuration" | "Conjuration" | "Divination" | "Enchantment" | "Evocation" | "Illusion" | "Necromancy" | "Transmutation";
export type SpellRange = "self" | "touch" | "ft" | "sight" | "unlimited";
export type SpellDurationType = "instantaneous" | "concentration" | "timed" | "permanent" | "until_dispelled";
export type AoEShape = "sphere" | "cube" | "cone" | "line" | "cylinder" | "emanation";
export type SpellResolutionType = "attack_roll" | "saving_throw" | "automatic" | "healing" | "damage_auto" | "summon";
export type TargetType = "self" | "creature" | "object" | "point" | "area" | "multiple";

export interface SpellDef {
  index: string; name: string; level: number; school: SpellSchool;
  castingTime: string; range: SpellRange; rangeFt: number;
  components: string[]; material?: string;
  duration: string; durationType: SpellDurationType; durationRounds?: number;
  concentration: boolean; ritual: boolean;
  description: string; higherLevels?: string;
  resolution: SpellResolutionType;
  saveAbility?: string; saveSuccess?: "half" | "none" | "negate";
  damage?: string; damageType?: string; damageScaling?: "cantrip" | "slot";
  healing?: string;
  aoe?: { shape: AoEShape; size: number; sizeUnit: string };
  targets: TargetType; maxTargets?: number;
  tags?: string[];
  conditionsApplied?: ConditionId[];
  effectName?: string;
  upcastDamage?: string; upcastTargets?: number; upcastDuration?: number;
}

/* ======================================================================
 * 8.1 SPELLCASTING
 * ====================================================================== */

export interface SpellcastingInfo {
  ability: SpellcastingAbility;
  spellAttackBonus: number;
  spellSaveDC: number;
  spellSlots: number[];
  spellSlotsMax: number[];
  knownSpells: string[];
  preparedSpells?: string[];
  ritualCaster: boolean;
}

export function createSpellcastingInfo(
  ability: SpellcastingAbility, abilityScore: number, charLevel: number,
  slots: number[], slotsMax: number[], knownSpells: string[],
  ritualCaster: boolean = false,
): SpellcastingInfo {
  const am = mod(abilityScore);
  const prof = profByLevel(charLevel);
  return { ability, spellAttackBonus: am + prof, spellSaveDC: 8 + am + prof, spellSlots: slots, spellSlotsMax: slotsMax, knownSpells, ritualCaster };
}

/* 8.2 SPELL SLOTS */
export function hasSpellSlot(info: SpellcastingInfo, level: number): boolean {
  if (level === 0) return true;
  return (info.spellSlots[level - 1] || 0) > 0;
}
export function consumeSpellSlot(info: SpellcastingInfo, level: number): boolean {
  if (level === 0) return true;
  if ((info.spellSlots[level - 1] || 0) <= 0) return false;
  info.spellSlots[level - 1] -= 1;
  return true;
}
export function recoverAllSlots(info: SpellcastingInfo): void { info.spellSlots = [...info.spellSlotsMax]; }

/* ======================================================================
 * 8.2b PREPARED vs KNOWN SPELLCASTING (D&D 2024)
 * ----------------------------------------------------------------------
 * The engine OWNS the rule for "can this class change its spells, and how
 * many spells does it hold". DnDSolo asks these helpers instead of
 * hard-coding class logic.
 *
 *   Prepared casters (Cleric/Druid/Paladin/Wizard): choose a daily list;
 *     may swap the whole list on a Long Rest. Size = ability mod + caster
 *     level (Paladin is a half-caster → floor(level/2)). Wizard prepares
 *     from its spellbook. Minimum 1.
 *   Known casters (Bard/Sorcerer/Ranger/Warlock): a fixed known list; may
 *     only swap ONE spell when they level up. Size is read from the class
 *     "spells known" table.
 * ====================================================================== */

export type SpellcastingKind = "prepared" | "known" | "none";
export type SpellChangeWhen = "long_rest" | "level_up" | "none";

const PREPARED_CASTERS = new Set(["cleric", "druid", "paladin", "wizard"]);
const KNOWN_CASTERS = new Set(["bard", "sorcerer", "ranger", "warlock"]);

/** Half-casters advance their effective caster level at half rate (min 1). */
const HALF_CASTERS = new Set(["paladin", "ranger"]);

/** D&D 2024 "Spells Known" tables for the fixed-known classes (index 0 = Lv.1). */
const SPELLS_KNOWN_TABLE: Record<string, number[]> = {
  bard:     [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
  sorcerer: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
  ranger:   [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
  warlock:  [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
};

export function getSpellcastingKind(cls: string): SpellcastingKind {
  const k = cls.toLowerCase();
  if (PREPARED_CASTERS.has(k)) return "prepared";
  if (KNOWN_CASTERS.has(k)) return "known";
  return "none";
}

/** When (if ever) a class may change which spells it holds. */
export function getSpellChangeWhen(cls: string): SpellChangeWhen {
  const kind = getSpellcastingKind(cls);
  if (kind === "prepared") return "long_rest";
  if (kind === "known") return "level_up";
  return "none";
}

/**
 * Maximum number of leveled spells the class may hold at once
 * (prepared list size for prepared casters, known list size for known casters).
 * Cantrips are NOT counted here. Returns 0 for non-casters.
 */
export function getMaxSpellsHeld(cls: string, level: number, abilityMod: number): number {
  const k = cls.toLowerCase();
  const lv = Math.max(1, Math.min(20, level));
  if (PREPARED_CASTERS.has(k)) {
    const casterLevel = HALF_CASTERS.has(k) ? Math.floor(lv / 2) : lv;
    return Math.max(1, abilityMod + Math.max(1, casterLevel));
  }
  if (KNOWN_CASTERS.has(k)) {
    return SPELLS_KNOWN_TABLE[k]?.[lv - 1] ?? 0;
  }
  return 0;
}

/** Convenience: full description of a class's spellcasting management rule. */
export interface SpellcastingRule {
  kind: SpellcastingKind;
  changeWhen: SpellChangeWhen;
  maxHeld: number;         // 0 for non-casters (unlimited/na)
  fromSpellbook: boolean;  // Wizard prepares from a spellbook
}

export function getSpellcastingRule(cls: string, level: number, abilityMod: number): SpellcastingRule {
  const kind = getSpellcastingKind(cls);
  return {
    kind,
    changeWhen: getSpellChangeWhen(cls),
    maxHeld: getMaxSpellsHeld(cls, level, abilityMod),
    fromSpellbook: cls.toLowerCase() === "wizard",
  };
}

/**
 * May this class re-prepare (swap) its prepared spells on a long rest?
 * True only for prepared casters (Cleric/Druid/Paladin/Wizard); known casters
 * and non-casters cannot (they change spells only on level-up / never).
 */
export function canReprepareOnLongRest(cls: string): boolean {
  return getSpellChangeWhen(cls) === "long_rest";
}

export interface ReprepareResult {
  /** whether the requested change is allowed at all (prepared caster only). */
  ok: boolean;
  /** the new prepared list of LEVELED spells (capped at maxHeld). */
  prepared: string[];
  /** how many the class may hold (0 = not a prepared caster). */
  maxHeld: number;
  /** requested entries dropped because they exceeded the cap. */
  dropped: string[];
  reasonTh: string;
}

/**
 * Re-prepare a prepared caster's LEVELED spells from its available pool
 * (spellbook / class list) on a long rest. Cantrips are NOT managed here (they
 * are always available and never counted against the cap).
 *
 * Rules owned here (D&D 2024):
 *   - only prepared casters may re-prepare, and only on a long rest;
 *   - the new list must be a subset of `available` (can't prepare a spell you
 *     don't have access to);
 *   - the list is capped at `getMaxSpellsHeld(cls, level, abilityMod)`.
 *
 * Deterministic: on over-cap the FIRST `maxHeld` valid selections are kept and
 * the rest reported in `dropped`, so the UI can surface exactly what was cut.
 */
export function reprepareSpells(
  cls: string,
  level: number,
  abilityMod: number,
  available: string[],
  desired: string[],
): ReprepareResult {
  const maxHeld = getMaxSpellsHeld(cls, level, abilityMod);
  if (!canReprepareOnLongRest(cls)) {
    return { ok: false, prepared: [], maxHeld, dropped: [], reasonTh: "คลาสนี้เปลี่ยนเวทที่เตรียมไม่ได้" };
  }
  const pool = new Set(available);
  const prepared: string[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const idx of desired) {
    if (seen.has(idx)) continue;        // de-dupe
    if (!pool.has(idx)) { dropped.push(idx); continue; } // not accessible
    seen.add(idx);
    if (prepared.length < maxHeld) prepared.push(idx);
    else dropped.push(idx);             // over the cap
  }
  return {
    ok: true,
    prepared,
    maxHeld,
    dropped,
    reasonTh: dropped.length > 0
      ? `เตรียมได้สูงสุด ${maxHeld} เวท — เกินโควตา ${dropped.length} เวทถูกตัดออก`
      : `เตรียมเวทใหม่ ${prepared.length}/${maxHeld}`,
  };
}

/* ======================================================================
 * 8.3 CAST SPELL
 * ====================================================================== */

export type CastResult = "success" | "no_slot" | "not_known" | "not_prepared" | "missing_components" | "out_of_range" | "invalid_target" | "concentrating_already" | "silenced" | "incapacitated";

export interface CastValidation { valid: boolean; result: CastResult; reasonTh: string; }

export function validateCast(
  info: SpellcastingInfo, spell: SpellDef, slotLevel: number,
  targetDistance: number, hasComponents: { verbal: boolean; somatic: boolean; material: boolean },
  isSilenced: boolean = false, isIncapacitated: boolean = false, isConcentrating: boolean = false,
): CastValidation {
  if (isIncapacitated) return { valid: false, result: "incapacitated", reasonTh: "ไร้ความสามารถ — ร่ายเวทไม่ได้" };
  if (isSilenced && spell.components.includes("V")) return { valid: false, result: "silenced", reasonTh: "ถูกสะกดเงียบ — ร่ายเวทที่ต้องใช้เสียงไม่ได้" };
  if (!info.knownSpells.includes(spell.index) && !info.preparedSpells?.includes(spell.index)) return { valid: false, result: "not_known", reasonTh: "ไม่รู้เวทนี้" };
  if (spell.level > 0 && !hasSpellSlot(info, slotLevel)) return { valid: false, result: "no_slot", reasonTh: `ไม่มี spell slot ระดับ ${slotLevel}` };
  if (slotLevel < spell.level) return { valid: false, result: "no_slot", reasonTh: `ต้องร่ายที่ slot ระดับ ${spell.level} ขึ้นไป` };
  if (spell.components.includes("V") && !hasComponents.verbal) return { valid: false, result: "missing_components", reasonTh: "ต้องการ V (Verbal)" };
  if (spell.components.includes("S") && !hasComponents.somatic) return { valid: false, result: "missing_components", reasonTh: "ต้องการ S (Somatic)" };
  if (spell.components.includes("M") && !hasComponents.material) return { valid: false, result: "missing_components", reasonTh: `ต้องการ M: ${spell.material || ""}` };
  if (targetDistance > spell.rangeFt) return { valid: false, result: "out_of_range", reasonTh: `เป้าหมายอยู่ไกลเกินระยะ (${targetDistance} > ${spell.rangeFt} ฟุต)` };
  if (spell.concentration && isConcentrating) return { valid: false, result: "concentrating_already", reasonTh: "กำลังรักษาสมาธิเวทอื่นอยู่" };
  return { valid: true, result: "success", reasonTh: "ผ่าน" };
}

/* 8.4 COMPONENTS */
export interface ComponentCheck { verbal: boolean; somatic: boolean; material: boolean; materialCost?: string; materialConsumed?: boolean; }
export function checkComponents(spell: SpellDef, hasFocus: boolean, hasMaterialPouch: boolean): ComponentCheck {
  return {
    verbal: !spell.components.includes("V") || true,
    somatic: !spell.components.includes("S") || true,
    material: !spell.components.includes("M") || hasFocus || hasMaterialPouch,
    materialCost: spell.material,
    materialConsumed: spell.material?.toLowerCase().includes("consume"),
  };
}

/* 8.5/8.6 TARGETING & RANGE */
export function getRangeFt(spell: SpellDef): number {
  switch (spell.range) { case "self": return 0; case "touch": return 5; case "sight": return 1000; case "unlimited": return 99999; default: return spell.rangeFt; }
}
export function isValidTarget(spell: SpellDef, targetType: string, distance: number): boolean {
  if (distance > getRangeFt(spell)) return false;
  if (spell.targets === "self" && targetType !== "self") return false;
  return true;
}

/* 8.8 CONCENTRATION */
export interface ConcentrationState { spellIndex: string; effectId?: string; casterUid: string; startedRound: number; }
export function startConcentration(spell: SpellDef, casterUid: string, round: number, effectId?: string): ConcentrationState | null {
  if (!spell.concentration) return null;
  return { spellIndex: spell.index, effectId, casterUid, startedRound: round };
}
export function concentrationCheck(conMod: number, damageTaken: number): { success: boolean; die: number; total: number; dc: number } {
  const dc = Math.min(30, Math.max(10, Math.floor(damageTaken / 2))); // D&D 2024: cap DC at 30
  const result = roll(`1d20+${conMod}`);
  return { success: result.total >= dc, die: result.naturalDie ?? 0, total: result.total, dc };
}

/* ======================================================================
 * 8.9 SPELL RESOLUTION
 * ====================================================================== */

export interface SpellResolutionResult {
  type: SpellResolutionType; hit?: boolean; isCrit?: boolean;
  damage?: number; damageType?: string; healing?: number;
  saveRoll?: number; saveDC?: number; saveSuccess?: boolean;
  conditionsApplied?: ConditionId[]; effectApplied?: string;
  history: string; historyTh: string;
}

export function resolveSpell(
  spell: SpellDef, slotLevel: number, charLevel: number,
  spellAttackBonus: number, spellSaveDC: number,
  targetAC: number = 10, targetSaveMod: number = 0,
  targetResistances: string[] = [], targetImmunities: string[] = [], targetVulnerabilities: string[] = [],
  ctx: RollContext = {},
): SpellResolutionResult {
  const upcastDmg = getUpcastDamage(spell, slotLevel, charLevel);

  switch (spell.resolution) {
    case "attack_roll": {
      const result = roll(`1d20+${spellAttackBonus}`, ctx);
      const die = result.naturalDie ?? 0;
      const isCrit = die === 20;
      const hit = die !== 1 && (isCrit || result.total >= targetAC);
      let damage: number | undefined;
      if (hit && upcastDmg) {
        let dmgExpr = upcastDmg;
        if (isCrit) { const m = dmgExpr.match(/^(\d+)d(\d+)([+-]\d+)?$/); if (m) dmgExpr = `${parseInt(m[1]) * 2}d${m[2]}${m[3] || ""}`; }
        const dmgResult = roll(dmgExpr);
        damage = dmgResult.total;
        if (spell.damageType) { if (targetImmunities.includes(spell.damageType)) damage = 0; else if (targetResistances.includes(spell.damageType)) damage = Math.floor(damage / 2); else if (targetVulnerabilities.includes(spell.damageType)) damage *= 2; }
      }
      return { type: "attack_roll", hit, isCrit, damage, damageType: spell.damageType, history: result.history, historyTh: `d20(${die})+${spellAttackBonus}=${result.total} vs AC ${targetAC} → ${hit ? "โดน" : "พลาด"}${isCrit ? " (CRIT!)" : ""}${damage ? ` ดาเมจ ${damage}` : ""}` };
    }
    case "saving_throw": {
      const saveResult = roll(`1d20+${targetSaveMod}`);
      const saveDie = saveResult.naturalDie ?? 0;
      const saveSuccess = saveResult.total >= spellSaveDC;
      let damage: number | undefined;
      if (upcastDmg) {
        const dmgResult = roll(upcastDmg);
        let rawDmg = dmgResult.total;
        if (saveSuccess) { if (spell.saveSuccess === "half") rawDmg = Math.floor(rawDmg / 2); else if (spell.saveSuccess === "negate") rawDmg = 0; }
        if (spell.damageType) { if (targetImmunities.includes(spell.damageType)) rawDmg = 0; else if (targetResistances.includes(spell.damageType)) rawDmg = Math.floor(rawDmg / 2); else if (targetVulnerabilities.includes(spell.damageType)) rawDmg *= 2; }
        damage = rawDmg;
      }
      return { type: "saving_throw", saveRoll: saveResult.total, saveDC: spellSaveDC, saveSuccess, damage, damageType: spell.damageType, conditionsApplied: spell.conditionsApplied, history: saveResult.history, historyTh: `${spell.saveAbility?.toUpperCase()} save: d20(${saveDie})+${targetSaveMod}=${saveResult.total} vs DC ${spellSaveDC} → ${saveSuccess ? "ผ่าน" : "ไม่ผ่าน"}${damage ? ` ดาเมจ ${damage}` : ""}` };
    }
    case "automatic":
    case "damage_auto": {
      let damage: number | undefined;
      if (upcastDmg) {
        const dmgResult = roll(upcastDmg);
        damage = dmgResult.total;
        if (spell.damageType) { if (targetImmunities.includes(spell.damageType)) damage = 0; else if (targetResistances.includes(spell.damageType)) damage = Math.floor(damage / 2); else if (targetVulnerabilities.includes(spell.damageType)) damage *= 2; }
      }
      return { type: "automatic", damage, damageType: spell.damageType, conditionsApplied: spell.conditionsApplied, effectApplied: spell.effectName, history: "Auto", historyTh: `เวทอัตโนมัติ${damage ? ` ดาเมจ ${damage}` : ""}${spell.conditionsApplied ? ` ใส่สถานะ ${spell.conditionsApplied.join(", ")}` : ""}` };
    }
    case "healing": {
      const healExpr = spell.healing || upcastDmg || "1d8";
      const healResult = roll(healExpr);
      return { type: "healing", healing: healResult.total, history: healResult.history, historyTh: `รักษา ${healResult.total} HP` };
    }
    case "summon":
      return { type: "summon", effectApplied: spell.effectName, history: "Summon", historyTh: `อัญเชิญ${spell.effectName ? ` ${spell.effectName}` : ""}` };
    default:
      return { type: "automatic", history: "Unknown", historyTh: "ไม่ทราบผลเวท" };
  }
}

/* 8.10 SCALING */
export function getUpcastDamage(spell: SpellDef, slotLevel: number, charLevel: number): string | undefined {
  if (!spell.damage) return undefined;
  if (spell.damageScaling === "cantrip") {
    const tier = [1, 5, 11, 17].filter((t) => charLevel >= t).length;
    const m = spell.damage.match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if (m) return `${parseInt(m[1]) * tier}d${m[2]}${m[3] || ""}`;
    return spell.damage;
  }
  if (spell.damageScaling === "slot" && slotLevel > spell.level) {
    const above = slotLevel - spell.level;
    if (spell.upcastDamage) { const m = spell.upcastDamage.match(/^(\d+)d(\d+)$/); if (m) return `${spell.damage}+${parseInt(m[1]) * above}d${m[2]}`; }
    if (spell.index === "magic-missile") { const darts = 3 + above; return `${darts}d4+${darts}`; }
  }
  return spell.damage;
}
export function getUpcastTargets(spell: SpellDef, slotLevel: number): number {
  if (!spell.maxTargets) return 1;
  if (slotLevel > spell.level && spell.upcastTargets) return spell.maxTargets + spell.upcastTargets * (slotLevel - spell.level);
  return spell.maxTargets;
}

/* 8.11 RITUAL */
export function canCastAsRitual(spell: SpellDef, info: SpellcastingInfo): boolean { return spell.ritual && info.ritualCaster && info.knownSpells.includes(spell.index); }
export function getRitualCastingTime(spell: SpellDef): string { return `${spell.castingTime} + 10 min (ritual)`; }

/* 8.12 COUNTER MAGIC */
export function resolveCounterspell(targetLv: number, counterLv: number, abMod: number = 0): { success: boolean; die: number; total: number; dc: number; historyTh: string } {
  if (counterLv >= targetLv) return { success: true, die: 0, total: 0, dc: 0, historyTh: `Counterspell ระดับ ${counterLv} ≥ ${targetLv} → ยกเลิกอัตโนมัติ` };
  const dc = 10 + targetLv; const result = roll(`1d20+${abMod}`); const s = result.total >= dc;
  return { success: s, die: result.naturalDie ?? 0, total: result.total, dc, historyTh: `d20(${result.naturalDie})+${abMod}=${result.total} vs DC ${dc} → ${s ? "ยกเลิกสำเร็จ" : "ไม่สำเร็จ"}` };
}
export function resolveDispelMagic(targetLv: number, dispelLv: number, abMod: number = 0): { success: boolean; die: number; total: number; dc: number; historyTh: string } {
  if (dispelLv >= targetLv) return { success: true, die: 0, total: 0, dc: 0, historyTh: `Dispel ระดับ ${dispelLv} ≥ ${targetLv} → กระจายอัตโนมัติ` };
  const dc = 10 + targetLv; const result = roll(`1d20+${abMod}`); const s = result.total >= dc;
  return { success: s, die: result.naturalDie ?? 0, total: result.total, dc, historyTh: `d20(${result.naturalDie})+${abMod}=${result.total} vs DC ${dc} → ${s ? "กระจายสำเร็จ" : "ไม่สำเร็จ"}` };
}

/* 8.13 AoE */
export function getAffectedSquares(origin: { x: number; y: number }, aoe: { shape: AoEShape; size: number }, grid: { w: number; h: number }): { x: number; y: number }[] {
  const sq: { x: number; y: number }[] = []; const r = Math.floor(aoe.size / 5);
  switch (aoe.shape) {
    case "sphere": case "emanation": case "cylinder":
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (dx*dx+dy*dy <= r*r) { const x=origin.x+dx, y=origin.y+dy; if (x>=0&&x<grid.w&&y>=0&&y<grid.h) sq.push({x,y}); } break;
    case "cube":
      for (let dx=0;dx<r*2;dx++) for (let dy=0;dy<r*2;dy++) { const x=origin.x+dx-Math.floor(r), y=origin.y+dy-Math.floor(r); if (x>=0&&x<grid.w&&y>=0&&y<grid.h) sq.push({x,y}); } break;
    case "cone":
      for (let dy=0;dy<=r;dy++) for (let dx=-dy;dx<=dy;dx++) { const x=origin.x+dx, y=origin.y-dy; if (x>=0&&x<grid.w&&y>=0&&y<grid.h) sq.push({x,y}); } break;
    case "line":
      for (let dy=0;dy<=r;dy++) { const y=origin.y-dy; if (y>=0&&y<grid.h) sq.push({x:origin.x,y}); } break;
  }
  return sq;
}

/* 8.14 SCHOOLS */
export const SPELL_SCHOOLS_TH: Record<string, string> = { Abjuration: "ป้องกัน", Conjuration: "อัญเชิญ", Divination: "พยากรณ์", Enchantment: "สะกดจิต", Evocation: "อัญมณี", Illusion: "ภาพลวงตา", Necromancy: "มรณเวท", Transmutation: "แปรสภาพ" };

/* 8.16 MAGIC ITEMS */
export interface MagicItemSpell { itemName: string; spellIndex: string; charges: number; maxCharges: number; rechargeType: "dawn" | "1d6_5_6" | "none"; }
export function useMagicItemCharge(item: MagicItemSpell): boolean { if (item.charges<=0) return false; item.charges-=1; return true; }
export function rechargeMagicItem(item: MagicItemSpell): void {
  if (item.rechargeType==="dawn") item.charges=item.maxCharges;
  else if (item.rechargeType==="1d6_5_6") { if (Math.floor(Math.random()*6)+1>=5) item.charges=Math.min(item.maxCharges,item.charges+1); }
}

/* 8.17 EVENTS */
export type SpellEvent = "before_cast" | "on_cast" | "on_hit" | "on_save" | "on_fail" | "on_concentration_break" | "on_end";

/* ======================================================================
 * SRD SYNC — convert SRD spell JSON to SpellDef
 * ====================================================================== */

export function convertSRDSpell(srd: any): SpellDef {
  const index = srd.index || "";
  const level = srd.level || 0;
  const school = (srd.school?.name || "Evocation") as SpellSchool;
  const components: string[] = srd.components || [];
  const concentration = !!srd.concentration;
  const ritual = !!srd.ritual;
  const castingTime = srd.casting_time || "1 action";

  // Range
  let range: SpellRange = "ft"; let rangeFt = 0;
  if (srd.range === "Self") { range = "self"; rangeFt = 0; }
  else if (srd.range === "Touch") { range = "touch"; rangeFt = 5; }
  else if (srd.range === "Sight") { range = "sight"; rangeFt = 1000; }
  else if (srd.range === "Unlimited") { range = "unlimited"; rangeFt = 99999; }
  else { const m = String(srd.range || "").match(/(\d+)/); rangeFt = m ? parseInt(m[1], 10) : 30; }

  // Duration
  const durStr = String(srd.duration || "Instantaneous");
  let durationType: SpellDurationType = "instantaneous"; let durationRounds: number | undefined;
  if (durStr.toLowerCase().includes("concentration")) { durationType = "concentration"; const m = durStr.match(/(\d+)\s*(minute|hour|round)/i); if (m) durationRounds = m[2].toLowerCase().startsWith("minute") ? parseInt(m[1]) * 10 : parseInt(m[1]); }
  else if (durStr.toLowerCase().includes("instantaneous")) durationType = "instantaneous";
  else if (durStr.toLowerCase().includes("until dispelled")) durationType = "until_dispelled";
  else if (durStr.toLowerCase().includes("permanent")) durationType = "permanent";
  else { durationType = "timed"; const m = durStr.match(/(\d+)\s*(minute|hour|round)/i); if (m) durationRounds = m[2].toLowerCase().startsWith("minute") ? parseInt(m[1]) * 10 : parseInt(m[1]); }

  // Damage / healing / resolution
  let damage: string | undefined; let damageType: string | undefined; let damageScaling: "cantrip" | "slot" | undefined;
  let healing: string | undefined; let resolution: SpellResolutionType = "automatic";
  let saveAbility: string | undefined; let saveSuccess: "half" | "none" | "negate" | undefined;

  if (srd.damage) {
    if (srd.damage.damage_at_character_level) { damageScaling = "cantrip"; const keys = Object.keys(srd.damage.damage_at_character_level).sort((a:string,b:string)=>parseInt(a)-parseInt(b)); damage = srd.damage.damage_at_character_level[keys[0]]; }
    else if (srd.damage.damage_at_slot_level) { damageScaling = "slot"; const keys = Object.keys(srd.damage.damage_at_slot_level).sort((a:string,b:string)=>parseInt(a)-parseInt(b)); damage = srd.damage.damage_at_slot_level[keys[0]]; }
    damageType = srd.damage.damage_type?.name;
  }
  if (srd.heal_at_slot_level) { const keys = Object.keys(srd.heal_at_slot_level).sort((a:string,b:string)=>parseInt(a)-parseInt(b)); healing = srd.heal_at_slot_level[keys[0]]; resolution = "healing"; }
  if (srd.attack_type === "ranged" || srd.attack_type === "melee") resolution = "attack_roll";
  if (srd.save) {
    resolution = "saving_throw";
    const rawSave = (srd.save.dc_type?.name || "Dexterity").toLowerCase();
    if (rawSave.includes("dexterity")) saveAbility = "dex"; else if (rawSave.includes("constitution")) saveAbility = "con"; else if (rawSave.includes("wisdom")) saveAbility = "wis"; else if (rawSave.includes("strength")) saveAbility = "str"; else if (rawSave.includes("intelligence")) saveAbility = "int"; else if (rawSave.includes("charisma")) saveAbility = "cha"; else saveAbility = "dex";
    saveSuccess = srd.save.dc_success === "half" ? "half" : "none";
  }
  if (damage && resolution === "automatic") resolution = "damage_auto";

  // AoE
  let aoe: { shape: AoEShape; size: number; sizeUnit: string } | undefined;
  if (srd.area_of_effect) aoe = { shape: srd.area_of_effect.type as AoEShape, size: srd.area_of_effect.size, sizeUnit: "ft" };

  // Targets
  let targets: TargetType = "creature";
  if (range === "self") targets = "self"; else if (aoe) targets = "area";
  let maxTargets: number | undefined = aoe && aoe.shape === "sphere" && aoe.size >= 20 ? 99 : 1;

  // Upcasting
  let upcastDamage: string | undefined;
  if (damageScaling === "slot" && srd.damage?.damage_at_slot_level) {
    const keys = Object.keys(srd.damage.damage_at_slot_level).sort((a:string,b:string)=>parseInt(a)-parseInt(b));
    if (keys.length >= 2) {
      const base = srd.damage.damage_at_slot_level[keys[0]]; const next = srd.damage.damage_at_slot_level[keys[1]];
      const bm = base.match(/^(\d+)d(\d+)/); const nm = next.match(/^(\d+)d(\d+)/);
      if (bm && nm) { const diff = parseInt(nm[1]) - parseInt(bm[1]); if (diff > 0) upcastDamage = `${diff}d${nm[2]}`; }
    }
  }

  return {
    index, name: srd.name || index, level, school, castingTime, range, rangeFt,
    components, material: srd.material, duration: durStr, durationType, durationRounds,
    concentration, ritual, description: Array.isArray(srd.desc) ? srd.desc.join(" ") : (srd.desc || ""),
    higherLevels: Array.isArray(srd.higher_level) ? srd.higher_level.join(" ") : srd.higher_level,
    resolution, saveAbility, saveSuccess, damage, damageType, damageScaling, healing,
    aoe, targets, maxTargets, tags: [], upcastDamage,
  };
}
