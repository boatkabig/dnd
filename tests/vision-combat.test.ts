import { describe, it, expect } from "vitest";
import { coverBetween, attackVisibilityModifier, type Obstacle } from "../src/lib/engine/vision";

/**
 * Phase 3 — combat vision/LOS wiring (engine/vision).
 * DnDSolo now routes cover through coverBetween() (creatures on the line grant
 * half cover) and unseen-attacker/target through attackVisibilityModifier().
 * These lock in the exact behaviours the combat path relies on.
 */
describe("coverBetween — creatures grant half cover on the line", () => {
  const player = { x: 5, y: 9 };
  const target = { x: 5, y: 3 };

  it("gives no cover when nothing is between attacker and target", () => {
    const res = coverBetween(player, target, []);
    expect(res.acBonus).toBe(0);
    expect(res.canBeTargeted).toBe(true);
  });

  it("gives half cover (+2) when a creature sits on the line", () => {
    const blockers: Obstacle[] = [{ pos: { x: 5, y: 6 }, cover: "half" }];
    const res = coverBetween(player, target, blockers);
    expect(res.level).toBe("half");
    expect(res.acBonus).toBe(2);
    expect(res.dexSaveBonus).toBe(2);
    expect(res.canBeTargeted).toBe(true);
  });

  it("does not stack multiple creatures beyond half (2024: a creature = half cover)", () => {
    const blockers: Obstacle[] = [
      { pos: { x: 5, y: 6 }, cover: "half" },
      { pos: { x: 5, y: 5 }, cover: "half" },
    ];
    const res = coverBetween(player, target, blockers);
    expect(res.acBonus).toBe(2);
  });

  it("ignores a creature that is off the line", () => {
    const blockers: Obstacle[] = [{ pos: { x: 1, y: 6 }, cover: "half" }];
    const res = coverBetween(player, target, blockers);
    expect(res.acBonus).toBe(0);
  });

  it("creatures never confer total cover — target stays targetable", () => {
    const blockers: Obstacle[] = [{ pos: { x: 5, y: 6 }, cover: "half" }];
    const res = coverBetween(player, target, blockers);
    expect(isFinite(res.acBonus)).toBe(true);
    expect(res.canBeTargeted).toBe(true);
  });
});

describe("attackVisibilityModifier — 2024 unseen attacker/target", () => {
  it("both see each other → normal roll", () => {
    expect(attackVisibilityModifier(true, true)).toBe("none");
  });

  it("attacker unseen by target → advantage", () => {
    expect(attackVisibilityModifier(true, false)).toBe("advantage");
  });

  it("attacker cannot see target → disadvantage", () => {
    expect(attackVisibilityModifier(false, true)).toBe("disadvantage");
  });

  it("both unseen (e.g. two invisibles) → cancels to normal", () => {
    expect(attackVisibilityModifier(false, false)).toBe("none");
  });
});
