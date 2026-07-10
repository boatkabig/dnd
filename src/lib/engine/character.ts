/**
 * ============================================================================
 * D&D Engine Design Document — Chapter 01: Character System
 * ============================================================================
 *
 * Version: 1.0
 * Target: D&D 5e / 2024 Compatible
 * Architecture: Data Driven + AI DM Ready
 *
 * Core Principles:
 *   1. Character = Aggregate Root — เก็บข้อมูลเท่านั้น, ไม่มี logic ของเกม
 *   2. Character เป็นเพียง Owner ของข้อมูล — อ้างอิงไปยังระบบอื่น (Combat, Magic, Inventory, Effects)
 *   3. ทุกสิ่งที่มี HP + Ability Score + ใช้ Action = Character (Player, NPC, Monster, Summon, Companion, Boss)
 *   4. ECS-style: Character มี Character Type ที่กำหนดว่ามี component อะไรบ้าง
 *   5. Data-Driven: เพิ่ม Class/Species/Homebrew ได้โดยไม่ต้องแก้โค้ดหลัก
 *   6. AI DM จัดการทุกสิ่งผ่านอินเทอร์เฟซเดียว
 *
 * Character Architecture:
 *   Character
 *   ├── Identity
 *   ├── Species
 *   ├── Classes[]
 *   ├── Background
 *   ├── Level
 *   ├── Ability Scores
 *   ├── Skills
 *   ├── Saving Throws
 *   ├── Languages
 *   ├── Speed
 *   ├── Size
 *   ├── Creature Type
 *   ├── Tags
 *   ├── Relationships
 *   ├── Inventory Ref
 *   ├── Equipment Ref
 *   ├── Feature Ref
 *   ├── Spellbook Ref
 *   ├── Resource Ref
 *   ├── Effect Ref
 *   ├── Condition Ref
 *   └── Metadata
 * ============================================================================
 */

// ============================================================================
// 4. IDENTITY
// ============================================================================

export interface CharacterIdentity {
  characterId: string;          // unique UUID
  name: string;                 // "Gandalf"
  displayName?: string;         // "Gandalf the Grey" (for UI)
  portrait?: string;            // image URL
  token?: string;               // token image URL for grid
  playerId?: string;            // if player character, which player owns it
  ownerId?: string;             // for summons/companions: who summoned them
  // Metadata
  age?: string;
  gender?: string;
  height?: string;
  weight?: string;
  faith?: string;
  alignment?: string;           // D&D 2024: optional, reduced role
  // Extensible — new fields can be added without breaking
  [key: string]: unknown;
}

// ============================================================================
// 5. CHARACTER TYPE
// ============================================================================

export type CharacterType =
  | "player"
  | "npc"
  | "monster"
  | "summon"
  | "companion"
  | "vehicle"
  | "object_creature";

/**
 * Each CharacterType determines which components are active.
 * Monster: no inventory (simplified), has AI behavior
 * Player: has inventory, equipment, spellbook
 * Summon: has ownerId, limited lifespan
 */
export interface CharacterTypeConfig {
  type: CharacterType;
  hasInventory: boolean;
  hasEquipment: boolean;
  hasSpellbook: boolean;
  hasResources: boolean;
  hasFeatures: boolean;
  hasAI: boolean;               // tactical AI for combat decisions
  hasRelationships: boolean;
  canLevelUp: boolean;
  canMulticlass: boolean;
  canDie: boolean;              // summons might just disappear
  canRest: boolean;
}

export const CHARACTER_TYPE_CONFIGS: Record<CharacterType, CharacterTypeConfig> = {
  player: {
    type: "player", hasInventory: true, hasEquipment: true, hasSpellbook: true,
    hasResources: true, hasFeatures: true, hasAI: false, hasRelationships: true,
    canLevelUp: true, canMulticlass: true, canDie: true, canRest: true,
  },
  npc: {
    type: "npc", hasInventory: true, hasEquipment: true, hasSpellbook: true,
    hasResources: true, hasFeatures: true, hasAI: true, hasRelationships: true,
    canLevelUp: false, canMulticlass: false, canDie: true, canRest: true,
  },
  monster: {
    type: "monster", hasInventory: false, hasEquipment: false, hasSpellbook: false,
    hasResources: true, hasFeatures: true, hasAI: true, hasRelationships: false,
    canLevelUp: false, canMulticlass: false, canDie: true, canRest: false,
  },
  summon: {
    type: "summon", hasInventory: false, hasEquipment: false, hasSpellbook: false,
    hasResources: false, hasFeatures: true, hasAI: true, hasRelationships: false,
    canLevelUp: false, canMulticlass: false, canDie: false, canRest: false,
  },
  companion: {
    type: "companion", hasInventory: true, hasEquipment: true, hasSpellbook: false,
    hasResources: true, hasFeatures: true, hasAI: true, hasRelationships: true,
    canLevelUp: true, canMulticlass: false, canDie: true, canRest: true,
  },
  vehicle: {
    type: "vehicle", hasInventory: false, hasEquipment: false, hasSpellbook: false,
    hasResources: false, hasFeatures: false, hasAI: false, hasRelationships: false,
    canLevelUp: false, canMulticlass: false, canDie: true, canRest: false,
  },
  object_creature: {
    type: "object_creature", hasInventory: false, hasEquipment: false, hasSpellbook: false,
    hasResources: false, hasFeatures: false, hasAI: false, hasRelationships: false,
    canLevelUp: false, canMulticlass: false, canDie: true, canRest: false,
  },
};

// ============================================================================
// 6. CHARACTER LIFECYCLE (State Machine)
// ============================================================================

export type CharacterLifecycleState =
  | "created"     // just created, not yet spawned
  | "spawned"     // placed in world, ready to act
  | "active"      // normal operating state
  | "downed"      // HP <= 0, making death saves
  | "dead"        // HP <= 0 + 3 death save failures
  | "removed";    // removed from the game world

export const LIFECYCLE_TRANSITIONS: Record<CharacterLifecycleState, CharacterLifecycleState[]> = {
  created: ["spawned", "removed"],
  spawned: ["active", "removed"],
  active: ["downed", "dead", "removed"],
  downed: ["active", "dead", "removed"],  // can be revived or die
  dead: ["removed"],                       // dead can only be removed (or resurrected externally)
  removed: [],                             // terminal state
};

export function canTransition(from: CharacterLifecycleState, to: CharacterLifecycleState): boolean {
  return LIFECYCLE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ============================================================================
// 8. SPECIES
// ============================================================================

export type CreatureSize = "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";

export type CreatureType =
  | "aberration" | "beast" | "celestial" | "construct" | "dragon"
  | "elemental" | "fey" | "fiend" | "giant" | "humanoid"
  | "monstrosity" | "ooze" | "plant" | "undead";

export interface SpeedSet {
  walk: number;       // ft
  fly?: number;       // ft (hover if same as walk)
  swim?: number;      // ft
  climb?: number;     // ft
  burrow?: number;    // ft
  // Modifiers (from effects, conditions, armor)
  walkModifier?: number;
  flyModifier?: number;
}

export interface SpeciesDef {
  id: string;
  name: string;
  nameTh?: string;
  size: CreatureSize;
  creatureType: CreatureType;
  speed: SpeedSet;
  // Traits (Darkvision, Fey Ancestry, etc.) — each is a Feature reference
  traitIds: string[];
  // Languages granted by species
  languages: string[];
  // Ability score bonuses (D&D 2024: species give fixed bonuses, not choice)
  abilityBonuses?: Partial<Record<AbilityName, number>>;
  // Subspecies (High Elf, Hill Dwarf, etc.)
  subspecies?: Array<{
    id: string;
    name: string;
    traitIds: string[];
    abilityBonuses?: Partial<Record<AbilityName, number>>;
  }>;
}

// ============================================================================
// 9. BACKGROUND
// ============================================================================

export interface BackgroundDef {
  id: string;
  name: string;
  nameTh?: string;
  // Skills granted
  skillProficiencies: string[];
  // Tool proficiencies
  toolProficiencies: string[];
  // Languages granted
  languages: string[];
  // Starting equipment
  equipment: string[];
  // D&D 2024: Origin Feat
  originFeatId?: string;
  // D&D 2024: ASI (player chooses +2/+1 or +1/+1/+1 from suggested abilities)
  suggestedAsi?: {
    primary: AbilityName[];   // +2 (or first +1)
    secondary: AbilityName[]; // +1
  };
  // Roleplay suggestions
  personalityTraits?: string[];
  ideals?: string[];
  bonds?: string[];
  flaws?: string[];
}

// ============================================================================
// 10-11. CLASS & SUBCLASS
// ============================================================================

export interface ClassDef {
  id: string;
  name: string;
  nameTh?: string;
  hitDie: number;           // d6, d8, d10, d12
  savingThrows: AbilityName[];
  // Spellcasting
  spellcasting?: {
    ability: AbilityName;
    ritualCasting: boolean;
    spellbookType: "spellbook" | "prepared" | "known" | "pact_magic";
  };
  // Proficiencies
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  skillChoices: { count: number; from: string[] };
  // Starting equipment
  startingEquipment: string[];
  // Feature progression: level → feature IDs
  featuresByLevel: Record<number, string[]>;
  // Subclass options at level 1, 2, or 3
  subclassLevel: number;
  subclasses: string[]; // subclass IDs
}

export interface SubclassDef {
  id: string;
  name: string;
  parentClassId: string;
  featuresByLevel: Record<number, string[]>;
}

// ============================================================================
// 12-13. LEVEL & EXPERIENCE
// ============================================================================

export type ExperienceSystem = "xp" | "milestone" | "story" | "custom";

export interface ClassLevelEntry {
  classId: string;
  className: string;
  level: number;
  subclassId?: string;
}

export interface LevelData {
  // Total character level (sum of all class levels)
  totalLevel: number;
  // Individual class levels (supports multiclass)
  classLevels: ClassLevelEntry[];
  // Experience
  xpSystem: ExperienceSystem;
  xp: number;
  xpToNextLevel: number;
  // Proficiency bonus (derived from totalLevel, but stored for quick access)
  proficiencyBonus: number;
}

// ============================================================================
// 14-15. ABILITY SCORES
// ============================================================================

export type AbilityName = "str" | "dex" | "con" | "int" | "wis" | "cha";

export interface AbilityScore {
  name: AbilityName;
  base: number;              // natural score (e.g. 15)
  // Override: sets score to a fixed value (e.g. Belt of Giant Strength sets STR to 21)
  override?: number;         // if set, this replaces base for modifier calculation
  // Temporary bonuses (from effects — e.g. Bull's Strength +2d4)
  temporaryBonuses: Array<{
    source: string;          // effect ID
    value: number;           // +2, +1d4, etc.
    durationType: "rounds" | "minutes" | "hours" | "until_long_rest" | "permanent";
    duration?: number;
  }>;
}

/**
 * Calculate effective ability score:
 *   1. Start with base
 *   2. If override exists, use override instead of base
 *   3. Add all temporary bonuses
 *   4. Cap at 30 (D&D 5e max) unless overridden by effect
 */
export function getEffectiveScore(score: AbilityScore): number {
  const effective = score.override ?? score.base;
  const bonuses = score.temporaryBonuses.reduce((sum, b) => sum + b.value, 0);
  return Math.min(30, effective + bonuses);
}

/**
 * Calculate ability modifier: floor((score - 10) / 2)
 * Never store modifier — always compute from score
 */
export function getAbilityModifier(score: AbilityScore): number {
  return Math.floor((getEffectiveScore(score) - 10) / 2);
}

// ============================================================================
// 16. PROFICIENCY BONUS
// ============================================================================

/** Proficiency bonus table by total character level */
export const PROFICIENCY_BONUS_TABLE: Record<number, number> = {
  1: 2, 2: 2, 3: 2, 4: 2,
  5: 3, 6: 3, 7: 3, 8: 3,
  9: 4, 10: 4, 11: 4, 12: 4,
  13: 5, 14: 5, 15: 5, 16: 5,
  17: 6, 18: 6, 19: 6, 20: 6,
};

export function getProficiencyBonus(totalLevel: number): number {
  return PROFICIENCY_BONUS_TABLE[Math.min(20, Math.max(1, totalLevel))] ?? 2;
}

// ============================================================================
// 17. SAVING THROWS
// ============================================================================

export interface SavingThrow {
  ability: AbilityName;
  proficient: boolean;
  expertise: boolean;        // double proficiency (rare, but exists)
  // Override modifiers (from effects — e.g. Ring of Protection +1)
  overrideModifiers: Array<{
    source: string;
    value: number;
  }>;
}

export function getSaveModifier(
  save: SavingThrow,
  abilityModifier: number,
  proficiencyBonus: number,
): number {
  let mod = abilityModifier;
  if (save.proficient) mod += proficiencyBonus;
  if (save.expertise) mod += proficiencyBonus; // double prof
  mod += save.overrideModifiers.reduce((s, m) => s + m.value, 0);
  return mod;
}

// ============================================================================
// 18. SKILLS (Object, not flat field)
// ============================================================================

export interface SkillInstance {
  skillId: string;           // "stealth", "athletics", etc.
  ability: AbilityName;      // which ability this skill uses
  proficient: boolean;
  expertise: boolean;        // double proficiency
  // Override ability (some skills can use different abilities)
  abilityOverride?: AbilityName;  // e.g. Athletics with STR vs DEX
  // Effect modifiers (Guidance +1d4, Jack of All Trades +half prof, etc.)
  modifiers: Array<{
    source: string;          // effect ID or feature ID
    value: number;           // flat bonus
    diceBonus?: string;      // "1d4" for Guidance
    type: "bonus" | "advantage" | "disadvantage";
  }>;
}

export function getSkillModifier(
  skill: SkillInstance,
  abilityModifier: number,
  proficiencyBonus: number,
): number {
  let mod = abilityModifier;
  if (skill.proficient) mod += proficiencyBonus;
  if (skill.expertise) mod += proficiencyBonus;
  mod += skill.modifiers
    .filter(m => m.type === "bonus")
    .reduce((s, m) => s + m.value, 0);
  return mod;
}

export function hasSkillAdvantage(skill: SkillInstance): boolean {
  return skill.modifiers.some(m => m.type === "advantage");
}

export function hasSkillDisadvantage(skill: SkillInstance): boolean {
  return skill.modifiers.some(m => m.type === "disadvantage");
}

// ============================================================================
// 19. LANGUAGES
// ============================================================================

export interface LanguageKnowledge {
  languageId: string;        // "common", "elvish", "draconic"
  source: "species" | "background" | "class" | "feat" | "learned";
  // AI DM uses this to determine if NPC can communicate with player
}

// ============================================================================
// 20. SIZE
// ============================================================================

export const SIZE_SPACE: Record<CreatureSize, number> = {
  tiny: 2.5, small: 5, medium: 5, large: 10, huge: 15, gargantuan: 20,
};

export const SIZE_REACH: Record<CreatureSize, number> = {
  tiny: 0, small: 5, medium: 5, large: 5, huge: 10, gargantuan: 15,
};

// ============================================================================
// 22. CREATURE TYPE
// ============================================================================

export type CreatureTag =
  | "fire" | "holy" | "undead" | "boss" | "quest" | "summoned"
  | "elite" | "minion" | "legendary" | "lair" | "friendly" | "hostile"
  | "neutral" | "vendor" | "quest_giver" | "immortal" | "shapechanger"
  | string; // extensible

// ============================================================================
// 24. CHARACTER STATUS (not Condition)
// ============================================================================

export type CharacterStatus =
  | "alive"
  | "dead"
  | "stable"         // downed but stable (3 death save successes)
  | "unconscious"    // downed, making death saves
  | "missing"        // removed from current scene but not dead
  | "captured"       // captured by enemies
  | "petrified_permanent";  // petrified with no duration

// ============================================================================
// 26. CHARACTER RELATIONSHIPS
// ============================================================================

export interface CharacterRelationship {
  targetCharacterId: string;
  type: "party" | "faction" | "guild" | "family" | "enemy" | "owner" | "summoner" | "mentor" | "student";
  description?: string;
  // Dynamic relationship score (-100 to +100)
  score?: number;
}

// ============================================================================
// 27. CHARACTER METADATA
// ============================================================================

export interface CharacterMetadata {
  biography?: string;
  notes?: string;
  backstory?: string;
  playerNote?: string;
  dmNote?: string;
  // Custom extensible fields
  custom?: Record<string, unknown>;
}

// ============================================================================
// 28. COMPONENT REFERENCES
// ============================================================================

/**
 * Character doesn't store full data of subsystems — only references.
 * This keeps Character lightweight and prevents circular dependencies.
 */
export interface ComponentRefs {
  inventoryId?: string;      // → Inventory system
  equipmentId?: string;      // → Equipment system
  spellbookId?: string;      // → Spellbook system
  resourceId?: string;       // → Resource system
  featureListId?: string;    // → Feature system
  effectIds: string[];       // → Effect system (active effects on this character)
  conditionIds: string[];    // → Condition system (active conditions on this character)
}

// ============================================================================
// 29. CHARACTER EVENTS
// ============================================================================

export type CharacterEvent =
  | "on_create" | "on_spawn" | "on_death" | "on_level_up"
  | "on_rest" | "on_move" | "on_attack" | "on_damage" | "on_heal"
  | "on_remove" | "on_downed" | "on_revived" | "on_condition_applied"
  | "on_condition_removed" | "on_effect_applied" | "on_effect_removed";

export interface CharacterEventPayload {
  characterId: string;
  eventType: CharacterEvent;
  timestamp: number;
  data?: Record<string, unknown>;
}

// ============================================================================
// 31. CHARACTER DATA MODEL (Aggregate Root)
// ============================================================================

/**
 * Character = Aggregate Root
 *
 * This is the SINGLE source of truth for a character's identity and stats.
 * All other systems (Combat, Magic, Inventory, Effects) reference this.
 *
 * Character does NOT contain game logic — it's purely a data container.
 * Game logic lives in the respective system modules.
 */
export interface Character {
  // === Identity (Section 4) ===
  identity: CharacterIdentity;

  // === Type (Section 5) ===
  type: CharacterType;
  typeConfig: CharacterTypeConfig;

  // === Lifecycle (Section 6) ===
  lifecycleState: CharacterLifecycleState;
  status: CharacterStatus;

  // === Species (Section 8) ===
  species: SpeciesDef;
  subspeciesId?: string;

  // === Background (Section 9) ===
  background?: BackgroundDef;

  // === Class & Subclass (Sections 10-11) ===
  // Multiclass: array of class level entries

  // === Level & Experience (Sections 12-13) ===
  level: LevelData;

  // === Ability Scores (Section 14) ===
  abilityScores: Record<AbilityName, AbilityScore>;

  // === Saving Throws (Section 17) ===
  savingThrows: Record<AbilityName, SavingThrow>;

  // === Skills (Section 18) ===
  skills: Record<string, SkillInstance>;

  // === Languages (Section 19) ===
  languages: LanguageKnowledge[];

  // === Speed (Section 21) ===
  speed: SpeedSet;

  // === Tags (Section 25) ===
  tags: CreatureTag[];

  // === Relationships (Section 26) ===
  relationships: CharacterRelationship[];

  // === Component References (Section 28) ===
  refs: ComponentRefs;

  // === Metadata (Section 27) ===
  metadata: CharacterMetadata;

  // === Combat Stats (derived, but stored for quick access) ===
  hp: number;
  maxHp: number;
  tempHp: number;
  ac: number;                  // last computed AC
  initiative: number;          // last rolled initiative
  deathSaves: { successes: number; failures: number };

  // === Position on grid (if in combat) ===
  position?: { x: number; y: number };
}

// ============================================================================
// FACTORY: Create Character
// ============================================================================

let _charIdSeq = 0;

export function generateCharacterId(): string {
  _charIdSeq++;
  return `char_${Date.now()}_${_charIdSeq}`;
}

export interface CreateCharacterParams {
  name: string;
  type: CharacterType;
  species: SpeciesDef;
  classDef: ClassDef;
  background?: BackgroundDef;
  abilityScores: Record<AbilityName, number>;
  // Optional
  playerId?: string;
  alignment?: string;
  languages?: string[];
  subspeciesId?: string;
}

export function createCharacter(params: CreateCharacterParams): Character {
  const characterId = generateCharacterId();
  const typeConfig = CHARACTER_TYPE_CONFIGS[params.type];
  const totalLevel = 1;
  const proficiencyBonus = getProficiencyBonus(totalLevel);

  // Build ability scores
  const abilityScores: Record<AbilityName, AbilityScore> = {} as any;
  for (const ab of ["str", "dex", "con", "int", "wis", "cha"] as AbilityName[]) {
    abilityScores[ab] = {
      name: ab,
      base: params.abilityScores[ab] ?? 10,
      temporaryBonuses: [],
    };
  }

  // Apply species ability bonuses
  if (params.species.abilityBonuses) {
    for (const [ab, bonus] of Object.entries(params.species.abilityBonuses)) {
      if (abilityScores[ab as AbilityName]) {
        abilityScores[ab as AbilityName].base += bonus as number;
      }
    }
  }

  // Build saving throws
  const savingThrows: Record<AbilityName, SavingThrow> = {} as any;
  for (const ab of ["str", "dex", "con", "int", "wis", "cha"] as AbilityName[]) {
    savingThrows[ab] = {
      ability: ab,
      proficient: params.classDef.savingThrows.includes(ab),
      expertise: false,
      overrideModifiers: [],
    };
  }

  // Build skills (empty initially — filled by class/background)
  const skills: Record<string, SkillInstance> = {};

  // Build languages
  const languages: LanguageKnowledge[] = [
    ...params.species.languages.map(l => ({ languageId: l, source: "species" as const })),
    ...(params.background?.languages || []).map(l => ({ languageId: l, source: "background" as const })),
    ...(params.languages || []).map(l => ({ languageId: l, source: "learned" as const })),
  ];

  // Calculate HP
  const conMod = getAbilityModifier(abilityScores.con);
  const maxHp = params.classDef.hitDie + conMod;

  // Build character
  const character: Character = {
    identity: {
      characterId,
      name: params.name,
      playerId: params.playerId,
      alignment: params.alignment,
    },
    type: params.type,
    typeConfig,
    lifecycleState: "created",
    status: "alive",
    species: params.species,
    subspeciesId: params.subspeciesId,
    background: params.background,
    level: {
      totalLevel: 1,
      classLevels: [{
        classId: params.classDef.id,
        className: params.classDef.name,
        level: 1,
      }],
      xpSystem: "xp",
      xp: 0,
      xpToNextLevel: 300,
      proficiencyBonus,
    },
    abilityScores,
    savingThrows,
    skills,
    languages,
    speed: { ...params.species.speed },
    tags: [],
    relationships: [],
    refs: {
      effectIds: [],
      conditionIds: [],
    },
    metadata: {},
    hp: maxHp,
    maxHp,
    tempHp: 0,
    ac: 10 + getAbilityModifier(abilityScores.dex), // unarmored default
    initiative: 0,
    deathSaves: { successes: 0, failures: 0 },
  };

  return character;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Get effective ability score (with overrides + temporary bonuses) */
export function getScore(character: Character, ability: AbilityName): number {
  return getEffectiveScore(character.abilityScores[ability]);
}

/** Get ability modifier (computed from score, never stored) */
export function getMod(character: Character, ability: AbilityName): number {
  return getAbilityModifier(character.abilityScores[ability]);
}

/** Get proficiency bonus (computed from level, never stored) */
export function getPB(character: Character): number {
  return getProficiencyBonus(character.level.totalLevel);
}

/** Get saving throw modifier */
export function getSaveMod(character: Character, ability: AbilityName): number {
  const save = character.savingThrows[ability];
  if (!save) return getMod(character, ability);
  return getSaveModifier(save, getMod(character, ability), getPB(character));
}

/** Get skill modifier */
export function getSkillMod(character: Character, skillId: string): number {
  const skill = character.skills[skillId];
  if (!skill) return 0; // not proficient
  const abilityMod = getMod(character, skill.abilityOverride || skill.ability);
  return getSkillModifier(skill, abilityMod, getPB(character));
}

/** Check if character has a tag */
export function hasTag(character: Character, tag: CreatureTag): boolean {
  return character.tags.includes(tag);
}

/** Add tag to character */
export function addTag(character: Character, tag: CreatureTag): Character {
  if (character.tags.includes(tag)) return character;
  return { ...character, tags: [...character.tags, tag] };
}

/** Remove tag from character */
export function removeTag(character: Character, tag: CreatureTag): Character {
  return { ...character, tags: character.tags.filter(t => t !== tag) };
}

/** Check if character is alive (can act) */
export function isAlive(character: Character): boolean {
  return character.status === "alive" && character.lifecycleState === "active";
}

/** Check if character is downed (HP <= 0 but not dead) */
export function isDowned(character: Character): boolean {
  return character.hp <= 0 && character.status !== "dead";
}

/** Check if character is dead */
export function isDead(character: Character): boolean {
  return character.status === "dead" || character.lifecycleState === "dead";
}

/** Check if character is incapacitated (can't take actions) */
export function isIncapacitated(character: Character): boolean {
  return character.refs.conditionIds.some(id =>
    ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"].includes(id)
  );
}

/** Transition lifecycle state */
export function transitionLifecycle(
  character: Character,
  to: CharacterLifecycleState,
): Character {
  if (!canTransition(character.lifecycleState, to)) {
    throw new Error(
      `Invalid lifecycle transition: ${character.lifecycleState} → ${to}`,
    );
  }
  return { ...character, lifecycleState: to };
}

/** Apply damage to character */
export function applyDamageToCharacter(
  character: Character,
  amount: number,
): Character {
  let hp = character.hp;
  let tempHp = character.tempHp;

  // Temp HP absorbs first
  if (tempHp > 0) {
    const absorbed = Math.min(tempHp, amount);
    tempHp -= absorbed;
    const remaining = amount - absorbed;
    hp = Math.max(0, hp - remaining);
  } else {
    hp = Math.max(0, hp - amount);
  }

  let status: CharacterStatus = character.status;
  let lifecycleState: CharacterLifecycleState = character.lifecycleState;

  if (hp <= 0 && character.status === "alive") {
    status = "unconscious";
    lifecycleState = "downed";
  }

  return { ...character, hp, tempHp, status, lifecycleState };
}

/** Apply healing to character */
export function applyHealingToCharacter(
  character: Character,
  amount: number,
): Character {
  const hp = Math.min(character.maxHp, character.hp + amount);
  let status: CharacterStatus = character.status;
  let lifecycleState: CharacterLifecycleState = character.lifecycleState;
  let deathSaves = character.deathSaves;

  if (character.hp <= 0 && hp > 0) {
    // Revived from downed
    status = "alive";
    lifecycleState = "active";
    deathSaves = { successes: 0, failures: 0 };
  }

  return { ...character, hp, status, lifecycleState, deathSaves };
}

/** Roll death save */
export function rollDeathSave(character: Character, roll: number): Character {
  if (character.status !== "unconscious") return character;

  let { successes, failures } = character.deathSaves;
  let status: CharacterStatus = character.status;
  let lifecycleState: CharacterLifecycleState = character.lifecycleState;
  let hp = character.hp;

  if (roll === 20) {
    // Nat 20: revive with 1 HP
    hp = 1;
    status = "alive";
    lifecycleState = "active";
    successes = 0;
    failures = 0;
  } else if (roll >= 10) {
    successes += 1;
    if (successes >= 3) {
      status = "stable";
      // Stable: still unconscious but no more death saves needed
    }
  } else {
    if (roll === 1) failures += 2; // Nat 1: 2 failures
    else failures += 1;
    if (failures >= 3) {
      status = "dead";
      lifecycleState = "dead";
    }
  }

  return {
    ...character,
    hp,
    status,
    lifecycleState,
    deathSaves: { successes, failures },
  };
}

/** Add experience points */
export function addXP(character: Character, amount: number): Character {
  const xp = character.level.xp + amount;
  let totalLevel = character.level.totalLevel;
  let xpToNextLevel = character.level.xpToNextLevel;

  // Simple level-up check (XP thresholds)
  const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
  while (totalLevel < 20 && xp >= XP_THRESHOLDS[totalLevel]) {
    totalLevel++;
  }
  xpToNextLevel = totalLevel < 20 ? XP_THRESHOLDS[totalLevel] : Infinity;

  const proficiencyBonus = getProficiencyBonus(totalLevel);

  return {
    ...character,
    level: {
      ...character.level,
      xp,
      totalLevel,
      xpToNextLevel,
      proficiencyBonus,
    },
  };
}

/** Get character summary for AI DM / UI */
export function summarizeCharacter(character: Character): string {
  const cls = character.level.classLevels.map(cl => `${cl.className} ${cl.level}`).join("/");
  const hp = `${character.hp}/${character.maxHp}`;
  const ac = character.ac;
  const pb = getPB(character);
  return `${character.identity.name} [${character.type}] ${character.species.name} ${cls} Lv.${character.level.totalLevel} | HP ${hp} | AC ${ac} | PB +${pb}`;
}
