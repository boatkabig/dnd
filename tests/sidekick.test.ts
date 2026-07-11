/**
 * Phase 5 — Sidekick engine tests. Builder scaling + turn-intent ladder are
 * pure, so exact stat blocks and decisions are asserted.
 */
import { describe, it, expect } from "vitest";
import {
  buildSidekick,
  sidekickTurnIntent,
  getSidekickFeatures,
  hasSidekickFeature,
  SIDEKICK_BASES,
  type SidekickTurnContext,
} from "../src/lib/engine/sidekick";
import { getProficiencyBonus } from "../src/lib/engine/character";

describe("feature progression", () => {
  it("grants features cumulatively by level", () => {
    expect(getSidekickFeatures("warrior", 1).map((f) => f.key)).toEqual(["martial_role"]);
    expect(getSidekickFeatures("warrior", 5).map((f) => f.key)).toContain("extra_attack");
    expect(hasSidekickFeature("warrior", 3, "improved_critical")).toBe(true);
    expect(hasSidekickFeature("warrior", 2, "improved_critical")).toBe(false);
  });
  it("expert gains cunning action + expertise, spellcaster gains spellcasting", () => {
    expect(hasSidekickFeature("expert", 2, "cunning_action")).toBe(true);
    expect(hasSidekickFeature("expert", 3, "expertise")).toBe(true);
    expect(hasSidekickFeature("spellcaster", 1, "spellcasting")).toBe(true);
  });
});

describe("buildSidekick — scaling", () => {
  it("uses the standard proficiency bonus for the level", () => {
    expect(buildSidekick(SIDEKICK_BASES.guard, "warrior", 5).proficiencyBonus).toBe(
      getProficiencyBonus(5),
    );
  });

  it("warrior gets Extra Attack at level 5 (2 attacks), 1 before", () => {
    expect(buildSidekick(SIDEKICK_BASES.guard, "warrior", 4).attacksPerAction).toBe(1);
    expect(buildSidekick(SIDEKICK_BASES.guard, "warrior", 5).attacksPerAction).toBe(2);
  });

  it("HP grows monotonically with level and folds in CON", () => {
    const l1 = buildSidekick(SIDEKICK_BASES.guard, "warrior", 1).maxHp;
    const l5 = buildSidekick(SIDEKICK_BASES.guard, "warrior", 5).maxHp;
    expect(l5).toBeGreaterThan(l1);
    // level 1: baseHp 5 + (d10 max 10 + con 2) = 17
    expect(l1).toBe(17);
  });

  it("computes to-hit as ability mod + proficiency", () => {
    const b = buildSidekick(SIDEKICK_BASES.scout, "expert", 5);
    // scout dex +2, pb at 5 = +3 → +5
    expect(b.attack.toHit).toBe(2 + getProficiencyBonus(5));
    expect(b.attack.ranged).toBe(true);
  });

  it("improved critical lowers crit range to 19 for warriors at 3+", () => {
    expect(buildSidekick(SIDEKICK_BASES.guard, "warrior", 3).attack.critRange).toBe(19);
    expect(buildSidekick(SIDEKICK_BASES.guard, "warrior", 2).attack.critRange).toBe(20);
  });

  it("spellcaster exposes save DC, attack bonus, slots and cantrips", () => {
    const sc = buildSidekick(SIDEKICK_BASES.acolyte, "spellcaster", 5);
    expect(sc.spellcasting).toBeDefined();
    const wis = SIDEKICK_BASES.acolyte.mods.wis; // +2
    const pb = getProficiencyBonus(5); // +3
    expect(sc.spellcasting!.saveDc).toBe(8 + pb + wis);
    expect(sc.spellcasting!.attackBonus).toBe(pb + wis);
    expect(sc.spellcasting!.slots[3]).toBe(2); // level 5 caster has 2 third-level slots
    expect(sc.spellcasting!.maxSpellLevel).toBe(3);
    expect(sc.spellcasting!.cantripsKnown).toBeGreaterThanOrEqual(3);
  });

  it("non-casters have no spellcasting block", () => {
    expect(buildSidekick(SIDEKICK_BASES.guard, "warrior", 5).spellcasting).toBeUndefined();
  });

  it("clamps level into 1..10", () => {
    expect(buildSidekick(SIDEKICK_BASES.guard, "warrior", 0).level).toBe(1);
    expect(buildSidekick(SIDEKICK_BASES.guard, "warrior", 99).level).toBe(10);
  });
});

describe("sidekickTurnIntent — decision ladder", () => {
  const warrior = buildSidekick(SIDEKICK_BASES.guard, "warrior", 5);
  const healer = buildSidekick(SIDEKICK_BASES.acolyte, "spellcaster", 5);

  const base: SidekickTurnContext = {
    selfHpFraction: 1,
    woundedAllyHpFraction: null,
    enemyInReach: true,
    hasSpellSlot: false,
    canHeal: false,
  };

  it("dodges when badly wounded and unable to heal", () => {
    expect(sidekickTurnIntent(warrior, { ...base, selfHpFraction: 0.2 }).action).toBe("dodge");
  });

  it("heals a critically wounded ally when able", () => {
    const intent = sidekickTurnIntent(healer, {
      ...base,
      woundedAllyHpFraction: 0.2,
      hasSpellSlot: true,
      canHeal: true,
    });
    expect(intent.action).toBe("heal_ally");
    expect(intent.targetsAlly).toBe(true);
  });

  it("casts an attack spell when a caster has a slot and an enemy is in reach", () => {
    expect(
      sidekickTurnIntent(healer, { ...base, hasSpellSlot: true }).action,
    ).toBe("cast_attack");
  });

  it("falls back to a weapon attack when a caster is out of slots", () => {
    expect(sidekickTurnIntent(healer, { ...base, hasSpellSlot: false }).action).toBe("attack");
  });

  it("a warrior attacks the enemy in reach", () => {
    expect(sidekickTurnIntent(warrior, base).action).toBe("attack");
  });

  it("helps an ally when no enemy is in reach", () => {
    expect(
      sidekickTurnIntent(warrior, { ...base, enemyInReach: false, woundedAllyHpFraction: 0.6 })
        .action,
    ).toBe("help");
  });

  it("disengages when nothing else applies", () => {
    expect(
      sidekickTurnIntent(warrior, { ...base, enemyInReach: false }).action,
    ).toBe("disengage");
  });
});
