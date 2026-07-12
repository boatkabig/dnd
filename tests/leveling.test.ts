import { describe, it, expect } from "vitest";
import { gainXP, applyFeatGrantsToChar } from "../src/lib/leveling";

/**
 * XP + leveling engine. Fighter: hitDie 10, non-caster, CON 14 (+2) →
 * per-level HP gain = floor(10/2) + 1 + 2 = 8. XP_THRESHOLDS: L2=300, L3=900.
 */
function fighter(overrides: Record<string, unknown> = {}) {
  return {
    cls: "fighter", level: 1, xp: 0, maxHp: 10, hp: 10, hitDiceLeft: 1,
    abilities: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
    slots: [], slotsMax: [], subclass: null, ...overrides,
  };
}

describe("gainXP", () => {
  it("awards XP with no level-up below the threshold, and logs the gain", () => {
    const logs: string[] = [];
    const out = gainXP(fighter(), 100, (t) => logs.push(t));
    expect(out.level).toBe(1);
    expect(out.xp).toBe(100);
    expect(out.maxHp).toBe(10);
    expect(logs[0]).toContain("+100 XP");
  });

  it("levels up once when the total crosses one threshold (HP +8)", () => {
    const logs: string[] = [];
    const out = gainXP(fighter(), 300, (t) => logs.push(t));
    expect(out.level).toBe(2);
    expect(out.xp).toBe(300);
    expect(out.maxHp).toBe(18); // 10 + 8
    expect(out.hp).toBe(18);
    expect(out.hitDiceLeft).toBe(2);
    expect(logs.some((l) => l.includes("LEVEL UP") && l.includes("Level 2"))).toBe(true);
  });

  it("applies every level crossed in a single award (L1 -> L3, HP +16)", () => {
    const logs: string[] = [];
    const out = gainXP(fighter(), 900, (t) => logs.push(t));
    expect(out.level).toBe(3);
    expect(out.maxHp).toBe(26); // 10 + 8 + 8
    expect(logs.filter((l) => l.includes("LEVEL UP")).length).toBe(2);
  });

  it("stops at level 20 and never overshoots", () => {
    const out = gainXP(fighter({ level: 20, xp: 355000, maxHp: 200, hp: 200 }), 999999, () => {});
    expect(out.level).toBe(20);
    expect(out.maxHp).toBe(200);
  });

  it("does not mutate the input character", () => {
    const cc = fighter();
    const before = JSON.parse(JSON.stringify(cc));
    gainXP(cc, 900, () => {});
    expect(cc).toEqual(before);
  });
});

/**
 * applyFeatGrantsToChar — folds ASI-granting feats onto a character idempotently.
 * Actor → +1 CHA; Resilient (Constitution) → +1 CON + CON save proficiency (and,
 * when the CON modifier ticks up, retro max-HP). The featGrantsApplied ledger
 * guards against double-applying.
 */
function charForFeats(overrides: Record<string, unknown> = {}) {
  return {
    cls: "fighter", level: 3, maxHp: 28, hp: 28,
    abilities: { str: 15, dex: 14, con: 13, int: 8, wis: 12, cha: 10 },
    feats: [] as string[], featGrantsApplied: [] as string[], saveProficiencies: [] as string[],
    worn: [], ...overrides,
  };
}

describe("applyFeatGrantsToChar", () => {
  it("is a no-op (same reference) when there are no grant feats", () => {
    const c = charForFeats();
    expect(applyFeatGrantsToChar(c)).toBe(c);
  });

  it("applies Actor → +1 CHA and records the ledger + logs it", () => {
    const logs: string[] = [];
    const out = applyFeatGrantsToChar(charForFeats({ feats: ["Actor"] }), (t) => logs.push(t));
    expect(out.abilities.cha).toBe(11);
    expect(out.featGrantsApplied).toContain("Actor");
    expect(logs.some((l) => l.includes("CHA") || l.includes("จ"))).toBe(true);
  });

  it("applies Resilient (Constitution) → +1 CON, save proficiency, and retro max HP when the CON mod ticks up", () => {
    // CON 13 (+1) → 14 (+2): modifier rises by 1 → +1 HP per level (level 3 = +3).
    const out = applyFeatGrantsToChar(charForFeats({ feats: ["Resilient (Constitution)"] }));
    expect(out.abilities.con).toBe(14);
    expect(out.saveProficiencies).toContain("con");
    expect(out.maxHp).toBe(31); // 28 + 3
    expect(out.hp).toBe(31);
  });

  it("is idempotent — a second application does nothing", () => {
    const once = applyFeatGrantsToChar(charForFeats({ feats: ["Actor"] }));
    const twice = applyFeatGrantsToChar(once);
    expect(twice).toBe(once);         // no new grants → same reference
    expect(twice.abilities.cha).toBe(11);
  });
});
