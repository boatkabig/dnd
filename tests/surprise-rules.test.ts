import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/characterStats", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/characterStats")>();
  return {
    ...actual,
    rollD20: vi.fn((mod: number, adv: "none" | "advantage" | "disadvantage" = "none") => ({
      die: 10, other: adv === "none" ? null : 9, mod, total: 10 + mod, adv,
    })),
  };
});

// startCombat (src/lib/combat.ts) rolls initiative via diceEngine's rollD20,
// not characterStats' — mock that module separately so the initiative-roll
// assertions below actually observe the calls startCombat makes.
vi.mock("../src/lib/diceEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/diceEngine")>();
  return {
    ...actual,
    rollD20: vi.fn((mod: number, adv: "none" | "advantage" | "disadvantage" = "none") => ({
      die: 10, other: adv === "none" ? null : 9, mod, total: 10 + mod, adv,
    })),
  };
});

vi.mock("../src/lib/srd", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/srd")>();
  return { ...actual, fetchSpell: vi.fn() };
});

import { rollD20 } from "../src/lib/diceEngine";
import { startCombat } from "../src/lib/combat";
import { castSRDSpell } from "../src/lib/castSpell";
import { fetchSpell } from "../src/lib/srd";
import { resolveWeaponAttack } from "../src/lib/weaponAttack";
import type { CombatDeps } from "../src/lib/combatResolve";

const deps: CombatDeps = { entrySystem: (text) => ({ id: 1, type: "system", text }), nextId: () => 1 };

describe("2024 surprise", () => {
  beforeEach(() => {
    (rollD20 as any).mockClear();
    (fetchSpell as any).mockReset();
  });

  it("keeps disadvantage on the surprised enemy's initiative", () => {
    startCombat(
      { name: "Mage", hp: 10, maxHp: 10, ac: 12, dex: 14, pos: { x: 0, y: 0 }, speed: 30, conditions: [] },
      [{ uid: "goblin", name: "Goblin", hp: 7, maxHp: 7, ac: 12, init: 2, pos: { x: 1, y: 0 } }],
      { w: 12, h: 10 },
      true,
    );

    expect(rollD20).toHaveBeenNthCalledWith(1, 2);
    expect(rollD20).toHaveBeenNthCalledWith(2, 2, "disadvantage");
  });

  it("does not turn surprise into weapon-attack advantage", () => {
    const entries: any[] = [];
    resolveWeaponAttack(
      { dmg: "1d1", abil: "str", ranged: false, properties: [] }, "Attack",
      { name: "Fighter", cls: "fighter", level: 1, ac: 16, hp: 20, maxHp: 20, speed: 30, abilities: { str: 10 }, conditions: [], buffs: [], feats: [] },
      { surprise: true, enemies: [{ uid: "goblin", th: "Goblin", hp: 7, hpNow: 7, ac: 12, conditions: [] }], enemyPositions: { goblin: { x: 1, y: 0 } }, playerPos: { x: 0, y: 0 } },
      entries,
      { targetId: "goblin", powerAttackOn: false, characterHasFeatureById: () => false, deps },
    );

    expect(entries.find((entry) => entry.type === "roll")?.roll.adv).toBe("none");
  });

  it("does not turn surprise into spell-attack advantage", async () => {
    (fetchSpell as any).mockResolvedValue({ index: "ray", name: "Ray", level: 0, school: "evocation", kind: "attack", desc: "", damage: "1d1" });
    const entries: any[] = [];
    await castSRDSpell(
      "ray", 0,
      { name: "Mage", cls: "wizard", level: 3, slots: [1], knownSpells: ["ray"], conditions: [], buffs: [], hp: 20, maxHp: 20, abilities: { int: 16, dex: 14 } },
      { surprise: true, enemies: [{ uid: "goblin", th: "Goblin", hp: 7, hpNow: 7, ac: 12, conditions: [] }], enemyPositions: { goblin: { x: 1, y: 0 } }, playerPos: { x: 0, y: 0 } },
      entries, deps, "goblin",
    );

    expect(entries.find((entry) => entry.type === "roll")?.roll.adv).toBe("none");
  });
});
