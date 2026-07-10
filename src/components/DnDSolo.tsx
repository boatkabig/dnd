"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ABILS, ABIL_TH, mod, profByLevel, XP_THRESHOLDS, SKILLS, CONDITIONS_TH,
  DISADV_CONDS, CHECK_DISADV_CONDS, ENEMY_ADV_CONDS, INCAPACITATING_CONDS,
  BACKGROUNDS, RACES, CLASSES, FEATURES, WEAPONS, weaponByName, ARMOR,
  MAGIC_ITEMS, CONSUMABLES, BESTIARY, monSave, SLOT_TABLE, HALF_CASTER_SLOTS,
  DIRV, MAP_ICON, wornHas,
  applyDamageModifiers, COVER_AC_BONUS, passivePerception, rateEncounterDifficulty,
  gameTimeToString, getLightLevelForHour, grappleCheck, canDualWield,
  ALIGNMENTS, LANGUAGES, ORIGIN_FEATS, WEAPON_MASTERIES,
  type Quest,
} from "@/lib/gameData";
import {
  fetchSpell, fetchMonster, srdProbe, srdListSpells, type NormalizedSpell, type NormalizedMonster,
} from "@/lib/srd";
import {
  computeAC, spellAtkMod, spellDC, getSlotTable, maxSpellLevel, getClassSpellIndices, refreshesOnShortRest,
} from "@/lib/spells";
import {
  saveGame as engineSaveGame, loadGame as engineLoadGame, deleteSave as engineDeleteSave,
  initWorldClockFromLegacy, worldClockToLegacy, getWorldClock, advanceHours as engineAdvanceHours,
  fetchMonsterForCombat, type LegacySave,
  emitAttack, emitHit, emitDamageDealt, emitDamageTaken, emitHeal, emitKill, emitDeath,
  emitTurnStart, emitTurnEnd, emitCastSpell, emitConditionApplied,
  queryFeatureTriggers, getTriggeredFeatures, type PendingStateChange,
} from "@/lib/engineAdapters";
// AI DM Layer (Domain 31-35)
import {
  analyzeIntent, createDialogueSession, processPlayerInput,
  type DialogueSession,
} from "@/lib/dialogue";
import {
  calculateDifficulty, getDifficultyThresholds, suggestedCR,
  crToXP, calculateReward, rollRewardItems, type DifficultyLevel,
} from "@/lib/encounter";
import {
  createStoryArc, createScene, enterScene, completeScene, updatePacingAfterScene,
  type NarrativeEngine, type Scene, type SceneType,
} from "@/lib/narrative";
import {
  generateFullPlan, selectBestAction, generateDecisionOptions, predictOutcome,
  assessRisk, type PlanningContext, type Goal, type SelectedAction,
} from "@/lib/planning";
import {
  createContentRegistry, importContentJSON, exportByType, listContentByType,
  type ContentRegistry, type ContentType,
} from "@/lib/content";
// Domain 36: Dungeon Blueprint System
import {
  createDungeonRunState, moveToRoom, markRoomCleared, markBossDefeated,
  discoverSecretRoom, discoverSecretConnection, getVisibleDungeonInfo,
  validateDungeonBlueprint, summarizeDungeonProgress,
  getRoomRoleLabel, getRoomRoleIcon, getConnectionTypeLabel,
  isObjectiveInThisDungeon,
  type DungeonBlueprint, type DungeonRunState, type Room, type RoomConnection,
  type RoomRole, type ConnectionType,
} from "@/lib/dungeon";
import {
  generateProceduralDungeon, type ProceduralDungeonParams,
} from "@/lib/dungeonTables";
// Phase 1: DM response schema validation
import { validateDMResponse, HP_DELTA_CAP, type DMResponse } from "@/lib/dmSchema";
// Phase 2: Extended class features Lv.1-20
import { getExtendedFeatures, hasASIAtLevel } from "@/lib/featuresExtended";

/* ============================================================
   D&D 5e SOLO — Full SRD Edition
   - Engine (code): dice, HP/AC, spell slots, all 15 conditions,
     combat (initiative, surprise, sneak attack, multi-attack,
     Action Surge, Spiritual Weapon/Guardians, concentration, death saves),
     XP/leveling (Lv.1-20), magic items, fog-of-war map.
   - DM (AI via /api/dm): narrates / plays NPC only.
   - Spells: fetched dynamically from Open5e v2 (2024 SRD 5.2 + 2014 SRD 5.1) via /api/open5e —
     the engine can execute ANY of the 1,955 SRD spells generically.
   - Monsters: 30+ in-engine bestiary + ALL 3,541+ SRD creatures.
   - Classes: all 12 SRD classes.
   - Races: all 9+ SRD species.
   ============================================================ */

/* ---------------- DICE ENGINE ---------------- */
const d = (sides: number) => Math.floor(Math.random() * sides) + 1;

function rollFormula(formula: string) {
  const m = String(formula).replace(/\s/g, "").match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!m) return { total: 0, rolls: [] as number[], mod: 0, formula };
  const n = parseInt(m[1] || "1", 10);
  const sides = parseInt(m[2], 10);
  const modv = m[3] ? parseInt(m[3], 10) : 0;
  const rolls: number[] = [];
  for (let i = 0; i < n; i++) rolls.push(d(sides));
  return { total: rolls.reduce((a, b) => a + b, 0) + modv, rolls, mod: modv, formula };
}

function rollD20(modv: number, adv: "none" | "advantage" | "disadvantage" = "none") {
  const a = d(20), b = d(20);
  let die = a;
  if (adv === "advantage") die = Math.max(a, b);
  if (adv === "disadvantage") die = Math.min(a, b);
  return { die, other: adv !== "none" ? (die === a ? b : a) : null, mod: modv, total: die + modv, adv };
}

/* ---------------- CHARACTER FACTORY ---------------- */
function makeCharacter(name: string, raceKey: string, classKey: string, bgKey: string, opts?: {
  abilities?: Record<string, number>;
  extraSkills?: string[];
  expertise?: string[];
  equipment?: string[];
  knownSpells?: string[];
  details?: { age?: string; height?: string; appearance?: string; ideal?: string; bond?: string; flaw?: string; backstory?: string };
  alignment?: string;
  languages?: string[];
  // D&D 2024: Background grants +2/+1 OR +1/+1/+1 — player picks which abilities
  // `bgAsi` is an array of ability keys that get +1 each (length 2 = +1/+1, length 3 = +1/+1/+1)
  // Special: if same ability appears twice → that's +2
  bgAsi?: string[];
}) {
  const cls = CLASSES[classKey];
  const race = RACES[raceKey];
  const bg = BACKGROUNDS[bgKey] || null;
  // Background ASI: +2/+1 OR +1/+1/+1 (D&D 2024)
  // Count occurrences of each ability in bgAsi → that's the bonus (+2 if appears twice)
  const bgAsiBonus: Record<string, number> = {};
  if (opts?.bgAsi && opts.bgAsi.length > 0) {
    for (const a of opts.bgAsi) {
      bgAsiBonus[a] = (bgAsiBonus[a] || 0) + 1;
    }
  }
  // Use custom abilities if provided, otherwise default class array + race bonus + background ASI
  const baseAbilities: Record<string, number> = {};
  ABILS.forEach((a) => {
    baseAbilities[a] = (cls.array[a] || 10) + (race.bonus[a] || 0) + (bgAsiBonus[a] || 0);
  });
  const abilities: Record<string, number> = opts?.abilities
    ? (() => {
        const result: Record<string, number> = {};
        ABILS.forEach((a) => {
          result[a] = (opts.abilities![a] || 10) + (race.bonus[a] || 0) + (bgAsiBonus[a] || 0);
        });
        return result;
      })()
    : baseAbilities;
  // Cap at 20 (D&D 5e ability score max)
  ABILS.forEach((a) => { abilities[a] = Math.min(20, abilities[a]); });
  const level = 1;
  const maxHp = cls.hitDie + mod(abilities.con);
  // Build inventory from class defaults + custom equipment picks
  const inventory: string[] = ["Rations", "Rations", "Rations", "Torch", "Rope (50 ft)", "Potion of Healing", WEAPONS[cls.weapon].th];
  if (cls.ranged) inventory.push(WEAPONS[cls.ranged].th);
  if (opts?.equipment) inventory.push(...opts.equipment);
  // Extra skills from background + custom picks
  const bgSkills = bg ? bg.skills.slice() : [];
  const allExtraSkills = [...bgSkills, ...(opts?.extraSkills || [])];
  const c: any = {
    name, race: raceKey, cls: classKey, level, xp: 0,
    background: bg ? bgKey : null,
    extraSkills: allExtraSkills,
    expertise: opts?.expertise || [],
    abilities, maxHp, hp: maxHp,
    conditions: [] as string[], gold: 15,
    inventory,
    weapon: cls.weapon, ranged: cls.ranged || null,
    hitDiceLeft: level,
    secondWindUsed: false, hiddenAdv: false,
    actionSurgeUsed: false, arcaneRecoveryUsed: false, preserveLifeUsed: false,
    rageUsed: 0, kiUsed: 0, layOnHandsPool: 5, divineSmiteReady: true,
    bardicInspirationUsed: 0, sorceryPoints: level,
    pendingAsi: 0,
    slots: cls.caster ? getSlotTable(classKey, level) : [],
    slotsMax: cls.caster ? getSlotTable(classKey, level) : [],
    knownSpells: opts?.knownSpells || [],
    deathSaves: { s: 0, f: 0 }, dead: false,
    worn: [] as string[], venomUsed: false,
    buffs: [] as any[],
    feats: bg?.originFeat ? [bg.originFeat] : [],
    heroicInspiration: true, // D&D 2024: Heroic Inspiration — start with 1
    details: opts?.details || {},
    speed: race.speed || 30,
    alignment: opts?.alignment || "true_neutral",
    languages: [...(race.languages || ["Common"]), ...(opts?.languages || [])],
    originFeat: bg?.originFeat || null,
    toolProficiencies: bg?.tool ? [bg.tool] : [],
  };
  c.ac = computeAC(c);
  return c;
}

function migrateChar(o: any) {
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
  if (n.slots === undefined || n.slotsMax === undefined) {
    const t = cls.caster ? getSlotTable(n.cls, n.level) : [];
    n.slots = t.slice(); n.slotsMax = t.slice();
  }
  n.ac = computeAC(n);
  return n;
}

function getMelee(c: any) { return WEAPONS[c.weapon] || WEAPONS[CLASSES[c.cls].weapon]; }
function getRanged(c: any) { return c.ranged ? WEAPONS[c.ranged] : null; }

// Feature check — must be defined before skillMod (which uses it for Expertise)
function hasFeature(c: any, key: string) {
  const f = FEATURES[c.cls] || {};
  for (let lv = 1; lv <= c.level; lv++) if ((f[lv] || []).some((x: any) => x.k === key)) return true;
  return false;
}

function skillMod(c: any, skillKey: string) {
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
function saveMod(c: any, abil: string) {
  const prof = CLASSES[c.cls].saves.includes(abil) ? profByLevel(c.level) : 0;
  let m0 = mod(c.abilities[abil]) + prof;
  // Magic item bonuses (Ring of Protection +1 saves, Cloak of Protection +1 saves)
  (c.worn || []).forEach((n: string) => { const mi = MAGIC_ITEMS[n]; if (mi && mi.savePlus) m0 += mi.savePlus; });
  // D&D 5e/2024 Exhaustion: -2/level to ALL D20 Tests (includes saving throws)
  m0 -= exhaustionPenalty(c);
  return m0;
}
function attackMod(c: any, w: any) {
  const weap = w || getMelee(c);
  let m0 = mod(c.abilities[weap.abil]) + profByLevel(c.level) + (weap.plus || 0);
  // D&D 5e/2024 Exhaustion: -2/level to ALL D20 Tests (includes attack rolls)
  m0 -= exhaustionPenalty(c);
  return m0;
}
function hasDisadv(c: any) {
  return c.conditions.some((x: string) => DISADV_CONDS.includes(x));
}
function hasCheckDisadv(c: any) {
  return c.conditions.some((x: string) => CHECK_DISADV_CONDS.includes(x));
}
function isIncapacitated(c: any) {
  return c.conditions.some((x: string) => INCAPACITATING_CONDS.includes(x));
}
// D&D 2024 Exhaustion: -2 per level to ALL D20 Tests (attack rolls, saving throws, ability checks)
// Level 6 = death
function exhaustionPenalty(c: any): number {
  const level = c.exhaustionLevel || 0;
  return level > 0 ? level * 2 : 0;
}
// Apply exhaustion penalty to a d20 roll total
function applyExhaustion(c: any, rollTotal: number): number {
  return rollTotal - exhaustionPenalty(c);
}
// Enemy-side condition effects: returns disadvantage-on-attack flags
function enemyHasAttackDisadv(e: any) {
  const conds = e.conditions || [];
  // Prone: disadvantage on attack rolls while prone
  // Restrained: disadvantage on attack rolls + DEX saves
  // Blinded: disadvantage on attacks (can't see target)
  return conds.some((c: string) => ["prone", "restrained", "blinded", "frightened", "poisoned"].includes(c));
}
// Enemy-side AC penalty from conditions
function enemyAcPenalty(e: any): number {
  const conds = e.conditions || [];
  let pen = 0;
  if (conds.includes("restrained")) pen += 0; // restrained doesn't change AC, but attackers get advantage
  if (conds.includes("prone")) pen += 0;       // melee advantage / ranged disadvantage handled separately
  return pen;
}
// Attackers get advantage vs these conditions on the target
function attackerHasAdvVs(e: any): boolean {
  const conds = e.conditions || [];
  return conds.some((c: string) => ["restrained", "blinded", "paralyzed", "petrified", "prone", "stunned", "unconscious", "grappled"].includes(c));
}
function sneakDice(level: number) { return Math.ceil(level / 2); }
// critThreshold moved below hasFeature definition (which it depends on)
// Check if character has any concentration buff active
function hasConcentration(cc: any): boolean {
  return (cc.buffs || []).some((b: any) =>
    ["Bless", "Haste", "Shield of Faith", "Hold Person", "Faerie Fire", "Slow", "Bane",
     "Hunter's Mark", "Hex", "Spirit Guardians", "Spiritual Weapon", "Banishment",
     "Concentration Spell"].includes(b.name)
  );
}
// Get the highest-priority concentration buff (the one to break first)
function getActiveConcentrationBuff(cc: any): any | null {
  return (cc.buffs || []).find((b: any) =>
    ["Bless", "Haste", "Shield of Faith", "Hold Person", "Faerie Fire", "Slow", "Bane",
     "Hunter's Mark", "Hex", "Spirit Guardians", "Spiritual Weapon", "Banishment",
     "Concentration Spell"].includes(b.name)
  ) || null;
}
function critThreshold(c: any) { return hasFeature(c, "improved_critical") ? 19 : 20; }

/* ---------------- MAP ENGINE ---------------- */
function emptyMap() { return { nodes: {} as Record<string, any>, edges: [] as [string, string][], current: null as string | null }; }

function applyMapUpdate(mu: any, mp: any, pushEntry?: (t: string) => void) {
  if (!mu) return mp;
  const m = mp ? { nodes: { ...mp.nodes }, edges: mp.edges.slice(), current: mp.current } : emptyMap();
  const al = mu.add_location;
  if (al && al.id) {
    if (!m.nodes[al.id]) {
      let x = 0, y = 0;
      const fromId = al.from && m.nodes[al.from] ? al.from : m.current;
      if (fromId && m.nodes[fromId]) {
        const v = DIRV[al.dir] || [1, 0];
        x = m.nodes[fromId].x + v[0];
        y = m.nodes[fromId].y + v[1];
        let guard = 0;
        while (Object.values(m.nodes).some((n: any) => n.x === x && n.y === y) && guard < 10) { x += 1; guard += 1; }
        m.edges.push([fromId, al.id]);
      }
      m.nodes[al.id] = { name: al.name || al.id, type: MAP_ICON[al.type] ? al.type : "place", x, y };
      if (pushEntry) pushEntry(`🗺️ Discovered new location: ${al.name || al.id}`);
    } else if (m.current && m.current !== al.id && !m.edges.some(([a, b]) => (a === m.current && b === al.id) || (a === al.id && b === m.current))) {
      m.edges.push([m.current, al.id]);
    }
  }
  if (mu.connect && Array.isArray(mu.connect) && mu.connect.length === 2 && m.nodes[mu.connect[0]] && m.nodes[mu.connect[1]]) {
    if (!m.edges.some(([a, b]) => (a === mu.connect[0] && b === mu.connect[1]) || (a === mu.connect[1] && b === mu.connect[0]))) m.edges.push([mu.connect[0], mu.connect[1]]);
  }
  if (mu.move_to && m.nodes[mu.move_to]) m.current = mu.move_to;
  return m;
}

/* ---------------- DM (AI via /api/dm) ---------------- */
let SRD_OK = false;

function buildSystemPrompt(c: any, pacing?: { currentTension: string; recommendedNextTension: string; scenesSinceRest: number; scenesSinceCombat: number; scenesSinceRevelation: number; pacingNotes: string[]; arcPhase?: string } | null) {
  const cls = CLASSES[c.cls];
  const maxSpellLv = cls.caster ? maxSpellLevel(c.cls, c.level) : 0;
  const knownSpellsCount = (c.knownSpells || []).length;
  // Phase 1 fix: inject pacing directive directly into system prompt (was: side-channel via log recap only)
  const pacingDirective = pacing ? `\n\n📖 NARRATIVE PACING (engine-analyzed):
- Arc phase: ${pacing.arcPhase || "unknown"}
- Current tension: ${pacing.currentTension}
- Recommended next tension: ${pacing.recommendedNextTension}
- Scenes since rest: ${pacing.scenesSinceRest} · since combat: ${pacing.scenesSinceCombat} · since revelation: ${pacing.scenesSinceRevelation}
${pacing.pacingNotes.length > 0 ? `- Pacing notes: ${pacing.pacingNotes.join(" · ")}` : ""}
→ ปรับ narration ตาม pacing: ถ้า recommendedNextTension="calm" ให้บรรยายฉากสงบ; ถ้า "high" หรือ "climax" ให้เร่งเดิน; ถ้า scenesSinceRest >= 4 แนะนำให้พัก` : "";
  return `คุณคือ Dungeon Master มืออาชีพสำหรับแคมเปญ D&D 5e เดี่ยว (solo) โทน dark fantasy ผจญภัยสนุก
ภาษา: บรรยายเป็นภาษาไทยทั้งหมด ผสมศัพท์ D&D อังกฤษเมื่อจำเป็น (เช่น Stealth check, Initiative, tavern, Fire Bolt, AC, HP)

engine เข้าถึง D&D 5e/2024 SRD ผ่าน 2 API:
1. Open5e v2 (api.open5e.com/v2) — 2024 SRD 5.2 + 2014 SRD 5.1 ครบถ้วน
   - 1,955 spells, 3,541 creatures, 2,319 magic items, 151 classes, 63 species
   - 2024 edition filter: ?document__gamesystem__key=5e-2024 (ใช้โดย default)
   - Federated search: /api/open5e?search=<query> — ค้นหาข้ามทุก resource (spells + monsters + items + classes + ฯลฯ)
   - Endpoints: /api/open5e?spell=<slug> | ?creature=<slug> | ?magicitem=<slug> | ?class=<slug> | ?list=spells|creatures|magicitems|classes|species|backgrounds|feats|conditions|weapons|armor
2. dnd5eapi.co (legacy fallback) — 2014 SRD เฉพาะเมื่อ Open5e ไม่มี

คุณใช้ทรัพยากรเหล่านี้ได้ทั้งหมด:
- เวทมนตร์ 2024 SRD 339 อัน + 2014 SRD 319 อัน ใช้ index แบบ kebab-case (เช่น fire-bolt, magic-missile, fireball, healing-word, hold-person, misty-step, banishment, wish) — engine จะดึง stat block จริง (ดาเมจ, save, scaling, AoE, conditions)
- มอนสเตอร์ 2024 SRD 331 ตัว + 2014 SRD 334 ตัว ใช้ index แบบ kebab-case (เช่น goblin, owlbear, lich, ancient-red-dragon, tarrasque, skeleton, vampire) — engine ดึง AC/HP/attacks/saves/CR/legendary actions จริง
- สภาวะ (conditions) 15 อย่าง: ${Object.keys(CONDITIONS_TH).join(", ")}
- คลาส 12 อาชีพ, เผ่าพันธุ์ 9+ เผ่า, ภูมิหลัง 12+ แบบ
- อุปกรณ์ SRD ทั้งหมด: อาวุธ 35+, เกราะ 11 ชนิด, ของใช้, เครื่องมือ
- magic items SRD ทั้งหมด (cloak, ring, อาวุธ +1/+2/+3, scroll, potion) — 2,319 รายการ
- feat SRD ทั้งหมด (เช่น grappler, keen-mind, lucky, war-caster) — มอบผ่าน items_add "Feat: <ชื่อ>"
- trait SRD (ความสามารถเผ่าพันธุ์ เช่น darkvision, fey-ancestry)
- damage types, magic schools, languages, proficiencies, weapon properties ทั้งหมด

เคล็ดลับการใช้ engine:
- ถ้าต้องการมอนสเตอร์ที่ไม่อยู่ใน BESTIARY: ใช้ index ใดก็ได้จาก Open5e — engine จะดึง stat block จริง (รวม abilities, saves, traits, legendary actions, resistances)
- ถ้าต้องการเวทที่ไม่ได้อยู่ใน knownSpells: ใช้ spell index ใดก็ได้ — engine จะ resolve damage/save/AoE อัตโนมัติ
- ถ้าต้องการค้นหา: ใช้ /api/open5e?search=<query> (เช่น "fire damage level 3" → จะเจอ Fireball, Fireball-like spells, etc.)

กฎเหล็ก (สำคัญที่สุด — D&D 2024):
1. ห้ามตัดสินผลเต๋า ห้ามกำหนดตัวเลขดาเมจ/HP เอง — engine เป็นคนทอยและคำนวณทั้งหมด
1.1 สำคัญมาก: ถ้าผู้เล่นประกาศโจมตี/ร่ายเวท ห้ามบรรยายว่า "โดน" หรือเกิดดาเมจ (ยังไม่ได้ทอย!) ให้บรรยายแค่ช่วงจังหวะที่กำลังจะลงมือ แล้วสั่ง start_combat (D&D 2024: "surprise": true = ศัตรูทอย Initiative เสียเปรียบ ไม่ใช่ข้ามเทิร์น) — การโจมตีนัดแรกจะเกิดผ่านปุ่มใน combat
1.2 ห้ามใช้คำ meta เช่น "engine", "ระบบ", "คำนวณ" ใน narration — บรรยายอยู่ในโลกแฟนตาซีเท่านั้น
2. action ที่มีความเสี่ยง สั่ง check ผ่าน "requires" แล้วรอผลทอย
3. การต่อสู้ ใช้ "start_combat" พร้อม monster index — มอนสเตอร์ใน engine: ${Object.keys(BESTIARY).join(", ")} หรือใช้ monster index ใดก็ได้จาก Open5e (kebab-case เช่น goblin, owlbear, lich, ancient-red-dragon) เลือกความยากตาม CR รวม ~ level/4 ถึง level/2 ของผู้เล่นเดี่ยว
4. การเปลี่ยนแปลงสถานะ (ทอง/ไอเทม/XP/conditions/buffs) ผ่าน "updates" เท่านั้น — conditions_add/remove ใช้ id เหล่านี้เท่านั้น: ${Object.keys(CONDITIONS_TH).join(", ")}
5. บรรยายกระชับ 2-5 ประโยค จบด้วยสถานการณ์ที่ชวนตัดสินใจ
6. DC แนะนำ (D&D 2024 Influence): NPC "Hesitant" DC = max(15, INT score ของ NPC); NPC ยินยอมอยู่แล้ว = auto-success; ขัดกับนิสัย NPC = auto-fail
7. อย่าใจดีเกินไป โลกมีอันตรายจริง — ให้ XP/รางวัลเมื่อสำเร็จ (~50-200 XP ต่อเหตุการณ์สำคัญ)

D&D 2024 Rules Reference (engine implement แล้วทั้งหมด):
- Critical Hit: double ALL damage dice (weapon + Sneak Attack + Smite + Hex + Hunter's Mark)
- Weapon Mastery: 8 ชนิด (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex) — Flex dropped
- Surprise: ทอย Initiative เสียเปรียบ (ไม่ข้ามเทิร์น)
- Grapple/Shove: target ทอย STR/DEX save (เลือกเอง) vs DC = 8 + STR mod + PB
- Concentration DC: max(10, damage/2) capped at 30
- Long Rest: คืน HP เต็ม + คืน Hit Dice ทั้งหมด + ลด exhaustion 1 + รอ 16 ชม. ก่อน Long Rest ใหม่
- Short Rest: 1 ชม. ใช้ Hit Dice — combat/spell/damage ระหว่างพัก = ยกเลิก
- Exhaustion: -2/level ต่อ D20 Test + -5 ft/level Speed (Lv6 = ตาย)
- Encounter Difficulty: 3 tiers — Low / Moderate / High
- Encounter XP: flat XP (ไม่มี multiplier)
- Healing Word: 2d4 + spellcasting mod | Cure Wounds: 2d8 + spellcasting mod
- Counterspell: target ทอย CON save vs spell save DC
- Origin Feats: 10 ตัว (Alert, Crafter, Healer, Lucky, Magic Initiate, Musician, Savage Attacker, Skilled, Tavern Brawler, Tough) — ใช้ PB
- Species: ไม่ให้ ability score bonus (ย้ายไป Background)
- Tool + Skill = Advantage (ถ้ามี proficiency ทั้งคู่)

แผนที่โลก (สำคัญมาก — สร้างล่วงหน้าตอนเริ่มแคมเปญ):
- ตอนเริ่มแคมเปญ คุณต้องสร้างแผนที่โลกที่สมบูรณ์ มีหลายสถานที่ให้ผู้เล่นสำรวจ ห้ามเปิดทีละที่
- ใช้ฟิลด์ "world_map" (array ของ location) ใน response แรก เพื่อกำหนดโลกทั้งหมด แต่ละ location: { id, name, type, dir, from, description }
- สร้างโลกที่เชื่อมโยงกัน: เมืองเริ่มต้น (hub) + สถานที่รอบๆ 3-5 แห่ง (ร้านค้า, โรงเตี๊ยม, วัด) + พื้นที่ป่า/ถนน 2-3 แห่ง + ดันเจี้ยน/ซากปรักหักพัง/ถ้ำ 2-3 แห่ง แตกออกไป
- id ต้องเป็น snake_case ภาษาอังกฤษคงที่ (เช่น "phandalin", "stonehill_inn", "creeping_woods", "wave_echo_cave")
- type: town (เมือง), building (ร้าน/โรงเตี๊ยม/วัด), room (ห้องในดันเจี้ยน), dungeon (ทางเข้าดันเจี้ยน), wilderness (ป่า/ถนน/ธรรมชาติ)
- "dir" คือทิศจาก "from" (n/s/e/w/ne/nw/se/sw) เมืองเริ่มต้นมี from: null
- หลังจาก world_map ผู้เล่นเห็นเฉพาะสถานที่ที่ค้นพบแล้ว (fog of war) แต่โครงสร้างโลกมีอยู่ engine ติดตามว่าผู้เล่นเคยไปที่ไหน
- response ถัดไป ใช้ map_update เพื่อเพิ่มสถานที่ใหม่ที่ค้นพบ (เช่น ห้องลับในดันเจี้ยน) หรือ move_to เพื่อย้ายตำแหน่ง ห้าม redefine สถานที่เดิม

🏰 ระบบดันเจี้ยน (Dungeon Blueprint — Domain 36) — DM เป็นคนตัดสินใจทุกอย่าง:
- DM ตัวจริงเตรียมดันเจี้ยน "ทั้งหมดครั้งเดียว" ตอนผู้เล่นเข้า dungeon entrance — ไม่ใช่ add_location ทีละห้อง
- ⚠️ DM เป็นคนตัดสินใจทุกอย่าง — ไม่มีให้ผู้เล่นเลือก theme/template ห้ามถามผู้เล่น "อยากเล่นดันเจี้ยนแบบไหน"
- ใช้ฟิลด์ "dungeon_enter" ใน response เพื่อสร้าง/เข้าดันเจี้ยน — แนะนำให้ใช้รูปแบบสั้น { theme, id, name, hook?, antagonist? } engine จะ procedural generate ให้อัตโนมัติ
- ⚠️ เมื่อผู้เล่นอยู่ที่ dungeon entrance บน world map และบอกว่าจะเข้า → DM ต้องส่ง dungeon_enter ทันทีใน response นั้น ไม่ต้องถามผู้เล่นเพิ่ม
- theme ที่ใช้ได้: crypt (หลุมศพ), cave (ถ้ำ), wizard_tower (หอเวท), abandoned_mine (เหมืองร้าง), ancient_temple (วัดโบราณ), sewer (ท่อน้ำ), ruined_castle (ปราสาทร้าง), forest_shrine (ศาลาในป่า), underwater (ใต้น้ำ), fiendish (ขุมนรก), generic (อื่น ๆ)
- เลือก theme ตามบรรยากาศและคำอธิบายของ dungeon entrance ใน world map (เช่น "ถ้ำกระดูก" → crypt, "หอเวทอัลดริก" → wizard_tower)
- ถ้าต้องการควบคุมแบบละเอียด สามารถส่ง blueprint เต็มรูปแบบ { id, name, theme, entranceRoomId, rooms: [...], connections: [...], bossRoomId, recommendedLevel, hook, antagonist } แทน — แต่ส่วนใหญ่ใช้รูปแบบสั้นพอ
- โครงสร้าง blueprint (engine สร้างให้ถ้าใช้รูปแบบสั้น):
  • rooms[]: 5-8 ห้อง ตาม 5-Room pattern (entrance → puzzle → setback → climax → reward) + บางครั้งมี transition/secret/empty
  • role: "entrance" | "puzzle" | "setback" | "climax" (บอส) | "reward" | "transition" | "secret" | "empty"
  • connections[]: { from, to, type, direction, isLocked?, lockDC?, isSecret?, secretDetectionDC? }
- การเคลื่อนที่ในดันเจี้ยน: ใช้ "dungeon_room_move" ฟิลด์ { room_id: "..." } — engine จะอัปเดต current room และ trigger staged encounter/trap/puzzle อัตโนมัติ
- เมื่อ combat จบ engine จะ markRoomCleared อัตโนมัติ + ถ้าเป็น boss room จะ markBossDefeated + auto-complete เควสต์ที่เกี่ยวข้อง
- ผู้เล่นเห็นแผนที่ดันเจี้ยนแบบ fog-of-war (เห็นเฉพาะห้องที่เคยไป + ห้องที่ adjacent ที่ไม่ใช่ secret)
- ⚠️ เมื่ออยู่ในดันเจี้ยน ใช้ dungeon_room_move แทน map_update — ห้ามใช้ map_update.add_location สำหรับห้องในดันเจี้ยน
- ⚠️ ใช้ dungeon_enter ครั้งเดียวตอนเข้าดันเจี้ยน — ถ้าเข้าแล้วใช้ dungeon_room_move หรือ dungeon_exit แทน
- ใช้ "dungeon_exit" (true) เมื่อผู้เล่นออกจากดันเจี้ยนกลับสู่ world map
- 💡 DM ควรจำแพทเทิร์น: ห้อง entrance มี guardian อ่อน ๆ; puzzle มี puzzle; setback มี trap; climax มี boss; reward มี loot + lore
- 💡 Engine จะแสดง hint [🏰 DUNGEON ENTER REQUIRED] เมื่อผู้เล่นอยู่ที่ dungeon entrance และต้องการเข้า — ตอบสนองด้วย dungeon_enter ทันที

ระบบ Buff/Debuff:
- ใช้ updates.buffs_add เพื่อใส่ buff: { name, type ("buff"|"debuff"), duration (รอบ, 0=ทันที, -1=จนกว่าจะ long rest), source, effect_desc }
- ใช้ updates.buffs_remove เพื่อถอน buff ตามชื่อ
- buff ทั่วไป: Bless (+1d4 โจมตี/save, concentration), Haste (+2 AC, เร่งความเร็ว x2, concentration), Mage Armor (AC 13+DEX, 8 ชม.), Shield (+5 AC, 1 รอบ), Bardic Inspiration (+1d6), Rage (adv STR, +ดาเมจ, ต้านทาน), Guidance (+1d4 check), Shield of Faith (+2 AC, concentration)
- debuff ทั่วไป: Bane (-1d4 โจมตี/save), Hunter's Mark (+1d6 ดาเมจ), Hex (+1d6 ดาเมจ, disadv ability), Faerie Fire (adv โจมตีใส่เป้า), Slow (ครึ่งความเร็ว, -2 AC)
- engine ติดตาม duration และหมดอายุอัตโนมัติ — concentration buff จะหายถ้าผู้ร่ายโดนตีและทอย CON save ไม่ผ่าน

การเรียนเวท:
- ถ้าผู้เล่นต้องการเรียนเวท (scroll, อาจารย์, level up) ใช้ updates.items_add "Spell Scroll: <ชื่อเวท>" (เช่น "Spell Scroll: Misty Step") — engine จะเปิด UI "Learn Spell" ในแท็บเวทมนตร์
- Wizard เรียนจาก spellbook ที่ได้จาก loot ได้ด้วย

Feat:
- level 4+ เลือก feat แทน ASI ได้ ใช้ updates.items_add "Feat: <ชื่อ>" (เช่น "Feat: War Caster")

ตัวละครผู้เล่น: ${c.name} — ${RACES[c.race].th} ${cls.th} level ${c.level}${c.background && BACKGROUNDS[c.background] ? `, ภูมิหลัง: ${BACKGROUNDS[c.background].th}` : ""}, ${cls.feature}${cls.caster ? ` · เวทสูงสุด: Lv.${maxSpellLv} · เวทที่รู้: ${knownSpellsCount}` : ""}

ระบบแผนที่รบ (Tactical Battle Grid):
- เมื่อ start_combat ทำงาน engine จะสร้างกริด 12×10 ช่องอัตโนมัติ — ผู้เล่นอยู่ด้านล่าง ศัตรูอยู่ด้านบน
- แต่ละช่อง = 5 ฟุต — D&D 2024: melee reach 5ft (1 ช่อง), reach weapons 10ft (2 ช่อง: Glaive/Halberd/Pike/Lance/Whip), ranged มี rangeNormal/rangeLong ที่แปลงเป็นช่อง
- ผู้เล่นเคลื่อนที่ได้ 6 ช่อง/รอบ (30 ฟุต) — กดพื้นเขียวบนกริดเพื่อเคลื่อนที่
- ศัตรูใช้ Tactical AI (Domain 32): ประเมิน risk, เลือก action (attack/retreat/hold/kite), หนีเมื่อ HP<25% + risk สูง
- D&D 2024 Weapon Mastery: อาวุธแต่ละชนิดมี mastery 1 ชนิดจาก 8 (Cleave/Graze/Push/Sap/Slow/Topple/Vex/Nick) — เฉพาะ Fighter/Paladin/Ranger/Barbarian/Monk
- Opportunity Attacks: ศัตรูโจมตีเมื่อผู้เล่นเคลื่อนที่ออกจาก reach — มี Disengage action สำหรับหลีก
- ผู้เล่นหายตัว/ซ่อน: ศัตรูไม่เห็น → ไม่โจมตีได้ (ยกเว้นอยู่ติดกัน โจมตีมืดๆ ด้วย disadvantage)
- engine คำนวณความยาก: legacy + Domain 34 (XP thresholds + CR suggestions)
- 🧠 AI log: แสดง tactical decision ของศัตรูใน combat feed

ระบบร้านค้า (Shop):
- ผู้เล่นกดปุ่ม "🏪 ร้านค้า" เพื่อซื้อ/ขาย อาวุธ/เกราะ/ของวิเศษ/ยา
- ราคาตาม PHB 2024 · ขายของได้ 50% ของราคาซื้อ (D&D 5e standard)
- เปิดร้านได้เฉพาะตอนไม่อยู่ใน combat

ระบบสถานที่ (Scene Types):
- D&D 5e มี 3 pillars: Combat, Social, Exploration — แต่ละ scene มี tension (calm/low/medium/high/climax)
- 5-Room Dungeon pattern: Entrance+Guardian → Puzzle → Trick/Setback → Climax → Reward/Revelation
- DM ควรสร้าง dungeon ตาม pattern นี้เพื่อให้ผู้เล่นมีประสบการณ์ครบ

ระบบเสริมที่ engine รองรับ:
- Temporary HP: ใช้ updates.temp_hp เพื่อให้ temp HP (ดูดดาเมจก่อน HP จริง)
- Resistance/Vulnerability/Immunity: ใส่ใน monster stat block (resistances/vulnerabilities/immunities array ของ damage type)
- Cover System: แต่ละช่องบนกริดมี cover (none/half/three-quarter/total) ให้ +AC
- Passive Perception: engine คำนวณ 10 + WIS mod + proficiency (แสดงใน character sheet)
- Grapple/Shove (D&D 2024): ปุ่มใน combat — target ทอย STR หรือ DEX save (เลือกเอง) vs DC = 8 + STR mod + PB ของคุณ → ตรึง (Grappled) หรือ ผลัก 5 ฟุต / ล้ม (Prone)
- Dual Wield: ถ้าถืออาวุธ light ได้ bonus action โจมตีมือนอก (ดาเมจ = เต๋าอาวุธอย่างเดียว)
- Quest Journal: ใช้ updates.quest_add { id, title, description, objectives, reward, giver } และ updates.quest_update { id, status/complete_objective }
- Time/Calendar: ใช้ updates.time_delta (ชั่วโมง) — engine ติดตามวันและเวลา แสดงใน header
- Encounter Difficulty: engine คำนวณอัตโนมัติตอน combat เริ่ม (D&D 2024: Low / Moderate / High) พร้อม XP thresholds และ CR แนะนำ

AI DM Layer (Domain 31-35) — engine วิเคราะห์ให้คุณ:
- Intent Analysis: engine วิเคราะห์ intent ของผู้เล่น (greeting/ask_question/negotiate/persuade/intimidate/deceive/trade/give_item/request_quest/report_progress/accuse/flatter/threaten/end_conversation) — ดูใน hint ที่ engine ส่งให้ก่อน Player: ... ใช้ปรับน้ำเสียง narration ให้เหมาะกับ intent
- Narrative Pacing: engine ติดตาม tension (calm/low/medium/high/climax) และ scene types — ถ้าเล่นมานานเกินไป engine จะแนะนำให้มี scene สงบ
- Encounter Difficulty Tables: Lv.${c.level} thresholds (D&D 2024: trivial ${getDifficultyThresholds(c.level).trivial}/low ${getDifficultyThresholds(c.level).low}/moderate ${getDifficultyThresholds(c.level).moderate}/high ${getDifficultyThresholds(c.level).high}/impossible ${getDifficultyThresholds(c.level).impossible} XP) — เลือก monsters ตาม target difficulty (3 tiers + 2 informal)
- Combat Events: engine ปล่อย events (on_attack, on_hit, on_damage, on_cast_spell, on_turn_start/end) — features/feats ทำงานอัตโนมัติผ่าน EventBus (เช่น Savage Attacker, Poison Weapon, Relentless Endurance)
- Concentration Tracking: engine roll CON save อัตโนมัติเมื่อ caster โดนดาเมจ — Bless/Haste/Shield of Faith อาจหายได้
- Tactical AI (Domain 32): ศัตรูตัดสินใจเอง — ประเมิน risk, เลือก action (attack/retreat/hold/kite), หนีเมื่อ HP < 25% และ risk สูง — engine แสดง 🧠 AI log ใน combat feed
- Content Management (Domain 35): ผู้เล่นเปิด Content Manager ได้ (ปุ่ม 📦 Content) เพื่อ import/export homebrew — สามารถสร้าง spell/monster/item เองแล้วใช้ในเกม

ตอบเป็น JSON เท่านั้น (ห้าม markdown, ห้ามข้อความนอก JSON):
{
  "narration": "ข้อความบรรยายภาษาไทย",
  "scene": "ป้ายสถานที่สั้นๆ หรือ null",
  "requires": null หรือ {"type":"check","skill":"<หนึ่งใน: ${Object.keys(SKILLS).join("|")}>","dc":13,"advantage":"none|advantage|disadvantage"} หรือ {"type":"save","ability":"str|dex|con|int|wis|cha","dc":12,"on_fail_damage":"2d6","half_on_success":true},
  "start_combat": null หรือ {"monsters":["goblin","goblin"], "surprise": false},
  "world_map": null หรือ [{ "id":"phandalin", "name":"Phandalin", "type":"town", "dir":"n", "from":null, "description":"เมืองเริ่มต้น" }, ...],
  "map_update": null หรือ {"add_location":{"id":"old_mill","name":"Old Mill","type":"building","dir":"ne","from":null},"move_to":"old_mill","connect":null},
  "dungeon_enter": null หรือ {"theme":"crypt","id":"bonecrypt","name":"ถ้ำกระดูก","hook":"ชาวบ้านหายไป","antagonist":"Lich"} หรือ {"id":"...","name":"...","theme":"...","entranceRoomId":"entrance_1","rooms":[...],"connections":[...],"bossRoomId":"climax_4","recommendedLevel":2,"hook":"...","antagonist":"..."},
  "dungeon_room_move": null หรือ {"room_id":"puzzle_2"},
  "dungeon_exit": null หรือ true,
  "updates": null หรือ {"hp_delta":0,"gold_delta":0,"xp_award":0,"items_add":[],"items_use":[],"items_remove":[],"conditions_add":[],"conditions_remove":[],"buffs_add":[],"buffs_remove":[]}
}
ห้ามใช้ requires และ start_combat พร้อมกัน ถ้าเพิ่งได้รับ [ผลทอย] ห้ามสั่ง requires ซ้ำ ใช้ world_map เฉพาะ response แรกของแคมเปญใหม่เท่านั้น ใช้ map_update สำหรับการค้นพบถัดไป เมื่ออยู่ในดันเจี้ยนใช้ dungeon_room_move แทน map_update.add_location สำหรับห้องใหม่

ฟิลด์เพิ่มเติมใน "updates" ที่ DM ใช้ได้ (D&D DM capabilities):
- "loot_drop": ["50gp", "Potion of Healing", "Longsword +1"] — มอบของหลัง combat/เหตุการณ์
- "npc_attitude": {"npc_id": "barbara", "attitude": "friendly", "reason": "ช่วยเหลือ"} — เปลี่ยนท่าที NPC
- "faction_reputation": {"faction_id": "town_guard", "delta": 10} — ปรับชื่อเสียงกับกลุ่ม
- "weather": "rain" — เปลี่ยนอากาศ (rain/fog/storm/clear/snow)
- "environment": "darkness" — สภาพแวดล้อมพิเศษ (darkness/fog/magical_darkness)
- "scene_type": "social" — ประเภทฉาก (combat/social/exploration/puzzle/rest/revelation)
- "exhaustion_delta": 1 — เพิ่ม/ลด exhaustion (D&D 2024: -2/level ต่อ D20 Test, Lv6 = ตาย). ใช้ได้เฉพาะเมื่อมีเหตุผลที่สมเหตุสมผล:
  • Forced march: ถ้า time_delta > 8 ชม. ของการเดินทาง — engine จะ auto CON save ให้แล้ว ไม่ต้องส่ง exhaustion_delta
  • ไม่กินไม่ดื่ม: หลายวันโดยไม่มีอาหาร/น้ำ → 1 level/วัน
  • สภาพอากาศหนัก: หนาวจัด/ร้อนจัดโดยไม่มีอุปกรณ์ป้องกัน
  • เวทมนตร์: บางเวทสร้าง exhaustion (Sickening Radiance)
  • ห้ามใช้ exhaustion_delta โดยไม่มีเหตุผลชัดเจน — ห้ามเพิ่มเพราะ "เดินไปร้านค้า" หรือ "ออกจากห้อง"
- "rest_trigger": "short" หรือ "long" — แนะนำให้ผู้เล่นพัก (⚠️ ห้ามใช้ถ้าผู้เล่นเพิ่งพัก! ดู "พักผ่อน" ใน STORY CONTEXT — ถ้าเขียนว่า "เพิ่งตื่นนอน" หรือ "ยังสดชื่น" ห้ามแนะนำให้พักเด็ดขาด)
- "level_up_choice": true — มอบตัวเลือก ASI/Feat (เมื่อ level up)
- "temp_hp": 5 — มอบ Temporary HP

DM สามารถทำได้ทุกอย่างที่ DM ตัวจริงทำ:
- บรรยายฉาก สร้างบรรยากาศ ควบคุม NPC
- สั่ง Skill check / Saving throw
- เริ่ม/จบ combat พร้อมมอนสเตอร์จาก SRD
- มอบ XP/ทอง/ไอเทม/เวท/Feat
- ใส่/ถอน Conditions และ Buffs
- สร้างแผนที่โลก เพิ่มสถานที่ ย้ายผู้เล่น
- เพิ่ม/อัปเดตเควสต์
- เปลี่ยนอากาศ/สภาพแวดล้อม
- ปรับท่าที NPC และชื่อเสียงกลุ่ม
- มอบ Exhaustion (เดินทางนาน/ไม่พัก/คาถา)
- บังคับพัก (เมื่อเหมาะสม)
- มอบ Loot หลัง combat

⚠️ กฎการอยู่ในฉาก (Scene Anchoring) — สำคัญมาก:
1. ผู้เล่นอยู่ในสถานที่ปัจจุบัน (ระบุใน [CURRENT SCENE] ก่อนข้อความผู้เล่น) — ห้ามเปลี่ยนสถานที่โดยที่ผู้เล่นไม่ได้บอกว่าจะไปที่อื่น
2. ถ้าผู้เล่นพูด/ถาม/โต้ตอบ → ให้ตอบในฐานะ NPC หรือบรรยายผลในฉากเดิม — ห้ามข้ามไปเล่าเรื่องอื่น
3. ถ้าผู้เล่นถามเกี่ยวกับสินค้า/ราคา/ซื้อขาย → ให้พ่อค้า NPC ตอบเอง — ห้ามบรรยายการเดินทางหรือเข้าป่า
4. ถ้าผู้เล่นสำรวจ/มอง/ฟัง → บรรยายเฉพาะสิ่งที่อยู่ในฉากปัจจุบันเท่านั้น
5. จะย้ายผู้เล่นไปสถานที่ใหม่ได้ก็ต่อเมื่อผู้เล่นพูดชัดเจน เช่น "ออกจากร้าน", "เดินไปป่า", "ไปวัด"
6. ใช้ map_update.move_to เฉพาะเมื่อผู้เล่นย้ายที่จริง ๆ — ไม่ใช่ตอนที่ผู้เล่นแค่ถามคำถาม

⚠️ Intent-based Response Rules:
- intent=trade/bargain → ตอบเป็นพ่อค้า NPC (พูดถึงสินค้า ราคา การแลกเปลี่ยน) ห้ามเปลี่ยนฉาก
- intent=negotiate/persuade/intimidate/deceive → ตอบเป็น NPC ที่กำลังโต้ตอบกับผู้เล่น ห้ามเปลี่ยนฉาก
- intent=greeting/ask_question → ตอบในฉากเดิม ห้าม advance story
- intent=request_quest → ให้ NPC หรือสถานการณ์ในฉากเดิมเสนอเควสต์ ห้ามเปลี่ยนฉาก
- intent=explore → บรรยายสิ่งที่เห็นในฉากเดิม ถ้าผู้เล่นบอกว่าจะไปที่อื่นค่อยย้าย
- เฉพาะ intent ที่ชัดเจนว่าจะย้ายที่ (เช่น "เดินไป...", "ออกจาก...", "ไปที่...") เท่านั้นที่อนุญาตให้เปลี่ยนฉาก

โครงสร้างการตอบ:
1. อ่าน [CURRENT SCENE] เพื่อรู้ว่าผู้เล่นอยู่ที่ไหน
2. อ่าน [AI DM hint: intent=...] เพื่อรู้ว่าผู้เล่นต้องการอะไร
3. ตอบในฉากเดิม — ห้ามข้ามไปเล่าเรื่องอื่น
4. ถ้าผู้เล่นต้องการย้ายที่จริง ๆ ถึงจะใช้ map_update.move_to${pacingDirective}`;
}

async function callDM(systemPrompt: string, history: any[]): Promise<{ narration: string; scene?: string | null; requires?: any; start_combat?: any; world_map?: any; map_update?: any; dungeon_enter?: any; dungeon_room_move?: any; dungeon_exit?: any; updates?: any; __validationWarnings?: string[] }> {
  const response = await fetch("/api/dm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system: systemPrompt, messages: history }),
  });
  if (!response.ok) {
    let msg = `DM HTTP ${response.status}`;
    try { const err = await response.json(); if (err?.error) msg = err.error; } catch (_) {}
    throw new Error(msg);
  }
  const data = await response.json();
  const text: string = data.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("DM ไม่ได้ตอบเป็น JSON");
  const jsonStr = clean.slice(start, end + 1);

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    // Try to repair: if the JSON was cut off (max_tokens), close any open arrays/objects
    let repaired = jsonStr;
    repaired = repaired.replace(/,\s*$/, "");
    const opens = (repaired.match(/[\[{]/g) || []).length;
    const closes = (repaired.match(/[\]}]/g) || []).length;
    while (opens > closes) {
      repaired += "}";
      const o2 = (repaired.match(/[\[{]/g) || []).length;
      const c2 = (repaired.match(/[\]}]/g) || []).length;
      if (c2 >= o2) break;
    }
    try {
      parsed = JSON.parse(repaired);
    } catch {
      // Last resort: extract just the narration field
      const narrMatch = repaired.match(/"narration"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const sceneMatch = repaired.match(/"scene"\s*:\s*("(?:[^"\\]|\\.)*"|null)/);
      parsed = {
        narration: narrMatch ? narrMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') : "DM ตอบ JSON ไม่สมบูรณ์ ลองพิมพ์ action ใหม่",
        scene: sceneMatch ? (sceneMatch[1] === "null" ? null : sceneMatch[1].slice(1, -1)) : null,
        requires: null,
        start_combat: null,
        world_map: null,
        map_update: null,
        updates: null,
      };
    }
  }

  // === Phase 1: Schema validation (zod) — engine ไม่ trust LLM ===
  const validation = validateDMResponse(parsed);
  if (validation.warnings.length > 0 || validation.errors.length > 0) {
    // Log to console for debugging
    if (validation.errors.length > 0) {
      console.warn("[DM schema validation errors]", validation.errors);
    }
    if (validation.warnings.length > 0) {
      console.warn("[DM schema validation warnings]", validation.warnings);
    }
  }
  // Always return validated data (with __validationWarnings for UI display)
  const result = validation.data!;
  return {
    ...result,
    __validationWarnings: validation.warnings,
  };
}

/* ---------------- STORAGE (delegates to engineAdapters for v3 + versioning) ---------------- */
async function saveGame(payload: any) {
  engineSaveGame(payload);
}
async function loadGame(): Promise<LegacySave | null> {
  return engineLoadGame();
}
async function deleteSave() {
  engineDeleteSave();
}

/* ---------------- UI SUBCOMPONENTS ---------------- */
// F4: Memoized HPBar — prevents unnecessary re-renders when HP doesn't change
const HPBar = React.memo(function HPBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const color = pct > 50 ? "#7FA85C" : pct > 25 ? "#E0A83E" : "#C74B44";
  return (
    <div className="hpbar">
      <div className="hpbar-fill" style={{ width: pct + "%", background: color }} />
      <span className="hpbar-label">{hp} / {maxHp} HP</span>
    </div>
  );
});

// F4: Memoized RollTicket — prevents re-render of all roll entries when new ones are added
const RollTicket = React.memo(function RollTicket({ entry }: { entry: any }) {
  const r = entry.roll;
  const crit = r.die === 20;
  const fumble = r.die === 1;
  return (
    <div className={"ticket" + (entry.success === true ? " ok" : entry.success === false ? " bad" : "")}>
      <div className="ticket-die-wrap">
        <div className={"ticket-die" + (crit ? " crit" : "") + (fumble ? " fumble" : "")}>{r.die}</div>
        {r.other !== null && r.other !== undefined && <div className="ticket-die ghost">{r.other}</div>}
      </div>
      <div className="ticket-body">
        <div className="ticket-title">{entry.title}</div>
        <div className="ticket-math">
          d20 <b>{r.die}</b> {r.mod >= 0 ? "+" : ""}{r.mod} = <b>{r.total}</b>
          {entry.dc != null && <> vs DC {entry.dc}</>}
          {entry.vsAc != null && <> vs AC {entry.vsAc}</>}
          {r.adv !== "none" && <span className="ticket-adv"> · {r.adv === "advantage" ? "ADV" : "DIS"}</span>}
        </div>
        {entry.extra && <div className="ticket-extra">{entry.extra}</div>}
      </div>
      {entry.success !== undefined && entry.success !== null && (
        <div className={"stamp " + (entry.success ? "s-ok" : "s-bad")}>
          {crit && entry.success ? "CRIT!" : entry.success ? "Success" : entry.vsAc != null ? "Miss" : "Fail"}
        </div>
      )}
    </div>
  );
});

/* ---------------- MAIN APP ---------------- */
export default function DnDSolo() {
  const [phase, setPhase] = useState<"loading" | "menu" | "create" | "play" | "dead">("loading");
  const [onboardStep, setOnboardStep] = useState<number>(-1); // -1 = not showing, 0-3 = steps
  const [hasSave, setHasSave] = useState(false);
  const [c, setC] = useState<any>(null);
  const [scene, setScene] = useState("");
  const [log, setLog] = useState<any[]>([]);
  const [combat, setCombat] = useState<any>(null);
  const [map, setMap] = useState<any>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [combatMenu, setCombatMenu] = useState<"" | "spell" | "item">("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"stats" | "skills" | "items" | "spells">("stats");
  const [asiPicks, setAsiPicks] = useState<string[]>([]);
  // Character creation state
  const [ccStep, setCcStep] = useState(0); // 0-11 steps
  const [ccName, setCcName] = useState("");
  const [ccRace, setCcRace] = useState("human");
  const [ccClass, setCcClass] = useState("fighter");
  const [ccBg, setCcBg] = useState("soldier");
  const [ccAbilityMethod, setCcAbilityMethod] = useState<"array" | "pointbuy" | "roll">("array");
  const [ccAbilityScores, setCcAbilityScores] = useState<Record<string, number>>({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });
  const [ccPickedSkills, setCcPickedSkills] = useState<string[]>([]);
  const [ccExpertise, setCcExpertise] = useState<string[]>([]);
  const [ccPickedEquipment, setCcPickedEquipment] = useState<string[]>([]);
  const [ccPickedSpells, setCcPickedSpells] = useState<string[]>([]);
  const [ccDetails, setCcDetails] = useState({ age: "", height: "", appearance: "", ideal: "", bond: "", flaw: "", backstory: "" });
  // D&D 2024 character creation: alignment + languages + personality
  const [ccAlignment, setCcAlignment] = useState<string>("true_neutral");
  const [ccLanguages, setCcLanguages] = useState<string[]>([]);
  const [ccPersonality, setCcPersonality] = useState<string>("");
  // Background ASI choices (D&D 2024 — player picks +2/+1 or +1/+1/+1)
  const [ccBgAsiPlus2, setCcBgAsiPlus2] = useState<string>("");  // ability that gets +2 (or first of +1/+1/+1)
  const [ccBgAsiPlus1, setCcBgAsiPlus1] = useState<string>("");  // ability that gets +1
  const [ccSpellChoices, setCcSpellChoices] = useState<{ index: string; name: string; level: number }[]>([]);
  const [ccSpellChoicesLoading, setCcSpellChoicesLoading] = useState(false);
  // Quest journal & game time state
  const [quests, setQuests] = useState<Quest[]>([]);
  const [gameTime, setGameTime] = useState({ day: 1, hour: 8 });
  const [questJournalOpen, setQuestJournalOpen] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  // AI DM Layer state (Domain 31-35)
  const [dialogueSession, setDialogueSession] = useState<DialogueSession | null>(null);
  const [narrativeEngine, setNarrativeEngine] = useState<NarrativeEngine | null>(null);
  const [dmHelperOpen, setDmHelperOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  // Domain 35: Content Management state
  const [contentRegistry, setContentRegistry] = useState<ContentRegistry>(() => createContentRegistry());
  const [contentManagerOpen, setContentManagerOpen] = useState(false);
  const [contentImportText, setContentImportText] = useState("");
  const [contentImportMsg, setContentImportMsg] = useState("");
  const [contentExportText, setContentExportText] = useState("");
  const [contentFilterType, setContentFilterType] = useState<ContentType | "all">("all");
  // Shop state (D&D 5e economy)
  const [shopOpen, setShopOpen] = useState(false);
  const [shopTab, setShopTab] = useState<"weapons" | "armor" | "magic" | "consumables" | "sell">("weapons");
  const [shopSearch, setShopSearch] = useState("");
  const [ioText, setIoText] = useState("");
  const [ioMsg, setIoMsg] = useState("");
  // Spellbook browser state
  const [spellBrowserOpen, setSpellBrowserOpen] = useState(false);
  const [spellBrowserLoading, setSpellBrowserLoading] = useState(false);
  const [availableSpells, setAvailableSpells] = useState<{ index: string; name: string; level: number }[]>([]);
  const [spellDetail, setSpellDetail] = useState<NormalizedSpell | null>(null);
  const [spellDetailLoading, setSpellDetailLoading] = useState(false);
  // Domain 36: Dungeon Blueprint state
  const [dungeonBlueprint, setDungeonBlueprint] = useState<DungeonBlueprint | null>(null);
  const [dungeonRun, setDungeonRun] = useState<DungeonRunState | null>(null);
  const [dungeonMapOpen, setDungeonMapOpen] = useState(false);
  // Pending room staged encounter (when DM triggers a blueprint room)
  const [pendingRoomEncounter, setPendingRoomEncounter] = useState<{ monsterIds: string[]; surprise: boolean; isBoss: boolean } | null>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const mapRef = useRef<any>(null);
  const cRef = useRef<any>(null);
  const combatRef = useRef<any>(null);
  const logDataRef = useRef<any[]>([]);
  const dungeonBlueprintRef = useRef<DungeonBlueprint | null>(null);
  const dungeonRunRef = useRef<DungeonRunState | null>(null);
  const nextId = () => ++idRef.current;

  useEffect(() => { mapRef.current = map; }, [map]);
  useEffect(() => { cRef.current = c; }, [c]);
  useEffect(() => { combatRef.current = combat; }, [combat]);
  useEffect(() => { logDataRef.current = log; }, [log]);
  useEffect(() => { dungeonBlueprintRef.current = dungeonBlueprint; }, [dungeonBlueprint]);
  useEffect(() => { dungeonRunRef.current = dungeonRun; }, [dungeonRun]);

  const [srdStatus, setSrdStatus] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    (async () => {
      const save = await loadGame();
      if (save) {
        // Sync WorldClock with loaded save's gameTime
        if (save.gameTime) {
          initWorldClockFromLegacy(save.gameTime);
          setGameTime(save.gameTime);
        }
      }
      setHasSave(!!save);
      setPhase("menu");
    })();
    srdProbe().then((ok) => { SRD_OK = ok; setSrdStatus(ok ? "online" : "offline"); });
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log, thinking]);

  const persist = useCallback((cc: any, sc: string, lg: any[], cb: any, hist: any[]) => {
    saveGame({
      c: cc, scene: sc, log: lg.slice(-80), combat: cb, history: hist.slice(-24),
      map: mapRef.current, gameTime: worldClockToLegacy(getWorldClock()), quests,
      dungeonBlueprint: dungeonBlueprintRef.current,
      dungeonRun: dungeonRunRef.current,
    });
  }, [quests]);

  function entryNarration(text: string) { return { id: nextId(), type: "dm", text }; }
  function entryPlayer(text: string) { return { id: nextId(), type: "player", text }; }
  function entrySystem(text: string) { return { id: nextId(), type: "system", text }; }

  /** Phase 1: Show DM schema validation warnings to player (transparent about state drift) */
  function logValidationWarnings(res: any, entries: any[]): void {
    const warnings = res?.__validationWarnings;
    if (Array.isArray(warnings) && warnings.length > 0) {
      for (const w of warnings) {
        entries.push(entrySystem(`⚠️ DM schema: ${w}`));
      }
    }
  }

  // Feature-check helper for engine adapters — they need a function (id, key) => boolean
  // Players are always "player" id; enemies don't have features (yet).
  function characterHasFeatureById(id: string, key: string): boolean {
    if (id === "player" || id === cRef.current?.id) {
      return hasFeature(cRef.current, key);
    }
    const cb = combatRef.current;
    if (cb) {
      const enemy = cb.enemies.find((e: any) => e.uid === id);
      if (enemy && enemy.features) return enemy.features.includes(key);
    }
    return false;
  }

  // Apply pending state changes produced by feature triggers (data-driven)
  function applyPendingChanges(changes: PendingStateChange[], cc: any, cb: any, entries: any[]): { cc: any; cb: any } {
    let nc = cc;
    let ncb = cb;
    for (const change of changes) {
      if (change.payload.narration) entries.push(entrySystem(`✨ ${change.payload.narration}`));
      switch (change.type) {
        case "apply_condition": {
          const cid = change.payload.conditionId!;
          const dur = change.payload.conditionDuration || 1;
          if (change.targetId === "player" || change.targetId === nc.id) {
            if (!nc.conditions.includes(cid)) {
              nc = { ...nc, conditions: [...nc.conditions, cid] };
              entries.push(entrySystem(`   → ติดสภาวะ ${cid} (${dur} รอบ) — จาก ${change.sourceFeature}`));
            }
          } else {
            ncb = { ...ncb, enemies: ncb.enemies.map((e: any) => {
              if (e.uid === change.targetId) {
                const conds = e.conditions || [];
                if (!conds.includes(cid)) {
                  entries.push(entrySystem(`   → ${e.th} ติดสภาวะ ${cid} — จาก ${change.sourceFeature}`));
                  return { ...e, conditions: [...conds, cid] };
                }
              }
              return e;
            })};
          }
          emitConditionApplied(change.targetId, cid, change.sourceFeature);
          break;
        }
        case "deal_damage": {
          const dmg = change.payload.damageFormula ? rollFormula(change.payload.damageFormula).total : 0;
          if (dmg > 0) {
            ncb = { ...ncb, enemies: ncb.enemies.map((e: any) => {
              if (e.uid === change.targetId) {
                const newHp = Math.max(0, e.hpNow - dmg);
                entries.push(entrySystem(`   → ${e.th} โดน ${dmg} ${change.payload.damageType || ""} (${change.sourceFeature}) → ${newHp} HP`));
                return { ...e, hpNow: newHp };
              }
              return e;
            })};
            emitDamageDealt("player", change.targetId, dmg, change.payload.damageType);
          }
          break;
        }
        case "heal": {
          const heal = change.payload.healFormula ? rollFormula(change.payload.healFormula).total : 0;
          if (heal > 0 && (change.targetId === "player" || change.targetId === nc.id)) {
            nc = { ...nc, hp: Math.min(nc.maxHp, nc.hp + heal) };
            entries.push(entrySystem(`   → ฟื้น ${heal} HP (${change.sourceFeature})`));
            emitHeal("player", change.targetId, heal);
          }
          break;
        }
        case "narrate":
          break;
        case "reroll_damage": {
          // B4 fix: Savage Attacker (D&D 2024) — reroll weapon damage dice, keep higher total
          // The trigger fires after a weapon hit. We need the weapon's damage formula.
          // Since we don't have access to the weapon here, we store lastDamageRoll on the combat state.
          // Fallback: if no lastDamageRoll tracked, reroll 1d8 (average weapon die) as approximation
          const lastRoll = (cb as any)._lastWeaponDamageRoll;
          let rerollTotal: number;
          let rerollFormula: string;
          if (lastRoll && lastRoll.formula) {
            const reroll = rollFormula(lastRoll.formula);
            rerollTotal = reroll.total;
            rerollFormula = lastRoll.formula;
            // Keep higher of original vs reroll
            if (rerollTotal > lastRoll.total) {
              const bonusDmg = rerollTotal - lastRoll.total;
              ncb = { ...ncb, enemies: ncb.enemies.map((e: any) => {
                if (e.uid === change.targetId) {
                  const newHp = Math.max(0, e.hpNow - bonusDmg);
                  entries.push(entrySystem(`   ⚔️ ${change.sourceFeature}: reroll ${rerollFormula}=${rerollTotal} > ${lastRoll.total} → +${bonusDmg} → ${newHp} HP`));
                  return { ...e, hpNow: newHp };
                }
                return e;
              })};
              emitDamageDealt("player", change.targetId, bonusDmg, lastRoll.damageType || "slashing");
            } else {
              entries.push(entrySystem(`   ⚔️ ${change.sourceFeature}: reroll ${rerollFormula}=${rerollTotal} ≤ ${lastRoll.total} → keep original`));
            }
            // Consume the tracked roll (once per turn)
            (cb as any)._lastWeaponDamageRoll = null;
          } else {
            // No tracked roll — skip (shouldn't happen if trigger fires correctly)
            entries.push(entrySystem(`   ⚔️ ${change.sourceFeature}: no weapon damage to reroll`));
          }
          break;
        }
      }
    }
    return { cc: nc, cb: ncb };
  }

  function applyUpdates(u: any, cc: any, entries: any[]) {
    if (!u) return cc;
    let nc = { ...cc, conditions: [...cc.conditions], inventory: [...cc.inventory], buffs: [...(cc.buffs || [])] };
    if (u.hp_delta) {
      // Apply temp HP first if taking damage
      if (u.hp_delta < 0 && (nc.tempHp || 0) > 0) {
        const absorbed = Math.min(nc.tempHp, Math.abs(u.hp_delta));
        nc.tempHp -= absorbed;
        const remaining = Math.abs(u.hp_delta) - absorbed;
        if (remaining > 0) nc.hp = Math.max(0, nc.hp - remaining);
        entries.push(entrySystem(`HP ${u.hp_delta > 0 ? "+" : ""}${u.hp_delta} (Temp HP ดูด ${absorbed}) → ${nc.hp}/${nc.maxHp}${nc.tempHp > 0 ? ` +${nc.tempHp} temp` : ""}`));
      } else {
        nc.hp = Math.max(0, Math.min(nc.maxHp, nc.hp + u.hp_delta));
        entries.push(entrySystem(`HP ${u.hp_delta > 0 ? "+" : ""}${u.hp_delta} → ${nc.hp}/${nc.maxHp}${nc.tempHp > 0 ? ` +${nc.tempHp} temp` : ""}`));
      }
    }
    if (u.temp_hp) {
      nc.tempHp = Math.max(nc.tempHp || 0, u.temp_hp);
      entries.push(entrySystem(`🛡️ Temporary HP +${u.temp_hp} (ตอนนี้ ${nc.tempHp} temp HP)`));
    }
    if (u.gold_delta) {
      nc.gold = Math.max(0, nc.gold + u.gold_delta);
      entries.push(entrySystem(`ทอง ${u.gold_delta > 0 ? "+" : ""}${u.gold_delta} → ${nc.gold} gp`));
    }
    // Quest management — never let a malformed quest payload throw and
    // discard the rest of this response's updates (schema-validated upstream,
    // but guarded again here defensively).
    if (u.quest_add) {
      try {
        const q = u.quest_add;
        if (q && q.id && !quests.find(x => x.id === q.id)) {
          const newQuests = [...quests, { ...q, status: "active" }];
          setQuests(newQuests);
          entries.push(entrySystem(`📜 เควสต์ใหม่: ${q.title} — ${q.description}`));
        }
      } catch (e: any) {
        console.warn("[applyUpdates] quest_add skipped:", e);
        entries.push(entrySystem(`⚠️ เควสต์ใหม่ไม่สมบูรณ์ — ข้าม`));
      }
    }
    if (u.quest_update) {
      try {
        const qu = u.quest_update;
        const newQuests = quests.map(q => {
          if (q.id === qu.id) {
            if (qu.complete_objective !== undefined) {
              return { ...q, objectives: (q.objectives || []).map((o, i) => i === qu.complete_objective ? { ...o, done: true } : o) };
            }
            if (qu.status) return { ...q, status: qu.status };
          }
          return q;
        });
        setQuests(newQuests);
        if (qu.status === "completed") entries.push(entrySystem(`✅ เควสต์เสร็จสิ้น: ${qu.id}`));
        if (qu.status === "failed") entries.push(entrySystem(`❌ เควสต์ล้มเหลว: ${qu.id}`));
      } catch (e: any) {
        console.warn("[applyUpdates] quest_update skipped:", e);
        entries.push(entrySystem(`⚠️ อัปเดตเควสต์ไม่สมบูรณ์ — ข้าม`));
      }
    }
    // Time advancement (uses WorldClock internally, syncs back to legacy gameTime state)
    if (u.time_delta) {
      const newTime = engineAdvanceHours(u.time_delta);
      setGameTime(newTime);
      // Increment rest timers when time passes
      nc.lastLongRestHoursAgo = (nc.lastLongRestHoursAgo ?? 0) + u.time_delta;
      nc.lastShortRestHoursAgo = (nc.lastShortRestHoursAgo ?? 0) + u.time_delta;
      entries.push(entrySystem(`⏰ เวลาผ่านไป ${u.time_delta} ชม. → ${gameTimeToString(newTime)}`));
    }
    (u.items_use || []).forEach((it: string) => {
      const idx = nc.inventory.indexOf(it);
      if (idx < 0) { entries.push(entrySystem(`ไม่มี ${it} ในเป้สัมภาระ`)); return; }
      const consum = CONSUMABLES[it];
      nc.inventory.splice(idx, 1);
      if (consum && consum.heal) {
        const h = rollFormula(consum.heal);
        nc.hp = Math.min(nc.maxHp, nc.hp + h.total);
        entries.push(entrySystem(`🧪 ใช้ ${it}: ฟื้น ${h.total} HP → ${nc.hp}/${nc.maxHp}`));
      } else if (consum && consum.cure) {
        const ci = nc.conditions.indexOf(consum.cure);
        if (ci >= 0) { nc.conditions.splice(ci, 1); entries.push(entrySystem(`🧪 ใช้ ${it}: หายจาก ${consum.cure}`)); }
        else entries.push(entrySystem(`🧪 ใช้ ${it}: ไม่มีสถานะให้แก้ (เสียของฟรี)`));
      } else {
        entries.push(entrySystem(`ใช้: ${it}`));
      }
    });
    (u.items_add || []).forEach((it: string) => {
      nc.inventory.push(it);
      entries.push(entrySystem(`ได้รับ: ${it}`));
      // Auto-detect spell scroll: "Spell Scroll: <name>"
      const scrollMatch = it.match(/^Spell Scroll:\s*(.+)$/i);
      if (scrollMatch) {
        entries.push(entrySystem(`📖 พบ Spell Scroll — เปิดสมุดเวทมนตร์ (📜 → เวทมนตร์) เพื่อเรียน ${scrollMatch[1]}`));
      }
      // Auto-detect feat: "Feat: <name>"
      const featMatch = it.match(/^Feat:\s*(.+)$/i);
      if (featMatch) {
        const featName = featMatch[1];
        const featIndex = featName.toLowerCase().replace(/\s+/g, "-");
        if (!(nc.feats || []).includes(featIndex)) {
          nc.feats = [...(nc.feats || []), featIndex];
          entries.push(entrySystem(`⭐ ได้รับ Feat: ${featName} — ดูในหน้าตัวละคร`));
        }
      }
    });
    (u.items_remove || []).forEach((it: string) => {
      const i = nc.inventory.indexOf(it); if (i >= 0) { nc.inventory.splice(i, 1); entries.push(entrySystem(`เสีย: ${it}`)); }
    });
    (u.conditions_add || []).forEach((cd: string) => { if (!nc.conditions.includes(cd) && CONDITIONS_TH[cd]) { nc.conditions.push(cd); entries.push(entrySystem(`สภาวะ: ${CONDITIONS_TH[cd]}`)); } });
    (u.conditions_remove || []).forEach((cd: string) => { const i = nc.conditions.indexOf(cd); if (i >= 0) { nc.conditions.splice(i, 1); entries.push(entrySystem(`หายจากสภาวะ: ${cd}`)); } });
    // Buffs/debuffs
    (u.buffs_add || []).forEach((b: any) => {
      const buff = typeof b === "string" ? { name: b, type: "buff", duration: -1, source: "unknown", effect_desc: "" } : b;
      // Remove existing buff with same name first
      nc.buffs = nc.buffs.filter((x: any) => x.name !== buff.name);
      nc.buffs.push(buff);
      const durText = buff.duration === 0 ? "ทันที" : buff.duration === -1 ? "จนกว่าจะ long rest" : `${buff.duration} รอบ`;
      entries.push(entrySystem(`${buff.type === "debuff" ? "🔻 Debuff" : "⬆️ Buff"}: ${buff.name} (${durText})${buff.effect_desc ? " — " + buff.effect_desc : ""}`));
    });
    (u.buffs_remove || []).forEach((bName: string) => {
      const before = nc.buffs.length;
      nc.buffs = nc.buffs.filter((x: any) => x.name !== bName);
      if (nc.buffs.length < before) entries.push(entrySystem(`Buff หมดไป: ${bName}`));
    });
    if (u.xp_award) nc = gainXP(nc, u.xp_award, entries);

    // === NEW DM Response Fields ===

    // loot_drop: DM specifies loot after combat
    if (u.loot_drop) {
      const loot = u.loot_drop;
      if (Array.isArray(loot)) {
        loot.forEach((item: any) => {
          if (typeof item === "string") {
            const goldMatch = item.match(/^(\d+)\s*gp$/i);
            if (goldMatch) {
              nc.gold += parseInt(goldMatch[1], 10);
              entries.push(entrySystem(`💰 ได้รับ ${goldMatch[1]} ทอง`));
            } else {
              nc.inventory.push(item);
              entries.push(entrySystem(`📦 ได้รับ: ${item}`));
            }
          } else if (typeof item === "object" && item.item) {
            nc.inventory.push(item.item);
            const qty = item.quantity || 1;
            for (let q = 1; q < qty; q++) nc.inventory.push(item.item);
            entries.push(entrySystem(`📦 ได้รับ: ${item.item}${qty > 1 ? ` ×${qty}` : ""}`));
          }
        });
      }
    }

    // npc_attitude: DM sets NPC attitude
    if (u.npc_attitude) {
      const att = u.npc_attitude;
      if (att.npc_id && att.attitude) {
        if (!nc.npcAttitudes) nc.npcAttitudes = {};
        nc.npcAttitudes[att.npc_id] = att.attitude;
        entries.push(entrySystem(`👤 ${att.npc_id} ท่าทีเปลี่ยนเป็น: ${att.attitude}${att.reason ? ` (${att.reason})` : ""}`));
      }
    }

    // faction_reputation: DM adjusts faction reputation
    if (u.faction_reputation) {
      const fr = u.faction_reputation;
      if (fr.faction_id && typeof fr.delta === "number") {
        if (!nc.factionReputation) nc.factionReputation = {};
        nc.factionReputation[fr.faction_id] = (nc.factionReputation[fr.faction_id] || 0) + fr.delta;
        entries.push(entrySystem(`🏛️ ชื่อเสียงกับ ${fr.faction_id}: ${fr.delta > 0 ? "+" : ""}${fr.delta} → ${nc.factionReputation[fr.faction_id]}`));
      }
    }

    // weather: DM changes weather
    if (u.weather) {
      nc.weather = u.weather;
      entries.push(entrySystem(`🌤️ อากาศเปลี่ยนเป็น: ${u.weather}`));
    }

    // environment: DM sets environment effect
    if (u.environment) {
      nc.environmentEffect = u.environment;
      entries.push(entrySystem(`🌍 สภาพแวดล้อม: ${u.environment}`));
    }

    // scene_type: DM sets current scene type
    if (u.scene_type) {
      nc.sceneType = u.scene_type;
      entries.push(entrySystem(`🎬 ประเภทฉาก: ${u.scene_type}`));
    }

    // level_up_choice: DM offers ASI or feat choice
    if (u.level_up_choice) {
      nc.pendingAsi = (nc.pendingAsi || 0) + 1;
      entries.push(entrySystem(`⬆️ ต้องเลือก Ability Score Improvement หรือ Feat — เปิดหน้าตัวละครเพื่อเลือก`));
    }

    // rest_trigger: DM forces rest
    if (u.rest_trigger === "short") {
      entries.push(entrySystem(`⛺ DM สั่งให้พักสั้น — กดปุ่ม "พักสั้น" เพื่อพัก`));
    } else if (u.rest_trigger === "long") {
      entries.push(entrySystem(`🌙 DM สั่งให้พักยาว — กดปุ่ม "พักยาว" เพื่อพัก`));
    }

    // exhaustion: DM applies exhaustion level
    // D&D 5e/2024 sources of exhaustion:
    //   - Forced march (>8h travel/day): CON save DC 10 + hours beyond 8
    //   - Starvation/dehydration: 1 level/day without food or water
    //   - Extreme weather (cold/heat) without protection
    //   - Spells (Sickening Radiance, etc.)
    //   - DM fiat for narrative reasons (long travel, no rest, drowning, etc.)
    if (u.exhaustion_delta) {
      nc.exhaustionLevel = Math.max(0, Math.min(6, (nc.exhaustionLevel || 0) + u.exhaustion_delta));
      const reason = u.exhaustion_reason || (u.exhaustion_delta > 0 ? "จากสาเหตุที่ DM กำหนด" : "ฟื้นตัว");
      entries.push(entrySystem(`😮‍💨 Exhaustion ${u.exhaustion_delta > 0 ? "+" : ""}${u.exhaustion_delta} → Lv.${nc.exhaustionLevel} (${reason})${nc.exhaustionLevel >= 6 ? " (ตาย!)" : ""}`));
      if (nc.exhaustionLevel >= 6) {
        nc.dead = true;
        setPhase("dead");
      }
    }
    // === Auto-exhaustion checks (D&D 5e/2024 RAW) ===
    // Forced march: if time_delta > 8 hours of travel, auto-check exhaustion
    if (u.time_delta && u.time_delta >= 8 && !u.rest_trigger) {
      const hoursBeyond = u.time_delta - 8;
      if (hoursBeyond > 0) {
        const forcedMarchDC = 10 + hoursBeyond;
        const conSave = rollD20(saveMod(nc, "con"));
        const survived = conSave.total >= forcedMarchDC;
        if (!survived) {
          nc.exhaustionLevel = Math.max(0, Math.min(6, (nc.exhaustionLevel || 0) + 1));
          entries.push(entrySystem(`😮‍💨 Forced March Exhaustion! เดินทาง ${u.time_delta} ชม. (เกิน 8 ชม.) → CON save ${conSave.total} < DC ${forcedMarchDC} → Exhaustion +1 → Lv.${nc.exhaustionLevel}`));
          if (nc.exhaustionLevel >= 6) {
            nc.dead = true;
            setPhase("dead");
          }
        } else {
          entries.push(entrySystem(`💪 Forced March: เดินทาง ${u.time_delta} ชม. → CON save ${conSave.total} ≥ DC ${forcedMarchDC} → ไม่เหนื่อยล้า`));
        }
      }
    }

    return nc;
  }

  // Tick down buff durations by one round (called at end of each combat round)
  function tickBuffs(cc: any, entries: any[]) {
    const nc = { ...cc, buffs: [...(cc.buffs || [])] };
    const expired: string[] = [];
    nc.buffs = nc.buffs.map((b: any) => ({ ...b })).filter((b: any) => {
      if (b.duration > 0) {
        b.duration -= 1;
        if (b.duration <= 0) { expired.push(b.name); return false; }
      }
      return true; // keep duration === 0 (instant, already applied) and duration === -1 (until long rest)
    });
    expired.forEach((name) => entries.push(entrySystem(`⏳ Buff หมดอายุ: ${name}`)));
    return nc;
  }

  // Get total AC bonus from active buffs
  function buffACBonus(cc: any): number {
    return (cc.buffs || []).reduce((sum: number, b: any) => {
      if (b.name === "Shield") return sum + 5;
      if (b.name === "Shield of Faith") return sum + 2;
      if (b.name === "Haste") return sum + 2;
      if (b.name === "Mage Armor" && cc.abilities) {
        // Mage Armor sets AC to 13+DEX (already in computeAC if mageArmor flag set); treat as +0 here
        return sum;
      }
      return sum;
    }, 0);
  }

  // Apply a buff's effect via castSRDSpell — add to character state
  function applyBuffToCharacter(buff: any, cc: any): any {
    const nc = { ...cc, buffs: [...(cc.buffs || [])] };
    // Remove existing buff with same name
    nc.buffs = nc.buffs.filter((b: any) => b.name !== buff.name);
    nc.buffs.push(buff);
    // Mage Armor — set flag for AC computation
    if (buff.name === "Mage Armor") nc.mageArmor = true;
    return nc;
  }

  /* -------- world map pre-generation -------- */
  function applyWorldMap(worldMap: any[], mp: any, pushEntry?: (t: string) => void): any {
    if (!Array.isArray(worldMap) || worldMap.length === 0) return mp;
    const m = mp ? { nodes: { ...mp.nodes }, edges: mp.edges.slice(), current: mp.current } : emptyMap();
    let added = 0;
    for (const loc of worldMap) {
      if (!loc.id || m.nodes[loc.id]) continue;
      let x = 0, y = 0;
      const fromId = loc.from && m.nodes[loc.from] ? loc.from : (m.current || null);
      if (fromId && m.nodes[fromId]) {
        const v = DIRV[loc.dir] || [1, 0];
        x = m.nodes[fromId].x + v[0];
        y = m.nodes[fromId].y + v[1];
        let guard = 0;
        while (Object.values(m.nodes).some((n: any) => n.x === x && n.y === y) && guard < 20) { x += 1; guard += 1; }
        m.edges.push([fromId, loc.id]);
      } else if (m.nodes[Object.keys(m.nodes)[0]]) {
        // Anchor to first node if no from specified
        const firstId = Object.keys(m.nodes)[0];
        const v = DIRV[loc.dir] || [1, 0];
        x = m.nodes[firstId].x + v[0];
        y = m.nodes[firstId].y + v[1];
        m.edges.push([firstId, loc.id]);
      }
      m.nodes[loc.id] = {
        name: loc.name || loc.id,
        type: MAP_ICON[loc.type] ? loc.type : "place",
        x, y,
        description: loc.description,
        visited: false, // player hasn't visited yet — fog of war
      };
      added += 1;
    }
    // If no current, set to first town or first node
    if (!m.current) {
      const townId = worldMap.find((l) => l.type === "town")?.id || Object.keys(m.nodes)[0];
      if (townId && m.nodes[townId]) {
        m.current = townId;
        m.nodes[townId].visited = true;
      }
    }
    if (pushEntry && added > 0) pushEntry(`🗺️ World map generated: ${added} locations laid out (${Object.values(m.nodes).filter((n:any)=>!n.visited).length} undiscovered)`);
    return m;
  }

  /* -------- Domain 36: Dungeon Blueprint application -------- */
  function applyDungeonBlueprint(blueprint: any, pushEntry?: (t: string) => void): DungeonBlueprint | null {
    if (!blueprint || !blueprint.id || !Array.isArray(blueprint.rooms)) return null;
    // Validate blueprint
    const validation = validateDungeonBlueprint(blueprint as DungeonBlueprint);
    if (!validation.isValid) {
      if (pushEntry) pushEntry(`⚠️ Dungeon blueprint ไม่ถูกต้อง: ${validation.errors.join("; ")}`);
      return null;
    }
    // Set blueprint as active dungeon
    const bp = blueprint as DungeonBlueprint;
    dungeonBlueprintRef.current = bp;
    setDungeonBlueprint(bp);
    // Create run state
    const runState = createDungeonRunState(bp);
    dungeonRunRef.current = runState;
    setDungeonRun(runState);

    if (pushEntry) {
      pushEntry(`🏰 เข้าสู่ดันเจี้ยน: ${bp.name} (${bp.rooms.length} ห้อง · แนะนำ Lv.${bp.recommendedLevel})`);
      if (bp.hook) pushEntry(`📜 ${bp.hook}`);
      if (validation.warnings.length > 0) pushEntry(`⚠️ DM hint: ${validation.warnings.join("; ")}`);
      if (validation.missingRoles.length > 0) pushEntry(`📐 5-Room: ขาด ${validation.missingRoles.join(", ")} (ยังเล่นได้แต่ไม่ครบ pattern)`);
    }
    // Auto-trigger entrance room staged encounter if any
    const entranceRoom = bp.rooms.find((r) => r.id === bp.entranceRoomId);
    if (entranceRoom?.stagedEncounter && entranceRoom.stagedEncounter.monsterIds.length > 0) {
      setPendingRoomEncounter({
        monsterIds: entranceRoom.stagedEncounter.monsterIds,
        surprise: !!entranceRoom.stagedEncounter.surprise,
        isBoss: !!entranceRoom.stagedEncounter.isBoss,
      });
    }
    return bp;
  }

  /** DM moves player to a room in current dungeon blueprint */
  function applyDungeonRoomMove(roomId: string, pushEntry?: (t: string) => void): { room: Room | null; isFirstVisit: boolean } {
    const bp = dungeonBlueprintRef.current;
    const run = dungeonRunRef.current;
    if (!bp || !run) return { room: null, isFirstVisit: false };
    const result = moveToRoom(run, bp, roomId);
    if (!result.room) {
      if (pushEntry) pushEntry(`⚠️ ไม่พบห้อง "${roomId}" ในดันเจี้ยน`);
      return { room: null, isFirstVisit: false };
    }
    dungeonRunRef.current = result.state;
    setDungeonRun(result.state);
    if (pushEntry && result.isFirstVisit) {
      pushEntry(`🚪 เข้าสู่${result.room.name} [${getRoomRoleLabel(result.room.role)}]`);
      if (result.room.atmosphere) pushEntry(`   🌫️ ${result.room.atmosphere}`);
      // If reached boss room for first time, warn
      if (bp.bossRoomId === roomId) {
        pushEntry(`💀 บอสลา! ถึงห้อง climax แล้ว`);
      }
    }
    // Auto-stage room contents on first visit
    if (result.isFirstVisit && result.room.stagedEncounter) {
      setPendingRoomEncounter({
        monsterIds: result.room.stagedEncounter.monsterIds,
        surprise: !!result.room.stagedEncounter.surprise,
        isBoss: !!result.room.stagedEncounter.isBoss,
      });
    }
    return { room: result.room, isFirstVisit: result.isFirstVisit };
  }

  /** Process DM command to enter a dungeon (sent via "dungeon_enter" field) */
  function applyDungeonEnter(spec: any, pushEntry?: (t: string) => void): DungeonBlueprint | null {
    if (!spec) return null;
    // If DM gave a full blueprint, use it
    if (spec.rooms && Array.isArray(spec.rooms) && spec.rooms.length > 0) {
      return applyDungeonBlueprint(spec, pushEntry);
    }
    // If DM gave just a theme/id, generate procedurally
    if (spec.theme && spec.id) {
      const gen = generateProceduralDungeon({
        theme: spec.theme,
        partyLevel: cRef.current?.level || 1,
        dungeonId: spec.id,
        dungeonName: spec.name || spec.id,
        entranceWorldMapId: mapRef.current?.current || "unknown",
        hook: spec.hook,
        antagonist: spec.antagonist,
      });
      return applyDungeonBlueprint(gen, pushEntry);
    }
    if (pushEntry) pushEntry(`⚠️ dungeon_enter ไม่สมบูรณ์ — ต้องมี rooms[] หรือ theme+id`);
    return null;
  }

  /** Exit current dungeon (back to world map) */
  function exitDungeon(pushEntry?: (t: string) => void) {
    if (pushEntry && dungeonBlueprintRef.current) {
      const summary = dungeonRunRef.current
        ? summarizeDungeonProgress(dungeonRunRef.current, dungeonBlueprintRef.current)
        : "";
      pushEntry(`🚪 ออกจากดันเจี้ยน ${dungeonBlueprintRef.current.name} — ${summary}`);
    }
    dungeonBlueprintRef.current = null;
    dungeonRunRef.current = null;
    setDungeonBlueprint(null);
    setDungeonRun(null);
  }

  /** Check current room's staged trap (returns trap info for DM/engine to resolve) */
  function getCurrentRoomStagedTrap(): Room["stagedTrap"] | null {
    const bp = dungeonBlueprintRef.current;
    const run = dungeonRunRef.current;
    if (!bp || !run) return null;
    const room = bp.rooms.find((r) => r.id === run.currentRoomId);
    return room?.stagedTrap || null;
  }

  /** Mark current room as cleared (called after combat/trap resolved) */
  function clearCurrentRoom(pushEntry?: (t: string) => void) {
    const bp = dungeonBlueprintRef.current;
    const run = dungeonRunRef.current;
    if (!bp || !run) return;
    const wasBossRoom = bp.bossRoomId === run.currentRoomId;
    const newRun = markRoomCleared(run, run.currentRoomId);
    if (wasBossRoom) {
      const bossDefeatedRun = markBossDefeated(newRun);
      dungeonRunRef.current = bossDefeatedRun;
      setDungeonRun(bossDefeatedRun);
      if (pushEntry) pushEntry(`🏆 กำจัดบอสแล้ว! ${summarizeDungeonProgress(bossDefeatedRun, bp)}`);
      // Phase 3: auto-complete active quests whose title/description references this dungeon
      // (the Quest type in gameData.ts is simplified — no objective-type tracking — so we
      // mark all objectives of relevant quests as done when boss is defeated)
      const dungeonNameLower = bp.name.toLowerCase();
      const dungeonIdLower = bp.id.toLowerCase();
      const updatedQuests = quests.map((q) => {
        if (q.status !== "active") return q;
        // Heuristic: if quest title or description mentions dungeon name/id, mark as complete
        const titleMatch = q.title.toLowerCase().includes(dungeonNameLower) || q.title.toLowerCase().includes(dungeonIdLower);
        const descMatch = q.description.toLowerCase().includes(dungeonNameLower) || q.description.toLowerCase().includes(dungeonIdLower);
        if (!titleMatch && !descMatch) return q;
        // Mark all objectives done + set status completed
        return {
          ...q,
          objectives: q.objectives.map((o) => ({ ...o, done: true })),
          status: "completed" as const,
        };
      });
      const newlyCompleted = updatedQuests.filter((q, i) => q.status === "completed" && quests[i].status !== "completed");
      if (newlyCompleted.length > 0) {
        setQuests(updatedQuests);
        if (pushEntry) {
          newlyCompleted.forEach((q) => pushEntry(`✅ เควสต์สำเร็จอัตโนมัติ: ${q.title}`));
        }
      }
    } else {
      dungeonRunRef.current = newRun;
      setDungeonRun(newRun);
      if (pushEntry) pushEntry(`✓ ${summarizeDungeonProgress(newRun, bp)}`);
    }
  }

  /** Apply all DM response fields related to dungeon (dungeon_enter/room_move/exit)
   *  Each sub-update is isolated in try/catch — a malformed dungeon payload must
   *  never throw and must never discard the rest of this response's updates. */
  function applyDungeonUpdates(res: any, entries: any[]): void {
    // 1. dungeon_enter — set or generate blueprint
    if (res.dungeon_enter) {
      try {
        // If already in a dungeon, exit first (DM gave us a new one)
        if (dungeonBlueprintRef.current) {
          exitDungeon((t) => entries.push(entrySystem(t)));
        }
        applyDungeonEnter(res.dungeon_enter, (t) => entries.push(entrySystem(t)));
      } catch (e: any) {
        console.warn("[applyDungeonUpdates] dungeon_enter skipped:", e);
        entries.push(entrySystem(`⚠️ dungeon_enter ไม่สมบูรณ์ — ข้าม`));
      }
    }
    // 2. dungeon_room_move — move to new room
    if (res.dungeon_room_move && res.dungeon_room_move.room_id) {
      try {
        if (!dungeonBlueprintRef.current) {
          entries.push(entrySystem(`⚠️ dungeon_room_move ใช้ไม่ได้ — ยังไม่ได้เข้าดันเจี้ยน`));
        } else {
          applyDungeonRoomMove(res.dungeon_room_move.room_id, (t) => entries.push(entrySystem(t)));
        }
      } catch (e: any) {
        console.warn("[applyDungeonUpdates] dungeon_room_move skipped:", e);
        entries.push(entrySystem(`⚠️ dungeon_room_move ล้มเหลว — ข้าม`));
      }
    }
    // 3. dungeon_exit — leave dungeon back to world map
    if (res.dungeon_exit === true || res.dungeon_exit === "true") {
      try {
        exitDungeon((t) => entries.push(entrySystem(t)));
      } catch (e: any) {
        console.warn("[applyDungeonUpdates] dungeon_exit skipped:", e);
        entries.push(entrySystem(`⚠️ dungeon_exit ล้มเหลว — ข้าม`));
      }
    }
  }

  /** After combat ends, mark current dungeon room cleared (called by combat end handlers) */
  function handleCombatEndDungeonUpdate(entries: any[], wasVictory: boolean): void {
    if (!dungeonBlueprintRef.current || !dungeonRunRef.current) return;
    if (wasVictory) {
      clearCurrentRoom((t) => entries.push(entrySystem(t)));
    }
  }

  function gainXP(cc: any, amount: number, entries: any[]) {
    let nc = { ...cc, xp: cc.xp + amount };
    entries.push(entrySystem(`+${amount} XP (รวม ${nc.xp})`));
    while (nc.level < 20 && nc.xp >= XP_THRESHOLDS[nc.level]) {
      const cls = CLASSES[nc.cls];
      const hpGain = Math.floor(cls.hitDie / 2) + 1 + mod(nc.abilities.con);
      nc = {
        ...nc, level: nc.level + 1,
        maxHp: nc.maxHp + hpGain, hp: nc.hp + hpGain,
        hitDiceLeft: Math.min(nc.level + 1, (nc.hitDiceLeft || 0) + 1),
      };
      if (cls.caster) {
        const newSlotsMax = getSlotTable(nc.cls, nc.level);
        // Preserve used slots — add new slots from level up
        const oldSlotsMax = nc.slotsMax || [];
        const newSlots = newSlotsMax.map((max: number, i: number) => {
          const oldMax = oldSlotsMax[i] || 0;
          const oldCur = nc.slots[i] || 0;
          // Gain the difference (new slots from level-up are filled)
          return Math.min(max, oldCur + (max - oldMax));
        });
        nc.slotsMax = newSlotsMax;
        nc.slots = newSlots;
      }
      // Replenish per-day resources
      nc.rageUsed = 0;
      nc.kiUsed = 0;
      nc.sorceryPoints = nc.level;
      nc.layOnHandsPool = nc.level * 5;
      nc.bardicInspirationUsed = 0;
      nc.ac = computeAC(nc);
      entries.push(entrySystem(`🎉 LEVEL UP! → Level ${nc.level} (Max HP +${hpGain}, Proficiency +${profByLevel(nc.level)})`));
      // Phase 2: use extended features (Lv.1-20) instead of FEATURES (Lv.1-5 only)
      const allFeatures = getExtendedFeatures()[nc.cls] || {};
      (allFeatures[nc.level] || []).forEach((f: any) => {
        entries.push(entrySystem(`✨ ปลดความสามารถใหม่: ${f.th} — ${f.desc}`));
        if (f.k === "asi") nc.pendingAsi = (nc.pendingAsi || 0) + 1;
        // D&D 5e/2024: Bard gets Expertise at Lv.3, Lv.10 (gains 2 Expertise picks each time)
        // Rogue gets Expertise at Lv.1, Lv.6 (gains 2 Expertise picks each time)
        // We track pending Expertise picks via `nc.pendingExpertise`
        if (f.k === "expertise") {
          nc.pendingExpertise = (nc.pendingExpertise || 0) + 2;
          entries.push(entrySystem(`🎯 Expertise unlock! เลือก 2 สกิลเพิ่ม proficiency ×2 — เปิดที่ character sheet → Skills tab`));
        }
      });
    }
    return nc;
  }

  /* -------- combat engine -------- */
  async function initCombat(monsterIds: string[], cc: any, entries: any[], surprise = false) {
    const ids = (monsterIds || []).slice(0, 6);
    const enemies: any[] = [];
    // Phase 0 fix: parallel fetch with Promise.all instead of sequential await
    // (was: sequential loop with await — slow when fetching 3+ monsters from Open5e)
    const fetchResults = await Promise.all(
      ids.map(async (id) => {
        let base = BESTIARY[id];
        if (!base && SRD_OK) {
          const srdMon = await fetchMonsterForCombat(id);
          if (srdMon) return { kind: "srd" as const, id, data: srdMon };
        }
        if (base) return { kind: "bestiary" as const, id, data: base };
        return { kind: "missing" as const, id, data: null };
      })
    );
    for (const r of fetchResults) {
      if (r.kind === "srd" && r.data) {
        r.data.uid = `${r.id}_${enemies.length}`;
        enemies.push(r.data);
      } else if (r.kind === "bestiary" && r.data) {
        enemies.push({ uid: `${r.id}_${enemies.length}`, id: r.id, ...r.data, hpNow: r.data.hp, conditions: [] });
      } else {
        entries.push(entrySystem(`⚠️ engine ไม่รู้จักมอนสเตอร์ "${r.id}" — ข้ามตัวนี้`));
      }
    }
    if (enemies.length === 0) return null;

    // Generate a tactical battle grid (12x10) with token positions
    const GRID_W = 12, GRID_H = 10;
    // Player starts at bottom-center
    const playerPos = { x: Math.floor(GRID_W / 2), y: GRID_H - 2 };
    // Enemies spread across the top half, spread out
    const enemyPositions: Record<string, { x: number; y: number }> = {};
    enemies.forEach((e, i) => {
      const spread = enemies.length > 1 ? i / (enemies.length - 1) : 0.5;
      enemyPositions[e.uid] = {
        x: Math.round(1 + spread * (GRID_W - 2)),
        y: 1 + (i % 3),
      };
    });

    // Roll initiative for everyone (player + each enemy)
    // D&D 2024 RAW: Initiative is ALWAYS rolled first
    // D&D 2024 Surprise: NOT a turn-skip — surprised creatures roll Initiative with Disadvantage.
    // Source: D&D Beyond Free Rules 2024 — "Initiative". They can act/move/react normally on round 1.
    const pInit = rollD20(mod(cc.abilities.dex)); // player ambusher: no disadvantage
    const enemyInits = enemies.map((e) => {
      // D&D 2024: surprised enemies roll Initiative with Disadvantage (roll 2d20, take lower)
      const roll1 = d(20) + e.init;
      const roll2 = d(20) + e.init;
      const finalInit = surprise ? Math.min(roll1, roll2) : roll1;
      return { uid: e.uid, th: e.th, init: finalInit, roll1, roll2 };
    });
    const eInitBest = Math.max(...enemyInits.map((e) => e.init));
    // Initiative is NOT a check vs DC — it's a roll to determine turn order
    // Do NOT show "vs DC" or "MISS/HIT" — just show the roll and who goes first
    entries.push({ id: nextId(), type: "roll", title: "Initiative", roll: pInit, extra: `ศัตรูทอยได้สูงสุด ${eInitBest} — ${pInit.total >= eInitBest ? "คุณได้เริ่มก่อน" : "ศัตรูเริ่มก่อน"}` });

    // Build initiative order (sorted by initiative, descending)
    const initOrder: { uid: string; name: string; init: number; isPlayer: boolean }[] = [
      { uid: "player", name: cc.name, init: pInit.total, isPlayer: true },
      ...enemyInits.map((e) => ({ uid: e.uid, name: e.th, init: e.init, isPlayer: false })),
    ].sort((a, b) => b.init - a.init);

    // D&D 2024 Surprise: enemies rolled Initiative with Disadvantage but still act normally
    const playerFirst = pInit.total >= eInitBest;
    entries.push(entrySystem(`⚔️ เข้าสู่การต่อสู้! ${enemies.map((e) => e.th).join(", ")} — ${playerFirst ? "คุณได้เริ่มก่อน" : "ศัตรูเริ่มก่อน"}`));
    if (surprise) {
      entries.push(entrySystem("🗡️ Surprise! (D&D 2024) ศัตรูทอย Initiative เสียเปรียบ — แต่ยังได้แอคชั่น/Move/Reaction ปกติในรอบแรก"));
      // Flag for UI display only — does NOT skip turn (D&D 2024)
      enemies.forEach((e) => { e.surprised = true; });
    }
    entries.push(entrySystem(`🗺️ สนามรบขนาด ${GRID_W}×${GRID_H} ช่อง — คุณอยู่ตำแหน่ง (${playerPos.x},${playerPos.y}) ศัตรูอยู่ทางตอนเหนือ`));
    // Encounter difficulty rating (uses both legacy rating + Domain 35 encounter engine)
    const totalXP = enemies.reduce((a, e) => a + (e.xp || 50), 0);
    const difficulty = rateEncounterDifficulty(totalXP, cc.level);
    // Domain 35: use encounter engine for precise difficulty + thresholds
    const encounterDifficulty = calculateDifficulty(totalXP, enemies.length, cc.level, 1);
    const thresholds = getDifficultyThresholds(cc.level);
    entries.push(entrySystem(`📊 ความยาก: ${difficulty} / ${encounterDifficulty} (XP รวม ${totalXP}, ${enemies.length} ศัตรู)`));
    entries.push(entrySystem(`   📈 Lv.${cc.level} thresholds (D&D 2024): trivial ${thresholds.trivial}/low ${thresholds.low}/moderate ${thresholds.moderate}/high ${thresholds.high}/impossible ${thresholds.impossible}`));
    // DM hint: suggest CR for future encounters (2024 tiers)
    const lowCRs = suggestedCR(cc.level, "low");
    if (lowCRs.length > 0) {
      entries.push(entrySystem(`   💡 CR แนะนำสำหรับ Lv.${cc.level} low: ${lowCRs.join(", ")}`));
    }

    const cb: any = {
      enemies, round: 1, playerFirst, dodge: false, surprise: !!surprise, bonusUsed: false, extraAction: false,
      grid: { w: GRID_W, h: GRID_H },
      playerPos,
      enemyPositions,
      initOrder,
      currentInitIdx: initOrder.findIndex((o) => o.isPlayer === playerFirst),
      movementLeft: cc.speed || 30, // D&D 5e: use character's speed (dwarf=25, monk=30+10, etc.)
      hasMoved: false,
    };
    return cb;
  }

  // D&D 5e grid distance: Chebyshev (8-directional, diagonal = 1 square)
  // Each square = 5 ft
  function gridDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }
  // Check if target is adjacent (within 1 square = melee range)
  function isAdjacent(posA: { x: number; y: number }, posB: { x: number; y: number }): boolean {
    return gridDistance(posA, posB) <= 1;
  }

  function enemyAttacks(cb: any, cc: any, entries: any[]) {
    let nc = { ...cc, buffs: [...(cc.buffs || [])] };
    // Recompute AC to include all current buffs (Haste, Shield of Faith, Shield reaction, Slow, etc.)
    nc.ac = computeAC(nc);
    let uncannyUsed = false;
    const enemyHasAdv = nc.conditions.some((k: string) => ENEMY_ADV_CONDS.includes(k));
    // E1: Sort enemies by initiative (descending) so they act in initiative order
    const aliveEnemies = cb.enemies.filter((e: any) => e.hpNow > 0);
    const sortedEnemies = [...cb.enemies].sort((a: any, b: any) => {
      const aInit = (cb.initOrder || []).find((o: any) => o.uid === a.uid)?.init || 0;
      const bInit = (cb.initOrder || []).find((o: any) => o.uid === b.uid)?.init || 0;
      return bInit - aInit; // descending
    });
    for (const e of sortedEnemies) {
      if (e.hpNow <= 0 || nc.hp <= 0) continue;
      // D&D 2024: Surprise no longer skips the enemy's first turn (just Disadvantage on Initiative)
      // The `surprised` flag is UI-only — enemies still act normally
      if (e.surprised) {
        e.surprised = false; // clear flag for UI display only — do NOT skip turn
      }
      // Skip if enemy is incapacitated (stunned/paralyzed/etc)
      if (e.conditions && e.conditions.some((c: string) => INCAPACITATING_CONDS.includes(c))) {
        entries.push(entrySystem(`😵 ${e.th} ไร้ความสามารถ — เสียเทิร์น`));
        continue;
      }
      // Phase 2: Charmed enemies can't attack the charmer (D&D 2024)
      // (simplified: charmed enemies skip attack entirely — can't target charmer)
      if (e.conditions && e.conditions.includes("charmed")) {
        entries.push(entrySystem(`💕 ${e.th} ถูกเสน่ห์ — ไม่สามารถโจมตีผู้เสกได้ (เสียเทิร์น)`));
        continue;
      }
      // Phase 2: Deafened enemies can't be surprised by sound + have disadvantage on Perception (already handled)
      // (no combat skip — deafened just affects Perception, not attacks directly)
      // Phase 2: Frightened enemies have disadvantage on ability checks + can't move closer to source (already in DISADV_CONDS)
      // === Domain 32: AI Planning Engine — Tactical AI ===
      // Build planning context for this enemy
      const ePos = cb.enemyPositions?.[e.uid];
      const distToPlayer = ePos && cb.playerPos ? gridDistance(ePos, cb.playerPos) : 1;
      const enemyHpPercent = (e.hpNow / (e.hp || e.hpNow || 1)) * 100;
      const planCtx: PlanningContext = {
        selfHpPercent: enemyHpPercent,
        selfPosition: ePos || { x: 0, y: 0 },
        selfHasRangedWeapon: !!(e.attacks && e.attacks.some((a: any) => a.range && a.range > 1)),
        selfAbilitiesAvailable: (e.specialAbilities || []).map((s: any) => s.name || "ability"),
        alliesAlive: aliveEnemies.filter((ae: any) => ae.uid !== e.uid).length,
        alliesWounded: aliveEnemies.filter((ae: any) => ae.uid !== e.uid && ae.hpNow < (ae.hp || ae.hpNow) * 0.5).length,
        enemiesVisible: 1, // just the player
        enemyHpPercents: [nc.hp / nc.maxHp],
        distanceToTarget: distToPlayer,
        targetIsCaster: !!(cc.knownSpells && cc.knownSpells.length > 0),
        targetIsFleeing: false,
        hasHealingPotion: false,
        hasReinforcementCall: !!(e.legendaryActions && e.legendaryActions.length > 0),
        environmentHazards: [],
        currentRound: cb.round || 1,
        worldSeconds: 0,
      };
      // Generate tactical plan for this enemy
      const enemyGoal: Goal = {
        id: `goal_${e.uid}`,
        type: "kill_player",
        description: `Defeat ${nc.name}`,
        priority: 8,
        targetId: "player",
        completed: false,
        failed: false,
      };
      const plan = generateFullPlan([enemyGoal], planCtx, 50);
      const selectedAction = plan?.selectedAction;
      const riskAssessment = plan?.risk;
      // Log the AI decision (for player visibility — shows enemy is "thinking")
      if (selectedAction) {
        entries.push(entrySystem(`🧠 ${e.th} AI: ${selectedAction.action} (utility ${selectedAction.expectedUtility}, risk ${selectedAction.riskScore})`));
      }
      // If high risk + low HP, enemy flees instead of attacking
      if (riskAssessment && (riskAssessment.threatLevel === "deadly" || riskAssessment.threatLevel === "lethal") && enemyHpPercent < 25) {
        entries.push(entrySystem(`🏃 ${e.th} ประเมินว่าอันตรายเกินไป (${riskAssessment.threatLevel}) — พยายามหนี!`));
        // Try to move away from player (opposite direction)
        if (cb.playerPos && ePos && cb.enemyPositions && !e.conditions?.includes("restrained")) {
          const dx = ePos.x - cb.playerPos.x;
          const dy = ePos.y - cb.playerPos.y;
          const newX = ePos.x + Math.sign(dx || 1);
          const newY = ePos.y + Math.sign(dy || 1);
          if (newX >= 0 && newX < (cb.grid?.w || 12) && newY >= 0 && newY < (cb.grid?.h || 10)) {
            const occupied = cb.enemies.some((other: any) => other.uid !== e.uid && other.hpNow > 0 && cb.enemyPositions[other.uid]?.x === newX && cb.enemyPositions[other.uid]?.y === newY);
            if (!occupied) {
              cb.enemyPositions[e.uid] = { x: newX, y: newY };
              entries.push(entrySystem(`   → ${e.th} ถอยไป (${newX},${newY})`));
            }
          }
        }
        continue; // skip attacking this turn
      }
      // Movement: use planning decision (move_closer vs hold vs retreat)
      if (cb.playerPos && cb.enemyPositions && cb.enemyPositions[e.uid]) {
        const ePos2 = cb.enemyPositions[e.uid];
        const dist = gridDistance(ePos2, cb.playerPos);
        if (dist > 1) {
          if (e.conditions && e.conditions.includes("restrained")) {
            // skip movement
          } else if (selectedAction && selectedAction.action === "retreat") {
            // Tactical retreat (handled above for high risk)
          } else if (selectedAction && selectedAction.action === "hold_position") {
            // Don't move — guard position
            entries.push(entrySystem(`🛡️ ${e.th} ยืนประจำการ — รอผู้เล่นเข้ามา`));
          } else {
            // Move toward player (default aggressive)
            // Phase 4: Slow mastery effect — enemy with speedReduced skips movement this turn
            if ((e.speedReduced || 0) > 0) {
              entries.push(entrySystem(`🐌 ${e.th} ช้าลง (Slow) — ไม่เคลื่อนที่เทิร์นนี้`));
              e.speedReduced = Math.max(0, (e.speedReduced || 0) - 10); // consume one stack
            } else {
            const dx = cb.playerPos.x - ePos2.x;
            const dy = cb.playerPos.y - ePos2.y;
            let newX = ePos2.x, newY = ePos2.y;
            if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
              newX = ePos2.x + Math.sign(dx);
            } else if (dy !== 0) {
              newY = ePos2.y + Math.sign(dy);
            }
            const occupied = cb.enemies.some((other: any) => other.uid !== e.uid && other.hpNow > 0 && cb.enemyPositions[other.uid]?.x === newX && cb.enemyPositions[other.uid]?.y === newY);
            if (!occupied && newX >= 0 && newX < (cb.grid?.w || 12) && newY >= 0 && newY < (cb.grid?.h || 10)) {
              // Phase 2: Trigger Ready Action if enemy moves adjacent to player
              const newDist = Math.max(Math.abs(newX - cb.playerPos.x), Math.abs(newY - cb.playerPos.y));
              if (cb.readyAction && newDist <= 1 && e.hpNow > 0) {
                entries.push(entrySystem(`⏰ Ready Action triggered! ${e.th} เข้าใกล้ — โจมตี Reaction`));
                // Trigger ready attack on this enemy
                cb.readyAction = null; // consume ready action
                // Perform a quick attack (simplified — uses player's melee weapon)
                const meleeWEntry = weaponByName(cc.weapon);
                const meleeW = meleeWEntry ? meleeWEntry[1] : null;
                if (meleeW) {
                  const atkMod = attackMod(cc, meleeW);
                  const atk = rollD20(atkMod, "advantage"); // ready attack has advantage (held action)
                  const hit2 = atk.die !== 1 && (atk.die === 20 || atk.total >= e.ac);
                  if (hit2) {
                    const dr = rollFormula(meleeW.dmg);
                    const dmg = dr.total + mod(cc.abilities[meleeW.abil]) + (meleeW.plus || 0);
                    e.hpNow = Math.max(0, e.hpNow - dmg);
                    entries.push({ id: nextId(), type: "roll", title: `⏰ Ready → ${e.th}`, roll: atk, vsAc: e.ac, success: true, extra: `${dmg} ${meleeW.dmg} → ${e.th} ${e.hpNow <= 0 ? "dead!" : `${e.hpNow} HP`}` });
                  } else {
                    entries.push({ id: nextId(), type: "roll", title: `⏰ Ready → ${e.th}`, roll: atk, vsAc: e.ac, success: false, extra: "miss" });
                  }
                }
              }
              cb.enemyPositions[e.uid] = { x: newX, y: newY };
            }
            } // end else (not slowed)
          }
        }
      }
      // === Range check: enemy can only attack if within reach ===
      // D&D 5e: melee enemies must be adjacent (dist ≤ 1, or dist ≤ 2 for reach weapons)
      // Ranged enemies must be within their range
      const currentDist = ePos && cb.playerPos ? gridDistance(ePos, cb.playerPos) : 1;
      const enemyHasRanged = !!(e.attacks && e.attacks.some((a: any) => a.range && a.range > 5));
      const enemyReach = e.reach || 5; // most monsters have 5 ft reach
      const enemyReachSquares = Math.floor(enemyReach / 5);
      // Check if player is invisible or hidden — enemy can't target what it can't see
      const playerInvisible = cb.invisible || nc.hiddenAdv;
      if (playerInvisible) {
        // D&D 5e: invisible targets can't be targeted directly
        // Enemy has disadvantage on attacks AND must guess the square
        // For solo play simplification: enemy can't attack invisible player unless adjacent
        if (currentDist > 1) {
          entries.push(entrySystem(`🙈 ${e.th} ไม่เห็นผู้เล่น (หายตัว/ซ่อน) — มองหาอยู่ (dist ${currentDist} squares)`));
          continue; // skip this enemy's turn
        }
        // If adjacent, enemy can try to attack with disadvantage (guessing square)
        entries.push(entrySystem(`🙈 ${e.th} โจมตีมืด ๆ (ผู้เล่นหายตัว) — เสียเปรียบ`));
      }
      // Range check: if too far, skip attack (already moved, but still too far)
      if (!enemyHasRanged && currentDist > enemyReachSquares) {
        entries.push(entrySystem(`📏 ${e.th} อยู่ไกลเกินไป (${currentDist} squares > reach ${enemyReachSquares}) — เคลื่อนที่มาแล้วแต่ยังไม่ถึง`));
        continue; // can't attack this turn
      }
      if (enemyHasRanged && currentDist > 1) {
        // Ranged enemy: check if player is within range
        const enemyRangeNormal = e.rangeNormal || 25;
        const enemyRangeLong = e.rangeLong || 100;
        const normalSquares = Math.floor(enemyRangeNormal / 5);
        const longSquares = Math.floor(enemyRangeLong / 5);
        if (currentDist > longSquares) {
          entries.push(entrySystem(`📏 ${e.th} อยู่ไกลเกินระยะยิง (${currentDist} squares > long range ${longSquares})`));
          continue;
        }
      }
      // Multi-attack: use Open5e structured attacks if available, otherwise legacy e.attacks[] / fallback
      // Open5e structured attacks come from `e.structuredAttacks[]` (NormalizedCreatureAttack[])
      // Legacy e.attacks[] come from BESTIARY {atk, dmg, name} format
      const structuredAtks = e.structuredAttacks as any[] | undefined;
      const numAttacks = structuredAtks && structuredAtks.length > 1
        ? Math.min(structuredAtks.length, 3)  // Multiattack: up to 3 attacks from Open5e
        : (e.attacks && e.attacks.length > 1 ? Math.min(2, e.attacks.length) : 1);
      for (let atkIdx = 0; atkIdx < numAttacks; atkIdx++) {
        if (nc.hp <= 0) break;
        // Pick attack data: prefer Open5e structured → legacy e.attacks[] → fallback to e.atk/e.dmg
        let atkData: any;
        if (structuredAtks && structuredAtks[atkIdx]) {
          // Open5e structured attack — convert to legacy shape
          const sa = structuredAtks[atkIdx];
          atkData = {
            name: sa.name || e.th + " attack",
            atk: sa.toHit,
            dmg: `${sa.damageDice || "1d6"}${sa.damageBonus ? `+${sa.damageBonus}` : ""}`,
            dmgType: sa.damageType,
            // Open5e provides reach/range — convert to legacy range format
            range: sa.reach ? Math.floor(sa.reach / 5) : (sa.range ? Math.floor(sa.range / 5) : 1),
          };
        } else if (e.attacks && e.attacks[atkIdx]) {
          atkData = e.attacks[atkIdx];
        } else {
          atkData = { atk: e.atk, dmg: e.dmg, name: "Attack" };
        }
        const defAdv = cb.dodge || cb.invisible || nc.hiddenAdv;
        let adv: "none" | "advantage" | "disadvantage" = "none";
        // Enemy gets advantage if player has weakness conditions
        if (enemyHasAdv && !defAdv) adv = "advantage";
        // Enemy has disadvantage from its own conditions (prone/restrained/blinded/poisoned/frightened)
        if (enemyHasAttackDisadv(e)) {
          adv = adv === "advantage" ? "none" : "disadvantage";
        }
        // Player invisible/hidden → enemy attacks with disadvantage
        if (playerInvisible) {
          adv = adv === "advantage" ? "none" : "disadvantage";
        }
        // D&D 5e RAW: Ranged attacks while target is adjacent have disadvantage
        const isEnemyRanged = atkData.range && atkData.range > 5;
        if (isEnemyRanged && currentDist <= 1) {
          adv = adv === "advantage" ? "none" : "disadvantage";
        }
        // D&D 5e RAW: Player prone → melee attacks against player have advantage, ranged have disadvantage
        if (nc.conditions.includes("prone")) {
          if (!isEnemyRanged) adv = adv === "disadvantage" ? "none" : "advantage";
          else adv = adv === "advantage" ? "none" : "disadvantage";
        }
        // Player defensive effects force disadvantage
        if (!enemyHasAdv && defAdv) adv = "disadvantage";

        // === D&D 2024: Exhaustion penalty applies to enemy attack rolls too ===
        let enemyAtkMod = atkData.atk;
        const enemyExhaustPenalty = exhaustionPenalty(e);
        if (enemyExhaustPenalty > 0) enemyAtkMod -= enemyExhaustPenalty;

        // Phase 4: Sap mastery effect — enemy with sap_effect has disadvantage on next attack
        if (e.conditions && e.conditions.includes("sap_effect")) {
          adv = adv === "advantage" ? "none" : "disadvantage";
          // Consume sap_effect (lasts until next attack)
          e.conditions = e.conditions.filter((c: string) => c !== "sap_effect");
        }

        const atk = rollD20(enemyAtkMod, adv);
        // D&D 5e RAW: nat 20 = critical hit, nat 1 = automatic miss
        const isEnemyCrit = atk.die === 20;
        const hit = atk.die !== 1 && (atk.die === 20 || atk.total >= nc.ac);
        let extra = "";
        if (hit) {
          let dmgR = rollFormula(atkData.dmg);
          let dmg = dmgR.total;
          // D&D 2024: Critical hit doubles ONLY weapon/attack damage dice (not bonus dice)
          if (isEnemyCrit) {
            const critDice = rollFormula(atkData.dmg.replace(/[+-]\d+$/, "") || atkData.dmg);
            dmg += critDice.rolls.reduce((a, b) => a + b, 0);
          }
          // Restrained enemy deals half damage on melee (simplified)
          if (e.conditions && e.conditions.includes("restrained")) {
            dmg = Math.floor(dmg / 2);
            extra += ` (ลดครึ่งจาก Restrained)`;
          }
          // === D&D 5e RAW: Apply player's damage resistance/immunity/vulnerability ===
          const enemyDmgType = (atkData.dmgType || "slashing").toLowerCase();
          // Rage grants resistance to bludgeoning/piercing/slashing (D&D 2024)
          // Build effective resistances = character's resistances + Rage's B/P/S if raging
          const isRaging = (nc.buffs || []).some((b: any) => b.name === "Rage");
          const rageResistances = isRaging ? ["bludgeoning", "piercing", "slashing"] : [];
          const effectiveResistances = Array.from(new Set([
            ...(nc.damageResistances || []),
            ...rageResistances,
          ]));
          const modifiedDmg = applyDamageModifiers(dmg, enemyDmgType, {
            resistances: effectiveResistances,
            vulnerabilities: nc.damageVulnerabilities,
            immunities: nc.damageImmunities,
          });
          if (modifiedDmg === 0 && dmg > 0) extra += ` · 🛡️ IMMUNE (${enemyDmgType})`;
          else if (modifiedDmg < dmg) extra += ` · 🛡️ RESIST (${enemyDmgType}) -${dmg - modifiedDmg}`;
          else if (modifiedDmg > dmg) extra += ` · 💥 VULNERABLE (${enemyDmgType}) +${modifiedDmg - dmg}`;
          dmg = modifiedDmg;

          extra = `${atkData.name}: ${atkData.dmg}${isEnemyCrit ? " (CRIT)" : ""} = ${dmg}${extra ? " ·" + extra : ""}`;
          // Breath weapons / special damage
          if (e.breath) {
            // D&D 2024: Exhaustion penalty applies to player's saving throws too
            let breathSaveMod = saveMod(nc, e.breath.save || "dex") - exhaustionPenalty(nc);
            const sv = rollD20(breathSaveMod);
            const breathDmg = rollFormula(e.breath.dmg);
            const finalBreath = sv.total >= e.breath.dc ? Math.floor(breathDmg.total / 2) : breathDmg.total;
            extra += ` · ${e.breath.type} breath ${e.breath.dmg} = ${finalBreath} (${e.breath.save?.toUpperCase()} save ${sv.total} vs DC ${e.breath.dc}${exhaustionPenalty(nc) > 0 ? ` -${exhaustionPenalty(nc)} exhaust` : ""})`;
            dmg += finalBreath;
          }
          if (e.poison) {
            // D&D 2024: Exhaustion penalty applies to saves
            let poisonSaveMod = saveMod(nc, "con") - exhaustionPenalty(nc);
            const sv = rollD20(poisonSaveMod);
            let psR = rollFormula(e.poison.dmg);
            let ptotal = psR.total;
            if (isEnemyCrit) ptotal += rollFormula(e.poison.dmg).rolls.reduce((a, b) => a + b, 0);
            const pdmg = sv.total >= e.poison.dc ? Math.floor(ptotal / 2) : ptotal;
            extra += ` · CON save ${sv.total} vs DC ${e.poison.dc} → poison +${pdmg}`;
            dmg += pdmg;
          }
          // Uncanny Dodge (Rogue Lv.5): halve first hit each round
          if (hasFeature(nc, "uncanny_dodge") && !uncannyUsed) {
            dmg = Math.floor(dmg / 2);
            uncannyUsed = true;
            extra += ` · 🌀 Uncanny Dodge halved → ${dmg}`;
          }
          nc.hp = Math.max(0, nc.hp - dmg);

          // Emit damage taken event (for features like relentless_endurance, uncanny_dodge already applied above)
          if (dmg > 0) emitDamageTaken("player", dmg, "slashing", e.uid);

          // Concentration check: if player has any concentration buff and took damage, must make CON save
          if (dmg > 0 && hasConcentration(nc)) {
            const concBuff = getActiveConcentrationBuff(nc);
            // D&D 2024: DC = max(10, damage/2), capped at 30
            const concDC = Math.min(30, Math.max(10, Math.floor(dmg / 2)));
            const concSave = rollD20(saveMod(nc, "con"));
            if (concSave.total < concDC) {
              // Lose concentration — remove buff
              nc.buffs = nc.buffs.filter((b: any) => b.name !== concBuff.name);
              if (concBuff.name === "Mage Armor") nc.mageArmor = false;
              if (concBuff.name === "Spirit Guardians") cb.spiritGuardians = false;
              entries.push(entrySystem(`💔 เสียสมาธิ! ${concBuff.name} สลายไป (CON save ${concSave.total} < DC ${concDC})`));
            } else {
              entries.push(entrySystem(`🛡️ รักษาสมาธิ ${concBuff.name} ไว้ได้ (CON save ${concSave.total} ≥ DC ${concDC})`));
            }
          }

          if (cb.spiritGuardians && dmg > 0 && nc.hp > 0) {
            const dc = Math.min(30, Math.max(10, Math.floor(dmg / 2)));
            const sv = rollD20(saveMod(nc, "con"));
            if (sv.total < dc) {
              cb.spiritGuardians = false;
              entries.push(entrySystem(`💫 เสียสมาธิ! (CON save ${sv.total} vs DC ${dc}) Spirit Guardians สลายไป`));
            }
          }
        }
        entries.push({ id: nextId(), type: "roll", title: `${e.th} ${atkData.name}`, roll: atk, vsAc: nc.ac, success: hit, extra: hit ? extra + ` → your HP ${nc.hp}` : null });
        if (nc.hp <= 0) {
          entries.push(entrySystem(`💀 ${nc.name} ล้มลงหมดสติ! ต้องทอย Death Saving Throw`));
          break;
        }
      }
      if (nc.hp <= 0) break;
    }
    return nc;
  }

  function checkCombatEnd(cb: any, cc: any, entries: any[]) {
    const alive = cb.enemies.filter((e: any) => e.hpNow > 0);
    if (alive.length === 0) {
      const totalXP = cb.enemies.reduce((a: number, e: any) => a + (e.xp || 50), 0);
      const numEnemies = cb.enemies.length;
      entries.push(entrySystem(`🏆 ชนะ! กำจัดศัตรูทั้งหมดแล้ว`));
      const nc = gainXP(cc, totalXP, entries);
      // Phase 1 fix: auto-generate loot from reward tables (instead of relying on LLM freeform)
      // D&D 2024: calculate difficulty from XP + party level, then roll reward items
      const difficulty = calculateDifficulty(totalXP, numEnemies, nc.level, 1);
      const reward = calculateReward(difficulty, totalXP, nc.level);
      const rolledItems = rollRewardItems(reward);
      if (reward.gold > 0) {
        nc.gold = (nc.gold || 0) + reward.gold;
        entries.push(entrySystem(`💰 +${reward.gold} gp (loot จาก combat — ${difficulty})`));
      }
      if (rolledItems.length > 0) {
        rolledItems.forEach((item: string) => {
          nc.inventory.push(item);
          entries.push(entrySystem(`📦 ได้รับ: ${item} (loot จาก combat)`));
        });
      }
      // Domain 36: mark current dungeon room cleared (and boss defeated if applicable)
      handleCombatEndDungeonUpdate(entries, true);
      return { ended: true, cc: nc };
    }
    return { ended: false, cc };
  }

  /** Phase 1 fix: build pacing object for buildSystemPrompt from narrativeEngine state */
  function getPacingForPrompt(): any {
    if (!narrativeEngine) return null;
    const p = narrativeEngine.pacing;
    return {
      currentTension: p.currentTension,
      recommendedNextTension: p.recommendedNextTension,
      scenesSinceRest: p.scenesSinceRest,
      scenesSinceCombat: p.scenesSinceCombat,
      scenesSinceRevelation: p.scenesSinceRevelation,
      pacingNotes: p.pacingNotes,
      arcPhase: narrativeEngine.arc.currentPhase,
    };
  }

  async function narrateCombatEvent(summary: string, cc: any, sc: string, baseLog: any[], hist: any[]) {
    setThinking(true);
    try {
      // Include scene anchor + story context for combat narration too
      const sceneAnchor = `[CURRENT SCENE: ${sc || "?"} — ผู้เล่นอยู่ที่นี่ ห้ามเปลี่ยนสถานที่]\n`;
      const newHist = [...hist, { role: "user", content: `${sceneAnchor}${summary}` }];
      const res = await callDM(buildSystemPrompt(cc, getPacingForPrompt()), newHist);
      const entries = [entryNarration(res.narration)];
      logValidationWarnings(res, entries);
      let nc = applyUpdates(res.updates, cc, entries);
      let nsc = res.scene || sc;
      let ncb = null;
      let nmp = applyWorldMap(res.world_map, mapRef.current, (t) => entries.push(entrySystem(t)));
      nmp = applyMapUpdate(res.map_update, nmp, (t) => entries.push(entrySystem(t)));
      // Domain 36: apply dungeon updates (enter/room_move/exit)
      applyDungeonUpdates(res, entries);
      // Auto-trigger staged encounter if pending (from new room entry)
      if (pendingRoomEncounter && !res.start_combat) {
        ncb = await initCombat(pendingRoomEncounter.monsterIds, nc, entries, pendingRoomEncounter.surprise);
        if (pendingRoomEncounter.isBoss) {
          entries.push(entrySystem(`💀 บอสแอคชั่น! (ใช้ lair actions ถ้ามี)`));
        }
        setPendingRoomEncounter(null);
      }
      if (nmp && nmp.current && nmp.nodes[nmp.current]) nmp.nodes[nmp.current].visited = true;
      mapRef.current = nmp;
      if (res.start_combat && res.start_combat.monsters) {
        ncb = await initCombat(res.start_combat.monsters, nc, entries, res.start_combat.surprise);
      }
      const finalHist = [...newHist, { role: "assistant", content: JSON.stringify(res) }];
      const finalLog = [...baseLog, ...entries];
      cRef.current = nc; combatRef.current = ncb; logDataRef.current = finalLog;
      setC(nc); setScene(nsc); setLog(finalLog); setCombat(ncb); setHistory(finalHist); setMap(nmp);
      persist(nc, nsc, finalLog, ncb, finalHist);
      if (nc.dead) setPhase("dead");
    } catch (e: any) {
      const finalLog = [...baseLog, entrySystem("⚠️ DM ขัดข้อง: " + e.message + " (ลองพิมพ์ต่อได้)")];
      setLog(finalLog);
    } finally { setThinking(false); }
  }

  function commitCombat(cc2: any, cb2: any, log2: any[]) {
    cRef.current = cc2; combatRef.current = cb2; logDataRef.current = log2;
    setC(cc2); setCombat(cb2); setLog(log2);
  }

  /* -------- generic SRD spell caster (combat) -------- */
  async function castSRDSpell(spellIndex: string, slotLevel: number, cc: any, cb: any, entries: any[]): Promise<{ cc: any; cb: any; endsTurn: boolean }> {
    const sp: NormalizedSpell | null = await fetchSpell(spellIndex, slotLevel, cc.level);
    if (!sp) {
      entries.push(entrySystem(`⚠️ โหลดเวท "${spellIndex}" จาก SRD ไม่ได้`));
      return { cc, cb, endsTurn: true };
    }
    entries.push(entrySystem(`✨ กำลังร่าย ${sp.name} (Lv.${sp.level} ${sp.school})${slotLevel > sp.level ? ` อัปเคสต์เป็น slot ${slotLevel}` : ""}`));

    // Emit cast spell event (for features/items that trigger on spell cast)
    emitCastSpell("player", spellIndex, sp.level, cb.enemies.filter((e: any) => e.hpNow > 0).map((e: any) => e.uid));

    // Deduct slot (cantrips are free)
    let nc = { ...cc, conditions: [...cc.conditions] };
    let ncb = { ...cb, enemies: cb.enemies.map((e: any) => ({ ...e })) };
    if (sp.level > 0) {
      nc.slots = nc.slots.map((v: number, i: number) => (i === slotLevel - 1 ? v - 1 : v));
    }

    let endsTurn = true;
    if (sp.bonusAction) endsTurn = false;

    if (sp.kind === "heal") {
      const h = rollFormula(sp.heal || "1d8");
      const healAmount = h.total + mod(nc.abilities[CLASSES[nc.cls].castAbil]);
      const oldHp = nc.hp;
      nc.hp = Math.min(nc.maxHp, nc.hp + healAmount);
      // Emit heal event
      emitHeal("player", "player", healAmount);
      // Reset death saves on any healing (D&D 5e rule)
      if (oldHp <= 0 && nc.hp > 0) {
        nc.deathSaves = { s: 0, f: 0 };
        entries.push(entrySystem(`✨ ${sp.name}: ฟื้น ${healAmount} HP → ${nc.hp}/${nc.maxHp} · Death saves reset`));
      } else {
        entries.push(entrySystem(`✨ ${sp.name}: ฟื้น ${healAmount} HP → ${nc.hp}/${nc.maxHp}`));
      }
    } else if (sp.kind === "attack") {
      const alive = ncb.enemies.filter((e: any) => e.hpNow > 0);
      // AoE targeting: use actual distance from player
      let targets: any[] = [];
      if (sp.aoeType && sp.aoeSize) {
        const aoeRadiusSquares = Math.ceil(sp.aoeSize / 5);
        // Player is the origin; include enemies within aoeRadiusSquares
        targets = alive.filter((e: any) => {
          const ePos = ncb.enemyPositions?.[e.uid];
          if (!ePos || !ncb.playerPos) return true; // fallback if no positions
          const dist = gridDistance(ncb.playerPos, ePos);
          return dist <= aoeRadiusSquares;
        });
        if (targets.length === 0) targets = alive.slice(0, 1); // fallback: hit nearest
        entries.push(entrySystem(`🌐 AoE ${sp.aoeType} ${sp.aoeSize}ft กระทบ ${targets.length} เป้าหมาย`));
      } else {
        targets = alive.slice(0, 1);
      }
      for (const t of targets) {
        let adv: "none" | "advantage" | "disadvantage" = t.glow || ncb.surprise || ncb.invisible || attackerHasAdvVs(t) ? "advantage" : "none";
        if (hasDisadv(nc)) adv = adv === "advantage" ? "none" : "disadvantage";
        let atkModTotal = spellAtkMod(nc);
        // Bless applies to spell attacks too
        if ((nc.buffs || []).some((b: any) => b.name === "Bless")) {
          atkModTotal += d(4);
        }
        const atk = rollD20(atkModTotal, adv);
        if (t.glow) t.glow = false;
        const hit = atk.die !== 1 && (atk.die === 20 || atk.total >= t.ac);
        let extra: string | null = null;
        if (hit) {
          const dr = rollFormula(sp.damage || "1d6");
          let dmg = dr.total;
          if (atk.die === 20) dmg += rollFormula(sp.damage || "1d6").total;
          // Hunter's Mark / Hex apply to spell attacks too
          if ((nc.buffs || []).some((b: any) => b.name === "Hunter's Mark")) dmg += rollFormula("1d6").total;
          if ((nc.buffs || []).some((b: any) => b.name === "Hex")) dmg += rollFormula("1d6").total;
          // === NEW: apply spell damage type resistance/immunity/vulnerability ===
          const sDmgType = (sp.damageType || "force").toLowerCase();
          const resistedDmg = applyDamageModifiers(dmg, sDmgType, {
            resistances: t.damageResistances,
            vulnerabilities: t.damageVulnerabilities,
            immunities: t.damageImmunities,
          });
          const resistTag =
            resistedDmg === 0 && dmg > 0 ? ` 🛡️IMMUNE`
            : resistedDmg < dmg ? ` 🛡️resist -${dmg - resistedDmg}`
            : resistedDmg > dmg ? ` 💥vuln +${resistedDmg - dmg}`
            : "";
          dmg = resistedDmg;
          t.hpNow = Math.max(0, t.hpNow - dmg);
          extra = `${sp.damageType || "force"} ${dmg}${resistTag} → ${t.th} ${t.hpNow <= 0 ? "dead!" : `${t.hpNow} HP left`}`;
          if (sp.conditionsAdd && sp.conditionsAdd.length > 0) {
            for (const cond of sp.conditionsAdd) {
              if (!t.conditions) t.conditions = [];
              if (!t.conditions.includes(cond)) t.conditions.push(cond);
              extra += ` · ${cond}`;
            }
          }
        }
        entries.push({ id: nextId(), type: "roll", title: `${sp.name} → ${t.th}`, roll: atk, vsAc: t.ac, success: hit, extra });
      }
    } else if (sp.kind === "save") {
      const dc = spellDC(nc);
      const alive = ncb.enemies.filter((e: any) => e.hpNow > 0);
      // AoE targeting: use actual distance from player
      let targets: any[] = [];
      if (sp.aoeType && sp.aoeSize) {
        const aoeRadiusSquares = Math.ceil(sp.aoeSize / 5);
        targets = alive.filter((e: any) => {
          const ePos = ncb.enemyPositions?.[e.uid];
          if (!ePos || !ncb.playerPos) return true;
          const dist = gridDistance(ncb.playerPos, ePos);
          return dist <= aoeRadiusSquares;
        });
        if (targets.length === 0) targets = alive.slice(0, 1);
        entries.push(entrySystem(`🌐 AoE ${sp.aoeType} ${sp.aoeSize}ft กระทบ ${targets.length} เป้าหมาย (DC ${dc})`));
      } else {
        targets = alive.slice(0, 1);
      }
      // AoE damage rolled once
      const aoeRoll = sp.damage ? rollFormula(sp.damage) : null;
      for (const t of targets) {
        const saveAbil = sp.saveAbility || "dex";
        // Restrained enemies have disadvantage on DEX saves
        let saveAdv: "none" | "disadvantage" = "none";
        if (saveAbil === "dex" && t.conditions && t.conditions.includes("restrained")) saveAdv = "disadvantage";
        const sv = rollD20(monSave(t, saveAbil), saveAdv);
        const failed = sv.total < dc;
        let dmg = failed ? (aoeRoll?.total || 0) : sp.saveSuccess === "half" ? Math.floor((aoeRoll?.total || 0) / 2) : 0;
        // === NEW: apply spell damage type resistance/immunity/vulnerability ===
        // For half-damage-on-save, the resistance stacks (i.e. half then half again = quarter).
        const sDmgType = (sp.damageType || "").toLowerCase();
        if (sDmgType && dmg > 0) {
          dmg = applyDamageModifiers(dmg, sDmgType, {
            resistances: t.damageResistances,
            vulnerabilities: t.damageVulnerabilities,
            immunities: t.damageImmunities,
          });
        }
        t.hpNow = Math.max(0, t.hpNow - dmg);
        let extra = `${dmg} ${sp.damageType || ""} → ${t.th} ${t.hpNow <= 0 ? "dead!" : `${t.hpNow} HP left`}`;
        if (sp.conditionsAdd && sp.conditionsAdd.length > 0 && failed) {
          for (const cond of sp.conditionsAdd) {
            if (!t.conditions) t.conditions = [];
            if (!t.conditions.includes(cond)) t.conditions.push(cond);
            extra += ` · ${cond}`;
          }
        }
        entries.push({ id: nextId(), type: "roll", title: `${sp.name} → ${t.th} (${saveAbil.toUpperCase()} save DC ${dc})`, roll: sv, dc, success: failed, extra });
      }
    } else if (sp.kind === "auto") {
      // Auto-hit spell (Magic Missile style). Data-driven via sp.darts field if present.
      const alive = ncb.enemies.filter((e: any) => e.hpNow > 0);
      // Detect magic-missile pattern: index === "magic-missile" OR sp.darts > 0 OR sp.damage === "1d4+1"
      const dartsCount = sp.index === "magic-missile"
        ? 3 + (slotLevel - 1)
        : (sp as any).darts ? (sp as any).darts : 1;
      const dartDamage = sp.index === "magic-missile" ? "1d4+1" : (sp.damage || "1d6");
      if (dartsCount > 1 || sp.index === "magic-missile") {
        const parts: string[] = [];
        // Magic Missile is force damage per SRD; for other auto-hit spells, fall back to sp.damageType.
        const sDmgType = (sp.index === "magic-missile" ? "force" : (sp.damageType || "force")).toLowerCase();
        for (let dart = 0; dart < dartsCount; dart++) {
          const tgt = ncb.enemies.find((e: any) => e.hpNow > 0);
          if (!tgt) break;
          const dr = rollFormula(dartDamage);
          // === NEW: apply resistance/immunity/vulnerability to each dart ===
          const dartDmg = applyDamageModifiers(dr.total, sDmgType, {
            resistances: tgt.damageResistances,
            vulnerabilities: tgt.damageVulnerabilities,
            immunities: tgt.damageImmunities,
          });
          tgt.hpNow = Math.max(0, tgt.hpNow - dartDmg);
          parts.push(`dart ${dart + 1}: ${dartDmg}${dartDmg < dr.total ? " (resist)" : dartDmg === 0 && dr.total > 0 ? " (immune)" : dartDmg > dr.total ? " (vuln)" : ""} → ${tgt.th}${tgt.hpNow <= 0 ? " dead!" : ""}`);
        }
        entries.push(entrySystem(`✨ ${sp.name}: โดนอัตโนมัติ · ${parts.join(" · ")}`));
      } else {
        // Generic auto-hit
        const dr = rollFormula(sp.damage || "1d6");
        const tgt = alive[0];
        if (tgt) {
          // === NEW: apply resistance/immunity/vulnerability ===
          const sDmgType = (sp.damageType || "force").toLowerCase();
          const dmg = applyDamageModifiers(dr.total, sDmgType, {
            resistances: tgt.damageResistances,
            vulnerabilities: tgt.damageVulnerabilities,
            immunities: tgt.damageImmunities,
          });
          tgt.hpNow = Math.max(0, tgt.hpNow - dmg);
          entries.push({ id: nextId(), type: "roll", title: `${sp.name} → ${tgt.th}`, roll: { die: 0, other: null, mod: 0, total: 0, adv: "none" }, success: true, extra: `Auto-hit: ${dmg} ${sp.damageType || "force"} → ${tgt.th} ${tgt.hpNow <= 0 ? "dead!" : `${tgt.hpNow} HP left`}` });
        }
      }
    } else if (sp.kind === "buff") {
      // Concentration buff. Apply via buff system so it gets tracked + ticked.
      // Spell-name → buff metadata mapping (data-driven approach)
      const buffMap: Record<string, { duration: number; effectDesc: string; concentration?: boolean }> = {
        "shield":           { duration: 1,  effectDesc: "+5 AC (reaction, 1 รอบ)" },
        "mage-armor":       { duration: -1, effectDesc: "AC 13 + DEX (8 ชม.)" },
        "spirit-guardians": { duration: 10, effectDesc: "ศัตรูโดน 3d8/รอบ (WIS save ลดครึ่ง)", concentration: true },
        "spiritual-weapon": { duration: 10, effectDesc: "โจมตีเอง 1d8+WIS/รอบ" },
        "bless":            { duration: 10, effectDesc: "+1d4 โจมตี/save", concentration: true },
        "haste":            { duration: 10, effectDesc: "+2 AC, ได้เปรียบ DEX, ความเร็ว x2, +1 action/รอบ", concentration: true },
        "shield-of-faith":  { duration: 10, effectDesc: "+2 AC", concentration: true },
        "bane":             { duration: 10, effectDesc: "-1d4 โจมตี/save (ศัตรู)", concentration: true },
        "hunter-s-mark":    { duration: 60, effectDesc: "+1d6 ดาเมจต่อการโจมตี", concentration: true },
        "hex":              { duration: 60, effectDesc: "+1d6 ดาเมจ + disadv ability", concentration: true },
        "faerie-fire":      { duration: 10, effectDesc: "adv โจมตีใส่เป้า (glow)", concentration: true },
        "slow":             { duration: 10, effectDesc: "ครึ่งความเร็ว, -2 AC, -2 save", concentration: true },
      };
      const buffMeta = buffMap[sp.index] || { duration: 10, effectDesc: sp.desc.slice(0, 80) };
      const buffName = sp.name.replace(/\b\w/g, (c: string) => c.toUpperCase());
      // Apply buff via applyBuffToCharacter
      nc = applyBuffToCharacter({ name: buffName, type: "buff", duration: buffMeta.duration, source: "spell", effect_desc: buffMeta.effectDesc }, nc);
      // Special flags
      if (sp.index === "mage-armor") { nc.mageArmor = true; nc.ac = computeAC(nc); }
      if (sp.index === "spirit-guardians") ncb.spiritGuardians = true;
      if (sp.index === "spiritual-weapon") { ncb.spiritualWeapon = true; ncb.swRounds = 10; if (!ncb.bonusUsed) { ncb.bonusUsed = true; endsTurn = false; } }
      if (sp.index === "shield") { ncb.shieldAC = 5; endsTurn = false; }
      if (sp.index === "faerie-fire") {
        // Mark all visible enemies as glowing
        ncb.enemies.forEach((e: any) => { if (e.hpNow > 0) e.glow = true; });
      }
      if (sp.index === "haste") {
        ncb.haste = true;
        // Haste gives +1 action — already tracked via buff
      }
      entries.push(entrySystem(`✨ ${sp.name}: ${buffMeta.effectDesc}${buffMeta.concentration ? " (concentration)" : ""}`));
      // Apply conditionsAdd (Hold Person, etc.)
      if (sp.conditionsAdd && sp.conditionsAdd.length > 0) {
        const alive = ncb.enemies.filter((e: any) => e.hpNow > 0);
        for (const cond of sp.conditionsAdd) {
          // Single-target conditions apply to first enemy; AoE to all in range
          const targets = sp.aoeType ? alive : alive.slice(0, 1);
          for (const t of targets) {
            if (!t.conditions) t.conditions = [];
            if (!t.conditions.includes(cond)) {
              t.conditions.push(cond);
              entries.push(entrySystem(`   → ${t.th} ติดสภาวะ ${cond}`));
            }
          }
        }
      }
    } else {
      // utility — narrate effect
      entries.push(entrySystem(`✨ ${sp.name}: ${sp.desc.slice(0, 150)}${sp.desc.length > 150 ? "..." : ""}`));
    }

    // End invisibility if attacking
    if (sp.kind === "attack" || sp.kind === "save" || sp.kind === "auto") {
      if (ncb.invisible) { ncb.invisible = false; entries.push(entrySystem("🫥 You become visible again (casting ends invisibility)")); }
      nc.hiddenAdv = false;
    }

    return { cc: nc, cb: ncb, endsTurn };
  }

  function playerCombatAction(kind: string, payload?: any) {
    const combat0 = combatRef.current;
    const c0 = cRef.current;
    const log0 = logDataRef.current;
    if (!combat0 || thinking) return;
    let cc = { ...c0 };
    let cb = { ...combat0, enemies: combat0.enemies.map((e: any) => ({ ...e })) };
    const entries: any[] = [];

    // --- unconscious: death save loop ---
    if (cc.hp <= 0 && !cc.dead) {
      const r = rollD20(0);
      let ds = { ...cc.deathSaves };
      if (r.die === 20) { cc.hp = 1; ds = { s: 0, f: 0 }; entries.push({ id: nextId(), type: "roll", title: "Death Save", roll: r, success: true, extra: "Nat 20! Revived with 1 HP" }); }
      else if (r.total >= 10) { ds.s += 1; entries.push({ id: nextId(), type: "roll", title: "Death Save", roll: r, dc: 10, success: true, extra: `Success ${ds.s}/3` }); }
      else { ds.f += r.die === 1 ? 2 : 1; entries.push({ id: nextId(), type: "roll", title: "Death Save", roll: r, dc: 10, success: false, extra: `Failure ${ds.f}/3` }); }
      cc.deathSaves = ds;
      if (ds.f >= 3) {
        cc.dead = true;
        entries.push(entrySystem(`☠️ ${cc.name} เสียชีวิต...`));
        const finalLog = [...log0, ...entries];
        commitCombat(cc, null, finalLog); persist(cc, scene, finalLog, null, history);
        setPhase("dead");
        return;
      }
      if (ds.s >= 3 || cc.hp > 0) {
        if (cc.hp <= 0) { entries.push(entrySystem("อาการคงที่ — ศัตรูทิ้งคุณไว้และจากไป")); }
        cc.deathSaves = { s: 0, f: 0 };
        if (cc.hp <= 0) cc.hp = 1;
        // Clear combat state completely — player is revived, combat ends
        cb = null as any;
        const finalLog = [...log0, ...entries];
        commitCombat(cc, null, finalLog); persist(cc, scene, finalLog, null, history);
        narrateCombatEvent(`[จบ combat] ${cc.name} หมดสติแต่รอดชีวิต (stable, 1 HP). ศัตรูจากไปแล้ว. บรรยายฉากที่ฟื้นขึ้นมา`, cc, scene, finalLog, history);
        return;
      }
      // Still unconscious — enemies attack, then advance round
      cb.round += 1;
      // Clear hiddenAdv/invisible when downed
      cb.invisible = false;
      cc.hiddenAdv = false;
      const finalLog = [...log0, ...entries];
      commitCombat(cc, cb, finalLog); persist(cc, scene, finalLog, cb, history);
      return;
    }

    // If incapacitated (stunned/paralyzed/etc), skip turn
    if (isIncapacitated(cc)) {
      entries.push(entrySystem(`😵 ${cc.name} ไร้ความสามารถ (${cc.conditions.filter((c:string)=>INCAPACITATING_CONDS.includes(c)).join(", ")}) — เสียเทิร์น`));
      // Remove one round of stun conditions that auto-end (simplified)
      // Then enemies act
      cb.dodge = false;
      cc.conditions = [...cc.conditions];
      const proneIdx = cc.conditions.indexOf("prone");
      if (proneIdx >= 0) { cc.conditions.splice(proneIdx, 1); entries.push(entrySystem("🧍 Stood up — no longer Prone")); }
      // enemies act
      cc = enemyAttacks(cb, cc, entries);
      cb.round += 1;
      cb.bonusUsed = false; cb.extraAction = false;
      const finalLog = [...log0, ...entries];
      commitCombat(cc, cb, finalLog);
      persist(cc, scene, finalLog, cb, history);
      return;
    }

    cb.dodge = false;
    cc.conditions = [...cc.conditions];
    const proneIdx = cc.conditions.indexOf("prone");
    if (proneIdx >= 0) {
      cc.conditions.splice(proneIdx, 1);
      entries.push(entrySystem("🧍 Stood up (half movement used) — no longer Prone"));
    }
    let fled = false;
    let endsTurn = true;

    const doWeaponAttack = (w: any, label: string) => {
      const target = cb.enemies.find((e: any) => e.uid === payload && e.hpNow > 0) || cb.enemies.find((e: any) => e.hpNow > 0);
      if (!target || !w) return;
      // === D&D 2024 Range Rules ===
      // 1 grid square = 5 ft
      // Melee: reach 5 ft = 1 square, reach 10 ft = 2 squares (Glaive/Halberd/Pike/Lance/Whip)
      // Ranged: rangeNormal/rangeLong in feet → convert to squares (/5)
      //   Within rangeNormal: normal attack
      //   Beyond rangeNormal but within rangeLong: disadvantage
      //   Beyond rangeLong: can't attack
      const targetPos = cb.enemyPositions?.[target.uid] || { x: 0, y: 0 };
      const dist = cb.playerPos ? gridDistance(cb.playerPos, targetPos) : 1;
      const distFeet = dist * 5;
      const isRanged = w.ranged === true;
      // Reach weapons (Glaive, Halberd, Pike, Lance, Whip) have reach 10 ft = 2 squares
      const reachFeet = w.reach || 5;
      const reachSquares = Math.floor(reachFeet / 5);
      if (!isRanged) {
        // Melee weapon
        if (dist > reachSquares) {
          entries.push(entrySystem(`⚠️ เป้าหมาย ${target.th} อยู่ไกลเกินไป (${dist} ช่อง = ${distFeet} ฟุต) — อาวุธระยะประชิด (reach ${reachFeet} ฟุต = ${reachSquares} ช่อง) ต้องเข้าใกล้ก่อน`));
          return;
        }
      } else {
        // Ranged weapon — check normal/long range
        const normalRange = w.rangeNormal || 25;  // default short range
        const longRange = w.rangeLong || 100;     // default long range
        const normalSquares = Math.floor(normalRange / 5);
        const longSquares = Math.floor(longRange / 5);
        if (dist > longSquares) {
          entries.push(entrySystem(`⚠️ เป้าหมาย ${target.th} อยู่ไกลเกินระยะโจมตี (${dist} ช่อง = ${distFeet} ฟุต > long range ${longRange} ฟุต) — ยิงไม่ถึง`));
          return;
        }
        if (dist > normalSquares) {
          entries.push(entrySystem(`📍 ยิงในระยะไกล (${distFeet} ฟุต > normal ${normalRange} ฟุต) — เสียเปรียบ`));
        }
      }
      // Ranged attacks at long range have disadvantage
      let rangedDisadv = false;
      if (isRanged) {
        const normalRange = w.rangeNormal || 25;
        const normalSquares = Math.floor(normalRange / 5);
        if (dist > normalSquares) rangedDisadv = true;
      }
      // Ranged attacks while enemy is adjacent (within 5 ft) have disadvantage (D&D 5e RAW)
      let meleeAdjacentDisadv = isRanged && dist <= 1;
      // Ranged attacks against prone target have disadvantage (melee has advantage vs prone)
      let proneRangedDisadv = isRanged && target.conditions && target.conditions.includes("prone");
      // === D&D 2024 Cover System ===
      // Calculate cover for the target based on other enemies blocking line of sight
      // (simplified: if any other alive enemy is adjacent to target AND closer to player → half cover +2 AC)
      // Total cover (can't target) is rare — we skip it for now
      let targetCoverAC = 0;
      let targetCoverLabel = "";
      if (cb.playerPos && cb.enemyPositions?.[target.uid]) {
        const targetPos = cb.enemyPositions[target.uid];
        // Check if any other enemy provides cover to the target
        // (an enemy between player and target that is closer to player)
        for (const other of cb.enemies) {
          if (other.uid === target.uid || other.hpNow <= 0) continue;
          const otherPos = cb.enemyPositions?.[other.uid];
          if (!otherPos) continue;
          // Vector from player to target
          const dx = targetPos.x - cb.playerPos.x;
          const dy = targetPos.y - cb.playerPos.y;
          // Vector from player to other
          const ox = otherPos.x - cb.playerPos.x;
          const oy = otherPos.y - cb.playerPos.y;
          // Check if other is "between" player and target (roughly on the line, closer)
          const distToOther = Math.max(Math.abs(ox), Math.abs(oy));
          const distToTarget = Math.max(Math.abs(dx), Math.abs(dy));
          if (distToOther >= distToTarget) continue;
          // Check if other is roughly on the line (within 1 square of the line)
          // Cross product approximation
          const cross = Math.abs(dx * oy - dy * ox);
          const lineLen = Math.sqrt(dx * dx + dy * dy);
          if (lineLen === 0) continue;
          const perpDist = cross / lineLen;
          if (perpDist <= 1) {
            // Other enemy provides cover — at least half cover (+2)
            // If 2+ enemies provide cover → three-quarter (+5)
            targetCoverAC = targetCoverAC === 0 ? COVER_AC_BONUS["half"] : COVER_AC_BONUS["three-quarter"];
            targetCoverLabel = targetCoverAC === COVER_AC_BONUS["half"] ? "half cover" : "three-quarter cover";
          }
        }
      }
      // Apply cover bonus to target's effective AC for this attack
      const effectiveTargetAC = target.ac + targetCoverAC;
      // Advantages: hidden, surprise, invisible, target glowing (Faerie Fire), target has advantage-conditions, Help action, Vex mastery
      let adv: "none" | "advantage" | "disadvantage" = (cc.hiddenAdv || cb.surprise || cb.invisible || target.glow || target.helpBuff || cc.vexTarget === target.uid || attackerHasAdvVs(target)) ? "advantage" : "none";
      // Consume helpBuff + vexTarget on attack (D&D 5e: advantage lasts until first attack)
      if (target.helpBuff) {
        target.helpBuff = false;
        entries.push(entrySystem(`🤝 Help advantage consumed`));
      }
      if (cc.vexTarget === target.uid) {
        cc.vexTarget = null;
        entries.push(entrySystem(`⚔️ Vex advantage consumed`));
      }
      // Disadvantages: player's debuff conditions, ranged long range, prone target (ranged only), melee adjacent (ranged only)
      if (hasDisadv(cc) || rangedDisadv || proneRangedDisadv || meleeAdjacentDisadv) adv = adv === "advantage" ? "none" : "disadvantage";
      // Bless buff: +1d4 to attack rolls (data-driven: read from active buffs)
      let atkModTotal = attackMod(cc, w);
      let blessDie = 0;
      if ((cc.buffs || []).some((b: any) => b.name === "Bless")) {
        blessDie = d(4);
        atkModTotal += blessDie;
      }
      // Bane debuff: -1d4 to attack rolls
      let baneDie = 0;
      if ((cc.buffs || []).some((b: any) => b.name === "Bane")) {
        baneDie = d(4);
        atkModTotal -= baneDie;
      }
      // Note: Exhaustion penalty is already applied inside attackMod() — do NOT subtract again here
      // (D&D 2024: -2/level to all D20 Tests including attack rolls)
      const atk = rollD20(atkModTotal, adv);
      if (target.glow) target.glow = false;
      const critOn = critThreshold(cc);
      const hit = atk.die !== 1 && (atk.die === 20 || atk.total >= effectiveTargetAC);
      // Phase 2: Auto-crit vs paralyzed/unconscious within 5ft (D&D 2024)
      // Also auto-crit vs petrified (DM ruling — typically counts as incapacitated)
      const targetIncapacitated = target.conditions && (target.conditions.includes("paralyzed") || target.conditions.includes("unconscious") || target.conditions.includes("petrified"));
      const isAutoCrit = hit && targetIncapacitated && dist <= 1; // melee within 5ft
      const isCrit = isAutoCrit || (hit && atk.die >= critOn);
      let extra: string | null = null;
      if (isAutoCrit) {
        if (extra === null) extra = "";
        extra += `💀 AUTO-CRIT (target incapacitated within 5ft)`;
      }
      if (targetCoverAC > 0) {
        // Show cover info in the roll entry
        if (extra === null) extra = "";
        extra += `🛡️ ${targetCoverLabel} (+${targetCoverAC} AC = ${effectiveTargetAC})`;
      }
      if (hit) {
        // === D&D 2024 Weapon Damage ===
        // Versatile weapons: use versatileDmg if 2-handed (we simplify: always use versatileDmg if present — player choice)
        const dmgDie = w.versatileDmg && (w.properties || []).includes("versatile") ? w.versatileDmg : w.dmg;
        const dmgR = rollFormula(dmgDie);
        let dmg = dmgR.total + mod(cc.abilities[w.abil]) + (w.plus || 0);
        // B4: Track last weapon damage roll for Savage Attacker reroll
        (cb as any)._lastWeaponDamageRoll = { formula: dmgDie, total: dmgR.total, damageType: w.dmgType || "slashing" };
        let parts = [`${dmgDie}(${dmgR.rolls.join("+")})+${mod(cc.abilities[w.abil]) + (w.plus || 0)}${w.plus ? ` (อาวุธ +${w.plus})` : ""}${w.versatileDmg && dmgDie === w.versatileDmg ? " (2H)" : ""}`];
        if (blessDie > 0) parts.push(`Bless +${blessDie}`);
        if (baneDie > 0) parts.push(`Bane -${baneDie}`);
        // D&D 2024 Critical Hit: roll ALL damage dice twice (weapon dice + Sneak Attack + Hunter's Mark + Smite + Hex + any other dice)
        // Source: D&D Beyond Free Rules 2024 "Critical Hits": "If the attack involves other damage dice, such as from the Rogue's Sneak Attack feature, you also roll those dice twice."
        // We accomplish this by doubling the dice count via a critMultiplier flag that the additional-damage blocks check.
        const critMultiplier = isCrit ? 2 : 1;
        if (isCrit) {
          const cr = rollFormula(dmgDie); // additional weapon dice (the 2nd roll)
          dmg += cr.total;
          parts.push(`CRIT(${critOn}-20) +${cr.total} (weapon dice doubled)`);
        }
        // Sneak Attack: D&D 5e/2024 RAW — advantage on attack roll OR ally within 5ft of target
        // In solo play (no allies), only advantage qualifies
        // D&D 2024: Sneak Attack dice ARE doubled on crit (same as 5e — verbatim from PHB 2024)
        if (hasFeature(cc, "sneak_attack")) {
          const sneakEligible = adv === "advantage" || attackerHasAdvVs(target);
          if (sneakEligible) {
            const nDice = sneakDice(cc.level) * critMultiplier; // Double on crit (D&D 2024)
            const sn = rollFormula(`${nDice}d6`);
            dmg += sn.total; parts.push(`Sneak Attack ${nDice}d6 +${sn.total}${isCrit ? " (crit ×2)" : ""}`);
          }
        }
        // Hunter's Mark buff: +1d6 damage (doubled on crit — D&D 2024)
        if ((cc.buffs || []).some((b: any) => b.name === "Hunter's Mark")) {
          const hmDice = 1 * critMultiplier;
          const hm = rollFormula(`${hmDice}d6`);
          dmg += hm.total; parts.push(`Hunter's Mark +${hm.total}${isCrit ? " (crit ×2)" : ""}`);
        }
        // === D&D 2024 Weapon Mastery ===
        // Only Fighter, Paladin, Ranger, Barbarian, Monk (and some feats) get Weapon Mastery
        const hasMastery = ["fighter", "paladin", "ranger", "barbarian", "monk"].includes(cc.cls);
        if (hasMastery && w.mastery) {
          const masteryKey = w.mastery as string;
          const masteryInfo = WEAPON_MASTERIES[masteryKey];
          if (masteryInfo) {
            switch (masteryKey) {
              case "cleave": {
                // Deal weapon damage to another enemy within 5 ft (no ability mod)
                const adjacent = cb.enemies.find((e: any) => e.hpNow > 0 && e.uid !== target.uid && cb.enemyPositions[e.uid] && gridDistance(cb.playerPos, cb.enemyPositions[e.uid]) <= 1);
                if (adjacent) {
                  const cleaveDmg = rollFormula(dmgDie).total;
                  adjacent.hpNow = Math.max(0, adjacent.hpNow - cleaveDmg);
                  parts.push(`⚔️ Cleave → ${adjacent.th} +${cleaveDmg}`);
                }
                break;
              }
              case "graze": {
                // On miss, deal ability mod damage — but we're in hit block, so graze doesn't apply here
                // (graze is handled in the miss block below)
                break;
              }
              case "push": {
                // Push target 10 ft (2 squares) away if Large or smaller
                if (cb.enemyPositions[target.uid]) {
                  const ep = cb.enemyPositions[target.uid];
                  const dx = ep.x - cb.playerPos.x;
                  const dy = ep.y - cb.playerPos.y;
                  const pushX = ep.x + (dx !== 0 ? Math.sign(dx) * 2 : 0);
                  const pushY = ep.y + (dy !== 0 ? Math.sign(dy) * 2 : 0);
                  if (pushX >= 0 && pushX < (cb.grid?.w || 12) && pushY >= 0 && pushY < (cb.grid?.h || 10)) {
                    cb.enemyPositions[target.uid] = { x: pushX, y: pushY };
                    parts.push(`💨 Push 10ft → (${pushX},${pushY})`);
                  }
                }
                break;
              }
              case "sap": {
                // Target has disadvantage on next attack roll
                if (!target.conditions) target.conditions = [];
                if (!target.conditions.includes("sap_effect")) {
                  target.conditions.push("sap_effect");
                  parts.push(" Sap (disadv next atk)");
                }
                break;
              }
              case "slow": {
                // Reduce target speed by 10 ft (2 squares) until start of next turn
                target.speedReduced = (target.speedReduced || 0) + 10;
                parts.push(" Slow (-10ft speed)");
                break;
              }
              case "topple": {
                // Force CON save or fall prone
                const toppleDC = 8 + profByLevel(cc.level) + mod(cc.abilities[w.abil]);
                const sv = rollD20(monSave(target, "con"));
                if (sv.total < toppleDC) {
                  if (!target.conditions) target.conditions = [];
                  if (!target.conditions.includes("prone")) {
                    target.conditions.push("prone");
                    parts.push(` Topple! CON ${sv.total}<${toppleDC} → Prone`);
                  }
                }
                break;
              }
              case "vex": {
                // Gain advantage on next attack against this target
                cc.vexTarget = target.uid;
                parts.push(" Vex (adv next atk vs target)");
                break;
              }
              case "nick": {
                // Nick: bonus action attack with off-hand weapon uses full damage die (no ability mod reduction)
                // Handled in dual_wield logic — just log it
                break;
              }
            }
          }
        }
        // Hex buff: +1d6 damage (doubled on crit — D&D 2024)
        if ((cc.buffs || []).some((b: any) => b.name === "Hex")) {
          const hxDice = 1 * critMultiplier;
          const hx = rollFormula(`${hxDice}d6`);
          dmg += hx.total; parts.push(`Hex +${hx.total}${isCrit ? " (crit ×2)" : ""}`);
        }
        // Barbarian Rage bonus (feature-based)
        if (hasFeature(cc, "rage") && cc.raging && w.abil === "str") {
          const rageDmg = cc.level >= 9 ? 3 : 2;
          dmg += rageDmg; parts.push(`Rage +${rageDmg}`);
        }
        // Paladin Divine Smite — D&D 5e RAW: player chooses to smite after hitting
        // We auto-smite if toggle is on (default: on) and slots available
        if (hasFeature(cc, "divine_smite") && cc.divineSmiteReady && cc.slots && cc.slots.some((v: number) => v > 0) && cc.divineSmiteToggle !== false) {
          // Find lowest available slot
          let slotIdx = -1;
          for (let li = 0; li < cc.slots.length; li++) {
            if (cc.slots[li] > 0) { slotIdx = li; break; }
          }
          if (slotIdx >= 0) {
            cc.slots = cc.slots.map((v: number, i: number) => i === slotIdx ? v - 1 : v);
            const smiteDice = (2 + slotIdx) * critMultiplier; // 2d8 + 1d8 per slot above 1, doubled on crit (D&D 2024)
            const sm = rollFormula(`${smiteDice}d8`);
            dmg += sm.total; parts.push(`Divine Smite ${smiteDice}d8 +${sm.total} (slot ${slotIdx + 1})${isCrit ? " (crit ×2)" : ""}`);
          }
        }
        // Monk Flurry of Blows (ki)
        if (w.venom && !cc.venomUsed) {
          cc.venomUsed = true;
          const sv = rollD20(monSave(target, "con"));
          if (sv.total < 15) {
            const p = rollFormula("2d10");
            dmg += p.total; parts.push(`🐍 poison +${p.total} (CON save ${sv.total} < 15)`);
          } else parts.push(`🐍 poison resisted (CON save ${sv.total} ≥ 15)`);
        }
        // Bardic Inspiration die (1d6 at Lv1)
        if (cb.bardicInspiration) {
          const bi = d(6);
          dmg += bi; parts.push(`Bardic Inspiration +${bi}`);
          cb.bardicInspiration = false;
        }
        // === NEW: D&D 5e damage type resistance/immunity/vulnerability ===
        // Apply AFTER all damage modifiers (crit, sneak, hunter's mark, hex, smite, etc.)
        // so the resistance applies to the final total, not just the weapon die.
        // Weapon damage type defaults to "slashing" when not specified (per spec).
        const wDmgType = (w.damageType || w.dmgType || "slashing").toLowerCase();
        const resistedDmg = applyDamageModifiers(dmg, wDmgType, {
          resistances: target.damageResistances,
          vulnerabilities: target.damageVulnerabilities,
          immunities: target.damageImmunities,
        });
        if (resistedDmg === 0 && dmg > 0) parts.push(`🛡️ IMMUNE (${wDmgType})`);
        else if (resistedDmg < dmg) parts.push(`🛡️ RESIST (${wDmgType}) -${dmg - resistedDmg}`);
        else if (resistedDmg > dmg) parts.push(`💥 VULNERABLE (${wDmgType}) +${resistedDmg - dmg}`);
        dmg = resistedDmg;
        // Bless die (+1d4 to attack rolls, not damage — already applied to atk in real 5e but we simplified)
        target.hpNow = Math.max(0, target.hpNow - dmg);
        extra = `${parts.join(" · ")} = ${dmg} damage → ${target.th} ${target.hpNow <= 0 ? "dead!" : `${target.hpNow} HP left`}`;
        // Emit events for feature triggers (data-driven)
        emitAttack("player", target.uid, w.th);
        if (hit) {
          emitHit("player", target.uid, w.th, dmg);
          emitDamageDealt("player", target.uid, dmg, wDmgType);
          // Query feature triggers for on_hit (e.g. savage_attacker, poison_weapon)
          const hitTriggers = queryFeatureTriggers("on_hit", "player", target.uid, { weapon: w.th, damage: dmg }, characterHasFeatureById);
          if (hitTriggers.length > 0) {
            const applied = applyPendingChanges(hitTriggers, cc, cb, entries);
            cc = applied.cc; cb = applied.cb;
            // Re-find target after pending changes may have updated enemy list
            const updatedTarget = cb.enemies.find((e: any) => e.uid === target.uid);
            if (updatedTarget) target.hpNow = updatedTarget.hpNow;
          }
          // Check for kill
          if (target.hpNow <= 0) {
            emitKill("player", target.uid);
            emitDeath(target.uid, "player");
            entries.push(entrySystem(`💀 ${target.th} ล้มลง!`));
          }
        }
      }
      // === D&D 2024 Weapon Mastery: Graze (on miss, deal ability mod damage) ===
      if (!hit && w.mastery === "graze") {
        const hasMastery = ["fighter", "paladin", "ranger", "barbarian", "monk"].includes(cc.cls);
        if (hasMastery) {
          const grazeDmg = Math.max(1, mod(cc.abilities[w.abil]));
          target.hpNow = Math.max(0, target.hpNow - grazeDmg);
          extra = `Graze: +${grazeDmg} ${w.abil.toUpperCase()} mod damage → ${target.th} ${target.hpNow <= 0 ? "dead!" : `${target.hpNow} HP left`}`;
          emitDamageDealt("player", target.uid, grazeDmg, "slashing");
          if (target.hpNow <= 0) {
            emitKill("player", target.uid);
            entries.push(entrySystem(`💀 ${target.th} ล้มลงจาก Graze!`));
          }
        }
      }
      entries.push({ id: nextId(), type: "roll", title: `${label} ${target.th} (${w.th})`, roll: atk, vsAc: effectiveTargetAC, success: hit, extra });
      cc.hiddenAdv = false;
      if (cb.invisible) { cb.invisible = false; entries.push(entrySystem("🫥 You become visible again (attacking ends invisibility)")); }
    };

    if (kind === "attack" || kind === "attack_ranged") {
      const w = kind === "attack_ranged" ? getRanged(cc) : getMelee(cc);
      const label = kind === "attack_ranged" ? "🏹 Shoot" : "Attack";
      // B3: Extra Attack scales with level — Fighter gets 3 at L11, 4 at L20
      const allFeats = getExtendedFeatures()[cc.cls] || {};
      let numAttacks = 1;
      // Check for extra_attack, extra_attack_3, extra_attack_4 in cumulative features
      for (let lv = 1; lv <= cc.level; lv++) {
        const feats = allFeats[lv] || [];
        for (const f of feats) {
          if (f.k === "extra_attack") numAttacks = Math.max(numAttacks, 2);
          if (f.k === "extra_attack_3") numAttacks = Math.max(numAttacks, 3);
          if (f.k === "extra_attack_4") numAttacks = Math.max(numAttacks, 4);
        }
      }
      // Monk: Martial Arts gives bonus action unarmed strike after Attack
      const monkBonus = hasFeature(cc, "martial_arts");
      for (let i = 0; i < numAttacks; i++) {
        if (!cb.enemies.some((e: any) => e.hpNow > 0)) break;
        if (i > 0) entries.push(entrySystem("⚔️ Extra Attack — second strike"));
        doWeaponAttack(w, label);
      }
      cc.attackedThisRound = true; // Track for Rage maintenance
      if (monkBonus && cb.enemies.some((e:any) => e.hpNow > 0) && !cb.bonusUsed) {
        // D&D 2024: Monk Martial Arts die = 1d4 at Lv1-4, 1d6 at Lv5-10, 1d8 at Lv11-16, 1d10 at Lv17+
        const martialDie = cc.level >= 17 ? "1d10" : cc.level >= 11 ? "1d8" : cc.level >= 5 ? "1d6" : "1d4";
        entries.push(entrySystem(`🥋 Martial Arts — bonus action unarmed strike (${martialDie}+DEX)`));
        doWeaponAttack({ th: "Unarmed Strike", dmg: martialDie, abil: "dex", ranged: false, reach: 5, properties: [] }, "👊");
        cb.bonusUsed = true;
      }
    } else if (kind === "item") {
      const item = CONSUMABLES[payload];
      const idx = cc.inventory.indexOf(payload);
      if (item && idx >= 0) {
        cc.inventory = [...cc.inventory];
        cc.inventory.splice(idx, 1);
        if (item.heal) {
          const h = rollFormula(item.heal);
          cc.hp = Math.min(cc.maxHp, cc.hp + h.total);
          entries.push(entrySystem(`🧪 Used ${payload}: healed ${h.total} HP → ${cc.hp}/${cc.maxHp}`));
        }
        if (item.cure) {
          const ci = cc.conditions.indexOf(item.cure);
          cc.conditions = [...cc.conditions];
          if (ci >= 0) { cc.conditions.splice(ci, 1); entries.push(entrySystem(`🧪 Used ${payload}: cured ${item.cure}`)); }
          else entries.push(entrySystem(`🧪 Used ${payload}: no ${item.cure} to cure (wasted)`));
        }
        if (item.dmg) {
          // thrown item like Acid, Holy Water
          const target = cb.enemies.find((e:any)=>e.hpNow>0);
          if (target) {
            const dr = rollFormula(item.dmg);
            target.hpNow = Math.max(0, target.hpNow - dr.total);
            entries.push({ id: nextId(), type: "roll", title: `${payload} → ${target.th}`, roll: { die:0, other:null, mod:0, total:0, adv:"none" }, success: true, extra: `${item.dmgType||""} ${dr.total} → ${target.th} ${target.hpNow<=0?"dead!":`${target.hpNow} HP left`}` });
          }
        }
        if (hasFeature(cc, "fast_hands") && !cb.bonusUsed) {
          cb.bonusUsed = true; endsTurn = false;
          entries.push(entrySystem("🖐️ Fast Hands (bonus action) — can still take main action"));
        }
      }
      setCombatMenu("");
    } else if (kind === "spell") {
      // payload is "spellIndex@slotLevel"
      const [spellIndex, slotStr] = String(payload).split("@");
      const slotLevel = parseInt(slotStr, 10);
      // Cast async — but we're in a sync function. Mark thinking and handle async.
      setThinking(true);
      (async () => {
        try {
          const result = await castSRDSpell(spellIndex, slotLevel, cc, cb, entries);
          cc = result.cc; cb = result.cb;
          let finalEndsTurn = result.endsTurn;
          // Action Surge: keep turn going
          if (finalEndsTurn && cb.extraAction) {
            cb.extraAction = false;
            finalEndsTurn = false;
            entries.push(entrySystem("⚡ Action Surge triggers — take 1 more action!"));
          }
          setCombatMenu("");
          // win check
          let endW = checkCombatEnd(cb, cc, entries);
          cc = endW.cc;
          if (endW.ended) {
            const finalLog = [...log0, ...entries];
            commitCombat(cc, null, finalLog);
            setThinking(false);
            narrateCombatEvent(`[จบ combat] ${cc.name} ชนะ! กำจัด ${cb.enemies.map((e:any)=>e.th).join(", ")}. HP คงเหลือ ${cc.hp}/${cc.maxHp}. บรรยายผลหลังการต่อสู้และอาจให้ loot — อย่าลืมอ้างถึงแผลที่ได้รับและสภาพรอบตัวในฉากเดิม`, cc, scene, finalLog, history);
            return;
          }
          if (!finalEndsTurn) {
            const finalLog = [...log0, ...entries];
            commitCombat(cc, cb, finalLog);
            persist(cc, scene, finalLog, cb, history);
            setThinking(false);
            return;
          }
          // enemies act
          if (cb.surprise) {
            cb.surprise = false; cb.round += 1; cb.bonusUsed = false; cb.extraAction = false;
            entries.push(entrySystem("😵 Enemy surprised — loses first-turn retaliation"));
            const finalLog = [...log0, ...entries];
            commitCombat(cc, cb, finalLog);
            persist(cc, scene, finalLog, cb, history);
            setThinking(false);
            return;
          }
          // auto-spells: Spiritual Weapon + Spirit Guardians
          if (cb.spiritualWeapon) {
            const t = cb.enemies.find((e:any)=>e.hpNow>0);
            if (t) {
              const atk = rollD20(spellAtkMod(cc), t.glow ? "advantage" : "none");
              if (t.glow) t.glow = false;
              const hit = atk.die !== 1 && (atk.die === 20 || atk.total >= t.ac);
              let extra: string | null = null;
              if (hit) {
                const dr = rollFormula("1d8");
                let dmg = dr.total + mod(cc.abilities[CLASSES[cc.cls].castAbil]);
                if (atk.die === 20) dmg += rollFormula("1d8").total;
                t.hpNow = Math.max(0, t.hpNow - dmg);
                extra = `${dmg} damage → ${t.th} ${t.hpNow<=0?"dead!":`${t.hpNow} HP left`}`;
              }
              entries.push({ id: nextId(), type: "roll", title: `⚔️ Spiritual Weapon → ${t.th}`, roll: atk, vsAc: t.ac, success: hit, extra });
            }
            cb.swRounds = (cb.swRounds ?? 10) - 1;
            if (cb.swRounds <= 0) { cb.spiritualWeapon = false; entries.push(entrySystem("⚔️ Spiritual Weapon expires")); }
          }
          if (cb.spiritGuardians) {
            const dc = spellDC(cc);
            const dr = rollFormula("3d8");
            for (const t of cb.enemies) {
              if (t.hpNow <= 0) continue;
              const sv = rollD20(monSave(t, "wis"));
              const failed = sv.total < dc;
              const dmg = failed ? dr.total : Math.floor(dr.total / 2);
              t.hpNow = Math.max(0, t.hpNow - dmg);
              entries.push({ id: nextId(), type: "roll", title: `👻 Spirit Guardians → ${t.th} (WIS save DC ${dc})`, roll: sv, dc, success: failed, extra: `${dmg} radiant → ${t.th} ${t.hpNow<=0?"dead!":`${t.hpNow} HP left`}` });
            }
          }
          endW = checkCombatEnd(cb, cc, entries);
          cc = endW.cc;
          if (endW.ended) {
            const finalLog = [...log0, ...entries];
            commitCombat(cc, null, finalLog);
            setThinking(false);
            narrateCombatEvent(`[จบ combat] ${cc.name} ชนะ! กำจัด ${cb.enemies.map((e:any)=>e.th).join(", ")}. HP คงเหลือ ${cc.hp}/${cc.maxHp}. บรรยายผลหลังการต่อสู้และอาจให้ loot — อย่าลืมอ้างถึงแผลที่ได้รับและสภาพรอบตัวในฉากเดิม`, cc, scene, finalLog, history);
            return;
          }
          cc = enemyAttacks(cb, cc, entries);
          // Emit turn-end for player + turn-start for new round
          emitTurnEnd("player", cb.round);
          cb.round += 1; cb.bonusUsed = false; cb.extraAction = false; cb.movementLeft = cc.speed || 30; cb.hasMoved = false; cb.enemies.forEach((e:any) => e.reactionUsed = false);
          emitTurnStart("player", cb.round);
          const finalLog = [...log0, ...entries];
          commitCombat(cc, cb, finalLog);
          persist(cc, scene, finalLog, cb, history);
        } catch (e: any) {
          entries.push(entrySystem("⚠️ Spell cast failed: " + e.message));
          const finalLog = [...log0, ...entries];
          setLog(finalLog);
        } finally {
          setThinking(false);
        }
      })();
      return; // async branch handles commit
    } else if (kind === "second_wind") {
      if (hasFeature(cc, "second_wind") && !cc.secondWindUsed) {
        const h = rollFormula(`1d10+${cc.level}`);
        cc.hp = Math.min(cc.maxHp, cc.hp + h.total);
        cc.secondWindUsed = true;
        entries.push(entrySystem(`🛡️ Second Wind: healed ${h.total} HP → ${cc.hp}/${cc.maxHp}`));
        if (!cb.bonusUsed) { cb.bonusUsed = true; endsTurn = false; entries.push(entrySystem("💨 Bonus action — can still take main action")); }
      }
    } else if (kind === "action_surge") {
      if (hasFeature(cc, "action_surge") && !cc.actionSurgeUsed) {
        cc.actionSurgeUsed = true;
        cb.extraAction = true;
        endsTurn = false;
        entries.push(entrySystem("⚡ Action Surge! แอคชั่นถัดไปจะไม่จบเทิร์น — ทำได้ 2 แอคชั่นรอบนี้"));
      }
    } else if (kind === "move") {
      // Move player token on the grid. payload = "x,y"
      const [mx, my] = String(payload).split(",").map(Number);
      if (cb.playerPos && cb.grid) {
        const dist = gridDistance(cb.playerPos, { x: mx, y: my });
        const moveCost = dist; // 1 square = 5 ft = 1 movement point
        if (moveCost > (cb.movementLeft || 0)) {
          entries.push(entrySystem(`⚠️ เคลื่อนที่ไม่ได้ — ต้องการ ${moveCost} ช่อง แต่เหลือ movement ${cb.movementLeft} ช่อง`));
        } else if (mx < 0 || mx >= cb.grid.w || my < 0 || my >= cb.grid.h) {
          entries.push(entrySystem(`⚠️ ตำแหน่งนอกกริด`));
        } else {
          // Check if target square is occupied by an enemy
          const occupied = cb.enemies.some((e: any) => e.hpNow > 0 && cb.enemyPositions[e.uid]?.x === mx && cb.enemyPositions[e.uid]?.y === my);
          if (occupied) {
            entries.push(entrySystem(`⚠️ ช่องนั้นมีศัตรูอยู่ — เคลื่อนที่ไม่ได้`));
          } else {
            const oldPos = { ...cb.playerPos };
            // Opportunity Attack check: was player adjacent to any enemy BEFORE moving, and is no longer adjacent after?
            const wasAdjacentTo = cb.enemies.filter((e: any) => e.hpNow > 0 && cb.enemyPositions[e.uid] && isAdjacent(oldPos, cb.enemyPositions[e.uid]));
            const newPos = { x: mx, y: my };
            const stillAdjacentTo = wasAdjacentTo.filter((e: any) => isAdjacent(newPos, cb.enemyPositions[e.uid]));
            const provokedOA = wasAdjacentTo.filter((e: any) => !stillAdjacentTo.includes(e));
            cb.playerPos = newPos;
            cb.movementLeft -= moveCost;
            cb.hasMoved = true;
            entries.push(entrySystem(`🏃 เคลื่อนที่จาก (${oldPos.x},${oldPos.y}) → (${mx},${my}) — ใช้ ${moveCost} ช่อง (เหลือ ${cb.movementLeft} ช่อง)`));
            // Opportunity Attacks from enemies provoked by leaving their reach
            // D&D 5e RAW: OA uses Reaction — each enemy can only make 1 OA per round
            if (provokedOA.length > 0 && !cb.disengageUsed) {
              for (const e of provokedOA) {
                if (e.hpNow <= 0 || cc.hp <= 0) break;
                // Check if this enemy already used their reaction this round
                if (e.reactionUsed) {
                  entries.push(entrySystem(`⚠️ ${e.th} ใช้ Reaction ไปแล้ว — ไม่สามารถทำ Opportunity Attack`));
                  continue;
                }
                e.reactionUsed = true; // Mark reaction as used
                entries.push(entrySystem(`⚠️ Opportunity Attack! ${e.th} โจมตีขณะคุณเคลื่อนที่ออก (ใช้ Reaction)`));
                const oaAtk = rollD20(e.atk || 4, "none");
                const oaHit = oaAtk.die !== 1 && (oaAtk.die === 20 || oaAtk.total >= cc.ac);
                if (oaHit) {
                  const oaDmg = rollFormula(e.dmg || "1d6+2");
                  cc.hp = Math.max(0, cc.hp - oaDmg.total);
                  entries.push({ id: nextId(), type: "roll", title: `${e.th} Opportunity Attack`, roll: oaAtk, vsAc: cc.ac, success: true, extra: `${e.dmg}=${oaDmg.total} → HP ${cc.hp}` });
                  if (cc.hp <= 0) {
                    entries.push(entrySystem(`💀 ${cc.name} ล้มลงหมดสติจาก Opportunity Attack!`));
                    break;
                  }
                } else {
                  entries.push({ id: nextId(), type: "roll", title: `${e.th} Opportunity Attack`, roll: oaAtk, vsAc: cc.ac, success: false, extra: null });
                }
              }
            }
          }
        }
      }
    } else if (kind === "dash") {
      // D&D 5e RAW: Dash = Action → gain extra movement equal to speed
      cb.movementLeft += (cc.speed || 30);
      entries.push(entrySystem(`🏃 Dash: ใช้ Action — เพิ่ม movement ${cc.speed || 30} ฟุต (รวม ${cb.movementLeft} ฟุต)`));
    } else if (kind === "help") {
      // D&D 5e RAW: Help = Action → ally gains advantage on next attack vs target
      const target = cb.enemies.find((e: any) => e.hpNow > 0);
      if (target) {
        entries.push(entrySystem(`🤝 Help: ใช้ Action — การโจมตีถัดไปใส่ ${target.th} ได้เปรียบ`));
        target.helpBuff = true; // next attack vs this target has advantage
      }
    } else if (kind === "search") {
      // D&D 5e RAW: Search = Action → Perception or Investigation check
      let searchAdv: "none" | "advantage" | "disadvantage" = hasCheckDisadv(cc) ? "disadvantage" : "none";
      const r = rollD20(skillMod(cc, "perception"), searchAdv);
      const dc = 15;
      const ok = r.total >= dc;
      entries.push({ id: nextId(), type: "roll", title: "Search (Perception)", roll: r, dc, success: ok, extra: ok ? "พบศัตรูที่ซ่อนอยู่!" : "ไม่พบอะไร" });
      if (ok) {
        // Reveal any hidden enemies
        cb.enemies.forEach((e: any) => { if (e.hidden) { e.hidden = false; entries.push(entrySystem(`👁️ เจอ ${e.th} ที่ซ่อนอยู่!`)); } });
      }
    } else if (kind === "rage") {
      if (hasFeature(cc, "rage") && !cc.raging && cc.rageUsed < (cc.level >= 6 ? 4 : cc.level >= 3 ? 3 : 2)) {
        cc.raging = true;
        cc.rageUsed += 1;
        entries.push(entrySystem(`🔥 Rage: advantage on Str checks, +${cc.level >= 9 ? 3 : 2} melee damage, resistance to bludgeoning/piercing/slashing. Ends if you don't attack for a round.`));
        if (!cb.bonusUsed) { cb.bonusUsed = true; endsTurn = false; }
      }
    } else if (kind === "lay_on_hands") {
      if (hasFeature(cc, "lay_on_hands") && cc.layOnHandsPool > 0) {
        const heal = Math.min(cc.layOnHandsPool, cc.maxHp - cc.hp);
        cc.hp += heal;
        cc.layOnHandsPool -= heal;
        entries.push(entrySystem(`🤲 Lay on Hands: healed ${heal} HP → ${cc.hp}/${cc.maxHp} (pool: ${cc.layOnHandsPool} left)`));
      }
    } else if (kind === "ki_flurry") {
      if (hasFeature(cc, "martial_arts") && cc.kiUsed < cc.level) {
        cc.kiUsed += 1;
        // Two extra unarmed strikes
        for (let i = 0; i < 2; i++) {
          if (!cb.enemies.some((e:any)=>e.hpNow>0)) break;
          doWeaponAttack({ th: "Unarmed Strike", dmg: "1d4", abil: "dex", ranged: false }, `🥋 Flurry ${i+1}`);
        }
        entries.push(entrySystem(`🌀 Flurry of Blows (1 ki point, ${cc.level - cc.kiUsed} ki left)`));
      }
    } else if (kind === "bardic_inspiration") {
      if (hasFeature(cc, "bardic_inspiration") && cc.bardicInspirationUsed < (mod(cc.abilities.cha) || 1)) {
        cc.bardicInspirationUsed += 1;
        cb.bardicInspiration = true;
        entries.push(entrySystem("🎵 Bardic Inspiration: next attack gains +1d6 damage"));
        if (!cb.bonusUsed) { cb.bonusUsed = true; endsTurn = false; }
      }
    } else if (kind === "heroic_inspiration") {
      // Phase 2: Heroic Inspiration (D&D 2024 core) — grant advantage on next d20 roll
      if (cc.heroicInspiration) {
        cc.heroicInspiration = false;
        cc.hiddenAdv = true; // reuse hiddenAdv flag for "next attack advantage"
        entries.push(entrySystem("⭐ Heroic Inspiration: การทอย d20 ครั้งถัดไปได้เปรียบ (consumed)"));
        endsTurn = false; // free action
      }
    } else if (kind === "preserve_life") {
      if (hasFeature(cc, "preserve_life") && !cc.preserveLifeUsed) {
        const cap = Math.floor(cc.maxHp / 2);
        if (cc.hp >= cap) {
          entries.push(entrySystem(`🕊️ Preserve Life unavailable — HP already exceeds half Max HP (RAW cap ${cap})`));
        } else {
          const heal = Math.min(5 * cc.level, cap - cc.hp);
          cc.preserveLifeUsed = true;
          cc.hp += heal;
          entries.push(entrySystem(`🕊️ Channel Divinity — Preserve Life: healed ${heal} HP → ${cc.hp}/${cc.maxHp}`));
        }
      }
    } else if (kind === "hide") {
      // === D&D 5e Stealth Rules (RAW) ===
      // 1. Roll Stealth check (Dexterity + proficiency if proficient)
      // 2. Compare against EACH enemy's Passive Perception (10 + WIS mod + proficiency)
      // 3. If Stealth > Passive Perception → enemy doesn't know your position (Hidden)
      // 4. Hidden = advantage on attacks + enemies attack you with disadvantage
      // 5. Hidden ends when you attack, cast spell, make noise, or enter line of sight
      // 6. Enemies can use Search action (Perception check) to find you
      let hadv: "none" | "advantage" | "disadvantage" = hasCheckDisadv(cc) ? "disadvantage" : "none";
      if (wornHas(cc, "adv_stealth")) hadv = hadv === "disadvantage" ? "none" : "advantage";
      const r = rollD20(skillMod(cc, "stealth"), hadv);
      // Check against each enemy's passive perception
      // D&D 5e/2024 Passive Perception = 10 + WIS mod + proficiency (if proficient in Perception)
      // Source: PHB "Passive Checks: ...such as a score for Passive Perception... = 10 + all modifiers that normally apply to the check"
      // Open5e creatures have pre-computed `passivePerception` field — use it directly
      // Legacy BESTIARY monsters don't have this field → compute from WIS modifier
      const stealthResult = r.total;
      const enemyChecks = cb.enemies.filter((e: any) => e.hpNow > 0).map((e: any) => {
        let enemyPassivePerc: number;
        if (e.passivePerception && e.passivePerception > 0) {
          // Open5e pre-computed value (already includes WIS mod + proficiency)
          enemyPassivePerc = e.passivePerception;
        } else {
          // Legacy BESTIARY: compute from WIS modifier (not WIS save modifier!)
          // e.sv.wis is the WIS SAVE modifier (WIS mod + PB if proficient in WIS saves)
          // We need WIS ability modifier — extract from abilities or estimate from save
          const wisMod = e.abilities?.wis ? Math.floor((e.abilities.wis - 10) / 2) : (e.sv?.wis ?? 0);
          enemyPassivePerc = 10 + wisMod;
        }
        const detected = stealthResult <= enemyPassivePerc;
        return { name: e.th, passivePerc: enemyPassivePerc, detected };
      });
      const allHidden = enemyChecks.every((ec: any) => !ec.detected);
      const someDetected = enemyChecks.some((ec: any) => ec.detected);
      cc.hiddenAdv = allHidden;
      cc.hiddenStealthRoll = stealthResult; // store for enemy Search checks
      const checkSummary = enemyChecks.map((ec: any) => `${ec.name}(PP ${ec.passivePerc}):${ec.detected ? "เห็น" : "ไม่เห็น"}`).join(", ");
      entries.push({
        id: nextId(), type: "roll", title: "Hide (Stealth)", roll: r,
        success: allHidden,
        extra: allHidden
          ? `ซ่อนสำเร็จ! Stealth ${stealthResult} > ทุกศัตรู — โจมตีได้เปรียบ, ศัตรูเสียเปรียบโจมตีคุณ`
          : someDetected
            ? `ซ่อนไม่สำเร็ยบางส่วน — ${enemyChecks.filter((ec: any) => ec.detected).map((ec: any) => ec.name).join(", ")} เห็นคุณ`
            : `ล้มเหลว — ทุกศัตรูเห็นคุณ`
      });
      entries.push(entrySystem(`   📊 ${checkSummary}`));
      // E2: D&D 2024 — successful Hide grants Invisible condition (not just hiddenAdv flag)
      if (allHidden) {
        if (!cc.conditions.includes("invisible")) {
          cc.conditions.push("invisible");
          entries.push(entrySystem("🫥 D&D 2024: Hide สำเร็จ → Invisible condition (ศัตรูโจมตีคุณเสียเปรียบ, คุณโจมตีได้เปรียบ)"));
        }
      }
      // E2: Light level affects stealth — dim light gives +2 to Stealth
      const currentHour = worldClockToLegacy(getWorldClock()).hour;
      const lightLevel = getLightLevelForHour(currentHour);
      if (lightLevel === "dim" || lightLevel === "darkness") {
        entries.push(entrySystem(`   🌙 แสง${lightLevel === "dim" ? "สลัว" : "มืด"} — ช่วยให้ซ่อนได้ดีขึ้น`));
      }
      if (hasFeature(cc, "cunning_action") && !cb.bonusUsed) {
        cb.bonusUsed = true; endsTurn = false;
        entries.push(entrySystem("💨 Cunning Action (bonus action) — ยังโจมตีได้"));
      }
    } else if (kind === "dodge") {
      // D&D 5e RAW: Dodge = Action (entire turn's action)
      cb.dodge = true;
      entries.push(entrySystem(`🌀 Dodge: ใช้ Action — ศัตรูโจมตีคุณเสียเปรียบจนถึงเทิร์นถัดไป`));
      // Dodge consumes the Action — turn ends (unless Rogue Cunning Action makes it bonus)
      if (!hasFeature(cc, "cunning_action")) {
        endsTurn = true;
      } else if (!cb.bonusUsed) {
        cb.bonusUsed = true; endsTurn = false;
        entries.push(entrySystem("💨 Cunning Action (bonus action) — ยังโจมตีได้"));
      }
    } else if (kind === "disengage") {
      // D&D 5e RAW: Disengage = Action (prevents OA for rest of turn)
      cb.disengageUsed = true;
      entries.push(entrySystem(`🚶 Disengage: ใช้ Action — ไม่ก่อ Opportunity Attack ในเทิร์นนี้`));
      // Rogues with Cunning Action can Disengage as bonus action
      if (hasFeature(cc, "cunning_action") && !cb.bonusUsed) {
        cb.bonusUsed = true;
        endsTurn = false;
        entries.push(entrySystem("💨 Cunning Action (bonus action) — ยังเคลื่อนที่/โจมตีได้"));
      }
    } else if (kind === "ready") {
      // Phase 2: Ready Action (D&D 2024) — prepare a reaction with trigger
      // Simplified: player ready a melee attack that triggers when enemy moves adjacent
      cb.readyAction = { trigger: "enemy_approach", action: "attack" };
      entries.push(entrySystem(`⏰ Ready Action: ใช้ Action — เตรียมโจมตีเมื่อศัตรูเข้าใกล้ (Reaction)`));
      endsTurn = true;
    } else if (kind === "invisible") {
      if ((cc.worn || []).includes("Ring of Invisibility") && !cb.invisible) {
        cb.invisible = true;
        cc.hiddenAdv = true;
        entries.push(entrySystem("🫥 Ring of Invisibility: you fade — next attack has advantage, enemies attack you with disadvantage"));
      }
    } else if (kind === "grapple") {
      // D&D 2024 Grapple: Unarmed Strike → target makes STR or DEX save vs DC 8+prof+STR
      const target = cb.enemies.find((e: any) => e.hpNow > 0);
      if (target) {
        const grappleDC = 8 + profByLevel(cc.level) + mod(cc.abilities.str);
        const targetSaveMod = Math.max(monSave(target, "str"), monSave(target, "dex"));
        const sv = rollD20(targetSaveMod, "none");
        const success = sv.total >= grappleDC; // target succeeds = escapes grapple
        entries.push({ id: nextId(), type: "roll", title: `จับตรึง ${target.th} (STR/DEX save vs DC ${grappleDC})`, roll: sv, dc: grappleDC, success: !success, extra: !success ? `${target.th} ถูกตรึง (Grappled — speed 0)` : `${target.th} หลุดจากการจับ` });
        if (!success) {
          if (!target.conditions) target.conditions = [];
          if (!target.conditions.includes("grappled")) target.conditions.push("grappled");
          target.speedReduced = (target.speedReduced || 0) + 999; // speed = 0 while grappled
        }
      }
    } else if (kind === "shove") {
      // D&D 2024 Shove: Unarmed Strike → target makes STR or DEX save vs DC 8+prof+STR
      // Option: knock prone OR push 5ft
      const target = cb.enemies.find((e: any) => e.hpNow > 0);
      if (target) {
        const shoveDC = 8 + profByLevel(cc.level) + mod(cc.abilities.str);
        const targetSaveMod = Math.max(monSave(target, "str"), monSave(target, "dex"));
        const sv = rollD20(targetSaveMod, "none");
        const success = sv.total >= shoveDC; // target succeeds = resists shove
        entries.push({ id: nextId(), type: "roll", title: `ผลัก/ล้ม ${target.th} (STR/DEX save vs DC ${shoveDC})`, roll: sv, dc: shoveDC, success: !success, extra: !success ? `${target.th} ล้ม (Prone)` : `${target.th} ต้านทานได้` });
        if (!success) {
          if (!target.conditions) target.conditions = [];
          if (!target.conditions.includes("prone")) target.conditions.push("prone");
        }
      }
    } else if (kind === "dual_wield") {
      // D&D 5e RAW Two-Weapon Fighting: both weapons must have Light property
      // Bonus action attack with off-hand weapon
      const mainW = getMelee(cc);
      // Check if main weapon has Light property
      if (!mainW || !(mainW.properties || []).includes("light")) {
        entries.push(entrySystem("⚠️ อาวุธหลักไม่ใช่ Light — ไม่สามารถใช้ Two-Weapon Fighting ได้"));
      } else {
        const target = cb.enemies.find((e: any) => e.hpNow > 0);
        if (target && mainW) {
          const atk = rollD20(attackMod(cc, mainW), hasDisadv(cc) ? "disadvantage" : "none");
          const hit = atk.die !== 1 && (atk.die === 20 || atk.total >= target.ac);
          let extra: string | null = null;
          if (hit) {
            const dmgR = rollFormula(mainW.dmg);
            let dmg = dmgR.total;
            // Two-Weapon Fighting Style: add ability modifier to off-hand damage
            if (hasFeature(cc, "two_weapon_fighting")) {
              dmg += mod(cc.abilities[mainW.abil]);
            }
            if (atk.die === 20) dmg += rollFormula(mainW.dmg).total;
            target.hpNow = Math.max(0, target.hpNow - dmg);
            extra = `${mainW.dmg}(${dmgR.rolls.join("+")})${hasFeature(cc, "two_weapon_fighting") ? `+${mod(cc.abilities[mainW.abil])}` : ""} = ${dmg} → ${target.th} ${target.hpNow <= 0 ? "ตาย!" : `เหลือ ${target.hpNow} HP`}`;
          }
          entries.push({ id: nextId(), type: "roll", title: `⚔️⚔️ มือนอก → ${target.th}`, roll: atk, vsAc: target.ac, success: hit, extra });
          cb.bonusUsed = true;
        }
      }
    } else if (kind === "flee") {
      const best = cc.abilities.dex >= cc.abilities.str ? "acrobatics" : "athletics";
      let adv: "none" | "advantage" | "disadvantage" = hasCheckDisadv(cc) ? "disadvantage" : "none";
      if (hasFeature(cc, "cunning_action")) adv = adv === "disadvantage" ? "none" : "advantage";
      const r = rollD20(skillMod(cc, best), adv);
      const ok = r.total >= 12;
      entries.push({ id: nextId(), type: "roll", title: `Flee (${SKILLS[best].th})`, roll: r, dc: 12, success: ok });
      if (ok) fled = true;
    }

    // Action Surge
    if (endsTurn && cb.extraAction && ["attack", "attack_ranged", "item", "dodge"].includes(kind)) {
      cb.extraAction = false;
      endsTurn = false;
      entries.push(entrySystem("⚡ Action Surge triggers — take 1 more action!"));
    }

    // win check
    let endW = checkCombatEnd(cb, cc, entries);
    cc = endW.cc;
    if (endW.ended || fled) {
      const finalLog = [...log0, ...entries];
      commitCombat(cc, null, finalLog);
      const summary = fled
        ? `[combat end] ${cc.name} fled the fight successfully. Narrate the escape`
        : `[จบ combat] ${cc.name} ชนะ! กำจัด ${cb.enemies.map((e: any) => e.th).join(", ")}. HP คงเหลือ ${cc.hp}/${cc.maxHp}. บรรยายผลหลังการต่อสู้และอาจให้ loot — อย่าลืมอ้างถึงแผลที่ได้รับและสภาพรอบตัวในฉากเดิม`;
      narrateCombatEvent(summary, cc, scene, finalLog, history);
      return;
    }

    if (!endsTurn && !fled) {
      const finalLog = [...log0, ...entries];
      commitCombat(cc, cb, finalLog);
      persist(cc, scene, finalLog, cb, history);
      return;
    }

    // enemies act
    if (!fled) {
      if (cb.surprise) {
        cb.surprise = false; cb.round += 1; cb.bonusUsed = false; cb.extraAction = false;
        entries.push(entrySystem("😵 Enemy surprised — loses first-turn retaliation"));
        const finalLog = [...log0, ...entries];
        commitCombat(cc, cb, finalLog);
        persist(cc, scene, finalLog, cb, history);
        return;
      }
      if (cb.spiritualWeapon) {
        const t = cb.enemies.find((e: any) => e.hpNow > 0);
        if (t) {
          const atk = rollD20(spellAtkMod(cc), t.glow ? "advantage" : "none");
          if (t.glow) t.glow = false;
          const hit = atk.die !== 1 && (atk.die === 20 || atk.total >= t.ac);
          let extra: string | null = null;
          if (hit) {
            const dr = rollFormula("1d8");
            let dmg = dr.total + mod(cc.abilities[CLASSES[cc.cls].castAbil]);
            if (atk.die === 20) dmg += rollFormula("1d8").total;
            t.hpNow = Math.max(0, t.hpNow - dmg);
            extra = `${dmg} damage → ${t.th} ${t.hpNow<=0?"dead!":`${t.hpNow} HP left`}`;
          }
          entries.push({ id: nextId(), type: "roll", title: `⚔️ Spiritual Weapon → ${t.th}`, roll: atk, vsAc: t.ac, success: hit, extra });
        }
        cb.swRounds = (cb.swRounds ?? 10) - 1;
        if (cb.swRounds <= 0) { cb.spiritualWeapon = false; entries.push(entrySystem("⚔️ Spiritual Weapon expires")); }
      }
      if (cb.spiritGuardians) {
        const dc = spellDC(cc);
        const dr = rollFormula("3d8");
        for (const t of cb.enemies) {
          if (t.hpNow <= 0) continue;
          const sv = rollD20(monSave(t, "wis"));
          const failed = sv.total < dc;
          const dmg = failed ? dr.total : Math.floor(dr.total / 2);
          t.hpNow = Math.max(0, t.hpNow - dmg);
          entries.push({ id: nextId(), type: "roll", title: `👻 Spirit Guardians → ${t.th} (WIS save DC ${dc})`, roll: sv, dc, success: failed, extra: `${dmg} radiant → ${t.th} ${t.hpNow<=0?"dead!":`${t.hpNow} HP left`}` });
        }
      }
      endW = checkCombatEnd(cb, cc, entries);
      cc = endW.cc;
      if (endW.ended) {
        const finalLog = [...log0, ...entries];
        commitCombat(cc, null, finalLog);
        narrateCombatEvent(`[จบ combat] ${cc.name} ชนะ! กำจัด ${cb.enemies.map((e: any) => e.th).join(", ")}. HP คงเหลือ ${cc.hp}/${cc.maxHp}. บรรยายผลหลังการต่อสู้และอาจให้ loot — อย่าลืมอ้างถึงแผลที่ได้รับและสภาพรอบตัวในฉากเดิม`, cc, scene, finalLog, history);
        return;
      }
      // Tick buff durations BEFORE enemies attack (= end of player's turn)
      cc = tickBuffs(cc, entries);
      cc = enemyAttacks(cb, cc, entries);
      cb.round += 1; cb.bonusUsed = false; cb.extraAction = false; cb.movementLeft = cc.speed || 30; cb.hasMoved = false; cb.enemies.forEach((e:any) => e.reactionUsed = false);
      // End of round: rage expires if no attack happened this round
      if (cc.raging && !cc.attackedThisRound) {
        cc.raging = false;
        entries.push(entrySystem("🔥 Rage หมด (ไม่ได้โจมตีในรอบนี้)"));
      }
      cc.attackedThisRound = false; // reset for next round
    }

    const finalLog = [...log0, ...entries];
    commitCombat(cc, cb, finalLog);
    persist(cc, scene, finalLog, cb, history);
  }

  async function submitCombatTalk(text: string) {
    if (!text.trim() || thinking || !combatRef.current) return;
    setInput("");
    const cb: any = combatRef.current;
    const cc = cRef.current;
    const baseLog = [...logDataRef.current, entryPlayer(text)];
    logDataRef.current = baseLog;
    setLog(baseLog);
    setThinking(true);
    try {
          const enemiesTxt = cb.enemies.map((e: any) => `${e.th}${e.hpNow <= 0 ? " (ตายแล้ว)" : ` ${e.hpNow}/${e.hp} HP`}`).join(", ");
      const hist = [...history, {
        role: "user",
        content: `[ระหว่าง COMBAT รอบ ${cb.round} — ศัตรู: ${enemiesTxt} — HP ผู้เล่น ${cc.hp}/${cc.maxHp}]\nผู้เล่นทำ free action (พูด/ตะโกน/ถาม/สังเกต — ไม่ใช้เทิร์น): ${text}\nตอบ narration สั้น 1-3 ประโยคเท่านั้น ห้ามใช้ requires, ห้าม start_combat, ห้ามแก้ HP/ไอเทม/XP ผ่าน updates, ห้ามจบ combat — ถ้าผู้เล่นถามสถานะศัตรู บรรยายจากตัวเลขจริงใน context (เลือดเต็ม = ยังไม่บาดเจ็บ) ห้ามแต่งเลขเอง ห้ามพูดคำว่า engine/ระบบ`,
      }];
      const res = await callDM(buildSystemPrompt(cc, getPacingForPrompt()), hist);
      const finalHist = [...hist, { role: "assistant", content: JSON.stringify(res) }];
      const finalLog = [...logDataRef.current, entryNarration(res.narration)];
      logDataRef.current = finalLog;
      setLog(finalLog); setHistory(finalHist);
      persist(cRef.current, scene, finalLog, combatRef.current, finalHist);
    } catch (e: any) {
      const finalLog = [...logDataRef.current, entrySystem("⚠️ DM ขัดข้อง: " + e.message + " — ลองส่งใหม่")];
      logDataRef.current = finalLog;
      setLog(finalLog);
    } finally { setThinking(false); }
  }

  async function submitAction(text: string) {
    if (!text.trim() || thinking || combat) return;
    setInput("");
    const baseLog = [...log, entryPlayer(text)];
    setLog(baseLog);
    setThinking(true);
    try {
      // AI DM Layer: analyze player intent (Domain 31) for DM hint
      // Try LLM-based classifier first (more accurate for Thai/natural language)
      // Fall back to keyword-based classifier if LLM fails or returns "unknown"
      let intentResult = analyzeIntent(text); // keyword fallback (synchronous)
      try {
        const intentResp = await fetch("/api/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (intentResp.ok) {
          const llmIntent = await intentResp.json();
          if (llmIntent.intent && llmIntent.intent !== "unknown") {
            // LLM gave us a confident answer — use it
            intentResult = {
              intent: llmIntent.intent,
              confidence: llmIntent.confidence ?? 0.7,
              emotionTone: llmIntent.tone,
            };
          } else if (llmIntent.intent === "unknown" && intentResult.intent === "unknown") {
            // Both classifiers agree it's unknown — keep unknown with LLM confidence
            intentResult = { intent: "unknown", confidence: llmIntent.confidence ?? 0.2 };
          }
          // Otherwise: keyword classifier got something but LLM said unknown — trust keyword (faster, more lenient)
        }
      } catch (intentErr) {
        // LLM call failed — fall back to keyword classifier result
        console.warn("Intent LLM call failed, using keyword fallback:", intentErr);
      }
      setLastIntent(intentResult.intent);
      const knownPlaces = mapRef.current ? Object.keys(mapRef.current.nodes).slice(0, 40).join(",") : "-";
      // Include intent analysis as DM hint
      const intentHint = `\n[AI DM hint: intent=${intentResult.intent} confidence=${intentResult.confidence.toFixed(2)}${intentResult.emotionTone ? ` tone=${intentResult.emotionTone}` : ""}]`;
      // Scene anchor — prominently placed BEFORE the player message so DM can't miss it
      const sceneAnchor = `[CURRENT SCENE: ${scene || "?"} — ผู้เล่นอยู่ที่นี่ตอนนี้ ห้ามเปลี่ยนสถานที่โดยที่ผู้เล่นไม่ได้บอกว่าจะไป]\n`;

      // === Story Context — สรุปสถานะโลกให้ DM รู้เรื่องราวทั้งหมด ===
      const activeQuests = quests.filter(q => q.status === "active").map(q => {
        const objDone = (q.objectives || []).filter((o:any) => o.done).length;
        const objTotal = (q.objectives || []).length;
        return `${q.title}${objTotal > 0 ? ` (${objDone}/${objTotal} objectives)` : ""}`;
      }).join("; ") || "ไม่มี";

      const npcList = Object.entries(c.npcAttitudes || {}).map(([id, att]: [string, any]) => `${id}:${att}`).join(", ") || "ไม่มี";
      const factionList = Object.entries(c.factionReputation || {}).map(([id, rep]: [string, any]) => `${id}:${rep > 0 ? "+" : ""}${rep}`).join(", ") || "ไม่มี";

      // Recent events recap — สรุป 5 事件ล่าสุดจาก log (ไม่ใช่ history)
      const recentLogEntries = log.slice(-8).filter((e: any) => e.type === "dm" || e.type === "system").map((e: any) => {
        if (e.type === "dm") return `DM: ${e.text.slice(0, 120)}`;
        if (e.type === "system") return e.text.slice(0, 100);
        return "";
      }).filter(Boolean).join(" | ");
      const recentEvents = recentLogEntries ? `\n[RECENT EVENTS: ${recentLogEntries}]` : "";

      // Rest state — tell DM when player last rested
      const longRestHoursAgo = c.lastLongRestHoursAgo ?? 99;
      const shortRestHoursAgo = c.lastShortRestHoursAgo ?? 99;
      const restState = longRestHoursAgo < 2 ? "เพิ่งตื่นนอน (Long Rest ใหม่ๆ ไม่ถึง 2 ชม.ที่แล้ว — ห้ามแนะนำให้พักอีก!)"
        : longRestHoursAgo < 8 ? `พักยาวครั้งล่าสุด ${longRestHoursAgo} ชม.ที่แล้ว (ยังสดชื่น — ไม่ควรแนะนำให้พัก)`
        : longRestHoursAgo < 16 ? `พักยาวครั้งล่าสุด ${longRestHoursAgo} ชม.ที่แล้ว (เริ่มเหนื่อยเล็กน้อย — อาจแนะนำได้ถ้าเหมาะสม)`
        : `พักยาวครั้งล่าสุด ${longRestHoursAgo} ชม.ที่แล้ว (เหนื่อยมาก — ควรพัก)`;
      const hitDiceState = `${c.hitDiceLeft || 0}/${c.level} Hit Dice`;

      const storyContext = `[STORY CONTEXT:
- เควสต์ที่กำลังทำ: ${activeQuests}
- ความสัมพันธ์ NPC: ${npcList}
- ชื่อเสียงกลุ่ม: ${factionList}
- อากาศ: ${c.weather || "ปกติ"} | สภาพแวดล้อม: ${c.environmentEffect || "ปกติ"}
- Exhaustion: Lv.${c.exhaustionLevel || 0}${c.exhaustionLevel ? ` (-${c.exhaustionLevel * 2} ต่อ D20 Test)` : ""}
- พักผ่อน: ${restState} | ${hitDiceState}
- วันที่ ${gameTimeToString(worldClockToLegacy(getWorldClock()))}]${recentEvents}
`;

      const status = `[สถานะ: HP ${c.hp}/${c.maxHp}, AC ${c.ac}, Level ${c.level}, ทอง ${c.gold} gp, สถานที่: ${scene || "?"}, ตำแหน่งบนแผนที่: ${mapRef.current && mapRef.current.current ? mapRef.current.current : "-"}, สถานที่ที่รู้จัก: ${knownPlaces}, สภาวะ: ${c.conditions.join(",") || "-"}, buffs: ${(c.buffs || []).map((b:any)=>b.name).join(",") || "-"}, ไอเทมในเป้: ${c.inventory.join(", ") || "-"}${CLASSES[c.cls].caster ? `, spell slots: ${c.slots.join("/")}` : ""}]`;

      // === Domain 36: Auto-detect dungeon context — DM ต้องเป็นคนตัดสินใจ ===
      let dungeonHint = "";
      const currentMapNode = mapRef.current && mapRef.current.current ? mapRef.current.nodes?.[mapRef.current.current] : null;
      const isAtDungeonEntrance = currentMapNode?.type === "dungeon";
      if (dungeonBlueprintRef.current && dungeonRunRef.current) {
        // Player is inside a dungeon — show full state to DM
        const bp = dungeonBlueprintRef.current;
        const run = dungeonRunRef.current;
        const currentRoom = bp.rooms.find((r) => r.id === run.currentRoomId);
        const visibleExits = bp.connections
          .filter((c2: RoomConnection) => c2.from === run.currentRoomId || c2.to === run.currentRoomId)
          .filter((c2: RoomConnection) => !c2.isSecret || run.discoveredSecretConnectionIds.includes(c2.id))
          .map((c2: RoomConnection) => {
            const destId = c2.from === run.currentRoomId ? c2.to : c2.from;
            const destRoom = bp.rooms.find((r) => r.id === destId);
            return `${c2.direction}→${destRoom?.name || "?"}${c2.isLocked ? "🔒" : ""}${c2.isSecret ? "(secret)" : ""}`;
          }).join(", ");
        dungeonHint = `\n[🏰 DUNGEON CONTEXT: อยู่ในดันเจี้ยน "${bp.name}" (theme: ${bp.theme}) — ห้องปัจจุบัน: ${currentRoom?.name || "?"} [${currentRoom ? getRoomRoleLabel(currentRoom.role) : "?"}] — progress ${run.roomsCleared}/${run.totalRooms} ห้อง cleared · boss ${run.bossDefeated ? "defeated ✓" : run.hasReachedBoss ? "encountered" : "not yet"} · secrets ${run.secretsFound}/${run.totalSecrets} — ทางออก: ${visibleExits || "ไม่มี"} — ผู้เล่นอยู่ในดันเจี้ยนแล้ว ห้ามส่ง dungeon_enter ซ้ำ ใช้ dungeon_room_move ถ้าผู้เล่นจะย้ายห้อง หรือ dungeon_exit ถ้าผู้เล่นออกจากดันเจี้ยน]`;
      } else if (isAtDungeonEntrance && /เข้า|ใน|enter|inside|สำรวจ|investigate|ไปดันเจี|ไปถ้ำ|ไปปราสาท|ไปหอ|ไปวัด/i.test(text)) {
        // Player is AT a dungeon-type world map node AND expressing intent to enter
        // → DM MUST create dungeon blueprint automatically using dungeon_enter
        dungeonHint = `\n[🏰 DUNGEON ENTER REQUIRED: ผู้เล่นอยู่ที่ dungeon entrance "${currentMapNode.name}" บน world map และต้องการเข้าสำรวจ — DM ต้องส่ง dungeon_enter field ใน response นี้เพื่อสร้าง blueprint ทั้งหมด (5-8 ห้อง ตาม 5-Room pattern) ครั้งเดียว — ใช้รูปแบบสั้น { theme: "...", id: "...", name: "...", hook: "..." } engine จะ procedural generate ให้อัตโนมัติ — เลือก theme ตามบรรยากาศ (crypt/cave/wizard_tower/abandoned_mine/ancient_temple/sewer/ruined_castle/forest_shrine/underwater/fiendish/generic) — ห้ามให้ผู้เล่นเลือก theme เอง DM เป็นคนตัดสินใจ]`;
      } else if (isAtDungeonEntrance) {
        // Player is at dungeon entrance but hasn't expressed intent to enter yet — soft hint
        dungeonHint = `\n[🏰 DUNGEON NEARBY: ผู้เล่นอยู่ที่ dungeon entrance "${currentMapNode.name}" — ถ้าผู้เล่นบอกว่าจะเข้า ให้ใช้ dungeon_enter สร้าง blueprint ทันที]`;
      }

      let hist = [...history, { role: "user", content: `${sceneAnchor}${storyContext}${status}${intentHint}${dungeonHint}\nPlayer: ${text}` }];
      let res = await callDM(buildSystemPrompt(c, getPacingForPrompt()), hist);
      hist = [...hist, { role: "assistant", content: JSON.stringify(res) }];

      let entries = [entryNarration(res.narration)];
      logValidationWarnings(res, entries);
      let cc = applyUpdates(res.updates, c, entries);

      // === Narrative Pacing: track scene type + tension ===
      let sc = res.scene || scene;
      if (narrativeEngine) {
        const sceneType = (res.updates?.scene_type || cc.sceneType || "exploration") as any;
        const tension = res.start_combat ? "high" as const : cc.conditions?.length > 0 ? "medium" as const : "low" as const;
        const sceneObj = createScene({
          id: `scene_${Date.now()}`,
          arcId: narrativeEngine.arc.id,
          type: sceneType,
          title: sc || "Exploration",
          description: res.narration.slice(0, 100),
          locationId: mapRef.current?.current || "unknown",
          tension,
        });
        let updatedEngine = enterScene(narrativeEngine, sceneObj);
        updatedEngine = completeScene(updatedEngine, "success");
        setNarrativeEngine(updatedEngine);
        // Log pacing notes if any
        if (updatedEngine.pacing.pacingNotes.length > 0) {
          entries.push(entrySystem(`📖 DM Pacing: ${updatedEngine.pacing.pacingNotes.join(" · ")}`));
        }
      }
      let cb: any = null;
      // Process world_map (rare, but possible if DM expands the world) then map_update
      let mp = applyWorldMap(res.world_map, mapRef.current, (t) => entries.push(entrySystem(t)));
      mp = applyMapUpdate(res.map_update, mp, (t) => entries.push(entrySystem(t)));
      // Domain 36: apply dungeon updates (enter/room_move/exit)
      applyDungeonUpdates(res, entries);
      // Auto-trigger staged encounter if pending (from new room entry)
      if (pendingRoomEncounter && !res.start_combat && !res.requires) {
        cb = await initCombat(pendingRoomEncounter.monsterIds, cc, entries, pendingRoomEncounter.surprise);
        if (pendingRoomEncounter.isBoss) {
          entries.push(entrySystem(`💀 บอสลา! ระวัง lair actions`));
        }
        setPendingRoomEncounter(null);
      }
      // Mark current as visited on relocation
      if (mp && mp.current && mp.nodes[mp.current]) mp.nodes[mp.current].visited = true;

      if (res.requires && !res.start_combat) {
        const rq = res.requires;
        let rollEntry: any, resultText: string = "";
        if (rq.type === "check" && SKILLS[rq.skill]) {
          let adv: "none" | "advantage" | "disadvantage" = rq.advantage || "none";
          if (rq.skill === "stealth" && wornHas(cc, "adv_stealth") && adv !== "advantage") adv = "advantage";
          if (hasCheckDisadv(cc)) adv = adv === "advantage" ? "none" : "disadvantage";
          const r = rollD20(skillMod(cc, rq.skill), adv);
          const ok = r.total >= rq.dc;
          rollEntry = { id: nextId(), type: "roll", title: `${SKILLS[rq.skill].th} check`, roll: r, dc: rq.dc, success: ok };
          resultText = `[ผลทอย] ${rq.skill} check: ทอยได้ ${r.total} vs DC ${rq.dc} → ${ok ? "สำเร็จ" : "ล้มเหลว"}${r.die === 20 ? " (Nat 20!)" : r.die === 1 ? " (Nat 1!)" : ""}. บรรยายผลต่อ`;
        } else if (rq.type === "save") {
          const svAdv: "none" | "disadvantage" = rq.ability === "dex" && cc.conditions.includes("restrained") ? "disadvantage" : "none";
          const r = rollD20(saveMod(cc, rq.ability), svAdv);
          const ok = r.total >= rq.dc;
          let extra: string | null = null;
          if (rq.on_fail_damage) {
            const dr = rollFormula(rq.on_fail_damage);
            const rawDmg = ok ? (rq.half_on_success ? Math.floor(dr.total / 2) : 0) : dr.total;
            // Sanity-cap LLM-authored dice-formula damage by the same bound as hp_delta —
            // a bad/huge formula (e.g. "50d6") must not exceed the engine's HP delta cap.
            const dmg = Math.min(rawDmg, HP_DELTA_CAP);
            if (dmg > 0) { cc = { ...cc, hp: Math.max(0, cc.hp - dmg) }; extra = `ดาเมจ ${dmg}${rawDmg > dmg ? ` (ตัดจาก ${rawDmg} ตาม cap)` : ""} → HP ${cc.hp}/${cc.maxHp}`; }
          }
          rollEntry = { id: nextId(), type: "roll", title: `${ABIL_TH[rq.ability]} saving throw`, roll: r, dc: rq.dc, success: ok, extra };
          resultText = `[ผลทอย] ${rq.ability} save: ${r.total} vs DC ${rq.dc} → ${ok ? "สำเร็จ" : "ล้มเหลว"}${extra ? " " + extra : ""}. บรรยายผลต่อ`;
        }
        if (rollEntry) {
          entries.push(rollEntry);
          setLog([...baseLog, ...entries]);
          hist = [...hist, { role: "user", content: resultText }];
          const res2 = await callDM(buildSystemPrompt(cc, getPacingForPrompt()), hist);
          hist = [...hist, { role: "assistant", content: JSON.stringify(res2) }];
          entries.push(entryNarration(res2.narration));
          cc = applyUpdates(res2.updates, cc, entries);
          sc = res2.scene || sc;
          mp = applyWorldMap(res2.world_map, mp, (t) => entries.push(entrySystem(t)));
          mp = applyMapUpdate(res2.map_update, mp, (t) => entries.push(entrySystem(t)));
          applyDungeonUpdates(res2, entries);
          if (mp && mp.current && mp.nodes[mp.current]) mp.nodes[mp.current].visited = true;
          if (res2.start_combat && res2.start_combat.monsters) cb = await initCombat(res2.start_combat.monsters, cc, entries, res2.start_combat.surprise);
        }
      }
      if (!cb && res.start_combat) {
        // Normalize: DM sometimes sends `true` (boolean) instead of { monsters: [...] }
        // Auto-recover by detecting combat intent from narration keywords
        let combatMonsters: string[] | null = null;
        let combatSurprise = false;
        if (res.start_combat.monsters && Array.isArray(res.start_combat.monsters)) {
          combatMonsters = res.start_combat.monsters;
          combatSurprise = !!res.start_combat.surprise;
        } else if (res.start_combat === true || (typeof res.start_combat === "object" && !res.start_combat.monsters)) {
          // Try to detect monster names from narration (best-effort recovery)
          // Include BOTH English (kebab-case monster ids) AND Thai common names
          const narrationLower = (res.narration || "").toLowerCase();
          // Map: Thai name → SRD/Open5e monster id (kebab-case)
          const thaiMonsterMap: Record<string, string> = {
            "ก็อบลิน": "goblin", "กอบลิน": "goblin",
            "หมาป่า": "wolf", "wolf": "wolf",
            "โคบอลด์": "kobold", "kobold": "kobold",
            "โจร": "bandit", "bandit": "bandit",
            "โครงกระดูก": "skeleton", "skeleton": "skeleton",
            "ซอมบี้": "zombie", "zombie": "zombie", "ศพเดินได้": "zombie",
            "ออร์ค": "orc", "orc": "orc",
            "กุล": "ghoul", "ghoul": "ghoul",
            "แมงมุม": "giant-spider", "spider": "giant-spider",
            "หมี": "brown-bear", "bear": "brown-bear",
            "หนู": "rat", "rat": "rat",
            "อันธพาล": "thug", "thug": "thug",
            "อัศวิน": "knight", "knight": "knight",
            "ทหารผ่านศึก": "veteran", "veteran": "veteran",
            "ผี": "ghost", "ghost": "ghost",
            "ปีศาจ": "imp", "imp": "imp",
            "มังกร": "young-red-dragon",
            "โอเกอร์": "ogre", "ogre": "ogre",
            "ทรอลล์": "troll", "troll": "troll",
            "ฮาร์ปี้": "harpy", "harpy": "harpy",
            "แวมไพร์": "vampire-spawn",
            "ลิช": "lich", "lich": "lich",
            "มนุษย์กิ้งก่า": "lizardfolk",
            "เงา": "shadow", "shadow": "shadow",
          };
          const detected: string[] = [];
          // Check Thai keys (narration might be Thai)
          for (const [thaiName, monsterId] of Object.entries(thaiMonsterMap)) {
            if (res.narration.includes(thaiName) && !detected.includes(monsterId)) {
              detected.push(monsterId);
            }
          }
          // Also check English keys in lowercased narration (already covers via thaiMonsterMap above for english keys)
          if (detected.length > 0) {
            combatMonsters = detected.slice(0, 3); // limit to 3
            entries.push(entrySystem(`⚠️ DM ส่ง start_combat ไม่ครบ — engine ตรวจพบมอนสเตอร์จาก narration: ${detected.join(", ")}`));
          }
        }
        if (combatMonsters && combatMonsters.length > 0) {
          cb = await initCombat(combatMonsters, cc, entries, combatSurprise);
        }
      }

      if (cb && !cb.playerFirst) { cc = enemyAttacks(cb, cc, entries); cb.round += 1; }

      if (cc.hp <= 0 && !cb) cc = { ...cc, hp: 1 };

      const finalLog = [...baseLog, ...entries];
      // Smart history trimming — keep first 2 (world map setup) + last 22 + summary of middle
      let trimmedHist = hist;
      if (hist.length > 26) {
        const first2 = hist.slice(0, 2);
        const last22 = hist.slice(-22);
        // Build summary of skipped messages
        const skipped = hist.slice(2, -22);
        const skipSummary = skipped.map((h: any) => {
          if (h.role === "user") {
            const playerMatch = h.content.match(/Player:\s*(.+)/);
            return playerMatch ? `ผู้เล่น: "${playerMatch[1].slice(0, 80)}"` : "";
          } else if (h.role === "assistant") {
            try {
              const j = JSON.parse(h.content);
              return `DM: ${j.narration?.slice(0, 80) || ""}${j.start_combat ? " [combat]" : ""}`;
            } catch { return ""; }
          }
          return "";
        }).filter(Boolean).join(" → ");
        const summaryEntry = { role: "user" as const, content: `[SUMMARY OF PAST EVENTS: ${skipSummary}]` };
        trimmedHist = [...first2, summaryEntry, ...last22];
      }
      mapRef.current = mp;
      setC(cc); setScene(sc); setCombat(cb); setLog(finalLog); setHistory(trimmedHist); setMap(mp);
      persist(cc, sc, finalLog, cb, trimmedHist);
    } catch (e: any) {
      setLog((prev) => [...prev, entrySystem("⚠️ DM ขัดข้อง: " + e.message + " — ลองส่งใหม่อีกครั้ง")]);
    } finally {
      setThinking(false);
    }
  }

  async function longRest() {
    if (thinking || combat) return;
    // D&D 2024: must wait at least 16 hours between Long Rests
    const lastRest = c.lastLongRestHoursAgo ?? 99;
    if (lastRest < 16) {
      setLog((prev) => [...prev, entrySystem(`⏳ ยังพักยาวไม่ได้ — D&D 2024: ต้องรออย่างน้อย 16 ชม. หลัง Long Rest ครั้งก่อน (ผ่านไป ${lastRest} ชม. แล้ว)`)]);
      return;
    }
    const recovered = Math.max(1, Math.floor(c.level / 2));
    // Advance time by 8 hours via WorldClock adapter
    const newTime = engineAdvanceHours(8);
    const cc = {
      ...c, hp: c.maxHp, slots: c.slotsMax.slice(), secondWindUsed: false, conditions: [],
      actionSurgeUsed: false, preserveLifeUsed: false, arcaneRecoveryUsed: false, venomUsed: false,
      deathSaves: { s: 0, f: 0 },
      hitDiceLeft: c.level, // D&D 2024: recover ALL hit dice on long rest
      rageUsed: 0, kiUsed: 0, sorceryPoints: c.level, layOnHandsPool: c.level * 5, bardicInspirationUsed: 0,
      raging: false, mageArmor: false,
      buffs: [], // clear all buffs on long rest
      lastLongRestHoursAgo: 0, // reset rest timer
      lastShortRestHoursAgo: 0,
      exhaustionLevel: Math.max(0, (c.exhaustionLevel || 0) - 1), // D&D 2024: reduce exhaustion by 1
      heroicInspiration: true, // D&D 2024: Heroic Inspiration — refresh on long rest
    };
    cc.ac = computeAC(cc);
    const entries = [
      entrySystem(`🌙 พักยาว (8 ชม.): HP เต็ม, spell slots คืน, สภาวะ/buff หายหมด, Hit Dice คืนทั้งหมด (${cc.hitDiceLeft}/${c.level})${cc.exhaustionLevel < (c.exhaustionLevel || 0) ? `, Exhaustion ลดเหลือ Lv.${cc.exhaustionLevel}` : ""}`),
      entrySystem(`⏰ เวลาผ่านไป 8 ชม. → ${gameTimeToString(newTime)}`),
    ];
    setGameTime(newTime);
    const baseLog = [...log, ...entries];
    setC(cc); setLog(baseLog);
    persist(cc, scene, baseLog, combat, history);
    narrateCombatEvent(`[Long Rest] ${cc.name} พักผ่อนเต็มคืนและตื่นขึ้นมาในตอนเช้า — รู้สึกสดชื่น HP เต็ม spell slots คืนทั้งหมด บรรยายเช้าวันใหม่สั้นๆ อย่าแนะนำให้พักอีกเพราะเพิ่งตื่นนอนมาใหม่`, cc, scene, baseLog, history);
  }

  function applyAsi() {
    if (asiPicks.length !== 2 || !c || !c.pendingAsi) return;
    const cc = { ...c, abilities: { ...c.abilities } };
    const oldConMod = mod(cc.abilities.con);
    asiPicks.forEach((a) => { cc.abilities[a] = Math.min(20, cc.abilities[a] + 1); });
    const newConMod = mod(cc.abilities.con);
    const entries = [entrySystem(`💪 Ability Score Improvement: ${asiPicks.map((a) => ABIL_TH[a] + " +1").join(", ")}`)];
    if (newConMod > oldConMod) {
      const diff = (newConMod - oldConMod) * cc.level;
      cc.maxHp += diff; cc.hp += diff;
      entries.push(entrySystem(`❤️ CON modifier increased → Max HP +${diff} (retroactive)`));
    }
    const oldAc = cc.ac;
    cc.ac = computeAC(cc);
    if (cc.ac !== oldAc) entries.push(entrySystem(`🛡 AC changed ${oldAc} → ${cc.ac}`));
    cc.pendingAsi -= 1;
    const finalLog = [...log, ...entries];
    setC(cc); setLog(finalLog); setAsiPicks([]);
    persist(cc, scene, finalLog, combat, history);
  }

  function shortRest() {
    if (thinking || combat) return;
    if ((c.hitDiceLeft || 0) <= 0) {
      setLog((prev) => [...prev, entrySystem("⛺ ไม่มี Hit Dice เหลือ — ต้องพักยาวเพื่อฟื้นคืน")]);
      return;
    }
    const cls = CLASSES[c.cls];
    const r = rollFormula(`1d${cls.hitDie}`);
    const heal = Math.max(1, r.total + mod(c.abilities.con));
    const cc: any = {
      ...c,
      hp: Math.min(c.maxHp, c.hp + heal),
      hitDiceLeft: c.hitDiceLeft - 1,
      secondWindUsed: false,
      actionSurgeUsed: false,
      preserveLifeUsed: false,
      raging: false,
      lastShortRestHoursAgo: 0, // reset short rest timer
    };
    const entries = [entrySystem(`⛺ พักสั้น (1 ชม.): ทอย Hit Die d${cls.hitDie}=${r.total} → ฟื้น ${heal} HP → ${cc.hp}/${cc.maxHp} · Hit Dice เหลือ ${cc.hitDiceLeft}/${c.level}`)];
    // Advance time by 1 hour via WorldClock adapter
    const newTime = engineAdvanceHours(1);
    setGameTime(newTime);
    entries.push(entrySystem(`⏰ เวลาผ่านไป 1 ชม. → ${gameTimeToString(newTime)}`));
    if (hasFeature(cc, "arcane_recovery") && !cc.arcaneRecoveryUsed && cc.slots.some((v: number, i: number) => v < cc.slotsMax[i])) {
      let budget = Math.ceil(cc.level / 2);
      cc.slots = cc.slots.slice();
      const recovered: string[] = [];
      for (let li = cc.slots.length - 1; li >= 0; li--) {
        const slotLv = li + 1;
        while (budget >= slotLv && cc.slots[li] < cc.slotsMax[li]) {
          cc.slots[li] += 1; budget -= slotLv; recovered.push(`Lv${slotLv}`);
        }
      }
      if (recovered.length > 0) {
        cc.arcaneRecoveryUsed = true;
        entries.push(entrySystem(`📖 Arcane Recovery: คืน spell slot ${recovered.join(", ")}`));
      }
    }
    // Reset death saves (player is at rest, stable)
    if (cc.hp > 0) cc.deathSaves = { s: 0, f: 0 };
    // Phase 2: Warlock Pact Magic refreshes on short rest (D&D 2024)
    if (refreshesOnShortRest(cc.cls) && cc.slotsMax && cc.slotsMax.length > 0) {
      cc.slots = cc.slotsMax.slice();
      entries.push(entrySystem(`🔮 Pact Magic: คืน spell slot ทั้งหมด (short rest refresh)`));
    }
    const finalLog = [...log, ...entries];
    setC(cc); setLog(finalLog);
    persist(cc, scene, finalLog, null, history);
  }

  /* -------- spellbook management -------- */
  async function openSpellBrowser() {
    setSpellBrowserOpen(true);
    setSpellBrowserLoading(true);
    try {
      const cls = CLASSES[c.cls];
      const maxLv = maxSpellLevel(c.cls, c.level);
      const all: { index: string; name: string; level: number }[] = [];
      for (let lv = 0; lv <= maxLv; lv++) {
        const indices = await getClassSpellIndices(cls.th.toLowerCase(), lv);
        for (const idx of indices) {
          // pretty-name from index
          const name = idx.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          all.push({ index: idx, name, level: lv });
        }
      }
      all.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
      setAvailableSpells(all);
    } catch (e: any) {
      setLog((prev) => [...prev, entrySystem("⚠️ Could not load spell list: " + e.message)]);
    } finally { setSpellBrowserLoading(false); }
  }

  async function viewSpellDetail(index: string) {
    setSpellDetailLoading(true);
    setSpellDetail(null);
    try {
      const sp = await fetchSpell(index, 1, c.level);
      setSpellDetail(sp);
    } catch (e: any) {
      setLog((prev) => [...prev, entrySystem("⚠️ Could not load spell: " + e.message)]);
    } finally { setSpellDetailLoading(false); }
  }

  function learnSpell(index: string) {
    if ((c.knownSpells || []).includes(index)) return;
    const cc = { ...c, knownSpells: [...(c.knownSpells || []), index] };
    const entries = [entrySystem(`📖 Learned spell: ${index.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}`)];
    const finalLog = [...log, ...entries];
    setC(cc); setLog(finalLog);
    persist(cc, scene, finalLog, combat, history);
  }

  /* -------- new game flow -------- */
  // Quick-start with a pre-made character
  async function quickStart(cls: string) {
    const presets: Record<string, { name: string; race: string; bg: string; abilities: any; skills: string[]; expertise?: string[]; spells?: string[] }> = {
      fighter: { name: "Thorin", race: "dwarf", bg: "soldier", abilities: { str: 16, dex: 12, con: 15, int: 10, wis: 10, cha: 10 }, skills: ["athletics", "intimidation", "perception"] },
      rogue: { name: "Sylas", race: "halfling", bg: "criminal", abilities: { str: 8, dex: 16, con: 13, int: 12, wis: 10, cha: 12 }, skills: ["stealth", "perception", "investigation", "acrobatics"], expertise: ["stealth"] },
      wizard: { name: "Elara", race: "elf", bg: "sage", abilities: { str: 8, dex: 14, con: 13, int: 16, wis: 12, cha: 10 }, skills: ["arcana", "investigation", "perception"], spells: ["fire-bolt", "mage-armor", "magic-missile", "shield"] },
    };
    const p = presets[cls];
    if (!p) return;
    const cc = makeCharacter(p.name, p.race, cls, p.bg, {
      abilities: p.abilities,
      extraSkills: p.skills,
      expertise: p.expertise || [],
      knownSpells: p.spells || [],
    });
    cRef.current = cc; combatRef.current = null;
    const arc = createStoryArc({
      id: `arc_${Date.now()}`, title: `Campaign of ${cc.name}`,
      description: `${RACES[p.race].th} ${CLASSES[cls].th} adventure`, themes: ["adventure", "discovery"],
    });
    setNarrativeEngine({ arc, currentScene: null, sceneHistory: [], branches: { branches: {}, activeBranches: new Set(), completedBranches: new Set(), flags: {} }, consequences: { consequences: [], pendingDelayed: [] }, pacing: { currentTension: "calm", recentTensions: [], recommendedNextTension: "low", scenesSinceRest: 0, scenesSinceCombat: 0, scenesSinceRevelation: 0, pacingNotes: [] }, foreshadows: { items: {} }, themes: { themes: { adventure: { occurrences: 0, intensity: 0.5 }, discovery: { occurrences: 0, intensity: 0.5 } } } } as NarrativeEngine);
    setC(cc); setScene(""); setLog([]); setCombat(null); setHistory([]); setMap(null);
    setPhase("play");
    // Show onboarding on first play
    if (!localStorage.getItem("dnd_solo_onboarded")) {
      setOnboardStep(0);
      localStorage.setItem("dnd_solo_onboarded", "1");
    }
    setThinking(true);
    try {
      const hist = [{ role: "user", content: `[เริ่มแคมเปญใหม่] สร้างฉากเปิดที่น่าติดตามสำหรับ ${cc.name} (${RACES[p.race].th} ${CLASSES[cls].th} level 1, ภูมิหลัง ${BACKGROUNDS[p.bg].th}). เริ่มในเมืองเล็กหรือโรงเตี๊ยมพร้อม hook ภารกิจแรก ทำให้ภูมิหลังมีผลกับฉากเปิด\n\nสำคัญมาก: ต้องใช้ฟิลด์ "world_map" ใน response แรกนี้เพื่อสร้างแผนที่โลกที่สมบูรณ์ — เมืองเริ่มต้นเป็น hub + สถานที่รอบๆ 3-5 แห่ง (ร้านค้า, โรงเตี๊ยม, วัด) + พื้นที่ป่า/ถนน 2-3 แห่ง + ดันเจี้ยน/ซากปรักหักพัง/ถ้ำ 2-3 แห่ง เชื่อมด้วยทิศ (n/s/e/w/ne/nw/se/sw) ใช้ id snake_case ภาษาอังกฤษคงที่ ผู้เล่นจะเห็นสถานที่ทั้งหมดบนแผนที่ (มี fog-of-war สำหรับที่ยังไม่ไป)` }];
      const res = await callDM(buildSystemPrompt(cc, getPacingForPrompt()), hist);
      let entries: any[] = [entryNarration(res.narration)];
      logValidationWarnings(res, entries);
      let nc = applyUpdates(res.updates, cc, entries);
      let sc = res.scene || "";
      let mp = applyWorldMap(res.world_map, null, (t) => entries.push(entrySystem(t)));
      mp = applyMapUpdate(res.map_update, mp, (t) => entries.push(entrySystem(t)));
      applyDungeonUpdates(res, entries);
      if (mp && mp.current && mp.nodes[mp.current]) mp.nodes[mp.current].visited = true;
      mapRef.current = mp;
      let ncb: any = null;
      if (res.start_combat && res.start_combat.monsters) {
        ncb = await initCombat(res.start_combat.monsters, nc, entries, res.start_combat.surprise);
      }
      const finalHist = [...hist, { role: "assistant", content: JSON.stringify(res) }];
      const finalLog = [...entries];
      if (ncb && !ncb.playerFirst) { nc = enemyAttacks(ncb, nc, finalLog); ncb.round += 1; }
      setC(nc); setScene(sc); setLog(finalLog); setCombat(ncb); setHistory(finalHist); setMap(mp);
      persist(nc, sc, finalLog, ncb, finalHist);
    } catch (e: any) {
      setLog([entrySystem("⚠️ DM ขัดข้อง: " + e.message + " — ลองส่งใหม่อีกครั้ง")]);
    } finally { setThinking(false); }
  }

  async function startNewGame() {
    if (!ccName.trim()) return;
    // Build bgAsi array from ccBgAsiPlus2 + ccBgAsiPlus1
    // If user didn't pick, use background defaults
    let bgAsi: string[] = [];
    if (ccBgAsiPlus2 && ccBgAsiPlus1) {
      // +2/+1 → same ability twice + 1 other
      bgAsi = [ccBgAsiPlus2, ccBgAsiPlus2, ccBgAsiPlus1];
    } else if (ccBgAsiPlus2) {
      bgAsi = [ccBgAsiPlus2, ccBgAsiPlus2];
    } else {
      // Fallback: use background defaults from BACKGROUNDS[bg].asi
      const bgDef = BACKGROUNDS[ccBg];
      if (bgDef?.asi?.primary && bgDef?.asi?.secondary) {
        // primary[0] gets +2, secondary[0] gets +1
        bgAsi = [bgDef.asi.primary[0], bgDef.asi.primary[0], bgDef.asi.secondary[0]];
      }
    }
    const cc = makeCharacter(ccName.trim(), ccRace, ccClass, ccBg, {
      abilities: ccAbilityScores,
      extraSkills: ccPickedSkills.filter(s => !BACKGROUNDS[ccBg].skills.includes(s)),
      expertise: ccExpertise,
      equipment: ccPickedEquipment,
      knownSpells: ccPickedSpells,
      details: ccDetails,
      alignment: ccAlignment,
      languages: ccLanguages,
      bgAsi,
    });
    // Reset creation state for next time
    setCcStep(0); setCcPickedSkills([]); setCcExpertise([]); setCcPickedEquipment([]); setCcPickedSpells([]);
    cRef.current = cc; combatRef.current = null;
    // AI DM Layer: initialize narrative engine for this campaign (Domain 33)
    const arc = createStoryArc({
      id: `arc_${Date.now()}`,
      title: `Campaign of ${cc.name}`,
      description: `${RACES[ccRace].th} ${CLASSES[ccClass].th} adventure`,
      themes: ["adventure", "discovery"],
      estimatedLength: 20,
    });
    setNarrativeEngine({ arc, currentScene: null, sceneHistory: [], branches: { branches: {}, activeBranches: new Set(), completedBranches: new Set(), flags: {} }, consequences: { consequences: [], pendingDelayed: [] }, pacing: { currentTension: "calm", recentTensions: [], recommendedNextTension: "low", scenesSinceRest: 0, scenesSinceCombat: 0, scenesSinceRevelation: 0, pacingNotes: [] }, foreshadows: { items: {} }, themes: { themes: { adventure: { occurrences: 0, intensity: 0.5 }, discovery: { occurrences: 0, intensity: 0.5 } } } });
    const entries = [entrySystem(`สร้างตัวละคร: ${cc.name} — ${RACES[ccRace].th} ${CLASSES[ccClass].th} (${BACKGROUNDS[ccBg].th}) · HP ${cc.hp} · AC ${cc.ac}`)];
    setC(cc); setLog(entries); setCombat(null); setScene(""); setHistory([]);
    setPhase("play");
    setThinking(true);
    try {
      const hist = [{ role: "user", content: `[เริ่มแคมเปญใหม่] สร้างฉากเปิดที่น่าติดตามสำหรับ ${cc.name} (${RACES[ccRace].th} ${CLASSES[ccClass].th} level 1, ภูมิหลัง ${BACKGROUNDS[ccBg].th}). เริ่มในเมืองเล็กหรือโรงเตี๊ยมพร้อม hook ภารกิจแรก ทำให้ภูมิหลังมีผลกับฉากเปิด\n\nสำคัญมาก: ต้องใช้ฟิลด์ "world_map" ใน response แรกนี้เพื่อสร้างแผนที่โลกที่สมบูรณ์ — เมืองเริ่มต้นเป็น hub + สถานที่รอบๆ 3-5 แห่ง (ร้านค้า, โรงเตี๊ยม, วัด) + พื้นที่ป่า/ถนน 2-3 แห่ง + ดันเจี้ยน/ซากปรักหักพัง 2-3 แห่ง เชื่อมด้วยทิศ (n/s/e/w/ne/nw/se/sw) ใช้ id snake_case ภาษาอังกฤษคงที่ ผู้เล่นจะเห็นสถานที่ทั้งหมดบนแผนที่ (มี fog-of-war สำหรับที่ยังไม่ไป)` }];
      const res = await callDM(buildSystemPrompt(cc, getPacingForPrompt()), hist);
      const newHist = [...hist, { role: "assistant", content: JSON.stringify(res) }];
      const e2 = [...entries, entryNarration(res.narration)];
      const sc = res.scene || "จุดเริ่มต้น";
      // Process world_map first (full world pre-generation), then any single map_update
      let mp = applyWorldMap(res.world_map, null, (t) => e2.push(entrySystem(t)));
      mp = applyMapUpdate(res.map_update, mp, (t) => e2.push(entrySystem(t)));
      applyDungeonUpdates(res, e2);
      if (!mp || !mp.current) {
        mp = emptyMap();
        mp.nodes.start = { name: sc, type: "town", x: 0, y: 0, visited: true };
        mp.current = "start";
      }
      // Mark current as visited
      if (mp.current && mp.nodes[mp.current]) mp.nodes[mp.current].visited = true;
      mapRef.current = mp;
      // Apply updates (items, conditions, buffs)
      let finalCc = cc;
      if (res.updates) finalCc = applyUpdates(res.updates, cc, e2);
      setLog(e2); setScene(sc); setHistory(newHist); setMap(mp); setC(finalCc);
      persist(finalCc, sc, e2, null, newHist);
      setHasSave(true);
    } catch (e: any) {
      setLog((prev) => [...prev, entrySystem("⚠️ เริ่มแคมเปญไม่สำเร็จ: " + e.message)]);
    } finally { setThinking(false); }
  }

  async function continueGame() {
    const save = await loadGame();
    if (!save) return;
    const cc = save.c ? migrateChar(save.c) : null;
    const mp = save.map || null;
    mapRef.current = mp;
    cRef.current = cc; combatRef.current = save.combat || null; logDataRef.current = save.log || [];
    // Restore dungeon blueprint + run state (Domain 36)
    const loadedBlueprint = (save as any).dungeonBlueprint || null;
    const loadedRun = (save as any).dungeonRun || null;
    dungeonBlueprintRef.current = loadedBlueprint;
    dungeonRunRef.current = loadedRun;
    setDungeonBlueprint(loadedBlueprint);
    setDungeonRun(loadedRun);
    if (save.quests) setQuests(save.quests);
    setC(cc); setScene(save.scene); setLog(save.log || []); setCombat(save.combat || null); setHistory(save.history || []); setMap(mp);
    idRef.current = Math.max(0, ...(save.log || []).map((e: any) => e.id || 0));
    setPhase(cc && cc.dead ? "dead" : "play");
  }

  async function resetAll() {
    await deleteSave();
    mapRef.current = null;
    cRef.current = null; combatRef.current = null; logDataRef.current = [];
    dungeonBlueprintRef.current = null;
    dungeonRunRef.current = null;
    setHasSave(false); setC(null); setLog([]); setCombat(null); setHistory([]); setScene(""); setMap(null);
    setDungeonBlueprint(null); setDungeonRun(null);
    setPhase("menu");
  }

  /* ---------------- RENDER ---------------- */
  if (phase === "loading") {
    return (<div className="dnd-root"><div style={{ margin: "auto", color: "#8A7F9E" }}>Loading...</div></div>);
  }

  if (phase === "menu") {
    return (
      <div className="dnd-root">

        <div style={{ margin: "auto", textAlign: "center", padding: 24, maxWidth: 480, width: "100%" }}>
          <div className="dnd-display" style={{ fontSize: 15, color: "#E0A83E" }}>แคมเปญเดี่ยว · 2024 SRD</div>
          <h1 className="dnd-display" style={{ fontSize: 40, margin: "6px 0 4px", color: "#EAE0CC" }}>D&amp;D 5e</h1>
          <div style={{ color: "#8A7F9E", fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
            AI เป็น DM · engine บังคับกฎ RAW<br/>
            <span style={{ color: "#B9A96A" }}>12 คลาส · 9+ เผ่าพันธุ์ · 1,955 เวทมนตร์ · 3,541+ มอนสเตอร์ · 2,319 magic items · 15 สภาวะ</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {hasSave && <button className="btn btn-gold" style={{ padding: 14 }} onClick={continueGame}>▶ เล่นต่อจากเซฟ</button>}
            <button className="btn" style={{ padding: 14 }} onClick={() => setPhase("create")}>✦ เริ่มแคมเปญใหม่</button>
            {/* Quick-start sample characters */}
            <div style={{ borderTop: "1px solid #3A3054", paddingTop: 12, marginTop: 4 }}>
              <div style={{ fontSize: 11, color: "#8A7F9E", marginBottom: 8 }}>⚡ เริ่มเล่นทันที:</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" style={{ flex: 1, fontSize: 12, padding: 10 }} onClick={() => quickStart("fighter")}>⚔️ นักรบ</button>
                <button className="btn" style={{ flex: 1, fontSize: 12, padding: 10 }} onClick={() => quickStart("rogue")}>🗡️ โจร</button>
                <button className="btn" style={{ flex: 1, fontSize: 12, padding: 10 }} onClick={() => quickStart("wizard")}>🔮 พ่อมด</button>
              </div>
            </div>
            <button className="btn" onClick={async () => {
              const s = await loadGame();
              setIoText(s ? JSON.stringify(s) : "");
              setIoMsg(s ? "เซฟปัจจุบัน — คัดลอกเก็บเป็นสำรอง หรือวางเซฟอื่นทับแล้วกดนำเข้า" : "ยังไม่มีเซฟ — วาง JSON ที่ส่งออกจากเวอร์ชันอื่นแล้วกดนำเข้า");
              setIoOpen(true);
            }}>💾 ส่งออก / นำเข้าเซฟ</button>
            <button className="btn" onClick={async () => {
              const s = await loadGame();
              if (!s) { alert("ยังไม่มีเซฟ — เริ่มเกมใหม่ก่อนแล้วบันทึก"); return; }
              const charName = (s.c?.name || "character").replace(/[^\w\-]+/g, "_");
              const dateStr = new Date().toISOString().slice(0, 10);
              const filename = `dnd_save_${charName}_${dateStr}.json`;
              const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = filename;
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}>⬇️ ดาวน์โหลดเซฟเป็นไฟล์ .json</button>
            {hasSave && <button className="btn btn-red" onClick={resetAll}>ลบเซฟทั้งหมด</button>}
          </div>
          <div style={{ fontSize: 11, marginTop: 16, color: srdStatus === "online" ? "#7FB069" : "#6B6284" }}>
            {srdStatus === "checking" ? "🌐 กำลังเช็ค Open5e API..." : srdStatus === "online" ? "🌐 Open5e v2 (2024 SRD 5.2 + 2014 SRD 5.1): เชื่อมต่อแล้ว — เวทมนตร์ 1,955 + มอนสเตอร์ 3,541 + magic items 2,319" : "🌐 SRD API: เข้าถึงไม่ได้ — ใช้ bestiary ภายในเครื่อง"}
          </div>
          {ioOpen && (
            <div className="sheet-overlay" onClick={() => setIoOpen(false)}>
              <div className="sheet-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
                <div style={{ padding: 16, textAlign: "left" }}>
                  <div className="dnd-display" style={{ fontSize: 17, color: "#E0A83E", marginBottom: 6 }}>💾 ส่งออก / นำเข้าเซฟ</div>
                  <div style={{ fontSize: 12, color: "#8A7F9E", marginBottom: 10 }}>{ioMsg}</div>
                  <textarea
                    value={ioText}
                    onChange={(e) => setIoText(e.target.value)}
                    placeholder='วาง JSON เซฟที่นี่'
                    style={{ width: "100%", boxSizing: "border-box", height: 150, background: "#1B1530", border: "1px solid #4A3F6E", borderRadius: 10, color: "#EAE0CC", padding: 10, fontSize: 11, fontFamily: "monospace", outline: "none", resize: "vertical" }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button className="btn" disabled={!ioText} onClick={async () => {
                      try { await navigator.clipboard.writeText(ioText); setIoMsg("✅ คัดลอกแล้ว"); }
                      catch { setIoMsg("คัดลอกไม่สำเร็จ — เลือกทั้งหมดเอง"); }
                    }}>📋 คัดลอก</button>
                    <button className="btn btn-gold" style={{ flex: 1 }} disabled={!ioText.trim()} onClick={async () => {
                      try {
                        const data = JSON.parse(ioText.trim());
                        if (!data || !data.c || !data.c.name || !CLASSES[data.c.cls]) throw new Error("เซฟไม่ถูกต้อง");
                        data.c = migrateChar(data.c);
                        await saveGame(data);
                        setHasSave(true);
                        setIoMsg(`✅ นำเข้าเซฟของ ${data.c.name} (Lv.${data.c.level}) สำเร็จ`);
                      } catch (e: any) { setIoMsg("⚠️ นำเข้าไม่สำเร็จ: " + e.message); }
                    }}>📥 นำเข้า</button>
                    <button className="btn" onClick={() => setIoOpen(false)}>ปิด</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === "create") {
    const STEPS = [
      "คอนเซ็ปต์", "อาชีพ", "เผ่าพันธุ์", "ภูมิหลัง", "Ability Scores", "สกิล", "อุปกรณ์", "เวทมนตร์", "Alignment", "บุคลิก/ลักษณะ", "ตรวจสอบ"
    ];
    // Step blocks now use these keys instead of raw ccStep numbers — order-agnostic
    const STEP_KEYS = ["concept", "class", "species", "background", "abilities", "skills", "equipment", "spells", "alignment", "details", "review"];
    const stepKey = STEP_KEYS[ccStep] || "concept";
    const cls0 = CLASSES[ccClass];
    const race0 = RACES[ccRace];
    const bg0 = BACKGROUNDS[ccBg];
    const preview = makeCharacter(ccName || "?", ccRace, ccClass, ccBg, {
      abilities: ccAbilityScores,
      extraSkills: ccPickedSkills.filter(s => !bg0.skills.includes(s)),
      expertise: ccExpertise,
      equipment: ccPickedEquipment,
      knownSpells: ccPickedSpells,
    });
    const classSkills = cls0.skills || [];
    const bgSkills = bg0.skills || [];
    const numClassSkillPicks = ccClass === "rogue" ? 4 : 2;
    // D&D 5e/2024: Rogue gets Expertise at Lv.1; Bard at Lv.3; Knowledge Cleric at Lv.1.
    // We're creating a Lv.1 character, so only Rogue (and Knowledge Cleric if subclass chosen) qualifies.
    const canExpertise = ccClass === "rogue";

    // Point Buy helper
    const POINT_BUY_COSTS: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
    const pointBuySpent = ABILS.reduce((sum, a) => sum + (POINT_BUY_COSTS[ccAbilityScores[a]] ?? 0), 0);

    // Roll abilities
    function rollAbilities() {
      const rolled: Record<string, number> = {};
      ABILS.forEach((a) => {
        const rolls = [d(6), d(6), d(6), d(6)].sort((x, y) => y - x);
        rolled[a] = rolls[0] + rolls[1] + rolls[2];
      });
      setCcAbilityScores(rolled);
    }

    return (
      <div className="dnd-root">

        <div style={{ maxWidth: 560, width: "100%", margin: "0 auto", padding: 16 }}>
          {/* Progress bar */}
          <div style={{ display: "flex", gap: 2, marginBottom: 16, overflowX: "auto" }}>
            {STEPS.map((label, i) => (
              <div key={i} style={{
                flex: 1, minWidth: 50, textAlign: "center", padding: "4px 2px", fontSize: 9,
                borderRadius: 4, whiteSpace: "nowrap",
                background: i === ccStep ? "#E0A83E" : i < ccStep ? "#3A2F5C" : "#1E1830",
                color: i === ccStep ? "#1B1530" : i < ccStep ? "#E0A83E" : "#6B6284",
                fontWeight: i === ccStep ? 700 : 400,
              }}>{i + 1}. {label}</div>
            ))}
          </div>

          {/* Step content */}
          <div style={{ minHeight: 280 }}>
            {ccStep === 0 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 1: คอนเซ็ปต์ตัวละคร</h2>
                <div style={{ fontSize: 13, color: "#9C92B8", marginBottom: 14, lineHeight: 1.6 }}>
                  คิดถึงตัวละครของคุณ: เขาเป็นใคร? มาจากไหน? ทำไมถึงออกผจญภัย?<br/>
                  คอนเซ็ปต์จะช่วยเลือกเผ่าพันธุ์ อาชีพ และภูมิหลังในขั้นตอนต่อไป
                </div>
                <input className="input-main" style={{ width: "100%", boxSizing: "border-box", marginBottom: 10 }} placeholder="ชื่อตัวละคร..." value={ccName} onChange={(e) => setCcName(e.target.value)} />
                <div className="panel" style={{ padding: 12, fontSize: 12, color: "#9C92B8", lineHeight: 1.6 }}>
                  <b style={{ color: "#E0A83E" }}>ตัวอย่างคอนเซ็ปต์:</b><br/>
                  • โจรนักฆ่าที่เติบโตในสลัม → Rogue + Criminal<br/>
                  • พาลาดินที่ล่าปีศาจ → Paladin + Soldier<br/>
                  • นักเวทผู้ตามหาความรู้ต้องห้าม → Wizard + Sage<br/>
                  • นักล่าสมบัติในทะเลทราย → Ranger + Outlander
                </div>
              </div>
            )}

            {ccStep === 2 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 3: เลือกเผ่าพันธุ์ (Species)</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>เผ่าพันธุ์กำหนดความเร็ว ขนาด ความสามารถพิเศษ และภาษา</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {Object.entries(RACES).map(([k, r]: any) => (
                    <div key={k} className={"cc-opt" + (ccRace === k ? " sel" : "")} onClick={() => setCcRace(k)} style={{ padding: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{r.th}</div>
                      <div style={{ fontSize: 10, color: "#8A7F9E" }}>{Object.entries(r.bonus).map(([a, v]: any) => `${ABIL_TH[a]}+${v}`).join(" ")}</div>
                      <div style={{ fontSize: 9, color: "#6B6284" }}>ความเร็ว {r.speed} ฟุต</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ccStep === 1 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 2: เลือกอาชีพ (Class)</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>อาชีพกำหนด HP, Hit Dice, Saving Throws, สกิล, อาวุธ, เกราะ, เวท, subclass</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {Object.entries(CLASSES).map(([k, cl]: any) => (
                    <div key={k} className={"cc-opt" + (ccClass === k ? " sel" : "")} onClick={() => { setCcClass(k); setCcPickedSkills([]); setCcExpertise([]); }} style={{ padding: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{cl.th}</div>
                      <div style={{ fontSize: 10, color: "#8A7F9E" }}>d{cl.hitDie} {cl.caster ? "✨" : "⚔️"}</div>
                    </div>
                  ))}
                </div>
                <div className="panel" style={{ padding: 10, marginTop: 12, fontSize: 11, color: "#B9A96A" }}>
                  <b>{cls0.th}</b>: {cls0.feature}
                </div>
              </div>
            )}

            {ccStep === 4 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 5: กำหนด Ability Scores (รวม ASI จาก Background)</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 10 }}>
                  เลือกวิธีกำหนดค่า 6 อย่าง (STR, DEX, CON, INT, WIS, CHA) — รวมโบนัสเผ่าพันธุ์แล้วแสดงในวงเล็บ
                </div>
                {/* Method selector */}
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  {(["array", "pointbuy", "roll"] as const).map((m) => (
                    <button key={m} className={"btn" + (ccAbilityMethod === m ? " btn-gold" : "")} style={{ flex: 1, fontSize: 12, padding: "6px" }}
                      onClick={() => {
                        setCcAbilityMethod(m);
                        if (m === "array") setCcAbilityScores({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });
                        if (m === "pointbuy") setCcAbilityScores({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
                      }}>
                      {m === "array" ? "Standard Array" : m === "pointbuy" ? `Point Buy (${27 - pointBuySpent}/27)` : "ทอยเต๋า 4d6"}
                    </button>
                  ))}
                </div>
                {ccAbilityMethod === "roll" && (
                  <button className="btn" style={{ marginBottom: 10, fontSize: 12 }} onClick={rollAbilities}>🎲 ทอย 4d6 ทั้ง 6 ค่า</button>
                )}
                {/* Ability scores */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {ABILS.map((a) => {
                    const score = ccAbilityScores[a];
                    const withRace = score + (race0.bonus[a] || 0);
                    const m0 = mod(withRace);
                    return (
                      <div key={a} className="abil-box" style={{ padding: 8 }}>
                        <div className="name">{ABIL_TH[a]}</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 }}>
                          {ccAbilityMethod !== "roll" && (
                            <button className="btn" style={{ padding: "2px 8px", fontSize: 12 }} disabled={
                              (ccAbilityMethod === "array" && !ABILS.some((b) => ccAbilityScores[b] < score)) ||
                              (ccAbilityMethod === "pointbuy" && score <= 8)
                            }
                              onClick={() => {
                                if (ccAbilityMethod === "array") {
                                  // Standard Array: swap with the ability that has the next-lower value
                                  const candidates = ABILS.filter((b) => b !== a && ccAbilityScores[b] < score);
                                  if (candidates.length === 0) return;
                                  candidates.sort((b1, b2) => ccAbilityScores[b2] - ccAbilityScores[b1]); // highest of the lower values
                                  const swapAbil = candidates[0];
                                  setCcAbilityScores({
                                    ...ccAbilityScores,
                                    [a]: ccAbilityScores[swapAbil],
                                    [swapAbil]: score,
                                  });
                                } else if (ccAbilityMethod === "pointbuy") {
                                  if (score > 8 && pointBuySpent - (POINT_BUY_COSTS[score] ?? 0) + (POINT_BUY_COSTS[score - 1] ?? 0) <= 27) {
                                    setCcAbilityScores({ ...ccAbilityScores, [a]: score - 1 });
                                  }
                                }
                              }}>−</button>
                          )}
                          <span style={{ fontSize: 18, fontWeight: 800, color: "#EAE0CC" }}>{score}</span>
                          {ccAbilityMethod !== "roll" && (
                            <button className="btn" style={{ padding: "2px 8px", fontSize: 12 }} disabled={
                              (ccAbilityMethod === "array" && !ABILS.some((b) => ccAbilityScores[b] > score)) ||
                              (ccAbilityMethod === "pointbuy" && (score >= 15 || pointBuySpent - (POINT_BUY_COSTS[score] ?? 0) + (POINT_BUY_COSTS[score + 1] ?? 99) > 27))
                            }
                              onClick={() => {
                                if (ccAbilityMethod === "array") {
                                  // Standard Array: swap with the ability that has the next-higher value
                                  const candidates = ABILS.filter((b) => b !== a && ccAbilityScores[b] > score);
                                  if (candidates.length === 0) return;
                                  candidates.sort((b1, b2) => ccAbilityScores[b1] - ccAbilityScores[b2]); // lowest of the higher values
                                  const swapAbil = candidates[0];
                                  setCcAbilityScores({
                                    ...ccAbilityScores,
                                    [a]: ccAbilityScores[swapAbil],
                                    [swapAbil]: score,
                                  });
                                } else if (ccAbilityMethod === "pointbuy") {
                                  if (score < 15 && pointBuySpent - (POINT_BUY_COSTS[score] ?? 0) + (POINT_BUY_COSTS[score + 1] ?? 99) <= 27) {
                                    setCcAbilityScores({ ...ccAbilityScores, [a]: score + 1 });
                                  }
                                }
                              }}>+</button>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: "#8A7F9E" }}>รวมเผ่า: {withRace} ({m0 >= 0 ? "+" : ""}{m0})</div>
                      </div>
                    );
                  })}
                </div>
                {/* Standard Array swap UI */}
                {ccAbilityMethod === "array" && (
                  <div style={{ marginTop: 12, fontSize: 11, color: "#9C92B8" }}>
                    <b>Standard Array:</b> 15, 14, 13, 12, 10, 8 — สลับค่าระหว่าง ability ได้โดยกด +/−
                  </div>
                )}
                {ccAbilityMethod === "pointbuy" && (
                  <div style={{ marginTop: 12, fontSize: 11, color: pointBuySpent === 27 ? "#7FA85C" : "#E0A83E" }}>
                    แต้มที่ใช้: {pointBuySpent}/27 {pointBuySpent === 27 ? "✓" : ""}
                  </div>
                )}
              </div>
            )}

            {ccStep === 3 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 4: เลือกภูมิหลัง (Background) + Origin Feat</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>ภูมิหลังให้สกิล, เครื่องมือ, ภาษา, และ Feat (ในกฎ 2024)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {Object.entries(BACKGROUNDS).map(([k, b]: any) => (
                    <div key={k} className={"cc-opt" + (ccBg === k ? " sel" : "")} onClick={() => setCcBg(k)} style={{ padding: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{b.th}</div>
                      <div style={{ fontSize: 9, color: "#8A7F9E" }}>{b.skills.map((s: string) => SKILLS[s].th.split(" (")[0]).join(", ")}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ccStep === 5 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 6: เลือกสกิล (Skill Proficiency)</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>
                  อาชีพให้เลือก <b style={{ color: "#E0A83E" }}>{numClassSkillPicks}</b> สกิล · ภูมิหลังให้ <b style={{ color: "#E0A83E" }}>{bgSkills.length}</b> สกิลอัตโนมัติ
                  {canExpertise && <span> · <b style={{ color: "#E0A83E" }}>Expertise:</b> เลือก 2 สกิลเพิ่ม proficiency ×2</span>}
                </div>
                {/* Background skills (auto) */}
                <div style={{ fontSize: 11, color: "#7FA85C", marginBottom: 8 }}>✓ จากภูมิหลัง: {bgSkills.map(s => SKILLS[s].th.split(" (")[0]).join(", ")}</div>
                {/* Class skill picks */}
                <div style={{ fontSize: 11, color: "#B9A96A", marginBottom: 6 }}>เลือกจากอาชีพ ({ccPickedSkills.filter(s => classSkills.includes(s)).length}/{numClassSkillPicks}):</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                  {Object.entries(SKILLS).map(([k, s]) => {
                    const isClass = classSkills.includes(k);
                    const isBg = bgSkills.includes(k);
                    const isPicked = ccPickedSkills.includes(k);
                    const classPicksLeft = numClassSkillPicks - ccPickedSkills.filter(x => classSkills.includes(x)).length;
                    const canPick = isClass && !isBg && (isPicked || classPicksLeft > 0);
                    return (
                      <div key={k} style={{
                        padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: canPick ? "pointer" : "default",
                        background: isPicked ? "#1E3A2A" : isBg ? "#1A2A3A" : "#1E1830",
                        border: isPicked ? "1px solid #7FA85C" : "1px solid #3A3054",
                        opacity: canPick || isBg ? 1 : 0.4,
                        color: isPicked ? "#9CC77A" : isBg ? "#A0D0E0" : "#C9BFE0",
                      }} onClick={() => {
                        if (!canPick) return;
                        if (isPicked) setCcPickedSkills(ccPickedSkills.filter(x => x !== k));
                        else setCcPickedSkills([...ccPickedSkills, k]);
                      }}>
                        {isPicked ? "◆" : isBg ? "✓" : "◇"} {s.th.split(" (")[0]}
                        {isClass && !isBg && <span style={{ fontSize: 9, color: "#6B6284" }}> (class)</span>}
                      </div>
                    );
                  })}
                </div>
                {/* Expertise picks */}
                {canExpertise && (
                  <>
                    <div style={{ fontSize: 11, color: "#E0A83E", marginTop: 12, marginBottom: 6 }}>Expertise (เลือก 2 สกิลที่ proficient แล้ว — proficiency ×2):</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                      {Object.entries(SKILLS).map(([k, s]) => {
                        const isProf = classSkills.includes(k) || bgSkills.includes(k) || ccPickedSkills.includes(k);
                        const isExp = ccExpertise.includes(k);
                        return (
                          <div key={k} style={{
                            padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: isProf ? "pointer" : "default",
                            background: isExp ? "#3A2F5C" : "#1E1830",
                            border: isExp ? "1px solid #E0A83E" : "1px solid #3A3054",
                            opacity: isProf ? 1 : 0.3,
                            color: isExp ? "#E0A83E" : "#C9BFE0",
                          }} onClick={() => {
                            if (!isProf) return;
                            if (isExp) setCcExpertise(ccExpertise.filter(x => x !== k));
                            else if (ccExpertise.length < 2) setCcExpertise([...ccExpertise, k]);
                          }}>
                            {isExp ? "◆◆" : "◇"} {s.th.split(" (")[0]}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {ccStep === 6 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 7: เลือกอุปกรณ์เริ่มต้น</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>อาชีพให้อุปกรณ์เริ่มต้นแล้ว — เลือกเพิ่มได้ (ตัวเลือกจาก SRD)</div>
                <div className="panel" style={{ padding: 10, marginBottom: 12, fontSize: 12, color: "#B9A96A" }}>
                  <b>อุปกรณ์เริ่มต้นจาก {cls0.th}:</b> {WEAPONS[cls0.weapon].th}{cls0.ranged ? `, ${WEAPONS[cls0.ranged].th}` : ""}, Rations ×3, Torch, Rope, Potion of Healing
                </div>
                <div style={{ fontSize: 11, color: "#B9A96A", marginBottom: 6 }}>เลือกอาวุธเสริม (กดเพื่อเพิ่ม/ถอน):</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                  {Object.entries(WEAPONS).filter(([, w]: any) => w.type === "simple" || w.type === "martial").map(([k, w]: any) => {
                    const isPicked = ccPickedEquipment.includes(w.th);
                    return (
                      <div key={k} style={{
                        padding: "4px 6px", borderRadius: 6, fontSize: 10, cursor: "pointer",
                        background: isPicked ? "#1E3A2A" : "#1E1830",
                        border: isPicked ? "1px solid #7FA85C" : "1px solid #3A3054",
                        color: isPicked ? "#9CC77A" : "#C9BFE0",
                      }} onClick={() => {
                        if (isPicked) setCcPickedEquipment(ccPickedEquipment.filter(x => x !== w.th));
                        else setCcPickedEquipment([...ccPickedEquipment, w.th]);
                      }}>
                        {isPicked ? "✓ " : ""}{w.th} ({w.dmg})
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {ccStep === 7 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 8: เลือกเวทมนตร์</h2>
                {cls0.caster ? (
                  <>
                    <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>
                      อาชีพ {cls0.th} เป็นสายเวท ({cls0.castAbil?.toUpperCase()}) — เลือก cantrip และเวท Lv.1 จาก SRD (สามารถเรียนเพิ่มภายหลังในเกมได้)
                    </div>
                    <button className="btn btn-gold" style={{ width: "100%", marginBottom: 10 }} disabled={ccSpellChoicesLoading || !SRD_OK}
                      onClick={async () => {
                        setCcSpellChoicesLoading(true);
                        try {
                          const all: { index: string; name: string; level: number }[] = [];
                          for (let lv = 0; lv <= 1; lv++) {
                            const list = await srdListSpells(cls0.th.toLowerCase().split(" (")[0], lv);
                            for (const r of list?.results || []) {
                              all.push({ index: r.index, name: r.name, level: lv });
                            }
                          }
                          all.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
                          setCcSpellChoices(all);
                        } catch (e: any) { /* ignore */ }
                        finally { setCcSpellChoicesLoading(false); }
                      }}>
                      {ccSpellChoicesLoading ? "กำลังโหลดเวท SRD..." : ccSpellChoices.length > 0 ? `โหลดแล้ว (${ccSpellChoices.length} เวท) — กดเพื่อโหลดใหม่` : "📖 โหลดรายการเวท SRD"}
                    </button>
                    {ccSpellChoices.length > 0 && (
                      <div style={{ maxHeight: 280, overflowY: "auto" }}>
                        <div style={{ fontSize: 11, color: "#7FA85C", marginBottom: 4 }}>เลือกแล้ว: {ccPickedSpells.length} เวท</div>
                        {ccSpellChoices.map((sp) => {
                          const isPicked = ccPickedSpells.includes(sp.index);
                          return (
                            <div key={sp.index} style={{
                              padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", marginBottom: 2,
                              background: isPicked ? "#1E3A2A" : "#1E1830",
                              border: isPicked ? "1px solid #7FA85C" : "1px solid #3A3054",
                              color: isPicked ? "#9CC77A" : "#C9BFE0",
                            }} onClick={() => {
                              if (isPicked) setCcPickedSpells(ccPickedSpells.filter(x => x !== sp.index));
                              else setCcPickedSpells([...ccPickedSpells, sp.index]);
                            }}>
                              {isPicked ? "✓ " : "◇ "}<b style={{ color: isPicked ? "#7FA85C" : "#E0A83E" }}>{sp.level === 0 ? "Cantrip" : `Lv.${sp.level}`}</b> {sp.name}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 14, color: "#8A7F9E", textAlign: "center", padding: 40 }}>
                    {cls0.th} ไม่ใช่สายเวท — ข้ามขั้นตอนนี้ได้
                  </div>
                )}
              </div>
            )}

            {ccStep === 8 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 9: เลือก Alignment และภาษา</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>
                  เลือกแนวโน้มทางจริยธรรมของตัวละคร (Alignment) และภาษาที่รู้ (D&D 2024 — background + species ให้ภาษามาแล้ว)
                </div>
                <div className="sec-label">⚖️ Alignment (9 แบบตาม D&D 5e)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 14 }}>
                  {ALIGNMENTS.map((a) => (
                    <div key={a.id} style={{
                      padding: "6px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                      background: ccAlignment === a.id ? "#3A2F5C" : "#1E1830",
                      border: ccAlignment === a.id ? "1px solid #E0A83E" : "1px solid #3A3054",
                      color: ccAlignment === a.id ? "#E0A83E" : "#C9BFE0",
                    }} onClick={() => setCcAlignment(a.id)}>
                      {ccAlignment === a.id ? "✓ " : ""}<b>{a.abbr}</b> {a.th.split(" (")[0]}
                    </div>
                  ))}
                </div>
                <div className="sec-label">🗣️ ภาษา (D&D 2024: +1 ภาษาตามเผ่าพันธุ์)</div>
                <div style={{ fontSize: 11, color: "#9C92B8", marginBottom: 6 }}>
                  ภาษาจากเผ่าพันธุ์ {race0.th}: {race0.languages ? race0.languages.join(", ") : "Common"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, maxHeight: 180, overflowY: "auto" }}>
                  {LANGUAGES.filter(l => !race0.languages?.includes(l.th)).map((l) => {
                    const isPicked = ccLanguages.includes(l.id);
                    return (
                      <div key={l.id} style={{
                        padding: "4px 6px", borderRadius: 6, fontSize: 10, cursor: "pointer",
                        background: isPicked ? "#1E3A2A" : "#1E1830",
                        border: isPicked ? "1px solid #7FA85C" : "1px solid #3A3054",
                        color: isPicked ? "#9CC77A" : "#C9BFE0",
                      }} onClick={() => {
                        if (isPicked) setCcLanguages(ccLanguages.filter(x => x !== l.id));
                        else if (ccLanguages.length < 1) setCcLanguages([...ccLanguages, l.id]);
                      }}>
                        {isPicked ? "✓ " : ""}{l.th}{l.exotic ? " ✦" : ""}
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10, color: "#8A7F9E", marginTop: 6 }}>(✦ = exotic language — มนุษย์ได้เพิ่ม 1 ภาษา)</div>
              </div>
            )}

            {ccStep === 9 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 10: บุคลิก/ลักษณะ และรายละเอียด</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>เติมข้อมูลพื้นฐานและบุคลิก (ไม่บังคับ แต่ช่วยให้ DM เล่นเรื่องได้ดีขึ้น)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <input className="input-main" style={{ fontSize: 13 }} placeholder="อายุ" value={ccDetails.age} onChange={(e) => setCcDetails({ ...ccDetails, age: e.target.value })} />
                  <input className="input-main" style={{ fontSize: 13 }} placeholder="ส่วนสูง" value={ccDetails.height} onChange={(e) => setCcDetails({ ...ccDetails, height: e.target.value })} />
                </div>
                <input className="input-main" style={{ width: "100%", fontSize: 13, marginBottom: 8 }} placeholder="รูปลักษณ์ (สีผม สีตา ฯลฯ)" value={ccDetails.appearance} onChange={(e) => setCcDetails({ ...ccDetails, appearance: e.target.value })} />
                <input className="input-main" style={{ width: "100%", fontSize: 13, marginBottom: 8 }} placeholder="อุดมคติ (Ideal) — อะไรที่ตัวละครยึดถือ" value={ccDetails.ideal} onChange={(e) => setCcDetails({ ...ccDetails, ideal: e.target.value })} />
                <input className="input-main" style={{ width: "100%", fontSize: 13, marginBottom: 8 }} placeholder="สิ่งผูกพัน (Bond) — อะไรที่ผูกพันตัวละคร" value={ccDetails.bond} onChange={(e) => setCcDetails({ ...ccDetails, bond: e.target.value })} />
                <input className="input-main" style={{ width: "100%", fontSize: 13, marginBottom: 8 }} placeholder="ข้อบกพร่อง (Flaw) — จุดอ่อนของตัวละคร" value={ccDetails.flaw} onChange={(e) => setCcDetails({ ...ccDetails, flaw: e.target.value })} />
                <textarea className="input-main" style={{ width: "100%", fontSize: 13, minHeight: 80, resize: "vertical" }} placeholder="ประวัติตัวละคร (Backstory)..." value={ccDetails.backstory} onChange={(e) => setCcDetails({ ...ccDetails, backstory: e.target.value })} />
              </div>
            )}

            {ccStep === 10 && (
              <div>
                <h2 className="dnd-display" style={{ color: "#E0A83E", fontSize: 22, marginBottom: 8 }}>ขั้นตอนที่ 11: ตรวจสอบ Character Sheet</h2>
                <div style={{ fontSize: 12, color: "#9C92B8", marginBottom: 12 }}>ตรวจสอบข้อมูลให้ครบก่อนเริ่มเล่น</div>
                <div className="panel" style={{ padding: 14, fontSize: 13, lineHeight: 1.8 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#E0A83E", marginBottom: 6 }}>{ccName || "ไม่ระบุชื่อ"}</div>
                  <div style={{ color: "#C9BFE0" }}>{race0.th} · {cls0.th} · Level 1 · ภูมิหลัง: {bg0.th}</div>
                  <div style={{ marginTop: 8, color: "#9C92B8" }}>
                    <b style={{ color: "#B9A96A" }}>ค่าสถานะ (รวมเผ่า):</b><br/>
                    {ABILS.map(a => `${ABIL_TH[a]}: ${preview.abilities[a]} (${mod(preview.abilities[a]) >= 0 ? "+" : ""}${mod(preview.abilities[a])})`).join(" · ")}
                  </div>
                  <div style={{ marginTop: 6 }}><b style={{ color: "#B9A96A" }}>HP:</b> {preview.maxHp} · <b style={{ color: "#B9A96A" }}>AC:</b> {preview.ac} · <b style={{ color: "#B9A96A" }}>ความเร็ว:</b> {preview.speed} ฟุต</div>
                  <div><b style={{ color: "#B9A96A" }}>อาวุธ:</b> {WEAPONS[cls0.weapon].th}{cls0.ranged ? `, ${WEAPONS[cls0.ranged].th}` : ""}</div>
                  <div><b style={{ color: "#B9A96A" }}>Saving Throws:</b> {cls0.saves.map((s: string) => ABIL_TH[s]).join(", ")}</div>
                  <div><b style={{ color: "#B9A96A" }}>สกิลที่ proficient:</b> {[...bgSkills, ...ccPickedSkills].map(s => SKILLS[s].th.split(" (")[0]).join(", ") || "—"}</div>
                  {ccExpertise.length > 0 && <div><b style={{ color: "#E0A83E" }}>Expertise:</b> {ccExpertise.map(s => SKILLS[s].th.split(" (")[0]).join(", ")}</div>}
                  <div><b style={{ color: "#B9A96A" }}>Alignment:</b> {ALIGNMENTS.find(a => a.id === ccAlignment)?.th || "—"}</div>
                  <div><b style={{ color: "#B9A96A" }}>ภาษา:</b> {[...(race0.languages || ["Common"]), ...ccLanguages.map(id => LANGUAGES.find(l => l.id === id)?.th).filter(Boolean)].join(", ")}</div>
                  {bg0.originFeat && ORIGIN_FEATS[bg0.originFeat] && <div><b style={{ color: "#7FA85C" }}>🎯 Origin Feat ({bg0.th}):</b> {ORIGIN_FEATS[bg0.originFeat].th} — {ORIGIN_FEATS[bg0.originFeat].descriptionTh}</div>}
                  {bg0.tool && <div><b style={{ color: "#B9A96A" }}>เครื่องมือ:</b> {bg0.tool}</div>}
                  {race0.traits && <div><b style={{ color: "#B9A96A" }}>คุณสมบัติเผ่าพันธุ์:</b> {race0.traits.join(", ")}</div>}
                  {cls0.caster && <div><b style={{ color: "#B9A96A" }}>เวทที่รู้:</b> {ccPickedSpells.length} เวท</div>}
                  {ccPickedEquipment.length > 0 && <div><b style={{ color: "#B9A96A" }}>อุปกรณ์เสริม:</b> {ccPickedEquipment.join(", ")}</div>}
                  {ccDetails.backstory && <div style={{ marginTop: 6 }}><b style={{ color: "#B9A96A" }}>ประวัติ:</b> {ccDetails.backstory.slice(0, 100)}{ccDetails.backstory.length > 100 ? "..." : ""}</div>}
                </div>
              </div>
            )}
          </div>

          {/* Navigation buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn" onClick={() => ccStep === 0 ? setPhase("menu") : setCcStep(ccStep - 1)}>{ccStep === 0 ? "กลับ" : "← ย้อน"}</button>
            {ccStep < 9 ? (
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => setCcStep(ccStep + 1)}>ถัดไป →</button>
            ) : (
              <button className="btn btn-gold" style={{ flex: 1 }} disabled={!ccName.trim()} onClick={startNewGame}>⚔️ เริ่มการผจญภัย</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "dead") {
    return (
      <div className="dnd-root">

        <div style={{ margin: "auto", textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 56 }}>☠️</div>
          <h1 className="dnd-display" style={{ color: "#C74B44" }}>ตำนานของ{c ? c.name : "ฮีโร่"} จบลงแล้ว</h1>
          <div style={{ color: "#8A7F9E", marginBottom: 20 }}>{c ? `Level ${c.level} · ${c.xp} XP` : ""}</div>
          <button className="btn btn-gold" onClick={resetAll}>เริ่มตำนานบทใหม่</button>
        </div>
      </div>
    );
  }

  /* ---- PLAY ---- */
  const cls = c ? CLASSES[c.cls] : null;
  const downed = c && c.hp <= 0 && !c.dead;
  const meleeW = c ? getMelee(c) : null;
  const rangedW = c ? getRanged(c) : null;
  const combatItems = c ? c.inventory.filter((it: string) => CONSUMABLES[it] && CONSUMABLES[it].combat) : [];
  const maxSpellLv = c && cls && cls.caster ? maxSpellLevel(c.cls, c.level) : 0;
  const knownSpellsList = c?.knownSpells || [];
  // Build "known spell + cantrips" grouped by level for combat UI
  const knownSpellsByLevel: { level: number; indices: string[] }[] = [];
  if (c && cls?.caster) {
    for (let lv = 0; lv <= maxSpellLv; lv++) {
      const indices = knownSpellsList.filter((idx: string) => {
        // We need to know the level — but fetching each is expensive. We'll trust the SRD index naming convention for now.
        // For simplicity, group all known spells under their actual level after fetch. We'll display flat list instead.
        return true;
      });
      if (lv === 0) knownSpellsByLevel.push({ level: 0, indices });
    }
  }

  return (
    <div className="dnd-root">

      {/* ONBOARDING OVERLAY (P3.3) — first-time player guide */}
      {onboardStep >= 0 && onboardStep <= 3 && (
        <div className="onboarding-overlay" onClick={() => setOnboardStep(-1)}>
          <div className="onboarding-card" onClick={(e) => e.stopPropagation()}>
            {onboardStep === 0 && (
              <>
                <div className="onboarding-icon">🎲</div>
                <div className="onboarding-title">ยินดีต้อนรับสู่ D&D Solo!</div>
                <div className="onboarding-text">
                  คุณจะเล่นเป็นตัวละครในโลกแฟนตาซี AI เป็น Dungeon Master (DM) เล่าเรื่องและเล่นเป็น NPC ทุกตัว ส่วน engine เป็นคนทอยลูกเต๋าและคำนวณกฎ D&D 2024 ให้คุณ
                </div>
              </>
            )}
            {onboardStep === 1 && (
              <>
                <div className="onboarding-icon">💬</div>
                <div className="onboarding-title">พิมพ์เพื่อเล่น</div>
                <div className="onboarding-text">
                  พิมพ์สิ่งที่ตัวละครจะทำในช่องด้านล่าง เช่น "สำรวจรอบๆ", "คุยกับพ่อค้า", "โจมตีกอบลิน" หรือกดปุ่มลัดด้านบนช่องพิมพ์ก็ได้ DM จะตอบเป็นน้ำเสียงภาษาไทย
                </div>
              </>
            )}
            {onboardStep === 2 && (
              <>
                <div className="onboarding-icon">⚔️</div>
                <div className="onboarding-title">การต่อสู้</div>
                <div className="onboarding-text">
                  เมื่อ DM เริ่มการต่อสู้ จะมีกริด 12×10 ปรากฏขึ้น กดพื้นเขียวเพื่อเคลื่อนที่ กดปุ่มโจมตีเพื่อตีศัตรู engine จะทอยลูกเต๋าให้อัตโนมัติ รวมถึงคำนวณดาเมจ AC HP และสภาวะต่างๆ
                </div>
              </>
            )}
            {onboardStep === 3 && (
              <>
                <div className="onboarding-icon">📜</div>
                <div className="onboarding-title">ตัวละครของคุณ</div>
                <div className="onboarding-text">
                  กดปุ่ม 📜 เพื่อดูสถานะตัวละคร — ค่าสถานะ สกิล เวทมนตร์ ไอเทม และความสามารถ กด ☰ เพิ่มเติม เพื่อเปิดร้านค้า AI DM Helper และ Content Manager
                </div>
              </>
            )}
            <div className="onboarding-dots">
              {[0,1,2,3].map(i => (
                <div key={i} className={"onboarding-dot" + (i === onboardStep ? " active" : "")} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {onboardStep > 0 && <button className="btn" style={{ flex: 1 }} onClick={() => setOnboardStep(onboardStep - 1)}>ย้อน</button>}
              {onboardStep < 3 ? (
                <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => setOnboardStep(onboardStep + 1)}>ถัดไป →</button>
              ) : (
                <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => setOnboardStep(-1)}>เริ่มเล่น! ⚔️</button>
              )}
            </div>
            {onboardStep < 3 && <button className="btn" style={{ marginTop: 8, fontSize: 12, color: "#8A7F9E" }} onClick={() => setOnboardStep(-1)}>ข้าม</button>}
          </div>
        </div>
      )}

      {/* HEADER */}
      {/* HEADER — Phase 6: compact 2-row layout (was: cluttered 15+ items in one row) */}
      <div style={{ padding: "8px 14px", borderBottom: "1px solid #3A3054", background: "rgba(20,16,32,0.9)", position: "sticky", top: 0, zIndex: 10, paddingTop: "max(8px, env(safe-area-inset-top))" }}>
        {/* Row 1: name + level + buttons (compact) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <span className="dnd-display" style={{ fontSize: 16, color: "#E0A83E", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
            <span style={{ fontSize: 11, color: "#8A7F9E", whiteSpace: "nowrap" }}>Lv.{c.level} {cls.th}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setSheetOpen(true)}>📜</button>
            <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setMapOpen(true)}>🗺️</button>
            {dungeonBlueprint && (
              <button className="btn" style={{ padding: "4px 8px", fontSize: 12, background: "#3A2F5C", borderColor: "#E0A83E" }} onClick={() => setDungeonMapOpen(true)}>🏰{dungeonRun?.roomsCleared || 0}/{dungeonRun?.totalRooms || 0}</button>
            )}
            {quests.filter(q => q.status === "active").length > 0 && (
              <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setQuestJournalOpen(true)}>📜{quests.filter(q => q.status === "active").length}</button>
            )}
            <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setMoreMenuOpen(true)}>☰</button>
          </div>
        </div>
        {/* Row 2: HP bar + AC + gold (always visible) */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}><HPBar hp={c.hp} maxHp={c.maxHp} /></div>
          <div style={{ fontSize: 12, color: "#C9BFE0", whiteSpace: "nowrap" }}>🛡{c.ac} · 💰{c.gold}</div>
        </div>
        {/* Row 3 (compact, small): scene + time + status effects only */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3, flexWrap: "wrap", fontSize: 10, color: "#8A7F9E" }}>
          <span>📍 {scene || "—"}</span>
          <span>⏰ {gameTimeToString(gameTime)}</span>
          {c?.weather && <span style={{ color: "#6B9BD2" }}>🌤️{c.weather}</span>}
          {c?.exhaustionLevel > 0 && <span style={{ color: "#C74B44" }}>😮‍💨{c.exhaustionLevel}</span>}
          {c?.sceneType && c.sceneType !== "exploration" && <span style={{ color: "#E0A83E" }}>🎬{c.sceneType}</span>}
          {c.raging && <span style={{ color: "#E08E4F" }}>🔥Rage</span>}
          {c.conditions.length > 0 && <span style={{ color: "#C9A0DC" }}>{c.conditions.map((cd: string) => CONDITIONS_TH[cd]?.split(" (")[0] || cd).join(",")}</span>}
        </div>
        {/* Row 4: spell slots (casters only) */}
        {cls.caster && (
          <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            {c.slotsMax.map((max: number, li: number) => (
              <span key={li} style={{ fontSize: 10, color: "#6FB3AB" }}>
                Lv{li + 1}: {Array.from({ length: max }).map((_, i) => (<span key={i} className={"slotpip " + (i < c.slots[li] ? "full" : "used")} />))}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* LOG */}
      <div ref={logRef} style={{ flex: 1, overflowY: "auto", padding: "10px 14px", maxWidth: 640, width: "100%", margin: "0 auto", boxSizing: "border-box", minHeight: 0 }}>
        {/* Phase 0 fix: window log to last 80 entries on render (full log kept in state for persistence) */}
        {log.slice(-80).map((e) => {
          if (e.type === "dm") return <div key={e.id} className="msg-dm">{e.text}</div>;
          if (e.type === "player") return <div key={e.id} className="msg-player">{e.text}</div>;
          if (e.type === "roll") return <RollTicket key={e.id} entry={e} />;
          return <div key={e.id} className="msg-system">— {e.text} —</div>;
        })}
        {thinking && <div className="msg-system thinking-dots">DM กำลังคิด<span>.</span><span>.</span><span>.</span></div>}
      </div>

      {/* ASI MODAL */}
      {c?.pendingAsi > 0 && (
        <div className="sheet-overlay">
          <div className="sheet-modal" style={{ maxWidth: 440 }}>
            <div style={{ padding: "14px 16px" }}>
              <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>💪 Ability Score Improvement</span>
              <div style={{ fontSize: 13, color: "#9C92B8", margin: "6px 0 12px" }}>Pick +1 twice (same score twice = +2) · max 20</div>
              {ABILS.map((a) => {
                const picks = asiPicks.filter((p) => p === a).length;
                const atMax = c.abilities[a] + picks >= 20;
                return (
                  <div key={a} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 4px", borderBottom: "1px dashed #2E2748", fontSize: 14 }}>
                    <span><b style={{ color: "#E0A83E" }}>{ABIL_TH[a]}</b> {c.abilities[a]}{picks > 0 ? ` → ${c.abilities[a] + picks}` : ""}</span>
                    <button className="btn" style={{ padding: "3px 14px" }} disabled={asiPicks.length >= 2 || atMax} onClick={() => setAsiPicks([...asiPicks, a])}>+1</button>
                  </div>
                );
              })}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button className="btn" disabled={asiPicks.length === 0} onClick={() => setAsiPicks([])}>Clear</button>
                <button className="btn btn-gold" style={{ flex: 1 }} disabled={asiPicks.length !== 2} onClick={applyAsi}>Confirm ({asiPicks.length}/2)</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MORE MENU — secondary actions (Shop, AI DM, Content) */}
      {moreMenuOpen && !combat && (
        <div className="sheet-overlay" onClick={() => setMoreMenuOpen(false)}>
          <div className="sheet-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
              <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>☰ เพิ่มเติม</span>
              <button className="btn" style={{ padding: "4px 12px" }} onClick={() => setMoreMenuOpen(false)}>✕</button>
            </div>
            <div className="sheet-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "12px 14px" }}
                onClick={() => { setShopOpen(true); setMoreMenuOpen(false); }}>
                🏪 ร้านค้า — ซื้อขายอาวุธ เกราะ ของวิเศษ ยา
              </button>
              <button className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "12px 14px" }}
                onClick={() => { setDmHelperOpen(true); setMoreMenuOpen(false); }}>
                🤖 AI DM Helper — ดูสถานะ engine, intent, narrative
              </button>
              <button className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "12px 14px" }}
                onClick={() => { setContentManagerOpen(true); setMoreMenuOpen(false); }}>
                📦 Content Manager — import/export homebrew
              </button>
              <button className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "12px 14px" }}
                onClick={() => { setIoOpen(true); setMoreMenuOpen(false); }}>
                💾 บันทึก / โหลด / ส่งออก
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MORE MENU — during combat (limited actions) */}
      {moreMenuOpen && combat && (
        <div className="sheet-overlay" onClick={() => setMoreMenuOpen(false)}>
          <div className="sheet-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
              <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>☰ เพิ่มเติม</span>
              <button className="btn" style={{ padding: "4px 12px" }} onClick={() => setMoreMenuOpen(false)}>✕</button>
            </div>
            <div className="sheet-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: "#8A7F9E", textAlign: "center", padding: 10 }}>ร้านค้าและบางฟีเจอร์ไม่พร้อมใช้ระหว่างการต่อสู้</div>
              <button className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "12px 14px" }}
                onClick={() => { setDmHelperOpen(true); setMoreMenuOpen(false); }}>
                🤖 AI DM Helper
              </button>
              <button className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "12px 14px" }}
                onClick={() => { setSheetOpen(true); setMoreMenuOpen(false); }}>
                📜 ตัวละคร
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUEST JOURNAL MODAL */}
      {questJournalOpen && (
        <div className="sheet-overlay" onClick={() => setQuestJournalOpen(false)}>
          <div className="sheet-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
              <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>📜 บันทึกเควสต์</span>
              <button className="btn" style={{ padding: "4px 12px" }} onClick={() => setQuestJournalOpen(false)}>✕</button>
            </div>
            <div className="sheet-body">
              {quests.length === 0 ? (
                <div style={{ fontSize: 13, color: "#8A7F9E", textAlign: "center", padding: 30 }}>ยังไม่มีเควสต์ — DM จะมอบเควสต์เมื่อคุณพบ NPC ที่เกี่ยวข้อง</div>
              ) : (
                quests.map((q) => (
                  <div key={q.id} className="item-row" style={{ marginBottom: 8, borderLeft: q.status === "active" ? "3px solid #E0A83E" : q.status === "completed" ? "3px solid #7FA85C" : "3px solid #C74B44" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: q.status === "active" ? "#E0A83E" : q.status === "completed" ? "#7FA85C" : "#C74B44" }}>
                      {q.status === "active" ? "▶" : q.status === "completed" ? "✅" : "❌"} {q.title}
                    </div>
                    <div style={{ fontSize: 12, color: "#9C92B8", marginTop: 4 }}>{q.description}</div>
                    {q.objectives && q.objectives.length > 0 && (
                      <div style={{ fontSize: 11, color: "#C9BFE0", marginTop: 4 }}>
                        {q.objectives.map((o, i) => (
                          <div key={i}>{o.done ? "✓" : "○"} {o.text}</div>
                        ))}
                      </div>
                    )}
                    {q.reward && <div style={{ fontSize: 11, color: "#B9A96A", marginTop: 4 }}>🎁 รางวัล: {q.reward}</div>}
                    {q.giver && <div style={{ fontSize: 10, color: "#6B6284", marginTop: 2 }}>ผู้มอบ: {q.giver}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SHOP MODAL — D&D 5e economy: buy/sell weapons, armor, magic items, consumables */}
      {shopOpen && c && !combat && (
        <div className="sheet-overlay" onClick={() => setShopOpen(false)}>
          <div className="sheet-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 650 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
              <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>🏪 ร้านค้า</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 14, color: "#B9A96A" }}>💰 {c.gold} gp</span>
                <button className="btn" style={{ padding: "4px 12px" }} onClick={() => setShopOpen(false)}>✕</button>
              </div>
            </div>
            <div className="sheet-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              {/* Tabs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                {(["weapons", "armor", "magic", "consumables", "sell"] as const).map(tab => (
                  <button key={tab} className={"btn" + (shopTab === tab ? " btn-gold" : "")} style={{ flex: 1, fontSize: 11, padding: "5px" }}
                    onClick={() => setShopTab(tab)}>
                    {tab === "weapons" ? "⚔️ อาวุธ" : tab === "armor" ? "🛡️ เกราะ" : tab === "magic" ? "✨ ของวิเศษ" : tab === "consumables" ? "🧪 ยา" : "📤 ขายของ"}
                  </button>
                ))}
              </div>
              {/* Search box */}
              <input className="input-main" placeholder="🔍 ค้นหา..." value={shopSearch}
                onChange={(e) => setShopSearch(e.target.value)}
                style={{ marginBottom: 10, fontSize: 13, padding: "8px 12px" }} />

              {/* Buy Weapons */}
              {shopTab === "weapons" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {Object.entries(WEAPONS).filter(([, w]: any) => (w.type === "simple" || w.type === "martial")).filter(([key, w]: any) => !shopSearch || w.th.toLowerCase().includes(shopSearch.toLowerCase()) || key.includes(shopSearch.toLowerCase())).map(([key, w]: any) => {
                    // Calculate price with reputation discount (D&D 5e: Persuasion can reduce price)
                    const basePrice = w.price;
                    const charRep = c.gold > 500 ? 10 : 0; // simple reputation proxy
                    const finalPrice = Math.max(1, Math.floor(basePrice * (1 - charRep / 100)));
                    return (
                    <div key={key} style={{ padding: "6px 8px", background: "#1E1830", border: "1px solid #3A3054", borderRadius: 6, fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ color: "#C9BFE0", fontWeight: 600 }}>{w.th}</span>
                        <span style={{ color: "#8A7F9E", marginLeft: 4 }}>{w.dmg} {w.abil === "dex" ? "DEX" : "STR"}{w.versatileDmg ? ` (2H: ${w.versatileDmg})` : ""}</span>
                        {w.mastery && <span style={{ color: "#7FA85C", fontSize: 9, marginLeft: 4 }}>[{w.mastery}]</span>}
                        <div style={{ color: "#B9A96A" }}>
                          {finalPrice < basePrice ? (
                            <span><s style={{ color: "#6B6284" }}>{basePrice}</s> {finalPrice} gp</span>
                          ) : (
                            <span>{basePrice} gp</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 3 }}>
                        <button className="btn" style={{ padding: "3px 8px", fontSize: 10 }}
                          disabled={c.gold < finalPrice}
                          onClick={() => {
                            if (c.gold >= finalPrice) {
                              const nc = { ...c, gold: c.gold - finalPrice, inventory: [...c.inventory, w.th] };
                              setC(nc); setLog([...log, entrySystem(`🏪 ซื้อ ${w.th} — ${finalPrice} gp → เหลือ ${nc.gold} gp`)]);
                              persist(nc, scene, [...log, entrySystem(`🏪 ซื้อ ${w.th} — ${finalPrice} gp`)], null, history);
                            }
                          }}>ซื้อ</button>
                        <button className="btn" style={{ padding: "3px 6px", fontSize: 9 }}
                          onClick={() => {
                            // D&D 5e Bargaining: Persuasion check vs DC = 10 + (price / 100)
                            const bargainDC = Math.min(20, 10 + Math.floor(basePrice / 100));
                            const r = rollD20(skillMod(c, "persuasion"));
                            const success = r.total >= bargainDC;
                            let discount = 0;
                            if (success) {
                              discount = Math.min(30, Math.floor((r.total - bargainDC) * 5)); // up to 30% off
                            } else {
                              discount = -10; // merchant offended, +10% price
                            }
                            const newPrice = Math.max(1, Math.floor(basePrice * (1 - discount / 100)));
                            setLog([...log, entrySystem(`🗣️ เจรจา ${w.th}: Persuasion ${r.total} vs DC ${bargainDC} → ${success ? `สำเร็จ! ลด ${discount}% → ${newPrice} gp` : `ล้มเหลว! ราคาเพิ่ม ${Math.abs(discount)}% → ${newPrice} gp`}`)]);
                          }}>เจรจา</button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}

              {/* Buy Armor */}
              {shopTab === "armor" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {Object.entries(ARMOR).filter(([key, a]: any) => !shopSearch || a.th.toLowerCase().includes(shopSearch.toLowerCase()) || key.includes(shopSearch.toLowerCase())).map(([key, a]: any) => (
                    <div key={key} style={{ padding: "6px 8px", background: "#1E1830", border: "1px solid #3A3054", borderRadius: 6, fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ color: "#C9BFE0", fontWeight: 600 }}>{a.th}</span>
                        <span style={{ color: "#8A7F9E", marginLeft: 4 }}>
                          {a.acPlus ? `+${a.acPlus} AC` : `AC ${a.acBase}${a.dexBonus ? "+DEX" : ""}${a.maxDex ? `(max ${a.maxDex})` : ""}`}
                        </span>
                        <span style={{ color: "#6B6284", fontSize: 9, marginLeft: 4 }}>[{a.type}]</span>
                        <div style={{ color: "#B9A96A" }}>{a.price} gp</div>
                      </div>
                      <button className="btn" style={{ padding: "3px 8px", fontSize: 10 }}
                        disabled={c.gold < a.price}
                        onClick={() => {
                          if (c.gold >= a.price) {
                            const nc = { ...c, gold: c.gold - a.price, inventory: [...c.inventory, a.th] };
                            setC(nc); setLog([...log, entrySystem(`🏪 ซื้อ ${a.th} — ${a.price} gp → เหลือ ${nc.gold} gp`)]);
                            persist(nc, scene, [...log, entrySystem(`🏪 ซื้อ ${a.th} — ${a.price} gp`)], null, history);
                          }
                        }}>ซื้อ</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Buy Magic Items */}
              {shopTab === "magic" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {Object.entries(MAGIC_ITEMS).filter(([, m]: any) => m.price <= c.gold + 500).filter(([name, m]: any) => !shopSearch || name.toLowerCase().includes(shopSearch.toLowerCase())).map(([name, m]: any) => (
                    <div key={name} style={{ padding: "6px 8px", background: "#1E1830", border: "1px solid #3A3054", borderRadius: 6, fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ color: "#E0A83E", fontWeight: 600 }}>{name}</span>
                        <span style={{ color: "#6B6284", fontSize: 9, marginLeft: 4 }}>[{m.slot}]</span>
                        <div style={{ color: "#B9A96A" }}>{m.price} gp</div>
                        <div style={{ color: "#8A7F9E", fontSize: 9 }}>{m.desc?.slice(0, 60)}...</div>
                      </div>
                      <button className="btn" style={{ padding: "3px 8px", fontSize: 10 }}
                        disabled={c.gold < m.price}
                        onClick={() => {
                          if (c.gold >= m.price) {
                            const nc = { ...c, gold: c.gold - m.price, inventory: [...c.inventory, name] };
                            setC(nc); setLog([...log, entrySystem(`🏪 ซื้อ ${name} — ${m.price} gp → เหลือ ${nc.gold} gp`)]);
                            persist(nc, scene, [...log, entrySystem(`🏪 ซื้อ ${name} — ${m.price} gp`)], null, history);
                          }
                        }}>ซื้อ</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Buy Consumables */}
              {shopTab === "consumables" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {Object.entries(CONSUMABLES).filter(([key, con]: any) => !shopSearch || (con.th || key).toLowerCase().includes(shopSearch.toLowerCase())).map(([key, con]: any) => (
                    <div key={key} style={{ padding: "6px 8px", background: "#1E1830", border: "1px solid #3A3054", borderRadius: 6, fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ color: "#C9BFE0", fontWeight: 600 }}>{con.th || key}</span>
                        <div style={{ color: "#8A7F9E", fontSize: 9 }}>{con.heal ? `ฟื้น ${con.heal} HP` : con.cure ? `รักษา ${con.cure}` : "ใช้ใน combat"}</div>
                        <div style={{ color: "#B9A96A" }}>{con.price || 25} gp</div>
                      </div>
                      <button className="btn" style={{ padding: "3px 8px", fontSize: 10 }}
                        disabled={c.gold < (con.price || 25)}
                        onClick={() => {
                          const price = con.price || 25;
                          if (c.gold >= price) {
                            const nc = { ...c, gold: c.gold - price, inventory: [...c.inventory, key] };
                            setC(nc); setLog([...log, entrySystem(`🏪 ซื้อ ${con.th || key} — ${price} gp → เหลือ ${nc.gold} gp`)]);
                            persist(nc, scene, [...log, entrySystem(`🏪 ซื้อ ${con.th || key} — ${price} gp`)], null, history);
                          }
                        }}>ซื้อ</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Sell items from inventory (50% of base price) */}
              {shopTab === "sell" && (
                <div>
                  <div style={{ fontSize: 11, color: "#9C92B8", marginBottom: 8 }}>
                    ขายของจากเป้ (ราคาขาย = 50% ของราคาซื้อ — D&D 5e standard)
                  </div>
                  {c.inventory.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#8A7F9E", textAlign: "center", padding: 20 }}>ไม่มีของในเป้</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                      {c.inventory.map((item: string, i: number) => {
                        const wEntry = weaponByName(item) as [string, any] | undefined;
                        const w = wEntry?.[1];
                        const armorEntries = Object.entries(ARMOR) as [string, any][];
                        const armorMatch = armorEntries.find(([, a]) => a.th === item);
                        const magicMatch = (MAGIC_ITEMS as any)[item];
                        const conMatch = (CONSUMABLES as any)[item];
                        const basePrice = w?.price || armorMatch?.[1]?.price || magicMatch?.price || conMatch?.price || 5;
                        const sellPrice = Math.floor(basePrice * 0.5);
                        return (
                          <div key={i} style={{ padding: "6px 8px", background: "#1E1830", border: "1px solid #3A3054", borderRadius: 6, fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <span style={{ color: "#C9BFE0" }}>{item}</span>
                              <div style={{ color: "#7FA85C" }}>ขาย {sellPrice} gp</div>
                            </div>
                            <button className="btn" style={{ padding: "3px 8px", fontSize: 10 }}
                              onClick={() => {
                                const nc = { ...c, gold: c.gold + sellPrice, inventory: c.inventory.filter((_: string, j: number) => j !== i) };
                                setC(nc); setLog([...log, entrySystem(`🏪 ขาย ${item} — +${sellPrice} gp → รวม ${nc.gold} gp`)]);
                                persist(nc, scene, [...log, entrySystem(`🏪 ขาย ${item} — +${sellPrice} gp`)], null, history);
                              }}>ขาย</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <div style={{ marginTop: 10, fontSize: 10, color: "#6B6284", textAlign: "center" }}>
                D&D 5e Economy — ราคาตาม PHB 2024 · ขายของได้ 50% · เปิดร้านได้ตอนไม่อยู่ใน combat
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONTENT MANAGER MODAL — Domain 35: import/export homebrew content */}
      {contentManagerOpen && c && (
        <div className="sheet-overlay" onClick={() => setContentManagerOpen(false)}>
          <div className="sheet-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
              <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>📦 Content Manager (Domain 35)</span>
              <button className="btn" style={{ padding: "4px 12px" }} onClick={() => setContentManagerOpen(false)}>✕</button>
            </div>
            <div className="sheet-body" style={{ maxHeight: "75vh", overflowY: "auto" }}>
              {/* Stats */}
              <div style={{ marginBottom: 14, padding: 10, background: "#1B1530", borderRadius: 8 }}>
                <div className="sec-label">📊 Registry Stats</div>
                <div style={{ fontSize: 12, color: "#C9BFE0", marginTop: 4 }}>
                  Total entries: <b style={{ color: "#E0A83E" }}>{Object.keys(contentRegistry.entries).length}</b>
                  {" · "}Homebrew content: <b style={{ color: "#7FA85C" }}>{Object.values(contentRegistry.entries).filter(e => e.source === "homebrew" || e.source === "custom").length}</b>
                </div>
              </div>

              {/* Import section */}
              <div style={{ marginBottom: 14 }}>
                <div className="sec-label">📥 Import Homebrew (JSON)</div>
                <div style={{ fontSize: 11, color: "#9C92B8", marginBottom: 6 }}>
                  Paste JSON content below — supports spells, monsters, items, NPCs, locations, etc.
                  Each entry needs: id, type, name, and type-specific required fields.
                </div>
                <textarea
                  className="input-main"
                  style={{ width: "100%", minHeight: 120, fontFamily: "monospace", fontSize: 11, resize: "vertical" }}
                  placeholder={`{\n  "id": "fireball_custom",\n  "type": "spell",\n  "name": "Fireball Plus",\n  "level": 3,\n  "school": "evocation",\n  "data": { "damage": "10d6", "save": "dex" }\n}`}
                  value={contentImportText}
                  onChange={(e) => setContentImportText(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button
                    className="btn btn-gold"
                    onClick={() => {
                      try {
                        const { registry, result } = importContentJSON(contentRegistry, contentImportText, "homebrew");
                        setContentRegistry(registry);
                        setContentImportMsg(`✅ Imported ${result.imported} entries${result.errors.length > 0 ? `, ${result.skipped} skipped` : ""}`);
                      } catch (e: any) {
                        setContentImportMsg(`❌ Import failed: ${e.message}`);
                      }
                    }}
                  >
                    📥 Import
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      // Load sample homebrew spell as example
                      const sample = {
                        id: "thunderclap_enhanced",
                        type: "spell",
                        name: "Thunderclap Enhanced",
                        level: 0,
                        school: "evocation",
                        data: { damage: "1d6+con_mod", damage_type: "thunder", save: "con", aoe: { type: "sphere", size: 5 } },
                        description: "Homebrew cantrip — thunder damage in 5ft radius",
                      };
                      setContentImportText(JSON.stringify(sample, null, 2));
                      setContentImportMsg("Loaded sample homebrew — click Import to register");
                    }}
                  >
                    📋 Load Sample
                  </button>
                  <button className="btn" onClick={() => { setContentImportText(""); setContentImportMsg(""); }}>Clear</button>
                </div>
                {contentImportMsg && (
                  <div style={{ fontSize: 12, color: contentImportMsg.startsWith("✅") ? "#7FA85C" : "#C74B44", marginTop: 6 }}>
                    {contentImportMsg}
                  </div>
                )}
              </div>

              {/* Export section */}
              <div style={{ marginBottom: 14 }}>
                <div className="sec-label">📤 Export Content</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                  <select
                    className="input-main"
                    style={{ width: "auto", padding: "4px 8px", fontSize: 12 }}
                    value={contentFilterType}
                    onChange={(e) => setContentFilterType(e.target.value as ContentType | "all")}
                  >
                    <option value="all">All types</option>
                    <option value="spell">Spells</option>
                    <option value="monster">Monsters</option>
                    <option value="item">Items</option>
                    <option value="magic_item">Magic Items</option>
                    <option value="npc">NPCs</option>
                    <option value="location">Locations</option>
                    <option value="quest">Quests</option>
                  </select>
                  <button
                    className="btn"
                    onClick={() => {
                      if (contentFilterType === "all") {
                        const all = Object.values(contentRegistry.entries);
                        setContentExportText(JSON.stringify(all, null, 2));
                      } else {
                        setContentExportText(exportByType(contentRegistry, contentFilterType));
                      }
                    }}
                  >
                    📤 Export
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      navigator.clipboard?.writeText(contentExportText);
                      setContentImportMsg("📋 Copied to clipboard");
                    }}
                    disabled={!contentExportText}
                  >
                    📋 Copy
                  </button>
                </div>
                {contentExportText && (
                  <textarea
                    className="input-main"
                    style={{ width: "100%", minHeight: 120, fontFamily: "monospace", fontSize: 11, resize: "vertical" }}
                    value={contentExportText}
                    readOnly
                  />
                )}
              </div>

              {/* Browse registry */}
              <div>
                <div className="sec-label">🗂️ Registry Browser</div>
                <div style={{ fontSize: 11, color: "#9C92B8", marginBottom: 4 }}>
                  Showing {contentFilterType === "all" ? "all types" : contentFilterType}:
                </div>
                <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #3A3054", borderRadius: 6, padding: 6 }}>
                  {Object.values(contentRegistry.entries)
                    .filter(e => contentFilterType === "all" || e.type === contentFilterType)
                    .map((entry) => (
                      <div key={`${entry.type}:${entry.id}`} style={{ padding: "4px 6px", borderBottom: "1px solid #2A2340", fontSize: 11 }}>
                        <span style={{ color: "#E0A83E" }}>{entry.name}</span>
                        <span style={{ color: "#6B6284", marginLeft: 6 }}>[{entry.type}]</span>
                        <span style={{ color: "#7FA85C", marginLeft: 6, fontSize: 10 }}>({entry.source})</span>
                        <span style={{ color: "#8A7F9E", marginLeft: 6, fontSize: 10 }}>v{entry.version}</span>
                      </div>
                    ))}
                  {Object.values(contentRegistry.entries).length === 0 && (
                    <div style={{ fontSize: 12, color: "#8A7F9E", textAlign: "center", padding: 20 }}>
                      No content yet — import homebrew above to populate the registry.
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 12, fontSize: 10, color: "#6B6284", textAlign: "center" }}>
                Domain 35 — Content Management · 8 sub-systems: Registry, Importer, Homebrew, Validator, Version Tracker, Diff, Exporter, Content Pack
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI DM HELPER MODAL — shows AI DM Layer state (Domain 31-35) */}
      {dmHelperOpen && c && (
        <div className="sheet-overlay" onClick={() => setDmHelperOpen(false)}>
          <div className="sheet-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
              <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>🤖 AI DM Helper</span>
              <button className="btn" style={{ padding: "4px 12px" }} onClick={() => setDmHelperOpen(false)}>✕</button>
            </div>
            <div className="sheet-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              {/* Dialogue Intent */}
              <div style={{ marginBottom: 14 }}>
                <div className="sec-label">🔍 Intent Analysis (Domain 31)</div>
                <div style={{ fontSize: 13, color: "#C9BFE0" }}>
                  Last intent: <b style={{ color: "#E0A83E" }}>{lastIntent || "—"}</b>
                </div>
                <div style={{ fontSize: 11, color: "#8A7F9E", marginTop: 4 }}>
                  Engine วิเคราะห์ input ของผู้เล่นเพื่อช่วย AI DM ปรับน้ำเสียง (greeting/negotiate/persuade/intimidate/deceive/trade/etc.)
                </div>
              </div>

              {/* Narrative State */}
              <div style={{ marginBottom: 14 }}>
                <div className="sec-label">📖 Narrative State (Domain 33)</div>
                <div style={{ fontSize: 13, color: "#C9BFE0" }}>
                  Arc phase: <b style={{ color: "#E0A83E" }}>{narrativeEngine?.arc.currentPhase || "—"}</b>
                </div>
                <div style={{ fontSize: 13, color: "#C9BFE0" }}>
                  Current tension: <b style={{ color: "#E0A83E" }}>{narrativeEngine?.pacing.currentTension || "—"}</b>
                </div>
                <div style={{ fontSize: 13, color: "#C9BFE0" }}>
                  Recommended next: <b style={{ color: "#7FA85C" }}>{narrativeEngine?.pacing.recommendedNextTension || "—"}</b>
                </div>
                <div style={{ fontSize: 11, color: "#9C92B8", marginTop: 4 }}>
                  Scenes since rest: {narrativeEngine?.pacing.scenesSinceRest || 0} · since combat: {narrativeEngine?.pacing.scenesSinceCombat || 0} · since revelation: {narrativeEngine?.pacing.scenesSinceRevelation || 0}
                </div>
                {narrativeEngine?.pacing.pacingNotes && narrativeEngine.pacing.pacingNotes.length > 0 && (
                  <div style={{ fontSize: 11, color: "#B9A96A", marginTop: 4 }}>
                    💡 {narrativeEngine.pacing.pacingNotes.join(" · ")}
                  </div>
                )}
              </div>

              {/* Encounter Difficulty */}
              <div style={{ marginBottom: 14 }}>
                <div className="sec-label">⚔️ Encounter Difficulty (Domain 34)</div>
                <div style={{ fontSize: 12, color: "#C9BFE0", marginBottom: 4 }}>
                  Lv.{c.level} XP thresholds (solo play):
                </div>
                {(() => {
                  const t = getDifficultyThresholds(c.level);
                  return (
                    <div style={{ fontSize: 11, color: "#9C92B8", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                      <div>Trivial: <b style={{ color: "#8A7F9E" }}>{t.trivial}</b></div>
                      <div>Low: <b style={{ color: "#7FA85C" }}>{t.low}</b></div>
                      <div>Moderate: <b style={{ color: "#E0A83E" }}>{t.moderate}</b></div>
                      <div>High: <b style={{ color: "#E0734A" }}>{t.high}</b></div>
                      <div>Impossible: <b style={{ color: "#C74B44" }}>{t.impossible}</b></div>
                      <div>Soft daily: <b style={{ color: "#B9A96A" }}>{t.high * 4}</b></div>
                    </div>
                  );
                })()}
                <div style={{ fontSize: 11, color: "#8A7F9E", marginTop: 6 }}>
                  ใช้ตารางนี้เพื่อเลือก CR มอนสเตอร์ — engine จะคำนวณ difficulty อัตโนมัติตอน combat เริ่ม
                </div>
              </div>

              {/* EventBus Activity */}
              <div style={{ marginBottom: 14 }}>
                <div className="sec-label">⚡ EventBus + Features (Domain 28)</div>
                <div style={{ fontSize: 11, color: "#9C92B8" }}>
                  Engine ปล่อย events ทุกครั้งที่มีการกระทำ (on_attack, on_hit, on_damage, on_cast_spell, on_turn_start/end)
                </div>
                <div style={{ fontSize: 11, color: "#C9BFE0", marginTop: 4 }}>
                  Features ที่ trigger อัตโนมัติผ่าน EventBus:
                </div>
                <ul style={{ fontSize: 11, color: "#9C92B8", paddingLeft: 18, marginTop: 2 }}>
                  <li><b>poison_weapon</b> — on_hit → apply poisoned</li>
                  <li><b>savage_attacker</b> — on_hit → +1d6 damage</li>
                  <li><b>relentless_endurance</b> — on_damage_taken → heal 1 instead of dying</li>
                  <li><b>riposte</b> — on_miss → reaction attack</li>
                  <li><b>polearm_master</b> — on_enter_area → reaction attack</li>
                </ul>
              </div>

              {/* Save Version */}
              <div>
                <div className="sec-label">💾 Engine Status</div>
                <div style={{ fontSize: 11, color: "#9C92B8" }}>
                  Save version: v3 · Domain modules: 36 · Engine adapters: ✅ Active
                </div>
                <div style={{ fontSize: 11, color: "#8A7F9E", marginTop: 4 }}>
                  Engine ทำงานร่วมกับ legacy DnDSolo.tsx ผ่าน engineAdapters.ts — ทุก domain สามารถ introspect ผ่าน DOMAINS metadata table
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAP MODAL */}
      {mapOpen && (
        <div className="sheet-overlay" onClick={() => setMapOpen(false)}>
          <div className="sheet-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
              <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>🗺️ แผนที่</span>
              <button className="btn" style={{ padding: "4px 12px" }} onClick={() => setMapOpen(false)}>✕</button>
            </div>
            <div className="sheet-body" style={{ overflow: "auto" }}>
              {!map || Object.keys(map.nodes).length === 0 ? (
                <div style={{ fontSize: 13, color: "#8A7F9E", textAlign: "center", padding: 30 }}>ยังไม่มีสถานที่บนแผนที่ — ออกสำรวจเพื่อค้นพบโลก</div>
              ) : (() => {
                const nodes = Object.entries(map.nodes);
                const CELL = 92, PAD = 60;
                const xs = nodes.map(([, n]: any) => n.x), ys = nodes.map(([, n]: any) => n.y);
                const minX = Math.min(...xs), minY = Math.min(...ys);
                const W = (Math.max(...xs) - minX + 1) * CELL + PAD * 2;
                const H = (Math.max(...ys) - minY + 1) * CELL + PAD * 2;
                const px = (n: any) => (n.x - minX) * CELL + PAD;
                const py = (n: any) => (n.y - minY) * CELL + PAD;
                return (
                  <svg width={Math.max(W, 300)} height={Math.max(H, 200)} style={{ display: "block", margin: "0 auto" }}>
                    {map.edges.map(([a, b]: any, i: number) => {
                      const na = map.nodes[a], nb = map.nodes[b];
                      if (!na || !nb) return null;
                      return <line key={i} x1={px(na)} y1={py(na)} x2={px(nb)} y2={py(nb)} stroke="#4A3F6E" strokeWidth="2.5" strokeDasharray="5 4" />;
                    })}
                    {nodes.map(([id, n]: any) => {
                      const cur = id === map.current;
                      return (
                        <g key={id}>
                          {cur && <circle cx={px(n)} cy={py(n)} r="26" fill="none" stroke="#E0A83E" strokeWidth="2.5" opacity="0.9" />}
                          <circle cx={px(n)} cy={py(n)} r="20" fill={cur ? "#3A2F5C" : "#221C38"} stroke={cur ? "#E0A83E" : "#3A3054"} strokeWidth="1.5" />
                          <text x={px(n)} y={py(n) + 6} textAnchor="middle" fontSize="17">{MAP_ICON[n.type] || "📍"}</text>
                          <text x={px(n)} y={py(n) + 38} textAnchor="middle" fontSize="11" fill={cur ? "#E0A83E" : "#C9BFE0"} fontFamily="Sarabun" fontWeight={cur ? "700" : "500"}>{n.name}</text>
                        </g>
                      );
                    })}
                  </svg>
                );
              })()}
              <div style={{ fontSize: 11, color: "#8A7F9E", textAlign: "center", marginTop: 8 }}>
                🏘️ เมือง · 🏠 อาคาร · ▦ ห้อง · 🕳️ ดันเจี้ยน · 🌲 ป่า/ถนน — วงทองคือตำแหน่งปัจจุบัน
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DUNGEON MAP MODAL — Domain 36: top-down room layout with fog-of-war */}
      {dungeonMapOpen && dungeonBlueprint && dungeonRun && (() => {
        const info = getVisibleDungeonInfo(dungeonRun, dungeonBlueprint);
        const visibleRooms = info.visibleRooms;
        const CELL = 100, PAD = 50;
        // Calculate layout: place rooms in a grid based on connection topology
        // Use a simple BFS layout from entrance
        const roomPositions: Record<string, { x: number; y: number }> = {};
        const entrance = dungeonBlueprint.rooms.find((r) => r.id === dungeonBlueprint.entranceRoomId);
        if (entrance) {
          roomPositions[entrance.id] = { x: 0, y: 0 };
          const queue: Array<{ id: string; depth: number; siblingIdx: number }> = [{ id: entrance.id, depth: 0, siblingIdx: 0 }];
          const visited = new Set<string>([entrance.id]);
          const depthCounts: Record<number, number> = { 0: 1 };
          while (queue.length > 0) {
            const cur = queue.shift()!;
            for (const conn of dungeonBlueprint.connections) {
              let otherId: string | null = null;
              if (conn.from === cur.id && !visited.has(conn.to)) otherId = conn.to;
              else if (conn.to === cur.id && !visited.has(conn.from)) otherId = conn.from;
              if (!otherId) continue;
              // Skip secret connections unless discovered
              if (conn.isSecret && !dungeonRun.discoveredSecretConnectionIds.includes(conn.id)) continue;
              visited.add(otherId);
              const nextDepth = cur.depth + 1;
              depthCounts[nextDepth] = (depthCounts[nextDepth] || 0) + 1;
              // Layout: x = depth * 2, y = siblingIdx
              roomPositions[otherId] = { x: nextDepth, y: depthCounts[nextDepth] - 1 };
              queue.push({ id: otherId, depth: nextDepth, siblingIdx: depthCounts[nextDepth] - 1 });
            }
          }
        }
        // Adjust y to center each depth column
        const depthRooms: Record<number, string[]> = {};
        for (const [id, pos] of Object.entries(roomPositions)) {
          if (!depthRooms[pos.x]) depthRooms[pos.x] = [];
          depthRooms[pos.x].push(id);
        }
        // Recenter y for each depth
        for (const [id, pos] of Object.entries(roomPositions)) {
          const siblings = depthRooms[pos.x];
          const total = siblings.length;
          const idx = siblings.indexOf(id);
          roomPositions[id] = { x: pos.x, y: idx - (total - 1) / 2 };
        }
        // Only include visible rooms
        const visibleIds = new Set(visibleRooms.map((r) => r.roomId));
        const visiblePositions = Object.entries(roomPositions).filter(([id]) => visibleIds.has(id));
        if (visiblePositions.length === 0) return null;
        const xs = visiblePositions.map(([, p]) => p.x);
        const ys = visiblePositions.map(([, p]) => p.y);
        const minX = Math.min(...xs), minY = Math.min(...ys);
        const maxX = Math.max(...xs), maxY = Math.max(...ys);
        const W = (maxX - minX + 1) * CELL + PAD * 2;
        const H = (maxY - minY + 1) * CELL + PAD * 2;
        const px = (p: { x: number; y: number }) => (p.x - minX) * CELL + PAD + CELL / 2;
        const py = (p: { x: number; y: number }) => (p.y - minY) * CELL + PAD + CELL / 2;
        return (
          <div className="sheet-overlay" onClick={() => setDungeonMapOpen(false)}>
            <div className="sheet-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
                <div>
                  <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>🏰 {dungeonBlueprint.name}</span>
                  <span style={{ fontSize: 11, color: "#8A7F9E", marginLeft: 8 }}>Theme: {dungeonBlueprint.theme} · แนะนำ Lv.{dungeonBlueprint.recommendedLevel}</span>
                </div>
                <button className="btn" style={{ padding: "4px 12px" }} onClick={() => setDungeonMapOpen(false)}>✕</button>
              </div>
              <div className="sheet-body" style={{ overflow: "auto" }}>
                {/* Progress panel */}
                <div style={{ padding: "8px 12px", background: "#1A142A", borderRadius: 6, marginBottom: 10, fontSize: 12 }}>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span style={{ color: "#7FA85C" }}>✓ Cleared: <b>{dungeonRun.roomsCleared}/{dungeonRun.totalRooms}</b></span>
                    <span style={{ color: dungeonRun.bossDefeated ? "#7FA85C" : "#C74B44" }}>{dungeonRun.bossDefeated ? "🏆 Boss defeated" : "💀 Boss: " + (dungeonRun.hasReachedBoss ? "encountered" : "not yet")}</span>
                    <span style={{ color: "#E0A83E" }}>❓ Secrets: <b>{dungeonRun.secretsFound}/{dungeonRun.totalSecrets}</b></span>
                    <span style={{ color: "#9C92B8" }}>Progress: <b>{Math.round(dungeonRun.progress * 100)}%</b></span>
                  </div>
                  {dungeonBlueprint.hook && <div style={{ marginTop: 4, fontSize: 11, color: "#8A7F9E" }}>📜 {dungeonBlueprint.hook}</div>}
                </div>
                {/* SVG map */}
                <svg width={Math.max(W, 300)} height={Math.max(H, 200)} style={{ display: "block", margin: "0 auto" }}>
                  {/* Connections */}
                  {dungeonBlueprint.connections.map((conn: RoomConnection) => {
                    const fromPos = roomPositions[conn.from];
                    const toPos = roomPositions[conn.to];
                    if (!fromPos || !toPos) return null;
                    // Hide secret connections unless discovered
                    if (conn.isSecret && !dungeonRun.discoveredSecretConnectionIds.includes(conn.id)) return null;
                    // Hide if either endpoint isn't visible
                    if (!visibleIds.has(conn.from) || !visibleIds.has(conn.to)) return null;
                    const isDiscoveredSecret = conn.isSecret && dungeonRun.discoveredSecretConnectionIds.includes(conn.id);
                    const isLocked = conn.isLocked;
                    return (
                      <line
                        key={conn.id}
                        x1={px(fromPos)} y1={py(fromPos)}
                        x2={px(toPos)} y2={py(toPos)}
                        stroke={isDiscoveredSecret ? "#B97EE5" : isLocked ? "#C74B44" : "#4A3F6E"}
                        strokeWidth="2.5"
                        strokeDasharray={isDiscoveredSecret ? "3 3" : "5 4"}
                      />
                    );
                  })}
                  {/* Rooms */}
                  {visibleRooms.map((r) => {
                    const pos = roomPositions[r.roomId];
                    if (!pos) return null;
                    const isCurrent = r.isCurrent;
                    const isVisited = r.visited;
                    const isCleared = dungeonRun.clearedRoomIds.includes(r.roomId);
                    const isBoss = r.roomId === dungeonBlueprint.bossRoomId;
                    const isSecretDiscovered = r.isSecretDiscovered;
                    // Find room to get role icon
                    const room = dungeonBlueprint.rooms.find((rr) => rr.id === r.roomId);
                    const roleIcon = room ? getRoomRoleIcon(room.role) : "📍";
                    const fill = isCurrent ? "#3A2F5C" : isCleared ? "#1A3A2A" : isVisited ? "#2A2040" : "#221C38";
                    const stroke = isCurrent ? "#E0A83E" : isCleared ? "#7FA85C" : isBoss ? "#C74B44" : isSecretDiscovered ? "#B97EE5" : "#3A3054";
                    return (
                      <g key={r.roomId}>
                        {isCurrent && <circle cx={px(pos)} cy={py(pos)} r="32" fill="none" stroke="#E0A83E" strokeWidth="2.5" opacity="0.9" />}
                        <rect
                          x={px(pos) - 28} y={py(pos) - 22}
                          width="56" height="44" rx="6"
                          fill={fill} stroke={stroke} strokeWidth="2"
                          opacity={isVisited || isCurrent ? 1 : 0.5}
                        />
                        <text x={px(pos)} y={py(pos) - 2} textAnchor="middle" fontSize="16">{roleIcon}</text>
                        <text x={px(pos)} y={py(pos) + 14} textAnchor="middle" fontSize="9" fill={isCurrent ? "#E0A83E" : isCleared ? "#7FA85C" : "#C9BFE0"} fontFamily="Sarabun" fontWeight={isCurrent ? "700" : "500"}>
                          {(isVisited || isCurrent) ? r.name.slice(0, 8) : "❓"}
                        </text>
                        {isCleared && <text x={px(pos) + 22} y={py(pos) - 18} fontSize="13">✓</text>}
                        {isBoss && !isCleared && <text x={px(pos) + 22} y={py(pos) - 18} fontSize="13">💀</text>}
                      </g>
                    );
                  })}
                </svg>
                {/* Available exits from current room */}
                {info.availableExits.length > 0 && (
                  <div style={{ marginTop: 14, padding: "8px 12px", background: "#1A142A", borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: "#8A7F9E", marginBottom: 6 }}>ทางออกจากห้องปัจจุบัน:</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {info.availableExits.map((exit) => (
                        <span key={exit.connection.id} style={{
                          fontSize: 11, padding: "3px 8px",
                          background: exit.isLocked ? "#3A1A2A" : exit.isSecret ? "#2A1A3A" : "#1A2A3A",
                          border: `1px solid ${exit.isLocked ? "#7A3B5E" : exit.isSecret ? "#7A5EB0" : "#3B6E7A"}`,
                          borderRadius: 4, color: "#C9BFE0",
                        }}>
                          {exit.isSecret ? "🔓 " : exit.isLocked ? "🔒 " : ""}{exit.connection.direction.toUpperCase()} → {getConnectionTypeLabel(exit.connection.type)}
                          {exit.destinationRoom ? ` · ${exit.destinationRoom.name}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Legend */}
                <div style={{ fontSize: 11, color: "#8A7F9E", textAlign: "center", marginTop: 10, lineHeight: 1.7 }}>
                  🚪 entrance · 🧩 puzzle · ⚠️ setback · 💀 climax/boss · 💎 reward → transition · ❓ secret<br/>
                  วงทอง = ห้องปัจจุบัน · เขียว = ผ่านแล้ว · แดง = บอส · ม่วง = ความลับที่ค้นพบ · จาง = ยังไม่เคยไป
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CHARACTER SHEET MODAL */}
      {sheetOpen && (
        <div className="sheet-overlay" onClick={() => setSheetOpen(false)}>
          <div className="sheet-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px 0" }}>
              <div>
                <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>{c.name}</span>
                <span style={{ fontSize: 12, color: "#8A7F9E", marginLeft: 8 }}>{RACES[c.race].th} {cls.th} · Level {c.level}{c.background && BACKGROUNDS[c.background] ? ` · ${BACKGROUNDS[c.background].th}` : ""}</span>
              </div>
              <button className="btn" style={{ padding: "4px 12px" }} onClick={() => setSheetOpen(false)}>✕</button>
            </div>
            <div className="sheet-tabs">
              {[["stats", "ค่าสถานะ"], ["skills", "สกิล"], ["items", "อุปกรณ์"], ["spells", "เวทมนตร์"]].map(([k, label]) => (
                <div key={k as string} className={"sheet-tab" + (sheetTab === k ? " active" : "")} onClick={() => setSheetTab(k as any)}>{label as string}</div>
              ))}
            </div>
            <div className="sheet-body">
              {sheetTab === "stats" && (
                <div>
                  <div className="abil-grid">
                    {ABILS.map((a) => (
                      <div key={a} className="abil-box">
                        <div className="name">{ABIL_TH[a]}</div>
                        <div className="modv">{mod(c.abilities[a]) >= 0 ? "+" : ""}{mod(c.abilities[a])}</div>
                        <div className="score">{c.abilities[a]}</div>
                      </div>
                    ))}
                  </div>
                  <div className="sec-label">การต่อสู้</div>
                  <div style={{ fontSize: 13, lineHeight: 1.9 }}>
                    🛡 AC <b>{c.ac}</b> · ❤️ HP <b>{c.hp}/{c.maxHp}</b>{(c.tempHp || 0) > 0 && <span style={{ color: "#7FB5E0" }}> +{c.tempHp} temp</span>} · Proficiency <b>+{profByLevel(c.level)}</b> · ⛺ Hit Dice <b>{c.hitDiceLeft}/{c.level}</b> (d{cls.hitDie})<br />
                    ⚔️ {meleeW.th}: to-hit <b>+{attackMod(c, meleeW)}</b>, damage <b>{meleeW.dmg}{mod(c.abilities[meleeW.abil]) >= 0 ? "+" : ""}{mod(c.abilities[meleeW.abil])}</b>
                    {rangedW && (<><br />🏹 {rangedW.th}: to-hit <b>+{attackMod(c, rangedW)}</b>, damage <b>{rangedW.dmg}{mod(c.abilities[rangedW.abil]) >= 0 ? "+" : ""}{mod(c.abilities[rangedW.abil])}</b></>)}
                    {cls.caster && (<><br />✨ Spell attack <b>+{spellAtkMod(c)}</b> · Spell save DC <b>{spellDC(c)}</b> · Max spell level <b>{maxSpellLv}</b></>)}
                    <br />👁️ Passive Perception: <b>{passivePerception(c)}</b> · 🏃 Speed: <b>{c.speed || 30} ft</b> · ⏰ เวลา: <b>{gameTimeToString(gameTime)}</b>
                    {hasFeature(c, "lay_on_hands") && <><br />🤲 Lay on Hands pool: <b>{c.layOnHandsPool} HP</b></>}
                    {hasFeature(c, "martial_arts") && <><br />🥋 Ki: <b>{c.level - c.kiUsed}/{c.level}</b></>}
                    {hasFeature(c, "rage") && <><br />🔥 Rage uses: <b>{(c.level >= 6 ? 4 : c.level >= 3 ? 3 : 2) - c.rageUsed}/{c.level >= 6 ? 4 : c.level >= 3 ? 3 : 2}</b></>}
                    {hasFeature(c, "bardic_inspiration") && <><br />🎵 Bardic Inspiration: <b>{(mod(c.abilities.cha) || 1) - c.bardicInspirationUsed}/{mod(c.abilities.cha) || 1}</b></>}
                    {hasFeature(c, "sorcery_points") && <><br />💫 Sorcery Points: <b>{c.sorceryPoints}</b></>}
                    <br />⚖️ Alignment: <b>{ALIGNMENTS.find(a => a.id === c.alignment)?.th || c.alignment || "—"}</b>
                    <br />🗣️ ภาษา: <b>{(c.languages || ["Common"]).join(", ")}</b>
                    {c.originFeat && ORIGIN_FEATS[c.originFeat] && <><br />🎯 Origin Feat: <b style={{ color: "#7FA85C" }}>{ORIGIN_FEATS[c.originFeat].th}</b> — {ORIGIN_FEATS[c.originFeat].descriptionTh}</>}
                    {c.toolProficiencies && c.toolProficiencies.length > 0 && <><br />🔧 เครื่องมือ: <b>{c.toolProficiencies.join(", ")}</b></>}
                    {RACES[c.race]?.traits && <><br />🧬 คุณสมบัติเผ่าพันธุ์: <b>{RACES[c.race].traits.join(", ")}</b></>}
                  </div>
                  <div className="sec-label">Saving Throws (การพลิกแพ่ง)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, fontSize: 13 }}>
                    {ABILS.map((a) => (
                      <div key={a}>
                        <span className={CLASSES[c.cls].saves.includes(a) ? "prof" : ""} style={CLASSES[c.cls].saves.includes(a) ? { color: "#E0A83E" } : {}}>
                          {CLASSES[c.cls].saves.includes(a) ? "◆" : "◇"} {ABIL_TH[a]}
                        </span> {saveMod(c, a) >= 0 ? "+" : ""}{saveMod(c, a)}
                      </div>
                    ))}
                  </div>
                  <div className="sec-label">ความสามารถประจำคลาส</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                    {/* Phase 2: use extended features (Lv.1-20) */}
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((lv) => ((getExtendedFeatures()[c.cls]?.[lv]) || []).map((f: any) => {
                      const unlocked = c.level >= lv;
                      let status: string | null = null;
                      if (unlocked) {
                        if (f.k === "second_wind") status = c.secondWindUsed ? "used" : "ready";
                        if (f.k === "action_surge") status = c.actionSurgeUsed ? "used" : "ready";
                        if (f.k === "preserve_life") status = c.preserveLifeUsed ? "used" : "ready";
                        if (f.k === "arcane_recovery") status = c.arcaneRecoveryUsed ? "used" : "ready";
                        if (f.k === "sneak_attack") status = `+${sneakDice(c.level)}d6`;
                      }
                      return (
                        <div key={f.k + lv} style={{ marginBottom: 6, opacity: unlocked ? 1 : 0.4 }}>
                          <b style={{ color: unlocked ? "#E0A83E" : "#8A7F9E", fontSize: 12 }}>{unlocked ? "◆" : "🔒"} Lv.{lv} — {f.th}</b>
                          {status && <span style={{ fontSize: 10, color: status.includes("used") ? "#C74B44" : "#7FA85C", marginLeft: 6 }}>[{status}]</span>}
                          <div style={{ fontSize: 11, color: "#9C92B8" }}>{f.desc}</div>
                        </div>
                      );
                    }))}
                    {cls.caster && (
                      <div style={{ marginTop: 8 }}>Spell slots: {c.slotsMax.map((m: number, i: number) => `Lv${i + 1} ${c.slots[i]}/${m}`).join(" · ")}</div>
                    )}
                  </div>
                  <div className="sec-label">สภาวะ (Conditions)</div>
                  <div style={{ fontSize: 12 }}>
                    {c.conditions.length === 0 ? <span style={{ color: "#7FA85C" }}>No active conditions</span>
                      : c.conditions.map((cd: string) => <span key={cd} className="chip">{CONDITIONS_TH[cd]?.split(" (")[0] || cd}</span>)}
                  </div>
                  <div className="sec-label">ความคืบหน้า</div>
                  <div style={{ fontSize: 13 }}>
                    XP {c.xp}{c.level < 20 ? ` / ${XP_THRESHOLDS[c.level]} (${XP_THRESHOLDS[c.level] - c.xp} to Lv.${c.level + 1})` : " (max level)"}
                  </div>
                </div>
              )}
              {sheetTab === "skills" && (
                <div>
                  <div style={{ fontSize: 12, color: "#8A7F9E", marginBottom: 8 }}>◆ = proficient (+{profByLevel(c.level)}) · ◆◆ = Expertise (×{profByLevel(c.level) * 2})</div>
                  {(c.pendingExpertise || 0) > 0 && (
                    <div style={{ padding: 8, background: "#2A2030", border: "1px solid #E0A83E", borderRadius: 6, marginBottom: 10 }}>
                      <div style={{ color: "#E0A83E", fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                        🎯 Expertise unlock! เลือก {c.pendingExpertise} สกิล (ต้อง proficient ก่อน) — PB ×2
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                        {Object.entries(SKILLS).filter(([k]) => {
                          const prof = CLASSES[c.cls].skills.includes(k) || (c.extraSkills || []).includes(k);
                          const alreadyExp = (c.expertise || []).includes(k);
                          return prof && !alreadyExp;
                        }).map(([k, s]) => (
                          <button key={k} className="btn" style={{ padding: "4px 8px", fontSize: 10 }}
                            onClick={() => {
                              const nc = { ...c, expertise: [...(c.expertise || []), k], pendingExpertise: c.pendingExpertise - 1 };
                              setC(nc); setLog([...log, entrySystem(`🎯 เลือก Expertise: ${s.th} (PB ×2)`)]);
                              persist(nc, scene, [...log, entrySystem(`🎯 Expertise: ${s.th}`)], combat, history);
                            }}>
                            {s.th.split(" (")[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {Object.entries(SKILLS).map(([k, s]) => {
                    const prof = CLASSES[c.cls].skills.includes(k) || (c.extraSkills || []).includes(k);
                    const fromBg = !CLASSES[c.cls].skills.includes(k) && (c.extraSkills || []).includes(k);
                    const expertise = (c.expertise || []).includes(k);
                    const m = skillMod(c, k);
                    return (
                      <div key={k} className="skill-row">
                        <span className={prof ? "prof" : ""}>{expertise ? "◆◆" : prof ? "◆" : "◇"} {s.th} <span style={{ color: "#6B6284", fontSize: 11 }}>({ABIL_TH[s.abil]}{fromBg ? " · bg" : ""})</span></span>
                        <b>{m >= 0 ? "+" : ""}{m}</b>
                      </div>
                    );
                  })}
                </div>
              )}
              {sheetTab === "items" && (
                <div>
                  <div className="sec-label">สวมใส่ / ถืออยู่</div>
                  <div className="item-row">⚔️ <b>{meleeW.th}</b> — {meleeW.dmg} ({ABIL_TH[meleeW.abil]}){meleeW.plus ? ` · +${meleeW.plus}` : ""}{meleeW.venom ? ` · 🐍 venom ${c.venomUsed ? "used" : "ready"}` : ""}</div>
                  {rangedW && <div className="item-row">🏹 <b>{rangedW.th}</b> — {rangedW.dmg} ({ABIL_TH[rangedW.abil]}){rangedW.plus ? ` · +${rangedW.plus}` : ""}</div>}
                  <div className="item-row">🛡 {(c.worn || []).find((n: string) => MAGIC_ITEMS[n] && MAGIC_ITEMS[n].slot === "armor") || "Class armor"} — AC {c.ac}</div>
                  {(c.worn || []).filter((n: string) => !(MAGIC_ITEMS[n] && MAGIC_ITEMS[n].slot === "armor")).map((n: string) => (
                    <div key={n} className="item-row">✨ <b>{n}</b> <span style={{ fontSize: 11, color: "#8A7F9E" }}>— {MAGIC_ITEMS[n] ? MAGIC_ITEMS[n].desc : ""}</span></div>
                  ))}
                  <div className="sec-label">เป้สัมภาระ ({c.inventory.length})</div>
                  {c.inventory.length === 0 ? <div style={{ fontSize: 13, color: "#8A7F9E" }}>Empty</div>
                    : c.inventory.map((it: string, i: number) => {
                      const wEntry = weaponByName(it);
                      const consum = CONSUMABLES[it];
                      const magic = MAGIC_ITEMS[it];
                      const armor = ARMOR[it];
                      const isEquipped = wEntry && (wEntry[0] === c.weapon || wEntry[0] === c.ranged);
                      const isWorn = (c.worn || []).includes(it);
                      return (
                        <div key={i} className="item-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12 }}>
                            {wEntry ? (wEntry[1].ranged ? "🏹" : "⚔️") : magic ? "✨" : armor ? "🛡" : consum ? "🧪" : "🎒"} {it}{isEquipped ? " (equipped)" : ""}{isWorn ? " (worn)" : ""}
                            {(magic||armor) && <span style={{ display: "block", fontSize: 10, color: "#8A7F9E" }}>{magic?.desc || (armor ? `AC ${armor.acBase}${armor.dexBonus ? "+DEX" : ""}${armor.maxDex ? ` (max ${armor.maxDex})` : ""}` : "")}</span>}
                          </span>
                          <div style={{ display: "flex", gap: 4 }}>
                            {wEntry && !isEquipped && (
                              <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => {
                                const [wk, w] = wEntry;
                                const cc = w.ranged ? { ...c, ranged: wk } : { ...c, weapon: wk };
                                const finalLog = [...log, entrySystem(`Switched weapon: ${w.th}`)];
                                setC(cc); setLog(finalLog); persist(cc, scene, finalLog, combat, history);
                              }}>Equip</button>
                            )}
                            {(magic || armor) && (
                              <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => {
                                let worn = [...(c.worn || [])];
                                const entries: any[] = [];
                                const slot = magic?.slot || armor?.slot || "armor";
                                if (isWorn) {
                                  worn = worn.filter((n) => n !== it);
                                  entries.push(entrySystem(`Unequipped ${it}`));
                                } else {
                                  worn = worn.filter((n) => !((MAGIC_ITEMS[n]||ARMOR[n]) && (MAGIC_ITEMS[n]?.slot || ARMOR[n]?.slot) === slot));
                                  worn.push(it);
                                  entries.push(entrySystem(`✨ Equipped ${it}`));
                                }
                                const cc = { ...c, worn };
                                const oldAc = cc.ac;
                                cc.ac = computeAC(cc);
                                if (cc.ac !== oldAc) entries.push(entrySystem(`🛡 AC ${oldAc} → ${cc.ac}`));
                                const finalLog = [...log, ...entries];
                                setC(cc); setLog(finalLog); persist(cc, scene, finalLog, combat, history);
                              }}>{isWorn ? "Unequip" : "Wear"}</button>
                            )}
                            {consum && !combat && !thinking && (
                              <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => {
                                const cc = { ...c, inventory: [...c.inventory] };
                                cc.inventory.splice(i, 1);
                                const entries: any[] = [];
                                if (consum.heal) {
                                  const h = rollFormula(consum.heal);
                                  cc.hp = Math.min(cc.maxHp, cc.hp + h.total);
                                  entries.push(entrySystem(`🧪 Used ${it}: healed ${h.total} HP → ${cc.hp}/${cc.maxHp}`));
                                }
                                if (consum.cure) {
                                  const ci = cc.conditions.indexOf(consum.cure);
                                  cc.conditions = [...cc.conditions];
                                  if (ci >= 0) { cc.conditions.splice(ci, 1); entries.push(entrySystem(`🧪 Cured ${consum.cure}`)); }
                                  else entries.push(entrySystem(`🧪 No ${consum.cure} to cure (wasted)`));
                                }
                                const finalLog = [...log, ...entries];
                                setC(cc); setLog(finalLog); persist(cc, scene, finalLog, combat, history);
                              }}>Use</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  <div className="sec-label">ทรัพย์สิน</div>
                  <div className="item-row">💰 {c.gold} gold pieces</div>
                </div>
              )}
              {sheetTab === "spells" && cls.caster && (
                <div>
                  <div className="sec-label">เวทมนตร์ที่รู้ ({knownSpellsList.length})</div>
                  {knownSpellsList.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#8A7F9E" }}>ยังไม่ได้เรียนเวท. หา spell scroll หรือหาอาจารย์สอนเวท</div>
                  ) : (
                    knownSpellsList.map((idx: string) => (
                      <div key={idx} className="spell-row known" onClick={() => viewSpellDetail(idx)}>
                        <b style={{ color: "#E0A83E" }}>{idx.split("-").map((w:string)=>w.charAt(0).toUpperCase()+w.slice(1)).join(" ")}</b>
                        <button className="btn" style={{ padding: "2px 8px", fontSize: 10, marginLeft: 8 }} onClick={(e) => { e.stopPropagation(); viewSpellDetail(idx); }}>Details</button>
                      </div>
                    ))
                  )}
                  <div style={{ marginTop: 14 }}>
                    <button className="btn btn-gold" style={{ width: "100%" }} disabled={!SRD_OK || spellBrowserLoading} onClick={openSpellBrowser}>
                      {spellBrowserLoading ? "กำลังโหลดเวท SRD..." : "📖 ค้นหาเวท SRD ทั้งหมด (เรียนรู้)"}
                    </button>
                  </div>
                  {spellBrowserOpen && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, color: "#8A7F9E", marginBottom: 6 }}>
                        มีเวท {availableSpells.length} อันให้ {cls.th} (Lv.0–{maxSpellLv}) กดเพื่อเรียน
                      </div>
                      <div style={{ maxHeight: 300, overflowY: "auto" }}>
                        {availableSpells.map((sp) => {
                          const known = knownSpellsList.includes(sp.index);
                          return (
                            <div key={sp.index} className={"spell-row" + (known ? " known" : "")} onClick={() => viewSpellDetail(sp.index)}>
                              <span style={{ fontSize: 12 }}>
                                <b style={{ color: known ? "#6FB3AB" : "#E0A83E" }}>{sp.level === 0 ? "Cantrip" : `Lv.${sp.level}`}</b> {sp.name}
                              </span>
                              {!known && <button className="btn" style={{ padding: "2px 8px", fontSize: 10, float: "right" }} onClick={(e) => { e.stopPropagation(); learnSpell(sp.index); }}>Learn</button>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {spellDetailLoading && <div style={{ fontSize: 12, color: "#8A7F9E", marginTop: 10 }}>Loading spell details...</div>}
                  {spellDetail && (
                    <div className="panel" style={{ padding: 12, marginTop: 10, fontSize: 12 }}>
                      <div style={{ fontWeight: 700, color: "#E0A83E", fontSize: 14 }}>{spellDetail.name}</div>
                      <div style={{ color: "#9C92B8", marginTop: 4 }}>
                        Lv.{spellDetail.level} {spellDetail.school} · {spellDetail.casting_time} · {spellDetail.range} · {spellDetail.duration}{spellDetail.concentration ? " (concentration)" : ""}{spellDetail.ritual ? " (ritual)" : ""}
                      </div>
                      <div style={{ marginTop: 6, color: "#C9BFE0" }}>{spellDetail.desc}</div>
                      {spellDetail.higher_level && <div style={{ marginTop: 4, color: "#8A7F9E", fontSize: 11 }}>Upcast: {spellDetail.higher_level}</div>}
                      <div style={{ marginTop: 6, fontSize: 11, color: "#B9A96A" }}>
                        Components: {spellDetail.components.join(", ")} · Classes: {spellDetail.classes.join(", ")}
                      </div>
                      {spellDetail.damage && <div style={{ marginTop: 4, color: "#E0766D", fontSize: 11 }}>Damage: {spellDetail.damage} {spellDetail.damageType} ({spellDetail.damageScaling})</div>}
                      {spellDetail.heal && <div style={{ marginTop: 4, color: "#7FA85C", fontSize: 11 }}>Heal: {spellDetail.heal}</div>}
                      {spellDetail.saveAbility && <div style={{ marginTop: 4, color: "#E0A83E", fontSize: 11 }}>Save: {spellDetail.saveAbility.toUpperCase()} ({spellDetail.saveSuccess})</div>}
                    </div>
                  )}
                </div>
              )}
              {sheetTab === "spells" && !cls.caster && (
                <div style={{ fontSize: 13, color: "#8A7F9E", textAlign: "center", padding: 30 }}>{cls.th} is not a spellcaster</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* COMBAT PANEL */}
      {combat && (
        <div style={{ borderTop: "1px solid #6E3448", background: "#1A0F1C", padding: "10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span className="dnd-display" style={{ color: "#C74B44", fontSize: 14 }}>⚔ ต่อสู้ · รอบที่ {combat.round}</span>
            <span style={{ fontSize: 11, color: "#8A7F9E" }}>🏃 เคลื่อนที่: {combat.movementLeft || 0} ช่อง</span>
          </div>

          {/* TACTICAL BATTLE GRID */}
          {combat.grid && combat.playerPos && (
            <div style={{ marginBottom: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {/* Battle grid SVG */}
              <div style={{ flex: "1 1 320px", minWidth: 280 }}>
                <svg viewBox={`0 0 ${combat.grid.w * 28} ${combat.grid.h * 28}`} style={{ width: "100%", maxWidth: 380, background: "#0F0A18", border: "1px solid #3A3054", borderRadius: 8 }}>
                  {/* Grid lines */}
                  {Array.from({ length: combat.grid.w + 1 }).map((_, i) => (
                    <line key={"v"+i} x1={i * 28} y1={0} x2={i * 28} y2={combat.grid.h * 28} stroke="#2A2244" strokeWidth="0.5" />
                  ))}
                  {Array.from({ length: combat.grid.h + 1 }).map((_, i) => (
                    <line key={"h"+i} x1={0} y1={i * 28} x2={combat.grid.w * 28} y2={i * 28} stroke="#2A2244" strokeWidth="0.5" />
                  ))}
                  {/* Clickable squares for movement */}
                  {Array.from({ length: combat.grid.h }).map((_, ry) =>
                    Array.from({ length: combat.grid.w }).map((_, rx) => {
                      const isPlayer = combat.playerPos.x === rx && combat.playerPos.y === ry;
                      const enemyAt = combat.enemies.find((e: any) => e.hpNow > 0 && combat.enemyPositions[e.uid]?.x === rx && combat.enemyPositions[e.uid]?.y === ry);
                      const deadEnemyAt = combat.enemies.find((e: any) => e.hpNow <= 0 && combat.enemyPositions[e.uid]?.x === rx && combat.enemyPositions[e.uid]?.y === ry);
                      const dist = gridDistance(combat.playerPos, { x: rx, y: ry });
                      const canMove = !isPlayer && !enemyAt && dist <= (combat.movementLeft || 0) && dist > 0 && !deadEnemyAt;
                      return (
                        <g key={`sq-${rx}-${ry}`}>
                          {/* Highlight movement range */}
                          {canMove && (
                            <rect x={rx * 28 + 1} y={ry * 28 + 1} width={26} height={26} fill="#1E3A2A" stroke="#3B6E5E" strokeWidth="0.5" opacity="0.6" style={{ cursor: "pointer" }}
                              onClick={() => !thinking && !downed && playerCombatAction("move", `${rx},${ry}`)} />
                          )}
                          {/* Player token */}
                          {isPlayer && (
                            <g>
                              <circle cx={rx * 28 + 14} cy={ry * 28 + 14} r={11} fill="#4A7FB5" stroke="#7FB5E0" strokeWidth="2" />
                              <text x={rx * 28 + 14} y={ry * 28 + 18} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700">{c.name[0]}</text>
                            </g>
                          )}
                          {/* Enemy token */}
                          {enemyAt && (
                            <g>
                              <circle cx={rx * 28 + 14} cy={ry * 28 + 14} r={11} fill="#B53A3A" stroke="#E0766D" strokeWidth="2" />
                              <text x={rx * 28 + 14} y={ry * 28 + 18} textAnchor="middle" fontSize="10" fill="#fff" fontWeight="700">{enemyAt.th[0]}</text>
                              {/* HP bar under enemy */}
                              <rect x={rx * 28 + 4} y={ry * 28 + 24} width={20} height={3} fill="#3A1A1A" />
                              <rect x={rx * 28 + 4} y={ry * 28 + 24} width={Math.max(0, 20 * (enemyAt.hpNow / enemyAt.hp))} height={3} fill={enemyAt.hpNow / enemyAt.hp > 0.5 ? "#7FA85C" : enemyAt.hpNow / enemyAt.hp > 0.25 ? "#E0A83E" : "#C74B44"} />
                            </g>
                          )}
                          {/* Dead enemy */}
                          {deadEnemyAt && (
                            <text x={rx * 28 + 14} y={ry * 28 + 18} textAnchor="middle" fontSize="14" opacity="0.4">💀</text>
                          )}
                        </g>
                      );
                    })
                  )}
                </svg>
                <div style={{ fontSize: 10, color: "#6B6284", marginTop: 4, textAlign: "center" }}>
                  พื้นเขียว = เคลื่อนที่ได้ · ฟ้า = คุณ · แดง = ศัตรู (กดพื้นเขียวเพื่อเคลื่อนที่)
                </div>
              </div>

              {/* Initiative tracker — horizontal timeline strip */}
              <div style={{ flex: "0 1 200", minWidth: 120 }}>
                <div style={{ fontSize: 11, color: "#B9A96A", fontWeight: 700, marginBottom: 4 }}> Initiative</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {combat.initOrder && combat.initOrder.map((init: any, i: number) => {
                  const isCurrent = i === combat.currentInitIdx;
                  const isDead = !init.isPlayer && combat.enemies.find((e: any) => e.uid === init.uid)?.hpNow <= 0;
                  const enemy = !init.isPlayer ? combat.enemies.find((e: any) => e.uid === init.uid) : null;
                  const hpPct = enemy ? Math.max(0, (enemy.hpNow / enemy.hp) * 100) : 100;
                  const hpColor = hpPct > 50 ? "#7FA85C" : hpPct > 25 ? "#E0A83E" : "#C74B44";
                  return (
                    <div key={init.uid} style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      padding: "4px 6px", borderRadius: 6, fontSize: 11, minWidth: 44, minHeight: 44,
                      justifyContent: "center",
                      background: isCurrent ? "#3A2F5C" : isDead ? "#1A1018" : "#1E1830",
                      border: isCurrent ? "2px solid #E0A83E" : "1px solid transparent",
                      opacity: isDead ? 0.4 : 1, position: "relative",
                      boxShadow: isCurrent ? "0 0 8px rgba(224,168,62,0.4)" : "none",
                    }}>
                      <span style={{ color: isCurrent ? "#E0A83E" : isDead ? "#8A7F9E" : "#C9BFE0", fontSize: 10 }}>
                        {isCurrent ? "▶" : ""}{init.isPlayer ? "🧙" : "👹"}
                      </span>
                      <span style={{ color: "#8A7F9E", fontSize: 9, maxWidth: 50, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{init.name}</span>
                      <span style={{ color: "#6B6284", fontSize: 9 }}>{init.init}</span>
                      {isDead && <span style={{ fontSize: 8 }}>💀</span>}
                      {/* Mini HP bar for enemies */}
                      {enemy && !isDead && (
                        <div style={{ width: "100%", height: 3, background: "#241E38", borderRadius: 2, marginTop: 2 }}>
                          <div style={{ width: hpPct + "%", height: "100%", background: hpColor, borderRadius: 2, transition: "width 0.3s" }} />
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
            {combat.enemies.map((e: any) => (
              <div key={e.uid} className={"enemy-card" + (e.hpNow <= 0 ? " dead" : "")} style={{ cursor: "pointer", borderColor: (combat.enemies.find(x=>x.uid===e.uid) && e.hpNow > 0) ? "#6E3448" : undefined }}
                onClick={() => { if (e.hpNow > 0 && !thinking && !downed) { /* select target */ } }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{e.hpNow <= 0 ? "💀 " : ""}{e.th}</div>
                <div style={{ fontSize: 11, color: "#8A7F9E" }}>AC {e.ac}{e.cr ? ` · CR ${e.cr}` : ""}</div>
                <div className="hpbar" style={{ height: 12, marginTop: 4 }}>
                  <div className="hpbar-fill" style={{ width: Math.max(0, (e.hpNow / e.hp) * 100) + "%", background: "#C74B44" }} />
                  <span className="hpbar-label" style={{ fontSize: 9 }}>{e.hpNow}/{e.hp}</span>
                </div>
              </div>
            ))}
          </div>
          {downed ? (
            <button className="btn btn-red" style={{ width: "100%", padding: 13 }} disabled={thinking} onClick={() => playerCombatAction("deathsave")}>
              💀 ทอย Death Saving Throw ({c.deathSaves.s}✓ / {c.deathSaves.f}✗)
            </button>
          ) : combatMenu === "spell" ? (
            <div>
              <div style={{ fontSize: 11, color: "#8A7F9E", marginBottom: 6 }}>กดเวทเพื่อร่ายที่ระดับพื้นฐาน</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {knownSpellsList.length === 0 && <div style={{ fontSize: 12, color: "#8A7F9E" }}>ยังไม่ได้เรียนเวท. เปิดสมุดเวทมนตร์ (📜 → เวทมนตร์) เพื่อเรียน</div>}
                {knownSpellsList.map((idx: string) => {
                  // We don't know the level until we fetch. Cast at lowest available slot.
                  return (
                    <button key={idx} className="btn" style={{ textAlign: "left", padding: "6px 10px" }} disabled={thinking} onClick={() => {
                      // Need to fetch spell to know its level, then check slots. Simplify: cast at level 1 (or 0 for cantrip).
                      // Better: fetch first.
                      setThinking(true);
                      (async () => {
                        try {
                          const sp = await fetchSpell(idx, 1, c.level);
                          if (!sp) { setLog((prev) => [...prev, entrySystem("⚠️ Spell not found")]); return; }
                          const slotLv = sp.level === 0 ? 0 : Math.max(sp.level, 1);
                          // Check slot availability
                          if (sp.level > 0 && (c.slots[sp.level - 1] || 0) <= 0) {
                            setLog((prev) => [...prev, entrySystem(`No Lv.${sp.level} slots left`)]);
                            return;
                          }
                          playerCombatAction("spell", `${idx}@${slotLv}`);
                        } finally { setThinking(false); }
                      })();
                    }}>
                      ✨ <b>{idx.split("-").map((w:string)=>w.charAt(0).toUpperCase()+w.slice(1)).join(" ")}</b>
                    </button>
                  );
                })}
                <button className="btn" onClick={() => setCombatMenu("")}>← กลับ</button>
              </div>
            </div>
          ) : combatMenu === "item" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {combatItems.length === 0 && <div style={{ fontSize: 13, color: "#8A7F9E", gridColumn: "1 / -1" }}>No usable combat items</div>}
              {combatItems.map((it: string, i: number) => (
                <button key={it + i} className="btn" disabled={thinking} onClick={() => playerCombatAction("item", it)}>🧪 {it}</button>
              ))}
              <button className="btn" onClick={() => setCombatMenu("")}>← กลับ</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {/* UX fix: Primary actions always visible */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <button className="btn btn-gold" disabled={thinking} onClick={() => playerCombatAction("attack")}>⚔️ โจมตี ({meleeW.th})</button>
                {rangedW && <button className="btn btn-gold" disabled={thinking} onClick={() => playerCombatAction("attack_ranged")}>🏹 ยิง ({rangedW.th})</button>}
                {cls.caster && <button className="btn" disabled={thinking} onClick={() => setCombatMenu("spell")}>✨ ร่ายเวท</button>}
                <button className="btn" disabled={thinking || combatItems.length === 0} onClick={() => setCombatMenu("item")}>🧪 ไอเทม ({combatItems.length})</button>
              </div>
              {/* Secondary actions — class features + tactical */}
              <details style={{ marginTop: 2 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "#8A7F9E", padding: "4px 0" }}>การกระทำเพิ่มเติม</summary>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
                  {hasFeature(c, "second_wind") && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking || c.secondWindUsed} onClick={() => playerCombatAction("second_wind")}>🛡️ Second Wind</button>}
                  {hasFeature(c, "action_surge") && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking || c.actionSurgeUsed} onClick={() => playerCombatAction("action_surge")}>⚡ Action Surge</button>}
                  {hasFeature(c, "rage") && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking || c.raging || c.rageUsed >= (c.level >= 6 ? 4 : c.level >= 3 ? 3 : 2)} onClick={() => playerCombatAction("rage")}>🔥 Rage</button>}
                  {hasFeature(c, "lay_on_hands") && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking || c.layOnHandsPool <= 0 || c.hp >= c.maxHp} onClick={() => playerCombatAction("lay_on_hands")}>🤲 LoH ({c.layOnHandsPool})</button>}
                  {hasFeature(c, "martial_arts") && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking || c.kiUsed >= c.level} onClick={() => playerCombatAction("ki_flurry")}>🥋 Flurry (1ki)</button>}
                  {hasFeature(c, "bardic_inspiration") && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking || c.bardicInspirationUsed >= (mod(c.abilities.cha) || 1)} onClick={() => playerCombatAction("bardic_inspiration")}>🎵 Bardic</button>}
                  {c.heroicInspiration && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("heroic_inspiration")}>⭐ Heroic</button>}
                  {hasFeature(c, "preserve_life") && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking || c.preserveLifeUsed} onClick={() => playerCombatAction("preserve_life")}>🕊️ Preserve</button>}
                  {hasFeature(c, "sneak_attack") && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("hide")}>🌫️ ซ่อน</button>}
                  <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("dodge")}>🌀 Dodge</button>
                  <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("dash")}>🏃 Dash</button>
                  <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("help")}>🤝 Help</button>
                  <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("ready")}>⏰ Ready</button>
                  <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("search")}>🔍 Search</button>
                  <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("disengage")}>🚶 Disengage</button>
                  <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("grapple")}>🤼 จับตรึง</button>
                  <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("shove")}>💪 ผลัก/ล้ม</button>
                  {canDualWield(c) && !combat?.bonusUsed && <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("dual_wield")}>⚔️⚔️ มือนอก</button>}
                  {(c.worn || []).includes("Ring of Invisibility") && !combat.invisible && (
                    <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} disabled={thinking} onClick={() => playerCombatAction("invisible")}>🫥 ล่องหน</button>
                  )}
                </div>
              </details>
              <button className="btn btn-red" disabled={thinking} onClick={() => playerCombatAction("flee")}>🏃 หนี</button>
            </div>
          )}
        </div>
      )}

      {/* INPUT */}
      <div style={{ borderTop: "1px solid #3A3054", background: "rgba(20,16,32,0.95)", padding: "10px 14px" }}>
        {!combat && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            {/* Contextual quick actions — change based on scene type */}
            {c?.sceneType === "social" || c?.sceneType === "town" ? (
              <>
                {["คุยกับคนแถวนี้", "ขอดูสินค้าในร้าน", "ถามข่าวสาร", "เดินไปที่อื่น"].map((q) => (
                  <button key={q} className="btn" style={{ fontSize: 12, padding: "6px 10px" }} disabled={thinking} onClick={() => submitAction(q)}>{q}</button>
                ))}
              </>
            ) : c?.sceneType === "dungeon" ? (
              <>
                {["สำรวจห้องนี้", "ฟังเสียงรอบตัว", "ซ่อนตัว", "เปิดประตูถัดไป"].map((q) => (
                  <button key={q} className="btn" style={{ fontSize: 12, padding: "6px 10px" }} disabled={thinking} onClick={() => submitAction(q)}>{q}</button>
                ))}
              </>
            ) : (
              <>
                {["สำรวจรอบ ๆ", "คุยกับคนแถวนี้", "ตรวจดูให้ละเอียด"].map((q) => (
                  <button key={q} className="btn" style={{ fontSize: 12, padding: "6px 10px" }} disabled={thinking} onClick={() => submitAction(q)}>{q}</button>
                ))}
              </>
            )}
            <button className="btn" style={{ fontSize: 12, padding: "6px 10px" }} disabled={thinking || (c.hitDiceLeft || 0) <= 0} onClick={shortRest}>⛺ พักสั้น ({c.hitDiceLeft || 0})</button>
            <button className="btn" style={{ fontSize: 12, padding: "6px 10px" }} disabled={thinking} onClick={longRest}>🌙 พักยาว</button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, maxWidth: 640, margin: "0 auto" }}>
          <input
            className="input-main"
            placeholder={combat ? "💬 พูด/ตะโกน/ถาม DM (free action — ไม่เสียเทิร์น)..." : "จะทำอะไรต่อ? (พิมพ์ action อิสระ...)"}
            value={input}
            disabled={thinking}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") (combat ? submitCombatTalk : submitAction)(input); }}
          />
          <button className="btn btn-gold" disabled={thinking || !input.trim()} onClick={() => (combat ? submitCombatTalk : submitAction)(input)}>ส่ง</button>
        </div>
      </div>
    </div>
  );
}




