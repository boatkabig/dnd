/**
 * Domain 34: Encounter Engine
 *
 * สร้างเหตุการณ์ — Combat / Social / Exploration / Difficulty Balance
 *
 * Sub-systems:
 *  34.1 Encounter Type — combat / social / exploration / puzzle / hybrid
 *  34.2 Difficulty Calculator — based on party level vs CR
 *  34.3 Encounter Generator — pick monsters / NPCs / hazards
 *  34.4 Reward Calculator — XP, gold, items scaled to difficulty
 *  34.5 Encounter Tables — biome-specific random tables
 *  34.6 Encounter Modifiers — weather, time, faction influence
 *  34.7 Encounter Budget — daily XP budget tracking
 *  34.8 Wave Encounters — multi-phase combat
 *
 * Whereas Domain 25 (Monsters) handles monster *data* and Domain 32 (Planning)
 * handles AI *tactics*, Domain 34 handles encounter *design* — what to throw
 * at the player, how hard, and how often.
 */

/* ======================================================================
 * 34.1 ENCOUNTER TYPE
 * ====================================================================== */

export type EncounterType = "combat" | "social" | "exploration" | "puzzle" | "trap" | "hybrid" | "roleplay_combat" | "skill_challenge";

export interface EncounterSpec {
  id: string;
  type: EncounterType;
  title: string;
  description: string;
  locationId: string;
  triggerCondition?: string;
  participants: EncounterParticipant[];
  objectives: string[];
  rewards: EncounterReward;
  estimatedDifficulty: DifficultyLevel;
}

export interface EncounterParticipant {
  id: string;
  role: "enemy" | "ally" | "neutral" | "objective";
  creatureId: string; // monster id, npc id, etc.
  quantity: number;
  spawnPosition?: { x: number; y: number };
  cr: string;
}

/* ======================================================================
 * 34.2 DIFFICULTY CALCULATOR — D&D 2024 Rules (3 tiers: Low / Moderate / High)
 * ====================================================================== */

/**
 * D&D 2024 Encounter Difficulty (Roll20 2024 Compendium — "Combat Encounters"):
 *   "Three categories describe the range of encounter difficulty:
 *    Low / Moderate / High."
 *
 * The 5e labels (Easy/Medium/Hard/Deadly) and the "encounter multiplier" for
 * multiple monsters were BOTH REMOVED in 2024. Monsters now spend flat XP
 * against a per-character XP ceiling.
 *
 * We retain `trivial` and `impossible` as community slang labels (below Low / above High).
 */
export type DifficultyLevel =
  | "trivial"     // below Low (community slang)
  | "low"         // 2024 official tier 1
  | "moderate"    // 2024 official tier 2
  | "high"        // 2024 official tier 3
  | "impossible"; // above High (community slang)

export interface DifficultyThreshold {
  trivial: number;  // below Low — informal "very easy" floor
  low: number;
  moderate: number;
  high: number;
  impossible: number; // above High — informal "deadly+" ceiling
}

/**
 * D&D 2024 XP Budget per Character (Roll20 2024 Compendium).
 * Source: https://roll20.net/compendium/dnd5e/Rules:Combat%20Encounters
 *
 * 5e (2014) had 4 columns (Easy/Medium/Hard/Deadly) as FLOORS you summed.
 * 2024 has 3 columns (Low/Moderate/High) as CEILINGS you multiply by party size
 * and spend down. Difficulty labels also shifted:
 *   - 2014 Medium ≈ 2024 Low
 *   - 2014 Hard ≈ 2024 Moderate
 *   - 2014 Deadly ≈ 2024 High (Tier 4: 2024 High is ~50% harder than 2014 Deadly)
 */
export const SOLO_DIFFICULTY_THRESHOLDS: DifficultyThreshold[] = [
  { trivial: 25,  low: 50,    moderate: 75,    high: 100,    impossible: 200    }, // Lv1
  { trivial: 50,  low: 100,   moderate: 150,   high: 200,    impossible: 400    }, // Lv2
  { trivial: 75,  low: 150,   moderate: 225,   high: 400,    impossible: 800    }, // Lv3
  { trivial: 125, low: 250,   moderate: 375,   high: 500,    impossible: 1000   }, // Lv4
  { trivial: 250, low: 500,   moderate: 750,   high: 1100,   impossible: 2200   }, // Lv5
  { trivial: 300, low: 600,   moderate: 1000,  high: 1400,   impossible: 2800   }, // Lv6
  { trivial: 375, low: 750,   moderate: 1300,  high: 1700,   impossible: 3400   }, // Lv7
  { trivial: 500, low: 1000,  moderate: 1700,  high: 2100,   impossible: 4200   }, // Lv8
  { trivial: 650, low: 1300,  moderate: 2000,  high: 2600,   impossible: 5200   }, // Lv9
  { trivial: 800, low: 1600,  moderate: 2300,  high: 3100,   impossible: 6200   }, // Lv10
  { trivial: 950, low: 1900,  moderate: 2900,  high: 4100,   impossible: 8200   }, // Lv11
  { trivial: 1100,low: 2200,  moderate: 3700,  high: 4700,   impossible: 9400   }, // Lv12
  { trivial: 1300,low: 2600,  moderate: 4200,  high: 5400,   impossible: 10800  }, // Lv13
  { trivial: 1450,low: 2900,  moderate: 4900,  high: 6200,   impossible: 12400  }, // Lv14
  { trivial: 1650,low: 3300,  moderate: 5400,  high: 7800,   impossible: 15600  }, // Lv15
  { trivial: 1900,low: 3800,  moderate: 6100,  high: 9800,   impossible: 19600  }, // Lv16
  { trivial: 2250,low: 4500,  moderate: 7200,  high: 11700,  impossible: 23400  }, // Lv17
  { trivial: 2500,low: 5000,  moderate: 8700,  high: 14200,  impossible: 28400  }, // Lv18
  { trivial: 2750,low: 5500,  moderate: 10700, high: 17200,  impossible: 34400  }, // Lv19
  { trivial: 3200,low: 6400,  moderate: 13200, high: 22000,  impossible: 44000  }, // Lv20
];

/**
 * D&D 2024 REMOVED the encounter multiplier for multiple monsters.
 * 5e: 2 goblins = 1.5× XP value. 2024: 2 goblins = flat 2× XP.
 * We retain this function for backwards-compatibility but it always returns 1.
 * Encounters should multiply monster XP by monster count, not by a scaling factor.
 */
export function encounterMultiplier(_numMonsters: number, _isSolo: boolean = true): number {
  return 1; // D&D 2024: no multiplier
}

/**
 * Calculate encounter difficulty using D&D 2024 rules.
 *   - totalXP: sum of all monster XP (no multiplier)
 *   - partySize: divide totalXP by partySize to get per-character XP
 *   - Compare per-character XP against the 2024 thresholds
 */
export function calculateDifficulty(totalXP: number, numMonsters: number, partyLevel: number, partySize = 1): DifficultyLevel {
  // D&D 2024: flat XP (no multiplier). numMonsters retained for backwards-compat.
  void numMonsters;
  const perCharXP = totalXP / partySize;
  const threshold = SOLO_DIFFICULTY_THRESHOLDS[Math.min(19, Math.max(0, partyLevel - 1))];
  if (perCharXP < threshold.trivial) return "trivial";
  if (perCharXP < threshold.low) return "trivial"; // below Low is community "trivial"
  if (perCharXP < threshold.moderate) return "low";
  if (perCharXP < threshold.high) return "moderate";
  if (perCharXP < threshold.impossible) return "high";
  return "impossible";
}

export function getDifficultyThresholds(level: number): DifficultyThreshold {
  return SOLO_DIFFICULTY_THRESHOLDS[Math.min(19, Math.max(0, level - 1))];
}


/* ======================================================================
 * 34.3 ENCOUNTER GENERATOR
 * ====================================================================== */

export interface EncounterGenerationParams {
  partyLevel: number;
  partySize: number;
  targetDifficulty: DifficultyLevel;
  biome: string; // e.g. "forest", "dungeon", "urban"
  locationId: string;
  factionId?: string;
  weatherModifier?: string;
  isNight?: boolean;
}

export interface GeneratedEncounter {
  type: EncounterType;
  participants: EncounterParticipant[];
  totalXP: number;
  estimatedDifficulty: DifficultyLevel;
  recommendedTactics: string;
  hazards: string[];
  notes: string;
}

/** CR → XP mapping for encounter generation */
const CR_TO_XP: Record<string, number> = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100,
  "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
  "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
  "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000,
  "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
};

export function crToXP(cr: string): number {
  return CR_TO_XP[cr] ?? 0;
}

export function xpToCR(xp: number): string {
  for (const [cr, crXP] of Object.entries(CR_TO_XP)) {
    if (crXP === xp) return cr;
  }
  return "1";
}

/** Suggested CR for an encounter given party level & target difficulty (D&D 2024: low/moderate/high) */
export function suggestedCR(partyLevel: number, targetDifficulty: DifficultyLevel): string[] {
  const threshold = getDifficultyThresholds(partyLevel);
  // Map 2024 difficulty tiers (low/moderate/high) plus informal trivial/impossible to threshold key
  const targetXPKey: keyof DifficultyThreshold =
    targetDifficulty === "trivial" ? "trivial" :
    targetDifficulty === "low" ? "low" :
    targetDifficulty === "moderate" ? "moderate" :
    targetDifficulty === "high" ? "high" : "impossible";
  const targetXP = threshold[targetXPKey];
  // Suggest CRs whose XP is around targetXP / 2 (so 2 monsters hit the target)
  const suggestions: string[] = [];
  for (const [cr, xp] of Object.entries(CR_TO_XP)) {
    if (xp >= targetXP * 0.4 && xp <= targetXP * 0.8) suggestions.push(cr);
  }
  if (suggestions.length === 0) {
    // Fallback: pick CR closest to targetXP
    let best = "1";
    let bestDiff = Number.MAX_SAFE_INTEGER;
    for (const [cr, xp] of Object.entries(CR_TO_XP)) {
      const diff = Math.abs(xp - targetXP);
      if (diff < bestDiff) { bestDiff = diff; best = cr; }
    }
    return [best];
  }
  return suggestions;
}

/** Generate a simple combat encounter from params (monster IDs are caller-provided) */
export function generateEncounter(
  params: EncounterGenerationParams,
  availableMonsters: Array<{ id: string; cr: string; th: string }>,
): GeneratedEncounter {
  const threshold = getDifficultyThresholds(params.partyLevel);
  const targetXPKey: keyof DifficultyThreshold = params.targetDifficulty === "trivial" ? "trivial"
    : params.targetDifficulty === "low" ? "low"
    : params.targetDifficulty === "moderate" ? "moderate"
    : params.targetDifficulty === "high" ? "high"
    : "impossible";
  const targetXP = threshold[targetXPKey];
  // Pick monsters whose XP roughly matches targetXP / 2 (2 monsters)
  const candidates = availableMonsters.filter((m) => {
    const xp = crToXP(m.cr);
    return xp >= targetXP * 0.3 && xp <= targetXP * 0.7;
  });
  const pool = candidates.length > 0 ? candidates : availableMonsters;
  const selected = pool[Math.floor(Math.random() * pool.length)] || availableMonsters[0];
  if (!selected) {
    return {
      type: "combat",
      participants: [],
      totalXP: 0,
      estimatedDifficulty: "trivial",
      recommendedTactics: "ไม่มีมอนสเตอร์ที่เหมาะสม",
      hazards: [],
      notes: "Encounter generation ล้มเหลว — ไม่มีมอนสเตอร์ใน pool",
    };
  }
  const xpPerMonster = crToXP(selected.cr);
  const numMonsters = Math.max(1, Math.floor(targetXP / xpPerMonster));
  const totalXP = xpPerMonster * numMonsters;
  const difficulty = calculateDifficulty(totalXP, numMonsters, params.partyLevel, params.partySize);
  const participants: EncounterParticipant[] = Array.from({ length: numMonsters }, (_, i) => ({
    id: `${selected.id}_${i}`,
    role: "enemy" as const,
    creatureId: selected.id,
    quantity: 1,
    cr: selected.cr,
  }));
  // Hazards based on biome/weather
  const hazards: string[] = [];
  if (params.biome === "dungeon") hazards.push("darkness", "narrow_corridors");
  if (params.biome === "forest") hazards.push("difficult_terrain");
  if (params.biome === "mountain") hazards.push("cliff_edge");
  if (params.isNight) hazards.push("low_visibility");
  if (params.weatherModifier === "rain") hazards.push("slippery_ground");
  return {
    type: "combat",
    participants,
    totalXP,
    estimatedDifficulty: difficulty,
    recommendedTactics: `${numMonsters} ${selected.th} (CR ${selected.cr}) — ใช้ตำแหน่งเปรียบเทียบ`,
    hazards,
    notes: `Generated for Lv.${params.partyLevel} ${params.targetDifficulty} encounter at ${params.locationId}`,
  };
}

/* ======================================================================
 * 34.4 REWARD CALCULATOR
 * ====================================================================== */

export interface EncounterReward {
  xp: number;
  gold: number;
  items: Array<{ itemId: string; chance: number }>;
  reputation?: Array<{ factionId: string; delta: number }>;
  storyFlags?: string[];
}

// D&D 2024 difficulty tiers: trivial (informal), low, moderate, high, impossible (informal)
const REWARD_MULTIPLIERS: Record<DifficultyLevel, { xp: number; gold: number; itemChance: number }> = {
  trivial:   { xp: 0.5,  gold: 0.3,  itemChance: 0.05 },
  low:       { xp: 1.0,  gold: 0.7,  itemChance: 0.15 },
  moderate:  { xp: 1.5,  gold: 1.0,  itemChance: 0.30 },
  high:      { xp: 2.5,  gold: 1.8,  itemChance: 0.55 },
  impossible:{ xp: 4.0,  gold: 3.5,  itemChance: 0.90 },
};

export function calculateReward(difficulty: DifficultyLevel, totalMonsterXP: number, partyLevel: number): EncounterReward {
  const mult = REWARD_MULTIPLIERS[difficulty];
  return {
    xp: Math.floor(totalMonsterXP * mult.xp),
    gold: Math.floor(totalMonsterXP * mult.gold * (1 + partyLevel * 0.1)),
    items: [
      { itemId: "healing_potion", chance: mult.itemChance * 0.6 },
      { itemId: "scroll_random", chance: mult.itemChance * 0.3 },
      { itemId: "magic_item_minor", chance: mult.itemChance * 0.1 },
    ],
  };
}

/** Roll for items based on reward table */
export function rollRewardItems(reward: EncounterReward): string[] {
  const items: string[] = [];
  for (const item of reward.items) {
    if (Math.random() < item.chance) items.push(item.itemId);
  }
  return items;
}

/* ======================================================================
 * 34.5 ENCOUNTER TABLES (biome-specific)
 * ====================================================================== */

export interface EncounterTableEntry {
  weight: number;
  monsterId: string;
  monsterName: string;
  cr: string;
  minQty: number;
  maxQty: number;
}

export interface EncounterTable {
  biome: string;
  minLevel: number;
  maxLevel: number;
  entries: EncounterTableEntry[];
}

export const DEFAULT_ENCOUNTER_TABLES: EncounterTable[] = [
  {
    biome: "forest",
    minLevel: 1,
    maxLevel: 5,
    entries: [
      { weight: 30, monsterId: "wolf", monsterName: "Wolf", cr: "1/4", minQty: 1, maxQty: 4 },
      { weight: 20, monsterId: "goblin", monsterName: "Goblin", cr: "1/4", minQty: 2, maxQty: 6 },
      { weight: 15, monsterId: "bandit", monsterName: "Bandit", cr: "1/8", minQty: 2, maxQty: 4 },
      { weight: 10, monsterId: "giant-spider", monsterName: "Giant Spider", cr: "1", minQty: 1, maxQty: 2 },
      { weight: 10, monsterId: "brown-bear", monsterName: "Brown Bear", cr: "1", minQty: 1, maxQty: 1 },
      { weight: 5, monsterId: "owlbear", monsterName: "Owlbear", cr: "3", minQty: 1, maxQty: 1 },
      { weight: 5, monsterId: "troll", monsterName: "Troll", cr: "5", minQty: 1, maxQty: 1 },
      { weight: 5, monsterId: "dryad", monsterName: "Dryad", cr: "1", minQty: 1, maxQty: 1 },
    ],
  },
  {
    biome: "dungeon",
    minLevel: 1,
    maxLevel: 10,
    entries: [
      { weight: 25, monsterId: "kobold", monsterName: "Kobold", cr: "1/8", minQty: 4, maxQty: 8 },
      { weight: 20, monsterId: "skeleton", monsterName: "Skeleton", cr: "1/4", minQty: 2, maxQty: 6 },
      { weight: 15, monsterId: "zombie", monsterName: "Zombie", cr: "1/4", minQty: 2, maxQty: 4 },
      { weight: 15, monsterId: "goblin", monsterName: "Goblin", cr: "1/4", minQty: 2, maxQty: 6 },
      { weight: 10, monsterId: "ghoul", monsterName: "Ghoul", cr: "1", minQty: 1, maxQty: 3 },
      { weight: 8, monsterId: "ochre-jelly", monsterName: "Ochre Jelly", cr: "2", minQty: 1, maxQty: 2 },
      { weight: 5, monsterId: "minotaur-skeleton", monsterName: "Minotaur Skeleton", cr: "2", minQty: 1, maxQty: 1 },
      { weight: 2, monsterId: "beholder-zombie", monsterName: "Beholder Zombie", cr: "5", minQty: 1, maxQty: 1 },
    ],
  },
  {
    biome: "urban",
    minLevel: 1,
    maxLevel: 8,
    entries: [
      { weight: 30, monsterId: "bandit", monsterName: "Bandit", cr: "1/8", minQty: 2, maxQty: 4 },
      { weight: 20, monsterId: "thug", monsterName: "Thug", cr: "1/2", minQty: 1, maxQty: 3 },
      { weight: 15, monsterId: "guard", monsterName: "Guard", cr: "1/8", minQty: 2, maxQty: 4 },
      { weight: 15, monsterId: "noble", monsterName: "Noble", cr: "1/8", minQty: 1, maxQty: 1 },
      { weight: 10, monsterId: "mage", monsterName: "Mage", cr: "6", minQty: 1, maxQty: 1 },
      { weight: 5, monsterId: "assassin", monsterName: "Assassin", cr: "8", minQty: 1, maxQty: 1 },
      { weight: 5, monsterId: "veteran", monsterName: "Veteran", cr: "3", minQty: 1, maxQty: 2 },
    ],
  },
];

export function rollEncounterFromTable(table: EncounterTable): { monsterId: string; monsterName: string; cr: string; quantity: number } {
  const totalWeight = table.entries.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const entry of table.entries) {
    r -= entry.weight;
    if (r <= 0) {
      const quantity = entry.minQty + Math.floor(Math.random() * (entry.maxQty - entry.minQty + 1));
      return { monsterId: entry.monsterId, monsterName: entry.monsterName, cr: entry.cr, quantity };
    }
  }
  const fallback = table.entries[0];
  return { monsterId: fallback.monsterId, monsterName: fallback.monsterName, cr: fallback.cr, quantity: fallback.minQty };
}

export function findEncounterTable(biome: string, partyLevel: number): EncounterTable | null {
  const candidates = DEFAULT_ENCOUNTER_TABLES.filter(
    (t) => t.biome === biome && partyLevel >= t.minLevel && partyLevel <= t.maxLevel
  );
  return candidates[0] || null;
}

/* ======================================================================
 * 34.6 ENCOUNTER MODIFIERS
 * ====================================================================== */

export interface EncounterModifier {
  name: string;
  description: string;
  xpMultiplier: number;
  acModifier?: number;
  attackModifier?: number;
  initiativeModifier?: number;
  conditionApplied?: string;
}

export const WEATHER_MODIFIERS: Record<string, EncounterModifier> = {
  rain: { name: "Rain", description: "ฝนตก — มองเห็นยาก พื้นลื่น", xpMultiplier: 1.1, acModifier: -1 },
  fog: { name: "Fog", description: "หมอกหนา — มองเห็นได้ไม่เกิน 30 ฟุต", xpMultiplier: 1.15 },
  storm: { name: "Storm", description: "พายุ — เสียงดัง สายฟ้า", xpMultiplier: 1.2, initiativeModifier: -2 },
  blizzard: { name: "Blizzard", description: "หิมะตกหนัก — difficult terrain", xpMultiplier: 1.25, conditionApplied: "environment_cold" },
};

export const TIME_MODIFIERS: Record<string, EncounterModifier> = {
  night: { name: "Night", description: "กลางคืน — มองเห็นยาก ศัตรูบางตัวแข็งแกร่งขึ้น", xpMultiplier: 1.15 },
  dawn: { name: "Dawn", description: "รุ่งอรุณ — โอกาสเจอน้อยลง", xpMultiplier: 0.9 },
  noon: { name: "Noon", description: "เที่ยงวัน — ปกติ", xpMultiplier: 1.0 },
  dusk: { name: "Dusk", description: "พลบค่ำ — ศัตรูเริ่มออกล่า", xpMultiplier: 1.1 },
};

export function applyModifiers(baseXP: number, modifiers: EncounterModifier[]): { adjustedXP: number; notes: string[] } {
  let multiplier = 1;
  const notes: string[] = [];
  for (const mod of modifiers) {
    multiplier *= mod.xpMultiplier;
    notes.push(`${mod.name}: ${mod.description}`);
  }
  return { adjustedXP: Math.floor(baseXP * multiplier), notes };
}

/* ======================================================================
 * 34.7 ENCOUNTER BUDGET (daily XP budget tracking)
 * ====================================================================== */

export interface EncounterBudget {
  partyLevel: number;
  partySize: number;
  dailyXPBudget: number;
  spentToday: number;
  encountersToday: number;
  lastRestAt: number;
}

export function createEncounterBudget(partyLevel: number, partySize: number): EncounterBudget {
  // D&D 2024 REMOVED the "6-8 encounters per adventuring day" guideline.
  // Source: EN World — "there's no longer any mention of the 'adventuring day,' nor is
  // there any recommendation about how many encounters players should have in between long rests."
  // We use a soft daily budget = 4 × High difficulty per character (a reasonable pacing target,
  // not a hard rule). DMs are free to ignore this entirely.
  const dailyPerChar = getDifficultyThresholds(partyLevel).high * 4;
  return {
    partyLevel,
    partySize,
    dailyXPBudget: dailyPerChar * partySize,
    spentToday: 0,
    encountersToday: 0,
    lastRestAt: 0,
  };
}

export function spendBudget(budget: EncounterBudget, xpAmount: number): EncounterBudget {
  return {
    ...budget,
    spentToday: budget.spentToday + xpAmount,
    encountersToday: budget.encountersToday + 1,
  };
}

export function longRestBudget(budget: EncounterBudget): EncounterBudget {
  return {
    ...budget,
    spentToday: 0,
    encountersToday: 0,
    lastRestAt: Date.now(),
  };
}

export function remainingBudget(budget: EncounterBudget): number {
  return Math.max(0, budget.dailyXPBudget - budget.spentToday);
}

export function recommendedNextDifficulty(budget: EncounterBudget): DifficultyLevel {
  const remaining = remainingBudget(budget);
  const threshold = getDifficultyThresholds(budget.partyLevel);
  const perCharRemaining = remaining / budget.partySize;
  // D&D 2024 difficulty tiers: trivial / low / moderate / high / impossible
  if (perCharRemaining < threshold.trivial) return "trivial";
  if (perCharRemaining < threshold.low) return "trivial";
  if (perCharRemaining < threshold.moderate) return "low";
  if (perCharRemaining < threshold.high) return "moderate";
  if (perCharRemaining < threshold.impossible) return "high";
  return "impossible";
}

/* ======================================================================
 * 34.8 WAVE ENCOUNTERS
 * ====================================================================== */

export interface WaveSpec {
  waveNumber: number;
  participants: EncounterParticipant[];
  triggerCondition: string; // e.g. "round_3", "hp_50_percent", "ally_killed"
  delayRounds: number; // rounds after trigger
}

export interface WaveEncounter extends GeneratedEncounter {
  waves: WaveSpec[];
  currentWave: number;
  totalXPAllWaves: number;
}

export function createWaveEncounter(waves: WaveSpec[], partyLevel: number, partySize: number, locationId: string): WaveEncounter {
  const totalXP = waves.reduce((sum, w) => sum + w.participants.reduce((s, p) => s + crToXP(p.cr), 0), 0);
  const firstWaveXP = waves[0]?.participants.reduce((s, p) => s + crToXP(p.cr), 0) || 0;
  const firstWaveMonsters = waves[0]?.participants.length || 0;
  return {
    type: "combat",
    participants: waves[0]?.participants || [],
    totalXP: firstWaveXP,
    estimatedDifficulty: calculateDifficulty(firstWaveXP, firstWaveMonsters, partyLevel, partySize),
    recommendedTactics: `Wave encounter — ${waves.length} waves total`,
    hazards: [],
    notes: `Wave encounter at ${locationId} — watch for reinforcements`,
    waves,
    currentWave: 0,
    totalXPAllWaves: totalXP,
  };
}

export function advanceWave(encounter: WaveEncounter): WaveEncounter | null {
  if (encounter.currentWave >= encounter.waves.length - 1) return null; // no more waves
  const nextWaveNumber = encounter.currentWave + 1;
  const nextWave = encounter.waves[nextWaveNumber];
  return {
    ...encounter,
    currentWave: nextWaveNumber,
    participants: nextWave.participants,
    totalXP: nextWave.participants.reduce((s, p) => s + crToXP(p.cr), 0),
  };
}
