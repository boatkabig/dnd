/**
 * Game store — types (Domain: UI game state)
 *
 * This is the UI-facing game state: the tiny, hand-rolled store that the
 * DnDSolo shell reads from and mutates ONLY via `dispatch(action)`. It is
 * deliberately NOT the rules engine — `src/lib/engine/*` remains the single
 * source of truth for anything rules-heavy (class math, dice, LOS, ...).
 * The store holds the player-facing snapshot and log; rules-heavy follow-ups
 * (e.g. resolving a level-up's HP/slots) are surfaced as `pending` signals for
 * the engine to consume at wiring time.
 *
 * Design constraints (locked in PROGRESS.md):
 *  - `dispatch(action)` is the ONLY mutation path.
 *  - The reducer is PURE: no Date.now(), no Math.random(), no React, no I/O.
 *    Log-entry ids come from a monotonic `_seq` counter kept in state, so the
 *    same (state, action) always yields byte-identical output.
 *  - `APPLY_DM_UPDATES` is ATOMIC — all fields of one DM response commit
 *    together or none do (fixes the partial-commit-on-error bug where the old
 *    applyUpdates fired setQuests/setGameTime/setPhase mid-flight and could
 *    leave quests committed but the character discarded on a later throw).
 */

import type { ValidUpdates } from "../dmSchema";
import type { Quest } from "../gameData";

export type LogEntryType = "system" | "dm" | "player" | "roll";

export interface LogEntry {
  id: string;
  type: LogEntryType;
  text: string;
}

export interface Buff {
  name: string;
  type: "buff" | "debuff";
  /** -1 = until long rest, 0 = instant, >0 = rounds remaining */
  duration: number;
  source: string;
  effect_desc: string;
}

export interface GameTime {
  day: number;
  hour: number;
}

/**
 * The player-facing subset of the character that DM `updates` can mutate.
 * (Class/ability/spell internals stay in the engine + the DnDSolo character
 * until 1c wires them together; the store owns only what the DM touches.)
 */
export interface PlayerState {
  hp: number;
  maxHp: number;
  tempHp: number;
  /** Death saving throws while at 0 HP. Reset to {0,0} on downing/heal-from-0. */
  deathSaves: { s: number; f: number };
  gold: number;
  xp: number;
  level: number;
  inventory: string[];
  conditions: string[];
  buffs: Buff[];
  feats: string[];
  /** 0..6 (death at 6) */
  exhaustionLevel: number;
  /** number of unspent Ability Score Improvement / Feat choices */
  pendingAsi: number;
  npcAttitudes: Record<string, string>;
  factionReputation: Record<string, number>;
  weather: string | null;
  environmentEffect: string | null;
  sceneType: string | null;
  dead: boolean;
  lastLongRestHoursAgo: number;
  lastShortRestHoursAgo: number;
}

/** Rules-heavy follow-ups the store detects but does not itself resolve. */
export interface PendingSignals {
  /** xp crossed a level threshold — engine resolves HP/slots/features. */
  levelUp: boolean;
  /** DM requested a short rest — UI prompts, engine applies. */
  shortRest: boolean;
  /** DM requested a long rest. */
  longRest: boolean;
}

export interface GameState {
  player: PlayerState;
  quests: Quest[];
  time: GameTime;
  phase: string;
  log: LogEntry[];
  pending: PendingSignals;
  /** monotonic counter for deterministic log ids — never read by UI. */
  _seq: number;
}

/* ======================================================================
 * ACTIONS
 * ====================================================================== */

export type Action =
  | { type: "APPLY_DM_UPDATES"; updates: ValidUpdates | null | undefined }
  | { type: "SET_PHASE"; phase: string }
  | { type: "ADD_LOG"; entryType?: LogEntryType; text: string }
  | { type: "CLEAR_PENDING"; key: keyof PendingSignals };

export type { ValidUpdates, Quest };
