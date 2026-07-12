/**
 * Game store — the tiny hand-rolled container (no dependency).
 *
 * `dispatch(action)` is the only way to mutate; `getState()` returns the
 * current immutable snapshot (used by async DM flows that need to read the
 * latest state without re-rendering); `subscribe(fn)` notifies listeners
 * after every state change and returns an unsubscribe.
 *
 * The reducer is pure, so this container stays trivial — it is intentionally
 * NOT Redux/Zustand: no middleware, no selectors, no context. React binds to
 * it with a single useSyncExternalStore at wiring time (1c).
 */

import { reducer } from "./reducer";
import type { Action, GameState, PlayerState } from "./types";

export interface Store {
  getState(): GameState;
  dispatch(action: Action): GameState;
  subscribe(listener: (state: GameState) => void): () => void;
}

export function createStore(initialState: GameState): Store {
  let state = initialState;
  const listeners = new Set<(state: GameState) => void>();

  return {
    getState: () => state,
    dispatch(action: Action) {
      const next = reducer(state, action);
      if (next !== state) {
        state = next;
        for (const listener of listeners) listener(state);
      }
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/* ======================================================================
 * INITIAL STATE
 * ====================================================================== */

export function createPlayerState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    hp: 10,
    maxHp: 10,
    tempHp: 0,
    deathSaves: { s: 0, f: 0 },
    gold: 0,
    xp: 0,
    level: 1,
    inventory: [],
    conditions: [],
    buffs: [],
    feats: [],
    exhaustionLevel: 0,
    pendingAsi: 0,
    npcAttitudes: {},
    factionReputation: {},
    weather: null,
    environmentEffect: null,
    sceneType: null,
    dead: false,
    lastLongRestHoursAgo: 0,
    lastShortRestHoursAgo: 0,
    ...overrides,
  };
}

export function createInitialState(overrides: Partial<GameState> = {}): GameState {
  return {
    player: createPlayerState(),
    quests: [],
    time: { day: 1, hour: 8 },
    phase: "play",
    log: [],
    pending: { levelUp: false, shortRest: false, longRest: false },
    _seq: 0,
    ...overrides,
  };
}
