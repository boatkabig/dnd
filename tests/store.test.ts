/**
 * Game store + reducer tests.
 *
 * Focus: the APPLY_DM_UPDATES atomicity guarantee (fixes the legacy
 * partial-commit-on-error bug) plus faithful per-field application, purity,
 * and the store container contract.
 */

import { describe, it, expect } from "vitest";
import { reducer } from "../src/lib/store/reducer";
import { createStore, createInitialState, createPlayerState } from "../src/lib/store/store";
import type { Action, GameState, ValidUpdates } from "../src/lib/store/types";

function apply(state: GameState, updates: ValidUpdates | null | undefined): GameState {
  return reducer(state, { type: "APPLY_DM_UPDATES", updates });
}

describe("reducer: APPLY_DM_UPDATES — per-field application", () => {
  it("applies hp_delta and clamps to [0, maxHp]", () => {
    const s = createInitialState({ player: createPlayerState({ hp: 8, maxHp: 10 }) });
    expect(apply(s, { hp_delta: 5 }).player.hp).toBe(10); // clamps up to maxHp
    expect(apply(s, { hp_delta: -20 }).player.hp).toBe(0); // clamps down to 0
    expect(apply(s, { hp_delta: -3 }).player.hp).toBe(5);
  });

  it("temp HP absorbs incoming damage before real HP", () => {
    const s = createInitialState({ player: createPlayerState({ hp: 10, maxHp: 10, tempHp: 4 }) });
    const r = apply(s, { hp_delta: -6 });
    expect(r.player.tempHp).toBe(0);
    expect(r.player.hp).toBe(8); // 6 dmg - 4 temp = 2 to real hp
  });

  it("temp_hp takes the max, never stacks", () => {
    const s = createInitialState({ player: createPlayerState({ tempHp: 5 }) });
    expect(apply(s, { temp_hp: 3 }).player.tempHp).toBe(5);
    expect(apply(s, { temp_hp: 8 }).player.tempHp).toBe(8);
  });

  it("damage that drops the player to 0 adds Unconscious + fresh death saves (HP-0 state machine)", () => {
    const s = createInitialState({ player: createPlayerState({ hp: 8, maxHp: 10, deathSaves: { s: 1, f: 0 } }) });
    const r = apply(s, { hp_delta: -8 });
    expect(r.player.hp).toBe(0);
    expect(r.player.dead).toBe(false);
    expect(r.player.conditions).toContain("unconscious");
    expect(r.player.deathSaves).toEqual({ s: 0, f: 0 });
  });

  it("damage taken while already at 0 HP adds a death-save failure (not more HP loss)", () => {
    const s = createInitialState({ player: createPlayerState({ hp: 0, maxHp: 10, conditions: ["unconscious"], deathSaves: { s: 0, f: 1 } }) });
    const r = apply(s, { hp_delta: -3 });
    expect(r.player.hp).toBe(0);
    expect(r.player.deathSaves).toEqual({ s: 0, f: 2 });
    expect(r.player.dead).toBe(false);
    expect(r.player.conditions).toContain("unconscious");
  });

  it("massive damage (overflow >= max HP) is instant death and flips phase to 'dead'", () => {
    const s = createInitialState({ player: createPlayerState({ hp: 5, maxHp: 10 }) });
    const r = apply(s, { hp_delta: -20 }); // overflow 15 >= 10
    expect(r.player.dead).toBe(true);
    expect(r.phase).toBe("dead");
  });

  it("a DM-narrated heal from 0 HP clears the dying state (deathSaves + Unconscious)", () => {
    const s = createInitialState({ player: createPlayerState({ hp: 0, maxHp: 10, conditions: ["unconscious", "prone"], deathSaves: { s: 1, f: 2 } }) });
    const r = apply(s, { hp_delta: 4 });
    expect(r.player.hp).toBe(4);
    expect(r.player.deathSaves).toEqual({ s: 0, f: 0 });
    expect(r.player.conditions).not.toContain("unconscious");
    expect(r.player.conditions).toContain("prone"); // unrelated conditions untouched
  });

  it("gold_delta floors at 0", () => {
    const s = createInitialState({ player: createPlayerState({ gold: 30 }) });
    expect(apply(s, { gold_delta: 20 }).player.gold).toBe(50);
    expect(apply(s, { gold_delta: -100 }).player.gold).toBe(0);
  });

  it("xp_award accumulates and flags pending level-up on crossing a threshold", () => {
    const s = createInitialState({ player: createPlayerState({ xp: 0, level: 1 }) });
    const r = apply(s, { xp_award: 300 }); // level 2 threshold
    expect(r.player.xp).toBe(300);
    expect(r.player.level).toBe(1); // store does NOT do class math — engine resolves
    expect(r.pending.levelUp).toBe(true);
  });

  it("xp_award below threshold does not flag level-up", () => {
    const s = createInitialState({ player: createPlayerState({ xp: 0, level: 1 }) });
    const r = apply(s, { xp_award: 100 });
    expect(r.pending.levelUp).toBe(false);
  });

  it("adds and removes items (one instance at a time)", () => {
    const s = createInitialState({ player: createPlayerState({ inventory: ["Rope", "Rope"] }) });
    const added = apply(s, { items_add: ["Torch"] });
    expect(added.player.inventory).toEqual(["Rope", "Rope", "Torch"]);
    const removed = apply(added, { items_remove: ["Rope"] });
    expect(removed.player.inventory).toEqual(["Rope", "Torch"]);
  });

  it("items_use on a missing item logs a notice and changes nothing", () => {
    const s = createInitialState({ player: createPlayerState({ inventory: ["Torch"] }) });
    const r = apply(s, { items_use: ["Healing Potion"] });
    expect(r.player.inventory).toEqual(["Torch"]);
    expect(r.log.some((e) => e.text.includes("ไม่มี Healing Potion"))).toBe(true);
  });

  it("auto-detects a Feat item and records the feat", () => {
    const s = createInitialState();
    const r = apply(s, { items_add: ["Feat: Great Weapon Master"] });
    expect(r.player.feats).toContain("great-weapon-master");
  });

  it("adds/removes conditions without duplicating", () => {
    const s = createInitialState();
    const a = apply(s, { conditions_add: ["poisoned", "poisoned"] });
    expect(a.player.conditions).toEqual(["poisoned"]);
    const b = apply(a, { conditions_remove: ["poisoned"] });
    expect(b.player.conditions).toEqual([]);
  });

  it("adds a string buff and an object buff; same name replaces", () => {
    const s = createInitialState();
    const a = apply(s, { buffs_add: ["Bless"] });
    expect(a.player.buffs[0]).toMatchObject({ name: "Bless", type: "buff", duration: -1 });
    const b = apply(a, { buffs_add: [{ name: "Bless", type: "buff", duration: 10, source: "cleric", effect_desc: "+1d4" }] });
    expect(b.player.buffs).toHaveLength(1);
    expect(b.player.buffs[0].duration).toBe(10);
  });

  it("loot_drop folds 'N gp' into gold and other strings into inventory", () => {
    const s = createInitialState({ player: createPlayerState({ gold: 10 }) });
    const r = apply(s, { loot_drop: ["50 gp", "Longsword"] });
    expect(r.player.gold).toBe(60);
    expect(r.player.inventory).toContain("Longsword");
  });

  it("advances time and bumps rest timers", () => {
    const s = createInitialState({ time: { day: 1, hour: 20 } });
    const r = apply(s, { time_delta: 8 });
    expect(r.time).toEqual({ day: 2, hour: 4 });
    expect(r.player.lastLongRestHoursAgo).toBe(8);
    expect(r.player.lastShortRestHoursAgo).toBe(8);
  });

  it("exhaustion at level 6 kills the character and flips phase to dead", () => {
    const s = createInitialState({ player: createPlayerState({ exhaustionLevel: 5 }) });
    const r = apply(s, { exhaustion_delta: 1 });
    expect(r.player.exhaustionLevel).toBe(6);
    expect(r.player.dead).toBe(true);
    expect(r.phase).toBe("dead");
  });

  it("rest_trigger only flags pending (engine applies the rest)", () => {
    const s = createInitialState();
    expect(apply(s, { rest_trigger: "long" }).pending.longRest).toBe(true);
    expect(apply(s, { rest_trigger: "short" }).pending.shortRest).toBe(true);
  });

  it("quest_add then quest_update completes an objective and status", () => {
    const s = createInitialState();
    const withQuest = apply(s, {
      quest_add: { id: "q1", title: "Slay", description: "kill it", objectives: [{ text: "find lair", done: false }, { text: "slay beast", done: false }] },
    });
    expect(withQuest.quests).toHaveLength(1);
    const done = apply(withQuest, { quest_update: { id: "q1", complete_objective: 0 } });
    expect(done.quests[0].objectives[0].done).toBe(true);
    expect(done.quests[0].objectives[1].done).toBe(false);
    const failed = apply(done, { quest_update: { id: "q1", status: "failed" } });
    expect(failed.quests[0].status).toBe("failed");
  });

  it("duplicate quest_add id is ignored", () => {
    const s = createInitialState();
    const one = apply(s, { quest_add: { id: "q1", title: "A", description: "d", objectives: [{ text: "o", done: false }] } });
    const two = apply(one, { quest_add: { id: "q1", title: "B", description: "d2", objectives: [{ text: "o2", done: false }] } });
    expect(two.quests).toHaveLength(1);
    expect(two.quests[0].title).toBe("A");
  });

  it("faction_reputation accumulates per faction", () => {
    const s = createInitialState();
    const a = apply(s, { faction_reputation: { faction_id: "guild", delta: 10 } });
    const b = apply(a, { faction_reputation: { faction_id: "guild", delta: -3 } });
    expect(b.player.factionReputation.guild).toBe(7);
  });

  it("null / undefined updates is a no-op returning the same reference", () => {
    const s = createInitialState();
    expect(apply(s, null)).toBe(s);
    expect(apply(s, undefined)).toBe(s);
  });
});

describe("reducer: APPLY_DM_UPDATES — ATOMICITY (the headline fix)", () => {
  it("a payload that throws mid-application commits NOTHING", () => {
    const s = createInitialState({ player: createPlayerState({ gold: 100 }) });
    // gold_delta and quest_add are applied BEFORE loot_drop in the reducer.
    // A non-string loot entry makes `.match` throw — proving earlier mutations
    // (gold, quest) are rolled back rather than partially committed.
    const poisoned = {
      gold_delta: 50,
      quest_add: { id: "q1", title: "T", description: "d", objectives: [{ text: "o" }] },
      loot_drop: [123 as unknown as string],
    } as ValidUpdates;

    const r = apply(s, poisoned);

    expect(r.player.gold).toBe(100); // NOT 150 — rolled back
    expect(r.quests).toHaveLength(0); // quest NOT committed
    expect(r.phase).toBe("play");
    expect(r.log.some((e) => e.text.includes("DM update ล้มเหลว"))).toBe(true);
  });

  it("does not mutate the input state object (purity)", () => {
    const s = createInitialState({ player: createPlayerState({ hp: 10, maxHp: 10, gold: 5, inventory: ["Rope"] }) });
    const snapshot = structuredClone(s);
    apply(s, { hp_delta: -3, gold_delta: 20, items_add: ["Torch"], conditions_add: ["poisoned"] });
    expect(s).toEqual(snapshot); // original untouched
  });

  it("is deterministic — same (state, action) yields equal output incl. log ids", () => {
    const s = createInitialState();
    const a1 = apply(s, { xp_award: 50, gold_delta: 10 });
    const a2 = apply(s, { xp_award: 50, gold_delta: 10 });
    expect(a1).toEqual(a2);
    expect(a1.log.map((e) => e.id)).toEqual(["log-0", "log-1"]);
  });

  it("_seq advances across dispatches so log ids stay unique", () => {
    const s = createInitialState();
    const a = apply(s, { gold_delta: 1 });
    const b = apply(a, { gold_delta: 1 });
    const ids = b.log.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["log-0", "log-1"]);
  });
});

describe("reducer: other actions", () => {
  it("SET_PHASE changes phase; a no-op returns the same reference", () => {
    const s = createInitialState({ phase: "play" });
    expect(reducer(s, { type: "SET_PHASE", phase: "combat" }).phase).toBe("combat");
    expect(reducer(s, { type: "SET_PHASE", phase: "play" })).toBe(s);
  });

  it("ADD_LOG appends a typed entry", () => {
    const s = createInitialState();
    const r = reducer(s, { type: "ADD_LOG", entryType: "player", text: "I open the door" });
    expect(r.log.at(-1)).toMatchObject({ type: "player", text: "I open the door" });
  });

  it("CLEAR_PENDING resets a signal; a no-op returns the same reference", () => {
    const s = createInitialState({ pending: { levelUp: true, shortRest: false, longRest: false } });
    expect(reducer(s, { type: "CLEAR_PENDING", key: "levelUp" }).pending.levelUp).toBe(false);
    expect(reducer(s, { type: "CLEAR_PENDING", key: "shortRest" })).toBe(s);
  });

  it("unknown action returns the same reference", () => {
    const s = createInitialState();
    expect(reducer(s, { type: "NOPE" } as unknown as Action)).toBe(s);
  });
});

describe("store container", () => {
  it("dispatch updates getState and notifies subscribers", () => {
    const store = createStore(createInitialState({ player: createPlayerState({ gold: 0 }) }));
    let notified = 0;
    const unsub = store.subscribe(() => { notified += 1; });
    store.dispatch({ type: "APPLY_DM_UPDATES", updates: { gold_delta: 25 } });
    expect(store.getState().player.gold).toBe(25);
    expect(notified).toBe(1);
    unsub();
    store.dispatch({ type: "APPLY_DM_UPDATES", updates: { gold_delta: 5 } });
    expect(notified).toBe(1); // no longer listening
    expect(store.getState().player.gold).toBe(30);
  });

  it("a no-op dispatch does not notify subscribers", () => {
    const store = createStore(createInitialState());
    let notified = 0;
    store.subscribe(() => { notified += 1; });
    store.dispatch({ type: "APPLY_DM_UPDATES", updates: null });
    expect(notified).toBe(0);
  });
});
