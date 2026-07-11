/**
 * Phase 5 — Oracle engine tests. The oracle is fully deterministic (rolls are
 * injected), so every branch is exercised with exact roll values.
 */
import { describe, it, expect } from "vitest";
import {
  askOracle,
  askOracleSeeded,
  YES_CHANCE,
  isRandomEventRoll,
  rollEventFocus,
  rollRandomEvent,
  rollMeaning,
  rollMeaningSeeded,
  checkRandomEncounter,
  makeRng,
  rngInt,
  ACTION_MEANINGS,
  SUBJECT_MEANINGS,
} from "../src/lib/engine/oracle";

describe("askOracle — yes/no threshold", () => {
  it("returns yes when roll <= yesChance, no when above", () => {
    expect(askOracle("50-50", 50).affirmative).toBe(true);
    expect(askOracle("50-50", 51).affirmative).toBe(false);
    expect(askOracle("likely", 75).affirmative).toBe(true);
    expect(askOracle("likely", 76).affirmative).toBe(false);
    expect(askOracle("unlikely", 25).affirmative).toBe(true);
    expect(askOracle("unlikely", 26).affirmative).toBe(false);
  });

  it("even the 'impossible'/'certain' extremes keep a small tail", () => {
    expect(askOracle("impossible", YES_CHANCE.impossible).affirmative).toBe(true);
    expect(askOracle("impossible", YES_CHANCE.impossible + 1).affirmative).toBe(false);
    expect(askOracle("certain", YES_CHANCE.certain).affirmative).toBe(true);
    expect(askOracle("certain", YES_CHANCE.certain + 1).affirmative).toBe(false);
  });

  it("produces yes-and at the low extreme and no-and at the high extreme", () => {
    expect(askOracle("50-50", 1).answer).toBe("yes-and");
    expect(askOracle("50-50", 100).answer).toBe("no-and");
  });

  it("produces the graded middle answers", () => {
    // 50-50: yesChance 50, band = 10. yes 11-40, yes-but 41-50.
    expect(askOracle("50-50", 30).answer).toBe("yes");
    expect(askOracle("50-50", 45).answer).toBe("yes-but");
    // no-but sits just above yesChance, plain no in the deep middle.
    expect(askOracle("50-50", 55).answer).toBe("no-but");
    expect(askOracle("50-50", 80).answer).toBe("no");
  });

  it("clamps out-of-range rolls instead of throwing", () => {
    expect(askOracle("50-50", 0).roll).toBe(1);
    expect(askOracle("50-50", 999).roll).toBe(100);
    expect(askOracle("50-50", NaN).roll).toBe(1);
  });

  it("carries a Thai label and the applied threshold", () => {
    const r = askOracle("likely", 10);
    expect(r.label).toContain("ใช่");
    expect(r.yesChance).toBe(75);
  });
});

describe("random-event detection (doubles)", () => {
  it("flags 11,22,…,99 and 100 as random events", () => {
    for (const d of [11, 22, 33, 44, 55, 66, 77, 88, 99, 100]) {
      expect(isRandomEventRoll(d)).toBe(true);
    }
  });
  it("does not flag non-doubles", () => {
    for (const d of [1, 10, 12, 50, 98]) expect(isRandomEventRoll(d)).toBe(false);
  });
  it("surfaces randomEvent on the oracle result", () => {
    expect(askOracle("50-50", 33).randomEvent).toBe(true);
    expect(askOracle("50-50", 34).randomEvent).toBe(false);
  });
});

describe("event focus + random event", () => {
  it("maps low rolls to remote events and high rolls to ambiguous", () => {
    expect(rollEventFocus(1).focus).toBe("remote_event");
    expect(rollEventFocus(100).focus).toBe("ambiguous_event");
    expect(rollEventFocus(30).focus).toBe("new_npc");
  });
  it("composes a full random event with a meaning prompt", () => {
    const ev = rollRandomEvent(30, 1, 1);
    expect(ev.focus).toBe("new_npc");
    expect(ev.meaning.prompt).toContain("·");
    expect(ev.meaning.action).toBe(ACTION_MEANINGS[0]);
    expect(ev.meaning.subject).toBe(SUBJECT_MEANINGS[0]);
  });
});

describe("meaning tables", () => {
  it("maps roll extremes to first/last table entries", () => {
    expect(rollMeaning(1, 1).action).toBe(ACTION_MEANINGS[0]);
    expect(rollMeaning(100, 100).action).toBe(ACTION_MEANINGS[ACTION_MEANINGS.length - 1]);
    expect(rollMeaning(100, 100).subject).toBe(SUBJECT_MEANINGS[SUBJECT_MEANINGS.length - 1]);
  });
  it("is deterministic for a fixed seed", () => {
    expect(rollMeaningSeeded(12345)).toEqual(rollMeaningSeeded(12345));
  });
});

describe("random encounter gate", () => {
  it("triggers when roll <= chance", () => {
    expect(checkRandomEncounter(3, 3).triggered).toBe(true);
    expect(checkRandomEncounter(3, 4).triggered).toBe(false);
  });
  it("clamps chance to 0..20 and roll to 1..20", () => {
    expect(checkRandomEncounter(99, 20).triggered).toBe(true); // chance clamps to 20
    expect(checkRandomEncounter(-5, 1).triggered).toBe(false); // chance clamps to 0
    expect(checkRandomEncounter(3, 999).roll).toBe(20);
  });
});

describe("seeded PRNG + seeded oracle", () => {
  it("is reproducible for the same seed and varies across seeds", () => {
    expect(askOracleSeeded("50-50", 42)).toEqual(askOracleSeeded("50-50", 42));
    const rolls = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((s) => askOracleSeeded("50-50", s).roll),
    );
    expect(rolls.size).toBeGreaterThan(1);
  });
  it("rngInt stays within [1, sides]", () => {
    const rng = makeRng(7);
    for (let i = 0; i < 200; i++) {
      const v = rngInt(rng, 20);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
  });
});
