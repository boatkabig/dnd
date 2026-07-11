import { describe, it, expect } from "vitest";
import {
  buildBridgeState,
  getCombatView,
  endTurn,
  moveBy,
  performAttack,
  runEnemyTurn,
  type RawCombatantInput,
} from "../src/lib/engine/combatBridge";

/**
 * Turn-loop primitives — engine-level guard for the interleaved combat loop.
 *
 * These tests lock in the properties the new turn loop depends on:
 *   1. Initiative order + endTurn cycling (with round rollover on wrap).
 *   2. Per-turn action/movement budgets are reseeded when the turn cycles
 *      back around to a combatant (not just reset once at combat start).
 *   3. Movement is tracked in feet 1:1 against speed (regression pin for a
 *      previously-fixed 5x unit bug).
 *   4. runEnemyTurn's return shape for a minimal decide callback.
 */

function mk(id: string, isPlayer: boolean, initiative: number, speed = 30): RawCombatantInput {
  return { id, name: id, ac: 12, hp: 20, maxHp: 20, speed, isPlayer, initiative };
}

describe("turn sequencing — order, currentCombatantId, round wrap", () => {
  it("sorts by initiative descending and endTurn cycles through order, wrapping with a round increment", () => {
    let state = buildBridgeState([
      mk("player", true, 15),
      mk("g0", false, 20),
      mk("g1", false, 5),
    ]);

    const initialView = getCombatView(state);
    expect(initialView.order.map((o) => o.id)).toEqual(["g0", "player", "g1"]);
    expect(initialView.round).toBe(1);
    expect(initialView.currentCombatantId).toBe("g0");

    state = endTurn(state).state;
    expect(getCombatView(state).currentCombatantId).toBe("player");
    expect(getCombatView(state).round).toBe(1);

    state = endTurn(state).state;
    expect(getCombatView(state).currentCombatantId).toBe("g1");
    expect(getCombatView(state).round).toBe(1);

    state = endTurn(state).state;
    expect(getCombatView(state).currentCombatantId).toBe("g0"); // wrapped back to first
    expect(getCombatView(state).round).toBe(2); // round incremented on wrap
  });
});

describe("tracker reseed — per-turn budget resets when the turn cycles back", () => {
  it("restores an enemy's actionBudget only once the turn wraps back to it, not before", () => {
    let state = buildBridgeState([
      mk("player", true, 15),
      mk("g0", false, 20),
      mk("g1", false, 5),
    ]);
    // order: g0 (current), player, g1

    const moved = moveBy(state, "g0", 20);
    expect(moved.ok).toBe(true);
    state = moved.state;

    const attacked = performAttack(state, {
      attackerId: "g0",
      targetId: "player",
      modifiers: [{ source: "test", value: 5 }],
      damageExpr: "1d6",
      damageType: "slashing",
      seed: 1,
    });
    expect(attacked.spend.valid).toBe(true);
    state = attacked.state;

    const spentG0 = getCombatView(state).order.find((o) => o.id === "g0")!;
    expect(spentG0.actionBudget.movementRemaining).toBe(10); // 30 - 20
    expect(spentG0.actionBudget.action).toBe(0);

    // Advance through player and g1 — g0's spent tracker must NOT reset yet.
    state = endTurn(state).state; // -> player
    const midCycleG0 = getCombatView(state).order.find((o) => o.id === "g0")!;
    expect(midCycleG0.actionBudget.movementRemaining).toBe(10);
    expect(midCycleG0.actionBudget.action).toBe(0);

    state = endTurn(state).state; // -> g1
    state = endTurn(state).state; // -> g0 (wraps; g0's tracker resets on arrival)

    const resetView = getCombatView(state);
    expect(resetView.currentCombatantId).toBe("g0");
    const g0Reset = resetView.order.find((o) => o.id === "g0")!;
    expect(g0Reset.actionBudget.movementRemaining).toBe(30);
    expect(g0Reset.actionBudget.action).toBe(1);
    expect(g0Reset.actionBudget.reactionAvailable).toBe(true);
  });
});

describe("feet movement — regression pin for the fixed 5x bug", () => {
  it("moveBy spends feet 1:1 against speed and blocks beyond the remaining budget", () => {
    let state = buildBridgeState([
      mk("player", true, 20, 30),
      mk("g0", false, 10, 30),
    ]);
    // player is current (order[0])

    expect(
      getCombatView(state).order.find((o) => o.id === "player")!.actionBudget.movementRemaining,
    ).toBe(30);

    const move1 = moveBy(state, "player", 10);
    expect(move1.ok).toBe(true);
    state = move1.state;
    expect(
      getCombatView(state).order.find((o) => o.id === "player")!.actionBudget.movementRemaining,
    ).toBe(20);

    const move2 = moveBy(state, "player", 20);
    expect(move2.ok).toBe(true);
    state = move2.state;
    expect(
      getCombatView(state).order.find((o) => o.id === "player")!.actionBudget.movementRemaining,
    ).toBe(0);

    // Budget fully spent (30 total) — any further movement is blocked, state unchanged.
    const blocked = moveBy(state, "player", 1);
    expect(blocked.ok).toBe(false);
    expect(
      getCombatView(blocked.state).order.find((o) => o.id === "player")!.actionBudget
        .movementRemaining,
    ).toBe(0);

    // A single over-budget request against a fresh 30ft speed is blocked outright.
    const fresh = buildBridgeState([mk("solo", true, 10, 30)]);
    const overshoot = moveBy(fresh, "solo", 31);
    expect(overshoot.ok).toBe(false);
    expect(getCombatView(overshoot.state).order[0].actionBudget.movementRemaining).toBe(30);
  });
});

describe("runEnemyTurn — minimal decide callback drives one enemy turn", () => {
  it("executes the returned intent, ends the turn, and matches EnemyTurnOutcome's shape", () => {
    const state = buildBridgeState([
      mk("player", true, 5),
      mk("g0", false, 20),
    ]);
    // g0 is current (highest initiative).

    const outcome = runEnemyTurn(state, "g0", () => ({ type: "move", feet: 10 }));

    expect(outcome.intent).toEqual({ type: "move", feet: 10 });
    expect(outcome.move).toEqual({ ok: true });
    expect(outcome.attack).toBeUndefined();
    expect(outcome.endTurn.onEndTriggers).toEqual([]);
    expect(outcome.endTurn.onStartTriggers).toEqual([]);

    const view = getCombatView(outcome.state);
    expect(view.currentCombatantId).toBe("player"); // turn advanced past g0
    const g0View = view.order.find((o) => o.id === "g0")!;
    expect(g0View.actionBudget.movementRemaining).toBe(20); // spent 10 of 30; not yet reset
  });
});
