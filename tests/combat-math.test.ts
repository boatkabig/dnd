import { describe, it, expect } from "vitest";
import { gridDistance, isAdjacent, applyEnemyDamage, hitEnemy } from "../src/lib/combatMath";

describe("gridDistance — Chebyshev on the 5-ft grid", () => {
  it("is the max of |dx| and |dy| (diagonals count as one square)", () => {
    expect(gridDistance({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
    expect(gridDistance({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(3);
    expect(gridDistance({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(2); // diagonal
    expect(gridDistance({ x: 1, y: 5 }, { x: 4, y: 1 })).toBe(4);
  });
});

describe("isAdjacent — within one square = melee range", () => {
  it("true for same, orthogonal-1, and diagonal-1; false beyond", () => {
    expect(isAdjacent({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(true);
    expect(isAdjacent({ x: 2, y: 2 }, { x: 3, y: 2 })).toBe(true);
    expect(isAdjacent({ x: 2, y: 2 }, { x: 3, y: 3 })).toBe(true); // diagonal still adjacent
    expect(isAdjacent({ x: 2, y: 2 }, { x: 4, y: 2 })).toBe(false);
  });
});

describe("applyEnemyDamage — bridge-owned HP, no-bridge fallback", () => {
  it("derives reduced HP via a throwaway bridge when no bridge is passed", () => {
    const r = applyEnemyDamage(null, "e1", 3, 10);
    expect(r.hp).toBe(7);
  });

  it("clamps to 0 on lethal overkill", () => {
    const r = applyEnemyDamage(null, "e1", 999, 10);
    expect(r.hp).toBe(0);
  });
});

describe("hitEnemy — the sole place hpNow is assigned", () => {
  it("mutates target.hpNow to the new HP and returns it", () => {
    const target = { uid: "e1", hpNow: 12, ac: 13, th: "Goblin" };
    const cbLike: { bridge: unknown } = { bridge: null };
    const hp = hitEnemy(cbLike, target, 5);
    expect(hp).toBe(7);
    expect(target.hpNow).toBe(7);
  });
});
