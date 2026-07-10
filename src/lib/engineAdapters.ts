/**
 * engineAdapters.ts
 *
 * Bridge between the new 30-domain engine modules and the legacy DnDSolo.tsx UI.
 *
 * Strategy: Provide thin adapters that DnDSolo can call instead of inline logic.
 * Each adapter delegates to the appropriate domain module while preserving the
 * shape of data the UI already expects. This lets us migrate incrementally
 * without rewriting the 3300-line component in one shot.
 */

import { WorldClock } from "./time";
import { EventBus, type GameEvent, type EventListener } from "./events";
import type { Quest } from "./gameData";
import { fetchMonster as srdFetchMonster, type NormalizedMonster } from "./srd";
import { getCreature as open5eGetCreature, creatureToLegacyCombatant, type NormalizedCreature } from "./open5e";

/* ============================================================
 * 1. TIME ADAPTER — replace inline gameTime { day, hour } with WorldClock
 * ============================================================ */

let _worldClock: WorldClock | null = null;

export function getWorldClock(): WorldClock {
  if (!_worldClock) {
    _worldClock = new WorldClock(8 * 3600); // start at 08:00 day 1
  }
  return _worldClock;
}

/** Initialize WorldClock from a legacy save { day, hour } */
export function initWorldClockFromLegacy(legacy: { day: number; hour: number }): WorldClock {
  const seconds = (legacy.day - 1) * 86400 + legacy.hour * 3600;
  _worldClock = new WorldClock(seconds);
  return _worldClock;
}

/** Convert WorldClock back to legacy { day, hour } for UI compatibility */
export function worldClockToLegacy(clock: WorldClock): { day: number; hour: number } {
  const total = clock.getTime().totalSeconds;
  const day = Math.floor(total / 86400) + 1;
  const hour = Math.floor((total % 86400) / 3600);
  return { day, hour };
}

/** Advance time by N hours (used by long rest = 8h, short rest = 1h, travel = N h) */
export function advanceHours(hours: number): { day: number; hour: number } {
  const clock = getWorldClock();
  clock.advanceBy(hours, "hour");
  return worldClockToLegacy(clock);
}

export function advanceMinutes(minutes: number): { day: number; hour: number } {
  const clock = getWorldClock();
  clock.advance(minutes * 60);
  return worldClockToLegacy(clock);
}

/** Schedule a time-based event (e.g. spell duration, quest deadline) */
export function scheduleEvent(spec: Parameters<WorldClock["scheduleEvent"]>[0]) {
  return getWorldClock().scheduleEvent(spec);
}

/** Check for fired events (call each tick / turn end) */
export function checkScheduledEvents() {
  return getWorldClock().checkEvents();
}

/* ============================================================
 * 2. EVENT BUS ADAPTER — let combat/spell/movement emit events
 * ============================================================ */

let _eventBus: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!_eventBus) {
    _eventBus = new EventBus();
    registerDefaultListeners(_eventBus);
  }
  return _eventBus;
}

export function emitGameEvent(event: GameEvent) {
  return getEventBus().emit(event, {});
}

/* ---- Event factory helpers (mirrors events.ts but inlined for convenience) ---- */

let _eventSeq = 0;

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function emitAttack(sourceId: string, targetId: string, weapon?: string): void {
  emitGameEvent({
    type: "on_attack",
    payload: { weapon, sourceId, targetId },
    timestamp: nowSec(),
    sourceId,
    targetIds: [targetId],
  });
}

export function emitHit(sourceId: string, targetId: string, weapon?: string, damage = 0): void {
  emitGameEvent({
    type: "on_hit",
    payload: { weapon, sourceId, targetId, damage },
    timestamp: nowSec(),
    sourceId,
    targetIds: [targetId],
  });
}

export function emitDamageDealt(sourceId: string, targetId: string, amount: number, damageType = "slashing"): void {
  emitGameEvent({
    type: "on_damage_dealt",
    payload: { amount, damageType, targetId },
    timestamp: nowSec(),
    sourceId,
    targetIds: [targetId],
  });
}

export function emitDamageTaken(targetId: string, amount: number, damageType = "slashing", sourceId?: string): void {
  emitGameEvent({
    type: "on_damage_taken",
    payload: { amount, damageType, targetId, sourceId },
    timestamp: nowSec(),
    sourceId,
    targetIds: [targetId],
  });
}

export function emitHeal(sourceId: string, targetId: string, amount: number): void {
  emitGameEvent({
    type: "on_heal",
    payload: { amount, targetId, sourceId },
    timestamp: nowSec(),
    sourceId,
    targetIds: [targetId],
  });
}

export function emitKill(killerId: string, victimId: string): void {
  emitGameEvent({
    type: "on_kill",
    payload: { killerId, victimId },
    timestamp: nowSec(),
    sourceId: killerId,
    targetIds: [victimId],
  });
}

export function emitDeath(characterId: string, killerId?: string): void {
  emitGameEvent({
    type: "on_death",
    payload: { characterId, killerId },
    timestamp: nowSec(),
    sourceId: killerId,
    targetIds: [characterId],
  });
}

export function emitTurnStart(characterId: string, round: number): void {
  emitGameEvent({
    type: "on_turn_start",
    payload: { characterId, round },
    timestamp: nowSec(),
    sourceId: characterId,
    targetIds: [characterId],
  });
}

export function emitTurnEnd(characterId: string, round: number): void {
  emitGameEvent({
    type: "on_turn_end",
    payload: { characterId, round },
    timestamp: nowSec(),
    sourceId: characterId,
    targetIds: [characterId],
  });
}

export function emitCastSpell(casterId: string, spellId: string, level: number, targetIds: string[] = []): void {
  emitGameEvent({
    type: "on_cast_spell",
    payload: { casterId, spellId, level },
    timestamp: nowSec(),
    sourceId: casterId,
    targetIds,
  });
}

export function emitConditionApplied(targetId: string, conditionId: string, sourceId?: string): void {
  emitGameEvent({
    type: "on_condition_applied",
    payload: { targetId, conditionId, sourceId },
    timestamp: nowSec(),
    sourceId,
    targetIds: [targetId],
  });
}

/* ---- Feature listener registry (data-driven) ----
 * These listeners mirror the FEATURE definitions in gameData.ts.
 * When the engine emits an event, the matching feature's listener fires
 * and produces a state change (e.g. apply poison, trigger rage bonus).
 *
 * Listeners return an array of "pending changes" that the caller applies
 * — they do NOT mutate state directly, so the combat loop stays in control.
 */

export interface PendingStateChange {
  type: "apply_condition" | "deal_damage" | "heal" | "grant_bonus" | "emit_event" | "narrate" | "reroll_damage";
  targetId: string;
  payload: {
    conditionId?: string;
    conditionDuration?: number;
    damageFormula?: string;
    damageType?: string;
    healFormula?: string;
    bonusType?: "attack" | "damage" | "save" | "check" | "ac";
    bonusValue?: number;
    bonusDuration?: number;
    emitEventType?: string;
    emitPayload?: any;
    narration?: string;
  };
  sourceFeature: string; // e.g. "poison_weapon", "sneak_attack"
}

interface FeatureTriggerDef {
  featureKey: string;
  eventType: GameEvent["type"];
  condition?: (event: GameEvent, context: { ownerId: string }) => boolean;
  produce: (event: GameEvent, context: { ownerId: string }) => PendingStateChange | PendingStateChange[] | null;
}

/**
 * Default feature trigger definitions — drives the event-driven behavior of
 * class features, magic items, and spell effects.
 *
 * This is the DATA-DRIVEN replacement for hardcoded `if hasFeature(X)` checks
 * scattered through the combat loop. New features can be added here without
 * touching combat.ts.
 */
const FEATURE_TRIGGERS: FeatureTriggerDef[] = [
  // Poisoned weapon: on_hit, apply poisoned condition to target
  {
    featureKey: "poison_weapon",
    eventType: "on_hit",
    condition: (e, ctx) => e.sourceId === ctx.ownerId,
    produce: (e) => ({
      type: "apply_condition",
      targetId: String(e.payload.targetId),
      payload: { conditionId: "poisoned", conditionDuration: 6 }, // 1 minute
      sourceFeature: "poison_weapon",
    }),
  },
  // Riposte (Battle Master maneuver): on_miss by enemy, reaction attack
  // (simplified — triggers on attacker's miss)
  {
    featureKey: "riposte",
    eventType: "on_miss",
    condition: (e, ctx) => !!(e.targetIds && e.targetIds.includes(ctx.ownerId)),
    produce: (e, ctx) => ({
      type: "emit_event",
      targetId: ctx.ownerId,
      payload: {
        emitEventType: "on_attack",
        emitPayload: { sourceId: ctx.ownerId, targetId: e.sourceId, reaction: true },
      },
      sourceFeature: "riposte",
    }),
  },
  // Half-Orc Relentless Endurance: on_damage_taken that drops to 0, drop to 1 instead
  {
    featureKey: "relentless_endurance",
    eventType: "on_damage_taken",
    condition: (e, ctx) => !!(e.targetIds && e.targetIds.includes(ctx.ownerId)),
    produce: (e, ctx) => ({
      type: "heal",
      targetId: ctx.ownerId,
      payload: { healFormula: "1", narration: "Relentless Endurance: HP แทนที่จะตาย กลับเหลือ 1" },
      sourceFeature: "relentless_endurance",
    }),
  },
  // Polearm Master: on_enter_area, opportunity attack
  {
    featureKey: "polearm_master",
    eventType: "on_enter_area",
    condition: (e, ctx) => e.targetIds?.[0] !== ctx.ownerId,
    produce: (e, ctx) => ({
      type: "emit_event",
      targetId: ctx.ownerId,
      payload: {
        emitEventType: "on_attack",
        emitPayload: { sourceId: ctx.ownerId, targetId: e.targetIds?.[0], reaction: true, polearm: true },
      },
      sourceFeature: "polearm_master",
    }),
  },
  // Savage Attacker (D&D 2024 Origin Feat): on_hit, reroll weapon damage dice once per turn, keep higher total
  // Implementation: produce a "reroll_damage" effect that the combat loop handles
  {
    featureKey: "savage_attacker",
    eventType: "on_hit",
    condition: (e, ctx) => e.sourceId === ctx.ownerId,
    produce: (e) => ({
      type: "reroll_damage",
      targetId: String(e.payload.targetId),
      payload: { narration: "Savage Attacker: reroll weapon damage, keep higher", oncePerTurn: true },
      sourceFeature: "savage_attacker",
    }),
  },
];

/**
 * Register all default feature listeners on a fresh EventBus.
 * Called once when the EventBus is created.
 */
function registerDefaultListeners(bus: EventBus): void {
  for (const trig of FEATURE_TRIGGERS) {
    // The ownerId is passed as a runtime variable — we wrap the listener
    // so it can be parameterized per-character.
    // For now, we register a "wildcard" listener that the combat loop
    // filters by checking e.sourceId/e.targetIds against the active character.
    const listener: EventListener = {
      id: `feature_${trig.featureKey}_${++_eventSeq}`,
      ownerId: "*", // wildcard — fires for any owner
      source: "feature",
      trigger: { eventType: trig.eventType },
      action: { type: "custom", customHandler: `feature:${trig.featureKey}` },
      priority: 5,
      active: true,
    };
    // Register a custom handler that the caller can introspect
    bus.registerCustomHandler(`feature:${trig.featureKey}`, (event, _action, ctx) => {
      // The combat loop is responsible for triggering data-driven feature effects
      // by querying FEATURE_TRIGGERS directly. This handler is a no-op marker
      // so the EventBus knows the listener exists.
      void event; void ctx;
    });
    bus.addListener(listener);
  }
}

/**
 * Query feature triggers for a given event type and source/target IDs.
 * Returns the list of pending state changes the combat loop should apply.
 *
 * Usage in combat:
 *   const changes = queryFeatureTriggers("on_hit", sourceId, targetId, eventPayload);
 *   for (const change of changes) applyChange(change);
 */
export function queryFeatureTriggers(
  eventType: GameEvent["type"],
  sourceId: string | undefined,
  targetId: string | undefined,
  payload: any,
  characterHasFeature: (ownerId: string, featureKey: string) => boolean,
): PendingStateChange[] {
  const out: PendingStateChange[] = [];
  for (const trig of FEATURE_TRIGGERS) {
    if (trig.eventType !== eventType) continue;
    // Determine ownerId: for on_hit/on_attack, owner = source; for on_damage_taken, owner = target
    const ownerId = (eventType === "on_damage_taken" || eventType === "on_miss") ? targetId : sourceId;
    if (!ownerId) continue;
    if (!characterHasFeature(ownerId, trig.featureKey)) continue;
    if (trig.condition && !trig.condition(
      { type: eventType, payload, timestamp: nowSec(), sourceId, targetIds: targetId ? [targetId] : [] },
      { ownerId },
    )) continue;
    const produced = trig.produce(
      { type: eventType, payload, timestamp: nowSec(), sourceId, targetIds: targetId ? [targetId] : [] },
      { ownerId },
    );
    if (Array.isArray(produced)) out.push(...produced);
    else if (produced) out.push(produced);
  }
  return out;
}

/**
 * Check if a character should trigger a feature on a given event.
 * Convenience wrapper that callers can use without constructing full context.
 */
export function getTriggeredFeatures(
  eventType: GameEvent["type"],
  characterId: string,
  characterHasFeature: (id: string, key: string) => boolean,
): string[] {
  return FEATURE_TRIGGERS
    .filter((t) => t.eventType === eventType && characterHasFeature(characterId, t.featureKey))
    .map((t) => t.featureKey);
}

/** Get the full FEATURE_TRIGGERS table (for inspection / DM hint generation) */
export function listFeatureTriggers(): ReadonlyArray<FeatureTriggerDef> {
  return FEATURE_TRIGGERS;
}

/* ============================================================
 * 3. RULE ENGINE — REMOVED (Phase 1 decision)
 * ============================================================
 *
 * ruleEngine.ts, getRuleRegistry(), resolveAttackRoll(), validateAction()
 * were deprecated in Phase 1.5 and are now REMOVED from the adapter layer.
 *
 * Decision: Inline combat logic in DnDSolo.tsx is the canonical path.
 * Schema validation (dmSchema.ts) handles LLM integrity.
 * ruleEngine.ts file still exists in src/lib/ for reference but is NOT
 * imported by any live code. Will be archived in Phase 5.
 *
 * To re-introduce: wire ruleEngine.ts back into DnDSolo.tsx's combat
 * functions (playerCombatAction, enemyAttacks, castSRDSpell).
 */

/* ============================================================
 * 4. GAME STATE ADAPTER — wrap legacy save/load with versioning
 * ============================================================ */

export const SAVE_VERSION = 3; // bumped from v2 to support new state fields

export interface LegacySave {
  c: any; // character
  scene: string;
  log: any[];
  combat: any;
  history: any[];
  map: any;
  gameTime?: { day: number; hour: number };
  quests?: Quest[];
  version?: number;
}

/** Migrate legacy save (v2) to current (v3) — adds gameTime, quests, buffs array */
export function migrateLegacySave(raw: any): LegacySave {
  if (!raw) return raw;
  const v = raw.version || 1;
  let out = { ...raw };
  if (v < 2) {
    // v1 → v2: add map, history if missing
    out.map = out.map || { nodes: {}, edges: [], current: null };
    out.history = out.history || [];
  }
  if (v < 3) {
    // v2 → v3: add gameTime, quests, buffs
    out.gameTime = out.gameTime || { day: 1, hour: 8 };
    out.quests = out.quests || [];
    if (out.c && !out.c.buffs) out.c.buffs = [];
    if (out.c && !out.c.feats) out.c.feats = [];
    if (out.c && !out.c.deathSaves) out.c.deathSaves = { s: 0, f: 0 };
    if (out.c && !out.c.conditions) out.c.conditions = [];
  }
  out.version = SAVE_VERSION;
  return out;
}

/* ============================================================
 * 5. AOE ADAPTER — convert spell area_of_effect into target selection
 * ============================================================ */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import * as aoe from "./aoe";

export interface SimpleEnemy {
  uid: string;
  th: string;
  hpNow: number;
  ac: number;
  conditions?: string[];
  [key: string]: any;
}

/** Select enemies within an AoE area, given player position + enemy positions on grid */
export function selectEnemiesInAoE(
  enemies: SimpleEnemy[],
  enemyPositions: Record<string, { x: number; y: number }>,
  playerPos: { x: number; y: number },
  aoeType: string | undefined,
  aoeSize: number | undefined,
): SimpleEnemy[] {
  if (!aoeType || !aoeSize) return enemies.filter((e) => e.hpNow > 0).slice(0, 1);
  // 1 grid square = 5 ft; AoE size in feet → squares
  const radiusSquares = Math.ceil(aoeSize / 5);
  return enemies.filter((e) => {
    if (e.hpNow <= 0) return false;
    const pos = enemyPositions[e.uid];
    if (!pos) return false;
    const dx = Math.abs(pos.x - playerPos.x);
    const dy = Math.abs(pos.y - playerPos.y);
    // Chebyshev distance for grid (8-way movement)
    return Math.max(dx, dy) <= radiusSquares;
  });
}

/* ============================================================
 * 6. CONDITION HELPERS — read enemy conditions for combat modifiers
 * ============================================================ */

export const INCAPACITATING_CONDITIONS = [
  "incapacitated", "paralyzed", "petrified", "stunned", "unconscious",
];

export const ATTACK_DISADVANTAGE_CONDITIONS = [
  "prone", "restrained", "blinded", "frightened", "poisoned",
];

export const ATTACKER_ADVANTAGE_VS_CONDITIONS = [
  "restrained", "blinded", "paralyzed", "petrified", "prone", "stunned", "unconscious", "grappled",
];

/** Returns true if enemy's conditions cause disadvantage on their attacks */
export function enemyHasAttackDisadvantage(enemy: SimpleEnemy): boolean {
  return (enemy.conditions || []).some((c) => ATTACK_DISADVANTAGE_CONDITIONS.includes(c));
}

/** Returns true if attacker has advantage vs this enemy */
export function attackerHasAdvantageVs(enemy: SimpleEnemy): boolean {
  return (enemy.conditions || []).some((c) => ATTACKER_ADVANTAGE_VS_CONDITIONS.includes(c));
}

/** Returns true if enemy is incapacitated and can't act */
export function enemyIsIncapacitated(enemy: SimpleEnemy): boolean {
  return (enemy.conditions || []).some((c) => INCAPACITATING_CONDITIONS.includes(c));
}

/* ============================================================
 * 7. CONCENTRATION TRACKING
 * ============================================================ */

export const CONCENTRATION_SPELLS = new Set([
  "Bless", "Haste", "Shield Of Faith", "Hold Person", "Faerie Fire",
  "Slow", "Bane", "Hunter's Mark", "Hex", "Spirit Guardians",
  "Banishment", "Call Lightning", "Cloudkill", "Crown Of Madness",
  "Darkness", "Detect Thoughts", "Enthrall", "Flaming Sphere",
  "Fog Cloud", "Heat Metal", "Invisibility", "Levitate", "Mage Hand",
  "Major Image", "Moonbeam", "Phantasmal Force", "Searing Smite",
  "Silence", "Sleep", "Suggestion", "Sunbeam", "Wall Of Fire",
  "Web", "Witch Bolt",
]);

export function hasConcentrationBuff(character: any): boolean {
  return (character.buffs || []).some((b: any) => CONCENTRATION_SPELLS.has(b.name));
}

export function getActiveConcentrationBuff(character: any): any | null {
  return (character.buffs || []).find((b: any) => CONCENTRATION_SPELLS.has(b.name)) || null;
}

/** DC for concentration check: max(10, damage/2), capped at 30 per D&D 2024. */
export function concentrationDC(damage: number): number {
  return Math.min(30, Math.max(10, Math.floor(damage / 2)));
}

/* ============================================================
 * 8. BUFF MODIFIER HELPERS — read active buffs for combat modifiers
 * ============================================================ */

export interface AttackModifiers {
  bonusToHit: number;
  bonusToDamage: number;
  advantage: boolean;
  disadvantage: boolean;
  notes: string[];
}

/** Compute attack roll modifiers from active buffs */
export function getAttackModifiers(character: any, target: any = null): AttackModifiers {
  const buffs = character.buffs || [];
  let bonusToHit = 0;
  let bonusToDamage = 0;
  let advantage = false;
  let disadvantage = false;
  const notes: string[] = [];

  // Bless: +1d4 to attack rolls
  if (buffs.some((b: any) => b.name === "Bless")) {
    const die = Math.floor(Math.random() * 4) + 1;
    bonusToHit += die;
    notes.push(`Bless +${die}`);
  }
  // Bane: -1d4 to attack rolls
  if (buffs.some((b: any) => b.name === "Bane")) {
    const die = Math.floor(Math.random() * 4) + 1;
    bonusToHit -= die;
    notes.push(`Bane -${die}`);
  }
  // Hunter's Mark: +1d6 damage
  if (buffs.some((b: any) => b.name === "Hunter's Mark")) {
    const die = Math.floor(Math.random() * 6) + 1;
    bonusToDamage += die;
    notes.push(`Hunter's Mark +${die}`);
  }
  // Hex: +1d6 damage
  if (buffs.some((b: any) => b.name === "Hex")) {
    const die = Math.floor(Math.random() * 6) + 1;
    bonusToDamage += die;
    notes.push(`Hex +${die}`);
  }
  // Faerie Fire: target glowing = advantage
  if (target?.glow) {
    advantage = true;
    notes.push("Faerie Fire (advantage)");
  }
  // Slow debuff on character: -2 AC and -2 to saves (already in buff system)

  return { bonusToHit, bonusToDamage, advantage, disadvantage, notes };
}

/** Compute AC modifier from active buffs */
export function getACModifier(character: any): number {
  const buffs = character.buffs || [];
  let total = 0;
  for (const b of buffs) {
    if (b.name === "Shield") total += 5;
    if (b.name === "Shield Of Faith") total += 2;
    if (b.name === "Haste") total += 2;
    if (b.name === "Slow") total -= 2; // Slow reduces AC by 2
  }
  return total;
}

/* ============================================================
 * 9. SAVE/LOAD with VERSIONING (delegates to gameState.ts)
 * ============================================================ */

// A2 fix: use a single stable key + store version INSIDE the payload.
// Old saves (v1/v2 keys) are detected by trying legacy keys.
const SAVE_KEY = "dnd-solo-save";
const LEGACY_SAVE_KEYS = [
  "dnd-solo-save-v3",  // pre-A2 key
  "dnd-solo-save-v2",
  "dnd-solo-save-v1",
];

export function saveGame(payload: LegacySave) {
  try {
    const versioned = { ...payload, version: SAVE_VERSION };
    localStorage.setItem(SAVE_KEY, JSON.stringify(versioned));
  } catch (e) {
    /* ignore */
  }
}

export function loadGame(): LegacySave | null {
  try {
    // A2: try current key first, then legacy keys
    let raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      for (const legacyKey of LEGACY_SAVE_KEYS) {
        raw = localStorage.getItem(legacyKey);
        if (raw) {
          // Migrate: move old save to new key, delete old key
          try {
            localStorage.setItem(SAVE_KEY, raw);
            localStorage.removeItem(legacyKey);
          } catch {
            /* ignore migration errors */
          }
          break;
        }
      }
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return migrateLegacySave(parsed);
  } catch {
    return null;
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    // Also clean up legacy keys
    for (const legacyKey of LEGACY_SAVE_KEYS) {
      localStorage.removeItem(legacyKey);
    }
  } catch {
    /* ignore */
  }
}

/* ============================================================
 * 10. CHARACTER STATE SYNC — REMOVED (gameState.ts archived in Phase 5)
 * ============================================================ */
// characterToState() was removed — it depended on gameState.ts (dead module).
// Legacy save/load uses LegacySave interface directly (no CharacterState conversion needed).

/* ============================================================
 * 11. MONSTER ADAPTER — convert SRD monster to combat-engine format
 * ============================================================ */

/**
 * Convert a NormalizedMonster from srd.ts into the simple enemy shape that
 * DnDSolo.tsx's combat engine expects:
 *   { uid, id, th, hp, hpNow, ac, atk, dmg, init, xp, sv, attacks, ... }
 *
 * Also pulls in AI behavior from monsters.ts via convertSRDMonsterToDefinition
 * so we can use tactical AI later.
 */

export async function fetchMonsterForCombat(monsterId: string): Promise<any | null> {
  // Try Open5e v2 first (2024 SRD support, richer schema, pre-computed XP)
  const open5eCreature: NormalizedCreature | null = await open5eGetCreature(monsterId, "2024");
  if (open5eCreature) {
    const legacy = creatureToLegacyCombatant(open5eCreature);
    return {
      uid: `${monsterId}_0`,
      id: monsterId,
      th: legacy.th,
      name: legacy.th,
      hp: legacy.hp,
      hpNow: legacy.hp,
      ac: legacy.ac,
      atk: legacy.atk,
      dmg: legacy.dmg,
      init: legacy.init,
      xp: legacy.xp,
      sv: legacy.sv,
      cr: legacy.cr,
      attacks: legacy.actions || [],
      specialAbilities: [],
      legendaryActions: legacy.legendaryActions || [],
      actions: legacy.actions || [],
      traits: open5eCreature.traits || [],
      size: open5eCreature.size,
      type: open5eCreature.type,
      alignment: open5eCreature.alignment,
      speed: open5eCreature.speed,
      speeds: open5eCreature.speeds,
      senses: open5eCreature.senses || [
        open5eCreature.darkvision && `darkvision ${open5eCreature.darkvision} ft.`,
        open5eCreature.blindsight && `blindsight ${open5eCreature.blindsight} ft.`,
        open5eCreature.tremorsense && `tremorsense ${open5eCreature.tremorsense} ft.`,
        open5eCreature.truesight && `truesight ${open5eCreature.truesight} ft.`,
        `passive Perception ${open5eCreature.passivePerception}`,
      ].filter(Boolean).join(", "),
      languages: open5eCreature.languages,
      damageResistances: legacy.resistances,
      damageImmunities: legacy.immunities,
      damageVulnerabilities: legacy.vulnerabilities,
      conditionImmunities: open5eCreature.conditionImmunities,
      abilities: open5eCreature.abilities,
      modifiers: open5eCreature.modifiers,
      passivePerception: open5eCreature.passivePerception,
      reactions: open5eCreature.reactions || [],
      conditions: [],
      srd: true,
      source: "open5e-v2-2024",
    };
  }

  // Fallback to legacy dnd5eapi.co adapter (2014 SRD)
  const m: NormalizedMonster | null = await srdFetchMonster(monsterId);
  if (!m) return null;
  return {
    uid: `${monsterId}_0`,
    id: monsterId,
    th: m.name,
    name: m.name,
    hp: m.hp,
    hpNow: m.hp,
    ac: m.ac,
    atk: m.atk,
    dmg: m.dmg,
    init: m.init,
    xp: m.xp,
    sv: m.sv,
    cr: m.cr,
    attacks: m.attacks || [],
    specialAbilities: m.specialAbilities || [],
    legendaryActions: m.legendaryActions || [],
    actions: m.actions || [],
    size: m.size,
    type: m.type,
    alignment: m.alignment,
    speed: m.speed,
    senses: m.senses,
    languages: m.languages,
    damageResistances: m.damageResistances,
    damageImmunities: m.damageImmunities,
    damageVulnerabilities: m.damageVulnerabilities,
    conditionImmunities: m.conditionImmunities,
    image: m.image,
    hitDice: m.hitDice,
    subtype: m.subtype,
    reactions: m.reactions,
    proficiencyBonus: m.proficiencyBonus,
    skillProficiencies: m.skillProficiencies,
    conditions: [],
    srd: true,
    source: "dnd5eapi-2014",
  };
}

/* ============================================================
 * 12. EFFECTS ENGINE ADAPTER — apply/concentration tracking
 * ============================================================ */

/**
 * Apply a buff to a character, returning a new character with the buff
 * and any state flags it implies (e.g. Mage Armor sets mageArmor=true).
 *
 * This is the bridge between the spell "buff" kind handler and the
 * effects.ts EffectEngine. Currently uses simple inline logic, but
 * could later delegate to effects.EffectEngine.apply().
 */
export function applyBuffToCharacter(buff: {
  name: string;
  type: "buff" | "debuff";
  duration: number; // rounds; -1 = until long rest; 0 = instant
  source?: string;
  effect_desc?: string;
}, character: any): any {
  const nc = { ...character, buffs: [...(character.buffs || [])] };
  // Remove existing buff with same name first (refresh duration)
  nc.buffs = nc.buffs.filter((b: any) => b.name !== buff.name);
  nc.buffs.push(buff);
  // Mage Armor — set flag for AC computation
  if (buff.name === "Mage Armor") nc.mageArmor = true;
  return nc;
}

/** Remove a buff by name from a character */
export function removeBuffFromCharacter(character: any, buffName: string): any {
  const nc = { ...character, buffs: (character.buffs || []).filter((b: any) => b.name !== buffName) };
  if (buffName === "Mage Armor") nc.mageArmor = false;
  return nc;
}

/** Tick down all buff durations by 1 round, removing expired ones. Returns [newChar, expiredBuffNames] */
export function tickBuffDurations(character: any): [any, string[]] {
  const nc = { ...character, buffs: [...(character.buffs || [])] };
  const expired: string[] = [];
  nc.buffs = nc.buffs.map((b: any) => ({ ...b })).filter((b: any) => {
    if (b.duration > 0) {
      b.duration -= 1;
      if (b.duration <= 0) {
        expired.push(b.name);
        return false;
      }
    }
    return true; // keep duration === 0 (instant) and duration === -1 (until long rest)
  });
  if (expired.some((n) => n === "Mage Armor")) nc.mageArmor = false;
  return [nc, expired];
}
