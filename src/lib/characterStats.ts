"use client";

/**
 * Character & combat math — extracted from DnDSolo.tsx (de-monolith refactor).
 *
 * Pure, module-scope helpers with no component state: dice (rollFormula/rollD20),
 * save/migration, skill/save/attack modifiers, condition & exhaustion effects,
 * cover, sneak-attack dice, concentration and crit-threshold checks. Also the home
 * for the roll/feature helpers CharacterSheet needs, which breaks the old
 * CharacterSheet -> DnDSolo circular import. Moved verbatim — no behavior change.
 */
import {
  CLASSES, WEAPONS, mod, profByLevel, SKILLS, wornHas, MAGIC_ITEMS,
  DISADV_CONDS, CHECK_DISADV_CONDS, INCAPACITATING_CONDS,
} from "@/lib/gameData";
import { computeAC, getSlotTable } from "@/lib/spells";
import { d } from "@/lib/dndSoloShared";
import { hasClassFeature, featAttackBonus } from "@/lib/engine/progression";
import { type SpellLegalityReason } from "@/lib/engine/magic";
import { coverBetween, type Obstacle } from "@/lib/engine/vision";
import { isConcentrationSpellName } from "@/lib/engine/effects";

export function rollFormula(formula: string) {
  const m = String(formula).replace(/\s/g, "").match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!m) return { total: 0, rolls: [] as number[], mod: 0, formula };
  const n = parseInt(m[1] || "1", 10);
  const sides = parseInt(m[2], 10);
  const modv = m[3] ? parseInt(m[3], 10) : 0;
  const rolls: number[] = [];
  for (let i = 0; i < n; i++) rolls.push(d(sides));
  return { total: rolls.reduce((a, b) => a + b, 0) + modv, rolls, mod: modv, formula };
}

export function rollD20(modv: number, adv: "none" | "advantage" | "disadvantage" = "none") {
  const a = d(20), b = d(20);
  let die = a;
  if (adv === "advantage") die = Math.max(a, b);
  if (adv === "disadvantage") die = Math.min(a, b);
  return { die, other: adv !== "none" ? (die === a ? b : a) : null, mod: modv, total: die + modv, adv };
}

export function migrateChar(o: any) {
  const cls = CLASSES[o.cls];
  const n = { ...o };
  if (typeof n.weapon !== "string" || !WEAPONS[n.weapon]) n.weapon = cls.weapon;
  if (n.ranged === undefined) n.ranged = cls.ranged || null;
  if (n.hitDiceLeft === undefined) n.hitDiceLeft = n.level;
  if (!Array.isArray(n.extraSkills)) n.extraSkills = [];
  // Expertise field migration — old saves may have `expertiseSkills` (legacy) or no field
  if (!Array.isArray(n.expertise)) {
    n.expertise = Array.isArray(n.expertiseSkills) ? n.expertiseSkills : [];
  }
  if (n.pendingExpertise === undefined) n.pendingExpertise = 0;
  if (n.lastLongRestHoursAgo === undefined) n.lastLongRestHoursAgo = 99;
  if (n.lastShortRestHoursAgo === undefined) n.lastShortRestHoursAgo = 99;
  if (n.background === undefined) n.background = null;
  if (n.actionSurgeUsed === undefined) n.actionSurgeUsed = false;
  if (n.arcaneRecoveryUsed === undefined) n.arcaneRecoveryUsed = false;
  if (n.preserveLifeUsed === undefined) n.preserveLifeUsed = false;
  if (n.pendingAsi === undefined) n.pendingAsi = n.level >= 4 ? 1 : 0;
  if (!Array.isArray(n.worn)) n.worn = [];
  if (n.venomUsed === undefined) n.venomUsed = false;
  if (n.rageUsed === undefined) n.rageUsed = 0;
  if (n.kiUsed === undefined) n.kiUsed = 0;
  if (!Array.isArray(n.buffs)) n.buffs = [];
  if (!Array.isArray(n.feats)) n.feats = [];
  if (n.layOnHandsPool === undefined) n.layOnHandsPool = (n.level || 1) * 5;
  if (n.bardicInspirationUsed === undefined) n.bardicInspirationUsed = 0;
  if (n.sorceryPoints === undefined) n.sorceryPoints = n.level || 1;
  if (!Array.isArray(n.knownSpells)) n.knownSpells = [];
  // Task #14: back-fill the spellbook pool for saves that predate it (prepared
  // casters). Superset must at least contain the currently-prepared spells.
  if (!Array.isArray(n.spellbook)) n.spellbook = [...n.knownSpells];
  else for (const s of n.knownSpells) if (!n.spellbook.includes(s)) n.spellbook.push(s);
  if (!Array.isArray(n.featGrantsApplied)) n.featGrantsApplied = [];
  if (!Array.isArray(n.saveProficiencies)) n.saveProficiencies = [];
  if (n.slots === undefined || n.slotsMax === undefined) {
    const t = cls.caster ? getSlotTable(n.cls, n.level) : [];
    n.slots = t.slice(); n.slotsMax = t.slice();
  }
  n.ac = computeAC(n);
  return n;
}

export function getMelee(c: any) { return WEAPONS[c.weapon] || WEAPONS[CLASSES[c.cls].weapon]; }
export function getRanged(c: any) { return c.ranged ? WEAPONS[c.ranged] : null; }

// Feature check — must be defined before skillMod (which uses it for Expertise)
// Phase 4: delegate to the progression engine so the check covers the full
// Lv.1-20 class table PLUS the chosen subclass's features (not just Lv.1-5).
export function hasFeature(c: any, key: string) {
  return hasClassFeature(c.cls, c.level, c.subclass, key);
}

export function skillMod(c: any, skillKey: string) {
  const s = SKILLS[skillKey];
  if (!s) return mod(c.abilities.dex);
  const isProf = CLASSES[c.cls].skills.includes(skillKey) || (c.extraSkills || []).includes(skillKey);
  const isExpertise = (c.expertise || []).includes(skillKey);
  const pb = profByLevel(c.level);
  // D&D 5e/2024 Expertise: PB × 2 (double proficiency, NOT PB + PB)
  // Source: roll20.net/compendium/dnd5e/Ability%20Scores#content
  //   "Expertise doubles the proficiency bonus for chosen skills."
  // Skill modifier = ability mod + (PB × 2 if Expertise) + (PB if proficient) + 0 if neither
  let profBonus = 0;
  if (isExpertise) profBonus = pb * 2;
  else if (isProf) profBonus = pb;
  // D&D 5e Jack of All Trades (Bard Lv.2): half PB on non-proficient ability checks
  // Source: PHB "Jack of All Trades: ...you can add half your proficiency bonus...to any ability check you make that doesn't already include your proficiency bonus."
  if (!isProf && hasFeature(c, "jack_of_all_trades")) profBonus = Math.floor(pb / 2);
  let m0 = mod(c.abilities[s.abil]) + profBonus;
  // Magic item bonuses (e.g., Gloves of Thievery +5 Sleight of Hand)
  if (skillKey === "sleight_of_hand" && wornHas(c, "sleight5")) m0 += 5;
  // D&D 5e/2024 Exhaustion: -2/level to ALL D20 Tests (includes skill checks)
  // Source: D&D Beyond Free Rules 2024 — "Exhaustion [Condition]": "When you make a D20 Test, the roll is reduced by 2 times your Exhaustion level."
  m0 -= exhaustionPenalty(c);
  return m0;
}
export function saveMod(c: any, abil: string) {
  const prof = CLASSES[c.cls].saves.includes(abil) ? profByLevel(c.level) : 0;
  let m0 = mod(c.abilities[abil]) + prof;
  // Magic item bonuses (Ring of Protection +1 saves, Cloak of Protection +1 saves)
  (c.worn || []).forEach((n: string) => { const mi = MAGIC_ITEMS[n]; if (mi && mi.savePlus) m0 += mi.savePlus; });
  // D&D 5e/2024 Exhaustion: -2/level to ALL D20 Tests (includes saving throws)
  m0 -= exhaustionPenalty(c);
  return m0;
}
export function attackMod(c: any, w: any) {
  const weap = w || getMelee(c);
  let m0 = mod(c.abilities[weap.abil]) + profByLevel(c.level) + (weap.plus || 0);
  // Phase 4: Fighting Style — Archery grants +2 to ranged weapon attack rolls.
  m0 += featAttackBonus(c.feats || [], weap);
  // D&D 5e/2024 Exhaustion: -2/level to ALL D20 Tests (includes attack rolls)
  m0 -= exhaustionPenalty(c);
  return m0;
}
export function hasDisadv(c: any) {
  return c.conditions.some((x: string) => DISADV_CONDS.includes(x));
}
export function hasCheckDisadv(c: any) {
  return c.conditions.some((x: string) => CHECK_DISADV_CONDS.includes(x));
}
export function isIncapacitated(c: any) {
  return c.conditions.some((x: string) => INCAPACITATING_CONDS.includes(x));
}
// D&D 2024 Exhaustion: -2 per level to ALL D20 Tests (attack rolls, saving throws, ability checks)
// Level 6 = death
export function exhaustionPenalty(c: any): number {
  const level = c.exhaustionLevel || 0;
  return level > 0 ? level * 2 : 0;
}
// Apply exhaustion penalty to a d20 roll total
export function applyExhaustion(c: any, rollTotal: number): number {
  return rollTotal - exhaustionPenalty(c);
}
// Enemy-side condition effects: returns disadvantage-on-attack flags
export function enemyHasAttackDisadv(e: any) {
  const conds = e.conditions || [];
  // Prone: disadvantage on attack rolls while prone
  // Restrained: disadvantage on attack rolls + DEX saves
  // Blinded: disadvantage on attacks (can't see target)
  return conds.some((c: string) => ["prone", "restrained", "blinded", "frightened", "poisoned"].includes(c));
}
// Enemy-side AC penalty from conditions
export function enemyAcPenalty(e: any): number {
  const conds = e.conditions || [];
  let pen = 0;
  if (conds.includes("restrained")) pen += 0; // restrained doesn't change AC, but attackers get advantage
  if (conds.includes("prone")) pen += 0;       // melee advantage / ranged disadvantage handled separately
  return pen;
}
// Attackers get advantage vs these conditions on the target
export function attackerHasAdvVs(e: any): boolean {
  const conds = e.conditions || [];
  return conds.some((c: string) => ["restrained", "blinded", "paralyzed", "petrified", "prone", "stunned", "unconscious", "grappled"].includes(c));
}
// Thai wording for an illegal cast blocked by engine/magic.canCast2024.
// (The engine owns the RULE + returns a reason code; the UI owns the wording.)
export function spellLegalityMessageTh(spellName: string, spellLevel: number, slotLevel: number, reason: SpellLegalityReason): string {
  switch (reason) {
    case "not_known":
      return `⛔ ร่าย ${spellName} ไม่ได้ — ยังไม่ได้เรียน/เตรียมเวทนี้`;
    case "below_spell_level":
      return `⛔ ร่าย ${spellName} ไม่ได้ — เวทระดับ ${spellLevel} ต้องใช้ slot ระดับ ${spellLevel} ขึ้นไป (เลือก slot ${slotLevel})`;
    case "slot_out_of_range":
      return `⛔ ร่าย ${spellName} ไม่ได้ — ระดับ slot ${slotLevel} ไม่ถูกต้อง`;
    case "no_slot":
      return `⛔ ร่าย ${spellName} ไม่ได้ — ไม่มี spell slot ระดับ ${slotLevel} เหลือ (ไม่เสีย slot)`;
    default:
      return `⛔ ร่าย ${spellName} ไม่ได้`;
  }
}

// D&D 2024 cover for a player→enemy attack, computed through engine/vision.coverBetween.
// Other LIVING enemies lying on the line grant half cover (a creature gives half
// cover, RAW). Creatures never give total cover, so the target is always targetable.
// Returns the AC/DEX-save bonus (0/2/5) the cover confers on the defender.
export function coverForTarget(cb: any, targetUid: string): { bonus: number; label: string } {
  if (!cb?.playerPos || !cb?.enemyPositions?.[targetUid]) return { bonus: 0, label: "" };
  const obstacles: Obstacle[] = [];
  for (const other of cb.enemies || []) {
    if (other.uid === targetUid || other.hpNow <= 0) continue;
    const p = cb.enemyPositions?.[other.uid];
    if (p) obstacles.push({ pos: p, cover: "half" });
  }
  const res = coverBetween(cb.playerPos, cb.enemyPositions[targetUid], obstacles);
  if (!isFinite(res.acBonus) || res.acBonus <= 0) return { bonus: 0, label: "" };
  const label = res.level === "half" ? "half cover" : res.level === "threeQuarters" ? "three-quarter cover" : "";
  return { bonus: res.acBonus, label };
}

export function sneakDice(level: number) { return Math.ceil(level / 2); }
// critThreshold moved below hasFeature definition (which it depends on)
// Check if character has any concentration buff active.
// Which buff names require concentration is owned by the engine
// (engine/effects.isConcentrationSpellName / CONCENTRATION_SPELL_NAMES).
export function hasConcentration(cc: any): boolean {
  return (cc.buffs || []).some((b: any) => isConcentrationSpellName(b.name));
}
// Get the highest-priority concentration buff (the one to break first)
export function getActiveConcentrationBuff(cc: any): any | null {
  return (cc.buffs || []).find((b: any) => isConcentrationSpellName(b.name)) || null;
}
export function critThreshold(c: any) {
  // Champion: Superior Critical (Lv.15) crits on 18-20; Improved Critical (Lv.3) on 19-20.
  if (hasFeature(c, "superior_critical")) return 18;
  return hasFeature(c, "improved_critical") ? 19 : 20;
}

