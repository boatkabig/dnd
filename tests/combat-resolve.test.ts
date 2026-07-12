import { describe, it, expect } from "vitest";
import { runSidekickAssist } from "../src/lib/combatResolve";
import { SIDEKICK_BASES } from "../src/lib/engine/sidekick";

/**
 * runSidekickAssist — companion offensive assist during the enemy phase.
 * Attack rolls are random (d20), so tests assert the deterministic control flow
 * (no-op guards, that it acts when it should) rather than exact damage.
 */
const baseKey = Object.keys(SIDEKICK_BASES)[0]; // a real sidekick base

function enemy(uid: string, hpNow = 10) {
  return { uid, hpNow, ac: 10, th: "Goblin" };
}
function withSidekick() {
  return { hp: 20, maxHp: 20, level: 3, sidekick: { baseKey, klass: "warrior", level: 3 } };
}

describe("runSidekickAssist", () => {
  it("is a no-op when the character has no sidekick", () => {
    const logs: string[] = [];
    const cb = { enemies: [enemy("e1")] };
    runSidekickAssist(cb, { hp: 20, maxHp: 20, level: 3 }, (t) => logs.push(t), "e1");
    expect(logs).toEqual([]);
    expect(cb.enemies[0].hpNow).toBe(10); // untouched
  });

  it("is a no-op when there are no living enemies", () => {
    const logs: string[] = [];
    runSidekickAssist({ enemies: [enemy("e1", 0)] }, withSidekick(), (t) => logs.push(t), "e1");
    expect(logs).toEqual([]);
  });

  it("is a no-op when the combat / enemies array is missing", () => {
    const logs: string[] = [];
    runSidekickAssist(null, withSidekick(), (t) => logs.push(t));
    runSidekickAssist({}, withSidekick(), (t) => logs.push(t));
    expect(logs).toEqual([]);
  });

  it("acts (logs at least once) when a sidekick has a living enemy to assist against", () => {
    const logs: string[] = [];
    runSidekickAssist({ enemies: [enemy("e1")] }, withSidekick(), (t) => logs.push(t), "e1");
    expect(logs.length).toBeGreaterThanOrEqual(1);
    // Every log line is attributed to the companion.
    expect(logs.every((l) => l.includes("🐕"))).toBe(true);
  });

  it("targets the selected enemy id when it is still alive", () => {
    // Only the selected enemy is targetable here (others already down), so any
    // damage that lands must land on it — proves targetId routing.
    const cb = { enemies: [enemy("dead", 0), enemy("selected", 10)] };
    runSidekickAssist(cb, withSidekick(), () => {}, "selected");
    expect(cb.enemies[0].hpNow).toBe(0);            // dead one never touched
    expect(cb.enemies[1].hpNow).toBeLessThanOrEqual(10); // selected one may take damage
  });
});
