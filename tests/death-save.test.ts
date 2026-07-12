import { describe, it, expect } from "vitest";
import { applyDeathSaveRoll } from "../src/lib/engine/combat";

/**
 * fix/death-outside-combat — death-save state transition.
 *
 * DnDSolo's playerCombatAction (in-combat) and submitAction (out-of-combat hazard/trap
 * damage) both used to route hp<=0 through this same shape of logic, but the
 * out-of-combat site clamped `hp` back to 1 instead of ever calling it — so trap/DM-narrated
 * damage could never trigger unconsciousness or death. applyDeathSaveRoll() is the extracted
 * pure transition (dice/math delegated to rollDeathSave(), plus the HP/dead bookkeeping around
 * it) now shared by both call sites via the component-level resolveDeathSave() wrapper.
 *
 * These tests lock in:
 *   1. The in-combat outcomes (nat-20 revive, 3rd success stable, 3rd failure dead) are
 *      unchanged after the extraction.
 *   2. The out-of-combat fix: hp<=0 with an ordinary (non-resolving) roll stays at hp 0 —
 *      it is NOT clamped back to 1 — so repeated calls (one per player turn/action) can
 *      accumulate toward stable or dead exactly like the in-combat loop.
 */
describe("applyDeathSaveRoll — in-combat outcomes unchanged", () => {
  it("nat 20 revives with 1 HP and resets death saves", () => {
    const result = applyDeathSaveRoll({ successes: 1, failures: 1, hp: 0 }, 20);
    expect(result.state).toBe("revived");
    expect(result.hp).toBe(1);
    expect(result.dead).toBe(false);
    expect(result.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it("3rd success stabilizes and stays at 0 HP (D&D 2024: Stable != revived)", () => {
    const result = applyDeathSaveRoll({ successes: 2, failures: 0, hp: 0 }, 15);
    expect(result.state).toBe("stable");
    expect(result.hp).toBe(0);
    expect(result.dead).toBe(false);
    expect(result.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it("3rd failure kills — hp is not forced anywhere", () => {
    const result = applyDeathSaveRoll({ successes: 0, failures: 2, hp: 0 }, 3);
    expect(result.state).toBe("dead");
    expect(result.dead).toBe(true);
    expect(result.hp).toBe(0);
    expect(result.deathSaves).toEqual({ successes: 0, failures: 3 });
  });

  it("nat 1 counts as 2 failures — not yet dead at 0/2 -> 2/2", () => {
    const result = applyDeathSaveRoll({ successes: 0, failures: 0, hp: 0 }, 1);
    expect(result.state).toBe("unconscious");
    expect(result.deathSaves).toEqual({ successes: 0, failures: 2 });
    expect(result.hp).toBe(0);
  });
});

describe("applyDeathSaveRoll — out-of-combat fix: hp is never clamped back to 1", () => {
  it("an ordinary failing roll leaves hp at 0 (previously the DnDSolo clamp forced hp=1 here)", () => {
    const result = applyDeathSaveRoll({ successes: 0, failures: 0, hp: 0 }, 8);
    expect(result.state).toBe("unconscious");
    expect(result.hp).toBe(0);
    expect(result.dead).toBe(false);
    expect(result.deathSaves).toEqual({ successes: 0, failures: 1 });
  });

  it("an ordinary succeeding roll (not yet the 3rd) leaves hp at 0 too — still dying, not clamped alive", () => {
    const result = applyDeathSaveRoll({ successes: 0, failures: 0, hp: 0 }, 12);
    expect(result.state).toBe("unconscious");
    expect(result.hp).toBe(0);
    expect(result.deathSaves).toEqual({ successes: 1, failures: 0 });
  });

  it("repeated calls (simulating repeated out-of-combat turns) can reach dead from hp<=0", () => {
    let result = applyDeathSaveRoll({ successes: 0, failures: 0, hp: 0 }, 2); // fail 1
    expect(result.state).toBe("unconscious");
    result = applyDeathSaveRoll({ ...result.deathSaves, hp: result.hp }, 4); // fail 2 (nat isn't 1, so +1)
    expect(result.state).toBe("unconscious");
    expect(result.hp).toBe(0);
    result = applyDeathSaveRoll({ ...result.deathSaves, hp: result.hp }, 5); // fail 3 -> dead
    expect(result.state).toBe("dead");
    expect(result.dead).toBe(true);
  });

  it("hp already above 0 (e.g. healed between calls) short-circuits to stable, matching the revived/hp>0 branch", () => {
    const result = applyDeathSaveRoll({ successes: 0, failures: 1, hp: 5 }, 3);
    expect(result.state).toBe("stable");
    expect(result.hp).toBe(5);
    expect(result.deathSaves).toEqual({ successes: 0, failures: 0 });
  });
});
