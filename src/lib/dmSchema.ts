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

/** Obvious LLM variants → canonical VALID_CONDITION_IDS entry. */
const CONDITION_ALIASES: Record<string, string> = {
  exhausted: "exhaustion",
  blind: "blinded",
  charm: "charmed",
  deaf: "deafened",
  fear: "frightened",
  afraid: "frightened",
  grapple: "grappled",
  incapacitate: "incapacitated",
  paralyze: "paralyzed",
  paralysis: "paralyzed",
  petrify: "petrified",
  petrification: "petrified",
  poison: "poisoned",
  restrain: "restrained",
  stun: "stunned",
};

/** Case-insensitive condition match with alias fallback; unrecognized → null. */
function normalizeConditionId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  if ((VALID_CONDITION_IDS as readonly string[]).includes(key)) return key;
  return CONDITION_ALIASES[key] ?? null;
}

/**
 * Coerce a bare object into a one-element array so DM output that omits the
 * array wrapper (common when there's exactly one item) still validates.
 * Arrays, null and undefined pass through untouched.
 */
function toArray(v: unknown): unknown {
  if (v === undefined || v === null || Array.isArray(v)) return v;
  return [v];
}

/* ======================================================================
 * COMPASS DIRECTIONS — world_map / map_update location "dir" field
 * (NOT the dungeon connection direction enum below, which also has up/down)
 * ====================================================================== */

const VALID_COMPASS_DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;

/** Full-word (and obvious punctuated) variants → canonical abbreviation. */
const COMPASS_DIR_ALIASES: Record<string, string> = {
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  northeast: "ne",
  northwest: "nw",
  southeast: "se",
  southwest: "sw",
};

/**
 * Case-insensitive compass direction normalization with alias fallback.
 * Strips spaces/dots/dashes/underscores so "north-east" / "N.E." / "north_east"
 * all resolve. Unrecognized input is passed through untouched — the enum below
 * will reject it and `.catch(...)` supplies a safe default instead of failing
 * the whole location (and thus the whole world_map array).
 */
function normalizeCompassDir(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const key = raw.trim().toLowerCase().replace(/[.\s_-]+/g, "");
  if ((VALID_COMPASS_DIRS as readonly string[]).includes(key)) return key;
  return COMPASS_DIR_ALIASES[key] ?? raw;
}

const CompassDirSchema = z.preprocess(
  normalizeCompassDir,
  z.enum(VALID_COMPASS_DIRS).catch("n"),
);

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

const VALID_ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

/** Full-word variants → canonical abbreviation, same pattern as CONDITION_ALIASES. */
const ABILITY_ALIASES: Record<string, string> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

/** Case-insensitive ability match with full-word alias fallback; unrecognized passes through untouched. */
function normalizeAbility(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const key = raw.trim().toLowerCase();
  if ((VALID_ABILITIES as readonly string[]).includes(key)) return key;
  return ABILITY_ALIASES[key] ?? raw;
}

/**
 * DM sometimes sends numeric fields as digit-strings (e.g. "13", "-5").
 * Coerce only clean integer strings to numbers before the wrapped schema
 * validates; anything else (floats, "abc", null, booleans, etc.) passes
 * through unchanged so the wrapped schema's own validation still rejects it.
 * Unlike z.coerce.number(), this never launders "", null or true into 0/1.
 */
const numStr = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v) : v), schema);

export const SkillCheckSchema = z.object({
  type: z.literal("check"),
  skill: z.string().min(1),  // validated against SKILLS at apply-time (circular dep avoidance)
  dc: numStr(z.number().int().min(1).max(40)),
  advantage: z.enum(["none", "advantage", "disadvantage"]).catch("none"),
});

export const SavingThrowSchema = z.object({
  type: z.literal("save"),
  ability: z.preprocess(normalizeAbility, z.enum(VALID_ABILITIES)),
  dc: numStr(z.number().int().min(1).max(40)),
  on_fail_damage: z.string().optional(),  // dice formula like "2d6"
  half_on_success: z.boolean().optional(),
});

export const RequiresSchema = z.discriminatedUnion("type", [
  SkillCheckSchema,
  SavingThrowSchema,
]);

const REQUIRES_TYPE_ALIASES: Record<string, string> = {
  skill_check: "check",
  abilitycheck: "check",
  ability_check: "check",
  saving_throw: "save",
  savingthrow: "save",
  save_throw: "save",
  savethrow: "save",
};

/**
 * Normalize known LLM shape-variance in `requires` BEFORE validation runs:
 *  - a single-element array is unwrapped (extra elements warn, same
 *    toArray-style leniency used for world_map / dungeon rooms).
 *  - `type` aliases ("skill_check"/"ability_check" → "check",
 *    "saving_throw"/"save_throw" → "save") and case/spacing variance folded
 *    to the canonical literal; `type` is inferred from sibling fields
 *    (`ability`/`save`/`stat` → "save", `skill`/`check` → "check") when omitted.
 *  - common alt field names folded into the canonical ones: `check` → `skill`,
 *    `save`/`stat`/`saving_throw` → `ability`.
 *  - a numeric-string `dc` ("13") coerced to a number.
 * A bare string `requires` (free-form prose) is deliberately NOT coerced —
 * unlike quest_add (where a bare title fully seeds a valid quest object), a
 * `requires` string cannot seed the REQUIRED `dc` field (min 1, no default),
 * so any object built from it would need a fabricated DC. Inventing a number
 * the DM never sent violates the "engine doesn't trust the LLM" principle, so
 * a bare string is left to the normal drop+warn path in salvageTopLevelFields
 * (dropped cleanly with a warning, never crashing).
 */
function normalizeRequiresShape(raw: unknown, warnings: string[]): unknown {
  let val = raw;
  if (Array.isArray(val)) {
    if (val.length > 1) {
      warnings.push(`requires: DM sent an array of ${val.length} — using the first, extra items ignored`);
    }
    val = val[0];
  }
  if (val === null || val === undefined || typeof val !== "object") return val;

  const obj = { ...(val as Record<string, unknown>) };

  if (typeof obj.type === "string") {
    const key = obj.type.trim().toLowerCase().replace(/[\s-]+/g, "_");
    obj.type = REQUIRES_TYPE_ALIASES[key] ?? key;
  } else if (obj.type === undefined) {
    if (obj.ability !== undefined || obj.save !== undefined || obj.stat !== undefined) obj.type = "save";
    else if (obj.skill !== undefined || obj.check !== undefined) obj.type = "check";
  }

  if (obj.type === "check" && obj.skill === undefined && typeof obj.check === "string") {
    obj.skill = obj.check;
  }
  if (obj.type === "save" && obj.ability === undefined) {
    const alt = obj.save ?? obj.stat ?? obj.saving_throw;
    if (alt !== undefined) obj.ability = alt;
  }
  if (typeof obj.dc === "string" && /^\d+$/.test(obj.dc.trim())) {
    obj.dc = parseInt(obj.dc.trim(), 10);
  }

  return obj;
}

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
  dir: CompassDirSchema.optional(),
  from: z.string().nullable().optional(),
  description: z.string().optional(),
});

export const MapUpdateSchema = z.object({
  add_location: z.object({
    id: z.string().regex(/^[a-z0-9_]+$/).min(1),
    name: z.string().min(1),
    type: z.enum(["town", "building", "room", "dungeon", "wilderness", "place"]).catch("place"),
    dir: CompassDirSchema.optional(),
    from: z.string().nullable().optional(),
  }).optional(),
  move_to: z.string().optional(),
  connect: z.tuple([z.string(), z.string()]).optional(),
});

/* ======================================================================
 * DUNGEON ROOM / CONNECTION — full-blueprint dungeon_enter payloads
 * (mirrors Room / RoomConnection shapes in src/lib/dungeon.ts)
 * ====================================================================== */

export const DungeonRoomRoleSchema = z.enum([
  "entrance", "puzzle", "setback", "climax", "reward", "transition", "secret", "empty",
]).catch("empty");

export const DungeonRoomShapeSchema = z.enum([
  "square", "rect", "round", "irregular", "corridor",
]).catch("square");

export const DungeonRoomSizeSchema = z.enum([
  "tiny", "small", "medium", "large", "huge",
]).catch("medium");

export const DungeonRoomContentSchema = z.object({
  type: z.enum([
    "monster", "trap", "treasure", "puzzle", "npc", "lore", "object",
    "secret_door", "environment", "dressing",
  ]).catch("dressing"),
  description: z.string().min(1).max(300),
  isHidden: z.boolean().optional(),
  detectionDC: numStr(z.number().int().min(1).max(40).optional()),
  interactionNote: z.string().max(300).optional(),
});

export const DungeonStagedEncounterSchema = z.object({
  monsterIds: z.array(z.string().min(1)).max(6).default([]),
  surprise: z.boolean().optional(),
  isBoss: z.boolean().optional(),
  lairActions: z.array(z.string()).optional(),
});

export const DungeonStagedTrapSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  detectionDC: numStr(z.number().int().min(1).max(40)),
  disableDC: numStr(z.number().int().min(1).max(40)),
  damage: z.string().min(1),
  damageType: z.string().min(1),
  saveAbility: z.enum(["dex", "str", "con", "wis", "int", "cha"]),
  saveDC: numStr(z.number().int().min(1).max(40)),
  triggerType: z.enum(["step_on", "open", "touch", "time", "condition"]),
});

export const DungeonStagedPuzzleSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  solution: z.string().min(1),
  solutionCheck: z.object({ skill: z.string().min(1), dc: numStr(z.number().int().min(1).max(40)) }).optional(),
  hintDC: numStr(z.number().int().min(1).max(40).optional()),
  rewardItems: z.array(z.string()).optional(),
  failureConsequence: z.string().optional(),
});

export const DungeonRoomSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(120),
  role: DungeonRoomRoleSchema,
  shape: DungeonRoomShapeSchema,
  size: DungeonRoomSizeSchema,
  dimensions: z.object({ width: numStr(z.number()), height: numStr(z.number()) }).optional(),
  description: z.string().min(1).max(1000),
  atmosphere: z.string().max(500).optional(),
  contents: z.array(DungeonRoomContentSchema).max(20).default([]),
  exits: z.array(z.string()).max(20).default([]),
  isSecret: z.boolean().optional().default(false),
  secretDetectionDC: numStr(z.number().int().min(1).max(40).optional()),
  isLocked: z.boolean().optional(),
  lockDC: numStr(z.number().int().min(1).max(40).optional()),
  stagedEncounter: DungeonStagedEncounterSchema.optional(),
  stagedTrap: DungeonStagedTrapSchema.optional(),
  stagedPuzzle: DungeonStagedPuzzleSchema.optional(),
  stagedLoot: z.array(z.string()).max(20).optional(),
});

export const DungeonConnectionSchema = z.object({
  id: z.string().min(1).max(60),
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum([
    "door", "corridor", "stair", "secret_door", "open_archway", "trapdoor", "portal",
  ]).catch("door"),
  direction: z.enum(["n", "s", "e", "w", "ne", "nw", "se", "sw", "up", "down"]).catch("n"),
  description: z.string().max(300).optional(),
  isLocked: z.boolean().optional(),
  lockDC: numStr(z.number().int().min(1).max(40).optional()),
  isSecret: z.boolean().optional(),
  secretDetectionDC: numStr(z.number().int().min(1).max(40).optional()),
  isTrapped: z.boolean().optional(),
  trapRef: z.string().optional(),
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
  // DM sometimes emits a single room/connection object instead of wrapping it
  // in an array (e.g. a 1-room dungeon) — tolerate both shapes.
  rooms: z.preprocess(toArray, z.array(DungeonRoomSchema).max(30)).optional(),
  connections: z.preprocess(toArray, z.array(DungeonConnectionSchema).max(60)).default([]),
  bossRoomId: z.string().optional(),
  recommendedLevel: numStr(z.number().int().min(1).max(20).optional()),
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
  duration: numStr(z.number().int().min(-1).max(1000)),  // -1 = until long rest, 0 = instant
  source: z.string().optional().default("unknown"),
  effect_desc: z.string().optional().default(""),
});

/* ======================================================================
 * QUESTS — quest_add / quest_update payloads
 * ====================================================================== */

export const QuestObjectiveSchema = z.object({
  text: z.string().min(1).max(200),
  done: z.boolean().optional().default(false),
});

export const QuestAddSchema = z.object({
  id: z.string().min(1).max(60),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  objectives: z.array(QuestObjectiveSchema).min(1).max(10),
  reward: z.string().max(200).optional(),
  giver: z.string().max(60).optional(),
});

export const QuestUpdateSchema = z.object({
  id: z.string().min(1).max(60),
  status: z.enum(["active", "completed", "failed"]).optional(),
  complete_objective: numStr(z.number().int().min(0).max(19).optional()),
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
  hp_delta: numStr(z.number().int().min(-HP_DELTA_CAP).max(HP_DELTA_CAP).optional()),
  gold_delta: numStr(z.number().int().min(-GOLD_DELTA_CAP).max(GOLD_DELTA_CAP).optional()),
  xp_award: numStr(z.number().int().min(0).max(XP_AWARD_CAP).optional()),
  temp_hp: numStr(z.number().int().min(0).max(TEMP_HP_CAP).optional()),

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

  // Quests
  quest_add: QuestAddSchema.optional(),
  quest_update: QuestUpdateSchema.optional(),

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
    delta: numStr(z.number().int().min(-100).max(100)),
  }).optional(),

  // Environment
  weather: WeatherSchema.optional(),
  environment: EnvironmentSchema.optional(),
  scene_type: SceneTypeSchema.optional(),

  // Exhaustion
  exhaustion_delta: numStr(z.number().int().min(-EXHAUSTION_DELTA_CAP).max(EXHAUSTION_DELTA_CAP).optional()),

  // Rest trigger
  rest_trigger: z.enum(["short", "long"]).optional(),

  // Level up choice
  level_up_choice: z.boolean().optional(),

  // Time
  time_delta: numStr(z.number().int().min(0).max(TIME_DELTA_CAP).optional()),
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
  // Same single-object-vs-array tolerance as dungeon rooms/connections.
  world_map: z.preprocess(toArray, z.array(WorldMapLocationSchema).max(20)).nullable().optional(),
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

/** Cheap 32-bit string hash (base36) — only needs to spread distinct titles
 *  across distinct ids, not to be cryptographically sound. */
function hashSuffix(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/**
 * Build a minimal, schema-valid quest object from a bare title string — the
 * DM sometimes sends `quest_add: "Find the tomb"` or
 * `quest_add: ["Find the tomb", "Warn the village"]` instead of a proper
 * quest object. Derives `id` from the title (slugified), uses the title as
 * the description, and creates a single trivial objective so the required
 * QuestAddSchema fields (id/title/description/objectives) are all satisfied.
 * The app is Thai-first, so titles are commonly non-Latin — the slug regex
 * (Latin/digits only) collapses those to "", which would make every Thai
 * quest_add collide on the same id; fall back to a hash of the title so
 * distinct non-Latin titles still get distinct ids.
 */
function questFromTitle(title: string): Record<string, unknown> {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return {
    id: (slug || `quest_${hashSuffix(title)}`).slice(0, 60),
    title: title.slice(0, 120),
    description: title.slice(0, 500),
    objectives: [{ text: title.slice(0, 200) }],
  };
}

/**
 * Coerce `quest_add.objectives` bare strings into the required {text, done?}
 * shape — the DM commonly emits a plain list of objective strings (or a
 * single bare string) instead of wrapping each one in an object, which
 * otherwise fails per-item as "expected object, received string" (each array
 * element is validated against QuestObjectiveSchema, an object schema).
 * A single bare string is wrapped into a one-element array; an array's
 * string items are converted individually (object items pass through
 * untouched, so a mix of strings and proper objects is tolerated too).
 */
function normalizeQuestObjectives(raw: unknown): unknown {
  if (typeof raw === "string") return [{ text: raw }];
  if (Array.isArray(raw)) {
    return raw.map((item) => (typeof item === "string" ? { text: item } : item));
  }
  return raw;
}

/**
 * Normalize known LLM shape-variance inside `updates` BEFORE validation runs,
 * so normal variance doesn't invalidate an otherwise-valid field:
 *  - conditions_add / conditions_remove: case-insensitive + alias match
 *    (e.g. "Exhausted" / "exhausted" → "exhaustion"); unrecognized entries
 *    are dropped INDIVIDUALLY (never invalidate the whole array) and
 *    reported via `warnings`.
 *  - quest_add / quest_update: the apply path takes exactly one quest per
 *    field, but the DM sometimes wraps it in an array — unwrap to the first
 *    element; extra elements are reported via `warnings`, not silently lost.
 *    A bare string quest_add item (just a title) is coerced into a full
 *    quest object via `questFromTitle` instead of being rejected as
 *    "expected object, received string". quest_update is NOT given the same
 *    string coercion — a bare string there would be a quest *title*, and
 *    quest_update's only required field is `id`; this schema layer has no
 *    access to existing quest state to resolve title → id, so a malformed
 *    string quest_update is left to the normal invalid-field drop/warn path.
 *    quest_add's `objectives` sub-field is separately normalized (bare
 *    string / array of bare strings → {text} objects) via
 *    `normalizeQuestObjectives` — see its doc comment.
 * Returns a new object; does not mutate `rawUpdates`.
 */
function normalizeUpdatesShape(rawUpdates: Record<string, unknown>, warnings: string[]): Record<string, unknown> {
  const out = { ...rawUpdates };

  for (const field of ["conditions_add", "conditions_remove"] as const) {
    const val = out[field];
    if (!Array.isArray(val)) continue;
    const kept: string[] = [];
    const dropped: string[] = [];
    for (const item of val) {
      const norm = normalizeConditionId(item);
      if (norm) kept.push(norm);
      else dropped.push(String(item));
    }
    if (dropped.length > 0) {
      warnings.push(`updates.${field}: dropped unrecognized condition(s): ${dropped.join(", ")}`);
    }
    out[field] = kept;
  }

  for (const field of ["quest_add", "quest_update"] as const) {
    const val = out[field];
    if (val === undefined || val === null) continue;

    // Only quest_add has a sensible bare-string source (a plain title);
    // see the doc comment above for why quest_update is excluded.
    const coerceString = (item: unknown): unknown =>
      field === "quest_add" && typeof item === "string" ? questFromTitle(item) : item;

    if (Array.isArray(val)) {
      const mapped = val.map(coerceString);
      if (mapped.length > 1) {
        warnings.push(`updates.${field}: DM sent an array of ${mapped.length} — using the first, extra items ignored`);
      }
      out[field] = mapped[0];
    } else if (field === "quest_add" && typeof val === "string") {
      out[field] = coerceString(val);
    }
    // else: already a plain object (or an un-coercible string) — leave untouched

    // quest_add objects — whether passed through untouched above or just
    // unwrapped from an array — may still carry a malformed `objectives`
    // (bare string, or an array of bare strings); normalize before validation.
    if (field === "quest_add") {
      const q = out[field];
      if (q && typeof q === "object" && !Array.isArray(q) && "objectives" in (q as Record<string, unknown>)) {
        const qObj = q as Record<string, unknown>;
        out[field] = { ...qObj, objectives: normalizeQuestObjectives(qObj.objectives) };
      }
    }
  }

  return out;
}

/**
 * Salvage `updates` field-by-field so one malformed sub-update (e.g. a bad
 * quest_update) cannot discard unrelated valid fields in the same response
 * (e.g. xp_award, loot_drop). Each key is validated independently against
 * UpdatesSchema; invalid keys are dropped + logged, valid keys are kept.
 */
function salvageUpdates(rawUpdates: Record<string, unknown>, warnings: string[]): ValidUpdates | null {
  const shape = UpdatesSchema.shape as Record<string, z.ZodTypeAny>;
  const salvaged: Record<string, unknown> = {};
  let anyValid = false;
  for (const key of Object.keys(shape)) {
    if (!(key in rawUpdates)) continue;
    const fieldResult = shape[key].safeParse(rawUpdates[key]);
    if (fieldResult.success) {
      salvaged[key] = fieldResult.data;
      anyValid = true;
    } else {
      warnings.push(`updates.${key}: invalid — dropped (${fieldResult.error.issues.map((i) => i.message).join("; ")})`);
    }
  }
  return anyValid ? (salvaged as ValidUpdates) : null;
}

/**
 * Validate a raw DM response (already JSON-parsed).
 * On failure, returns a "safe fallback" response with just narration (if available)
 * so the game doesn't crash — invalid fields are dropped.
 */
/**
 * Semantic dedup rules that apply regardless of which parse path (strict
 * success or lenient salvage) produced `data` — must run on BOTH so a
 * salvaged response gets the same "combat takes priority" / "world_map
 * takes priority" treatment as a strictly-valid one.
 */
function applySemanticDedup(data: DMResponse, warnings: string[]): void {
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
}

/**
 * Mirror of salvageUpdates, one level up: when the WHOLE response fails
 * strict validation (often because of ONE malformed field, e.g. a bad
 * buffs_add deep inside `updates`), salvage every OTHER top-level field
 * independently instead of collapsing to bare narration. Without this, a
 * malformed sibling field would silently drop an otherwise-valid
 * start_combat / dungeon_enter / requires / world_map / etc — the exact
 * "valid DM intent dropped" failure mode this validator exists to prevent.
 * `narration`, `scene` and `updates` are handled separately by the caller.
 */
function salvageTopLevelFields(rawObj: Record<string, unknown>, warnings: string[]): Partial<DMResponse> {
  const shape = DMResponseSchema.shape as Record<string, z.ZodTypeAny>;
  const salvaged: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    if (key === "narration" || key === "scene" || key === "updates") continue;
    if (!(key in rawObj)) continue;
    const fieldResult = shape[key].safeParse(rawObj[key]);
    if (fieldResult.success) {
      salvaged[key] = fieldResult.data;
    } else {
      warnings.push(`${key}: invalid — dropped (${fieldResult.error.issues.map((i) => i.message).join("; ")})`);
    }
  }
  return salvaged as Partial<DMResponse>;
}

export function validateDMResponse(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Normalize known shape-variance in `updates` / `requires` BEFORE
  // validation, so it feeds BOTH the strict parse below and the lenient
  // salvage path with the same already-normalized data (dropped/truncated
  // items are still logged to `warnings` either way).
  let normalizedRaw: unknown = raw;
  if (typeof raw === "object" && raw !== null) {
    const rawObj0 = raw as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (rawObj0.updates && typeof rawObj0.updates === "object" && !Array.isArray(rawObj0.updates)) {
      patch.updates = normalizeUpdatesShape(rawObj0.updates as Record<string, unknown>, warnings);
    }
    if (rawObj0.requires !== undefined) {
      patch.requires = normalizeRequiresShape(rawObj0.requires, warnings);
    }
    if (Object.keys(patch).length > 0) {
      normalizedRaw = { ...rawObj0, ...patch };
    }
  }

  // Try strict parse first
  const result = DMResponseSchema.safeParse(normalizedRaw);

  if (result.success) {
    const data = result.data;
    applySemanticDedup(data, warnings);
    return { success: true, data, errors, warnings, raw };
  }

  // Strict parse failed — try lenient mode (extract what we can)
  // Log all zod issues
  for (const issue of result.error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    errors.push(`${path}: ${issue.message}`);
  }

  // Lenient fallback: try to extract just narration + drop everything else
  // (derive from normalizedRaw so the already-normalized `updates` is used)
  const rawObj = (typeof normalizedRaw === "object" && normalizedRaw !== null) ? normalizedRaw as Record<string, unknown> : {};
  const narration = typeof rawObj.narration === "string" ? rawObj.narration.slice(0, 4000) : "⚠️ DM ตอบกลับไม่ถูกต้อง — ลองพิมพ์ action ใหม่";

  // Salvage updates field-by-field — a bad sub-update (e.g. malformed
  // quest_update) must not discard unrelated valid fields (xp_award, loot_drop, ...)
  let salvagedUpdates: ValidUpdates | null = null;
  if (rawObj.updates && typeof rawObj.updates === "object") {
    salvagedUpdates = salvageUpdates(rawObj.updates as Record<string, unknown>, warnings);
    if (!salvagedUpdates) {
      warnings.push("Updates payload had no valid fields — dropping all state changes");
    }
  }

  // Salvage every OTHER top-level field independently — a malformed
  // updates.buffs_add (say) must not also drop a valid start_combat/dungeon_enter.
  const salvagedTop = salvageTopLevelFields(rawObj, warnings);

  const fallback: DMResponse = {
    narration,
    updates: salvagedUpdates,
    scene: typeof rawObj.scene === "string" ? rawObj.scene.slice(0, 120) : null,
    ...salvagedTop,
  };

  applySemanticDedup(fallback, warnings);

  return { success: false, data: fallback, errors, warnings, raw };
}

/* ======================================================================
 * TOOL-CALLING MIGRATION — Stage 0 (additive, NOT wired into /api/dm)
 * ======================================================================
 *
 * This is the trivially-safe first step of migrating the DM contract from
 * "LLM emits one JSON blob in message.content, engine parses+repairs+validates"
 * to native function/tool-calling. It only DEFINES the tool descriptor; it does
 * NOT change route.ts, callDM(), or the e2e mock. Nothing calls it yet, so it
 * cannot regress the working path.
 *
 * Design decision (avoids schema drift): the tool's `parameters` JSON Schema is
 * intentionally SHALLOW — it advertises the top-level DMResponse fields and
 * marks `narration` required, but leaves nested payloads as permissive objects.
 * `validateDMResponse()` (the zod schema above) REMAINS the single source of
 * deep validation for the tool-call arguments, exactly as it is today for the
 * JSON-blob path. One validator, two transports.
 *
 * How route.ts adopts this later (backward-compatible):
 *   1. pass `tools: [buildDmResponseTool()]` + `tool_choice` forcing the tool;
 *   2. read `choices[0].message.tool_calls[0].function.arguments` (a JSON
 *      string) instead of `message.content`;
 *   3. return it in the SAME `{ text }` envelope the client already consumes —
 *      so callDM() and the Playwright mock need ZERO changes.
 */

export const DM_TOOL_NAME = "emit_dm_response";

/** Shallow JSON Schema for the DM tool — deep validation stays in validateDMResponse(). */
export const DM_TOOL_PARAMETERS = {
  type: "object",
  properties: {
    narration: { type: "string", description: "Player-facing narration (Thai). Required." },
    scene: { type: ["string", "null"], description: "Short scene label." },
    requires: { type: ["object", "null"], description: "A skill check or saving throw request." },
    start_combat: { description: "Combat trigger: {monsters:[...], surprise?} or true." },
    world_map: { type: ["array", "null"], description: "Initial world-map locations (first response only)." },
    map_update: { type: ["object", "null"], description: "Incremental map change." },
    dungeon_enter: { type: ["object", "null"] },
    dungeon_room_move: { type: ["object", "null"] },
    dungeon_exit: { description: "boolean | string | null." },
    updates: { type: ["object", "null"], description: "State-mutation vector (hp_delta, xp_award, items_*, conditions_*, ...)." },
  },
  required: ["narration"],
  additionalProperties: true,
} as const;

/**
 * Build the OpenAI-compatible function-tool descriptor for the DM response.
 * (The configured LLM endpoint is OpenAI-compatible — see src/lib/llm.ts.)
 * Additive only; no caller is wired to this yet.
 */
export function buildDmResponseTool() {
  return {
    type: "function" as const,
    function: {
      name: DM_TOOL_NAME,
      description:
        "Emit the Dungeon Master's structured turn result. Call this EXACTLY once per turn " +
        "with the narration and any state changes. Do not write prose outside this tool call.",
      parameters: DM_TOOL_PARAMETERS,
    },
  };
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
