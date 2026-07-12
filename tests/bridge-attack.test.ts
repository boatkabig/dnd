import { describe, it, expect } from "vitest";
import { toDamageType, resolveBridgeAttack } from "../src/lib/bridgeAttack";

describe("toDamageType", () => {
  it("passes through a valid engine damage type", () => {
    expect(toDamageType("fire")).toBe("fire");
    expect(toDamageType("SLASHING")).toBe("slashing"); // case-insensitive
  });
  it("falls back to slashing for unknown / missing", () => {
    expect(toDamageType("banana")).toBe("slashing");
    expect(toDamageType(null)).toBe("slashing");
    expect(toDamageType(undefined)).toBe("slashing");
  });
});

describe("resolveBridgeAttack", () => {
  it("resolves a seeded attack deterministically and returns a pure result shape", () => {
    const input = {
      attacker: { id: "player", name: "Sylas", ac: 14, hp: 20 },
      target: { id: "e1", name: "Goblin", ac: 12, hp: 7 },
      attackBonus: 5, damageExpr: "1d6+3", damageType: toDamageType("slashing"),
      seed: 42,
    };
    const a = resolveBridgeAttack(input);
    const b = resolveBridgeAttack(input); // same seed → identical
    expect(a).toEqual(b);
    expect(typeof a.hit).toBe("boolean");
    expect(a.damageType).toBe("slashing");
    if (a.hit) expect(a.damage).toBeGreaterThan(0);
  });
});
