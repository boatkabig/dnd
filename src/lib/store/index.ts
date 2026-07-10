/**
 * Game store — public surface.
 *
 * The DnDSolo shell (and its slices, once extracted in 1c) import from here:
 *
 *   import { createStore, createInitialState } from "@/lib/store";
 *   const store = createStore(createInitialState());
 *   store.dispatch({ type: "APPLY_DM_UPDATES", updates });
 */

export { createStore, createInitialState, createPlayerState } from "./store";
export type { Store } from "./store";
export { reducer } from "./reducer";
export type {
  Action,
  Buff,
  GameState,
  GameTime,
  LogEntry,
  LogEntryType,
  PendingSignals,
  PlayerState,
  Quest,
  ValidUpdates,
} from "./types";
