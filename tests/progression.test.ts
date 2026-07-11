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
  powerAttackModifiers, hasPowerAttackFeat,
  featGrants, featAbilityBonuses, applyFeatGrants,
} from "../src/lib/engine/progression";
import {
  getSpellcastingKind, getSpellChangeWhen, getMaxSpellsHeld, getSpellcastingRule,
  canReprepareOnLongRest, reprepareSpells,
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

describe("power attack (GWM / Sharpshooter −5/+10)", () => {
  const heavyMelee = { ranged: false, properties: ["heavy", "two-handed"] };
  const oneHandMelee = { ranged: false, properties: [] };
  const bow = { ranged: true, properties: ["heavy", "two-handed"] };

  it("GWM applies −5/+10 with a heavy melee weapon when enabled", () => {
    const m = powerAttackModifiers(["great_weapon_master"], heavyMelee, true);
    expect(m.applies).toBe(true);
    expect(m.toHit).toBe(-5);
    expect(m.damage).toBe(10);
    expect(m.reason).toBe("great_weapon_master");
  });

  it("GWM does NOT apply to a non-heavy or ranged weapon", () => {
    expect(powerAttackModifiers(["great_weapon_master"], oneHandMelee, true).applies).toBe(false);
    expect(powerAttackModifiers(["great_weapon_master"], bow, true).applies).toBe(false);
  });

  it("Sharpshooter applies with a ranged weapon; not with melee", () => {
    expect(powerAttackModifiers(["sharpshooter"], bow, true).applies).toBe(true);
    expect(powerAttackModifiers(["sharpshooter"], heavyMelee, true).applies).toBe(false);
  });

  it("never applies when the toggle is off, or the feat is absent", () => {
    expect(powerAttackModifiers(["great_weapon_master"], heavyMelee, false).applies).toBe(false);
    expect(powerAttackModifiers([], heavyMelee, true).applies).toBe(false);
  });

  it("hasPowerAttackFeat gates whether the UI shows the toggle", () => {
    expect(hasPowerAttackFeat(["sharpshooter"])).toBe(true);
    expect(hasPowerAttackFeat(["great_weapon_master"])).toBe(true);
    expect(hasPowerAttackFeat(["archery"])).toBe(false);
  });
});

describe("ASI-granting feats (idempotent)", () => {
  it("featGrants resolves fixed-ability feats and Resilient's chosen ability", () => {
    expect(featGrants(["keen_mind"])).toEqual([{ source: "keen_mind", ability: "int", abilityBonus: 1 }]);
    expect(featGrants(["actor"])[0].ability).toBe("cha");
    const res = featGrants(["resilient-(constitution)"]);
    expect(res[0]).toMatchObject({ ability: "con", abilityBonus: 1, saveProficiency: "con" });
  });

  it("Resilient with no parseable ability grants nothing", () => {
    expect(featGrants(["resilient"])).toEqual([]);
  });

  it("featAbilityBonuses sums grants into an ability map", () => {
    const b = featAbilityBonuses(["keen_mind", "actor"]);
    expect(b.int).toBe(1);
    expect(b.cha).toBe(1);
    expect(b.str).toBe(0);
  });

  it("applyFeatGrants applies +1 once and is idempotent on re-apply", () => {
    const c0 = { feats: ["keen_mind"], abilities: { str: 10, dex: 10, con: 10, int: 15, wis: 10, cha: 10 } };
    const r1 = applyFeatGrants(c0);
    expect(r1.abilities.int).toBe(16);
    expect(r1.featGrantsApplied).toEqual(["keen_mind"]);
    // Re-apply with the recorded ledger → no double.
    const r2 = applyFeatGrants({ ...c0, abilities: r1.abilities, featGrantsApplied: r1.featGrantsApplied });
    expect(r2.abilities.int).toBe(16);
    expect(r2.applied).toHaveLength(0);
  });

  it("Resilient adds a save proficiency and caps ability at 20", () => {
    const r = applyFeatGrants({
      feats: ["resilient-(dexterity)"],
      abilities: { str: 10, dex: 20, con: 10, int: 10, wis: 10, cha: 10 },
    });
    expect(r.abilities.dex).toBe(20); // capped, not 21
    expect(r.saveProficiencies).toContain("dex");
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

describe("long-rest re-prepare (prepared casters)", () => {
  it("only prepared casters may re-prepare on a long rest", () => {
    expect(canReprepareOnLongRest("cleric")).toBe(true);
    expect(canReprepareOnLongRest("wizard")).toBe(true);
    expect(canReprepareOnLongRest("sorcerer")).toBe(false); // known caster
    expect(canReprepareOnLongRest("fighter")).toBe(false);
  });

  it("swaps prepared spells within the cap (cleric Lv.5, WIS +3 → 8)", () => {
    const pool = ["bless", "cure-wounds", "guiding-bolt", "aid", "spiritual-weapon"];
    const r = reprepareSpells("cleric", 5, 3, pool, ["aid", "spiritual-weapon", "bless"]);
    expect(r.ok).toBe(true);
    expect(r.maxHeld).toBe(8);
    expect(r.prepared).toEqual(["aid", "spiritual-weapon", "bless"]);
    expect(r.dropped).toEqual([]);
  });

  it("caps the selection and reports the overflow deterministically", () => {
    // Paladin (half-caster) Lv.5 CHA +3 → floor(5/2)=2, +3 = 5 cap.
    const pool = ["a", "b", "c", "d", "e", "f", "g"];
    const r = reprepareSpells("paladin", 5, 3, pool, pool);
    expect(r.maxHeld).toBe(5);
    expect(r.prepared).toEqual(["a", "b", "c", "d", "e"]);
    expect(r.dropped).toEqual(["f", "g"]);
  });

  it("drops spells not in the available pool, and de-dupes", () => {
    const r = reprepareSpells("cleric", 5, 3, ["bless"], ["bless", "bless", "not-owned"]);
    expect(r.prepared).toEqual(["bless"]);
    expect(r.dropped).toContain("not-owned");
  });

  it("refuses for a known caster (ok:false, empty list)", () => {
    const r = reprepareSpells("sorcerer", 5, 3, ["fireball"], ["fireball"]);
    expect(r.ok).toBe(false);
    expect(r.prepared).toEqual([]);
  });
});
