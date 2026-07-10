/**
 * Domain 32: AI Planning Engine
 *
 * สำหรับ NPC และ DM — ตัดสินใจเชิงกลยุทธ์
 *
 * Sub-systems:
 *  32.1 Goal System — what does the agent want?
 *  32.2 Strategy Selection — how to pursue the goal?
 *  32.3 Decision Tree — evaluate options
 *  32.4 Prediction — anticipate outcomes
 *  32.5 Action Selection — pick best action this turn
 *  32.6 Replanning — when situation changes
 *  32.7 Multi-Agent Coordination — group tactics
 *  32.8 Risk Assessment — evaluate danger
 *
 * Whereas Domain 25 (Monsters) has the AI Behavior *pattern* (aggressive/tactical/etc),
 * Domain 32 has the *planning logic* — translating goals → concrete actions.
 */

/* ======================================================================
 * 32.1 GOAL SYSTEM
 * ====================================================================== */

export type GoalType =
  | "kill_player" | "kill_target" | "defend_location" | "flee" | "negotiate"
  | "protect_ally" | "retrieve_item" | "escape" | "ambush" | "wait"
  | "patrol" | "gather_info" | "trade" | "complete_quest";

export interface Goal {
  id: string;
  type: GoalType;
  description: string;
  priority: number; // 1-10, higher = more important
  targetId?: string;
  locationId?: string;
  itemId?: string;
  deadlineSeconds?: number; // when goal expires
  completed: boolean;
  failed: boolean;
}

export function createGoal(spec: { id: string; type: GoalType; description: string; priority?: number; targetId?: string; locationId?: string; itemId?: string; deadlineSeconds?: number }): Goal {
  return {
    id: spec.id,
    type: spec.type,
    description: spec.description,
    priority: spec.priority ?? 5,
    targetId: spec.targetId,
    locationId: spec.locationId,
    itemId: spec.itemId,
    deadlineSeconds: spec.deadlineSeconds,
    completed: false,
    failed: false,
  };
}

export function selectHighestPriorityGoal(goals: Goal[]): Goal | null {
  const active = goals.filter((g) => !g.completed && !g.failed);
  if (active.length === 0) return null;
  return active.sort((a, b) => b.priority - a.priority)[0];
}

/* ======================================================================
 * 32.2 STRATEGY SELECTION
 * ====================================================================== */

export type Strategy =
  | "aggressive_rush" | "defensive_hold" | "tactical_focus_fire" | "flank_and_strike"
  | "kite_ranged" | "retreat_to_heal" | "negotiate_peace" | "ambush_wait"
  | "patrol_pattern" | "trade_fairly" | "bribe_for_info" | "sacrifice_self"
  | "guard_objective" | "lure_into_trap" | "call_for_reinforcements";

export function selectStrategy(goal: Goal, context: PlanningContext): Strategy {
  const { selfHpPercent, alliesAlive, enemiesVisible, distanceToTarget, selfHasRangedWeapon } = context;
  switch (goal.type) {
    case "kill_player":
    case "kill_target":
      if (selfHpPercent < 25 && alliesAlive === 0) return "retreat_to_heal";
      if (enemiesVisible > 2 && alliesAlive > 1) return "tactical_focus_fire";
      if (distanceToTarget > 5 && selfHasRangedWeapon) return "kite_ranged";
      return "aggressive_rush";
    case "defend_location":
      return "guard_objective";
    case "flee":
    case "escape":
      return "retreat_to_heal";
    case "negotiate":
      return "negotiate_peace";
    case "protect_ally":
      return "tactical_focus_fire";
    case "retrieve_item":
      if (enemiesVisible > 0) return "lure_into_trap";
      return "patrol_pattern";
    case "ambush":
      return "ambush_wait";
    case "wait":
      return "ambush_wait";
    case "patrol":
      return "patrol_pattern";
    case "gather_info":
      return "bribe_for_info";
    case "trade":
      return "trade_fairly";
    case "complete_quest":
      return "tactical_focus_fire";
  }
  return "aggressive_rush";
}

/* ======================================================================
 * 32.3 DECISION TREE
 * ====================================================================== */

export interface PlanningContext {
  selfHpPercent: number;
  selfPosition: { x: number; y: number };
  selfHasRangedWeapon: boolean;
  selfAbilitiesAvailable: string[];
  alliesAlive: number;
  alliesWounded: number;
  enemiesVisible: number;
  enemyHpPercents: number[]; // 0-1, parallel to enemiesVisible
  distanceToTarget: number; // squares
  targetIsCaster: boolean;
  targetIsFleeing: boolean;
  hasHealingPotion: boolean;
  hasReinforcementCall: boolean;
  environmentHazards: string[]; // e.g. ["cliff", "fire"]
  currentRound: number;
  worldSeconds: number;
}

export interface DecisionOption {
  action: string; // e.g. "attack", "move_closer", "retreat", "cast_spell:fireball"
  expectedUtility: number; // -100 to +100
  riskScore: number; // 0-100
  prerequisitesMet: boolean;
}

export function generateDecisionOptions(strategy: Strategy, ctx: PlanningContext): DecisionOption[] {
  const options: DecisionOption[] = [];
  const lowHp = ctx.selfHpPercent < 30;
  const outnumbered = ctx.enemiesVisible > ctx.alliesAlive + 1;

  // Common options
  options.push({
    action: "attack_nearest",
    expectedUtility: 50 - (lowHp ? 20 : 0) - (outnumbered ? 10 : 0),
    riskScore: lowHp ? 60 : 30,
    prerequisitesMet: ctx.enemiesVisible > 0,
  });
  options.push({
    action: "move_closer",
    expectedUtility: ctx.distanceToTarget > 1 ? 40 : 0,
    riskScore: 20,
    prerequisitesMet: ctx.distanceToTarget > 1,
  });
  options.push({
    action: "retreat",
    expectedUtility: lowHp ? 60 : 10,
    riskScore: 5,
    prerequisitesMet: true,
  });
  if (ctx.selfHasRangedWeapon) {
    options.push({
      action: "ranged_attack",
      expectedUtility: 45 - (lowHp ? 10 : 0),
      riskScore: 15,
      prerequisitesMet: ctx.enemiesVisible > 0,
    });
  }
  if (ctx.hasHealingPotion && lowHp) {
    options.push({
      action: "use_healing_potion",
      expectedUtility: 70,
      riskScore: 10,
      prerequisitesMet: true,
    });
  }
  // Strategy-specific options
  switch (strategy) {
    case "tactical_focus_fire":
      options.push({
        action: "focus_weakest_enemy",
        expectedUtility: 65,
        riskScore: 25,
        prerequisitesMet: ctx.enemiesVisible > 1,
      });
      break;
    case "kite_ranged":
      options.push({
        action: "step_back_and_shoot",
        expectedUtility: 55,
        riskScore: 15,
        prerequisitesMet: ctx.selfHasRangedWeapon,
      });
      break;
    case "lure_into_trap":
      options.push({
        action: "lure_to_hazard",
        expectedUtility: ctx.environmentHazards.length > 0 ? 70 : 0,
        riskScore: 30,
        prerequisitesMet: ctx.environmentHazards.length > 0,
      });
      break;
    case "retreat_to_heal":
      options.push({
        action: "flee_to_safe_spot",
        expectedUtility: 75,
        riskScore: 5,
        prerequisitesMet: true,
      });
      break;
    case "negotiate_peace":
      options.push({
        action: "offer_surrender",
        expectedUtility: 50,
        riskScore: 20,
        prerequisitesMet: true,
      });
      break;
    case "call_for_reinforcements":
      options.push({
        action: "blow_horn",
        expectedUtility: 80,
        riskScore: 40,
        prerequisitesMet: ctx.hasReinforcementCall,
      });
      break;
    case "guard_objective":
      options.push({
        action: "hold_position",
        expectedUtility: 60,
        riskScore: 35,
        prerequisitesMet: true,
      });
      break;
    case "ambush_wait":
      options.push({
        action: "stay_hidden",
        expectedUtility: 50,
        riskScore: 10,
        prerequisitesMet: true,
      });
      break;
  }
  // Filter by prerequisites
  return options.filter((o) => o.prerequisitesMet);
}

/* ======================================================================
 * 32.4 PREDICTION
 * ====================================================================== */

export interface PredictedOutcome {
  action: string;
  expectedDamageDealt: number;
  expectedDamageTaken: number;
  expectedKill: boolean;
  expectedSelfDeath: boolean;
  confidence: number; // 0-1
}

export function predictOutcome(action: string, ctx: PlanningContext): PredictedOutcome {
  // Simple heuristic-based prediction (a real planner would use MCTS or sim)
  switch (action) {
    case "attack_nearest":
      return {
        action,
        expectedDamageDealt: 8,
        expectedDamageTaken: 5,
        expectedKill: ctx.enemyHpPercents[0] < 0.2,
        expectedSelfDeath: ctx.selfHpPercent < 10 && ctx.enemiesVisible > 1,
        confidence: 0.6,
      };
    case "ranged_attack":
      return {
        action,
        expectedDamageDealt: 6,
        expectedDamageTaken: 0,
        expectedKill: ctx.enemyHpPercents[0] < 0.15,
        expectedSelfDeath: false,
        confidence: 0.7,
      };
    case "use_healing_potion":
      return {
        action,
        expectedDamageDealt: 0,
        expectedDamageTaken: 8, // opportunity attack risk
        expectedKill: false,
        expectedSelfDeath: ctx.enemiesVisible > 0 && ctx.selfHpPercent < 15,
        confidence: 0.85,
      };
    case "retreat":
    case "flee_to_safe_spot":
      return {
        action,
        expectedDamageDealt: 0,
        expectedDamageTaken: 5, // opportunity attack
        expectedKill: false,
        expectedSelfDeath: false,
        confidence: 0.7,
      };
    case "focus_weakest_enemy":
      return {
        action,
        expectedDamageDealt: 12,
        expectedDamageTaken: 6,
        expectedKill: ctx.enemyHpPercents.some((h) => h < 0.3),
        expectedSelfDeath: ctx.selfHpPercent < 20,
        confidence: 0.65,
      };
    case "step_back_and_shoot":
      return {
        action,
        expectedDamageDealt: 7,
        expectedDamageTaken: 0,
        expectedKill: false,
        expectedSelfDeath: false,
        confidence: 0.75,
      };
    case "hold_position":
    case "stay_hidden":
      return {
        action,
        expectedDamageDealt: 0,
        expectedDamageTaken: 0,
        expectedKill: false,
        expectedSelfDeath: false,
        confidence: 0.9,
      };
    case "offer_surrender":
      return {
        action,
        expectedDamageDealt: 0,
        expectedDamageTaken: 0,
        expectedKill: false,
        expectedSelfDeath: false,
        confidence: 0.4, // uncertain — depends on enemy reaction
      };
    case "blow_horn":
      return {
        action,
        expectedDamageDealt: 0,
        expectedDamageTaken: 10,
        expectedKill: false,
        expectedSelfDeath: ctx.selfHpPercent < 30,
        confidence: 0.5,
      };
    default:
      return {
        action,
        expectedDamageDealt: 0,
        expectedDamageTaken: 0,
        expectedKill: false,
        expectedSelfDeath: false,
        confidence: 0.3,
      };
  }
}

/* ======================================================================
 * 32.5 ACTION SELECTION
 * ====================================================================== */

export interface SelectedAction {
  action: string;
  reasoning: string;
  expectedUtility: number;
  riskScore: number;
  predictedOutcome?: PredictedOutcome;
  targetId?: string;
  position?: { x: number; y: number };
}

export function selectBestAction(
  options: DecisionOption[],
  ctx: PlanningContext,
  riskTolerance: number = 50,
): SelectedAction | null {
  if (options.length === 0) return null;
  // Score: utility - risk * (1 - riskTolerance/100)
  const scored = options.map((o) => {
    const prediction = predictOutcome(o.action, ctx);
    // Penalize actions likely to kill self
    const selfDeathPenalty = prediction.expectedSelfDeath ? 100 : 0;
    const score = o.expectedUtility - o.riskScore * (1 - riskTolerance / 100) - selfDeathPenalty;
    return { option: o, prediction, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  return {
    action: best.option.action,
    reasoning: `Score ${best.score.toFixed(1)} (utility ${best.option.expectedUtility}, risk ${best.option.riskScore}, predicted selfDeath ${best.prediction.expectedSelfDeath})`,
    expectedUtility: best.option.expectedUtility,
    riskScore: best.option.riskScore,
    predictedOutcome: best.prediction,
  };
}

/* ======================================================================
 * 32.6 REPLANNING
 * ====================================================================== */

export interface PlanRevision {
  revised: boolean;
  reason?: string;
  newStrategy?: Strategy;
  newAction?: string;
}

export function shouldReplan(
  currentGoal: Goal,
  currentStrategy: Strategy,
  ctx: PlanningContext,
  lastCtx?: PlanningContext,
): PlanRevision {
  if (!lastCtx) return { revised: false };
  // Self HP dropped significantly
  if (ctx.selfHpPercent < lastCtx.selfHpPercent - 20) {
    if (ctx.selfHpPercent < 30) {
      return { revised: true, reason: "HP dropped below 30%", newStrategy: "retreat_to_heal" };
    }
  }
  // Ally died
  if (ctx.alliesAlive < lastCtx.alliesAlive) {
    return { revised: true, reason: "Ally died", newStrategy: ctx.alliesAlive === 0 ? "defensive_hold" : "tactical_focus_fire" };
  }
  // Goal target died
  if (currentGoal.targetId && ctx.enemiesVisible === 0) {
    return { revised: true, reason: "Target eliminated", newAction: "patrol" };
  }
  // Outnumbered suddenly
  if (ctx.enemiesVisible > lastCtx.enemiesVisible + 1) {
    return { revised: true, reason: "Enemies reinforced", newStrategy: ctx.alliesAlive > 0 ? "tactical_focus_fire" : "retreat_to_heal" };
  }
  return { revised: false };
}

/* ======================================================================
 * 32.7 MULTI-AGENT COORDINATION
 * ====================================================================== */

export interface AgentPlan {
  agentId: string;
  goal: Goal;
  strategy: Strategy;
  selectedAction: SelectedAction | null;
  lastContext?: PlanningContext;
}

export interface CoordinatedPlan {
  agents: AgentPlan[];
  sharedStrategy: Strategy;
  focusFireTargetId?: string;
  formation?: "line" | "circle" | "scatter";
}

export function coordinateAgents(agents: AgentPlan[], ctx: PlanningContext): CoordinatedPlan {
  // Pick shared strategy: majority vote
  const strategyCounts = new Map<Strategy, number>();
  for (const a of agents) {
    strategyCounts.set(a.strategy, (strategyCounts.get(a.strategy) || 0) + 1);
  }
  let sharedStrategy: Strategy = "aggressive_rush" as Strategy;
  let maxCount = 0;
  strategyCounts.forEach((c, s: Strategy) => {
    if (c > maxCount) {
      maxCount = c;
      sharedStrategy = s;
    }
  });
  // Pick focus-fire target: lowest HP enemy
  let focusFireTargetId: string | undefined;
  // (In a real implementation, we'd pass enemy IDs alongside HPs)
  // Pick formation based on strategy
  let formation: "line" | "circle" | "scatter" = "line";
  if (sharedStrategy === "retreat_to_heal") formation = "scatter";
  if (sharedStrategy === "defensive_hold") formation = "circle";
  return {
    agents,
    sharedStrategy,
    focusFireTargetId,
    formation,
  };
}

/* ======================================================================
 * 32.8 RISK ASSESSMENT
 * ====================================================================== */

export interface RiskAssessment {
  overallRisk: number; // 0-100
  threatLevel: "trivial" | "easy" | "moderate" | "hard" | "deadly" | "lethal";
  recommendation: Strategy;
  reasons: string[];
}

export function assessRisk(ctx: PlanningContext): RiskAssessment {
  let risk = 0;
  const reasons: string[] = [];
  // Enemy count
  if (ctx.enemiesVisible >= 4) { risk += 30; reasons.push("จำนวนศัตรูมาก"); }
  else if (ctx.enemiesVisible >= 2) { risk += 15; reasons.push("ศัตรู 2 ตัว"); }
  // Self HP
  if (ctx.selfHpPercent < 30) { risk += 30; reasons.push("HP ต่ำ"); }
  else if (ctx.selfHpPercent < 50) { risk += 15; reasons.push("HP ครึ่งหนึ่ง"); }
  // Outnumbered
  if (ctx.enemiesVisible > ctx.alliesAlive + 1) { risk += 20; reasons.push("ถูกล้อม"); }
  // No allies
  if (ctx.alliesAlive === 0 && ctx.enemiesVisible > 0) { risk += 10; reasons.push("ไม่มีพันธมิตร"); }
  // Allies wounded
  if (ctx.alliesWounded > 0) { risk += 5; reasons.push("พันธมิตรบาดเจ็บ"); }
  risk = Math.min(100, risk);

  let threatLevel: RiskAssessment["threatLevel"] = "trivial";
  let recommendation: Strategy = "aggressive_rush";
  if (risk < 15) { threatLevel = "trivial"; recommendation = "aggressive_rush"; }
  else if (risk < 35) { threatLevel = "easy"; recommendation = "aggressive_rush"; }
  else if (risk < 55) { threatLevel = "moderate"; recommendation = "tactical_focus_fire"; }
  else if (risk < 75) { threatLevel = "hard"; recommendation = "defensive_hold"; }
  else if (risk < 90) { threatLevel = "deadly"; recommendation = "retreat_to_heal"; }
  else { threatLevel = "lethal"; recommendation = "retreat_to_heal"; }

  return { overallRisk: risk, threatLevel, recommendation, reasons };
}

/* ======================================================================
 * FULL PLAN ASSEMBLY
 * ====================================================================== */

export interface FullPlan {
  goal: Goal;
  strategy: Strategy;
  selectedAction: SelectedAction | null;
  risk: RiskAssessment;
  decisionOptions: DecisionOption[];
  context: PlanningContext;
  revision?: PlanRevision;
}

export function generateFullPlan(
  goals: Goal[],
  ctx: PlanningContext,
  riskTolerance = 50,
  lastCtx?: PlanningContext,
): FullPlan | null {
  const goal = selectHighestPriorityGoal(goals);
  if (!goal) return null;
  const strategy = selectStrategy(goal, ctx);
  const revision = lastCtx ? shouldReplan(goal, strategy, ctx, lastCtx) : { revised: false };
  const effectiveStrategy = revision.newStrategy || strategy;
  const options = generateDecisionOptions(effectiveStrategy, ctx);
  const selected = selectBestAction(options, ctx, riskTolerance);
  const risk = assessRisk(ctx);
  return {
    goal,
    strategy: effectiveStrategy,
    selectedAction: selected,
    risk,
    decisionOptions: options,
    context: ctx,
    revision,
  };
}
