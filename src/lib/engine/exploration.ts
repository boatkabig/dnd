/**
 * Task #16 — Exploration Turn (solo procedural travel loop).
 *
 * Composes the existing oracle helpers into a single "exploration turn": the
 * player spends some in-game time travelling/exploring out of combat, and the
 * engine rolls a random-encounter check and — on a hit — an oracle random event,
 * then produces a compact Thai log summary. This gives the solo player a
 * procedural exploration loop that advances the clock WITHOUT needing the LLM DM
 * for every step.
 *
 * PURE: every function takes injected rolls (or a seed) — NO Math.random /
 * Date.now inside the decision logic. The UI edge injects the dice; the seeded
 * variant uses the oracle's deterministic mulberry32 PRNG so a given seed always
 * yields the same turn.
 */

import {
  checkRandomEncounter,
  rollRandomEvent,
  makeRng,
  rngInt,
  type EncounterCheck,
  type RandomEvent,
} from "./oracle";

export interface ExplorationTurnInput {
  /** hours of in-game time this turn advances (fed to the time-advance path) */
  hoursAdvanced: number;
  /** faces of a d20 that count as an encounter (e.g. 3 ⇒ 15%) */
  encounterChancePer20: number;
  /** the d20 result for the encounter check */
  encounterRoll: number;
  /** d100 rolls used ONLY when the encounter check triggers (else ignored) */
  focusRoll?: number;
  actionRoll?: number;
  themeRoll?: number;
}

export interface ExplorationTurnResult {
  hoursAdvanced: number;
  encounter: EncounterCheck;
  /** the oracle random event that populates a triggered encounter, else null */
  event: RandomEvent | null;
  /** compact Thai log line summarizing the turn */
  summary: string;
}

/**
 * Resolve one exploration/travel turn from injected rolls.
 * @returns the encounter check, an optional oracle event, and a Thai summary.
 */
export function resolveExplorationTurn(input: ExplorationTurnInput): ExplorationTurnResult {
  const hours = Math.max(0, Math.round(input.hoursAdvanced) || 0);
  const encounter = checkRandomEncounter(input.encounterChancePer20, input.encounterRoll);
  const event = encounter.triggered
    ? rollRandomEvent(input.focusRoll ?? 1, input.actionRoll ?? 1, input.themeRoll ?? 1)
    : null;
  return {
    hoursAdvanced: hours,
    encounter,
    event,
    summary: summarizeExplorationTurn(hours, encounter, event),
  };
}

/**
 * Seed-driven variant — deterministic given the same seed. Draws the d20
 * encounter roll and (on a hit) three d100 event rolls off one PRNG stream.
 */
export function resolveExplorationTurnSeeded(
  hoursAdvanced: number,
  encounterChancePer20: number,
  seed: number,
): ExplorationTurnResult {
  const rng = makeRng(seed);
  const encounterRoll = rngInt(rng, 20);
  // Always draw the three d100s so the stream position is stable, even when the
  // check misses (they're only consumed by resolveExplorationTurn on a hit).
  const focusRoll = rngInt(rng, 100);
  const actionRoll = rngInt(rng, 100);
  const themeRoll = rngInt(rng, 100);
  return resolveExplorationTurn({
    hoursAdvanced,
    encounterChancePer20,
    encounterRoll,
    focusRoll,
    actionRoll,
    themeRoll,
  });
}

/** Compact Thai log line for one exploration turn. */
export function summarizeExplorationTurn(
  hours: number,
  encounter: EncounterCheck,
  event: RandomEvent | null,
): string {
  const head = `🧭 สำรวจ/เดินทาง ${hours} ชม. — ทอยเจอเหตุการณ์ d20=${encounter.roll} (≤${encounter.chance} = เจอ)`;
  if (!encounter.triggered) {
    return `${head} → เส้นทางสงบ ไม่มีอะไรเกิดขึ้น`;
  }
  if (event) {
    return `${head} → ⚡ พบเหตุการณ์: ${event.focusLabel} — ${event.meaning.prompt}`;
  }
  return `${head} → ⚡ พบเหตุการณ์บนเส้นทาง`;
}
