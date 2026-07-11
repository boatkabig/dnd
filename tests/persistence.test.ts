import { describe, it, expect, beforeEach } from "vitest";
import {
  migrateLegacySave,
  saveGame,
  loadGame,
  deleteSave,
  SAVE_VERSION,
  type LegacySave,
} from "../src/lib/engineAdapters";

/**
 * Persistence robustness: lock in the v1→v4 save migrations (migrateLegacySave)
 * and a save→load round-trip through the versioned localStorage layer.
 *
 * Runs under vitest's node environment (no DOM), so we install a minimal
 * in-memory localStorage shim.
 */

function installLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  return store;
}

describe("migrateLegacySave: v1 → v4", () => {
  it("migrates a bare v1 save (no version) to the current version", () => {
    const v1: any = {
      c: { name: "Aria", hp: 10, gold: 15 },
      scene: "tavern",
      log: [],
      combat: null,
    };
    const out = migrateLegacySave(v1);

    expect(out.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(4);
    // v1→v2: map + history added
    expect(out.map).toEqual({ nodes: {}, edges: [], current: null });
    expect(out.history).toEqual([]);
    // v2→v3: gameTime, quests, and character sub-fields added
    expect(out.gameTime).toEqual({ day: 1, hour: 8 });
    expect(out.quests).toEqual([]);
    expect(out.c.buffs).toEqual([]);
    expect(out.c.feats).toEqual([]);
    expect(out.c.deathSaves).toEqual({ s: 0, f: 0 });
    expect(out.c.conditions).toEqual([]);
    // v3→v4: campaign memory continuity store
    expect(out.campaignMemory).toEqual({ facts: [], sessionNumber: 1, version: 1 });
    // original data preserved
    expect(out.c.name).toBe("Aria");
    expect(out.c.gold).toBe(15);
  });

  it("only fills v3→v4 gaps for a v3 save, preserving existing fields", () => {
    const v3: any = {
      version: 3,
      c: { name: "Bran", buffs: [{ name: "Bless" }], feats: ["alert"], deathSaves: { s: 1, f: 0 }, conditions: ["prone"] },
      scene: "road",
      log: [{ t: "x" }],
      combat: null,
      map: { nodes: { a: 1 }, edges: [], current: "a" },
      history: [{ role: "user", content: "hi" }],
      gameTime: { day: 3, hour: 20 },
      quests: [{ id: "q1" }],
    };
    const out = migrateLegacySave(v3);

    expect(out.version).toBe(SAVE_VERSION);
    // existing fields untouched
    expect(out.gameTime).toEqual({ day: 3, hour: 20 });
    expect(out.c.buffs).toEqual([{ name: "Bless" }]);
    expect(out.c.deathSaves).toEqual({ s: 1, f: 0 });
    expect(out.quests).toEqual([{ id: "q1" }]);
    expect(out.map.current).toBe("a");
    // only the v4 addition is injected
    expect(out.campaignMemory).toEqual({ facts: [], sessionNumber: 1, version: 1 });
  });

  it("is idempotent on an already-current save", () => {
    const current: any = {
      version: 4,
      c: { name: "Cael", buffs: [{ name: "Haste" }] },
      scene: "keep",
      log: [],
      combat: null,
      map: { nodes: {}, edges: [], current: null },
      history: [],
      gameTime: { day: 1, hour: 8 },
      quests: [],
      campaignMemory: { facts: [{ id: "f1", text: "met the king" }], sessionNumber: 2, version: 1 },
    };
    const out = migrateLegacySave(current);
    expect(out.version).toBe(4);
    // pre-existing campaign memory is not clobbered
    expect(out.campaignMemory.sessionNumber).toBe(2);
    expect(out.campaignMemory.facts).toEqual([{ id: "f1", text: "met the king" }]);
  });

  it("passes through null/undefined without throwing", () => {
    expect(migrateLegacySave(null as any)).toBeNull();
    expect(migrateLegacySave(undefined as any)).toBeUndefined();
  });
});

describe("saveGame / loadGame round-trip", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it("round-trips a save through the versioned store and migrate path", () => {
    const payload: LegacySave = {
      c: { name: "Dara", hp: 12, gold: 40, buffs: [], feats: [], conditions: [] } as any,
      scene: "market",
      log: [{ text: "arrived" }] as any,
      combat: null,
      history: [] as any,
      map: { nodes: {}, edges: [], current: null } as any,
      gameTime: { day: 2, hour: 10 },
      quests: [],
      campaignMemory: { facts: [], sessionNumber: 1, version: 1 },
    };
    saveGame(payload);
    const loaded = loadGame();

    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(SAVE_VERSION);
    expect(loaded!.c.name).toBe("Dara");
    expect(loaded!.c.gold).toBe(40);
    expect(loaded!.scene).toBe("market");
    expect(loaded!.gameTime).toEqual({ day: 2, hour: 10 });
  });

  it("stamps the current version on save regardless of the passed-in version", () => {
    saveGame({ version: 1, c: { name: "Eda" }, scene: "", log: [], combat: null, history: [], map: null } as any);
    const loaded = loadGame();
    expect(loaded!.version).toBe(SAVE_VERSION);
  });

  it("migrates a same-key save written by an older app build (v3 → v4 back-fill)", () => {
    // The canonical key ("dnd-solo-save") is stable across app upgrades, so an
    // older build (SAVE_VERSION=3) leaves a version-3 payload under it. On load
    // the migrate path must back-fill the v4 additions.
    const store = installLocalStorage();
    store.set(
      "dnd-solo-save",
      JSON.stringify({
        version: 3,
        c: { name: "Eda", buffs: [] },
        scene: "gate",
        log: [],
        combat: null,
        map: { nodes: {}, edges: [], current: null },
        history: [],
        gameTime: { day: 5, hour: 12 },
        quests: [],
        // NOTE: no campaignMemory — that's the v4 addition.
      }),
    );
    const loaded = loadGame();
    expect(loaded!.version).toBe(SAVE_VERSION);
    expect(loaded!.gameTime).toEqual({ day: 5, hour: 12 });
    expect(loaded!.campaignMemory).toEqual({ facts: [], sessionNumber: 1, version: 1 });
  });

  it("adopts and migrates a legacy-keyed save", () => {
    const store = installLocalStorage();
    // A pre-A2 save written under the old key, at an old version.
    store.set(
      "dnd-solo-save-v2",
      JSON.stringify({ version: 2, c: { name: "Fen" }, scene: "cave", log: [], combat: null, map: null, history: [] }),
    );
    const loaded = loadGame();
    expect(loaded!.c.name).toBe("Fen");
    expect(loaded!.version).toBe(SAVE_VERSION);
    // Legacy key is consumed and moved to the canonical key.
    expect(store.get("dnd-solo-save")).toBeTruthy();
    expect(store.get("dnd-solo-save-v2")).toBeUndefined();
  });

  it("returns null when there is no save", () => {
    installLocalStorage();
    expect(loadGame()).toBeNull();
  });

  it("deleteSave clears the canonical and legacy keys", () => {
    const store = installLocalStorage();
    saveGame({ c: { name: "Gwen" }, scene: "", log: [], combat: null, history: [], map: null } as any);
    store.set("dnd-solo-save-v1", "{}");
    deleteSave();
    expect(store.get("dnd-solo-save")).toBeUndefined();
    expect(store.get("dnd-solo-save-v1")).toBeUndefined();
  });
});
