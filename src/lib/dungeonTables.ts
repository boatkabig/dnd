/**
 * Domain 36 (cont): Dungeon Tables & Procedural Generator
 *
 * 36.9  Random Tables    — room contents, treasure hoards, dressing (by theme)
 * 36.10 Procedural Gen   — quick dungeon generator (for "random dungeon" mode)
 *
 * Sources:
 *  - D&D 5e DMG chapter 5 "Dungeon Adventures" — tables for dressing, encounters, traps
 *  - D&D 2024 DMG — similar tables (we use community equivalents)
 */

import type {
  DungeonBlueprint,
  DungeonTheme,
  Room,
  RoomConnection,
  RoomRole,
  RoomContent,
  ConnectionType,
} from "./dungeon.js";

/* ======================================================================
 * 36.9 RANDOM TABLES
 * ====================================================================== */

/** Atmospheric dressing (no mechanical effect, just flavor) */
export const DUNGEON_DRESSING_TABLE: Record<DungeonTheme, string[]> = {
  crypt: [
    "ซากโลงศึกแตกร้าวกระจาย",
    "กลิ่นเน่าเหม็นจากศพเก่า",
    "ลวดลายอักขระโบราณรอบฝาผนัง",
    "กระดูกมนุษย์กองอยู่มุมห้อง",
    "แสงเทียนระยิบระยับเหนือแท่นบูชา",
    "เสียงกระซิบจาง ๆ ในความมืด",
    "ฝุ่นหนาปกคลุมทุกอย่าง",
  ],
  cave: [
    "หินงอกหินย้อยระย้อยแขวนจากเพดาน",
    "น้ำหยดเย็น ๆ ตกลงมาเป็นระยะ",
    "กลิ่นดินชื้น",
    "เสียงน้ำไหลอยู่ไกล ๆ",
    "ค้างคาวห้อยหัวบนเพดาน",
    "พื้นหินลื่นจากตะไคร่น้ำ",
    "รากไม้ยาว ๆ ลอดผ่านรอยรั่วของเพดาน",
  ],
  wizard_tower: [
    "หนังสือเวทมนตร์เก่า ๆ กองอยู่บนโต๊ะ",
    "อัญมณีเรืองแสงสีฟ้าในขวดแก้ว",
    "วงกลมอัญเชิญวาดด้วยชอล์กบนพื้น",
    "กลิ่นโลหะร้อน ๆ และกระดาษเก่า",
    "ลูกแก้วคริสตัลลอยกลางอากาศ",
    "เสียงเสียงกระพือปีกเหมือนนก",
    "หุ่นกอธิคเล็ก ๆ ยืนนิ่งมุมห้อง",
  ],
  abandoned_mine: [
    "รถเข็นแร่เก่า ๆ พังอยู่ข้างทาง",
    "คานไม้รองพื้นเริ่มผุพัง",
    "กลิ่นสนิมเหล็กและดินชื้น",
    "ตะเกียงน้ำมันดับสนิทกระจายพื้น",
    "เสียงหินกระทบหินจาง ๆ",
    "ค้างคาวบินออกจากเพดานเมื่อรบกวน",
    "พื้นที่ทรุดตัวลงเป็นหลุมเล็ก ๆ",
  ],
  ancient_temple: [
    "รูปปั้นเทพเก่า ๆ ยืนเฝ้าประตู",
    "อักขระศักดิ์สิทธิ์ลวกลายเปลือย",
    "กลิ่นธูปเก่าและขี้เถ้า",
    "แสงสีทองอ่อน ๆ จากช่องบนเพดาน",
    "เสียงสวดมนต์จาง ๆ ในหู",
    "พวงมาลัยดอกไม้เหี่ยวเฉาบนแท่นบูชา",
    "เปียโนเก่า ๆ บรรเลงท่อนเศร้า (เสียงลึกลับ)",
  ],
  sewer: [
    "น้ำเสียสีดำไหลเอื่อย ๆ",
    "กลิ่นแก๊สมีเทน",
    "หนูตัวใหญ่ ๆ วิ่งหนี",
    "เสียงหยดน้ำใต้ดิน",
    "ตะไคร่น้ำสีเขียวขึ้นเต็มผนัง",
    "ซากขยะและกระดูกลอดผ่านน้ำ",
    "เสียงกระเพื่อมจากช่องระบาย",
  ],
  ruined_castle: [
    "ธงชาติเก่า ๆ ฉีกขาด",
    "หน้าต่างกระจกแตก",
    "กลิ่นไฟไหม้เก่า",
    "เสียงลมหวีวิ่งผ่านช่อง",
    "รูปวาดอัศวินโบราณจาง ๆ",
    "เศษปูนและอิฐกระจัดกระจาย",
    "เสียงหินร่วงจากเพดาน",
  ],
  forest_shrine: [
    "ใบไม้ร่วงปกคลุมพื้น",
    "เสียงนกร้องจาง ๆ",
    "แสงแดดลอดผ่านกิ่งไม้",
    "กลิ่นดอกไม้ป่า",
    "รากไม้พันรอบศิลา",
    "เสียงน้ำตกไกล ๆ",
    "ผีเสื้อสีฟ้าบินว่อน",
  ],
  underwater: [
    "แสงสีฟ้าอ่อนลอดผ่านผิวน้ำ",
    "ฟองอากาศลอยขึ้น",
    "ปะการังและสาหร่าย",
    "เสียงน้ำไหลนุ่ม ๆ",
    "ปลาสีสันสวยงามว่ายผ่าน",
    "ซากเรือเก่า ๆ",
    "กลิ่นเค็ม",
  ],
  fiendish: [
    "เปลวไฟสีแดงลุกที่ผนัง",
    "กลิ่นกำมะถัน",
    "เสียงหัวเราะปีศาจจาง ๆ",
    "ลาวาเดือดปุด ๆ ในหลุม",
    "โซ่เหล็กแขวนลงมาจากเพดาน",
    "อักขระปีศาจเรืองแสง",
    "เถ้ากระดูกกระจายพื้น",
  ],
  generic: [
    "ฝุ่นหนาปกคลุม",
    "เสียงเงียบสนิท",
    "กลิ่นอับชื้น",
    "รอยแตกบนผนัง",
    "เศษหินกระจัดกระจาย",
    "แสงสลัวจากช่องลับ",
    "เสียงลมหวีวิ่ง",
  ],
};

/** Monster pools by theme (CR range marked) — used by procedural generator and DM hint */
export const DUNGEON_MONSTER_TABLE: Record<DungeonTheme, Array<{ id: string; th: string; cr: string; weight: number }>> = {
  crypt: [
    { id: "skeleton", th: "Skeleton", cr: "1/4", weight: 30 },
    { id: "zombie", th: "Zombie", cr: "1/4", weight: 25 },
    { id: "ghoul", th: "Ghoul", cr: "1", weight: 15 },
    { id: "shadow", th: "Shadow", cr: "1/2", weight: 10 },
    { id: "wight", th: "Wight", cr: "3", weight: 8 },
    { id: "wraith", th: "Wraith", cr: "5", weight: 5 },
    { id: "necromancer", th: "Necromancer", cr: "6", weight: 4 },
    { id: "lich", th: "Lich", cr: "21", weight: 1 },
    { id: "beholder-zombie", th: "Beholder Zombie", cr: "5", weight: 2 },
  ],
  cave: [
    { id: "rat", th: "Rat", cr: "1/8", weight: 25 },
    { id: "bat", th: "Bat", cr: "0", weight: 20 },
    { id: "giant-spider", th: "Giant Spider", cr: "1", weight: 15 },
    { id: "owlbear", th: "Owlbear", cr: "3", weight: 12 },
    { id: "troll", th: "Troll", cr: "5", weight: 8 },
    { id: "basilisk", th: "Basilisk", cr: "3", weight: 6 },
    { id: "carrion-crawler", th: "Carrion Crawler", cr: "2", weight: 7 },
    { id: "purple-worm", th: "Purple Worm", cr: "15", weight: 2 },
    { id: "behir", th: "Behir", cr: "11", weight: 3 },
    { id: "young-red-dragon", th: "Young Red Dragon", cr: "10", weight: 2 },
  ],
  wizard_tower: [
    { id: "goblin", th: "Goblin", cr: "1/4", weight: 10 },
    { id: "kobold", th: "Kobold", cr: "1/8", weight: 10 },
    { id: "mage", th: "Mage", cr: "6", weight: 15 },
    { id: "apprentice-wizard", th: "Apprentice Wizard", cr: "1/4", weight: 12 },
    { id: "flying-sword", th: "Flying Sword", cr: "1/4", weight: 10 },
    { id: "shield-guardian", th: "Shield Guardian", cr: "7", weight: 8 },
    { id: "gargoyle", th: "Gargoyle", cr: "2", weight: 12 },
    { id: "invisible-stalker", th: "Invisible Stalker", cr: "6", weight: 8 },
    { id: "golem-flesh", th: "Flesh Golem", cr: "5", weight: 7 },
    { id: "golem-stone", th: "Stone Golem", cr: "9", weight: 5 },
    { id: "golem-iron", th: "Iron Golem", cr: "16", weight: 3 },
  ],
  abandoned_mine: [
    { id: "kobold", th: "Kobold", cr: "1/8", weight: 30 },
    { id: "goblin", th: "Goblin", cr: "1/4", weight: 25 },
    { id: "ochre-jelly", th: "Ochre Jelly", cr: "2", weight: 12 },
    { id: "gelatinous-cube", th: "Gelatinous Cube", cr: "2", weight: 10 },
    { id: "umber-hulk", th: "Umber Hulk", cr: "5", weight: 6 },
    { id: "xorn", th: "Xorn", cr: "5", weight: 6 },
    { id: "earth-elemental", th: "Earth Elemental", cr: "5", weight: 6 },
    { id: "beholder", th: "Beholder", cr: "13", weight: 2 },
    { id: "fire-elemental", th: "Fire Elemental", cr: "5", weight: 3 },
  ],
  ancient_temple: [
    { id: "acolyte", th: "Acolyte", cr: "1/4", weight: 20 },
    { id: "cultist", th: "Cultist", cr: "1/8", weight: 25 },
    { id: "cult-fanatic", th: "Cult Fanatic", cr: "2", weight: 10 },
    { id: "priest", th: "Priest", cr: "2", weight: 12 },
    { id: "gargoyle", th: "Gargoyle", cr: "2", weight: 10 },
    { id: "spectator", th: "Spectator", cr: "3", weight: 8 },
    { id: "gladiator", th: "Gladiator", cr: "5", weight: 6 },
    { id: "veteran", th: "Veteran", cr: "3", weight: 9 },
  ],
  sewer: [
    { id: "rat", th: "Rat", cr: "1/8", weight: 30 },
    { id: "giant-rat", th: "Giant Rat", cr: "1/8", weight: 25 },
    { id: "kobold", th: "Kobold", cr: "1/8", weight: 10 },
    { id: "ochre-jelly", th: "Ochre Jelly", cr: "2", weight: 10 },
    { id: "gelatinous-cube", th: "Gelatinous Cube", cr: "2", weight: 8 },
    { id: "crocodile", th: "Crocodile", cr: "2", weight: 7 },
    { id: "aboleth", th: "Aboleth", cr: "10", weight: 3 },
    { id: "otyugh", th: "Otyugh", cr: "6", weight: 7 },
  ],
  ruined_castle: [
    { id: "bandit", th: "Bandit", cr: "1/8", weight: 25 },
    { id: "bandit-captain", th: "Bandit Captain", cr: "2", weight: 12 },
    { id: "thug", th: "Thug", cr: "1/2", weight: 18 },
    { id: "veteran", th: "Veteran", cr: "3", weight: 12 },
    { id: "knight", th: "Knight", cr: "3", weight: 10 },
    { id: "ghost", th: "Ghost", cr: "4", weight: 8 },
    { id: "wraith", th: "Wraith", cr: "5", weight: 6 },
    { id: "vampire-spawn", th: "Vampire Spawn", cr: "5", weight: 5 },
    { id: "vampire", th: "Vampire", cr: "13", weight: 2 },
    { id: "liz-lich", th: "Lich", cr: "21", weight: 1 },
  ],
  forest_shrine: [
    { id: "wolf", th: "Wolf", cr: "1/4", weight: 20 },
    { id: "owlbear", th: "Owlbear", cr: "3", weight: 12 },
    { id: "dryad", th: "Dryad", cr: "1", weight: 10 },
    { id: "satyr", th: "Satyr", cr: "1/2", weight: 10 },
    { id: "treant", th: "Treant", cr: "9", weight: 5 },
    { id: "pixie", th: "Pixie", cr: "1/4", weight: 10 },
    { id: "sprite", th: "Sprite", cr: "1/4", weight: 10 },
    { id: "blink-dog", th: "Blink Dog", cr: "1/2", weight: 8 },
    { id: "green-hag", th: "Green Hag", cr: "3", weight: 6 },
    { id: "unicorn", th: "Unicorn", cr: "5", weight: 4 },
    { id: "young-green-dragon", th: "Young Green Dragon", cr: "10", weight: 3 },
    { id: "treant-elder", th: "Elder Treant", cr: "10", weight: 2 },
  ],
  underwater: [
    { id: "merfolk", th: "Merfolk", cr: "1/8", weight: 20 },
    { id: "sahuagin", th: "Sahuagin", cr: "1/2", weight: 18 },
    { id: "giant-crab", th: "Giant Crab", cr: "1/4", weight: 12 },
    { id: "octopus-giant", th: "Giant Octopus", cr: "3", weight: 8 },
    { id: "shark-hunter", th: "Hunter Shark", cr: "2", weight: 12 },
    { id: "kraken", th: "Kraken", cr: "23", weight: 1 },
    { id: "water-elemental", th: "Water Elemental", cr: "5", weight: 8 },
    { id: "marid", th: "Marid", cr: "11", weight: 5 },
    { id: "aboleth", th: "Aboleth", cr: "10", weight: 6 },
    { id: "young-black-dragon", th: "Young Black Dragon", cr: "7", weight: 4 },
  ],
  fiendish: [
    { id: "imp", th: "Imp", cr: "1", weight: 18 },
    { id: "quasit", th: "Quasit", cr: "1", weight: 15 },
    { id: "lemure", th: "Lemure", cr: "0", weight: 20 },
    { id: "bearded-devil", th: "Bearded Devil", cr: "3", weight: 10 },
    { id: "spined-devil", th: "Spined Devil", cr: "2", weight: 10 },
    { id: "barbed-devil", th: "Barbed Devil", cr: "5", weight: 8 },
    { id: "bone-devil", th: "Bone Devil", cr: "9", weight: 5 },
    { id: "ice-devil", th: "Ice Devil", cr: "14", weight: 4 },
    { id: "pit-fiend", th: "Pit Fiend", cr: "20", weight: 2 },
    { id: "balor", th: "Balor", cr: "19", weight: 3 },
    { id: "glabrezu", th: "Glabrezu", cr: "9", weight: 5 },
  ],
  generic: [
    { id: "goblin", th: "Goblin", cr: "1/4", weight: 20 },
    { id: "kobold", th: "Kobold", cr: "1/8", weight: 15 },
    { id: "bandit", th: "Bandit", cr: "1/8", weight: 15 },
    { id: "skeleton", th: "Skeleton", cr: "1/4", weight: 12 },
    { id: "zombie", th: "Zombie", cr: "1/4", weight: 12 },
    { id: "wolf", th: "Wolf", cr: "1/4", weight: 10 },
    { id: "spider-giant", th: "Giant Spider", cr: "1", weight: 8 },
    { id: "thug", th: "Thug", cr: "1/2", weight: 5 },
    { id: "ogre", th: "Ogre", cr: "2", weight: 3 },
  ],
};

/** Treasure hoard templates by dungeon level range (DMG-style) */
export const TREASURE_TABLE: Array<{
  minLevel: number;
  maxLevel: number;
  goldRange: [number, number];
  gems?: string[];
  items?: string[];
}> = [
  // Levels 1-4 (local heroes)
  { minLevel: 1, maxLevel: 4, goldRange: [10, 60], gems: ["Quartz (10gp)", "Obsidian (50gp)"], items: ["Potion of Healing"] },
  // Levels 5-10 (regional heroes)
  { minLevel: 5, maxLevel: 10, goldRange: [50, 200], gems: ["Topaz (50gp)", "Onyx (50gp)"], items: ["Potion of Healing", "Spell Scroll: Level 2"] },
  // Levels 11-16 (masters of the realm)
  { minLevel: 11, maxLevel: 16, goldRange: [200, 800], gems: ["Sapphire (500gp)", "Ruby (1000gp)"], items: ["Potion of Greater Healing", "Magic Item +1"] },
  // Levels 17-20 (masters of the world)
  { minLevel: 17, maxLevel: 20, goldRange: [800, 3000], gems: ["Diamond (5000gp)", "Black Sapphire (5000gp)"], items: ["Potion of Superior Healing", "Magic Item +2 or +3"] },
];

/** Trap templates by theme (procedural generator uses these) */
export const TRAP_TABLE: Array<{
  id: string;
  name: string;
  description: string;
  detectionDC: number;
  disableDC: number;
  damage: string;
  damageType: string;
  saveAbility: "dex" | "str" | "con" | "wis" | "int" | "cha";
  saveDC: number;
  triggerType: "step_on" | "open" | "touch" | "time" | "condition";
  themes?: DungeonTheme[]; // optional theme filter
}> = [
  {
    id: "dart_trap",
    name: "Dart Trap",
    description: "หน้าไม้ซ่อนในผนังยิงออกเมื่อเหยียบแป้น",
    detectionDC: 14, disableDC: 13, damage: "1d8", damageType: "piercing",
    saveAbility: "dex", saveDC: 13, triggerType: "step_on",
  },
  {
    id: "pit_trap",
    name: "Pit Trap",
    description: "พื้นเปิดออกเป็นหลุมลึก 10 ฟุต",
    detectionDC: 13, disableDC: 14, damage: "1d6", damageType: "bludgeoning",
    saveAbility: "dex", saveDC: 13, triggerType: "step_on",
  },
  {
    id: "fire_rune",
    name: "Fire Rune Trap",
    description: "อักขระไฟลุกเมื่อแตะ",
    detectionDC: 15, disableDC: 14, damage: "3d6", damageType: "fire",
    saveAbility: "dex", saveDC: 14, triggerType: "touch",
    themes: ["wizard_tower", "ancient_temple", "fiendish"],
  },
  {
    id: "poison_needle",
    name: "Poison Needle",
    description: "เข็มพิษเสียบออกจากกลอนประตู",
    detectionDC: 14, disableDC: 13, damage: "1d4", damageType: "poison",
    saveAbility: "con", saveDC: 13, triggerType: "open",
  },
  {
    id: "collapsing_ceiling",
    name: "Collapsing Ceiling",
    description: "พื้นเพดานพังถล่ม",
    detectionDC: 16, disableDC: 15, damage: "4d6", damageType: "bludgeoning",
    saveAbility: "dex", saveDC: 15, triggerType: "step_on",
    themes: ["cave", "abandoned_mine", "ruined_castle"],
  },
  {
    id: "flood_room",
    name: "Flood Room",
    description: "น้ำไหลท่วมห้องภายใน 1 นาที",
    detectionDC: 15, disableDC: 15, damage: "2d6", damageType: "bludgeoning",
    saveAbility: "str", saveDC: 14, triggerType: "time",
    themes: ["underwater", "sewer", "cave"],
  },
  {
    id: "gas_leak",
    name: "Poison Gas Leak",
    description: "ก๊าซพิษพวยพุ่งจากรอยแตกในพื้น",
    detectionDC: 14, disableDC: 14, damage: "3d6", damageType: "poison",
    saveAbility: "con", saveDC: 14, triggerType: "step_on",
    themes: ["sewer", "crypt", "abandoned_mine"],
  },
  {
    id: "summoning_circle",
    name: "Summoning Circle",
    description: "วงกลมอัญเชิญปลุกมอนสเตอร์เมื่อเข้าใกล้",
    detectionDC: 16, disableDC: 16, damage: "0", damageType: "force",
    saveAbility: "wis", saveDC: 14, triggerType: "step_on",
    themes: ["wizard_tower", "fiendish", "ancient_temple"],
  },
];

/** Puzzle templates (procedural generator uses these) */
export const PUZZLE_TABLE: Array<{
  id: string;
  name: string;
  description: string;
  solution: string;
  solutionSkill?: string;
  solutionDC: number;
  hintDC: number;
  rewardItems?: string[];
  failureConsequence?: string;
}> = [
  {
    id: "riddle_door",
    name: "Riddle Door",
    description: "ประตูหินมีจารึก: 'พูดออกมา แล้วข้าจะหายไป'",
    solution: "Player must speak the answer to a riddle carved on the door",
    solutionSkill: "history", solutionDC: 13, hintDC: 12,
    rewardItems: ["Potion of Healing"],
    failureConsequence: "ประตูปล่อยก๊าซพิษ",
  },
  {
    id: "weight_puzzle",
    name: "Weight Puzzle",
    description: "แท่นชั่งหินต้องถ่วงน้ำหนักให้สมดุล",
    solution: "Place specific items on the scales to balance them",
    solutionSkill: "investigation", solutionDC: 14, hintDC: 13,
    rewardItems: ["50gp", "Potion of Healing"],
    failureConsequence: "เกิด dart trap",
  },
  {
    id: "elemental_puzzle",
    name: "Elemental Puzzle",
    description: "รูปปั้นธาตุทั้งสี่ต้องจุดไฟ/รดน้ำ/เป่าลม/วางดิน",
    solution: "Activate each elemental statue with its corresponding element",
    solutionSkill: "arcana", solutionDC: 15, hintDC: 14,
    rewardItems: ["Magic Item +1"],
    failureConsequence: "ธาตุที่ผิดสร้าง elemental attack",
  },
  {
    id: "mirror_puzzle",
    name: "Mirror Puzzle",
    description: "กระจกหลายบานต้องหันเพื่อสะท้อนแสงไปยังเป้าหมาย",
    solution: "Rotate mirrors to direct a beam of light to the target",
    solutionSkill: "investigation", solutionDC: 14, hintDC: 13,
    rewardItems: ["Spell Scroll: Level 2"],
    failureConsequence: "แสงเผาผู้เล่น",
  },
  {
    id: "runes_puzzle",
    name: "Ancient Runes",
    description: "อักขระโบราณต้องเรียงลำดับถูกต้อง",
    solution: "Arrange runes in chronological/historical order",
    solutionSkill: "history", solutionDC: 15, hintDC: 14,
    rewardItems: ["Lore scroll"],
    failureConsequence: "อักขระลุกเป็นไฟ",
  },
];

/* ======================================================================
 * 36.10 PROCEDURAL DUNGEON GENERATOR
 * ====================================================================== */

export interface ProceduralDungeonParams {
  theme: DungeonTheme;
  partyLevel: number;
  numRooms?: number;        // default 5-7
  dungeonId: string;
  dungeonName: string;
  entranceWorldMapId: string;
  hook?: string;
  antagonist?: string;
  /** Seed for RNG (optional, for reproducibility) */
  seed?: number;
}

const ROOM_NAME_PARTS: Record<DungeonTheme, { prefix: string[]; suffix: string[] }> = {
  crypt: {
    prefix: ["ห้อง", "ห้องโถง", "ห้องเก็บ", "มุม"],
    suffix: ["ศพ", "โลง", "อัฐิ", "สวดมนต์", "บูชา", "หลุมฝัง"],
  },
  cave: {
    prefix: ["ถ้ำ", "โพรง", "ห้องถ้ำ", "มุมถ้ำ"],
    suffix: ["ค้างคาว", "หยดน้ำ", "หินงอก", "น้ำใต้ดิน", "แมงมุม"],
  },
  wizard_tower: {
    prefix: ["ห้อง", "ห้องทดลอง", "ห้องสมุด", "ห้องเวท", "ห้องใต้หลังคา"],
    suffix: ["เล่มเวท", "อัญมณี", "อัญเชิญ", "ผลึก", "ดาบลอย"],
  },
  abandoned_mine: {
    prefix: ["อุโมงค์", "ห้องเสา", "ห้องเข็นแร่", "บ่อ"],
    suffix: ["แร่", "เสาไม้", "รถเข็น", "พังทลาย", "ทองคำ"],
  },
  ancient_temple: {
    prefix: ["ศาลา", "ห้อง", "มุม", "วิหาร"],
    suffix: ["บูชา", "สวดมนต์", "เทพ", "บาป", "เครื่องเซ่น", "บูชายัญ"],
  },
  sewer: {
    prefix: ["ท่อ", "ห้อง", "มุม", "บ่อ"],
    suffix: ["น้ำเสีย", "หนู", "ตะไคร่", "เน่า", "ปล่อง"],
  },
  ruined_castle: {
    prefix: ["ห้อง", "หอ", "มุม", "ห้องโถง"],
    suffix: ["อัศวิน", "ราชวงศ์", "เศษซาก", "ทหาร", "อาหาร", "พระราชา"],
  },
  forest_shrine: {
    prefix: ["ลาน", "ศาลา", "มุม", "แอ่ง"],
    suffix: ["ไม้", "ดอกไม้", "น้ำใส", "เงียบสงบ", "ฟีนิกซ์"],
  },
  underwater: {
    prefix: ["ถ้ำใต้น้ำ", "ห้อง", "มุม", "โพรง"],
    suffix: ["ปะการัง", "สาหร่าย", "หอย", "ปลา", "น้ำวน"],
  },
  fiendish: {
    prefix: ["ห้อง", "ห้องโถง", "หลุม", "บ่อ"],
    suffix: ["ไฟ", "เถ้า", "โซ่", "กระดูก", "ปีศาจ", "บาป"],
  },
  generic: {
    prefix: ["ห้อง", "ห้องโถง", "มุม", "ทางเดิน"],
    suffix: ["เงียบ", "ทึบ", "ลึกลับ", "เก่า", "หิน"],
  },
};

/** Simple seeded RNG (mulberry32) for reproducible dungeon generation */
function makeRng(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickN<T>(arr: T[], n: number, rng: () => number): T[] {
  const copy = [...arr];
  const result: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length);
    result.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return result;
}

function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function makeRoomName(theme: DungeonTheme, rng: () => number): string {
  const parts = ROOM_NAME_PARTS[theme] || ROOM_NAME_PARTS.generic;
  return `${pick(parts.prefix, rng)}${pick(parts.suffix, rng)}`;
}

function pickMonstersForLevel(theme: DungeonTheme, level: number, rng: () => number, count: number = 1): Array<{ id: string; th: string; cr: string }> {
  const pool = DUNGEON_MONSTER_TABLE[theme] || DUNGEON_MONSTER_TABLE.generic;
  // Filter monsters by CR appropriate to party level (CR up to ~ level + 2)
  const maxCR = Math.min(level + 2, 20);
  // Simple CR-to-num comparison (note: CR is fractional, so we approximate)
  const crToNum = (cr: string): number => {
    if (cr === "0") return 0;
    if (cr === "1/8") return 0.125;
    if (cr === "1/4") return 0.25;
    if (cr === "1/2") return 0.5;
    return parseFloat(cr);
  };
  const filtered = pool.filter((m) => crToNum(m.cr) <= maxCR);
  const usable = filtered.length > 0 ? filtered : pool;
  return pickN(usable, count, rng);
}

function pickBossForLevel(theme: DungeonTheme, level: number, rng: () => number): { id: string; th: string; cr: string } {
  const pool = DUNGEON_MONSTER_TABLE[theme] || DUNGEON_MONSTER_TABLE.generic;
  // Boss should be CR ~ party level + 2 to + 4
  const minCR = level + 1;
  const maxCR = level + 4;
  const crToNum = (cr: string): number => {
    if (cr === "0") return 0;
    if (cr === "1/8") return 0.125;
    if (cr === "1/4") return 0.25;
    if (cr === "1/2") return 0.5;
    return parseFloat(cr);
  };
  const candidates = pool.filter((m) => {
    const c = crToNum(m.cr);
    return c >= minCR && c <= maxCR;
  });
  if (candidates.length > 0) return pick(candidates, rng);
  // Fallback: pick highest CR in pool
  return pool.reduce((best, m) => (crToNum(m.cr) > crToNum(best.cr) ? m : best), pool[0]);
}

function makeTreasureForLevel(level: number, rng: () => number): string[] {
  const tier = TREASURE_TABLE.find((t) => level >= t.minLevel && level <= t.maxLevel) || TREASURE_TABLE[0];
  const items: string[] = [];
  const gold = randomInt(tier.goldRange[0], tier.goldRange[1], rng);
  items.push(`${gold}gp`);
  if (tier.gems && rng() < 0.4) items.push(pick(tier.gems, rng));
  if (tier.items && rng() < 0.6) items.push(pick(tier.items, rng));
  return items;
}

/**
 * Generate a complete dungeon blueprint procedurally.
 * Uses 5-Room pattern as the spine, then adds 0-2 extra rooms (transition/secret/empty).
 */
export function generateProceduralDungeon(params: ProceduralDungeonParams): DungeonBlueprint {
  const rng = makeRng(params.seed);
  const numRooms = params.numRooms ?? randomInt(5, 7, rng);
  const theme = params.theme;

  // Build 5-Room spine: entrance → puzzle → setback → climax → reward
  const roles: RoomRole[] = ["entrance", "puzzle", "setback", "climax", "reward"];
  // Add extra rooms (transition/secret/empty) to reach numRooms
  while (roles.length < numRooms) {
    const extras: RoomRole[] = ["transition", "secret", "empty", "setback", "puzzle"];
    roles.push(pick(extras, rng));
  }
  // Shuffle non-entrance roles slightly (keep entrance first, climax near end, reward last)
  const entrance = roles.shift()!;
  const reward = roles.pop()!;
  // Insert reward at end (always last)
  // climax should be 2nd-to-last; if not present, swap
  let climaxIdx = roles.indexOf("climax");
  if (climaxIdx === -1) {
    // Insert climax before reward
    roles.push("climax");
  } else {
    // Move climax to end of remaining roles
    roles.splice(climaxIdx, 1);
    roles.push("climax");
  }
  const orderedRoles = [entrance, ...roles, reward];

  // Create rooms
  const rooms: Room[] = orderedRoles.map((role, i) => {
    const roomId = `${role}_${i + 1}`;
    const name = makeRoomName(theme, rng);
    const isSecret = role === "secret";
    return makeRoomForRole(role, roomId, name, theme, params.partyLevel, rng, isSecret);
  });

  // Create linear connections (room[i] → room[i+1]) — plus maybe a secret branch
  const connections: RoomConnection[] = [];
  const directions: Array<"n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"> = ["n", "e", "ne", "nw"];
  for (let i = 0; i < rooms.length - 1; i++) {
    const from = rooms[i];
    const to = rooms[i + 1];
    const connId = `conn_${i + 1}`;
    const isSecretConn = from.isSecret || to.isSecret;
    const connType: ConnectionType = isSecretConn ? "secret_door" : i === 0 ? "door" : pick(["door", "corridor", "open_archway"], rng);
    connections.push({
      id: connId,
      from: from.id,
      to: to.id,
      type: connType,
      direction: pick(directions, rng),
      isSecret: isSecretConn,
      secretDetectionDC: isSecretConn ? randomInt(13, 18, rng) : undefined,
      isLocked: i === 0 ? false : rng() < 0.2, // 20% chance locked
      lockDC: randomInt(12, 18, rng),
    });
    // Add exit refs to rooms
    from.exits.push(connId);
    to.exits.push(connId);
  }

  // Sometimes add a secret side-room branch
  if (rng() < 0.5 && rooms.length >= 4) {
    const branchRoomIdx = randomInt(1, rooms.length - 2, rng);
    const branchFrom = rooms[branchRoomIdx];
    const secretRoom = makeRoomForRole("secret", "secret_room", makeRoomName(theme, rng), theme, params.partyLevel, rng, true);
    rooms.push(secretRoom);
    const secretConnId = "conn_secret";
    connections.push({
      id: secretConnId,
      from: branchFrom.id,
      to: secretRoom.id,
      type: "secret_door",
      direction: pick(directions, rng),
      isSecret: true,
      secretDetectionDC: randomInt(14, 18, rng),
    });
    branchFrom.exits.push(secretConnId);
    secretRoom.exits.push(secretConnId);
  }

  // Identify boss room (climax) and reward room
  const bossRoom = rooms.find((r) => r.role === "climax");
  const rewardRoom = rooms.find((r) => r.role === "reward");
  const bossRoomId = bossRoom?.id;
  const rewardRoomId = rewardRoom?.id;

  // Count secrets
  const totalSecrets = rooms.filter((r) => r.isSecret).length + connections.filter((c) => c.isSecret).length;

  return {
    id: params.dungeonId,
    name: params.dungeonName,
    theme,
    entranceWorldMapId: params.entranceWorldMapId,
    entranceRoomId: rooms[0].id,
    description: `${params.dungeonName} — ${DUNGEON_THEME_DESCRIPTION[theme]}`,
    rooms,
    connections,
    bossRoomId,
    rewardRoomId,
    totalSecrets,
    recommendedLevel: params.partyLevel,
    estimatedRoomsToClear: rooms.length,
    hook: params.hook || `สำรวจ ${params.dungeonName} เพื่อค้นหาความลับและสมบัติ`,
    antagonist: params.antagonist || (bossRoom?.stagedEncounter?.monsterIds[0] ? `${bossRoom.stagedEncounter.monsterIds[0]} ที่คุม ${params.dungeonName}` : undefined),
  };
}

const DUNGEON_THEME_DESCRIPTION: Record<DungeonTheme, string> = {
  crypt: "หลุมศักดิ์สิทธิ์ที่ถูกทิ้งร้าง กลิ่นศพและเวทมนตร์ดำปกคลุม",
  cave: "ถ้ำใต้ดินที่ธรรมชาติสร้างขึ้น เต็มไปด้วยสัตว์ร้าย",
  wizard_tower: "หอคอยของเวทมนตร์ผู้ยิ่งใหญ่ในอดีต เต็มไปด้วยเวทมนตร์ป้องกัน",
  abandoned_mine: "เหมืองที่ถูกทิ้งร้างหลังเหตุการณ์ไม่คาดฝัน",
  ancient_temple: "วัดโบราณที่ยังคงพลังศักดิ์สิทธิ์",
  sewer: "ท่อระบายน้ำใต้เมืองที่ซ่อนความลับ",
  ruined_castle: "ปราสาทร้างที่เคยรุ่งโรจน์ บัดนี้เหลือแต่ซาก",
  forest_shrine: "ศาลาในป่าลึก ที่หลบซ่อนจากสายตาคนทั่วไป",
  underwater: "โครงสร้างใต้น้ำลึก ที่คนเก่าเคยสร้างไว้",
  fiendish: "ดินแดนต้องคำสาป ที่ปีศาจคอยหลอกลวง",
  generic: "ดันเจี้ยนลึกลับที่รอการสำรวจ",
};

function makeRoomForRole(
  role: RoomRole,
  roomId: string,
  roomName: string,
  theme: DungeonTheme,
  partyLevel: number,
  rng: () => number,
  isSecret: boolean,
): Room {
  const dressing = pick(DUNGEON_DRESSING_TABLE[theme] || DUNGEON_DRESSING_TABLE.generic, rng);
  const atmosphere = `${dressing}`;

  // Contents based on role
  const contents: RoomContent[] = [];
  let stagedEncounter: Room["stagedEncounter"] | undefined;
  let stagedTrap: Room["stagedTrap"] | undefined;
  let stagedPuzzle: Room["stagedPuzzle"] | undefined;
  let stagedLoot: string[] | undefined;

  switch (role) {
    case "entrance": {
      // Guardian: low-CR monster(s) near entrance
      const guardians = pickMonstersForLevel(theme, Math.max(1, partyLevel - 1), rng, randomInt(1, 2, rng));
      stagedEncounter = {
        monsterIds: guardians.map((g) => g.id),
        surprise: false,
        isBoss: false,
      };
      contents.push({
        type: "monster",
        description: `${guardians.map((g) => g.th).join(", ")} เฝ้าทางเข้า`,
      });
      contents.push({ type: "dressing", description: dressing });
      break;
    }
    case "puzzle": {
      const puzzle = pick(PUZZLE_TABLE, rng);
      stagedPuzzle = {
        name: puzzle.name,
        description: puzzle.description,
        solution: puzzle.solution,
        solutionCheck: puzzle.solutionSkill ? { skill: puzzle.solutionSkill, dc: puzzle.solutionDC } : undefined,
        hintDC: puzzle.hintDC,
        rewardItems: puzzle.rewardItems,
        failureConsequence: puzzle.failureConsequence,
      };
      contents.push({
        type: "puzzle",
        description: puzzle.description,
      });
      contents.push({ type: "dressing", description: dressing });
      break;
    }
    case "setback": {
      // Trap (most common setback)
      const trapPool = TRAP_TABLE.filter((t) => !t.themes || t.themes.includes(theme));
      const trap = pick(trapPool.length > 0 ? trapPool : TRAP_TABLE, rng);
      stagedTrap = {
        name: trap.name,
        description: trap.description,
        detectionDC: trap.detectionDC,
        disableDC: trap.disableDC,
        damage: trap.damage,
        damageType: trap.damageType,
        saveAbility: trap.saveAbility,
        saveDC: trap.saveDC,
        triggerType: trap.triggerType,
      };
      contents.push({
        type: "trap",
        description: trap.description,
        isHidden: true,
        detectionDC: trap.detectionDC,
      });
      contents.push({ type: "dressing", description: dressing });
      break;
    }
    case "climax": {
      // Boss fight
      const boss = pickBossForLevel(theme, partyLevel, rng);
      stagedEncounter = {
        monsterIds: [boss.id],
        surprise: false,
        isBoss: true,
        lairActions: boss.cr === "13" || boss.cr === "16" || boss.cr === "19" || boss.cr === "21" || boss.cr === "23" ? ["lair_action_1", "lair_action_2"] : undefined,
      };
      contents.push({
        type: "monster",
        description: `${boss.th} (CR ${boss.cr}) ปกป้องรังของมัน`,
      });
      // Boss room might have lore
      contents.push({
        type: "lore",
        description: "จารึกบนผนังเล่าเรื่องราวของบอสและที่มาของดันเจี้ยน",
      });
      contents.push({ type: "dressing", description: dressing });
      break;
    }
    case "reward": {
      stagedLoot = makeTreasureForLevel(partyLevel, rng);
      contents.push({
        type: "treasure",
        description: `สมบัติรวม: ${stagedLoot.join(", ")}`,
      });
      contents.push({
        type: "lore",
        description: "จารึกเผยความลับของเนื้อเรื่อง",
      });
      contents.push({ type: "dressing", description: dressing });
      break;
    }
    case "transition": {
      contents.push({ type: "dressing", description: dressing });
      break;
    }
    case "secret": {
      // Hidden treasure room
      stagedLoot = makeTreasureForLevel(partyLevel, rng);
      contents.push({
        type: "treasure",
        description: `สมบัติซ่อน: ${stagedLoot.join(", ")}`,
        isHidden: false, // found the room = found the loot
      });
      contents.push({ type: "dressing", description: dressing });
      break;
    }
    case "empty":
    default: {
      contents.push({ type: "dressing", description: dressing });
      break;
    }
  }

  return {
    id: roomId,
    name: roomName,
    role,
    shape: pick(["square", "rect", "irregular", "round"], rng),
    size: pick(["small", "medium", "large"], rng),
    dimensions: { width: randomInt(3, 8, rng), height: randomInt(3, 6, rng) },
    description: `${roomName} — ${atmosphere}`,
    atmosphere,
    contents,
    exits: [],
    isSecret,
    secretDetectionDC: isSecret ? randomInt(13, 18, rng) : undefined,
    stagedEncounter,
    stagedTrap,
    stagedPuzzle,
    stagedLoot,
  };
}

/* ======================================================================
 * 36.11 DUNGEON TEMPLATE LIBRARY (ready-made small dungeons)
 * ====================================================================== */

/**
 * Ready-made dungeon templates (DM can use these for "quick start" instead of generating from scratch).
 * These are intentionally small (5 rooms) for solo play sessions.
 */
export const DUNGEON_TEMPLATES: Array<{
  id: string;
  name: string;
  theme: DungeonTheme;
  recommendedLevel: number;
  hook: string;
}> = [
  {
    id: "old_bonecrypt",
    name: "ถ้ำกระดูกเก่า",
    theme: "crypt",
    recommendedLevel: 2,
    hook: "ชาวบ้านรายงานว่ามีผู้คนหายไปใกล้ถ้ำกระดูกเก่า ขอให้ผู้กล้าไปสำรวจ",
  },
  {
    id: "wizard_tower_aldric",
    name: "หอเวทอัลดริก",
    theme: "wizard_tower",
    recommendedLevel: 5,
    hook: "อัลดริกเวทมนตร์ผู้ยิ่งใหญ่หายไปเมื่อ 100 ปีก่อน หอคอยของท่านยังคงเต็มไปด้วยเวทมนตร์และสมบัติ",
  },
  {
    id: "spider_cave",
    name: "ถ้ำแมงมุมยักษ์",
    theme: "cave",
    recommendedLevel: 3,
    hook: "แมงมุมยักษ์ออกล่าเป็นฝูงจากถ้ำใกล้หมู่บ้าน ค้นหารังของมันและกำจัดให้หมด",
  },
  {
    id: "ruined_keep_ironwolf",
    name: "ป้อมเหล็กหมาป่า",
    theme: "ruined_castle",
    recommendedLevel: 4,
    hook: "โจรป่าเหล็กหมาป่าใช้ป้อมร้างเป็นที่ซ่อน กองกำลังของพวกมันคุกคามหมู่บ้านรอบข้าง",
  },
  {
    id: "temple Forgotten_dawn",
    name: "วัดแห่งรุ่งอรุณที่ถูกลืม",
    theme: "ancient_temple",
    recommendedLevel: 6,
    hook: "ลัทธิลึกลับยึดวัดโบราณ กำลังทำพิธีกรรมอันชั่วร้าย",
  },
  {
    id: "abyssal_rift",
    name: "รอยร้ายแห่งขุมนรก",
    theme: "fiendish",
    recommendedLevel: 12,
    hook: "ปีศาจระดับสูงเปิดประตูมิติ ต้องปิดก่อนที่จะสายเกิน",
  },
];
