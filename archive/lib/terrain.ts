/**
 * Terrain System — พื้นที่และภูมิประเทศ (17.1–17.7)
 * กำหนดลักษณะพื้นผิวและผลต่อการเคลื่อนที่
 */

/* ======================================================================
 * 17.1 TERRAIN TYPE
 * ====================================================================== */

export type TerrainType =
  | "normal" | "difficult" | "water_shallow" | "water_deep" | "mountain"
  | "forest" | "swamp" | "desert" | "underground" | "urban" | "ice" | "lava" | "cliff";

export const TERRAIN_TYPE_TH: Record<TerrainType, string> = {
  normal: "พื้นปกติ", difficult: "พื้นที่ลำบาก", water_shallow: "น้ำตื้น",
  water_deep: "น้ำลึก", mountain: "ภูเขา", forest: "ป่า", swamp: "หนองบึง",
  desert: "ทะเลทราย", underground: "ใต้ดิน", urban: "เมือง", ice: "น้ำแข็ง",
  lava: "ลาวา", cliff: "ผาสูง",
};

/* ======================================================================
 * 17.2 MOVEMENT COST
 * ====================================================================== */

export interface TerrainDef {
  type: TerrainType;
  movementCost: number;        // 1 = normal, 2 = difficult (double)
  requiresClimb?: boolean;
  requiresSwim?: boolean;
  descriptionTh: string;
  // 17.4 Advantage
  stealthAdvantage?: boolean;  // easy to hide
  perceptionDisadvantage?: boolean; // hard to see
  // 17.5 Restriction
  cannotFly?: boolean;
  cannotRun?: boolean;
  requiresCheck?: { skill: string; dc: number };
  // 17.3 Features
  providesCover?: "half" | "three_quarter";
  damage?: string;             // e.g. "1d6 fire" for lava
  damageType?: string;
}

export const TERRAIN_DEFS: Record<TerrainType, TerrainDef> = {
  normal:        { type: "normal",        movementCost: 1, descriptionTh: "พื้นปกติ" },
  difficult:     { type: "difficult",     movementCost: 2, descriptionTh: "พื้นที่ลำบาก — เคลื่อนที่ x2" },
  water_shallow: { type: "water_shallow", movementCost: 2, requiresSwim: false, descriptionTh: "น้ำตื้น — เคลื่อนที่ x2" },
  water_deep:    { type: "water_deep",    movementCost: 2, requiresSwim: true, descriptionTh: "น้ำลึก — ต้องว่ายน้ำ" },
  mountain:      { type: "mountain",      movementCost: 2, requiresClimb: true, descriptionTh: "ภูเขา — ต้องปีน" },
  forest:        { type: "forest",        movementCost: 2, stealthAdvantage: true, providesCover: "half", descriptionTh: "ป่า — เคลื่อนที่ x2, ซ่อนง่าย, กำบังครึ่ง" },
  swamp:         { type: "swamp",         movementCost: 2, descriptionTh: "หนองบึง — เคลื่อนที่ x2" },
  desert:        { type: "desert",        movementCost: 1, descriptionTh: "ทะเลทราย" },
  underground:   { type: "underground",   movementCost: 1, descriptionTh: "ใต้ดิน" },
  urban:         { type: "urban",         movementCost: 1, providesCover: "half", descriptionTh: "เมือง — มีที่กำบัง" },
  ice:           { type: "ice",           movementCost: 1, requiresCheck: { skill: "acrobatics", dc: 10 }, descriptionTh: "น้ำแข็ง — DC 10 Acrobatics ไม่ผ่านจะล้ม" },
  lava:          { type: "lava",          movementCost: 1, damage: "1d6", damageType: "fire", descriptionTh: "ลาวา — โดน 1d6 fire ต่อช่อง" },
  cliff:         { type: "cliff",         movementCost: 3, requiresClimb: true, descriptionTh: "ผาสูง — ต้องปีน, เคลื่อนที่ x3" },
};

/* ======================================================================
 * 17.3 TERRAIN FEATURES
 * ====================================================================== */

export type TerrainFeature = "trees" | "rocks" | "walls" | "hills" | "rivers" | "cliffs" | "pillars" | "rubble" | "bushes";

export interface TerrainFeatureDef {
  type: TerrainFeature;
  nameTh: string;
  providesCover: "half" | "three_quarter" | "total";
  blocksMovement: boolean;
  blocksLineOfSight: boolean;
  stealthBonus?: number;
  canClimb?: boolean;
}

export const TERRAIN_FEATURES: Record<TerrainFeature, TerrainFeatureDef> = {
  trees:    { type: "trees",    nameTh: "ต้นไม้",       providesCover: "half",          blocksMovement: false, blocksLineOfSight: false, stealthBonus: 2, canClimb: true },
  rocks:    { type: "rocks",    nameTh: "ก้อนหิน",       providesCover: "three_quarter", blocksMovement: true,  blocksLineOfSight: true },
  walls:    { type: "walls",    nameTh: "กำแพง",         providesCover: "total",         blocksMovement: true,  blocksLineOfSight: true },
  hills:    { type: "hills",    nameTh: "เนินเขา",       providesCover: "half",          blocksMovement: false, blocksLineOfSight: false },
  rivers:   { type: "rivers",   nameTh: "แม่น้ำ",         providesCover: "none" as any,   blocksMovement: false, blocksLineOfSight: false },
  cliffs:   { type: "cliffs",   nameTh: "ผาสูง",         providesCover: "three_quarter", blocksMovement: true,  blocksLineOfSight: true, canClimb: true },
  pillars:  { type: "pillars",  nameTh: "เสา",           providesCover: "half",          blocksMovement: true,  blocksLineOfSight: true },
  rubble:   { type: "rubble",   nameTh: "ซากปรักหักพัง",  providesCover: "half",          blocksMovement: false, blocksLineOfSight: false },
  bushes:   { type: "bushes",   nameTh: "พุ่มไม้",        providesCover: "half",          blocksMovement: false, blocksLineOfSight: false, stealthBonus: 2 },
};

/* ======================================================================
 * 17.6 TERRAIN INTERACTION
 * ====================================================================== */

export type TerrainInteraction = "climb" | "swim" | "jump" | "dig" | "hide" | "search";

export function canInteractTerrain(terrain: TerrainDef, interaction: TerrainInteraction): { allowed: boolean; reasonTh: string } {
  switch (interaction) {
    case "climb": return terrain.requiresClimb ? { allowed: true, reasonTh: "ปีนได้" } : { allowed: false, reasonTh: "ไม่ต้องปีน" };
    case "swim": return terrain.requiresSwim ? { allowed: true, reasonTh: "ว่ายน้ำได้" } : { allowed: false, reasonTh: "ไม่มีน้ำ" };
    case "hide": return terrain.stealthAdvantage ? { allowed: true, reasonTh: "ซ่อนได้ดี" } : { allowed: true, reasonTh: "ซ่อนได้แต่ไม่ดีเท่าพื้นที่ซ่อน" };
    default: return { allowed: true, reasonTh: "ทำได้" };
  }
}

/* ======================================================================
 * 17.7 TERRAIN GENERATION (for World Engine)
 * ====================================================================== */

export type Biome = "forest" | "desert" | "mountain" | "swamp" | "plains" | "tundra" | "coast" | "underground" | "urban";

export interface TerrainGenConfig {
  biome: Biome;
  baseTerrain: TerrainType;
  featureChance: number;      // 0-1 chance of a terrain feature per square
  possibleFeatures: TerrainFeature[];
  difficultyModifier: number; // 0 = normal, 1 = more difficult terrain
}

export const BIOME_CONFIGS: Record<Biome, TerrainGenConfig> = {
  forest:     { biome: "forest",     baseTerrain: "forest",    featureChance: 0.3, possibleFeatures: ["trees", "bushes", "rocks"], difficultyModifier: 1 },
  desert:     { biome: "desert",     baseTerrain: "desert",    featureChance: 0.1, possibleFeatures: ["rocks"], difficultyModifier: 0 },
  mountain:   { biome: "mountain",   baseTerrain: "mountain",  featureChance: 0.3, possibleFeatures: ["rocks", "cliffs"], difficultyModifier: 2 },
  swamp:      { biome: "swamp",      baseTerrain: "swamp",     featureChance: 0.2, possibleFeatures: ["bushes", "rocks"], difficultyModifier: 1 },
  plains:     { biome: "plains",     baseTerrain: "normal",    featureChance: 0.05, possibleFeatures: ["bushes"], difficultyModifier: 0 },
  tundra:     { biome: "tundra",     baseTerrain: "ice",       featureChance: 0.1, possibleFeatures: ["rocks"], difficultyModifier: 1 },
  coast:      { biome: "coast",      baseTerrain: "normal",    featureChance: 0.15, possibleFeatures: ["rocks"], difficultyModifier: 0 },
  underground:{ biome: "underground", baseTerrain: "underground", featureChance: 0.25, possibleFeatures: ["rocks", "pillars", "rubble"], difficultyModifier: 1 },
  urban:      { biome: "urban",      baseTerrain: "urban",     featureChance: 0.3, possibleFeatures: ["walls", "pillars", "rubble"], difficultyModifier: 0 },
};

/**
 * Generate terrain for a grid square based on biome config.
 */
export function generateTerrainSquare(config: TerrainGenConfig): { terrain: TerrainType; feature?: TerrainFeature } {
  const terrain = config.baseTerrain;
  let feature: TerrainFeature | undefined;
  if (Math.random() < config.featureChance) {
    feature = config.possibleFeatures[Math.floor(Math.random() * config.possibleFeatures.length)];
  }
  return { terrain, feature };
}
