/**
 * D1: Persistent spell cache — stores fetched spells in localStorage
 * so they're available offline after first fetch.
 *
 * Strategy: first fetch from Open5e/SRD → cache to localStorage →
 * subsequent fetches hit cache first (instant + offline).
 *
 * Also includes a small set of "seed spells" that are bundled directly
 * in code (most common cantrips + Lv1 spells) so casters can play
 * immediately even before any API call.
 */

import type { NormalizedSpell } from "./open5e";

const CACHE_KEY = "dnd-solo-spell-cache";
const CACHE_MAX = 500; // max spells to cache

/** Load the persistent cache from localStorage */
function loadCache(): Record<string, NormalizedSpell> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Save cache to localStorage (with size cap) */
function saveCache(cache: Record<string, NormalizedSpell>): void {
  try {
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) {
      // Drop oldest entries (first inserted) — simple FIFO
      const toDrop = keys.slice(0, keys.length - CACHE_MAX);
      for (const k of toDrop) delete cache[k];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

/** Get a spell from persistent cache (returns null if not cached) */
export function getCachedSpell(index: string): NormalizedSpell | null {
  const cache = loadCache();
  return cache[index] || null;
}

/** Store a spell in persistent cache */
export function setCachedSpell(index: string, spell: NormalizedSpell): void {
  const cache = loadCache();
  cache[index] = spell;
  saveCache(cache);
}

/** Check if a spell is cached */
export function isSpellCached(index: string): boolean {
  return getCachedSpell(index) !== null;
}

/** Get all cached spell indices */
export function listCachedSpells(): string[] {
  return Object.keys(loadCache());
}

/** Clear the spell cache */
export function clearSpellCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/* ======================================================================
 * SEED SPELLS — bundled in code, available immediately (no API needed)
 * These are the most common cantrips + Lv1 spells that every caster
 * starts with. Fetched spells supplement this.
 * ====================================================================== */

export const SEED_SPELLS: Record<string, NormalizedSpell> = {
  "fire-bolt": {
    index: "fire-bolt", name: "Fire Bolt", level: 0, school: "Evocation", schoolKey: "evocation",
    castingTime: "1 action", range: "120 feet",
    components: { verbal: true, somatic: true, material: false },
    duration: "Instantaneous", concentration: false, ritual: false,
    desc: "You hurl a mote of fire at a creature or object within range. Make a ranged spell attack. On a hit, the target takes 1d10 fire damage.",
    higherLevel: "The damage increases by 1d10 when you reach 5th level (2d10), 11th level (3d10), and 17th level (4d10).",
    classes: ["Sorcerer", "Wizard"],
    damage: "1d10", damageType: "fire", attackRoll: true,
    bonusAction: false, isCantrip: true, edition: "2024",
  },
  "magic-missile": {
    index: "magic-missile", name: "Magic Missile", level: 1, school: "Evocation", schoolKey: "evocation",
    castingTime: "1 action", range: "120 feet",
    components: { verbal: true, somatic: true, material: false },
    duration: "Instantaneous", concentration: false, ritual: false,
    desc: "You create three glowing darts. Each dart hits a creature of your choice. A dart deals 1d4+1 force damage.",
    higherLevel: "When you cast this spell using a spell slot of 2nd level or higher, the spell creates one more dart for each slot level above 1st.",
    classes: ["Sorcerer", "Wizard"],
    damage: "3d4+3", damageType: "force",
    bonusAction: false, isCantrip: false, edition: "2024",
  },
  "healing-word": {
    index: "healing-word", name: "Healing Word", level: 1, school: "Evocation", schoolKey: "evocation",
    castingTime: "1 bonus action", range: "60 feet",
    components: { verbal: true, somatic: false, material: false },
    duration: "Instantaneous", concentration: false, ritual: false,
    desc: "A creature of your choice regains hit points. The spell restores 2d4 hit points.",
    higherLevel: "When you cast this spell using a spell slot of 2nd level or higher, the healing increases by 1d4 for each slot level above 1st.",
    classes: ["Bard", "Cleric", "Druid"],
    damage: "2d4", damageType: undefined,
    bonusAction: true, isCantrip: false, edition: "2024",
  },
  "cure-wounds": {
    index: "cure-wounds", name: "Cure Wounds", level: 1, school: "Evocation", schoolKey: "evocation",
    castingTime: "1 action", range: "Touch",
    components: { verbal: true, somatic: true, material: false },
    duration: "Instantaneous", concentration: false, ritual: false,
    desc: "A creature you touch regains 2d8 hit points.",
    higherLevel: "When you cast this spell using a spell slot of 2nd level or higher, the healing increases by 1d8 for each slot level above 1st.",
    classes: ["Bard", "Cleric", "Druid", "Paladin", "Ranger"],
    damage: "2d8", damageType: undefined,
    bonusAction: false, isCantrip: false, edition: "2024",
  },
  "shield": {
    index: "shield", name: "Shield", level: 1, school: "Abjuration", schoolKey: "abjuration",
    castingTime: "1 reaction", range: "Self",
    components: { verbal: true, somatic: true, material: false },
    duration: "1 round", concentration: false, ritual: false,
    desc: "You gain a +5 bonus to AC until the start of your next turn.",
    higherLevel: "",
    classes: ["Sorcerer", "Wizard"],
    bonusAction: false, isCantrip: false, edition: "2024",
  },
  "mage-armor": {
    index: "mage-armor", name: "Mage Armor", level: 1, school: "Abjuration", schoolKey: "abjuration",
    castingTime: "1 action", range: "Touch",
    components: { verbal: true, somatic: true, material: false },
    duration: "8 hours", concentration: false, ritual: false,
    desc: "You touch a willing creature. The target's base AC becomes 13 + its Dexterity modifier.",
    higherLevel: "",
    classes: ["Sorcerer", "Wizard"],
    bonusAction: false, isCantrip: false, edition: "2024",
  },
  "eldritch-blast": {
    index: "eldritch-blast", name: "Eldritch Blast", level: 0, school: "Evocation", schoolKey: "evocation",
    castingTime: "1 action", range: "120 feet",
    components: { verbal: true, somatic: true, material: false },
    duration: "Instantaneous", concentration: false, ritual: false,
    desc: "A beam of crackling energy streaks toward a creature. Make a ranged spell attack. On a hit, the target takes 1d10 force damage.",
    higherLevel: "The spell creates two beams at 5th level, three beams at 11th level, and four beams at 17th level.",
    classes: ["Warlock"],
    damage: "1d10", damageType: "force", attackRoll: true,
    bonusAction: false, isCantrip: true, edition: "2024",
  },
  "hex": {
    index: "hex", name: "Hex", level: 1, school: "Enchantment", schoolKey: "enchantment",
    castingTime: "1 bonus action", range: "90 feet",
    components: { verbal: true, somatic: true, material: true, materialDesc: "The petrified eye of a newt" },
    duration: "Concentration, up to 1 hour", concentration: true, ritual: false,
    desc: "You place a curse on a creature. Whenever you deal damage to the target, it takes an extra 1d6 necrotic damage.",
    higherLevel: "Duration increases to 8 hours (slot 3-4) or 24 hours (slot 5+).",
    classes: ["Warlock"],
    damage: "1d6", damageType: "necrotic",
    bonusAction: true, isCantrip: false, edition: "2024",
  },
  "guiding-bolt": {
    index: "guiding-bolt", name: "Guiding Bolt", level: 1, school: "Evocation", schoolKey: "evocation",
    castingTime: "1 action", range: "120 feet",
    components: { verbal: true, somatic: true, material: false },
    duration: "1 round", concentration: false, ritual: false,
    desc: "A flash of light streaks toward a creature. Make a ranged spell attack. On a hit, the target takes 4d6 radiant damage.",
    higherLevel: "The damage increases by 1d6 for each slot level above 1st.",
    classes: ["Cleric"],
    damage: "4d6", damageType: "radiant", attackRoll: true,
    bonusAction: false, isCantrip: false, edition: "2024",
  },
  "sacred-flame": {
    index: "sacred-flame", name: "Sacred Flame", level: 0, school: "Evocation", schoolKey: "evocation",
    castingTime: "1 action", range: "60 feet",
    components: { verbal: true, somatic: true, material: false },
    duration: "Instantaneous", concentration: false, ritual: false,
    desc: "Flame-like radiance descends on a creature. The target must succeed on a Dexterity saving throw or take 1d8 radiant damage.",
    higherLevel: "The damage increases by 1d8 at 5th level (2d8), 11th level (3d8), and 17th level (4d8).",
    classes: ["Cleric"],
    damage: "1d8", damageType: "radiant", saveAbility: "dex", saveSuccess: "none",
    bonusAction: false, isCantrip: true, edition: "2024",
  } as any,
};

/** Get a spell from seed spells OR persistent cache */
export function getSpellFromCache(index: string): NormalizedSpell | null {
  // Check seed spells first (always available)
  if (SEED_SPELLS[index]) return SEED_SPELLS[index];
  // Then check persistent cache
  return getCachedSpell(index);
}
