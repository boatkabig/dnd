/**
 * Domain 28: Event & Trigger
 *
 * ระบบเหตุการณ์ที่ทำให้สิ่งต่าง ๆ ทำงานอัตโนมัติ
 *
 * Sub-systems:
 *  28.1 Event Type        — Attack/Move/CastSpell/Damage/Death/TurnStart/TurnEnd
 *  28.2 Trigger Condition — When/Who/Where/Requirement
 *  28.3 Listener          — Feature/Spell/Item/Monster waits for events
 *  28.4 Event Chain       — Attack → Hit → Damage → Trigger Effect → Apply Condition
 *
 * CRITICAL (per user advice #11): Without this, every feature/spell/item needs
 * if/else branching. With this, content listens for events declaratively.
 *
 * Usage:
 *   const bus = new EventBus();
 *   bus.on("on_hit", listener);
 *   bus.emit({ type: "on_hit", payload: {...} });
 */

/* ======================================================================
 * 28.1 EVENT TYPE
 * ====================================================================== */

export type EventType =
  | "on_attack"
  | "on_attack_roll"
  | "on_hit"
  | "on_miss"
  | "on_damage_dealt"
  | "on_damage_taken"
  | "on_heal"
  | "on_kill"
  | "on_death"
  | "on_downed"
  | "on_revive"
  | "on_cast_spell"
  | "on_cast_spell_at"
  | "on_concentration_check"
  | "on_move"
  | "on_enter_area"
  | "on_leave_area"
  | "on_turn_start"
  | "on_turn_end"
  | "on_round_start"
  | "on_round_end"
  | "on_rest_start"
  | "on_rest_end"
  | "on_save"
  | "on_check"
  | "on_condition_applied"
  | "on_condition_removed"
  | "on_resource_spent"
  | "on_resource_recovered"
  | "on_equip"
  | "on_unequip"
  | "on_pickup"
  | "on_drop"
  | "on_long_rest"
  | "on_short_rest"
  | "custom";

export interface GameEvent {
  type: EventType;
  payload: EventPayload;
  timestamp: number; // in-world seconds
  sourceId?: string; // who/what triggered
  targetIds?: string[]; // who is affected
  locationId?: string;
}

export interface EventPayload {
  [key: string]: unknown;
}

/* ======================================================================
 * 28.2 TRIGGER CONDITION
 * ====================================================================== */

export interface TriggerCondition {
  eventType: EventType;
  when?: string; // expression like "hp_percent < 50"
  who?: string; // source/target id or "self" / "any"
  where?: string; // location id or "anywhere"
  requires?: Array<{ type: "flag" | "condition" | "resource" | "equipped"; id: string; min?: number }>;
  cooldownRounds?: number;
  usesPerDay?: number;
  usesRemaining?: number;
  chance?: number; // 0-1, probabilistic trigger
}

export function matchesTrigger(
  cond: TriggerCondition,
  event: GameEvent,
  context: TriggerContext,
): boolean {
  if (cond.eventType !== event.type) return false;
  if (cond.who && cond.who !== "any") {
    if (cond.who === "self" && event.sourceId !== context.listenerOwnerId) return false;
    if (cond.who !== "self" && !event.targetIds?.includes(cond.who)) return false;
  }
  if (cond.where && cond.where !== "anywhere" && event.locationId !== cond.where) {
    return false;
  }
  if (cond.requires) {
    for (const r of cond.requires) {
      if (!checkRequirement(r, context)) return false;
    }
  }
  if (cond.usesPerDay !== undefined && cond.usesRemaining !== undefined) {
    if (cond.usesRemaining <= 0) return false;
  }
  if (cond.chance !== undefined && Math.random() > cond.chance) return false;
  // when expression evaluation (very simple)
  if (cond.when) {
    if (!evaluateWhen(cond.when, event, context)) return false;
  }
  return true;
}

interface TriggerContext {
  listenerOwnerId: string;
  flags: Record<string, number | string | boolean>;
  conditions: string[];
  resources: Record<string, number>;
  equipped: string[];
  cooldowns: Record<string, number>;
}

function checkRequirement(r: { type: string; id: string; min?: number }, ctx: TriggerContext): boolean {
  switch (r.type) {
    case "flag":
      return ctx.flags[r.id] === true;
    case "condition":
      return ctx.conditions.includes(r.id);
    case "resource":
      return (ctx.resources[r.id] ?? 0) >= (r.min ?? 0);
    case "equipped":
      return ctx.equipped.includes(r.id);
  }
  return false;
}

function evaluateWhen(expr: string, event: GameEvent, ctx: TriggerContext): boolean {
  // Very limited expression evaluator — supports simple comparisons
  // e.g. "hp_percent < 50", "source_id == goblin_1"
  const m = expr.match(/^(\w+)\s*(<=|>=|<|>|==|!=)\s*(\w+)$/);
  if (!m) return true; // can't evaluate, default true
  const [, leftRaw, op, rightRaw] = m;
  const left = resolveValue(leftRaw, event, ctx);
  const right = resolveValue(rightRaw, event, ctx);
  switch (op) {
    case "<": return left < right;
    case "<=": return left <= right;
    case ">": return left > right;
    case ">=": return left >= right;
    case "==": return left === right;
    case "!=": return left !== right;
  }
  return false;
}

function resolveValue(raw: string, event: GameEvent, ctx: TriggerContext): number | string {
  if (raw in event.payload) return event.payload[raw] as number | string;
  if (raw in ctx.flags) return ctx.flags[raw] as number | string;
  if (raw in ctx.resources) return ctx.resources[raw];
  const num = Number(raw);
  if (!Number.isNaN(num)) return num;
  return raw;
}

/* ======================================================================
 * 28.3 LISTENER
 * ====================================================================== */

export type ListenerSource = "feature" | "spell" | "item" | "monster" | "condition" | "system";

export interface EventListener {
  id: string;
  ownerId: string;
  source: ListenerSource;
  trigger: TriggerCondition;
  action: ListenerAction;
  priority: number; // higher = fires first
  active: boolean;
}

export interface ListenerAction {
  type: "apply_condition" | "deal_damage" | "heal" | "grant_bonus" | "emit_event" | "modify_roll" | "custom";
  conditionId?: string;
  conditionDuration?: number;
  damageFormula?: string;
  damageType?: string;
  healFormula?: string;
  bonusType?: "attack" | "damage" | "save" | "check" | "ac";
  bonusValue?: number;
  bonusDuration?: number;
  emitEventType?: EventType;
  emitPayload?: EventPayload;
  customHandler?: string; // name of registered handler
}

export interface ListenerContext {
  flags: Record<string, number | string | boolean>;
  conditions: string[];
  resources: Record<string, number>;
  equipped: string[];
  cooldowns: Record<string, number>;
}

/* ======================================================================
 * 28.4 EVENT CHAIN
 * ====================================================================== */

export interface EventChainStep {
  event: GameEvent;
  triggeredBy: string; // listener id
  triggeredAction: ListenerAction;
}

export interface EventChainResult {
  steps: EventChainStep[];
  finalStateChanges: Array<{
    type: "condition_applied" | "condition_removed" | "damage" | "heal" | "bonus_granted";
    targetId: string;
    payload: unknown;
  }>;
}

/* ======================================================================
 * EVENT BUS (the central dispatcher)
 * ====================================================================== */

export class EventBus {
  private listeners: EventListener[] = [];
  private history: GameEvent[] = [];
  private maxHistory = 1000;
  private customHandlers: Map<string, (event: GameEvent, action: ListenerAction, ctx: ListenerContext) => void> = new Map();

  registerCustomHandler(name: string, fn: (event: GameEvent, action: ListenerAction, ctx: ListenerContext) => void): void {
    this.customHandlers.set(name, fn);
  }

  addListener(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l.id !== listener.id);
    };
  }

  removeListenersForOwner(ownerId: string): void {
    this.listeners = this.listeners.filter((l) => l.ownerId !== ownerId);
  }

  emit(event: GameEvent, contexts: Record<string, ListenerContext>): EventChainResult {
    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const steps: EventChainStep[] = [];
    const finalStateChanges: EventChainResult["finalStateChanges"] = [];

    // Sort by priority descending
    const matching = this.listeners
      .filter((l) => l.active)
      .filter((l) => {
        const ctx = contexts[l.ownerId] ?? this.emptyContext();
        const triggerCtx: TriggerContext = {
          listenerOwnerId: l.ownerId,
          flags: ctx.flags,
          conditions: ctx.conditions,
          resources: ctx.resources,
          equipped: ctx.equipped,
          cooldowns: ctx.cooldowns,
        };
        return matchesTrigger(l.trigger, event, triggerCtx);
      })
      .sort((a, b) => b.priority - a.priority);

    for (const listener of matching) {
      const ctx = contexts[listener.ownerId] ?? this.emptyContext();
      const triggerCtx: TriggerContext = {
        listenerOwnerId: listener.ownerId,
        flags: ctx.flags,
        conditions: ctx.conditions,
        resources: ctx.resources,
        equipped: ctx.equipped,
        cooldowns: ctx.cooldowns,
      };
      if (!matchesTrigger(listener.trigger, event, triggerCtx)) continue;

      // Decrement uses if limited
      if (listener.trigger.usesPerDay !== undefined && listener.trigger.usesRemaining !== undefined) {
        listener.trigger.usesRemaining -= 1;
      }

      // Execute action
      const change = this.executeAction(listener, event, ctx);
      if (change) finalStateChanges.push(change);

      steps.push({
        event,
        triggeredBy: listener.id,
        triggeredAction: listener.action,
      });
    }

    return { steps, finalStateChanges };
  }

  private executeAction(
    listener: EventListener,
    event: GameEvent,
    ctx: ListenerContext,
  ): EventChainResult["finalStateChanges"][number] | null {
    const action = listener.action;
    const targetId = event.targetIds?.[0] ?? event.sourceId ?? listener.ownerId;
    switch (action.type) {
      case "apply_condition":
        return {
          type: "condition_applied",
          targetId,
          payload: { condition: action.conditionId, duration: action.conditionDuration },
        };
      case "deal_damage":
        return {
          type: "damage",
          targetId,
          payload: { formula: action.damageFormula, type: action.damageType },
        };
      case "heal":
        return {
          type: "heal",
          targetId,
          payload: { formula: action.healFormula },
        };
      case "grant_bonus":
        return {
          type: "bonus_granted",
          targetId,
          payload: {
            bonusType: action.bonusType,
            value: action.bonusValue,
            duration: action.bonusDuration,
          },
        };
      case "emit_event":
        // Schedule another event — caller can re-emit
        return {
          type: "condition_applied", // placeholder; caller re-emits
          targetId,
          payload: { emit: action.emitEventType, payload: action.emitPayload },
        };
      case "modify_roll":
        return {
          type: "bonus_granted",
          targetId,
          payload: { bonusType: action.bonusType, value: action.bonusValue },
        };
      case "custom":
        if (action.customHandler && this.customHandlers.has(action.customHandler)) {
          this.customHandlers.get(action.customHandler)!(event, action, ctx);
        }
        return null;
    }
    return null;
  }

  getHistory(): GameEvent[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }

  private emptyContext(): ListenerContext {
    return {
      flags: {},
      conditions: [],
      resources: {},
      equipped: [],
      cooldowns: {},
    };
  }
}

/* ======================================================================
 * EVENT FACTORY HELPERS
 * ====================================================================== */

export function createAttackEvent(sourceId: string, targetId: string, weapon?: string): GameEvent {
  return {
    type: "on_attack",
    payload: { weapon, sourceId, targetId },
    timestamp: Date.now(),
    sourceId,
    targetIds: [targetId],
  };
}

export function createDamageEvent(sourceId: string, targetId: string, amount: number, damageType: string): GameEvent {
  return {
    type: "on_damage_dealt",
    payload: { amount, damageType, targetId },
    timestamp: Date.now(),
    sourceId,
    targetIds: [targetId],
  };
}

export function createDeathEvent(characterId: string, killerId?: string): GameEvent {
  return {
    type: "on_death",
    payload: { characterId, killerId },
    timestamp: Date.now(),
    sourceId: killerId,
    targetIds: [characterId],
  };
}

export function createTurnStartEvent(characterId: string, round: number): GameEvent {
  return {
    type: "on_turn_start",
    payload: { characterId, round },
    timestamp: Date.now(),
    sourceId: characterId,
    targetIds: [characterId],
  };
}

export function createSpellCastEvent(casterId: string, spellId: string, level: number, targetIds: string[] = []): GameEvent {
  return {
    type: "on_cast_spell",
    payload: { casterId, spellId, level },
    timestamp: Date.now(),
    sourceId: casterId,
    targetIds,
  };
}
