/**
 * Domain 30: Game State
 *
 * เก็บสถานะทั้งหมดของเกม ณ เวลาปัจจุบัน
 *
 * Sub-systems:
 *  30.1 Character State  — HP/Position/Condition/Resource per character
 *  30.2 World State      — Time/Weather/Location/NPC status
 *  30.3 Combat State     — Initiative/Turn/Round/Active Effects
 *  30.4 Persistence      — Save/Load/History
 *  30.5 State Update     — Action → Rule Engine → Event → Update State
 *
 * This is the SINGLE SOURCE OF TRUTH. All other modules operate on this state
 * via the State Update pipeline (30.5).
 */

import type { GameTime } from "./time.js";
import type { CampaignState } from "./world.js";

/* ======================================================================
 * 30.1 CHARACTER STATE
 * ====================================================================== */

export interface CharacterState {
  characterId: string;
  name: string;
  hp: number;
  maxHp: number;
  tempHp: number;
  position: { x: number; y: number } | null;
  conditions: string[]; // active condition ids
  resources: Record<string, number>; // resource id -> current value
  activeEffects: ActiveEffect[];
  deathSaveSuccesses: number;
  deathSaveFailures: number;
  inspiration: boolean;
  exhausted: boolean;
}

export interface ActiveEffect {
  id: string;
  sourceId: string; // feature/spell/item id
  sourceType: "spell" | "feature" | "item" | "condition";
  name: string;
  durationSeconds: number; // -1 = permanent
  startedAt: number; // world seconds
  remainingSeconds?: number; // for paused
  modifiers: Array<{ type: string; value: number; target: string }>;
  concentrationBy?: string; // character id concentrating
}

export function createCharacterState(spec: {
  characterId: string;
  name: string;
  maxHp: number;
  position?: { x: number; y: number };
}): CharacterState {
  return {
    characterId: spec.characterId,
    name: spec.name,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    tempHp: 0,
    position: spec.position ?? null,
    conditions: [],
    resources: {},
    activeEffects: [],
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
    inspiration: false,
    exhausted: false,
  };
}

export function applyDamage(char: CharacterState, amount: number, damageType?: string): CharacterState {
  // Temp HP absorbs first
  let remaining = amount;
  let tempHp = char.tempHp;
  if (tempHp > 0) {
    const absorbed = Math.min(tempHp, remaining);
    tempHp -= absorbed;
    remaining -= absorbed;
  }
  const newHp = Math.max(0, char.hp - remaining);
  const newFailures = newHp === 0 ? char.deathSaveFailures : char.deathSaveFailures;
  return {
    ...char,
    hp: newHp,
    tempHp,
    deathSaveFailures: newFailures,
  };
}

export function applyHeal(char: CharacterState, amount: number): CharacterState {
  const newHp = Math.min(char.maxHp, char.hp + amount);
  return { ...char, hp: newHp };
}

export function addTempHp(char: CharacterState, amount: number): CharacterState {
  return { ...char, tempHp: Math.max(char.tempHp, amount) };
}

export function addCondition(char: CharacterState, conditionId: string): CharacterState {
  if (char.conditions.includes(conditionId)) return char;
  return { ...char, conditions: [...char.conditions, conditionId] };
}

export function removeCondition(char: CharacterState, conditionId: string): CharacterState {
  return { ...char, conditions: char.conditions.filter((c) => c !== conditionId) };
}

export function isDead(char: CharacterState): boolean {
  return char.hp <= 0 && char.deathSaveFailures >= 3;
}

export function isUnconscious(char: CharacterState): boolean {
  return char.hp <= 0 && !isDead(char);
}

export function isStable(char: CharacterState): boolean {
  return char.hp <= 0 && char.deathSaveSuccesses >= 3;
}

/* ======================================================================
 * 30.2 WORLD STATE
 * ====================================================================== */

export interface WorldState {
  time: GameTime;
  weather: string;
  lighting: string;
  currentLocationId: string;
  npcStates: Record<string, NPCWorldState>;
}

export interface NPCWorldState {
  npcId: string;
  locationId: string;
  alive: boolean;
  attitude: "friendly" | "indifferent" | "hostile";
  currentActivity?: string;
}

export function createWorldState(spec: { time: GameTime; locationId: string; weather?: string; lighting?: string }): WorldState {
  return {
    time: spec.time,
    weather: spec.weather ?? "clear",
    lighting: spec.lighting ?? "daylight",
    currentLocationId: spec.locationId,
    npcStates: {},
  };
}

export function setNPCState(world: WorldState, npcId: string, state: Partial<NPCWorldState>): WorldState {
  const existing = world.npcStates[npcId] ?? {
    npcId,
    locationId: world.currentLocationId,
    alive: true,
    attitude: "indifferent" as const,
  };
  return {
    ...world,
    npcStates: {
      ...world.npcStates,
      [npcId]: { ...existing, ...state },
    },
  };
}

/* ======================================================================
 * 30.3 COMBAT STATE
 * ====================================================================== */

export interface CombatState {
  active: boolean;
  round: number;
  currentTurnIndex: number;
  initiativeOrder: Array<{ id: string; initiative: number }>;
  activeEffects: ActiveEffect[]; // battlefield-wide (e.g. Slow spell on area)
  lairActionsTriggered: boolean;
  legendaryActionsUsedThisRound: Record<string, number>;
}

export function createCombatState(): CombatState {
  return {
    active: false,
    round: 0,
    currentTurnIndex: 0,
    initiativeOrder: [],
    activeEffects: [],
    lairActionsTriggered: false,
    legendaryActionsUsedThisRound: {},
  };
}

export function startCombat(initiativeOrder: Array<{ id: string; initiative: number }>): CombatState {
  return {
    active: true,
    round: 1,
    currentTurnIndex: 0,
    initiativeOrder: [...initiativeOrder].sort((a, b) => b.initiative - a.initiative),
    activeEffects: [],
    lairActionsTriggered: false,
    legendaryActionsUsedThisRound: {},
  };
}

export function endCombat(state: CombatState): CombatState {
  return {
    ...state,
    active: false,
    round: 0,
    currentTurnIndex: 0,
    initiativeOrder: [],
    activeEffects: [],
  };
}

export function nextTurn(state: CombatState): CombatState {
  const nextIdx = (state.currentTurnIndex + 1) % state.initiativeOrder.length;
  const newRound = nextIdx === 0 ? state.round + 1 : state.round;
  return {
    ...state,
    currentTurnIndex: nextIdx,
    round: newRound,
    lairActionsTriggered: false,
    legendaryActionsUsedThisRound: {},
  };
}

export function currentCombatant(state: CombatState): string | undefined {
  return state.initiativeOrder[state.currentTurnIndex]?.id;
}

/* ======================================================================
 * 30.4 PERSISTENCE
 * ====================================================================== */

export interface SaveSnapshot {
  version: number;
  savedAt: number; // real-world epoch ms
  worldTimeSeconds: number;
  campaign: CampaignState;
  characters: Record<string, CharacterState>;
  world: WorldState;
  combat: CombatState;
  history: HistoryEntry[];
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  description: string;
  type: "combat" | "social" | "exploration" | "story" | "system";
  payload?: unknown;
}

export function createSnapshot(spec: {
  campaign: CampaignState;
  characters: Record<string, CharacterState>;
  world: WorldState;
  combat: CombatState;
  history?: HistoryEntry[];
  version?: number;
}): SaveSnapshot {
  return {
    version: spec.version ?? 1,
    savedAt: Date.now(),
    worldTimeSeconds: spec.world.time.totalSeconds,
    campaign: spec.campaign,
    characters: spec.characters,
    world: spec.world,
    combat: spec.combat,
    history: spec.history ?? [],
  };
}

export function validateSnapshot(snap: unknown): snap is SaveSnapshot {
  if (!snap || typeof snap !== "object") return false;
  const s = snap as Partial<SaveSnapshot>;
  return (
    typeof s.version === "number" &&
    typeof s.savedAt === "number" &&
    typeof s.worldTimeSeconds === "number" &&
    !!s.campaign &&
    !!s.characters &&
    !!s.world &&
    !!s.combat
  );
}

export function migrateSnapshot(snap: SaveSnapshot, targetVersion: number): SaveSnapshot {
  // Future: implement migration steps between versions
  // For now, just bump version
  return { ...snap, version: targetVersion };
}

/* ======================================================================
 * 30.5 STATE UPDATE PIPELINE
 *
 *  Action → Rule Engine → Event → Update State
 *
 * This is the canonical update flow. AI DM emits an Action; the pipeline:
 *   1. Validates the action against rules
 *   2. Resolves modifier stack
 *   3. Computes outcome (success/failure, damage, conditions)
 *   4. Emits events for triggers
 *   5. Mutates character/world/combat state
 * ====================================================================== */

export interface StateUpdateAction {
  type: string;
  actorId: string;
  targetIds?: string[];
  ruleId?: string;
  modifiers?: Array<{ id: string; type: string; name: string; value: number }>;
  payload?: Record<string, unknown>;
}

export interface StateUpdateResult {
  success: boolean;
  applied: boolean;
  effects: Array<{
    type: "damage" | "heal" | "condition" | "resource" | "position" | "flag";
    targetId: string;
    payload: unknown;
  }>;
  events: Array<{ type: string; payload: unknown }>;
  note: string;
}

export interface GameStateBundle {
  campaign: CampaignState;
  characters: Record<string, CharacterState>;
  world: WorldState;
  combat: CombatState;
  history: HistoryEntry[];
}

export function applyStateUpdate(
  state: GameStateBundle,
  action: StateUpdateAction,
): { state: GameStateBundle; result: StateUpdateResult } {
  // 1. Resolve damage/heal if payload specifies
  const effects: StateUpdateResult["effects"] = [];
  const events: StateUpdateResult["events"] = [];
  const newCharacters = { ...state.characters };

  if (action.payload?.damage && action.targetIds) {
    const amount = action.payload.damage as number;
    for (const tid of action.targetIds) {
      const c = newCharacters[tid];
      if (!c) continue;
      newCharacters[tid] = applyDamage(c, amount, action.payload.damageType as string);
      effects.push({ type: "damage", targetId: tid, payload: { amount } });
      events.push({ type: "on_damage_taken", payload: { targetId: tid, amount } });
    }
  }

  if (action.payload?.heal && action.targetIds) {
    const amount = action.payload.heal as number;
    for (const tid of action.targetIds) {
      const c = newCharacters[tid];
      if (!c) continue;
      newCharacters[tid] = applyHeal(c, amount);
      effects.push({ type: "heal", targetId: tid, payload: { amount } });
      events.push({ type: "on_heal", payload: { targetId: tid, amount } });
    }
  }

  if (action.payload?.conditionId && action.targetIds) {
    const cid = action.payload.conditionId as string;
    for (const tid of action.targetIds) {
      const c = newCharacters[tid];
      if (!c) continue;
      newCharacters[tid] = addCondition(c, cid);
      effects.push({ type: "condition", targetId: tid, payload: { conditionId: cid } });
      events.push({ type: "on_condition_applied", payload: { targetId: tid, conditionId: cid } });
    }
  }

  if (action.payload?.removeConditionId && action.targetIds) {
    const cid = action.payload.removeConditionId as string;
    for (const tid of action.targetIds) {
      const c = newCharacters[tid];
      if (!c) continue;
      newCharacters[tid] = removeCondition(c, cid);
      effects.push({ type: "condition", targetId: tid, payload: { conditionId: cid, removed: true } });
    }
  }

  const historyEntry: HistoryEntry = {
    id: `h_${Date.now()}`,
    timestamp: state.world.time.totalSeconds,
    description: action.type,
    type: action.payload?.category as HistoryEntry["type"] ?? "system",
    payload: action.payload,
  };

  return {
    state: {
      ...state,
      characters: newCharacters,
      history: [...state.history, historyEntry],
    },
    result: {
      success: true,
      applied: true,
      effects,
      events,
      note: `${action.type} → ${effects.length} effects`,
    },
  };
}

/* ======================================================================
 * GLOBAL GAME STATE SINGLETON
 * ====================================================================== */

export class GameState {
  campaign: CampaignState;
  characters: Record<string, CharacterState>;
  world: WorldState;
  combat: CombatState;
  history: HistoryEntry[];

  constructor(spec: {
    campaign: CampaignState;
    world: WorldState;
    initialCharacters?: CharacterState[];
  }) {
    this.campaign = spec.campaign;
    this.world = spec.world;
    this.combat = createCombatState();
    this.history = [];
    this.characters = {};
    for (const c of spec.initialCharacters ?? []) {
      this.characters[c.characterId] = c;
    }
  }

  getCharacter(id: string): CharacterState | undefined {
    return this.characters[id];
  }

  updateCharacter(id: string, fn: (c: CharacterState) => CharacterState): void {
    if (this.characters[id]) {
      this.characters[id] = fn(this.characters[id]);
    }
  }

  applyAction(action: StateUpdateAction): StateUpdateResult {
    const bundle: GameStateBundle = {
      campaign: this.campaign,
      characters: this.characters,
      world: this.world,
      combat: this.combat,
      history: this.history,
    };
    const { state, result } = applyStateUpdate(bundle, action);
    this.campaign = state.campaign;
    this.characters = state.characters;
    this.world = state.world;
    this.combat = state.combat;
    this.history = state.history;
    return result;
  }

  snapshot(): SaveSnapshot {
    return createSnapshot({
      campaign: this.campaign,
      characters: this.characters,
      world: this.world,
      combat: this.combat,
      history: this.history,
    });
  }

  loadSnapshot(snap: SaveSnapshot): void {
    if (!validateSnapshot(snap)) {
      throw new Error("Invalid save snapshot");
    }
    this.campaign = snap.campaign;
    this.characters = snap.characters;
    this.world = snap.world;
    this.combat = snap.combat;
    this.history = snap.history ?? [];
    // Restore world time
    this.world = {
      ...this.world,
      time: { totalSeconds: snap.worldTimeSeconds },
    };
  }
}
