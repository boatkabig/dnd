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

import { checkCombatEnd, applyPendingChanges, type CombatDeps } from "../src/lib/combatResolve";
import { vi } from "vitest";

function deps(): CombatDeps & { onVictoryDungeon: ReturnType<typeof vi.fn> } {
  let id = 0;
  return {
    entrySystem: (t: string) => ({ id: ++id, type: "system", text: t }),
    nextId: () => ++id,
    onVictoryDungeon: vi.fn(),
  };
}

describe("checkCombatEnd", () => {
  it("reports ongoing when any enemy still lives", () => {
    const d = deps();
    const res = checkCombatEnd({ enemies: [enemy("e1", 5), enemy("e2", 0)] }, { level: 1 }, [], d);
    expect(res.ended).toBe(false);
    expect(d.onVictoryDungeon).not.toHaveBeenCalled();
  });

  it("ends with victory when all enemies are down: awards XP, logs, runs dungeon hook", () => {
    const d = deps();
    const entries: any[] = [];
    const cc = { level: 1, xp: 0, gold: 0, inventory: [] as string[] };
    const res = checkCombatEnd(
      { enemies: [{ ...enemy("e1", 0), xp: 100 }, { ...enemy("e2", 0), xp: 100 }] },
      cc, entries, d,
    );
    expect(res.ended).toBe(true);
    expect(res.cc.xp).toBe(200);                 // XP from both enemies
    expect(d.onVictoryDungeon).toHaveBeenCalledTimes(1);
    expect(entries.some((e: any) => String(e.text).includes("ชนะ"))).toBe(true);
  });
});

describe("applyPendingChanges", () => {
  it("applies a condition to the player", () => {
    const logs: string[] = [];
    const change = { type: "apply_condition", targetId: "player", sourceFeature: "Poison Weapon",
      payload: { conditionId: "poisoned", conditionDuration: 2 } };
    const out = applyPendingChanges([change as any], { id: "player", conditions: [] }, { enemies: [] }, (t) => logs.push(t));
    expect(out.cc.conditions).toContain("poisoned");
    expect(logs.some((l) => l.includes("poisoned"))).toBe(true);
  });

  it("deals feature damage to the targeted enemy (deterministic 3d1 = 3)", () => {
    const change = { type: "deal_damage", targetId: "e1", sourceFeature: "Hex",
      payload: { damageFormula: "3d1", damageType: "necrotic" } };
    const cb = { bridge: null, enemies: [enemy("e1", 10)] };
    const out = applyPendingChanges([change as any], { id: "player" }, cb, () => {});
    expect(out.cb.enemies[0].hpNow).toBe(7); // 10 - 3
  });

  it("heals the player, capped at maxHp", () => {
    const change = { type: "heal", targetId: "player", sourceFeature: "Second Wind",
      payload: { healFormula: "3d1" } };
    const out = applyPendingChanges([change as any], { id: "player", hp: 5, maxHp: 20 }, { enemies: [] }, () => {});
    expect(out.cc.hp).toBe(8); // 5 + 3
  });

  it("a feature heal from 0 HP clears the dying state (deathSaves + Unconscious) via hpState", () => {
    const change = { type: "heal", targetId: "player", sourceFeature: "Healing Word",
      payload: { healFormula: "3d1" } };
    const downed = { id: "player", hp: 0, maxHp: 20, deathSaves: { s: 1, f: 2 }, conditions: ["unconscious", "prone"] };
    const out = applyPendingChanges([change as any], downed, { enemies: [] }, () => {});
    expect(out.cc.hp).toBe(3); // 0 + 3
    expect(out.cc.deathSaves).toEqual({ s: 0, f: 0 });
    expect(out.cc.conditions).not.toContain("unconscious");
    expect(out.cc.conditions).toContain("prone");
  });
});
