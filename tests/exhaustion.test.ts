import { describe, it, expect } from "vitest";
import { exhaustionPenalty as exhaustionPenaltyLevel, exhaustionSpeedPenalty, isExhaustionDeadly } from "../src/lib/gameData";
import { exhaustionPenalty } from "../src/lib/characterStats";
import { computeLongRestRecovery } from "../src/lib/engine/rest";

// #29 Exhaustion — D&D 2024 single-track: -2×level to D20 Tests, -5ft×level speed,
// death at level 6, long rest removes 1 level. Coverage for the two effects not
// already exercised elsewhere (death-at-6 is covered by tests/store.test.ts).
describe("D&D 2024 Exhaustion — -2×level D20 Test penalty (characterStats.ts)", () => {
  it("is 0 at exhaustionLevel 0 (or unset)", () => {
    expect(exhaustionPenalty({})).toBe(0);
    expect(exhaustionPenalty({ exhaustionLevel: 0 })).toBe(0);
  });

  it("scales -2 per level, matching the raw gameData formula", () => {
    expect(exhaustionPenalty({ exhaustionLevel: 1 })).toBe(2);
    expect(exhaustionPenalty({ exhaustionLevel: 3 })).toBe(6);
    expect(exhaustionPenalty({ exhaustionLevel: 3 })).toBe(exhaustionPenaltyLevel(3));
  });
});

describe("D&D 2024 Exhaustion — long rest removes 1 level (engine/rest.ts)", () => {
  it("reduces exhaustionLevel by exactly 1", () => {
    const r = computeLongRestRecovery({ maxHP: 20, level: 3, exhaustionLevel: 2, slotsMax: [] });
    expect(r.exhaustionLevel).toBe(1);
  });

  it("floors at 0 — a long rest never goes negative", () => {
    const r = computeLongRestRecovery({ maxHP: 20, level: 3, exhaustionLevel: 0, slotsMax: [] });
    expect(r.exhaustionLevel).toBe(0);
  });
});

describe("D&D 2024 Exhaustion — death at level 6 (gameData.ts)", () => {
  it("isExhaustionDeadly is true only at level >= 6", () => {
    expect(isExhaustionDeadly(5)).toBe(false);
    expect(isExhaustionDeadly(6)).toBe(true);
  });
});

describe("D&D 2024 Exhaustion — speed penalty formula (gameData.ts, wired via movement.ts + DnDSolo effectiveSpeed)", () => {
  it("is -5ft per level", () => {
    expect(exhaustionSpeedPenalty(0)).toBe(0);
    expect(exhaustionSpeedPenalty(1)).toBe(5);
    expect(exhaustionSpeedPenalty(4)).toBe(20);
  });
});
