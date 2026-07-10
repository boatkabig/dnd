/**
 * DM Response Schema (Domain: AI DM Integrity — Phase 1)
 *
 * Zod schema สำหรับ validate JSON ที่ DM (LLM) ตอบกลับมา
 * ก่อนที่ engine จะ apply state changes
 *
 * หลักการ:
 *  - Engine ไม่ trust LLM — ทุก field ต้อง validate
 *  - Delta caps ป้องกัน LLM ส่งเลขมั่ว ๆ (เช่น hp_delta: -9999 หรือ xp_award: 999999)
 *  - Invalid fields ถูก drop เงียบ ๆ + log warning (ไม่ crash เกม)
 *  - Structure validated ก่อน, ค่อย apply semantic rules
 */

import { z } from "zod";

/* ======================================================================
 * CONDITIONS — must match gameData.ts CONDITIONS_TH
 * ====================================================================== */

export const VALID_CONDITION_IDS = [
  "blinded", "charmed", "deafened", "frightened", "grappled",
  "incapacitated", "invisible", "paralyzed", "petrified", "poisoned",
  "prone", "restrained", "stunned", "unconscious", "exhaustion",
] as const;

export const ConditionIdSchema = z.enum(VALID_CONDITION_IDS);

/* ======================================================================
 * SCENE TYPES
 * ====================================================================== */

export const SceneTypeSchema = z.enum([
  "combat", "social", "exploration", "puzzle", "rest", "revelation",
]).catch("exploration");

/* ======================================================================
 * WEATHER / ENVIRONMENT
 * ====================================================================== */

export const WeatherSchema = z.enum([
  "clear", "rain", "fog", "storm", "snow",
]).catch("clear");

export const EnvironmentSchema = z.enum([
  "normal", "darkness", "fog", "magical_darkness",
]).catch("normal");

/* ======================================================================
 * SKILL CHECK REQUEST
 * ====================================================================== */

export const SkillCheckSchema = z.object({
  type: z.literal("check"),
  skill: z.string().min(1),  // validated against SKILLS at apply-time (circular dep avoidance)
  dc: z.number().int().min(1).max(40),
  advantage: z.enum(["none", "advantage", "disadvantage"]).catch("none"),
});

export const SavingThrowSchema = z.object({
  type: z.literal("save"),
  ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
  dc: z.number().int().min(1).max(40),
  on_fail_damage: z.string().optional(),  // dice formula like "2d6"
  half_on_success: z.boolean().optional(),
});

export const RequiresSchema = z.discriminatedUnion("type", [
  SkillCheckSchema,
  SavingThrowSchema,
]);

/* ======================================================================
 * COMBAT
 * ====================================================================== */

export const StartCombatSchema = z.object({
  monsters: z.array(z.string().min(1)).min(1).max(6),
  surprise: z.boolean().optional().default(false),
});

/* ======================================================================
 * WORLD MAP / DUNGEON
 * ====================================================================== */

export const WorldMapLocationSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/, "id must be snake_case lowercase").min(1),
  name: z.string().min(1),
  type: z.enum(["town", "building", "room", "dungeon", "wilderness", "place"]).catch("place"),
  dir: z.enum(["n", "s", "e", "w", "ne", "nw", "se", "sw"]).optional(),
  from: z.string().nullable().optional(),
  description: z.string().optional(),
});

export const MapUpdateSchema = z.object({
  add_location: z.object({
    id: z.string().regex(/^[a-z0-9_]+$/).min(1),
    name: z.string().min(1),
    type: z.enum(["town", "building", "room", "dungeon", "wilderness", "place"]).catch("place"),
    dir: z.enum(["n", "s", "e", "w", "ne", "nw", "se", "sw"]).optional(),
    from: z.string().nullable().optional(),
  }).optional(),
  move_to: z.string().optional(),
  connect: z.tuple([z.string(), z.string()]).optional(),
});

export const DungeonEnterSchema = z.object({
  // Either full blueprint OR short form { theme, id, name, hook?, antagonist? }
  theme: z.string().optional(),
  id: z.string().regex(/^[a-z0-9_]+$/).min(1).optional(),
  name: z.string().min(1).optional(),
  hook: z.string().optional(),
  antagonist: z.string().optional(),
  // Full blueprint fields (optional — if present, used directly)
  entranceRoomId: z.string().optional(),
  rooms: z.array(z.any()).optional(),
  connections: z.array(z.any()).optional(),
  bossRoomId: z.string().optional(),
  recommendedLevel: z.number().int().min(1).max(20).optional(),
});

export const DungeonRoomMoveSchema = z.object({
  room_id: z.string().min(1),
});

/* ======================================================================
 * BUFFS / DEBUFFS
 * ====================================================================== */

export const BuffSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(["buff", "debuff"]),  // strict — no .catch() (invalid type should fail)
  duration: z.number().int().min(-1).max(1000),  // -1 = until long rest, 0 = instant
  source: z.string().optional().default("unknown"),
  effect_desc: z.string().optional().default(""),
});

/* ======================================================================
 * UPDATES — the main state-mutation payload (with delta caps)
 * ====================================================================== */

/**
 * Delta caps — prevent LLM from sending absurd values.
 * Tuned for solo play (1 PC). These are PER-RESPONSE caps, not per-turn.
 *
 * Rationale:
 *  - hp_delta: -200 to +200 (max HP at Lv20 ~ 200; one-shot kill = -200)
 *  - gold_delta: -10000 to +10000 (mid-tier hoard ~ 5000gp)
 *  - xp_award: 0 to +5000 (high-tier single encounter ~ 4000xp)
 *  - temp_hp: 0 to +100 (Heroism, Aid, etc.)
 *  - exhaustion_delta: -6 to +6 (death at 6)
 *  - time_delta: 0 to +168 (1 week max per response)
 */
export const HP_DELTA_CAP = 200;
export const GOLD_DELTA_CAP = 10000;
export const XP_AWARD_CAP = 5000;
export const TEMP_HP_CAP = 100;
export const EXHAUSTION_DELTA_CAP = 6;
export const TIME_DELTA_CAP = 168; // 1 week

export const UpdatesSchema = z.object({
  // HP / gold / XP — capped
  hp_delta: z.number().int().min(-HP_DELTA_CAP).max(HP_DELTA_CAP).optional(),
  gold_delta: z.number().int().min(-GOLD_DELTA_CAP).max(GOLD_DELTA_CAP).optional(),
  xp_award: z.number().int().min(0).max(XP_AWARD_CAP).optional(),
  temp_hp: z.number().int().min(0).max(TEMP_HP_CAP).optional(),

  // Items (strings — validated at apply-time against known item lists)
  items_add: z.array(z.string().min(1).max(120)).max(20).optional(),
  items_use: z.array(z.string().min(1).max(120)).max(10).optional(),
  items_remove: z.array(z.string().min(1).max(120)).max(10).optional(),

  // Conditions — must be valid condition IDs
  conditions_add: z.array(ConditionIdSchema).max(10).optional(),
  conditions_remove: z.array(ConditionIdSchema).max(10).optional(),

  // Buffs
  buffs_add: z.array(BuffSchema.or(z.string().min(1).max(60))).max(5).optional(),
  buffs_remove: z.array(z.string().min(1).max(60)).max(5).optional(),

  // Quests (lightweight validation — full quest shape validated at apply)
  quest_add: z.any().optional(),
  quest_update: z.any().optional(),

  // Loot
  loot_drop: z.array(z.string().min(1).max(120)).max(20).optional(),

  // NPC / faction
  npc_attitude: z.object({
    npc_id: z.string().min(1),
    attitude: z.enum(["friendly", "neutral", "hostile", "helpful", "indifferent"]),
    reason: z.string().optional(),
  }).optional(),
  faction_reputation: z.object({
    faction_id: z.string().min(1),
    delta: z.number().int().min(-100).max(100),
  }).optional(),

  // Environment
  weather: WeatherSchema.optional(),
  environment: EnvironmentSchema.optional(),
  scene_type: SceneTypeSchema.optional(),

  // Exhaustion
  exhaustion_delta: z.number().int().min(-EXHAUSTION_DELTA_CAP).max(EXHAUSTION_DELTA_CAP).optional(),

  // Rest trigger
  rest_trigger: z.enum(["short", "long"]).optional(),

  // Level up choice
  level_up_choice: z.boolean().optional(),

  // Time
  time_delta: z.number().int().min(0).max(TIME_DELTA_CAP).optional(),
});

/* ======================================================================
 * MAIN DM RESPONSE SCHEMA
 * ====================================================================== */

export const DMResponseSchema = z.object({
  // Required: narration
  narration: z.string().min(1).max(4000),

  // Optional fields
  scene: z.string().max(120).nullable().optional(),

  // Either requires OR start_combat (not both)
  requires: RequiresSchema.nullable().optional(),
  start_combat: z.union([StartCombatSchema, z.literal(true)]).nullable().optional(),

  // World / map / dungeon
  world_map: z.array(WorldMapLocationSchema).max(20).nullable().optional(),
  map_update: MapUpdateSchema.nullable().optional(),
  dungeon_enter: DungeonEnterSchema.nullable().optional(),
  dungeon_room_move: DungeonRoomMoveSchema.nullable().optional(),
  dungeon_exit: z.union([z.boolean(), z.string()]).nullable().optional(),

  // Updates — the main state-mutation vector
  updates: UpdatesSchema.nullable().optional(),
});

/* ======================================================================
 * VALIDATION HELPERS
 * ====================================================================== */

export type DMResponse = z.infer<typeof DMResponseSchema>;
export type ValidUpdates = z.infer<typeof UpdatesSchema>;

export interface ValidationResult {
  success: boolean;
  data?: DMResponse;
  errors: string[];
  warnings: string[];
  /** Original raw input (for debugging) */
  raw: unknown;
}

/**
 * Validate a raw DM response (already JSON-parsed).
 * On failure, returns a "safe fallback" response with just narration (if available)
 * so the game doesn't crash — invalid fields are dropped.
 */
export function validateDMResponse(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Try strict parse first
  const result = DMResponseSchema.safeParse(raw);

  if (result.success) {
    // Additional semantic checks
    const data = result.data;

    // Cannot have both requires AND start_combat
    if (data.requires && data.start_combat) {
      warnings.push("DM sent both 'requires' and 'start_combat' — dropping 'requires' (combat takes priority)");
      data.requires = null;
    }

    // Cannot have world_map AND map_update in same response (world_map is for first response only)
    if (data.world_map && data.map_update) {
      warnings.push("DM sent both 'world_map' and 'map_update' — keeping 'world_map', dropping 'map_update'");
      data.map_update = null;
    }

    return { success: true, data, errors, warnings, raw };
  }

  // Strict parse failed — try lenient mode (extract what we can)
  // Log all zod issues
  for (const issue of result.error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    errors.push(`${path}: ${issue.message}`);
  }

  // Lenient fallback: try to extract just narration + drop everything else
  const rawObj = (typeof raw === "object" && raw !== null) ? raw as Record<string, unknown> : {};
  const narration = typeof rawObj.narration === "string" ? rawObj.narration.slice(0, 4000) : "⚠️ DM ตอบกลับไม่ถูกต้อง — ลองพิมพ์ action ใหม่";

  // Try to salvage updates if it's an object (even if not perfectly shaped)
  let salvagedUpdates: ValidUpdates | null = null;
  if (rawObj.updates && typeof rawObj.updates === "object") {
    const updatesParse = UpdatesSchema.safeParse(rawObj.updates);
    if (updatesParse.success) {
      salvagedUpdates = updatesParse.data;
    } else {
      // Drop updates entirely — too risky to apply partial
      warnings.push("Updates payload failed validation — dropping all state changes");
    }
  }

  const fallback: DMResponse = {
    narration,
    updates: salvagedUpdates,
    scene: typeof rawObj.scene === "string" ? rawObj.scene.slice(0, 120) : null,
  };

  return { success: false, data: fallback, errors, warnings, raw };
}

/* ======================================================================
 * DELTA CAP EXPLANATIONS (for DM prompt)
 * ====================================================================== */

export const DELTA_CAP_DOCUMENTATION = `
Engine validates all state changes from DM. Caps per response:
- hp_delta: -200 to +200 (max HP at Lv20 ~ 200)
- gold_delta: -10000 to +10000 (mid-tier hoard)
- xp_award: 0 to +5000 (high-tier single encounter)
- temp_hp: 0 to +100
- exhaustion_delta: -6 to +6
- time_delta: 0 to +168 hours (1 week)

Conditions must be one of: ${VALID_CONDITION_IDS.join(", ")}
Invalid fields are dropped silently — game continues with valid parts only.
`;
