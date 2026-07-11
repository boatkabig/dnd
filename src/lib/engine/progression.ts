/**
 * ============================================================================
 * Progression Engine — Subclass features + Feat effects (D&D 2024)
 * ============================================================================
 *
 * Phase 4: this module OWNS the "what features / feat effects does a character
 * have" rules so the UI (DnDSolo) never has to hand-roll 2024 progression math.
 *
 * Three concerns live here:
 *   1. Active feature keys  — class features (Lv.1-20) + chosen subclass features
 *   2. Feat resolution      — map a character's `feats[]` to catalog defs
 *   3. Feat combat modifiers — concrete numeric effects (Fighting Styles, etc.)
 *
 * All data is sourced from the existing catalogs:
 *   - featuresExtended.ts  (class features Lv.1-20, already merges gameData Lv.1-5)
 *   - subclasses.ts        (subclass features keyed by level)
 *   - featsCatalog.ts       (feat defs + effectKeys)
 * ============================================================================
 */

import { GENERAL_FEATS, FIGHTING_STYLE_FEATS, EPIC_BOON_FEATS, type FeatDef } from "../featsCatalog";
import { getSubclassById, getAvailableSubclasses, shouldPromptSubclass, type SubclassDef } from "../subclasses";
import { getExtendedFeatures } from "../featuresExtended";

/* ======================================================================
 * FEAT RESOLUTION
 * ====================================================================== */

const ALL_FEATS: Record<string, FeatDef> = {
  ...GENERAL_FEATS,
  ...FIGHTING_STYLE_FEATS,
  ...EPIC_BOON_FEATS,
};

/**
 * Normalize any feat identifier to the catalog's snake_case key form.
 * Handles:
 *   - kebab-case from the store ("war-caster" ← "Feat: War Caster")
 *   - snake_case origin feats ("great_weapon_master")
 *   - display strings with parentheses ("Archery (Fighting Style)")
 */
export function normalizeFeatId(id: string): string {
  return String(id)
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // drop parenthetical qualifiers
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Resolve a single feat id to its catalog definition (or undefined). */
export function getFeatDef(id: string): FeatDef | undefined {
  const norm = normalizeFeatId(id);
  if (ALL_FEATS[norm]) return ALL_FEATS[norm];
  // Fall back to matching by normalized id or Thai/English title.
  return Object.values(ALL_FEATS).find(
    (f) => normalizeFeatId(f.id) === norm || normalizeFeatId(f.th) === norm,
  );
}

/** Resolve a character's feat list to catalog defs (unknown feats dropped). */
export function resolveFeats(feats: string[] = []): FeatDef[] {
  const out: FeatDef[] = [];
  const seen = new Set<string>();
  for (const raw of feats) {
    const def = getFeatDef(raw);
    if (def && !seen.has(def.id)) {
      seen.add(def.id);
      out.push(def);
    }
  }
  return out;
}

/** Does the character have a feat with the given mechanical effect key? */
export function hasFeatEffect(feats: string[] = [], effectKey: string): boolean {
  return resolveFeats(feats).some((f) => f.effectKey === effectKey);
}

/* ======================================================================
 * FEAT COMBAT MODIFIERS (concrete numeric effects that affect play)
 * ====================================================================== */

export interface WeaponLike {
  ranged?: boolean;
  properties?: string[];
}

function isTwoHanded(w?: WeaponLike): boolean {
  return !!w?.properties?.includes("two-handed");
}

/**
 * Fighting Style: Defense — +1 AC while wearing armor.
 * (Only applies when the character is actually wearing armor.)
 */
export function featAcBonus(feats: string[], wearingArmor: boolean): number {
  if (!wearingArmor) return 0;
  return hasFeatEffect(feats, "fs_defense") ? 1 : 0;
}

/**
 * Fighting Style: Archery — +2 to ranged weapon attack rolls.
 */
export function featAttackBonus(feats: string[], weapon?: WeaponLike): number {
  if (weapon?.ranged && hasFeatEffect(feats, "fs_archery")) return 2;
  return 0;
}

/**
 * Fighting Style: Dueling — +2 damage with a one-handed melee weapon
 * when no other weapon is held (approximated: melee, not two-handed).
 */
export function featDamageBonus(feats: string[], weapon?: WeaponLike): number {
  if (!weapon?.ranged && !isTwoHanded(weapon) && hasFeatEffect(feats, "fs_dueling")) return 2;
  return 0;
}

/* ======================================================================
 * ACTIVE FEATURE KEYS (class Lv.1-20 + chosen subclass)
 * ====================================================================== */

/** Feature keys granted by the chosen subclass up to `level`. */
export function getSubclassFeatureKeys(subclassId: string | undefined, level: number): string[] {
  if (!subclassId) return [];
  const sub = getSubclassById(subclassId);
  if (!sub) return [];
  const keys: string[] = [];
  for (const [lvStr, feats] of Object.entries(sub.features)) {
    if (parseInt(lvStr, 10) <= level) {
      for (const f of feats) keys.push(f.k);
    }
  }
  return keys;
}

// getExtendedFeatures() rebuilds a merged table on every call; hasFeature is
// hot (called many times per combat turn), so cache both the merged table and
// the resolved key-sets keyed by (cls|level|subclass).
let _extCache: Record<string, Record<number, any[]>> | null = null;
function extendedFeatures(): Record<string, Record<number, any[]>> {
  if (!_extCache) _extCache = getExtendedFeatures();
  return _extCache;
}
const _keySetCache = new Map<string, Set<string>>();

/**
 * The complete set of active feature keys for a character:
 *   class features (Lv.1-20, cumulative) + chosen subclass features.
 *
 * This is the single source of truth behind DnDSolo's `hasFeature`.
 */
export function getActiveFeatureKeys(cls: string, level: number, subclassId?: string): Set<string> {
  const cacheKey = `${cls}|${level}|${subclassId || ""}`;
  const cached = _keySetCache.get(cacheKey);
  if (cached) return cached;
  const keys = new Set<string>();
  const classFeatures = extendedFeatures()[cls] || {};
  for (let lv = 1; lv <= level; lv++) {
    for (const f of classFeatures[lv] || []) {
      if (f && f.k) keys.add(f.k);
    }
  }
  for (const k of getSubclassFeatureKeys(subclassId, level)) keys.add(k);
  _keySetCache.set(cacheKey, keys);
  return keys;
}

/** Does the character (class + subclass) have a feature with this key at their level? */
export function hasClassFeature(cls: string, level: number, subclassId: string | undefined, key: string): boolean {
  return getActiveFeatureKeys(cls, level, subclassId).has(key);
}

/* ======================================================================
 * SUBCLASS SELECTION (re-exports + convenience)
 * ====================================================================== */

export { getAvailableSubclasses, shouldPromptSubclass, getSubclassById };
export type { SubclassDef };

/**
 * Should the UI prompt the player to choose a subclass right now?
 * True when the class has reached its subclass level AND none is chosen yet.
 */
export function needsSubclassChoice(cls: string, level: number, subclassId?: string): boolean {
  if (subclassId) return false;
  return shouldPromptSubclass(cls, level);
}
