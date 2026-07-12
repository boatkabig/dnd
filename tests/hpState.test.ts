import { describe, it, expect } from "vitest";
import { applyDamage, applyHeal, type HpCharacterState } from "../src/lib/engine/hpState";

function alive(overrides: Partial<HpCharacterState> = {}): HpCharacterState {
  return {
    hp: 10,
    maxHp: 20,
    tempHp: 0,
    deathSaves: { s: 0, f: 0 },
    conditions: [],
    dead: false,
    ...overrides,
  };
}

function downed(overrides: Partial<HpCharacterState> = {}): HpCharacterState {
  return alive({ hp: 0, conditions: ["unconscious"], ...overrides });
}

describe("applyDamage — tempHp absorbs first", () => {
  it("partially absorbs: tempHp depletes before hp drops", () => {
    const result = applyDamage(alive({ hp: 10, tempHp: 5 }), 8);
    expect(result.tempHp).toBe(0);
    expect(result.hp).toBe(7); // 8 - 5 absorbed = 3 hp damage
  });

  it("fully absorbs: hp untouched when tempHp covers all the damage", () => {
    const result = applyDamage(alive({ hp: 10, tempHp: 10 }), 6);
    expect(result.tempHp).toBe(4);
    expect(result.hp).toBe(10);
  });
});

describe("applyDamage — drop to 0 HP (non-instant)", () => {
  it("damage >= current HP sets hp=0, adds Unconscious, resets death saves fresh (not stable)", () => {
    const result = applyDamage(alive({ hp: 10, maxHp: 20, deathSaves: { s: 1, f: 1 } }), 10);
    expect(result.hp).toBe(0);
    expect(result.dead).toBe(false);
    expect(result.justDowned).toBe(true);
    expect(result.conditions).toContain("unconscious");
    expect(result.deathSaves).toEqual({ s: 0, f: 0 });
  });

  it("overkill damage below the massive-damage threshold still just downs (no instant death)", () => {
    const result = applyDamage(alive({ hp: 5, maxHp: 20 }), 12); // overflow 7 < maxHp 20
    expect(result.hp).toBe(0);
    expect(result.dead).toBe(false);
    expect(result.conditions).toContain("unconscious");
  });

  it("doesn't duplicate the Unconscious condition if already present", () => {
    const result = applyDamage(alive({ hp: 5, maxHp: 20, conditions: ["unconscious"] }), 5);
    expect(result.conditions.filter((c) => c === "unconscious")).toHaveLength(1);
  });
});

describe("applyDamage — massive damage instant death", () => {
  it("overflow >= max HP kills instantly, no death saves", () => {
    const result = applyDamage(alive({ hp: 5, maxHp: 20 }), 26); // overflow 21 >= 20
    expect(result.dead).toBe(true);
    expect(result.instantDeath).toBe(true);
    expect(result.hp).toBe(0);
  });

  it("boundary: overflow exactly equal to max HP is instant death", () => {
    const result = applyDamage(alive({ hp: 1, maxHp: 10 }), 11); // overflow 10 >= 10
    expect(result.dead).toBe(true);
    expect(result.instantDeath).toBe(true);
  });

  it("boundary: overflow one below max HP is NOT instant death", () => {
    const result = applyDamage(alive({ hp: 1, maxHp: 10 }), 10); // overflow 9 < 10
    expect(result.dead).toBe(false);
    expect(result.instantDeath).toBe(false);
    expect(result.hp).toBe(0);
    expect(result.conditions).toContain("unconscious");
  });
});

describe("applyDamage — damage while already at 0 HP (unconscious, not dead)", () => {
  it("ordinary damage adds one death-save failure", () => {
    const result = applyDamage(downed({ deathSaves: { s: 0, f: 0 } }), 3);
    expect(result.hp).toBe(0);
    expect(result.deathSaves).toEqual({ s: 0, f: 1 });
    expect(result.dead).toBe(false);
  });

  it("critical hit adds two death-save failures", () => {
    const result = applyDamage(downed({ deathSaves: { s: 0, f: 0 } }), 3, { critical: true });
    expect(result.deathSaves).toEqual({ s: 0, f: 2 });
    expect(result.dead).toBe(false);
  });

  it("3rd failure from damage-at-0 kills", () => {
    const result = applyDamage(downed({ deathSaves: { s: 1, f: 2 } }), 4);
    expect(result.deathSaves).toEqual({ s: 1, f: 3 });
    expect(result.dead).toBe(true);
  });

  it("damage fully absorbed by tempHp while at 0 HP still adds one death-save failure", () => {
    const result = applyDamage(downed({ tempHp: 5, deathSaves: { s: 0, f: 0 } }), 3);
    expect(result.tempHp).toBe(2);
    expect(result.deathSaves).toEqual({ s: 0, f: 1 });
    expect(result.hp).toBe(0);
    expect(result.dead).toBe(false);
  });
});

describe("applyDamage — instant death at 0 HP (damage >= max HP)", () => {
  it("damage equal to max HP kills instantly", () => {
    const result = applyDamage(downed({ maxHp: 20, deathSaves: { s: 0, f: 0 } }), 20);
    expect(result.dead).toBe(true);
    expect(result.instantDeath).toBe(true);
    expect(result.hp).toBe(0);
  });

  it("damage one below max HP is a normal failure, not instant death", () => {
    const result = applyDamage(downed({ maxHp: 20, deathSaves: { s: 0, f: 0 } }), 19);
    expect(result.dead).toBe(false);
    expect(result.instantDeath).toBe(false);
    expect(result.deathSaves).toEqual({ s: 0, f: 1 });
  });

  it("instant death still applies even when tempHp fully absorbs the hit", () => {
    const result = applyDamage(downed({ maxHp: 20, tempHp: 50, deathSaves: { s: 0, f: 0 } }), 20);
    expect(result.dead).toBe(true);
    expect(result.instantDeath).toBe(true);
  });
});

describe("applyDamage — no-ops", () => {
  it("dead characters are unaffected", () => {
    const result = applyDamage(downed({ dead: true, deathSaves: { s: 0, f: 3 } }), 5);
    expect(result.dead).toBe(true);
    expect(result.deathSaves).toEqual({ s: 0, f: 3 });
  });

  it("zero/negative damage is a no-op", () => {
    const before = alive({ hp: 10 });
    const result = applyDamage(before, 0);
    expect(result.hp).toBe(10);
  });
});

describe("applyHeal — healing from 0 HP clears death state", () => {
  it("heal from 0 to >=1 HP resets death saves, removes Unconscious, revived=true", () => {
    const result = applyHeal(
      downed({ deathSaves: { s: 2, f: 1 }, conditions: ["unconscious", "prone"], maxHp: 20 }),
      5,
    );
    expect(result.hp).toBe(5);
    expect(result.deathSaves).toEqual({ s: 0, f: 0 });
    expect(result.conditions).toEqual(["prone"]);
    expect(result.dead).toBe(false);
    expect(result.revived).toBe(true);
  });
});

describe("applyHeal — healing while already alive leaves death state untouched", () => {
  it("heal above 0 HP does not touch deathSaves/conditions and revived=false", () => {
    const result = applyHeal(alive({ hp: 5, maxHp: 20, deathSaves: { s: 1, f: 0 } }), 3);
    expect(result.hp).toBe(8);
    expect(result.deathSaves).toEqual({ s: 1, f: 0 });
    expect(result.revived).toBe(false);
  });

  it("healing is capped at max HP", () => {
    const result = applyHeal(alive({ hp: 18, maxHp: 20 }), 10);
    expect(result.hp).toBe(20);
  });
});

describe("applyHeal — no-ops", () => {
  it("dead characters cannot be healed by this path", () => {
    const result = applyHeal(downed({ dead: true }), 10);
    expect(result.dead).toBe(true);
    expect(result.revived).toBe(false);
  });

  it("zero/negative heal is a no-op", () => {
    const result = applyHeal(alive({ hp: 10 }), 0);
    expect(result.hp).toBe(10);
    expect(result.revived).toBe(false);
  });
});

describe("conditions array is returned as a fresh copy, never aliased to the input", () => {
  it("applyDamage does not return the same conditions array reference", () => {
    const character = alive({ conditions: ["prone"] });
    const result = applyDamage(character, 3);
    expect(result.conditions).not.toBe(character.conditions);
    expect(result.conditions).toEqual(["prone"]);
  });

  it("applyHeal does not return the same conditions array reference", () => {
    const character = alive({ conditions: ["prone"] });
    const result = applyHeal(character, 3);
    expect(result.conditions).not.toBe(character.conditions);
    expect(result.conditions).toEqual(["prone"]);
  });
});
