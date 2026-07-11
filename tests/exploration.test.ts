/**
 * Task #16 — Exploration-turn engine tests. Fully deterministic (rolls injected
 * or seeded via the oracle's mulberry32), so encounter/no-encounter branches are
 * exercised with exact values.
 */
import { describe, it, expect } from "vitest";
import {
  resolveExplorationTurn,
  resolveExplorationTurnSeeded,
  summarizeExplorationTurn,
} from "../src/lib/engine/exploration";
import { checkRandomEncounter } from "../src/lib/engine/oracle";

describe("resolveExplorationTurn", () => {
  it("misses the encounter when the d20 is above the chance", () => {
    const res = resolveExplorationTurn({
      hoursAdvanced: 2,
      encounterChancePer20: 3,
      encounterRoll: 10,
    });
    expect(res.encounter.triggered).toBe(false);
    expect(res.event).toBeNull();
    expect(res.hoursAdvanced).toBe(2);
    expect(res.summary).toContain("เส้นทางสงบ");
    expect(res.summary).toContain("2 ชม.");
  });

  it("triggers an encounter + oracle event when the d20 is within chance", () => {
    const res = resolveExplorationTurn({
      hoursAdvanced: 4,
      encounterChancePer20: 5,
      encounterRoll: 3,
      focusRoll: 20, // → npc_action band
      actionRoll: 1,
      themeRoll: 1,
    });
    expect(res.encounter.triggered).toBe(true);
    expect(res.event).not.toBeNull();
    expect(res.event!.focus).toBe("npc_action");
    expect(res.event!.meaning.prompt).toContain("·");
    expect(res.summary).toContain("⚡");
  });

  it("defaults the event rolls when a hit provides none", () => {
    const res = resolveExplorationTurn({
      hoursAdvanced: 1,
      encounterChancePer20: 20, // always hits
      encounterRoll: 20,
    });
    expect(res.encounter.triggered).toBe(true);
    expect(res.event).not.toBeNull();
    expect(res.event!.focusRoll).toBe(1);
  });

  it("normalizes negative/NaN hours to 0 and matches oracle's checkRandomEncounter", () => {
    const res = resolveExplorationTurn({
      hoursAdvanced: -3,
      encounterChancePer20: 2,
      encounterRoll: 2,
    });
    expect(res.hoursAdvanced).toBe(0);
    expect(res.encounter).toEqual(checkRandomEncounter(2, 2));
  });
});

describe("resolveExplorationTurnSeeded", () => {
  it("is deterministic for a given seed", () => {
    const a = resolveExplorationTurnSeeded(3, 5, 12345);
    const b = resolveExplorationTurnSeeded(3, 5, 12345);
    expect(a).toEqual(b);
  });

  it("different seeds can produce different outcomes", () => {
    // Scan a handful of seeds to prove the encounter branch is reachable both
    // ways (deterministic, no RNG in the assertion).
    const outcomes = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => resolveExplorationTurnSeeded(1, 10, s).encounter.triggered);
    expect(outcomes).toContain(true);
    expect(outcomes).toContain(false);
  });

  it("populates an event only on a triggered turn", () => {
    for (const seed of [11, 22, 33, 44, 55, 66]) {
      const res = resolveExplorationTurnSeeded(2, 8, seed);
      if (res.encounter.triggered) expect(res.event).not.toBeNull();
      else expect(res.event).toBeNull();
    }
  });
});

describe("summarizeExplorationTurn", () => {
  it("renders a calm line when nothing triggers", () => {
    const s = summarizeExplorationTurn(6, checkRandomEncounter(3, 15), null);
    expect(s).toContain("6 ชม.");
    expect(s).toContain("d20=15");
    expect(s).toContain("สงบ");
  });
});
