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

/**
 * Great Weapon Master (heavy melee) / Sharpshooter (ranged) −5/+10 power attack.
 *
 * D&D 2024: with the relevant feat you may choose, before an attack, to take
 * −5 on the attack roll for +10 on the damage roll. GWM qualifies only with a
 * HEAVY MELEE weapon; Sharpshooter only with a RANGED weapon. The toggle is the
 * caller's (`enabled`); this helper gates on the feat being present AND the
 * weapon qualifying, and returns the concrete modifiers so the UI never inlines
 * the −5/+10 itself.
 */
export interface PowerAttackMods {
  applies: boolean;
  /** −5 when it applies, else 0. */
  toHit: number;
  /** +10 when it applies, else 0. */
  damage: number;
  /** which feat/weapon combination fired (or why it didn't). */
  reason: string;
}

function isHeavyMelee(w?: WeaponLike): boolean {
  return !w?.ranged && !!w?.properties?.includes("heavy");
}

export function powerAttackModifiers(
  feats: string[] = [],
  weapon: WeaponLike | undefined,
  enabled: boolean,
): PowerAttackMods {
  if (!enabled) return { applies: false, toHit: 0, damage: 0, reason: "off" };
  const gwm = hasFeatEffect(feats, "great_weapon_master") && isHeavyMelee(weapon);
  const ss = hasFeatEffect(feats, "sharpshooter") && !!weapon?.ranged;
  if (gwm || ss) {
    return { applies: true, toHit: -5, damage: 10, reason: gwm ? "great_weapon_master" : "sharpshooter" };
  }
  return { applies: false, toHit: 0, damage: 0, reason: "no_qualifying_feat_or_weapon" };
}

/**
 * Does a character (by class) EVEN have a power-attack feat available to toggle?
 * Used by the UI to decide whether to render the −5/+10 control at all.
 */
export function hasPowerAttackFeat(feats: string[] = []): boolean {
  return hasFeatEffect(feats, "great_weapon_master") || hasFeatEffect(feats, "sharpshooter");
}

/* ======================================================================
 * ASI-GRANTING FEATS (Keen Mind / Actor / Resilient …) — idempotent grants
 * ====================================================================== */

export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

const ABILITY_ALIASES: Record<string, AbilityKey> = {
  str: "str", strength: "str",
  dex: "dex", dexterity: "dex",
  con: "con", constitution: "con",
  int: "int", intelligence: "int",
  wis: "wis", wisdom: "wis",
  cha: "cha", charisma: "cha",
};

/** Feats that grant a FIXED +1 to a specific ability (2024 PHB). */
const FIXED_ABILITY_FEATS: Record<string, AbilityKey> = {
  keen_mind: "int",
  actor: "cha",
};

/** Parse the chosen ability out of a raw feat string (e.g. "resilient-(constitution)"). */
function parseChosenAbility(raw: string): AbilityKey | null {
  const lower = String(raw).toLowerCase();
  for (const alias of Object.keys(ABILITY_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(lower)) return ABILITY_ALIASES[alias];
  }
  return null;
}

export interface FeatGrant {
  /** the raw feat identifier this grant came from (idempotency key). */
  source: string;
  ability: AbilityKey;
  /** +1 ability-score increase. */
  abilityBonus: number;
  /** save proficiency granted alongside the increase (Resilient). */
  saveProficiency?: AbilityKey;
}

/**
 * The ability-score grants a feat list confers. Fixed-ability feats
 * (Keen Mind → INT, Actor → CHA) always resolve; Resilient reads its chosen
 * ability out of the raw feat string (e.g. "Resilient (Constitution)") and
 * additionally grants a save proficiency. Unknown feats contribute nothing.
 */
export function featGrants(feats: string[] = []): FeatGrant[] {
  const out: FeatGrant[] = [];
  for (const raw of feats) {
    const id = normalizeFeatId(raw);
    if (FIXED_ABILITY_FEATS[id]) {
      out.push({ source: raw, ability: FIXED_ABILITY_FEATS[id], abilityBonus: 1 });
    } else if (id === "resilient") {
      const ab = parseChosenAbility(raw);
      if (ab) out.push({ source: raw, ability: ab, abilityBonus: 1, saveProficiency: ab });
    }
  }
  return out;
}

/** Net ability-score bonuses from grant-feats, as an ability→delta map. */
export function featAbilityBonuses(feats: string[] = []): Record<AbilityKey, number> {
  const base: Record<AbilityKey, number> = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
  for (const g of featGrants(feats)) base[g.ability] += g.abilityBonus;
  return base;
}

export interface FeatGrantInput {
  feats?: string[];
  abilities: Record<string, number>;
  /** raw feat sources already applied (idempotency ledger). */
  featGrantsApplied?: string[];
  /** save proficiencies already held. */
  saveProficiencies?: string[];
}

export interface ApplyFeatGrantsResult {
  abilities: Record<string, number>;
  featGrantsApplied: string[];
  saveProficiencies: string[];
  /** grants newly applied by THIS call (empty when nothing changed). */
  applied: FeatGrant[];
}

/**
 * Apply ASI-granting feats to a character, IDEMPOTENTLY. Each grant is keyed by
 * its raw feat `source` and recorded in `featGrantsApplied`; applying the same
 * feat list twice is a no-op the second time (so re-renders / reloads never
 * double the +1). Ability scores are capped at 20. Resilient also adds a save
 * proficiency. Returns fresh objects — the caller recomputes derived stats
 * (max HP on CON change, AC on DEX change) at its own seam.
 */
export function applyFeatGrants(ch: FeatGrantInput): ApplyFeatGrantsResult {
  const appliedLedger = new Set(ch.featGrantsApplied ?? []);
  const abilities = { ...ch.abilities };
  const saves = new Set(ch.saveProficiencies ?? []);
  const newlyApplied: FeatGrant[] = [];
  for (const g of featGrants(ch.feats ?? [])) {
    if (appliedLedger.has(g.source)) continue; // idempotent guard
    abilities[g.ability] = Math.min(20, (abilities[g.ability] ?? 10) + g.abilityBonus);
    if (g.saveProficiency) saves.add(g.saveProficiency);
    appliedLedger.add(g.source);
    newlyApplied.push(g);
  }
  return {
    abilities,
    featGrantsApplied: [...appliedLedger],
    saveProficiencies: [...saves],
    applied: newlyApplied,
  };
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
