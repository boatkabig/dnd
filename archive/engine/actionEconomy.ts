/**
 * ============================================================================
 * D&D Engine Design Document — Chapter 02: Action Economy
 * ============================================================================
 *
 * Version: 1.0
 * Target: D&D 5e / 2024 Compatible
 * Architecture: Data-Driven Action Costs + Per-Turn Tracker
 *
 * Core Principles:
 *   1. Action Type = Tag, not enum — every action is defined by data in ACTION_TYPES.
 *   2. ActionCost — each action consumes specific resources (Action, Bonus, Reaction,
 *      Movement, Free Interaction, Legendary, Mythic, Lair).
 *   3. Per-Turn Tracking — ActionTracker holds mutable state for one combatant per turn.
 *   4. Validation Before Consumption — canAct() never mutates; consumeAction() does.
 *   5. Multi-Action — Action Surge / Haste / extra-incarnation grant extra Action charges.
 *   6. Action Queue — Ready / Delay actions are queued and triggered reactively.
 *   7. Data-Driven — adding new Action types (e.g. homebrew "Swift Action") requires
 *      only a new entry in ACTION_TYPES, no code changes.
 *
 * Action Economy Flow (per turn):
 *   1. startTurn → resetTurnActions(tracker)
 *   2. Player declares action → validateAction(def, tracker)
 *   3. If valid → consumeAction(def, tracker) decrements charges
 *   4. Free interactions tracked separately (max ~1/turn by DM ruling)
 *   5. Reaction available until used (persists across turns until refresh on your turn)
 *   6. endTurn → reactions refresh on your NEXT turn start
 *
 * Cross-References:
 *   - Character.ts (Chapter 01) → provides isAlive, isIncapacitated
 *   - Combat.ts (Chapter 03) → owns turn lifecycle, calls into ActionTracker
 *   - Magic.ts (Chapter 04) → spell castingTime maps to ActionCost
 * ============================================================================
 */

// ============================================================================
// 1. ACTION TYPES — Data-Driven Table
// ============================================================================

/**
 * Every kind of action a creature can take in a turn.
 * - "action" — main action (Attack, Cast Spell, Dash, etc.)
 * - "bonus_action" — special fast action (Cunning Action, Healing Word)
 * - "reaction" — triggered out-of-turn action (Opportunity Attack, Counterspell)
 * - "movement" — moving on the grid (split across turn)
 * - "free" — free object interaction (draw weapon, open door)
 * - "legendary" — monster-only, 3/round, used at end of others' turns
 * - "mythic" — boss-only, 1/round after legendary actions used
 * - "lair" — lair-bound monster action, initiative count 20 (lose ties)
 */
export type ActionType =
  | "action"
  | "bonus_action"
  | "reaction"
  | "movement"
  | "free"
  | "legendary"
  | "mythic"
  | "lair";

/**
 * Defines a kind of action resource that a tracker must hold.
 * Data-driven — new action types just add an entry here.
 */
export interface ActionTypeDef {
  type: ActionType;
  name: string;
  description: string;
  /** Default per-turn cap for a typical creature (0 = unavailable). */
  defaultCap: number;
  /** Whether this resource refreshes on the creature's own turn start. */
  refreshesOnTurnStart: boolean;
  /** Whether this resource is consumed out-of-turn (e.g. reaction). */
  usableOutOfTurn: boolean;
}

/**
 * Master table of action types. Add new types here — no code changes elsewhere.
 */
export const ACTION_TYPES: Record<ActionType, ActionTypeDef> = {
  action: {
    type: "action",
    name: "Action",
    description: "Main action taken on your turn (Attack, Cast Spell, Dash, etc.).",
    defaultCap: 1,
    refreshesOnTurnStart: true,
    usableOutOfTurn: false,
  },
  bonus_action: {
    type: "bonus_action",
    name: "Bonus Action",
    description: "Quick action; only one per turn (Cunning Action, Bonus-Action spell).",
    defaultCap: 1,
    refreshesOnTurnStart: true,
    usableOutOfTurn: false,
  },
  reaction: {
    type: "reaction",
    name: "Reaction",
    description: "Triggered action; refreshes at the start of your next turn.",
    defaultCap: 1,
    refreshesOnTurnStart: true,
    usableOutOfTurn: true,
  },
  movement: {
    type: "movement",
    name: "Movement",
    description: "Walk/fly/swim/climb speed in feet; refreshes each turn.",
    defaultCap: 30, // overridden by character speed
    refreshesOnTurnStart: true,
    usableOutOfTurn: false,
  },
  free: {
    type: "free",
    name: "Free Interaction",
    description: "Single object interaction per turn (draw weapon, open door).",
    defaultCap: 1,
    refreshesOnTurnStart: true,
    usableOutOfTurn: false,
  },
  legendary: {
    type: "legendary",
    name: "Legendary Action",
    description: "Monster-only; 3/round, used at end of another creature's turn.",
    defaultCap: 3,
    refreshesOnTurnStart: false,
    usableOutOfTurn: true,
  },
  mythic: {
    type: "mythic",
    name: "Mythic Action",
    description: "Boss-only; 1/round, taken after legendary actions are exhausted.",
    defaultCap: 1,
    refreshesOnTurnStart: false,
    usableOutOfTurn: true,
  },
  lair: {
    type: "lair",
    name: "Lair Action",
    description: "Lair-bound monster; initiative count 20 (lose ties).",
    defaultCap: 1,
    refreshesOnTurnStart: false,
    usableOutOfTurn: true,
  },
};

// ============================================================================
// 2. ACTION COST — What an action consumes
// ============================================================================

/**
 * The cost of a specific action. Most actions cost exactly one resource, but
 * some (e.g. a full Spellcasting action with a quickened bonus) might combine.
 * Costs can be zero (free actions) or consume movement (e.g. Stand from Prone = half move).
 */
export interface ActionCost {
  action?: number;          // 0 or 1 (rarely 2 with Action Surge)
  bonus_action?: number;    // 0 or 1
  reaction?: number;        // 0 or 1
  movement?: number;        // ft consumed (e.g. 5 ft to stand from prone)
  free?: number;            // 0 or 1
  legendary?: number;       // 0..3
  mythic?: number;          // 0 or 1
  lair?: number;            // 0 or 1
  /** Optional: minimum level / tags required (e.g. legendary requires tag "legendary"). */
  requiresTags?: string[];
  /** Optional: name of feature that grants this action (e.g. "Action Surge"). */
  grantedBy?: string;
}

/**
 * Data-driven definition of an action (e.g. "Attack", "Dash", "Disengage").
 * AI DM looks these up to know what a character can do.
 */
export interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  cost: ActionCost;
  /** Tags for filtering (e.g. "offensive", "movement", "spell"). */
  tags?: string[];
  /** Optional requirement predicate — character must pass (e.g. has Extra Attack). */
  requiresFeature?: string;
}

/**
 * Standard D&D 5e actions (data-driven, no hardcode).
 * Add new actions by appending to this array.
 */
export const STANDARD_ACTIONS: ActionDefinition[] = [
  { id: "attack", name: "Attack", description: "Make one melee or ranged weapon attack.", cost: { action: 1 }, tags: ["offensive"] },
  { id: "cast_spell", name: "Cast a Spell", description: "Cast a spell with casting time 1 action.", cost: { action: 1 }, tags: ["spell"] },
  { id: "dash", name: "Dash", description: "Gain extra movement equal to your speed.", cost: { action: 1 }, tags: ["movement"] },
  { id: "disengage", name: "Disengage", description: "Movement does not provoke opportunity attacks this turn.", cost: { action: 1 }, tags: ["movement", "defensive"] },
  { id: "dodge", name: "Dodge", description: "Attacks against you have disadvantage; DEX saves have advantage.", cost: { action: 1 }, tags: ["defensive"] },
  { id: "help", name: "Help", description: "Ally gains advantage on next attack vs target, or aids ability check.", cost: { action: 1 }, tags: ["support"] },
  { id: "hide", name: "Hide", description: "Make a Stealth check to become hidden.", cost: { action: 1 }, tags: ["stealth"] },
  { id: "ready", name: "Ready", description: "Prepare an action to trigger on a condition.", cost: { action: 1 }, tags: ["tactical"] },
  { id: "search", name: "Search", description: "Make a Perception or Investigation check.", cost: { action: 1 }, tags: ["exploration"] },
  { id: "use_object", name: "Use an Object", description: "Interact with an object that requires more than a free interaction.", cost: { action: 1 }, tags: ["utility"] },
  { id: "improvised", name: "Improvised Action", description: "Any action not covered by standard list (DM ruling).", cost: { action: 1 }, tags: ["utility"] },
  { id: "shove", name: "Shove", description: "Push target 5 ft or knock prone (Athletics vs Athletics/Acrobatics).", cost: { action: 1 }, tags: ["offensive", "control"] },
  { id: "grapple", name: "Grapple", description: "Grab target (Athletics vs Athletics/Acrobatics).", cost: { action: 1 }, tags: ["offensive", "control"] },
  { id: "two_weapon_attack", name: "Two-Weapon Attack (off-hand)", description: "Attack with off-hand light weapon.", cost: { bonus_action: 1 }, tags: ["offensive"] },
  { id: "opportunity_attack", name: "Opportunity Attack", description: "Reaction attack when enemy leaves your reach.", cost: { reaction: 1 }, tags: ["offensive", "reaction"] },
  { id: "stand_from_prone", name: "Stand from Prone", description: "Stand up from prone; consumes half your movement.", cost: { movement: 0 }, tags: ["movement"] },
];

/** Look up a standard action by ID. Returns undefined if not found. */
export function getActionDefinition(actionId: string): ActionDefinition | undefined {
  return STANDARD_ACTIONS.find(a => a.id === actionId);
}

// ============================================================================
// 3. PER-TURN TRACKER — Mutable state for one combatant
// ============================================================================

/**
 * Per-turn resource tracker for a single combatant.
 * Lives in CombatState; reset on turn start via resetTurnActions().
 *
 * Multi-Action support: `actionCharges` can be > 1 (Action Surge, Haste).
 * The default is 1; Action Surge temporarily adds 1 (consumed first).
 */
export interface ActionTracker {
  characterId: string;
  // Current charges available for each action type this turn
  actionCharges: number;          // typically 1, or 2 with Action Surge
  bonusActionCharges: number;     // 0 or 1
  reactionAvailable: boolean;     // true until consumed (refreshes on your turn start)
  movementRemaining: number;      // ft remaining this turn
  freeInteractionsRemaining: number; // typically 1
  legendaryRemaining: number;     // 3 max for legendary monsters; 0 for non-legendary
  mythicRemaining: number;        // 1 max for mythic bosses
  lairAvailable: boolean;         // true if lair action available this round
  // Special resource flags (data-driven; AI DM checks these)
  extraResources: Record<string, number>; // e.g. { "action_surge": 1, "indomitable": 1 }
}

/**
 * Create a fresh tracker for a combatant.
 * Default caps pulled from ACTION_TYPES; can be overridden (e.g. for Haste).
 */
export function createActionTracker(params: {
  characterId: string;
  speed: number;
  isLegendary?: boolean;
  isMythic?: boolean;
  hasLair?: boolean;
  extraActionCharges?: number; // Action Surge: +1
}): ActionTracker {
  return {
    characterId: params.characterId,
    actionCharges: ACTION_TYPES.action.defaultCap + (params.extraActionCharges ?? 0),
    bonusActionCharges: ACTION_TYPES.bonus_action.defaultCap,
    reactionAvailable: true,
    movementRemaining: params.speed,
    freeInteractionsRemaining: ACTION_TYPES.free.defaultCap,
    legendaryRemaining: params.isLegendary ? ACTION_TYPES.legendary.defaultCap : 0,
    mythicRemaining: params.isMythic ? ACTION_TYPES.mythic.defaultCap : 0,
    lairAvailable: params.hasLair ?? false,
    extraResources: {},
  };
}

/**
 * Reset per-turn resources at the start of a creature's turn.
 * Reaction is refreshed on YOUR turn start (per D&D 5e rules).
 * Legendary/mythic/lair do NOT reset here — they refresh on ROUND boundaries.
 */
export function resetTurnActions(tracker: ActionTracker, speed: number): ActionTracker {
  return {
    ...tracker,
    actionCharges: ACTION_TYPES.action.defaultCap + (tracker.extraResources["action_surge_bonus"] ?? 0),
    bonusActionCharges: ACTION_TYPES.bonus_action.defaultCap,
    reactionAvailable: true,
    movementRemaining: speed,
    freeInteractionsRemaining: ACTION_TYPES.free.defaultCap,
  };
}

/**
 * Reset round-boundary resources (legendary, mythic, lair).
 * Called by Combat at the start of each new round.
 */
export function resetRoundActions(tracker: ActionTracker): ActionTracker {
  return {
    ...tracker,
    legendaryRemaining: tracker.legendaryRemaining > 0 ? ACTION_TYPES.legendary.defaultCap : 0,
    mythicRemaining: tracker.mythicRemaining > 0 ? ACTION_TYPES.mythic.defaultCap : 0,
    lairAvailable: true,
  };
}

// ============================================================================
// 4. VALIDATION — Pure queries, no mutation
// ============================================================================

/**
 * Validate whether an action can be taken given the current tracker state.
 * Returns a ValidationResult with success/failure and reason.
 *
 * Does NOT mutate the tracker — call consumeAction() to actually deduct.
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  missingResource?: ActionType;
}

export function validateAction(def: ActionDefinition, tracker: ActionTracker): ValidationResult {
  const cost = def.cost;

  if (cost.action && tracker.actionCharges < cost.action) {
    return { valid: false, reason: "No Action available this turn", missingResource: "action" };
  }
  if (cost.bonus_action && tracker.bonusActionCharges < cost.bonus_action) {
    return { valid: false, reason: "Bonus Action already used this turn", missingResource: "bonus_action" };
  }
  if (cost.reaction && !tracker.reactionAvailable) {
    return { valid: false, reason: "Reaction already used since last turn", missingResource: "reaction" };
  }
  if (cost.movement && tracker.movementRemaining < cost.movement) {
    return { valid: false, reason: `Insufficient movement (need ${cost.movement} ft, have ${tracker.movementRemaining} ft)`, missingResource: "movement" };
  }
  if (cost.free && tracker.freeInteractionsRemaining < cost.free) {
    return { valid: false, reason: "Free interaction already used this turn", missingResource: "free" };
  }
  if (cost.legendary && tracker.legendaryRemaining < cost.legendary) {
    return { valid: false, reason: "No Legendary Actions remaining this round", missingResource: "legendary" };
  }
  if (cost.mythic && tracker.mythicRemaining < cost.mythic) {
    return { valid: false, reason: "Mythic Action already used this round", missingResource: "mythic" };
  }
  if (cost.lair && !tracker.lairAvailable) {
    return { valid: false, reason: "Lair Action already used this round", missingResource: "lair" };
  }
  // Feature prerequisite (e.g. Extra Attack, Action Surge)
  if (def.requiresFeature && !tracker.extraResources[def.requiresFeature]) {
    return { valid: false, reason: `Requires feature: ${def.requiresFeature}` };
  }
  return { valid: true };
}

/**
 * Quick boolean check: can the combatant perform this action right now?
 * Same as validateAction().valid, but more readable for callers.
 */
export function canAct(def: ActionDefinition, tracker: ActionTracker): boolean {
  return validateAction(def, tracker).valid;
}

/**
 * Check if a combatant has any action resource left at all this turn.
 * Useful for AI decision-making ("should I end my turn?").
 */
export function hasAnyActionLeft(tracker: ActionTracker): boolean {
  return (
    tracker.actionCharges > 0 ||
    tracker.bonusActionCharges > 0 ||
    tracker.freeInteractionsRemaining > 0
  );
}

// ============================================================================
// 5. CONSUME — Mutate tracker after a successful validation
// ============================================================================

/**
 * Consume the resources required by an action.
 * Throws if the action is invalid (call validateAction/canAct first).
 * Returns a NEW tracker (immutable update).
 */
export function consumeAction(def: ActionDefinition, tracker: ActionTracker): ActionTracker {
  const v = validateAction(def, tracker);
  if (!v.valid) {
    throw new Error(`Cannot consume ${def.id}: ${v.reason}`);
  }
  const cost = def.cost;
  return {
    ...tracker,
    actionCharges: tracker.actionCharges - (cost.action ?? 0),
    bonusActionCharges: tracker.bonusActionCharges - (cost.bonus_action ?? 0),
    reactionAvailable: tracker.reactionAvailable && !((cost.reaction ?? 0) > 0),
    movementRemaining: tracker.movementRemaining - (cost.movement ?? 0),
    freeInteractionsRemaining: tracker.freeInteractionsRemaining - (cost.free ?? 0),
    legendaryRemaining: tracker.legendaryRemaining - (cost.legendary ?? 0),
    mythicRemaining: tracker.mythicRemaining - (cost.mythic ?? 0),
    lairAvailable: tracker.lairAvailable && !((cost.lair ?? 0) > 0),
    extraResources: { ...tracker.extraResources },
  };
}

/**
 * Consume movement (in feet). Returns updated tracker or throws if insufficient.
 * Movement is split: a character can move 10 ft, attack, then move 20 ft more.
 */
export function consumeMovement(tracker: ActionTracker, feet: number): ActionTracker {
  if (tracker.movementRemaining < feet) {
    throw new Error(`Insufficient movement: have ${tracker.movementRemaining}, need ${feet}`);
  }
  return { ...tracker, movementRemaining: tracker.movementRemaining - feet };
}

/**
 * Refund an action (undo a consume). Useful for misclicks / DM corrections.
 * Caps at the per-turn maximum to prevent abuse.
 */
export function refundAction(def: ActionDefinition, tracker: ActionTracker): ActionTracker {
  const cost = def.cost;
  return {
    ...tracker,
    actionCharges: Math.min(ACTION_TYPES.action.defaultCap, tracker.actionCharges + (cost.action ?? 0)),
    bonusActionCharges: Math.min(ACTION_TYPES.bonus_action.defaultCap, tracker.bonusActionCharges + (cost.bonus_action ?? 0)),
    reactionAvailable: tracker.reactionAvailable || ((cost.reaction ?? 0) > 0),
    movementRemaining: tracker.movementRemaining + (cost.movement ?? 0),
    freeInteractionsRemaining: Math.min(ACTION_TYPES.free.defaultCap, tracker.freeInteractionsRemaining + (cost.free ?? 0)),
    legendaryRemaining: Math.min(ACTION_TYPES.legendary.defaultCap, tracker.legendaryRemaining + (cost.legendary ?? 0)),
    mythicRemaining: Math.min(ACTION_TYPES.mythic.defaultCap, tracker.mythicRemaining + (cost.mythic ?? 0)),
    lairAvailable: tracker.lairAvailable || ((cost.lair ?? 0) > 0),
    extraResources: { ...tracker.extraResources },
  };
}

// ============================================================================
// 6. MULTI-ACTION SYSTEM — Action Surge, Haste, Extra Attack
// ============================================================================

/**
 * Grant an extra Action charge (Action Surge).
 * Persists until consumed or until turn ends (reset on next turn start).
 */
export function grantExtraAction(tracker: ActionTracker, source: string): ActionTracker {
  return {
    ...tracker,
    actionCharges: tracker.actionCharges + 1,
    extraResources: {
      ...tracker.extraResources,
      [`${source}_bonus`]: (tracker.extraResources[`${source}_bonus`] ?? 0) + 1,
    },
  };
}

/**
 * Grant a special resource (e.g. "indomitable", "bardic_inspiration").
 * AI DM uses these for special-action gating.
 */
export function grantResource(tracker: ActionTracker, resourceId: string, count: number = 1): ActionTracker {
  return {
    ...tracker,
    extraResources: {
      ...tracker.extraResources,
      [resourceId]: (tracker.extraResources[resourceId] ?? 0) + count,
    },
  };
}

/**
 * Consume a special resource (e.g. spend Indomitable to reroll a save).
 * Returns new tracker, or throws if resource is missing.
 */
export function consumeResource(tracker: ActionTracker, resourceId: string, count: number = 1): ActionTracker {
  const current = tracker.extraResources[resourceId] ?? 0;
  if (current < count) {
    throw new Error(`Resource '${resourceId}' insufficient: have ${current}, need ${count}`);
  }
  return {
    ...tracker,
    extraResources: {
      ...tracker.extraResources,
      [resourceId]: current - count,
    },
  };
}

// ============================================================================
// 7. ACTION QUEUE — Ready / Delay
// ============================================================================

/**
 * A queued action waiting to be triggered.
 * - "ready": triggered when condition is met (e.g. "when enemy moves, I attack")
 * - "delay": postponed to later in initiative order
 */
export interface QueuedAction {
  id: string;
  characterId: string;
  actionDef: ActionDefinition;
  triggerCondition?: string;       // for Ready: descriptive condition
  triggerInitiative?: number;      // for Delay: new initiative count
  targetIds?: string[];
  payload?: Record<string, unknown>;
  /** Round on which it was queued (for cleanup if not triggered). */
  queuedAtRound: number;
}

/**
 * Process the action queue: returns actions whose trigger has fired.
 * Trigger conditions are evaluated by AI DM (free-form text → AI interprets).
 */
export function checkReadyActions(
  queue: QueuedAction[],
  triggerDescription: string,
  currentRound: number,
): { triggered: QueuedAction[]; remaining: QueuedAction[] } {
  const triggered: QueuedAction[] = [];
  const remaining: QueuedAction[] = [];
  for (const qa of queue) {
    // Simple keyword match (DM can interpret free-form)
    const cond = qa.triggerCondition?.toLowerCase() ?? "";
    if (cond && triggerDescription.toLowerCase().includes(cond.split(" ")[0])) {
      triggered.push(qa);
    } else if (currentRound > qa.queuedAtRound + 1) {
      // Stale: queued > 1 round ago, never triggered → drop
      // (D&D 5e: Ready action is lost if not triggered by your next turn)
      continue;
    } else {
      remaining.push(qa);
    }
  }
  return { triggered, remaining };
}

/**
 * Add a Ready action to the queue.
 * The action's cost is NOT consumed at queue time — it is consumed when triggered.
 */
export function queueReadyAction(
  queue: QueuedAction[],
  characterId: string,
  actionDef: ActionDefinition,
  triggerCondition: string,
  targetIds: string[] = [],
  currentRound: number = 0,
): QueuedAction[] {
  const qa: QueuedAction = {
    id: `ready_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    characterId,
    actionDef,
    triggerCondition,
    targetIds,
    queuedAtRound: currentRound,
  };
  return [...queue, qa];
}

/**
 * Remove a queued action (after triggered or cancelled).
 */
export function removeQueuedAction(queue: QueuedAction[], id: string): QueuedAction[] {
  return queue.filter(qa => qa.id !== id);
}

// ============================================================================
// 8. SUMMARY — For AI DM / UI display
// ============================================================================

/**
 * Produce a human-readable summary of what actions a combatant has left.
 * Used by AI DM to decide next move + by UI to render the action bar.
 */
export function summarizeTracker(t: ActionTracker): string {
  const parts: string[] = [];
  parts.push(`Action ×${t.actionCharges}`);
  parts.push(`Bonus ×${t.bonusActionCharges}`);
  parts.push(`Reaction ${t.reactionAvailable ? "✓" : "✗"}`);
  parts.push(`Move ${t.movementRemaining} ft`);
  if (t.legendaryRemaining > 0) parts.push(`Legendary ×${t.legendaryRemaining}`);
  if (t.mythicRemaining > 0) parts.push(`Mythic ×${t.mythicRemaining}`);
  if (t.lairAvailable) parts.push("Lair ✓");
  return parts.join(" · ");
}

/**
 * List all standard actions currently available to a combatant.
 * AI DM calls this to enumerate legal moves.
 */
export function listAvailableActions(tracker: ActionTracker): ActionDefinition[] {
  return STANDARD_ACTIONS.filter(def => canAct(def, tracker));
}
