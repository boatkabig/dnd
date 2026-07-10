/**
 * Domain 27: Rule Engine
 *
 * ระบบกลางที่ตัดสินว่ากฎไหนใช้ และคำนวณผลลัพธ์
 *
 * Sub-systems:
 *  27.1 Rule Validation        — can-do? requirements & restrictions
 *  27.2 Rule Resolution        — Input → Check Rule → Calculate → Apply Result
 *  27.3 Modifier Calculation   — stack ability/skill/item/effect/condition modifiers
 *  27.4 Conflict Resolution    — priority / override / specific-rule-wins
 *
 * This is the CENTRAL adjudicator. Other domains (combat, magic, skills) DELEGATE
 * to this engine; they should not compute their own modifiers directly.
 *
 * Architecture (per user advice #1, #6):
 *   Combat ─┐
 *   Magic  ─┼──▶ RuleEngine ──▶ EffectEngine ──▶ applyResult()
 *   Skills ─┘
 */

/* ======================================================================
 * 27.1 RULE VALIDATION
 * ====================================================================== */

export type RuleCategory =
  | "action"
  | "spell"
  | "movement"
  | "attack"
  | "skill"
  | "save"
  | "rest"
  | "item_use"
  | "feature_use";

export interface RuleRequirement {
  type: "ability_score" | "level" | "proficiency" | "resource" | "condition" | "equipped" | "feat" | "custom";
  id: string; // e.g. "str", "stealth", "spell_slot_3"
  min?: number;
  equals?: string | number | boolean;
}

export interface RuleRestriction {
  type: "condition" | "status" | "location" | "cooldown" | "per_turn" | "per_round" | "per_day";
  id: string;
  value?: number;
}

export interface RuleDefinition {
  id: string;
  category: RuleCategory;
  description: string;
  requirements?: RuleRequirement[];
  restrictions?: RuleRestriction[];
  // Output:
  baseDC?: number;
  baseModifier?: number;
  priority?: number; // higher = applied later
  overrideIds?: string[]; // rules this overrides
}

export interface ValidationContext {
  characterId: string;
  abilityScores: Record<string, number>;
  proficiencyIds: Set<string>;
  resources: Record<string, number>;
  conditions: string[];
  equipped: string[];
  feats: string[];
  flags: Record<string, number | string | boolean>;
  actionsThisTurn: number;
  actionsThisRound: number;
  actionsThisDay: Record<string, number>;
}

export interface ValidationResult {
  allowed: boolean;
  failedReasons: string[];
  metRequirements: string[];
}

export function validateRule(rule: RuleDefinition, ctx: ValidationContext): ValidationResult {
  const failedReasons: string[] = [];
  const metRequirements: string[] = [];

  if (rule.requirements) {
    for (const req of rule.requirements) {
      const ok = checkRequirement(req, ctx);
      if (ok) metRequirements.push(req.id);
      else failedReasons.push(`ต้องการ ${req.type}:${req.id}`);
    }
  }

  if (rule.restrictions) {
    for (const res of rule.restrictions) {
      const blocked = checkRestriction(res, ctx);
      if (blocked) {
        failedReasons.push(`ถูกจำกัดโดย ${res.type}:${res.id}`);
      }
    }
  }

  return {
    allowed: failedReasons.length === 0,
    failedReasons,
    metRequirements,
  };
}

function checkRequirement(req: RuleRequirement, ctx: ValidationContext): boolean {
  switch (req.type) {
    case "ability_score":
      return ctx.abilityScores[req.id] >= (req.min ?? 0);
    case "level":
      return ctx.flags[req.id] !== undefined && (ctx.flags[req.id] as number) >= (req.min ?? 0);
    case "proficiency":
      return ctx.proficiencyIds.has(req.id);
    case "resource":
      return (ctx.resources[req.id] ?? 0) >= (req.min ?? 0);
    case "condition":
      return ctx.conditions.includes(req.id);
    case "equipped":
      return ctx.equipped.includes(req.id);
    case "feat":
      return ctx.feats.includes(req.id);
    case "custom":
      return ctx.flags[req.id] === req.equals;
  }
}

function checkRestriction(res: RuleRestriction, ctx: ValidationContext): boolean {
  switch (res.type) {
    case "condition":
      return ctx.conditions.includes(res.id);
    case "status":
      return ctx.flags[`status:${res.id}`] === true;
    case "location":
      return ctx.flags["location"] !== res.id;
    case "cooldown":
      return (ctx.flags[`cooldown:${res.id}`] as number ?? 0) > 0;
    case "per_turn":
      return ctx.actionsThisTurn >= (res.value ?? 1);
    case "per_round":
      return ctx.actionsThisRound >= (res.value ?? 1);
    case "per_day":
      return (ctx.actionsThisDay[res.id] ?? 0) >= (res.value ?? 1);
  }
}

/* ======================================================================
 * 27.2 RULE RESOLUTION (Input → Check Rule → Calculate → Apply Result)
 * ====================================================================== */

export interface ResolutionInput {
  ruleId: string;
  characterId: string;
  baseRoll: number; // d20 result
  modifiers: ModifierSource[];
  targetDC?: number;
  advantage: boolean;
  disadvantage: boolean;
  context: ValidationContext;
}

export interface ModifierSource {
  id: string;
  type: "ability" | "skill" | "item" | "effect" | "condition" | "feature" | "feat" | "circumstance";
  name: string;
  value: number; // can be negative
  priority?: number;
  // For override semantics:
  overrideType?: "replace_base" | "set_min" | "set_max" | "ignore_other";
  ignoreIds?: string[]; // when overrideType = "ignore_other"
}

export interface ResolutionResult {
  ruleId: string;
  allowed: boolean;
  total: number;
  baseRoll: number;
  modifiersApplied: ModifierSource[];
  modifiersIgnored: ModifierSource[];
  success: boolean;
  margin: number;
  note: string;
}

export function resolveRule(
  rule: RuleDefinition,
  input: Omit<ResolutionInput, "ruleId">,
): ResolutionResult {
  // 1. Validate
  const validation = validateRule(rule, input.context);
  if (!validation.allowed) {
    return {
      ruleId: rule.id,
      allowed: false,
      total: 0,
      baseRoll: input.baseRoll,
      modifiersApplied: [],
      modifiersIgnored: input.modifiers,
      success: false,
      margin: 0,
      note: validation.failedReasons.join("; "),
    };
  }

  // 2. Resolve conflicts & apply modifiers
  const { applied, ignored } = resolveModifierConflicts(input.modifiers);
  const modifierTotal = applied.reduce((sum, m) => sum + m.value, 0);

  // 3. Handle advantage/disadvantage on base roll (already rolled; caller handles adv/disadv)
  let effectiveRoll = input.baseRoll;
  // (Advantage resolution typically done before calling this; this just uses given roll)

  // 4. Calculate total
  const total = effectiveRoll + modifierTotal + (rule.baseModifier ?? 0);
  const dc = input.targetDC ?? rule.baseDC ?? 0;
  const success = total >= dc;
  const margin = total - dc;

  return {
    ruleId: rule.id,
    allowed: true,
    total,
    baseRoll: effectiveRoll,
    modifiersApplied: applied,
    modifiersIgnored: ignored,
    success,
    margin,
    note: success
      ? `สำเร็จ ${total} ≥ ${dc} (margin +${margin})`
      : `ล้มเหลว ${total} < ${dc} (margin ${margin})`,
  };
}

/* ======================================================================
 * 27.3 MODIFIER CALCULATION
 * ====================================================================== */

export interface ModifierStack {
  sources: ModifierSource[];
  total: number;
  breakdown: Array<{ source: string; value: number }>;
}

export function buildModifierStack(sources: ModifierSource[]): ModifierStack {
  const { applied } = resolveModifierConflicts(sources);
  return {
    sources: applied,
    total: applied.reduce((s, m) => s + m.value, 0),
    breakdown: applied.map((m) => ({ source: m.name, value: m.value })),
  };
}

/* ======================================================================
 * 27.4 CONFLICT RESOLUTION
 * ====================================================================== */

/**
 * Resolves conflicting modifiers. Rules:
 *  1. Higher priority wins (default priority 0)
 *  2. "replace_base" overrides the base modifier (only the highest-priority one applies)
 *  3. "set_min" / "set_max" forces floor/ceiling
 *  4. "ignore_other" suppresses listed modifier ids
 *  5. Same-type modifiers stack unless "replace_base" present
 */
export function resolveModifierConflicts(sources: ModifierSource[]): {
  applied: ModifierSource[];
  ignored: ModifierSource[];
} {
  const ignored = new Set<string>();
  // First pass: collect "ignore_other" semantics
  for (const s of sources) {
    if (s.overrideType === "ignore_other" && s.ignoreIds) {
      for (const id of s.ignoreIds) ignored.add(id);
    }
  }

  const filtered = sources.filter((s) => !ignored.has(s.id));

  // Find any "replace_base" overrides — keep only the highest-priority one
  const replaceBaseCandidates = filtered
    .filter((s) => s.overrideType === "replace_base")
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  let applied: ModifierSource[];
  if (replaceBaseCandidates.length > 0) {
    const winner = replaceBaseCandidates[0];
    // Keep non-replace_base modifiers + the winning replace_base
    applied = filtered.filter((s) => s.overrideType !== "replace_base" || s.id === winner.id);
  } else {
    applied = filtered;
  }

  // Apply set_min / set_max
  for (const s of applied) {
    if (s.overrideType === "set_min") {
      // value is the minimum threshold — but other modifiers may need adjustment
      // simple approach: if total < s.value, add a delta
      const total = applied.reduce((sum, m) => sum + m.value, 0);
      if (total < s.value) {
        // Bump this modifier to make total = s.value
        s.value += s.value - total;
      }
    } else if (s.overrideType === "set_max") {
      const total = applied.reduce((sum, m) => sum + m.value, 0);
      if (total > s.value) {
        s.value -= total - s.value;
      }
    }
  }

  const ignoredList = sources.filter((s) => !applied.find((a) => a.id === s.id));
  return { applied, ignored: ignoredList };
}

/* ======================================================================
 * RULE REGISTRY (data-driven)
 * ====================================================================== */

export class RuleRegistry {
  private rules = new Map<string, RuleDefinition>();

  register(rule: RuleDefinition): void {
    this.rules.set(rule.id, rule);
  }

  get(ruleId: string): RuleDefinition | undefined {
    return this.rules.get(ruleId);
  }

  listByCategory(category: RuleCategory): RuleDefinition[] {
    return Array.from(this.rules.values()).filter((r) => r.category === category);
  }

  resolve(ruleId: string, input: Omit<ResolutionInput, "ruleId">): ResolutionResult {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return {
        ruleId,
        allowed: false,
        total: 0,
        baseRoll: input.baseRoll,
        modifiersApplied: [],
        modifiersIgnored: input.modifiers,
        success: false,
        margin: 0,
        note: `ไม่พบกฎ ${ruleId}`,
      };
    }
    return resolveRule(rule, input);
  }
}

/* ======================================================================
 * COMMON RULE DEFINITIONS
 * ====================================================================== */

export const COMMON_RULES: RuleDefinition[] = [
  {
    id: "attack_melee",
    category: "attack",
    description: "โจมตีระยะประชิด: d20 + STR/DEX + Proficiency",
    baseModifier: 0,
    priority: 10,
  },
  {
    id: "attack_ranged",
    category: "attack",
    description: "โจมตีระยะไกล: d20 + DEX + Proficiency",
    baseModifier: 0,
    priority: 10,
    restrictions: [
      { type: "condition", id: "restrained" },
      { type: "condition", id: "paralyzed" },
    ],
  },
  {
    id: "cast_spell",
    category: "spell",
    description: "ร่ายเวท: ต้องมี Spell Slot และไม่ Silenced",
    requirements: [
      { type: "resource", id: "spell_slot", min: 1 },
    ],
    restrictions: [
      { type: "condition", id: "silenced" },
      { type: "condition", id: "incapacitated" },
    ],
    priority: 10,
  },
  {
    id: "dash",
    category: "action",
    description: "Dash: ได้ Movement เพิ่มเท่าตัว (ใช้ 1 Action)",
    restrictions: [
      { type: "per_turn", id: "dash", value: 1 },
    ],
    priority: 5,
  },
  {
    id: "disengage",
    category: "action",
    description: "Disengage: ไม่ก่อ Opportunity Attack ในเทิร์นนี้",
    restrictions: [
      { type: "per_turn", id: "disengage", value: 1 },
    ],
    priority: 5,
  },
  {
    id: "hide",
    category: "action",
    description: "Hide: Stealth check vs Passive Perception ของศัตรู",
    requirements: [
      { type: "proficiency", id: "stealth" },
    ],
    restrictions: [
      { type: "condition", id: "visible_to_enemy" },
    ],
    priority: 5,
  },
];
