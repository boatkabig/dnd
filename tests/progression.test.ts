/**
 * Phase 4 — Progression engine tests.
 * Covers feat resolution, feat combat modifiers, subclass feature granting,
 * and the prepared-vs-known spellcasting rule. These paths cannot be exercised
 * by the e2e (which stays at Lv.1), so they are unit-tested here.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeFeatId, getFeatDef, resolveFeats, hasFeatEffect,
  featAcBonus, featAttackBonus, featDamageBonus,
  getSubclassFeatureKeys, getActiveFeatureKeys, hasClassFeature,
  needsSubclassChoice,
} from "../src/lib/engine/progression";
import {
  getSpellcastingKind, getSpellChangeWhen, getMaxSpellsHeld, getSpellcastingRule,
} from "../src/lib/magic";

describe("feat id normalization + resolution", () => {
  it("normalizes kebab, snake, and parenthetical display forms", () => {
    expect(normalizeFeatId("war-caster")).toBe("war_caster");
    expect(normalizeFeatId("great_weapon_master")).toBe("great_weapon_master");
    expect(normalizeFeatId("Archery (Fighting Style)")).toBe("archery");
  });

  it("resolves feats from mixed id forms (store kebab + origin snake)", () => {
    const defs = resolveFeats(["war-caster", "great_weapon_master", "defense"]);
    const ids = defs.map((d) => d.id).sort();
    expect(ids).toEqual(["defense", "great_weapon_master", "war_caster"]);
  });

  it("drops unknown feats and de-dupes", () => {
    expect(resolveFeats(["not-a-real-feat"])).toHaveLength(0);
    expect(resolveFeats(["archery", "archery"])).toHaveLength(1);
  });

  it("getFeatDef exposes the effectKey used for mechanical wiring", () => {
    expect(getFeatDef("defense")?.effectKey).toBe("fs_defense");
    expect(getFeatDef("archery")?.effectKey).toBe("fs_archery");
    expect(hasFeatEffect(["archery"], "fs_archery")).toBe(true);
    expect(hasFeatEffect(["defense"], "fs_archery")).toBe(false);
  });
});

describe("feat combat modifiers", () => {
  it("Defense: +1 AC only while wearing armor", () => {
    expect(featAcBonus(["defense"], true)).toBe(1);
    expect(featAcBonus(["defense"], false)).toBe(0);
    expect(featAcBonus(["archery"], true)).toBe(0);
  });

  it("Archery: +2 to ranged weapon attacks only", () => {
    expect(featAttackBonus(["archery"], { ranged: true })).toBe(2);
    expect(featAttackBonus(["archery"], { ranged: false })).toBe(0);
    expect(featAttackBonus([], { ranged: true })).toBe(0);
  });

  it("Dueling: +2 damage with a one-handed melee weapon", () => {
    expect(featDamageBonus(["dueling"], { ranged: false, properties: [] })).toBe(2);
    expect(featDamageBonus(["dueling"], { ranged: false, properties: ["two-handed"] })).toBe(0);
    expect(featDamageBonus(["dueling"], { ranged: true })).toBe(0);
  });
});

describe("subclass feature granting", () => {
  it("grants no subclass keys until a subclass is chosen", () => {
    expect(getSubclassFeatureKeys(undefined, 20)).toEqual([]);
  });

  it("grants subclass features cumulatively by level", () => {
    // Champion (fighter) gets improved_critical at Lv.3, superior_critical at Lv.15.
    expect(getSubclassFeatureKeys("champion", 3)).toContain("improved_critical");
    expect(getSubclassFeatureKeys("champion", 3)).not.toContain("superior_critical");
    expect(getSubclassFeatureKeys("champion", 15)).toContain("superior_critical");
  });

  it("hasClassFeature sees BOTH class and subclass features", () => {
    // Base class feature (fighter) regardless of subclass.
    expect(hasClassFeature("fighter", 1, undefined, "second_wind")).toBe(true);
    // Subclass feature only when that subclass is chosen.
    expect(hasClassFeature("fighter", 15, undefined, "superior_critical")).toBe(false);
    expect(hasClassFeature("fighter", 15, "champion", "superior_critical")).toBe(true);
  });

  it("getActiveFeatureKeys includes Lv.6-20 class features (not just Lv.1-5)", () => {
    // Fighter Lv.11 gains Extra Attack (3) — a Lv.6-20 table entry.
    expect(getActiveFeatureKeys("fighter", 11).has("extra_attack_3")).toBe(true);
  });

  it("needsSubclassChoice fires at the class's unlock level, not before", () => {
    expect(needsSubclassChoice("fighter", 1)).toBe(false); // unlock is Lv.3
    expect(needsSubclassChoice("fighter", 3)).toBe(true);
    expect(needsSubclassChoice("fighter", 3, "champion")).toBe(false); // already chosen
    expect(needsSubclassChoice("cleric", 1)).toBe(true); // cleric unlocks at Lv.1
  });
});

describe("prepared vs known spellcasting rule", () => {
  it("classifies casters correctly", () => {
    expect(getSpellcastingKind("cleric")).toBe("prepared");
    expect(getSpellcastingKind("wizard")).toBe("prepared");
    expect(getSpellcastingKind("sorcerer")).toBe("known");
    expect(getSpellcastingKind("bard")).toBe("known");
    expect(getSpellcastingKind("fighter")).toBe("none");
  });

  it("routes when spells may change", () => {
    expect(getSpellChangeWhen("cleric")).toBe("long_rest");
    expect(getSpellChangeWhen("sorcerer")).toBe("level_up");
    expect(getSpellChangeWhen("fighter")).toBe("none");
  });

  it("prepared count = ability mod + caster level (half-casters at half rate)", () => {
    // Cleric Lv.5, WIS +3 → 5 + 3 = 8
    expect(getMaxSpellsHeld("cleric", 5, 3)).toBe(8);
    // Paladin (half-caster) Lv.5, CHA +3 → floor(5/2)=2, +3 = 5
    expect(getMaxSpellsHeld("paladin", 5, 3)).toBe(5);
    // Never below 1
    expect(getMaxSpellsHeld("cleric", 1, -1)).toBeGreaterThanOrEqual(1);
  });

  it("known count is read from the fixed class table", () => {
    expect(getMaxSpellsHeld("sorcerer", 1, 5)).toBe(2); // ability mod irrelevant for known
    expect(getMaxSpellsHeld("bard", 3, 0)).toBe(6);
    expect(getMaxSpellsHeld("fighter", 5, 3)).toBe(0);
  });

  it("getSpellcastingRule bundles the full rule", () => {
    const wiz = getSpellcastingRule("wizard", 5, 3);
    expect(wiz.kind).toBe("prepared");
    expect(wiz.fromSpellbook).toBe(true);
    expect(wiz.changeWhen).toBe("long_rest");
    const sorc = getSpellcastingRule("sorcerer", 5, 3);
    expect(sorc.kind).toBe("known");
    expect(sorc.fromSpellbook).toBe(false);
  });
});
