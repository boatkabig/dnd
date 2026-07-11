"use client";

/**
 * Shared symbols pulled out of DnDSolo.tsx so CharacterCreation and AdventureLog
 * no longer import back from the top-level component (that was a circular import:
 * DnDSolo.tsx -> game/* components -> DnDSolo.tsx). Moved verbatim — no behavior
 * change. NOTE: CharacterSheet still imports a few roll/feature helpers from
 * DnDSolo.tsx, so its cycle is only fully broken once those move here too (task
 * #21 de-monolith).
 */

import React from "react";
import { ABILS, BACKGROUNDS, CLASSES, RACES, WEAPONS, mod } from "@/lib/gameData";
import { computeAC, getSlotTable } from "@/lib/spells";

/* ---------------- DICE ENGINE ---------------- */
export const d = (sides: number) => Math.floor(Math.random() * sides) + 1;

/* ---------------- CHARACTER FACTORY ---------------- */
export function makeCharacter(name: string, raceKey: string, classKey: string, bgKey: string, opts?: {
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
    // Task #14: prepared casters keep a spellbook (pool) distinct from the
    // currently-prepared list (knownSpells). Starts equal to the known list.
    spellbook: [...(opts?.knownSpells || [])],
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

/* ---------------- DM (AI via /api/dm) — SRD availability flag ---------------- */
export let SRD_OK = false;
export function setSrdOk(v: boolean) { SRD_OK = v; }

/* ---------------- ROLL TICKET ---------------- */
// F4: Memoized RollTicket — prevents re-render of all roll entries when new ones are added
export const RollTicket = React.memo(function RollTicket({ entry }: { entry: any }) {
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
