/**
 * domains.ts — Single import point for all 30 D&D engine domains.
 *
 * Re-exports every domain module so callers can `import { ... } from "@/lib/domains"`.
 * Also exposes a DOMAINS metadata table the AI DM can introspect.
 *
 * Domain index:
 *   1. Dice Engine        2. Roll Resolver       3. Skills
 *   4. Action System      5. Combat              6. Character
 *   7. Movement           8. Conditions          9. Effects
 *  10. Magic              11. Features           12. Resources
 *  13. Equipment          14. Items              15. Inventory
 *  16. Objects            17. Environment         18. Terrain
 *  19. Vision             20. Stealth             21. Cover
 *  22. Exploration        23. Social              24. Rest
 *  25. Time               26. Monsters            27. World
 *  28. Rule Engine        29. Events              30. AoE
 *  31. Game State         32. SRD Client
 *
 * Note: numbering follows the user's spec (1-30); SRD is an auxiliary client.
 */

// Core engine
export * as diceEngine from "./diceEngine.js";
export * as rollResolver from "./rollResolver.js";
export * as skills from "./skills.js";
export * as actionSystem from "./actionSystem.js";
export * as combat from "./combat.js";
export * as character from "./character.js";
export * as movement from "./movement.js";
export * as conditions from "./conditions.js";
export * as effects from "./effects.js";
export * as magic from "./magic.js";
export * as features from "./features.js";
export * as resources from "./resources.js";
export * as equipment from "./equipment.js";
export * as items from "./items.js";
export * as inventory from "./inventory.js";
export * as objects from "./objects.js";
export * as environment from "./environment.js";
export * as terrain from "./terrain.js";
export * as vision from "./vision.js";
export * as stealth from "./stealth.js";
export * as cover from "./cover.js";

// Higher-order (21-30)
export * as exploration from "./exploration.js";
export * as social from "./social.js";
export * as rest from "./rest.js";
export * as time from "./time.js";
export * as monsters from "./monsters.js";
export * as world from "./world.js";
export * as ruleEngine from "./ruleEngine.js";
export * as events from "./events.js";
export * as aoe from "./aoe.js";
export * as gameState from "./gameState.js";

// AI DM Layer (Domain 31-35)
export * as dialogue from "./dialogue.js";
export * as planning from "./planning.js";
export * as narrative from "./narrative.js";
export * as encounter from "./encounter.js";
export * as content from "./content.js";

// Auxiliary
export * as srd from "./srd.js";
export * as gameData from "./gameData.js";
export * as spells from "./spells.js";

/* ---------- Domain metadata (for AI DM introspection) ---------- */

export interface DomainMeta {
  id: number;
  name: string;
  nameTh: string;
  module: string;
  description: string;
  subSystems: string[];
}

export const DOMAINS: DomainMeta[] = [
  {
    id: 1, name: "Dice Engine", nameTh: "ระบบลูกเต๋า", module: "diceEngine",
    description: "Pure dice: parse, roll, advantage/disadvantage, crit, bonus/penalty dice, reroll, replace",
    subSystems: ["parse", "roll", "advantage", "crit", "bonus_penalty", "reroll", "replace", "context"],
  },
  {
    id: 2, name: "Roll Resolver", nameTh: "ตัวแก้ทอย", module: "rollResolver",
    description: "D&D roll types: ability check, skill, save, attack, damage, heal, initiative, death save, contest",
    subSystems: ["ability_check", "skill", "save", "attack", "damage", "heal", "initiative", "death_save", "contest"],
  },
  {
    id: 3, name: "Skills", nameTh: "ทักษะ", module: "skills",
    description: "16 sub-systems + Intent Analysis 2-step flow, flexible ability+skill pairing",
    subSystems: ["intent_analysis", "check_resolution", "ability_pairing", "expertise", "advantage_sources"],
  },
  {
    id: 4, name: "Action System", nameTh: "ระบบการกระทำ", module: "actionSystem",
    description: "25+ actions with metadata, getAvailableActions() filter",
    subSystems: ["action_metadata", "availability", "action_economy", "cost_resolution"],
  },
  {
    id: 5, name: "Combat", nameTh: "การต่อสู้", module: "combat",
    description: "17 sub-systems Combat Flow Controller, delegates to other modules",
    subSystems: ["flow_controller", "initiative", "turn_order", "attack_resolution", "damage_pipeline"],
  },
  {
    id: 6, name: "Character", nameTh: "ตัวละคร", module: "character",
    description: "Root Entity aggregator with references",
    subSystems: ["aggregator", "references", "ability_scores", "proficiency"],
  },
  {
    id: 7, name: "Movement", nameTh: "การเคลื่อนที่", module: "movement",
    description: "3-layer (Capability/Execution/Resolution) + pathfinding",
    subSystems: ["capability", "execution", "resolution", "pathfinding", "difficult_terrain"],
  },
  {
    id: 8, name: "Conditions", nameTh: "สภาวะ", module: "conditions",
    description: "15 standard D&D conditions, 10 sub-systems, NOT buffs/debuffs",
    subSystems: ["standard_conditions", "application", "removal", "interaction_rules"],
  },
  {
    id: 9, name: "Effects", nameTh: "เอฟเฟกต์", module: "effects",
    description: "Effects Engine: 18 effects, modifiers, concentration",
    subSystems: ["effect_engine", "modifiers", "concentration", "duration_tracking"],
  },
  {
    id: 10, name: "Magic", nameTh: "เวทมนตร์", module: "magic",
    description: "17 sub-systems + convertSRDSpell() for SRD sync",
    subSystems: ["spell_casting", "slots", "concentration", "ritual", "school_specialization"],
  },
  {
    id: 11, name: "Features", nameTh: "คุณสมบัติพิเศษ", module: "features",
    description: "15 sub-systems, 28 features, 100% data-driven",
    subSystems: ["feature_registry", "trigger", "recharge", "scaling"],
  },
  {
    id: 12, name: "Resources", nameTh: "ทรัพยากร", module: "resources",
    description: "18 sub-systems, ResourceRegistry class, not tied to class",
    subSystems: ["resource_registry", "pool", "recharge", "spend", "restore"],
  },
  {
    id: 13, name: "Equipment", nameTh: "อุปกรณ์", module: "equipment",
    description: "9 sub-systems: 16 slots, weapons, armor, proficiency, attunement",
    subSystems: ["slots", "weapons", "armor", "proficiency", "attunement"],
  },
  {
    id: 14, name: "Items", nameTh: "ไอเทม", module: "items",
    description: "8 sub-systems: consumables, magic items, charges, identification, SRD sync",
    subSystems: ["consumables", "magic_items", "charges", "identification"],
  },
  {
    id: 15, name: "Inventory", nameTh: "กระเป๋า", module: "inventory",
    description: "7 sub-systems: containers, weight/encumbrance, currency, loot",
    subSystems: ["containers", "weight", "encumbrance", "currency", "loot"],
  },
  {
    id: 16, name: "Objects", nameTh: "วัตถุ", module: "objects",
    description: "7 sub-systems: doors, chests, traps, triggers",
    subSystems: ["doors", "chests", "traps", "triggers", "interactables"],
  },
  {
    id: 17, name: "Environment", nameTh: "สภาพแวดล้อม", module: "environment",
    description: "9 sub-systems: state, weather, lighting, temperature, hazards, natural, magical, interaction, events",
    subSystems: ["state", "weather", "lighting", "temperature", "hazards", "natural_effects", "magical", "interaction", "events"],
  },
  {
    id: 18, name: "Terrain", nameTh: "ภูมิประเทศ", module: "terrain",
    description: "7 sub-systems: types, movement cost, features, advantage, restriction, interaction, generation",
    subSystems: ["types", "movement_cost", "features", "advantage", "restriction", "interaction", "generation"],
  },
  {
    id: 19, name: "Vision & Senses", nameTh: "การมองเห็น", module: "vision",
    description: "8 sub-systems: vision types, light detection, line of sight, visibility, hearing, smell, passive perception, detection",
    subSystems: ["vision_types", "light_detection", "line_of_sight", "visibility", "hearing", "smell", "passive_perception", "detection"],
  },
  {
    id: 20, name: "Stealth & Detection", nameTh: "การซ่อนและตรวจจับ", module: "stealth",
    description: "7 sub-systems: hide, stealth check, hidden state, detection, invisibility, surprise, tracking",
    subSystems: ["hide", "stealth_check", "hidden_state", "detection", "invisibility", "surprise", "tracking"],
  },
  {
    id: 21, name: "Cover & Positioning", nameTh: "การบังและตำแหน่ง", module: "cover",
    description: "9 sub-systems: position, distance, cover types, calculation, line of attack, height, area positioning, forced movement, events",
    subSystems: ["position", "distance", "cover_types", "calculation", "line_of_attack", "height", "area_positioning", "forced_movement", "events"],
  },
  {
    id: 22, name: "Exploration", nameTh: "การสำรวจ", module: "exploration",
    description: "10 sub-systems: mode, travel, pace, navigation, turn, search, investigation, traps, triggers, events",
    subSystems: ["mode", "travel", "travel_pace", "navigation", "exploration_turn", "search", "investigation", "traps", "trap_trigger", "events"],
  },
  {
    id: 23, name: "Social", nameTh: "สังคม", module: "social",
    description: "8 sub-systems: interaction, NPC attitude, dialogue, social checks, influence, reputation, bargaining, information",
    subSystems: ["interaction", "npc_attitude", "dialogue", "social_checks", "influence", "reputation", "bargaining", "information"],
  },
  {
    id: 24, name: "Rest & Recovery", nameTh: "การพักและฟื้นฟู", module: "rest",
    description: "7 sub-systems: rest type, short rest, long rest, requirement, interruption, recovery rules, downtime",
    subSystems: ["rest_type", "short_rest", "long_rest", "requirement", "interruption", "recovery_rules", "downtime"],
  },
  {
    id: 25, name: "Time", nameTh: "เวลา", module: "time",
    description: "6 sub-systems: time scale, combat time, duration, timer, calendar, time events",
    subSystems: ["time_scale", "combat_time", "duration", "timer", "calendar", "time_events"],
  },
  {
    id: 26, name: "Monsters & NPCs", nameTh: "มอนสเตอร์และ NPC", module: "monsters",
    description: "7 sub-systems: creature base, stats, actions, abilities, AI behavior, NPC data, creature state",
    subSystems: ["creature_base", "stats", "actions", "abilities", "ai_behavior", "npc_data", "creature_state"],
  },
  {
    id: 27, name: "World & Campaign", nameTh: "โลกและแคมเปญ", module: "world",
    description: "7 sub-systems: world map, location, quest, campaign state, faction, lore, economy",
    subSystems: ["world_map", "location", "quest", "campaign_state", "faction", "lore", "economy"],
  },
  {
    id: 28, name: "Rule Engine", nameTh: "เอนจินกฎ", module: "ruleEngine",
    description: "4 sub-systems: validation, resolution, modifier, conflict",
    subSystems: ["validation", "resolution", "modifier", "conflict"],
  },
  {
    id: 29, name: "Event & Trigger", nameTh: "เหตุการณ์และทริกเกอร์", module: "events",
    description: "4 sub-systems: event type, trigger condition, listener, event chain",
    subSystems: ["event_type", "trigger_condition", "listener", "event_chain"],
  },
  {
    id: 30, name: "Area of Effect", nameTh: "พื้นที่ผลกระทบ", module: "aoe",
    description: "4 sub-systems: shape, calculation, target selection, effect",
    subSystems: ["shape", "calculation", "target_selection", "effect"],
  },
  {
    id: 31, name: "Game State", nameTh: "สถานะเกม", module: "gameState",
    description: "5 sub-systems: character state, world state, combat state, persistence, state update",
    subSystems: ["character_state", "world_state", "combat_state", "persistence", "state_update"],
  },
  {
    id: 32, name: "Dialogue Engine", nameTh: "เอนจินสนทนา", module: "dialogue",
    description: "8 sub-systems: conversation state, intent analysis, emotion tracking, memory, response generation, branch tracking, context, termination",
    subSystems: ["conversation_state", "intent_analysis", "emotion_tracking", "memory_layer", "response_generation", "branch_tracking", "conversation_context", "termination"],
  },
  {
    id: 33, name: "AI Planning Engine", nameTh: "เอนจินวางแผน AI", module: "planning",
    description: "8 sub-systems: goal system, strategy selection, decision tree, prediction, action selection, replanning, multi-agent coordination, risk assessment",
    subSystems: ["goal_system", "strategy_selection", "decision_tree", "prediction", "action_selection", "replanning", "multi_agent_coordination", "risk_assessment"],
  },
  {
    id: 34, name: "Narrative Engine", nameTh: "เอนจินเนื้อเรื่อง", module: "narrative",
    description: "8 sub-systems: story arc, scene management, branching narrative, consequence tracking, pacing engine, foreshadowing, theme tracking, narration generator",
    subSystems: ["story_arc", "scene_management", "branching_narrative", "consequence_tracking", "pacing_engine", "foreshadowing", "theme_tracking", "narration_generator"],
  },
  {
    id: 35, name: "Encounter Engine", nameTh: "เอนจินเหตุการณ์", module: "encounter",
    description: "8 sub-systems: encounter type, difficulty calculator, encounter generator, reward calculator, encounter tables, encounter modifiers, encounter budget, wave encounters",
    subSystems: ["encounter_type", "difficulty_calculator", "encounter_generator", "reward_calculator", "encounter_tables", "encounter_modifiers", "encounter_budget", "wave_encounters"],
  },
  {
    id: 36, name: "Content Management", nameTh: "การจัดการเนื้อหา", module: "content",
    description: "8 sub-systems: content registry, content importer, homebrew manager, content validator, version tracker, content diff, content exporter, content pack system",
    subSystems: ["content_registry", "content_importer", "homebrew_manager", "content_validator", "version_tracker", "content_diff", "content_exporter", "content_pack_system"],
  },
];

export function getDomainById(id: number): DomainMeta | undefined {
  return DOMAINS.find((d) => d.id === id);
}

export function getDomainByModule(moduleName: string): DomainMeta | undefined {
  return DOMAINS.find((d) => d.module === moduleName);
}

export function listAllDomains(): DomainMeta[] {
  return DOMAINS;
}
