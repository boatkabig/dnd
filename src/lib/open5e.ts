/**
 * Open5e API v2 Adapter
 * ============================================================================
 *
 * Wrapper around api.open5e.com/v2/ that returns engine-ready normalized objects.
 *
 * Why Open5e v2 (vs dnd5eapi.co):
 *   - First-class D&D 2024 (5.2 SRD) support via `document__gamesystem__key=5e-2024`
 *   - 1,955 spells / 3,541 creatures / 2,319 magic items (vs 319/322/237 on dnd5eapi.co)
 *   - Real federated search: /v2/search/?query=fireball
 *   - Pre-computed fields (creature.experience_points, creature.modifiers, creature.passive_perception)
 *     eliminate most client-side parsing
 *   - CORS enabled — but we still proxy through /api/open5e for caching + normalization + edition guard
 *
 * Source API: https://api.open5e.com/v2/
 * License: MIT (code) / OGL+CC-BY (SRD content)
 *
 * Edition guard: ALL upstream calls MUST append `document__gamesystem__key=5e-${edition}`
 * so a 2024-mode request never leaks 2014 content (and vice versa).
 * ============================================================================
 */

import type { AbilityName } from "./engine/character";
import type { DamageType } from "./engine/equipment";

// ============================================================================
// 1. CONFIG
// ============================================================================

export const OPEN5E_BASE = "https://api.open5e.com/v2";
export type Edition = "2014" | "2024";
export const DEFAULT_EDITION: Edition = "2024"; // our engine targets 2024

// ============================================================================
// 2. RAW TYPES — verbatim from Open5e v2
// ============================================================================

export interface Open5eSpellRaw {
  key: string;
  name: string;
  desc: string;
  higher_level?: string;
  level: number;
  school: { name: string; key: string };
  casting_time: string | { name: string; key: string }; // can be "action" string OR {name, key} object
  duration: string;
  range: string;
  range_text?: string;
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  material_specified?: string;
  material_cost?: number;
  material_consumed?: boolean;
  concentration: boolean;
  ritual: boolean;
  saving_throw_ability?: string;
  attack_roll?: boolean;
  damage_roll?: string;
  damage_types?: string[] | Array<{ name: string; key: string }>; // can be either
  shape_type?: string;
  shape_size?: number;
  shape_size_unit?: string;
  classes: Array<{ name: string; key: string }>;
  document: { name: string; key: string; gamesystem: { name: string; key: string } };
  page?: number;
}

export interface Open5eCreatureAttack {
  name: string;
  attack_type: string; // "WEAPON", "SPELL"
  to_hit_mod: number;
  reach?: number | null;
  range?: number | null;
  long_range?: number | null;
  target_creature_only?: boolean;
  damage_die_count?: number | null;
  damage_die_type?: string | null; // "D8", "D6"
  damage_bonus?: number | null;
  damage_type?: { name: string; key: string } | null;
  extra_damage_die_count?: number | null;
  extra_damage_die_type?: string | null;
  extra_damage_bonus?: number | null;
  extra_damage_type?: { name: string; key: string } | null;
  distance_unit?: string;
}

export interface Open5eCreatureAction {
  name: string;
  desc: string;
  attacks?: Open5eCreatureAttack[];
  action_type?: string; // "ACTION", "LEGENDARY_ACTION", "REACTION", "BONUS_ACTION", "MYTHIC_ACTION", "SPECIAL"
  order_in_statblock?: number;
  legendary_action_cost?: number;
  limited_to_form?: string | null;
  usage_limits?: number | null;
}

export interface Open5eCreatureResistancesAndImmunities {
  damage_immunities_display: string;
  damage_immunities: Array<{ name: string; key: string }>;
  damage_resistances_display: string;
  damage_resistances: Array<{ name: string; key: string }>;
  damage_vulnerabilities_display: string;
  damage_vulnerabilities: Array<{ name: string; key: string }>;
  condition_immunities_display: string;
  condition_immunities: Array<{ name: string; key: string }>;
}

export interface Open5eCreatureRaw {
  key: string;
  name: string;
  desc?: string;
  size: { name: string; key: string };
  type: { name: string; key: string };
  subtype?: string;
  category?: string;
  subcategory?: string | null;
  alignment: string;
  armor_class: number;
  armor_detail?: string;
  hit_points: number;
  hit_dice: string;
  speed: { walk?: number; unit: string; swim?: number; fly?: number; climb?: number; burrow?: number; hover?: boolean };
  speed_all?: { unit: string; walk?: number; crawl?: number; hover?: boolean; fly?: number; burrow?: number; climb?: number; swim?: number };
  ability_scores: { strength: number; dexterity: number; constitution: number; intelligence: number; wisdom: number; charisma: number };
  modifiers?: { strength: number; dexterity: number; constitution: number; intelligence: number; wisdom: number; charisma: number };
  initiative_bonus?: number;
  saving_throws?: Partial<Record<AbilityName, number>>;
  saving_throws_all?: Record<AbilityName, number | null>;
  skill_bonuses?: Record<string, number>;
  skill_bonuses_all?: Record<string, number | null>;
  passive_perception?: number;
  proficiency_bonus?: number | null;
  resistances_and_immunities?: Open5eCreatureResistancesAndImmunities;
  damage_vulnerabilities?: string; // legacy display string
  damage_resistances?: string;
  damage_immunities?: string;
  condition_immunities?: string;
  senses?: string;
  languages?: { as_string: string; data: Array<{ name: string; key: string }> };
  challenge_rating: number;
  experience_points: number;
  actions: Open5eCreatureAction[];
  traits?: Open5eCreatureAction[];
  legendary_actions?: Open5eCreatureAction[];
  reactions?: Open5eCreatureAction[];
  mythic_actions?: Open5eCreatureAction[];
  bonus_actions?: Open5eCreatureAction[];
  normal_sight_range?: number | null;
  darkvision_range?: number | null;
  blindsight_range?: number | null;
  tremorsense_range?: number | null;
  truesight_range?: number | null;
  creaturesets?: Array<{ name: string; key: string }>;
  environments?: Array<{ name: string; key: string }>;
  illustration?: string | null;
  document: { name: string; key: string; gamesystem: { name: string; key: string } };
}

export interface Open5eItemRaw {
  key: string;
  name: string;
  desc: string;
  rarity?: { name: string; key: string; rank?: number };
  category?: { name: string; key: string };
  requires_attunement?: boolean;
  attunement_detail?: string;
  attunement_requirements?: string;
  cost?: string;
  weight?: string;
  weight_unit?: string;
  // Weapon-related
  damage_dice?: string;
  damage_type?: { name: string; key: string };
  range?: number;
  long_range?: number;
  is_simple?: boolean;
  is_improvised?: boolean;
  properties?: Array<{
    property: { name: string; type: string | null; desc: string };
    detail: string | null;
  }>;
  // Armor-related
  ac_display?: string;
  ac_base?: number;
  ac_add_dexmod?: boolean;
  ac_cap_dexmod?: number | null;
  ac_bonus?: number;
  dex_bonus?: boolean;
  max_dex?: number;
  strength_score_required?: number;
  grants_stealth_disadvantage?: boolean;
  distance_unit?: string;
  size?: { name: string; key: string };
  // Legacy compat fields
  price?: number;
  weight_num?: number;
  damage?: string;
  type?: string;
  weapon_category?: string;
  strength_required?: number;
  stealth_disadvantage?: boolean;
  document: { name: string; key: string; gamesystem: { name: string; key: string } };
}

export interface Open5eClassFeatureRaw {
  key: string;
  name: string;
  desc: string;
  feature_type: string; // "CLASS_LEVEL_FEATURE" | "CLASS_TABLE_DATA" | "CORE_TRAITS_TABLE"
  gained_at: Array<{ level: number; detail: string | null }>;
  data_for_class_table?: Array<{ level: number; column_value: string }>;
}

export interface Open5eClassRaw {
  key: string;
  name: string;
  desc: string;
  hit_dice: string; // "D6", "D8", "D10", "D12" (uppercase in v2)
  hit_dice_quantity?: number;
  hit_points?: {
    hit_dice: string;
    hit_dice_name: string;
    hit_points_at_1st_level: string;
    hit_points_at_higher_levels: string;
  };
  caster_type?: string; // "FULL" | "HALF" | "NONE"
  saving_throws: Array<{ name: string; key?: string }>; // v2 returns [{name}] without key
  primary_abilities?: Array<{ name: string; key?: string }>;
  armor_proficiencies?: string;
  weapon_proficiencies?: string;
  tool_proficiencies?: string;
  skill_proficiencies?: string;
  num_skill_choices?: number;
  subclass_title?: string;
  subclasses?: Array<{ name: string; key: string }>;
  subclass_of?: { name: string; key: string } | null;
  features: Open5eClassFeatureRaw[];
  document: { name: string; key: string; gamesystem: { name: string; key: string } };
}

export interface Open5eSpeciesTraitRaw {
  name: string;
  desc: string;
  type: string | null; // "SIZE" | "SPEED" | null for general traits
  order: number;
}

export interface Open5eSpeciesRaw {
  key: string;
  name: string;
  desc: string;
  is_subspecies?: boolean;
  subspecies_of?: { name: string; key: string } | null;
  size?: { name: string; key: string };
  speed?: { walk: number; unit: string; fly?: number; swim?: number; climb?: number; burrow?: number };
  ability_score_options?: Array<{ ability: string; bonus: number }>;
  ability_bonuses?: Record<AbilityName, number>;
  traits: Open5eSpeciesTraitRaw[];
  languages?: { as_string: string };
  subtypes?: Array<{ name: string; key: string }>;
  document: { name: string; key: string; gamesystem: { name: string; key: string } };
}

export interface Open5eBackgroundBenefitRaw {
  name: string;
  desc: string;
  type: string; // "ability_score" | "equipment" | "feat" | "skill_proficiency" | "tool_proficiency" | "language"
}

export interface Open5eBackgroundRaw {
  key: string;
  name: string;
  desc: string;
  benefits: Open5eBackgroundBenefitRaw[];
  // Legacy string fields (v1-style)
  skill_proficiencies?: string;
  tool_proficiencies?: string;
  languages?: string;
  equipment?: string;
  feature?: { name: string; desc: string };
  feature_name?: string;
  feature_desc?: string;
  document: { name: string; key: string; gamesystem: { name: string; key: string } };
}

export interface Open5eFeatRaw {
  key: string;
  name: string;
  desc: string;
  prerequisite?: string;
  category?: string;
  document: { name: string; key: string; gamesystem: { name: string; key: string } };
}

export interface Open5eConditionRaw {
  key: string;
  name: string;
  desc: string;
  document: { name: string; key: string; gamesystem: { name: string; key: string } };
}

// ============================================================================
// 3. NORMALIZED TYPES — engine-ready
// ============================================================================

export interface NormalizedSpell {
  index: string;
  name: string;
  nameTh?: string;
  level: number;
  school: string;
  schoolKey: string;
  castingTime: string;
  range: string;
  components: { verbal: boolean; somatic: boolean; material: boolean; materialDesc?: string; materialCost?: string; materialConsumed?: boolean };
  duration: string;
  concentration: boolean;
  ritual: boolean;
  desc: string;
  higherLevel: string;
  classes: string[];
  saveAbility?: AbilityName;
  damage?: string;
  damageType?: DamageType;
  // Phase 3: save success effect — "half" (take half damage) | "none" (no effect) | undefined
  saveSuccess?: "half" | "none";
  attackRoll?: boolean;
  aoeType?: string;
  aoeSize?: number;
  bonusAction: boolean;
  isCantrip: boolean;
  edition: Edition;
}

export interface NormalizedCreatureAttack {
  name: string;
  attackType: string; // "WEAPON" | "SPELL"
  toHit: number;
  reach?: number | null;
  range?: number | null;
  longRange?: number | null;
  targetCreatureOnly: boolean;
  damageDice?: string; // e.g. "2d8" derived from damage_die_count + damage_die_type
  damageBonus?: number;
  damageType?: string; // e.g. "slashing"
  extraDamageDice?: string;
  extraDamageBonus?: number;
  extraDamageType?: string;
}

export interface NormalizedCreatureAction {
  name: string;
  desc: string;
  attacks: NormalizedCreatureAttack[];
  actionType: string; // "ACTION" | "LEGENDARY_ACTION" | "REACTION" | "BONUS_ACTION" | "MYTHIC_ACTION" | "SPECIAL"
  legendaryActionCost?: number;
  usageLimits?: number;
}

export interface NormalizedCreature {
  index: string;
  name: string;
  size: string;
  sizeKey?: string;
  type: string;
  typeKey?: string;
  subtype?: string;
  category?: string;
  alignment: string;
  ac: number;
  acDetail?: string;
  hp: number;
  hitDice: string;
  speed: number; // walk speed in feet
  speeds: { walk?: number; fly?: number; swim?: number; climb?: number; burrow?: number; crawl?: number; hover?: boolean };
  abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  modifiers?: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  saves: Partial<Record<AbilityName, number>>;
  skills: Record<string, number>;
  passivePerception: number;
  proficiencyBonus?: number;
  cr: number; // float
  xp: number;
  damageVulnerabilities: string[];
  damageResistances: string[];
  damageImmunities: string[];
  conditionImmunities: string[];
  senses: string;
  languages: string;
  languagesData?: Array<{ name: string; key: string }>;
  actions: NormalizedCreatureAction[];
  traits: NormalizedCreatureAction[];
  legendaryActions: NormalizedCreatureAction[];
  reactions: NormalizedCreatureAction[];
  bonusActions: NormalizedCreatureAction[];
  mythicActions: NormalizedCreatureAction[];
  darkvision?: number;
  blindsight?: number;
  tremorsense?: number;
  truesight?: number;
  normalSight?: number;
  initiativeBonus?: number;
  environments: Array<{ name: string; key: string }>;
  creatureSets: Array<{ name: string; key: string }>;
  illustration?: string | null;
  edition: Edition;
}

export interface NormalizedItemWeaponProperty {
  name: string;
  type: string | null; // "Mastery" | null (regular property)
  desc: string;
  detail: string | null; // e.g. "1d10" for Versatile
}

export interface NormalizedItem {
  index: string;
  name: string;
  desc: string;
  rarity?: string;
  rarityKey?: string;
  rarityRank?: number;
  category?: string;
  requiresAttunement: boolean;
  attunementDetail?: string;
  price: number;
  weight?: number;
  // Weapon
  damageDice?: string;
  damageType?: string;
  range?: number;
  longRange?: number;
  isSimple?: boolean;
  isImprovised?: boolean;
  properties: NormalizedItemWeaponProperty[];
  mastery?: string; // extracted from properties (the one with type === "Mastery")
  // Armor
  acDisplay?: string;
  acBase?: number;
  acAddDexmod?: boolean;
  acCapDexmod?: number | null;
  acBonus?: number;
  dexBonus?: boolean;
  maxDex?: number;
  strengthRequired?: number;
  stealthDisadvantage?: boolean;
  // Legacy compat
  damage?: string;
  type?: string;
  edition: Edition;
}

export interface NormalizedClassFeature {
  key: string;
  name: string;
  desc: string;
  featureType: string; // "CLASS_LEVEL_FEATURE" | "CLASS_TABLE_DATA" | "CORE_TRAITS_TABLE"
  gainedAtLevels: number[]; // e.g. [4, 8, 12, 16] for ASI
  classTableData?: Array<{ level: number; columnValue: string }>;
}

export interface NormalizedClass {
  index: string;
  name: string;
  hitDie: number;
  casterType?: string; // "FULL" | "HALF" | "NONE"
  saves: AbilityName[];
  primaryAbilities: AbilityName[];
  armorProficiencies?: string;
  weaponProficiencies?: string;
  toolProficiencies?: string;
  skillProficiencies?: string;
  numSkillChoices: number;
  subclassTitle?: string;
  subclasses: Array<{ name: string; key: string }>;
  subclassOf?: { name: string; key: string };
  features: NormalizedClassFeature[];
  edition: Edition;
}

export interface NormalizedSpeciesTrait {
  name: string;
  desc: string;
  type: string | null; // "SIZE" | "SPEED" | null
  order: number;
}

export interface NormalizedSpecies {
  index: string;
  name: string;
  size?: string;
  speed: number;
  isSubspecies: boolean;
  subspeciesOf?: { name: string; key: string };
  abilityBonuses?: Partial<Record<AbilityName, number>>;
  abilityScoreOptions?: Array<{ ability: string; bonus: number }>;
  traits: NormalizedSpeciesTrait[];
  languages: string;
  subtypes: Array<{ name: string; key: string }>;
  edition: Edition;
}

export interface NormalizedBackgroundBenefit {
  name: string;
  desc: string;
  type: string; // "ability_score" | "equipment" | "feat" | "skill_proficiency" | "tool_proficiency" | "language"
}

export interface NormalizedBackground {
  index: string;
  name: string;
  desc: string;
  benefits: NormalizedBackgroundBenefit[];
  // Parsed from benefits for convenience
  abilityScoreOptions?: string; // e.g. "Constitution, Intelligence, Wisdom"
  equipment: string;
  originFeat?: string; // e.g. "Magic Initiate (Wizard)"
  skills: string[];
  tools: string[];
  languages?: string;
  feature?: { name: string; desc: string };
  edition: Edition;
}

export interface NormalizedFeat {
  index: string;
  name: string;
  desc: string;
  prerequisite?: string;
  category?: string;
  edition: Edition;
}

export interface NormalizedCondition {
  index: string;
  name: string;
  desc: string;
  edition: Edition;
}

export interface Open5eListResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Open5eSearchResult {
  count: number;
  results: Array<{
    objectName: string;
    objectModel: string; // "Spell", "Creature", "MagicItem", etc.
    route: string; // "v2/spells/"
    text: string;
    matchScore: number;
    matchType: string;
    document: { name: string; key: string };
  }>;
}

// ============================================================================
// 4. EDITION GUARD — append to every upstream URL
// ============================================================================

/**
 * Append the edition filter to an upstream URL.
 * This is the SINGLE MOST IMPORTANT guardrail — it prevents 2024-mode requests
 * from leaking 2014 content (and vice versa).
 */
function withEdition(url: string, edition: Edition = DEFAULT_EDITION): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}document__gamesystem__key=5e-${edition}`;
}

// ============================================================================
// 5. FETCH WRAPPER — with timeout + error normalization
// ============================================================================

const UPSTREAM_TIMEOUT_MS = 8000;

async function fetchOpen5e<T>(path: string, edition: Edition = DEFAULT_EDITION): Promise<T> {
  const url = withEdition(`${OPEN5E_BASE}${path}`, edition);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "dnd-solo-engine/1.0" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Open5e HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// 6. NORMALIZERS — convert raw v2 → engine-ready
// ============================================================================

const SCHOOL_KEY_TO_NAME: Record<string, string> = {
  abj: "Abjuration", con: "Conjuration", div: "Divination", enc: "Enchantment",
  evo: "Evocation", ill: "Illusion", nec: "Necromancy", trs: "Transmutation",
};

function parseAbility(abilityKey?: string): AbilityName | undefined {
  if (!abilityKey) return undefined;
  const map: Record<string, AbilityName> = {
    strength: "str", str: "str",
    dexterity: "dex", dex: "dex",
    constitution: "con", con: "con",
    intelligence: "int", int: "int",
    wisdom: "wis", wis: "wis",
    charisma: "cha", cha: "cha",
  };
  return map[abilityKey.toLowerCase()] ?? undefined;
}

function parseDamageType(dt?: string | { name: string; key: string }): DamageType | undefined {
  if (!dt) return undefined;
  const map: Record<string, DamageType> = {
    slashing: "slashing", piercing: "piercing", bludgeoning: "bludgeoning",
    fire: "fire", cold: "cold", lightning: "lightning", thunder: "thunder",
    acid: "acid", poison: "poison", psychic: "psychic", necrotic: "necrotic",
    radiant: "radiant", force: "force",
  };
  const key = typeof dt === "string" ? dt : dt.key;
  return map[key.toLowerCase()] ?? undefined;
}

export function normalizeSpell(raw: Open5eSpellRaw, edition: Edition): NormalizedSpell {
  // casting_time can be either a string ("action") or an object ({name, key})
  const castingTimeRaw = raw.casting_time as any;
  let castingTimeStr: string;
  if (typeof castingTimeRaw === "string") {
    // Map short keys to full action labels
    const map: Record<string, string> = {
      action: "1 action",
      bonus_action: "1 bonus action",
      reaction: "1 reaction",
      minute: "1 minute",
      hour: "1 hour",
    };
    castingTimeStr = map[castingTimeRaw] ?? castingTimeRaw;
  } else if (castingTimeRaw && typeof castingTimeRaw === "object") {
    castingTimeStr = castingTimeRaw.name ?? "1 action";
  } else {
    castingTimeStr = "1 action";
  }
  return {
    index: raw.key,
    name: raw.name,
    level: raw.level,
    school: raw.school?.name ?? SCHOOL_KEY_TO_NAME[raw.school?.key ?? ""] ?? "Unknown",
    schoolKey: raw.school?.key ?? "",
    castingTime: castingTimeStr,
    range: raw.range_text ?? raw.range ?? "",
    components: {
      verbal: raw.verbal ?? false,
      somatic: raw.somatic ?? false,
      material: raw.material ?? false,
      materialDesc: raw.material_specified,
      // Phase 3: capture material cost + consumed flag (was dropped before)
      materialCost: raw.material_cost !== undefined ? String(raw.material_cost) : undefined,
      materialConsumed: raw.material_consumed ?? false,
    },
    duration: raw.duration ?? "Instantaneous",
    concentration: raw.concentration ?? false,
    ritual: raw.ritual ?? false,
    desc: raw.desc ?? "",
    higherLevel: raw.higher_level ?? "",
    classes: (raw.classes ?? []).map(c => c.name),
    saveAbility: parseAbility(raw.saving_throw_ability),
    damage: raw.damage_roll,
    damageType: parseDamageType(raw.damage_types?.[0]),
    // Phase 3: capture save success effect — Open5e doesn't expose dc_success reliably
    // Infer from damage presence: damage spells = "half", non-damage save spells = "none"
    saveSuccess: raw.saving_throw_ability ? (raw.damage_roll ? "half" : "none") : undefined,
    attackRoll: raw.attack_roll,
    aoeType: raw.shape_type,
    aoeSize: raw.shape_size,
    bonusAction: /bonus action/i.test(castingTimeStr),
    isCantrip: raw.level === 0,
    edition,
  };
}

function normalizeCreatureAttack(a: Open5eCreatureAttack): NormalizedCreatureAttack {
  // Build damage dice string from die_count + die_type: 2 + D8 → "2d8"
  let damageDice: string | undefined;
  if (a.damage_die_count && a.damage_die_type) {
    damageDice = `${a.damage_die_count}d${a.damage_die_type.replace(/[dD]/g, "")}`;
  }
  let extraDamageDice: string | undefined;
  if (a.extra_damage_die_count && a.extra_damage_die_type) {
    extraDamageDice = `${a.extra_damage_die_count}d${a.extra_damage_die_type.replace(/[dD]/g, "")}`;
  }
  return {
    name: a.name,
    attackType: a.attack_type,
    toHit: a.to_hit_mod,
    reach: a.reach,
    range: a.range,
    longRange: a.long_range,
    targetCreatureOnly: a.target_creature_only ?? false,
    damageDice,
    damageBonus: a.damage_bonus ?? undefined,
    damageType: a.damage_type?.key,
    extraDamageDice,
    extraDamageBonus: a.extra_damage_bonus ?? undefined,
    extraDamageType: a.extra_damage_type?.key,
  };
}

function normalizeCreatureAction(a: Open5eCreatureAction | undefined): NormalizedCreatureAction {
  if (!a) return { name: "", desc: "", attacks: [], actionType: "ACTION" };
  return {
    name: a.name,
    desc: a.desc,
    attacks: (a.attacks ?? []).map(normalizeCreatureAttack),
    actionType: a.action_type ?? "ACTION",
    legendaryActionCost: a.legendary_action_cost ?? undefined,
    usageLimits: a.usage_limits ?? undefined,
  };
}

export function normalizeCreature(raw: Open5eCreatureRaw, edition: Edition): NormalizedCreature {
  const saves: Partial<Record<AbilityName, number>> = {};
  if (raw.saving_throws) {
    for (const [k, v] of Object.entries(raw.saving_throws)) {
      const abil = parseAbility(k);
      if (abil && typeof v === "number") saves[abil] = v;
    }
  }
  // Extract structured resistances/immunities from the new field, with fallback to legacy strings
  const ri = raw.resistances_and_immunities;
  const splitStr = (s?: string) => (s ? s.split(",").map(x => x.trim()).filter(Boolean) : []);
  return {
    index: raw.key,
    name: raw.name,
    size: raw.size?.name ?? "Medium",
    sizeKey: raw.size?.key,
    type: raw.type?.name ?? "Unknown",
    typeKey: raw.type?.key,
    subtype: raw.subtype,
    category: raw.category,
    alignment: raw.alignment ?? "unaligned",
    ac: raw.armor_class,
    acDetail: raw.armor_detail,
    hp: raw.hit_points,
    hitDice: raw.hit_dice,
    speed: raw.speed?.walk ?? 30,
    speeds: {
      walk: raw.speed?.walk ?? raw.speed_all?.walk,
      fly: raw.speed?.fly ?? raw.speed_all?.fly,
      swim: raw.speed?.swim ?? raw.speed_all?.swim,
      climb: raw.speed?.climb ?? raw.speed_all?.climb,
      burrow: raw.speed?.burrow ?? raw.speed_all?.burrow,
      crawl: raw.speed_all?.crawl,
      hover: raw.speed?.hover ?? raw.speed_all?.hover,
    },
    abilities: {
      str: raw.ability_scores?.strength ?? 10,
      dex: raw.ability_scores?.dexterity ?? 10,
      con: raw.ability_scores?.constitution ?? 10,
      int: raw.ability_scores?.intelligence ?? 10,
      wis: raw.ability_scores?.wisdom ?? 10,
      cha: raw.ability_scores?.charisma ?? 10,
    },
    modifiers: raw.modifiers ? {
      str: raw.modifiers.strength, dex: raw.modifiers.dexterity,
      con: raw.modifiers.constitution, int: raw.modifiers.intelligence,
      wis: raw.modifiers.wisdom, cha: raw.modifiers.charisma,
    } : undefined,
    saves,
    skills: raw.skill_bonuses ?? {},
    passivePerception: raw.passive_perception ?? 10 + Math.floor((raw.ability_scores?.wisdom ?? 10) / 2 - 5),
    proficiencyBonus: raw.proficiency_bonus ?? undefined,
    cr: raw.challenge_rating,
    xp: raw.experience_points,
    damageVulnerabilities: ri?.damage_vulnerabilities?.map(d => d.key) ?? splitStr(raw.damage_vulnerabilities),
    damageResistances: ri?.damage_resistances?.map(d => d.key) ?? splitStr(raw.damage_resistances),
    damageImmunities: ri?.damage_immunities?.map(d => d.key) ?? splitStr(raw.damage_immunities),
    conditionImmunities: ri?.condition_immunities?.map(c => c.key) ?? splitStr(raw.condition_immunities),
    senses: raw.senses ?? "",
    languages: raw.languages?.as_string ?? "",
    languagesData: raw.languages?.data,
    actions: (raw.actions ?? []).map(normalizeCreatureAction),
    traits: (raw.traits ?? []).map(normalizeCreatureAction),
    legendaryActions: (raw.legendary_actions ?? []).map(normalizeCreatureAction),
    reactions: (raw.reactions ?? []).map(normalizeCreatureAction),
    bonusActions: (raw.bonus_actions ?? []).map(normalizeCreatureAction),
    mythicActions: (raw.mythic_actions ?? []).map(normalizeCreatureAction),
    darkvision: raw.darkvision_range ?? undefined,
    blindsight: raw.blindsight_range ?? undefined,
    tremorsense: raw.tremorsense_range ?? undefined,
    truesight: raw.truesight_range ?? undefined,
    normalSight: raw.normal_sight_range ?? undefined,
    initiativeBonus: raw.initiative_bonus,
    environments: raw.environments ?? [],
    creatureSets: raw.creaturesets ?? [],
    illustration: raw.illustration,
    edition,
  };
}

export function normalizeItem(raw: Open5eItemRaw, edition: Edition): NormalizedItem {
  // Parse cost (string like "0.00" → number)
  const priceNum = typeof raw.cost === "string" ? parseFloat(raw.cost) || 0 : (raw.price ?? 0);
  // Parse weight (string like "0.000" → number)
  const weightNum = typeof raw.weight === "string" ? parseFloat(raw.weight) || 0 : raw.weight;
  // Build properties array + extract mastery
  const properties: NormalizedItemWeaponProperty[] = (raw.properties ?? []).map(p => ({
    name: p.property.name,
    type: p.property.type,
    desc: p.property.desc,
    detail: p.detail,
  }));
  const masteryProp = properties.find(p => p.type === "Mastery");
  return {
    index: raw.key,
    name: raw.name,
    desc: raw.desc ?? "",
    rarity: raw.rarity?.name,
    rarityKey: raw.rarity?.key,
    rarityRank: raw.rarity?.rank,
    category: raw.category?.name,
    requiresAttunement: raw.requires_attunement ?? false,
    attunementDetail: raw.attunement_detail ?? raw.attunement_requirements,
    price: priceNum,
    weight: weightNum || undefined,
    // Weapon fields
    damageDice: raw.damage_dice ?? raw.damage,
    damageType: raw.damage_type?.key ?? raw.damage_type?.name,
    range: raw.range,
    longRange: raw.long_range,
    isSimple: raw.is_simple,
    isImprovised: raw.is_improvised,
    properties,
    mastery: masteryProp?.name,
    // Armor fields
    acDisplay: raw.ac_display,
    acBase: raw.ac_base,
    acAddDexmod: raw.ac_add_dexmod,
    acCapDexmod: raw.ac_cap_dexmod,
    acBonus: raw.ac_bonus,
    dexBonus: raw.dex_bonus,
    maxDex: raw.max_dex,
    strengthRequired: raw.strength_score_required ?? raw.strength_required,
    stealthDisadvantage: raw.grants_stealth_disadvantage ?? raw.stealth_disadvantage,
    type: raw.type,
    edition,
  };
}

export function normalizeClass(raw: Open5eClassRaw, edition: Edition): NormalizedClass {
  const hitDieMatch = raw.hit_dice?.match(/[dD](\d+)/);
  // saving_throws returns [{name: "Intelligence"}, {name: "Wisdom"}] — no key field
  // Convert "Intelligence" → "int" via parseAbility
  const saves = (raw.saving_throws ?? []).map(s => {
    const abil = parseAbility((s as any).key ?? (s as any).name ?? "");
    return abil;
  }).filter((s): s is AbilityName => Boolean(s));
  const primaryAbilities = (raw.primary_abilities ?? []).map(s => {
    const abil = parseAbility((s as any).key ?? (s as any).name ?? "");
    return abil;
  }).filter((s): s is AbilityName => Boolean(s));
  // Normalize features (now structured with gained_at array)
  const features: NormalizedClassFeature[] = (raw.features ?? []).map(f => ({
    key: f.key,
    name: f.name,
    desc: f.desc,
    featureType: f.feature_type,
    gainedAtLevels: (f.gained_at ?? []).map(g => g.level),
    classTableData: (f.data_for_class_table ?? []).map(d => ({ level: d.level, columnValue: d.column_value })),
  }));
  return {
    index: raw.key,
    name: raw.name,
    hitDie: hitDieMatch ? parseInt(hitDieMatch[1]) : 8,
    casterType: raw.caster_type,
    saves,
    primaryAbilities,
    armorProficiencies: raw.armor_proficiencies,
    weaponProficiencies: raw.weapon_proficiencies,
    toolProficiencies: raw.tool_proficiencies,
    skillProficiencies: raw.skill_proficiencies,
    numSkillChoices: raw.num_skill_choices ?? 2,
    subclassTitle: raw.subclass_title,
    subclasses: (raw.subclasses ?? []).map(s => ({ name: s.name, key: s.key })),
    subclassOf: raw.subclass_of ?? undefined,
    features,
    edition,
  };
}

export function normalizeSpecies(raw: Open5eSpeciesRaw, edition: Edition): NormalizedSpecies {
  // Try to extract size and speed from traits (D&D 2024 species have SIZE and SPEED typed traits)
  let sizeName = raw.size?.name;
  let speedWalk = raw.speed?.walk;
  const traits: NormalizedSpeciesTrait[] = (raw.traits ?? []).map(t => {
    if (t.type === "SIZE" && !sizeName) {
      // Try to extract size from desc e.g. "Medium (about 4–7 feet tall)..."
      const match = t.desc.match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)/i);
      if (match) sizeName = match[1];
    }
    if (t.type === "SPEED" && !speedWalk) {
      const match = t.desc.match(/(\d+)\s*(?:feet|ft)/i);
      if (match) speedWalk = parseInt(match[1]);
    }
    return {
      name: t.name,
      desc: t.desc,
      type: t.type,
      order: t.order,
    };
  });
  return {
    index: raw.key,
    name: raw.name,
    size: sizeName ?? "Medium",
    speed: speedWalk ?? 30,
    isSubspecies: raw.is_subspecies ?? false,
    subspeciesOf: raw.subspecies_of ?? undefined,
    abilityBonuses: raw.ability_bonuses,
    abilityScoreOptions: raw.ability_score_options,
    traits,
    languages: raw.languages?.as_string ?? "Common",
    subtypes: (raw.subtypes ?? []).map(s => ({ name: s.name, key: s.key })),
    edition,
  };
}

export function normalizeBackground(raw: Open5eBackgroundRaw, edition: Edition): NormalizedBackground {
  // Parse structured benefits (D&D 2024 backgrounds have benefits[] array)
  const benefits: NormalizedBackgroundBenefit[] = (raw.benefits ?? []).map(b => ({
    name: b.name,
    desc: b.desc,
    type: b.type,
  }));
  // Convenience extract: pull out specific benefit types
  const findBenefit = (type: string) => benefits.find(b => b.type === type);
  const abilityScoreBenefit = findBenefit("ability_score");
  const equipmentBenefit = findBenefit("equipment");
  const featBenefit = findBenefit("feat");
  const skillBenefit = findBenefit("skill_proficiency");
  const toolBenefit = findBenefit("tool_proficiency");
  const langBenefit = findBenefit("language");
  // For skills, split desc by "and"/","/","" — e.g. "Arcana and History" → ["Arcana", "History"]
  const parseList = (desc?: string) => desc
    ? desc.split(/\s+and\s+|\s*,\s*/).map(s => s.trim()).filter(Boolean)
    : [];
  return {
    index: raw.key,
    name: raw.name,
    desc: raw.desc ?? "",
    benefits,
    abilityScoreOptions: abilityScoreBenefit?.desc,
    equipment: equipmentBenefit?.desc ?? raw.equipment ?? "",
    originFeat: featBenefit?.desc,
    skills: skillBenefit ? parseList(skillBenefit.desc) : (raw.skill_proficiencies ? parseList(raw.skill_proficiencies) : []),
    tools: toolBenefit ? parseList(toolBenefit.desc) : (raw.tool_proficiencies ? parseList(raw.tool_proficiencies) : []),
    languages: langBenefit?.desc ?? raw.languages,
    feature: raw.feature ?? (raw.feature_name ? { name: raw.feature_name, desc: raw.feature_desc ?? "" } : undefined),
    edition,
  };
}

export function normalizeFeat(raw: Open5eFeatRaw, edition: Edition): NormalizedFeat {
  return {
    index: raw.key,
    name: raw.name,
    desc: raw.desc ?? "",
    prerequisite: raw.prerequisite,
    category: raw.category,
    edition,
  };
}

export function normalizeCondition(raw: Open5eConditionRaw, edition: Edition): NormalizedCondition {
  return {
    index: raw.key,
    name: raw.name,
    desc: raw.desc ?? "",
    edition,
  };
}

// ============================================================================
// 7. HIGH-LEVEL API — what the engine calls
// ============================================================================

/** Probe — health check */
export async function probe(): Promise<{ ok: boolean; edition: Edition }> {
  try {
    await fetchOpen5e<Open5eListResponse<unknown>>(`/spells/?limit=1&fields=name`, DEFAULT_EDITION);
    return { ok: true, edition: DEFAULT_EDITION };
  } catch {
    return { ok: false, edition: DEFAULT_EDITION };
  }
}

/** List spells (paginated) */
export async function listSpells(opts: {
  edition?: Edition;
  page?: number;
  limit?: number;
  level?: number;
  school?: string;
  classFilter?: string;
  search?: string;
} = {}): Promise<{ count: number; results: Array<{ index: string; name: string; level: number; school: string }>; next: string | null }> {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 50));
  if (opts.page) params.set("page", String(opts.page));
  if (opts.level !== undefined) params.set("level", String(opts.level)); // v2 uses "level" (int) — NOT "level_int" (v1)
  if (opts.school) params.set("school__key", opts.school);
  if (opts.classFilter) params.set("classes__key", opts.classFilter);
  if (opts.search) params.set("name__icontains", opts.search);
  params.set("fields", "key,name,level,school");
  const res = await fetchOpen5e<Open5eListResponse<any>>(`/spells/?${params}`, opts.edition);
  return {
    count: res.count,
    next: res.next,
    results: res.results.map((s: any) => ({
      index: s.key, name: s.name,
      level: s.level, school: s.school?.name ?? "",
    })),
  };
}

/** Get single spell by slug (e.g. "fireball") — auto-resolves composite key */
export async function getSpell(slug: string, edition: Edition = DEFAULT_EDITION): Promise<NormalizedSpell | null> {
  try {
    // Try direct slug first
    const direct = await fetchOpen5e<Open5eSpellRaw>(`/spells/${slug}/`, edition).catch(() => null);
    if (direct) return normalizeSpell(direct, edition);
    // Fallback: search by name and fetch the first match
    const params = new URLSearchParams();
    params.set("name__iexact", slug.replace(/-/g, " "));
    params.set("limit", "1");
    const search = await fetchOpen5e<Open5eListResponse<Open5eSpellRaw>>(`/spells/?${params}`, edition);
    if (search.results.length > 0) return normalizeSpell(search.results[0], edition);
    return null;
  } catch {
    return null;
  }
}

/** List creatures (paginated) */
export async function listCreatures(opts: {
  edition?: Edition;
  page?: number;
  limit?: number;
  cr?: number;
  crMin?: number;
  crMax?: number;
  type?: string;
  search?: string;
} = {}): Promise<{ count: number; results: Array<{ index: string; name: string; cr: number; xp: number }>; next: string | null }> {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 50));
  if (opts.page) params.set("page", String(opts.page));
  if (opts.cr !== undefined) params.set("challenge_rating", String(opts.cr));
  if (opts.crMin !== undefined) params.set("challenge_rating__gte", String(opts.crMin));
  if (opts.crMax !== undefined) params.set("challenge_rating__lte", String(opts.crMax));
  if (opts.type) params.set("type__key", opts.type);
  if (opts.search) params.set("name__icontains", opts.search);
  params.set("fields", "key,name,challenge_rating,experience_points");
  const res = await fetchOpen5e<Open5eListResponse<any>>(`/creatures/?${params}`, opts.edition);
  return {
    count: res.count,
    next: res.next,
    results: res.results.map((c: any) => ({
      index: c.key, name: c.name,
      cr: c.challenge_rating, xp: c.experience_points,
    })),
  };
}

/** Get single creature by slug (e.g. "goblin") — auto-resolves composite key, falls back to substring */
export async function getCreature(slug: string, edition: Edition = DEFAULT_EDITION): Promise<NormalizedCreature | null> {
  try {
    // Try direct slug first
    const direct = await fetchOpen5e<Open5eCreatureRaw>(`/creatures/${slug}/`, edition).catch(() => null);
    if (direct) return normalizeCreature(direct, edition);
    // Fallback: exact name match
    const params = new URLSearchParams();
    params.set("name__iexact", slug.replace(/-/g, " "));
    params.set("limit", "1");
    const search = await fetchOpen5e<Open5eListResponse<Open5eCreatureRaw>>(`/creatures/?${params}`, edition);
    if (search.results.length > 0) return normalizeCreature(search.results[0], edition);
    // Last resort: substring match (e.g., "goblin" matches "Goblin Warrior")
    const subParams = new URLSearchParams();
    subParams.set("name__icontains", slug.replace(/-/g, " "));
    subParams.set("limit", "1");
    const subSearch = await fetchOpen5e<Open5eListResponse<Open5eCreatureRaw>>(`/creatures/?${subParams}`, edition);
    if (subSearch.results.length > 0) return normalizeCreature(subSearch.results[0], edition);
    return null;
  } catch {
    return null;
  }
}

/** List magic items (paginated) */
export async function listMagicItems(opts: {
  edition?: Edition;
  page?: number;
  limit?: number;
  rarity?: string;
  search?: string;
} = {}): Promise<{ count: number; results: Array<{ index: string; name: string; rarity?: string }>; next: string | null }> {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 50));
  if (opts.page) params.set("page", String(opts.page));
  if (opts.rarity) params.set("rarity__key", opts.rarity.toLowerCase().replace(/\s+/g, "-"));
  if (opts.search) params.set("name__icontains", opts.search);
  params.set("fields", "key,name,rarity");
  const res = await fetchOpen5e<Open5eListResponse<any>>(`/magicitems/?${params}`, opts.edition);
  return {
    count: res.count,
    next: res.next,
    results: res.results.map((m: any) => ({
      index: m.key, name: m.name,
      rarity: m.rarity?.name,
    })),
  };
}

/** Get single magic item by slug — auto-resolves composite key */
export async function getMagicItem(slug: string, edition: Edition = DEFAULT_EDITION): Promise<NormalizedItem | null> {
  try {
    const direct = await fetchOpen5e<Open5eItemRaw>(`/magicitems/${slug}/`, edition).catch(() => null);
    if (direct) return normalizeItem(direct, edition);
    const params = new URLSearchParams();
    params.set("name__iexact", slug.replace(/-/g, " "));
    params.set("limit", "1");
    const search = await fetchOpen5e<Open5eListResponse<Open5eItemRaw>>(`/magicitems/?${params}`, edition);
    if (search.results.length > 0) return normalizeItem(search.results[0], edition);
    return null;
  } catch {
    return null;
  }
}

/** List classes (12 standard + subclasses) */
export async function listClasses(edition: Edition = DEFAULT_EDITION): Promise<Array<NormalizedClass>> {
  // v2 classes endpoint — fetch only summary fields (no features array — that's huge)
  // Then optionally fetch each class's features separately if needed.
  const params = new URLSearchParams();
  params.set("limit", "200");
  params.set("fields", "key,name,hit_dice,saving_throws,primary_abilities,num_skill_choices,subclasses,skill_proficiencies");
  const res = await fetchOpen5eWithTimeout<Open5eListResponse<Open5eClassRaw>>(`/classes/?${params}`, edition, 15000);
  return res.results.map(c => normalizeClass(c, edition));
}

/** Extended-timeout fetch for slow endpoints (classes with features, etc.) */
async function fetchOpen5eWithTimeout<T>(path: string, edition: Edition = DEFAULT_EDITION, timeoutMs: number = UPSTREAM_TIMEOUT_MS): Promise<T> {
  const url = withEdition(`${OPEN5E_BASE}${path}`, edition);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "dnd-solo-engine/1.0" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Open5e HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/** Get single class by slug — auto-resolves composite key */
export async function getClass(slug: string, edition: Edition = DEFAULT_EDITION): Promise<NormalizedClass | null> {
  try {
    const direct = await fetchOpen5e<Open5eClassRaw>(`/classes/${slug}/`, edition).catch(() => null);
    if (direct) return normalizeClass(direct, edition);
    const params = new URLSearchParams();
    params.set("name__iexact", slug.replace(/-/g, " "));
    params.set("limit", "1");
    const search = await fetchOpen5e<Open5eListResponse<Open5eClassRaw>>(`/classes/?${params}`, edition);
    if (search.results.length > 0) return normalizeClass(search.results[0], edition);
    return null;
  } catch {
    return null;
  }
}

/** List species (formerly "races") */
export async function listSpecies(edition: Edition = DEFAULT_EDITION): Promise<Array<NormalizedSpecies>> {
  const params = new URLSearchParams();
  params.set("limit", "100");
  const res = await fetchOpen5e<Open5eListResponse<Open5eSpeciesRaw>>(`/species/?${params}`, edition);
  return res.results.map(s => normalizeSpecies(s, edition));
}

/** List backgrounds */
export async function listBackgrounds(edition: Edition = DEFAULT_EDITION): Promise<Array<NormalizedBackground>> {
  const params = new URLSearchParams();
  params.set("limit", "100");
  const res = await fetchOpen5e<Open5eListResponse<Open5eBackgroundRaw>>(`/backgrounds/?${params}`, edition);
  return res.results.map(b => normalizeBackground(b, edition));
}

/** List feats */
export async function listFeats(edition: Edition = DEFAULT_EDITION): Promise<Array<NormalizedFeat>> {
  const params = new URLSearchParams();
  params.set("limit", "200");
  const res = await fetchOpen5e<Open5eListResponse<Open5eFeatRaw>>(`/feats/?${params}`, edition);
  return res.results.map(f => normalizeFeat(f, edition));
}

/** List conditions */
export async function listConditions(edition: Edition = DEFAULT_EDITION): Promise<Array<NormalizedCondition>> {
  const params = new URLSearchParams();
  params.set("limit", "100");
  const res = await fetchOpen5e<Open5eListResponse<Open5eConditionRaw>>(`/conditions/?${params}`, edition);
  return res.results.map(c => normalizeCondition(c, edition));
}

/** List weapons (mundane) */
export async function listWeapons(edition: Edition = DEFAULT_EDITION): Promise<Array<NormalizedItem>> {
  const params = new URLSearchParams();
  params.set("limit", "200");
  const res = await fetchOpen5e<Open5eListResponse<Open5eItemRaw>>(`/weapons/?${params}`, edition);
  return res.results.map(w => normalizeItem(w, edition));
}

/** List armor (mundane) */
export async function listArmor(edition: Edition = DEFAULT_EDITION): Promise<Array<NormalizedItem>> {
  const params = new URLSearchParams();
  params.set("limit", "100");
  const res = await fetchOpen5e<Open5eListResponse<Open5eItemRaw>>(`/armor/?${params}`, edition);
  return res.results.map(a => normalizeItem(a, edition));
}

// ============================================================================
// 7b. ENUM / REFERENCE ENDPOINTS — universal D&D 5e/2024 data (no edition filter needed)
// ============================================================================

export interface Open5eAbilityRaw {
  key: string;
  name: string;
  short_desc?: string;
  descriptions?: Array<{ desc: string; document: string; gamesystem: string }>;
  skills?: Array<{ name: string; key: string }>;
  document: any;
}

export interface Open5eSkillRaw {
  key: string;
  name: string;
  ability: string; // e.g. "Strength"
  descriptions?: Array<{ desc: string; document: string; gamesystem: string }>;
  document: any;
}

export interface Open5eDamageTypeRaw {
  key: string;
  name: string;
  descriptions?: Array<{ desc: string; document: string; gamesystem: string }>;
  document: any;
}

export interface Open5eSpellSchoolRaw {
  key: string;
  name: string;
  desc: string;
  document: any;
}

export interface Open5eWeaponPropertyRaw {
  key: string;
  name: string;
  desc: string;
  type: string | null; // "Mastery" | null
  document: any;
}

export interface Open5eSizeRaw {
  key: string;
  name: string;
  rank: number;
  space_diameter: number;
  distance_unit: string;
  suggested_hit_dice: string;
  document: any;
}

export interface Open5eEnvironmentRaw {
  key: string;
  name: string;
  desc: string;
  aquatic: boolean;
  planar: boolean;
  interior: boolean;
  document: any;
}

export interface Open5eAlignmentRaw {
  key: string;
  name: string;
  short_name: string;
  morality: string; // "good" | "neutral" | "evil"
  societal_attitude: string; // "lawful" | "neutral" | "chaotic"
  descriptions?: Array<{ desc: string; document: string; gamesystem: string }>;
  document: any;
}

export interface Open5eLanguageRaw {
  key: string;
  name: string;
  desc: string;
  is_exotic: boolean;
  is_secret: boolean;
  script_language?: string;
  document: any;
}

export interface Open5eItemRarityRaw {
  key: string;
  name: string;
  rank: number;
}

export interface NormalizedAbility {
  key: string;
  name: string;
  shortDesc?: string;
  description?: string;
  skills: string[];
}

export interface NormalizedSkill {
  key: string;
  name: string;
  ability: AbilityName;
  description?: string;
}

export interface NormalizedDamageType {
  key: string;
  name: string;
  description?: string;
}

export interface NormalizedSpellSchool {
  key: string;
  name: string;
  desc: string;
}

export interface NormalizedWeaponProperty {
  key: string;
  name: string;
  desc: string;
  type: string | null;
}

export interface NormalizedSize {
  key: string;
  name: string;
  rank: number;
  spaceDiameter: number;
  suggestedHitDice: string;
}

export interface NormalizedEnvironment {
  key: string;
  name: string;
  desc: string;
  aquatic: boolean;
  planar: boolean;
  interior: boolean;
}

export interface NormalizedAlignment {
  key: string;
  name: string;
  shortName: string;
  morality: string;
  societalAttitude: string;
  description?: string;
}

export interface NormalizedLanguage {
  key: string;
  name: string;
  desc: string;
  isExotic: boolean;
  isSecret: boolean;
  scriptLanguage?: string;
}

export interface NormalizedItemRarity {
  key: string;
  name: string;
  rank: number;
}

/**
 * List the 6 ability scores (STR/DEX/CON/INT/WIS/CHA) with descriptions.
 * Edition filter NOT applied — abilities are universal.
 */
export async function listAbilities(): Promise<Array<NormalizedAbility>> {
  const params = new URLSearchParams();
  params.set("limit", "20");
  const res = await fetchOpen5e<Open5eListResponse<Open5eAbilityRaw>>(`/abilities/?${params}`, "2014");
  return res.results.map(a => ({
    key: a.key,
    name: a.name,
    shortDesc: a.short_desc,
    description: a.descriptions?.[0]?.desc,
    skills: (a.skills ?? []).map(s => s.name),
  }));
}

/** List the 18 standard skills (D&D 5e) + 2 extras (Level Up A5e adds Culture, Society). */
export async function listSkills(): Promise<Array<NormalizedSkill>> {
  const params = new URLSearchParams();
  params.set("limit", "50");
  const res = await fetchOpen5e<Open5eListResponse<Open5eSkillRaw>>(`/skills/?${params}`, "2014");
  return res.results
    .map(s => {
      const abil = parseAbility(s.ability?.toLowerCase() ?? "");
      return {
        key: s.key,
        name: s.name,
        ability: abil ?? "str",
        description: s.descriptions?.[0]?.desc,
      };
    })
    // Filter to the 18 standard 5e skills (omit A5e extras)
    .filter(s => ["athletics","acrobatics","sleight_of_hand","stealth","arcana","history","investigation","nature","religion","animal_handling","insight","medicine","perception","survival","deception","intimidation","performance","persuasion"].includes(s.key));
}

/** List the 13 damage types (acid, bludgeoning, cold, fire, force, lightning, necrotic, piercing, poison, psychic, radiant, slashing, thunder). */
export async function listDamageTypes(): Promise<Array<NormalizedDamageType>> {
  const params = new URLSearchParams();
  params.set("limit", "20");
  const res = await fetchOpen5e<Open5eListResponse<Open5eDamageTypeRaw>>(`/damagetypes/?${params}`, "2014");
  return res.results.map(d => ({
    key: d.key,
    name: d.name,
    description: d.descriptions?.find(x => x.gamesystem === "5e-2024")?.desc ?? d.descriptions?.[0]?.desc,
  }));
}

/** List the 8 spell schools (Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, Transmutation). */
export async function listSpellSchools(): Promise<Array<NormalizedSpellSchool>> {
  const params = new URLSearchParams();
  params.set("limit", "20");
  const res = await fetchOpen5e<Open5eListResponse<Open5eSpellSchoolRaw>>(`/spellschools/?${params}`, "2014");
  return res.results.map(s => ({
    key: s.key,
    name: s.name,
    desc: s.desc,
  }));
}

/** List the 17 weapon properties including 8 D&D 2024 masteries (Cleave/Graze/Nick/Push/Sap/Slow/Topple/Vex). */
export async function listWeaponProperties(): Promise<Array<NormalizedWeaponProperty>> {
  const params = new URLSearchParams();
  params.set("limit", "50");
  const res = await fetchOpen5e<Open5eListResponse<Open5eWeaponPropertyRaw>>(`/weaponproperties/?${params}`, "2024");
  return res.results.map(p => ({
    key: p.key,
    name: p.name,
    desc: p.desc,
    type: p.type,
  }));
}

/** List the 7 creature sizes (Tiny, Small, Medium, Large, Huge, Gargantuan). */
export async function listSizes(): Promise<Array<NormalizedSize>> {
  const params = new URLSearchParams();
  params.set("limit", "20");
  const res = await fetchOpen5e<Open5eListResponse<Open5eSizeRaw>>(`/sizes/?${params}`, "2014");
  return res.results.map(s => ({
    key: s.key,
    name: s.name,
    rank: s.rank,
    spaceDiameter: s.space_diameter,
    suggestedHitDice: s.suggested_hit_dice,
  }));
}

/** List the 31 environments (Arctic, Coast, Desert, Forest, Swamp, Underdark, etc.) — used for encounter tables. */
export async function listEnvironments(): Promise<Array<NormalizedEnvironment>> {
  const params = new URLSearchParams();
  params.set("limit", "100");
  const res = await fetchOpen5e<Open5eListResponse<Open5eEnvironmentRaw>>(`/environments/?${params}`, "2014");
  return res.results.map(e => ({
    key: e.key,
    name: e.name,
    desc: e.desc,
    aquatic: e.aquatic,
    planar: e.planar,
    interior: e.interior,
  }));
}

/** List the 9 alignments (LG, NG, CG, LN, TN, CN, LE, NE, CE). */
export async function listAlignments(): Promise<Array<NormalizedAlignment>> {
  const params = new URLSearchParams();
  params.set("limit", "20");
  const res = await fetchOpen5e<Open5eListResponse<Open5eAlignmentRaw>>(`/alignments/?${params}`, "2014");
  return res.results.map(a => ({
    key: a.key,
    name: a.name,
    shortName: a.short_name,
    morality: a.morality,
    societalAttitude: a.societal_attitude,
    description: a.descriptions?.find(x => x.gamesystem === "5e-2024")?.desc ?? a.descriptions?.[0]?.desc,
  }));
}

/** List the 19 languages (Common, Dwarvish, Elvish, Giant, Gnomish, Goblin, Halfling, Orc, Abyssal, Celestial, Draconic, Deep Speech, Infernal, Primordial, Sylvan, Undercommon, Druidic, Thieves' Cant, etc.). */
export async function listLanguages(): Promise<Array<NormalizedLanguage>> {
  const params = new URLSearchParams();
  params.set("limit", "50");
  const res = await fetchOpen5e<Open5eListResponse<Open5eLanguageRaw>>(`/languages/?${params}`, "2014");
  return res.results.map(l => ({
    key: l.key,
    name: l.name,
    desc: l.desc,
    isExotic: l.is_exotic,
    isSecret: l.is_secret,
    scriptLanguage: l.script_language,
  }));
}

/** List the 6 item rarities (Common, Uncommon, Rare, Very Rare, Legendary, Artifact). */
export async function listItemRarities(): Promise<Array<NormalizedItemRarity>> {
  const params = new URLSearchParams();
  params.set("limit", "20");
  const res = await fetchOpen5e<Open5eListResponse<Open5eItemRarityRaw>>(`/itemrarities/?${params}`, "2014");
  return res.results.map(r => ({
    key: r.key,
    name: r.name,
    rank: r.rank,
  }));
}

/**
 * Federated cross-resource search (v2 only).
 * Returns ranked results across spells, creatures, items, classes, etc.
 */
export async function search(query: string, edition: Edition = DEFAULT_EDITION): Promise<Open5eSearchResult> {
  const params = new URLSearchParams();
  params.set("query", query);
  params.set("document__gamesystem__key", `5e-${edition}`);
  const res = await fetch(`${OPEN5E_BASE}/search/?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) {
    return { count: 0, results: [] };
  }
  const data = await res.json() as any;
  return {
    count: data.count ?? 0,
    results: (data.results ?? []).map((r: any) => ({
      objectName: r.object_name,
      objectModel: r.object_model,
      route: r.route,
      text: r.text ?? "",
      matchScore: r.match_score ?? 0,
      matchType: r.match_type ?? "",
      document: r.document ?? { name: "", key: "" },
    })),
  };
}

// ============================================================================
// 8. CONVERSION HELPERS — convert NormalizedCreature → legacy Combatant shape
// ============================================================================

/**
 * Convert a normalized creature (from Open5e) into the legacy combatant shape
 * that DnDSolo.tsx expects (matches BESTIARY entry structure).
 * Uses structured attacks[] for accurate to_hit + damage dice (no more text parsing!).
 */
export function creatureToLegacyCombatant(c: NormalizedCreature): {
  th: string; ac: number; hp: number; atk: number; dmg: string;
  init: number; xp: number; sv: Record<string, number>;
  resistances?: string[]; vulnerabilities?: string[]; immunities?: string[];
  cr: number;
  traits: NormalizedCreatureAction[];
  actions: NormalizedCreatureAction[];
  legendaryActions: NormalizedCreatureAction[];
  reactions: NormalizedCreatureAction[];
  bonusActions: NormalizedCreatureAction[];
  // NEW: structured attacks for proper combat engine
  structuredAttacks: NormalizedCreatureAttack[];
  passivePerception: number;
  abilities: NormalizedCreature["abilities"];
  modifiers?: NormalizedCreature["modifiers"];
  skills: Record<string, number>;
  proficiencyBonus?: number;
  initiativeBonus?: number;
  environments: Array<{ name: string; key: string }>;
  size: string;
  type: string;
  subtype?: string;
  alignment: string;
  senses: string;
  languages: string;
  darkvision?: number;
  blindsight?: number;
  tremorsense?: number;
  truesight?: number;
  illustration?: string | null;
} {
  // CR → PB estimate (D&D 5e/2024 MM table)
  const pb = c.proficiencyBonus ?? (
    c.cr < 1 ? 2 :
    c.cr <= 4 ? 2 :
    c.cr <= 8 ? 3 :
    c.cr <= 12 ? 4 :
    c.cr <= 16 ? 5 : 6
  );
  const dexMod = c.modifiers?.dex ?? Math.floor((c.abilities.dex - 10) / 2);
  const strMod = c.modifiers?.str ?? Math.floor((c.abilities.str - 10) / 2);
  const init = c.initiativeBonus ?? dexMod;
  // Find first attack action with structured attacks[] for primary atk/dmg
  const firstAttackAction = c.actions.find(a => a.attacks.length > 0);
  const firstAttack = firstAttackAction?.attacks[0];
  const atk = firstAttack?.toHit ?? (pb + Math.max(strMod, dexMod));
  const dmg = firstAttack
    ? `${firstAttack.damageDice ?? "1d6"}${firstAttack.damageBonus ? `+${firstAttack.damageBonus}` : ""}`
    : "1d6+2";
  // Collect all structured attacks across all actions for combat engine use
  const structuredAttacks: NormalizedCreatureAttack[] = [];
  for (const a of c.actions) {
    for (const atk of a.attacks) {
      structuredAttacks.push(atk);
    }
  }
  return {
    th: c.name,
    ac: c.ac,
    hp: c.hp,
    atk,
    dmg,
    init,
    xp: c.xp,
    sv: {
      dex: c.saves.dex ?? dexMod,
      con: c.saves.con ?? (c.modifiers?.con ?? Math.floor((c.abilities.con - 10) / 2)),
      wis: c.saves.wis ?? (c.modifiers?.wis ?? Math.floor((c.abilities.wis - 10) / 2)),
      str: c.saves.str ?? strMod,
      int: c.saves.int ?? (c.modifiers?.int ?? Math.floor((c.abilities.int - 10) / 2)),
      cha: c.saves.cha ?? (c.modifiers?.cha ?? Math.floor((c.abilities.cha - 10) / 2)),
    },
    resistances: c.damageResistances,
    vulnerabilities: c.damageVulnerabilities,
    immunities: c.damageImmunities,
    cr: c.cr,
    traits: c.traits,
    actions: c.actions,
    legendaryActions: c.legendaryActions,
    reactions: c.reactions,
    bonusActions: c.bonusActions,
    structuredAttacks,
    passivePerception: c.passivePerception,
    abilities: c.abilities,
    modifiers: c.modifiers,
    skills: c.skills,
    proficiencyBonus: pb,
    initiativeBonus: c.initiativeBonus,
    environments: c.environments,
    size: c.size,
    type: c.type,
    subtype: c.subtype,
    alignment: c.alignment,
    senses: c.senses,
    languages: c.languages,
    darkvision: c.darkvision,
    blindsight: c.blindsight,
    tremorsense: c.tremorsense,
    truesight: c.truesight,
    illustration: c.illustration,
  };
}
