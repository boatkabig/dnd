import { describe, it, expect } from "vitest";
import { getEffectiveSpeed } from "../src/lib/movement";

// #29 Exhaustion — D&D 2024: Speed reduced by 5 ft × Exhaustion level (flat
// subtraction), floored at 0. This replaces the old 2014-style "speed halved"
// (×0.5) rule — see src/lib/engine/rest.ts (dead 2014 ExhaustionLevel table, removed)
// and src/lib/gameData.ts exhaustionSpeedPenalty (the authoritative 2024 formula).
describe("getEffectiveSpeed — D&D 2024 Exhaustion speed penalty", () => {
  it("exhaustionLevel 0 is a no-op — unexhausted speed is unchanged", () => {
    const r = getEffectiveSpeed(30, [], [], 0, 0);
    expect(r.speed).toBe(30);
    expect(r.canMove).toBe(true);
  });

  it("level 1: flat -5 ft (25), NOT the old 2014 half-speed (15)", () => {
    const r = getEffectiveSpeed(30, [], [], 0, 1);
    expect(r.speed).toBe(25);
    expect(r.speed).not.toBe(15); // would be 15 under the removed 2014 ×0.5 multiplier
  });

  it("level 3: flat -15 ft (30 -> 15)", () => {
    const r = getEffectiveSpeed(30, [], [], 0, 3);
    expect(r.speed).toBe(15);
  });

  it("floors at 0 — never goes negative (e.g. dwarf base 25 at level 5)", () => {
    const r = getEffectiveSpeed(25, [], [], 0, 5);
    expect(r.speed).toBe(0);
    expect(r.canMove).toBe(false);
  });

  it("floors at 0 at level 6 (death threshold) even for a high base speed", () => {
    const r = getEffectiveSpeed(30, [], [], 0, 6);
    expect(r.speed).toBe(0);
  });

  it("stacks with encumbrance (flat subtractions combine)", () => {
    const r = getEffectiveSpeed(30, [], [], 1, 1); // -10 encumbered, -5 exhaustion(1)
    expect(r.speed).toBe(15);
  });

  it('"exhausted" is no longer a recognized condition key — the dead 2014 halving has no live effect', () => {
    // Previously CONDITION_MOVEMENT.exhausted applied a ×0.5 multiplier for any
    // "exhausted" condition string; that mapping has been removed. Passing it as
    // a condition is now inert — only the numeric exhaustionLevel parameter matters.
    const r = getEffectiveSpeed(30, ["exhausted"], [], 0, 0);
    expect(r.speed).toBe(30);
  });

  it("a hard-stop restriction (e.g. grappled) still forces speed to 0 regardless of exhaustion", () => {
    const r = getEffectiveSpeed(30, ["grappled"], [], 0, 2);
    expect(r.speed).toBe(0);
    expect(r.canMove).toBe(false);
  });
});
