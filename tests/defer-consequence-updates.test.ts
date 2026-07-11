import { describe, it, expect } from "vitest";
import { deferConsequenceUpdates, CONSEQUENCE_UPDATE_KEYS } from "../src/lib/dmSchema";

/**
 * Guards the "no consequences before the roll" rule (prompt rule 2.3): when the DM
 * asks for a check/save, any outcome-bearing `updates` in that SAME response must be
 * deferred until after the dice land — otherwise a successful roll can't undo a
 * punishment the player already took (the "you got caught even though Stealth 19 > DC 16"
 * bug). World/narrative fields are setup, not outcome, and must pass through untouched.
 */
describe("deferConsequenceUpdates — defer roll outcomes until after the check", () => {
  it("strips every consequence field", () => {
    const updates = {
      hp_delta: -5, temp_hp: 3, gold_delta: -10, xp_award: 50,
      items_add: ["Dagger"], items_use: ["Potion"], items_remove: ["Key"], loot_drop: ["Gem"],
      conditions_add: ["prone"], conditions_remove: ["blinded"],
      buffs_add: ["Bless"], buffs_remove: ["Bane"],
      exhaustion_delta: 1, rest_trigger: "short",
    };
    // Nothing but consequences → whole object collapses to null (nothing to apply pre-roll).
    expect(deferConsequenceUpdates(updates)).toBeNull();
  });

  it("keeps world/narrative fields while dropping consequences", () => {
    const result = deferConsequenceUpdates({
      hp_delta: -8,                       // consequence → dropped
      gold_delta: -15,                    // consequence → dropped
      time_delta: 1,                      // setup → kept
      scene_type: "exploration",          // setup → kept
      npc_attitude: { npc_id: "guard", attitude: "hostile" }, // setup → kept
    }) as Record<string, unknown>;
    expect(result.hp_delta).toBeUndefined();
    expect(result.gold_delta).toBeUndefined();
    expect(result.time_delta).toBe(1);
    expect(result.scene_type).toBe("exploration");
    expect(result.npc_attitude).toEqual({ npc_id: "guard", attitude: "hostile" });
  });

  it("returns the object unchanged when it holds no consequences (same reference)", () => {
    const updates = { time_delta: 2, quest_add: { id: "q1", title: "Find the box" } };
    expect(deferConsequenceUpdates(updates)).toBe(updates);
  });

  it("passes null / undefined / non-objects through untouched", () => {
    expect(deferConsequenceUpdates(null)).toBeNull();
    expect(deferConsequenceUpdates(undefined)).toBeUndefined();
    expect(deferConsequenceUpdates("nope")).toBe("nope");
  });

  it("every listed key is actually a real UpdatesSchema field name (no typos)", () => {
    // Sanity: the guard is worthless if a key is misspelled and never matches.
    for (const k of CONSEQUENCE_UPDATE_KEYS) {
      expect(deferConsequenceUpdates({ [k]: 1 })).toBeNull();
    }
  });
});
