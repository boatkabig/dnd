import { describe, it, expect } from "vitest";
import { runEnemyTurn, type EnemyAIDeps } from "../src/lib/engine/enemyAI";

/**
 * Characterization tests for the pure per-enemy combat AI turn (runEnemyTurn),
 * extracted verbatim from DnDSolo's former local `enemyTurn`. These pin rich
 * combat branches so a future refactor cannot silently drop them. Injected deps
 * (rollD20 / rollFormula / saveMod / hasFeature / ...) are deterministic; the
 * concentration DC comes from the REAL imported checkConcentration.
 */

// --- deterministic dice mocks ---------------------------------------------

// rollD20: returns scripted { die, total } pairs (last entry repeats); records calls.
function scriptedRollD20(script: Array<{ die: number; total?: number }>) {
  const calls: Array<{ modv: number; adv: string }> = [];
  let i = 0;
  const fn = (modv: number, adv: "none" | "advantage" | "disadvantage" = "none") => {
    const spec = script[i] ?? script[script.length - 1] ?? { die: 10 };
    i++;
    const die = spec.die;
    const total = spec.total !== undefined ? spec.total : die + modv;
    calls.push({ modv, adv });
    return { die, other: null, mod: modv, total, adv };
  };
  fn.calls = calls;
  return fn;
}

// rollFormula: maps a formula string to a fixed total; unknown formulas -> fallback.
function mappedRollFormula(map: Record<string, number>, fallback = 5) {
  const calls: string[] = [];
  const fn = (formula: string) => {
    calls.push(formula);
    const total = map[formula] ?? fallback;
    return { total, rolls: [total], mod: 0, formula };
  };
  fn.calls = calls;
  return fn;
}

function makeDeps(overrides: Partial<EnemyAIDeps> = {}): EnemyAIDeps {
  return {
    attackMod: () => 0,
    rollD20: scriptedRollD20([{ die: 15, total: 15 }]),
    rollFormula: mappedRollFormula({}),
    hitEnemy: () => 0,
    enemyHasAttackDisadv: () => false,
    exhaustionPenalty: () => 0,
    saveMod: () => 0,
    hasFeature: () => false,
    hasConcentration: () => false,
    getActiveConcentrationBuff: () => null,
    gridDistance: () => 1,
    entrySystem: (text: string) => ({ id: 0, type: "system", text }),
    nextId: () => 1,
    ...overrides,
  };
}

// --- fixtures --------------------------------------------------------------

function makeCb(overrides: Record<string, any> = {}) {
  return {
    round: 1,
    enemies: [] as any[],
    enemyPositions: {} as Record<string, any>,
    playerPos: { x: 1, y: 1 },
    grid: { w: 12, h: 10 },
    readyAction: null,
    dodge: false,
    invisible: false,
    spiritGuardians: false,
    ...overrides,
  };
}

function makeCc(overrides: Record<string, any> = {}) {
  return { name: "Hero", weapon: "", abilities: {}, knownSpells: [], ...overrides };
}

function makeNc(overrides: Record<string, any> = {}) {
  return {
    name: "Hero",
    hp: 100,
    maxHp: 100,
    ac: 5, // low: any die>=5 total hits
    conditions: [] as string[],
    buffs: [] as any[],
    hiddenAdv: false,
    ...overrides,
  };
}

function makeEnemy(overrides: Record<string, any> = {}) {
  return {
    uid: "e1",
    th: "ก็อบลิน",
    hp: 20,
    hpNow: 20,
    ac: 12,
    atk: 0,
    dmg: "1d6",
    conditions: [] as string[],
    attacks: [{ atk: 0, dmg: "1d6", name: "Bite" }],
    ...overrides,
  };
}

// helper to place the enemy adjacent so no movement/flee path fires
function place(cb: any, e: any) {
  cb.enemies = [e];
  cb.enemyPositions[e.uid] = { x: 1, y: 1 };
}

describe("runEnemyTurn — characterization", () => {
  it("(1) Multiattack produces one attack roll per attack in e.attacks[]", () => {
    // two-attack enemy, all attacks miss (nc.ac high) so only attack rolls happen
    const rollD20 = scriptedRollD20([{ die: 5, total: 5 }]); // miss vs ac 99, not crit/fumble
    const deps = makeDeps({ rollD20 });
    const e = makeEnemy({
      attacks: [
        { atk: 0, dmg: "1d6", name: "Bite" },
        { atk: 0, dmg: "1d6", name: "Claw" },
      ],
    });
    const cb = makeCb();
    place(cb, e);
    const nc = makeNc({ ac: 99 });
    const entries: any[] = [];

    const res = runEnemyTurn(deps, e, cb, makeCc(), nc, entries, [e], false, false);

    expect(rollD20.calls.length).toBe(2); // exactly one d20 per attack, no extra rolls on a miss
    expect(entries.filter((x) => x.type === "roll").length).toBe(2);
    expect(res.stop).toBe(false);
    expect(nc.hp).toBe(100); // all missed
  });

  it("(2) Breath weapon applies save-for-half on a successful save", () => {
    // attack hits (die 15), breath save passes (die 18 >= dc 10) -> breath damage halved
    const rollD20 = scriptedRollD20([
      { die: 15, total: 15 }, // attack: hit, no crit
      { die: 18, total: 18 }, // breath save: passes
    ]);
    const rollFormula = mappedRollFormula({ "1d6": 4, "6d6": 20 });
    const deps = makeDeps({ rollD20, rollFormula });
    const e = makeEnemy({ breath: { type: "fire", dmg: "6d6", dc: 10, save: "dex" } });
    const cb = makeCb();
    place(cb, e);
    const nc = makeNc();
    const entries: any[] = [];

    runEnemyTurn(deps, e, cb, makeCc(), nc, entries, [e], false, false);

    const rollEntry = entries.find((x) => x.type === "roll");
    // half of 20 = 10 (full would be 20). 100 - 4(attack) - 10(half breath) = 86.
    expect(rollEntry.extra).toContain("fire breath 6d6 = 10");
    expect(rollEntry.extra).toContain("DEX save 18 vs DC 10");
    expect(nc.hp).toBe(86);
  });

  it("(3) Poison rider rolls a CON save on hit and halves on success", () => {
    const rollD20 = scriptedRollD20([
      { die: 15, total: 15 }, // attack: hit
      { die: 20, total: 20 }, // poison CON save: passes -> half
    ]);
    const rollFormula = mappedRollFormula({ "1d6": 3, "2d4": 6 });
    const deps = makeDeps({ rollD20, rollFormula });
    const e = makeEnemy({ poison: { dmg: "2d4", dc: 12 } });
    const cb = makeCb();
    place(cb, e);
    const nc = makeNc();
    const entries: any[] = [];

    runEnemyTurn(deps, e, cb, makeCc(), nc, entries, [e], false, false);

    const rollEntry = entries.find((x) => x.type === "roll");
    // half of 6 = 3. 100 - 3(attack) - 3(half poison) = 94.
    expect(rollEntry.extra).toContain("CON save 20 vs DC 12 → poison +3");
    expect(nc.hp).toBe(94);
  });

  it("(4) Uncanny Dodge halves only the FIRST hit across the round (uncannyUsed threading)", () => {
    // two enemies, one hit each; hasFeature reports uncanny_dodge; full damage = 20.
    const rollD20 = scriptedRollD20([{ die: 15, total: 15 }]); // always hits, no crit
    const rollFormula = mappedRollFormula({ "1d6": 20 });
    const deps = makeDeps({ rollD20, rollFormula, hasFeature: (_c, key) => key === "uncanny_dodge" });
    const nc = makeNc();
    const cb = makeCb();
    const e1 = makeEnemy({ uid: "e1", th: "โกเบิลA" });
    const e2 = makeEnemy({ uid: "e2", th: "โกเบิลB" });
    cb.enemies = [e1, e2];
    cb.enemyPositions["e1"] = { x: 1, y: 1 };
    cb.enemyPositions["e2"] = { x: 1, y: 1 };

    // enemy 1: first hit of the round -> halved (20 -> 10)
    const res1 = runEnemyTurn(deps, e1, cb, makeCc(), nc, [], [e1, e2], false, false);
    expect(res1.uncannyUsed).toBe(true);
    expect(nc.hp).toBe(90); // 100 - 10 (halved)

    // enemy 2: uncannyUsed threaded in as true -> NOT halved (full 20)
    const res2 = runEnemyTurn(deps, e2, cb, makeCc(), nc, [], [e1, e2], false, res1.uncannyUsed);
    expect(res2.uncannyUsed).toBe(true);
    expect(nc.hp).toBe(70); // 90 - 20 (full)
  });

  it("(5) Concentration check fires on a damaging hit at the D&D 2024 DC", () => {
    // dmg 30 -> DC = max(10, floor(30/2)) = 15 (from REAL checkConcentration)
    const rollD20 = scriptedRollD20([
      { die: 15, total: 15 }, // attack: hit
      { die: 5 }, // CON concentration save: die 5 (+mod 2) = 7 < DC 15 -> fails
    ]);
    const rollFormula = mappedRollFormula({ "1d6": 30 });
    const deps = makeDeps({
      rollD20,
      rollFormula,
      saveMod: () => 2,
      hasConcentration: () => true,
      getActiveConcentrationBuff: () => ({ name: "Bless" }),
    });
    const e = makeEnemy();
    const cb = makeCb();
    place(cb, e);
    const nc = makeNc({ buffs: [{ name: "Bless" }] });
    const entries: any[] = [];

    runEnemyTurn(deps, e, cb, makeCc(), nc, entries, [e], false, false);

    const concEntry = entries.find((x) => typeof x.text === "string" && x.text.includes("เสียสมาธิ"));
    expect(concEntry).toBeTruthy();
    expect(concEntry.text).toContain("DC 15"); // DC derived from dmg=30 by real checkConcentration
    expect(nc.buffs.find((b: any) => b.name === "Bless")).toBeUndefined(); // buff dropped on failed save
  });
});
