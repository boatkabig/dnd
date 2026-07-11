import { describe, it, expect } from "vitest";
import {
  buildBridgeState,
  applyBridgeDamage,
  getCombatView,
  type RawCombatantInput,
} from "../src/lib/engine/combatBridge";

/**
 * Combat-state migration — Stage C guard.
 *
 * DnDSolo's initCombat now FEEDS each combatant's already-rolled initiative into
 * buildBridgeState and derives `cb.initOrder` / `cb.currentInitIdx` from
 * getCombatView() instead of holding a parallel copy. These tests lock in the
 * two properties initCombat relies on:
 *   1. buildBridgeState seeds the bridge with the caller's initiative totals.
 *   2. getCombatView().order reproduces the app's prior stable descending sort
 *      EXACTLY (including ties), so the migration is behavior-preserving.
 * Plus a Stage A regression: applyBridgeDamage still works on a seeded bridge.
 */

// Mirror of the legacy local sort DnDSolo used to build initOrder:
//   [player, ...enemies].sort((a, b) => b.init - a.init)
function legacyOrder(inputs: RawCombatantInput[]): string[] {
  return [...inputs]
    .map((o) => ({ id: o.id, init: o.initiative ?? 0 }))
    .sort((a, b) => b.init - a.init)
    .map((o) => o.id);
}

function mk(id: string, isPlayer: boolean, initiative: number): RawCombatantInput {
  return { id, name: id, ac: 12, hp: 7, maxHp: 7, speed: 30, isPlayer, initiative };
}

describe("buildBridgeState — Stage C initiative seeding", () => {
  it("owns the seeded initiative totals (not the 20/10 placeholder)", () => {
    const state = buildBridgeState([
      mk("player", true, 17),
      mk("g0", false, 14),
      mk("g1", false, 9),
    ]);
    const byId = Object.fromEntries(
      getCombatView(state).order.map((o) => [o.id, o.initiative]),
    );
    expect(byId).toEqual({ player: 17, g0: 14, g1: 9 });
  });

  it("falls back to players-before-enemies when initiative is omitted (HP path)", () => {
    const state = buildBridgeState([
      { id: "player", name: "P", ac: 12, hp: 7, isPlayer: true },
      { id: "g0", name: "G", ac: 12, hp: 7, isPlayer: false },
    ]);
    const order = getCombatView(state).order;
    expect(order[0].id).toBe("player");
    expect(order[0].initiative).toBe(20);
    expect(order[1].initiative).toBe(10);
  });

  it("getCombatView().order matches the legacy stable descending sort exactly", () => {
    const cases: RawCombatantInput[][] = [
      [mk("player", true, 12), mk("g0", false, 15), mk("g1", false, 15)], // enemy tie
      [mk("player", true, 15), mk("g0", false, 15), mk("g1", false, 15)], // full tie
      [mk("player", true, 15), mk("g0", false, 15), mk("g1", false, 10)], // player ties top
      [mk("player", true, 10), mk("g0", false, 15), mk("g1", false, 15), mk("g2", false, 15)],
      [mk("player", true, 8), mk("g0", false, 8), mk("g1", false, 20), mk("g2", false, 8)],
      [mk("player", true, 19), mk("g0", false, 11), mk("g1", false, 6)], // distinct
    ];
    for (const inputs of cases) {
      const bridgeOrder = getCombatView(buildBridgeState(inputs)).order.map((o) => o.id);
      expect(bridgeOrder).toEqual(legacyOrder(inputs));
    }
  });

  it("currentInitIdx (first entry where isPlayer === playerFirst) stays 0 at start", () => {
    // playerFirst true → player on top; playerFirst false → an enemy on top.
    const playerFirst = getCombatView(
      buildBridgeState([mk("player", true, 18), mk("g0", false, 12)]),
    );
    const idxA = playerFirst.order.findIndex((o) => o.isPlayer === true);
    expect(idxA).toBe(0);

    const enemyFirst = getCombatView(
      buildBridgeState([mk("player", true, 5), mk("g0", false, 16)]),
    );
    const idxB = enemyFirst.order.findIndex((o) => o.isPlayer === false);
    expect(idxB).toBe(0);
  });
});

describe("applyBridgeDamage — Stage A regression on a seeded bridge", () => {
  it("still applies max(0, hp - amount) to the targeted combatant only", () => {
    const state = buildBridgeState([
      mk("player", true, 17),
      mk("g0", false, 14),
      mk("g1", false, 9),
    ]);
    const r = applyBridgeDamage(state, "g0", 5);
    expect(r.found).toBe(true);
    expect(r.newHP).toBe(2);
    const view = getCombatView(r.state);
    expect(view.order.find((o) => o.id === "g0")!.hp).toBe(2);
    expect(view.order.find((o) => o.id === "g1")!.hp).toBe(7); // untouched
  });
});
