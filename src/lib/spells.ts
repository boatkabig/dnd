/**
 * Generic SRD spell resolver + spellbook management.
 *
 * The engine knows how to execute ANY SRD spell by reading its normalized
 * structure (kind, damage, save, heal, aoe, etc.) — there is no per-spell
 * hardcode. The fetcher caches spells for the session and lets casters pick
 * from the full SRD spell list filtered by class & level.
 */

import { fetchSpell, srdListSpells, type NormalizedSpell } from "./srd";
import { CLASSES, mod, profByLevel, SLOT_TABLE, HALF_CASTER_SLOTS, MAGIC_ITEMS } from "./gameData";

/* ----------------- AC computation (D&D 2024 rules) ----------------- */
// D&D 2024 armor rules:
//   Light: AC = base + full DEX mod
//   Medium: AC = base + DEX mod (max 2)
//   Heavy: AC = base (no DEX)
//   Shield: +2 AC (separate slot)
//   Magic armor: +acBonus
//   Buffs: Mage Armor (13+DEX), Haste (+2), Shield (+5 reaction), Shield of Faith (+2), Slow (-2)
//   D&D 2024: no more STR requirement for heavy armor, no more stealth disadvantage (simplified)
export function computeAC(c: any): number {
  const armor = (c.worn || []).map((n: string) => MAGIC_ITEMS[n]).find((m: any) => m && m.slot === "armor");
  let ac: number;
  if (armor) {
    const dexMod = mod(c.abilities.dex);
    if (armor.type === "heavy" || armor.dexBonus === false) {
      // Heavy armor: no DEX bonus
      ac = armor.acBase + (armor.acBonus || 0);
    } else if (armor.type === "medium" || armor.maxDex !== undefined) {
      // Medium armor: DEX bonus capped (usually max 2)
      ac = armor.acBase + Math.min(dexMod, armor.maxDex ?? 2) + (armor.acBonus || 0);
    } else {
      // Light armor: full DEX bonus
      ac = armor.acBase + dexMod + (armor.acBonus || 0);
    }
  } else if (c.mageArmor) {
    // Mage Armor spell: AC = 13 + DEX
    ac = 13 + mod(c.abilities.dex);
  } else {
    // Unarmored: class-based (Barbarian: 10+DEX+CON, Monk: 10+DEX+WIS, etc.)
    ac = CLASSES[c.cls].acCalc(c);
  }
  // Magic items with +AC (Ring of Protection, Cloak of Protection, etc.)
  (c.worn || []).forEach((n: string) => { const m = MAGIC_ITEMS[n]; if (m && m.acPlus) ac += m.acPlus; });
  // Shield equipped (+2 AC)
  if ((c.worn || []).includes("Shield")) ac += 2;
  // Reaction shield spell (+5 AC until next turn)
  if ((c as any).shieldAC) ac += (c as any).shieldAC;
  // Buff AC modifiers (Haste +2, Shield of Faith +2, Slow -2)
  const buffs = c.buffs || [];
  for (const b of buffs) {
    if (b.name === "Haste") ac += 2;
    if (b.name === "Shield Of Faith" || b.name === "Shield of Faith") ac += 2;
    if (b.name === "Slow") ac -= 2;
  }
  return ac;
}

/* ----------------- Spellbook cache ----------------- */
const spellDetailCache = new Map<string, NormalizedSpell | null>();
const classSpellListCache = new Map<string, string[]>(); // "wizard:1" → [spell indices]

/**
 * Fetch + normalize a spell, caching the result.
 */
export async function getSpell(index: string, slotLevel?: number, charLevel = 1): Promise<NormalizedSpell | null> {
  const key = `${index}|${slotLevel || 0}|${charLevel}`;
  if (spellDetailCache.has(key)) return spellDetailCache.get(key) || null;
  const spell = await fetchSpell(index, slotLevel, charLevel);
  spellDetailCache.set(key, spell);
  return spell;
}

/**
 * Fetch all spell indices available to a given class at a given spell level.
 * For cantrips (level 0) we don't filter by class because SRD filters by
 * class via `?spellClass=` — we use that.
 */
export async function getClassSpellIndices(className: string, level: number): Promise<string[]> {
  const key = `${className.toLowerCase()}:${level}`;
  if (classSpellListCache.has(key)) return classSpellListCache.get(key) || [];
  const list = await srdListSpells(className.toLowerCase(), level);
  const indices = (list?.results || []).map((r) => r.index);
  classSpellListCache.set(key, indices);
  return indices;
}

/**
 * Get all spell indices for a class across levels 0..maxLevel.
 */
export async function getClassSpellbook(className: string, maxLevel: number): Promise<{ level: number; spells: string[] }[]> {
  const result: { level: number; spells: string[] }[] = [];
  for (let lv = 0; lv <= maxLevel; lv++) {
    const spells = await getClassSpellIndices(className, lv);
    result.push({ level: lv, spells });
  }
  return result;
}

/* ----------------- Combat spell execution helpers ----------------- */
export function spellAtkMod(c: any): number {
  return mod(c.abilities[CLASSES[c.cls].castAbil]) + profByLevel(c.level);
}
export function spellDC(c: any): number {
  return 8 + mod(c.abilities[CLASSES[c.cls].castAbil]) + profByLevel(c.level);
}

/**
 * Returns the slot table appropriate for the caster type.
 *
 * D&D 2024 PHB:
 *  - Full casters (wizard, cleric, druid, bard, sorcerer): SLOT_TABLE (slots Lv1-9)
 *  - Half-casters (paladin, ranger): HALF_CASTER_SLOTS (max slot Lv5 at Lv17+)
 *  - Warlock (Pact Magic): PACT_MAGIC_SLOTS — slots all at same level, refresh on short rest
 *
 * Warlock Pact Magic (2024 PHB):
 *   Lv1: 1×Lv1 · Lv2-4: 2×Lv1 · Lv5-8: 2×Lv2 · Lv9-10: 2×Lv3
 *   Lv11-16: 3×Lv3 · Lv17-20: 4×Lv5 (cap at slot level 5 per PHB 2024)
 */
export const PACT_MAGIC_SLOTS: Record<number, { count: number; slotLevel: number }> = {
  1: { count: 1, slotLevel: 1 },
  2: { count: 2, slotLevel: 1 },
  3: { count: 2, slotLevel: 1 },
  4: { count: 2, slotLevel: 1 },
  5: { count: 2, slotLevel: 2 },
  6: { count: 2, slotLevel: 2 },
  7: { count: 2, slotLevel: 2 },
  8: { count: 2, slotLevel: 2 },
  9: { count: 2, slotLevel: 3 },
  10: { count: 2, slotLevel: 3 },
  11: { count: 3, slotLevel: 3 },
  12: { count: 3, slotLevel: 3 },
  13: { count: 3, slotLevel: 3 },
  14: { count: 3, slotLevel: 3 },
  15: { count: 3, slotLevel: 3 },
  16: { count: 3, slotLevel: 3 },
  17: { count: 4, slotLevel: 5 },  // E3 fix: cap at Lv5 (not Lv4) per PHB 2024
  18: { count: 4, slotLevel: 5 },
  19: { count: 4, slotLevel: 5 },
  20: { count: 4, slotLevel: 5 },
};

export function getSlotTable(cls: string, level: number): number[] {
  // Half-casters (paladin, ranger) use HALF_CASTER_SLOTS — D&D 2024: start at Lv1 (not Lv2 like 2014)
  if (cls === "paladin" || cls === "ranger") {
    if (level < 1) return [];
    return HALF_CASTER_SLOTS[level] || [];
  }
  // Warlock uses Pact Magic — different from full casters
  // Slots are all at the SAME level (slotLevel), refresh on short rest
  // We represent this as an array where only slotLevel-1 index is filled
  if (cls === "warlock") {
    if (level < 1) return [];
    const pact = PACT_MAGIC_SLOTS[level];
    if (!pact) return [];
    const slots = new Array(9).fill(0);
    slots[pact.slotLevel - 1] = pact.count;
    return slots;
  }
  // Full casters use SLOT_TABLE
  return SLOT_TABLE[level] || [];
}

/**
 * Determine which spell levels a caster can use given their level.
 */
export function maxSpellLevel(cls: string, charLevel: number): number {
  if (cls === "paladin" || cls === "ranger") {
    // D&D 2024: half-casters start casting at Lv1
    if (charLevel < 1) return 0;
    // Half-casters get slots at 1, 5, 9, 13, 17 (per HALF_CASTER_SLOTS table)
    if (charLevel >= 17) return 5;
    if (charLevel >= 13) return 4;
    if (charLevel >= 9) return 3;
    if (charLevel >= 5) return 2;
    return 1;
  }
  // Warlock: Pact Magic — max slot level scales with character level
  if (cls === "warlock") {
    if (charLevel < 1) return 0;
    const pact = PACT_MAGIC_SLOTS[charLevel];
    return pact ? pact.slotLevel : 1;
  }
  // Full casters: spell level = ceil(level/2), capped at 9
  return Math.min(9, Math.ceil(charLevel / 2));
}

/** Check if a caster refreshes slots on short rest (Warlock Pact Magic) */
export function refreshesOnShortRest(cls: string): boolean {
  return cls === "warlock";
}

export { CLASSES, SLOT_TABLE, HALF_CASTER_SLOTS };
