/**
 * Static game data: all 12 SRD classes, all SRD races, all SRD conditions,
 * expanded equipment/magic items. This serves as the in-engine fallback and
 * baseline; the engine also dynamically fetches from Open5e v2 (via lib/srd.ts
 * and lib/open5e.ts / the /api/open5e proxy) for spells and monsters at runtime.
 */

/* ---------------- ABILITIES ---------------- */
export const ABILS = ["str", "dex", "con", "int", "wis", "cha"] as const;
export const ABIL_TH: Record<string, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
export const mod = (score: number) => Math.floor((score - 10) / 2);
export const profByLevel = (lv: number) => Math.ceil(lv / 4) + 1;
export const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

/* ---------------- SKILLS ---------------- */
export const SKILLS: Record<string, { abil: string; th: string }> = {
  athletics: { abil: "str", th: "Athletics (กรีฑา)" },
  acrobatics: { abil: "dex", th: "Acrobatics (กายกรรม)" },
  sleight_of_hand: { abil: "dex", th: "Sleight of Hand (มือสัมผัส)" },
  stealth: { abil: "dex", th: "Stealth (ซ่อนเร้น)" },
  arcana: { abil: "int", th: "Arcana (เวทมนตร์)" },
  history: { abil: "int", th: "History (ประวัติศาสตร์)" },
  investigation: { abil: "int", th: "Investigation (สืบสวน)" },
  nature: { abil: "int", th: "Nature (ธรรมชาติ)" },
  religion: { abil: "int", th: "Religion (ศาสนา)" },
  animal_handling: { abil: "wis", th: "Animal Handling (ควบคุมสัตว์)" },
  insight: { abil: "wis", th: "Insight (สังเกตใจ)" },
  medicine: { abil: "wis", th: "Medicine (การแพทย์)" },
  perception: { abil: "wis", th: "Perception (รับรู้)" },
  survival: { abil: "wis", th: "Survival (เอาชีวิตรอด)" },
  deception: { abil: "cha", th: "Deception (หลอกลวง)" },
  intimidation: { abil: "cha", th: "Intimidation (ข่มขู่)" },
  performance: { abil: "cha", th: "Performance (การแสดง)" },
  persuasion: { abil: "cha", th: "Persuasion (โน้มน้าว)" },
};

/* ---------------- CONDITIONS (all 15 SRD conditions) ---------------- */
// D&D 2024 Exhaustion: 6 levels, simplified from 2014's complex tiered system
// Per level:
//   -2 to ALL D20 Tests (attack rolls, saving throws, ability checks) per level
//   -5 ft Speed per level
//   Level 6 = Death
// Source: D&D Beyond Free Rules 2024 — "Exhaustion [Condition]":
//   "D20 Tests Affected. When you make a D20 Test, the roll is reduced by 2 times your Exhaustion level.
//    Speed Reduced. Your Speed is reduced by a number of feet equal to 5 times your Exhaustion level.
//    You die if your Exhaustion level is 6.
//    Finishing a Long Rest removes 1 of your Exhaustion levels."
// 2024 vs 2014: 2014 had different effects per level (disadv checks → speed halved → disadv attacks/saves
// → HP max halved → speed 0 → death). 2024 is simpler but harsher: flat -2/level to D20 + -5 ft/level.
export const EXHAUSTION_LEVELS = 6;
export function exhaustionPenalty(level: number): number {
  return level > 0 ? level * 2 : 0; // -2 per level to D20 Tests
}
export function exhaustionSpeedPenalty(level: number): number {
  return level > 0 ? level * 5 : 0; // -5 ft per level to Speed (D&D 2024)
}
export function isExhaustionDeadly(level: number): boolean {
  return level >= 6;
}

export const CONDITIONS_TH: Record<string, string> = {
  blinded: "Blinded (ตาบอด — โจมตีใส่คุณได้เปรียบ, คุณโจมตีเสียเปรียบ, check การมองเห็นล้มเหลวอัตโนมัติ)",
  charmed: "Charmed (ถูกเสน่ห์ — โจมตีผู้เสกเสน่ห์ไม่ได้, ผู้เสกได้เปรียบในการเจรจากับคุณ)",
  deafened: "Deafened (หูหนวก — ไม่ได้ยิน, check การได้ยินล้มเหลวอัตโนมัติ)",
  frightened: "Frightened (หวาดกลัว — เสียเปรียบ check/โจมตีขณะเห็นต้นเหตุ, เข้าใกล้ต้นเหตุไม่ได้)",
  grappled: "Grappled (ถูกจับ — ความเร็วเป็น 0, หายถ้าผู้จับถูกดึงออก)",
  incapacitated: "Incapacitated (ไร้ความสามารถ — ไม่สามารถทำ action หรือ reaction ได้)",
  invisible: "Invisible (ล่องหน — มองเห็นไม่ได้หากไม่มีเวท, โจมตีใส่คุณเสียเปรียบ, คุณโจมตีได้เปรียบ)",
  paralyzed: "Paralyzed (ชา — ไร้ความสามารถ, เคลื่อนไหว/พูดไม่ได้, STR/DEX save ล้มเหลวอัตโนมัติ, โจมตีใส่คุณในระยะ 5 ฟุตได้เปรียบและเป็นคริติคอล)",
  petrified: "Petrified (กลายเป็นหิน — น้ำหนัก x10, ไร้ความสามารถ, ไม่รับรู้, STR/DEX save ล้มเหลวอัตโนมัติ, โจมตีใส่คุณได้เปรียบ)",
  poisoned: "Poisoned (ถูกพิษ — เสียเปรียบการโจมตีและ ability check)",
  prone: "Prone (ล้ม — เคลื่อนไหวแบบคลานเท่านั้น, โจมตีใส่คุณในระยะ 5 ฟุตได้เปรียบ, โจมตีระยะไกลใส่คุณเสียเปรียบ, คุณโจมตีเสียเปรียบ)",
  restrained: "Restrained (ถูกตรึง — ความเร็ว 0, โจมตีใส่คุณได้เปรียบ, คุณโจมตีเสียเปรียบ, DEX save เสียเปรียบ)",
  stunned: "Stunned (มึนงง — ไร้ความสามารถ, เคลื่อนไหวไม่ได้, โจมตีใส่คุณได้เปรียบ, save ล้มเหลวอัตโนมัติ)",
  unconscious: "Unconscious (หมดสติ — ไร้ความสามารถ, ไม่รับรู้, ทำของหล่น, ล้ม, โจมตีในระยะ 5 ฟุตได้เปรียบและเป็นคริติคอล, STR/DEX save ล้มเหลวอัตโนมัติ)",
  exhausted: "Exhausted (อ่อนเพลีย — D&D 2024: -2/level ต่อ D20 Test ทั้งหมด, Lv6 = ตาย)",
};

// 5e RAW condition → mechanical effect mapping for the engine
export const DISADV_CONDS = ["poisoned", "frightened", "restrained", "blinded", "prone", "stunned", "paralyzed", "exhausted"]; // your attacks have disadvantage
export const CHECK_DISADV_CONDS = ["poisoned", "frightened", "blinded", "exhausted"]; // ability checks have disadvantage
export const ENEMY_ADV_CONDS = ["restrained", "blinded", "prone", "paralyzed", "stunned", "unconscious", "petrified", "grappled"]; // enemies attack you with advantage
export const INCAPACITATING_CONDS = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"]; // can't take actions

/* ---------------- BACKGROUNDS ---------------- */
// D&D 2024 PHB backgrounds — each grants:
//   - 2 skill proficiencies
//   - 1 origin feat (Level 1 feat from PHB 2024)
//   - ASI: +2/+1 OR +1/+1/+1 (player chooses which abilities)
//   - 1 tool proficiency
//   - starting equipment
//   - suggested personality traits / ideals / bonds / flaws
export const BACKGROUNDS: Record<string, any> = {
  soldier: {
    th: "Soldier (ทหาร)",
    skills: ["athletics", "intimidation"],
    originFeat: "savage_attacker",
    asi: { primary: ["str", "con"], secondary: ["cha"] }, // +2/+1
    tool: "Land Vehicles",
    equipment: ["Rank Insignia", "Trophy from Fallen Enemy", "Bone Dice", "Common Clothes"],
    personality: ["I face problems head-on — a simple, direct solution is the best path to success.", "I'm polite, respectful, and have a high moral standard."],
    ideals: ["Greater Good. Our lot is to protect others.", "Responsibility. I do my duty and obey the law."],
    bonds: ["I would still lay down my life for the people I served with.", "Someone saved my life on the battlefield. To this day, I will never leave a friend behind."],
    flaws: ["I'd rather kill someone in their sleep than fight fairly.", "I have a 'tell' that reveals when I'm lying."],
  },
  criminal: {
    th: "Criminal (อดีตโจร)",
    skills: ["deception", "stealth"],
    originFeat: "alert",
    asi: { primary: ["dex", "int"], secondary: ["cha"] },
    tool: "Thieves' Tools",
    equipment: ["Crowbar", "Dark Common Clothes w/ Hood", "5 gp"],
    personality: ["I always have a plan for what to do when things go wrong.", "I am always calm, no matter the situation."],
    ideals: ["Independence. I must prove I can take care of myself.", "Greedy. I will do whatever it takes to become wealthy."],
    bonds: ["I'm guilty of a terrible crime; I hope I can redeem myself for it.", "I owe everything to my old mentor — a horrible person."],
    flaws: ["When I see something valuable, I can't think about anything but how to steal it.", "I turn tail and run when things look bad."],
  },
  sage: {
    th: "Sage (นักปราชญ์)",
    skills: ["arcana", "history"],
    originFeat: "magic_initiate",
    asi: { primary: ["int", "wis"], secondary: ["con"] },
    tool: "Calligrapher's Supplies",
    equipment: ["Bottle of Black Ink", "Quill", "Small Knife", "Letter with Question", "Common Clothes"],
    personality: ["I use polysyllabic words to impress people.", "I've read every book in the world's greatest libraries."],
    ideals: ["Knowledge. The path to power is through understanding.", "No Limits. Nothing should forbid the pursuit of knowledge."],
    bonds: ["It is my duty to protect the students who study under me.", "I've been searching my whole life for the answer to a certain question."],
    flaws: ["I am easily distracted by the promise of information.", "Most people are annoyed by how I talk."],
  },
  acolyte: {
    th: "Acolyte (ศิษย์วัด)",
    skills: ["insight", "religion"],
    originFeat: "magic_initiate",
    asi: { primary: ["wis", "cha"], secondary: ["int"] },
    tool: "Holy Symbol",
    equipment: ["Holy Symbol", "Prayer Book", "Vestments", "Common Clothes", "5 sticks of Incense"],
    personality: ["I quote sacred texts at every opportunity.", "I am tolerant of other faiths and respect their devotion."],
    ideals: ["Faith. I trust that my deity will guide my actions.", "Charity. I always try to help those in need."],
    bonds: ["I would die to recover an ancient relic of my faith.", "Everything I do is for the common people."],
    flaws: ["I judge others harshly, and myself even more severely.", "My piety sometimes leads me to blindly trust those who profess faith in my god."],
  },
  folk_hero: {
    th: "Folk Hero (วีรชนชาวบ้าน)",
    skills: ["animal_handling", "survival"],
    originFeat: "tough",
    asi: { primary: ["str", "con"], secondary: ["wis"] },
    tool: "Artisan's Tools (your choice)",
    equipment: ["Artisan's Tools", "Shovel", "Iron Pot", "Common Clothes", "Set of Bone Dice"],
    personality: ["I judge people by their actions, not their words.", "If someone is in trouble, I'm always willing to lend a hand."],
    ideals: ["Respect. People deserve to be treated with dignity.", "Sincerity. There's no good in pretending to be something I'm not."],
    bonds: ["I protect those who cannot protect themselves.", "I worked the land, I love the land, and I will protect the land."],
    flaws: ["The tyrant who rules my people will stop at nothing to see me killed.", "I'm convinced of the significance of my destiny, and blind to my shortcomings."],
  },
  urchin: {
    th: "Urchin (เด็กข้างถนน)",
    skills: ["sleight_of_hand", "stealth"],
    originFeat: "lucky",
    asi: { primary: ["dex", "con"], secondary: ["wis"] },
    tool: "Disguise Kit",
    equipment: ["Small Knife", "Map of City", "Pet Mouse", "Set of Common Clothes", "Parents' Token"],
    personality: ["I hide scraps of food and trinkets away in my pockets.", "I ask a lot of questions."],
    ideals: ["Aspiration. I'm going to prove that I'm worthy of a better life.", "Change. The low are lifted up, and the high are brought down."],
    bonds: ["My town or city is my home, and I'll fight to defend it.", "I sponsor a young orphan to keep them from making my mistakes."],
    flaws: ["I will lie to anyone to get what I want.", "I'd rather kill someone in their sleep than fight them fairly."],
  },
  noble: {
    th: "Noble (ขุนนาง)",
    skills: ["history", "persuasion"],
    originFeat: "skilled",
    asi: { primary: ["cha", "int"], secondary: ["str"] },
    tool: "One Gaming Set",
    equipment: ["Fine Clothes", "Signet Ring", "Scroll of Pedigree", "20 gp"],
    personality: ["My favor, once lost, is lost forever.", "I take great pains to always look my best."],
    ideals: ["Nobility. Those of high birth should rule.", "Respect. Respect is due to me because of my position."],
    bonds: ["My family's wellbeing matters more to me than anything.", "I am in love with the heir of a family my family despises."],
    flaws: ["I have a hard time respecting those who haven't proven themselves.", "I often forget that others don't have the resources I do."],
  },
  hermit: {
    th: "Hermit (ฤๅษี)",
    skills: ["medicine", "religion"],
    originFeat: "healer",
    asi: { primary: ["wis", "con"], secondary: ["int"] },
    tool: "Herbalism Kit",
    equipment: ["Scroll Case with Notes", "Winter Blanket", "Common Clothes", "Herbalism Kit"],
    personality: ["I've spent so long alone that I speak to inanimate objects.", "I am utterly serene, even in the face of catastrophe."],
    ideals: ["Free Thinking. Inquiry and curiosity are the pillars of progress.", "Greater Good. My gifts are meant to be shared with all, not used for my own benefit."],
    bonds: ["My isolation gave me great insight into a great evil that I must eradicate.", "I entered seclusion to hide from the ones who might still hunt me."],
    flaws: ["I'd rather let someone die than share a secret I've sworn to keep.", "I am suspicious of strangers and expect the worst of them."],
  },
  outlander: {
    th: "Outlander (คนป่า)",
    skills: ["athletics", "survival"],
    originFeat: "tough",
    asi: { primary: ["str", "wis"], secondary: ["con"] },
    tool: "One Musical Instrument",
    equipment: ["Staff", "Hunting Trap", "Trophy from Animal", "Common Clothes", "5 gp"],
    personality: ["I'm driven by a wanderlust that led me away from home.", "I was, in fact, raised by wolves."],
    ideals: ["Change. Life is like the seasons, in constant change, and we must change with it.", "Nature. The natural world is more important than the constructs of civilization."],
    bonds: ["My family, clan, or tribe is the most important thing in my life, even when they are far from me.", "I suffered a great injustice at the hands of a rival tribe."],
    flaws: ["I am too enamored of ale, wine, and other intoxicants.", "There's no room for caution in a life lived to the fullest."],
  },
  charlatan: {
    th: "Charlatan (นักต้ม)",
    skills: ["deception", "sleight_of_hand"],
    originFeat: "alert",
    asi: { primary: ["cha", "dex"], secondary: ["int"] },
    tool: "Disguise Kit",
    equipment: ["Fine Clothes", "Disguise Kit", "Tools of Con", "15 gp"],
    personality: ["I fall in and out of love easily, and am always pursuing someone.", "I'm a born gambler who can't resist taking a risk for a potential payoff."],
    ideals: ["Independence. I am a free spirit — no one tells me what to do.", "Fairness. I never target people who can't afford to lose a few coins."],
    bonds: ["I fleeced the wrong person and must ensure that they never cross paths with me again.", "I owe everything to my mentor — a horrible person who's probably rotting in jail somewhere."],
    flaws: ["I can't resist a pretty face.", "I'm always in debt. I spend my ill-gotten gains on decadent luxuries faster than I bring them in."],
  },
  entertainer: {
    th: "Entertainer (นักแสดง)",
    skills: ["acrobatics", "performance"],
    originFeat: "musician",
    asi: { primary: ["cha", "dex"], secondary: ["con"] },
    tool: "One Musical Instrument",
    equipment: ["Musical Instrument", "Admirer's Token", "Costume", "15 gp"],
    personality: ["I know a story relevant to almost every situation.", "Whenever I come to a new place, I collect local rumors and spread gossip."],
    ideals: ["Beauty. When I perform, I bring the world to life in motion and sound.", "People. I like seeing the smiles on people's faces when I perform."],
    bonds: ["My instrument is my soulmate, my most treasured possession.", "I want to be famous, whatever it takes."],
    flaws: ["I'm a sucker for a pretty face.", "I forget that my talents can be used for ill as easily as for good."],
  },
  guild_artisan: {
    th: "Guild Artisan (ช่างกิลด์)",
    skills: ["insight", "persuasion"],
    originFeat: "skilled",
    asi: { primary: ["int", "cha"], secondary: ["wis"] },
    tool: "Artisan's Tools (your choice)",
    equipment: ["Artisan's Tools", "Letter of Introduction", "Traveler's Clothes", "15 gp"],
    personality: ["I believe that anything worth doing is worth doing right.", "I'm a snob who looks down on those who can't appreciate fine art."],
    ideals: ["Community. It is the duty of all civilized people to strengthen the bonds of community.", "Excellence. My craft is my life, and I will master it."],
    bonds: ["The workshop where I learned my trade is the most important place in the world to me.", "I owe my guild a great debt for elevating me from poverty."],
    flaws: ["I'm never satisfied with what I have — I always want more.", "I'm hidebound by the traditions of my craft."],
  },
};

/* ---------------- SPECIES (D&D 2024 PHB — 10 species, NO ability score bonuses) ---------------- */
// D&D 2024 CHANGE: Ability Score bonuses are NO LONGER tied to species — they come from Background.
// Source: D&D Beyond "The 10 Species in the 2024 Player's Handbook":
//   "A huge change to species in the 2024 Player's Handbook is that your ability score
//   adjustments will no longer be tied to them. Your ability score adjustments now come
//   from your background."
// 5e (2014) had race-based ASIs; 2024 removed them entirely.
// We retain the `bonus` field for backwards-compatible save loading but set all bonuses to 0.
// Subraces are also gone in 2024 (replaced by Lineages within species — not yet implemented here).
export const RACES: Record<string, any> = {
  human:      { th: "Human (มนุษย์)",         bonus: {}, speed: 30, size: "Medium", languages: ["Common"], traits: ["Versatile: +1 to all abilities (D&D 2014 only — 2024: bonus comes from Background)"] },
  elf:        { th: "Elf (เอลฟ์)",            bonus: {}, speed: 30, size: "Medium", languages: ["Common", "Elvish"], traits: ["Darkvision 60 ft", "Fey Ancestry (advantage vs charm)", "Trance (4h sleep)"] },
  dwarf:      { th: "Dwarf (คนแคระ)",         bonus: {}, speed: 25, size: "Medium", languages: ["Common", "Dwarvish"], traits: ["Darkvision 60 ft", "Dwarven Resilience (adv vs poison)", "Stonecunning"] },
  halfling:   { th: "Halfling (ฮาฟลิง)",      bonus: {}, speed: 25, size: "Small",  languages: ["Common", "Halfling"], traits: ["Lucky (reroll 1s)", "Brave (adv vs fear)", "Halfling Nimbleness"] },
  dragonborn: { th: "Dragonborn (มังกรมนุษย์)", bonus: {}, speed: 30, size: "Medium", languages: ["Common", "Draconic"], traits: ["Breath Weapon", "Damage Resistance (by ancestry)"] },
  gnome:      { th: "Gnome (โนม)",            bonus: {}, speed: 25, size: "Small",  languages: ["Common", "Gnomish"], traits: ["Darkvision 60 ft", "Gnome Cunning (adv vs magic)"] },
  // D&D 2024 PHB: Half-Elf and Half-Orc REMOVED — Orc is now a full species (see below)
  tiefling:   { th: "Tiefling (ไทฟลิง)",       bonus: {}, speed: 30, size: "Medium", languages: ["Common", "Infernal"], traits: ["Darkvision 60 ft", "Hellish Resistance (fire)", "Infernal Legacy"] },
  aasimar:    { th: "Aasimar (อาซิมาร์)",      bonus: {}, speed: 30, size: "Medium", languages: ["Common", "Celestial"], traits: ["Darkvision 60 ft", "Celestial Resistance (radiant/necrotic)", "Healing Hands"] },
  goliath:    { th: "Goliath (โกลิแอธ)",      bonus: {}, speed: 30, size: "Medium", languages: ["Common", "Giant"], traits: ["Giant Ancestry (cloud/frost/stone/etc.)", "Large Form (Lv5)", "Mountain Born"] },
  orc:        { th: "Orc (ออร์ค)",            bonus: {}, speed: 30, size: "Medium", languages: ["Common", "Orc"], traits: ["Darkvision 60 ft", "Adrenaline Rush (temp HP + dash)", "Relentless Endurance"] },
};

/* ---------------- ALIGNMENTS (D&D 5e 9 alignments) ---------------- */
export const ALIGNMENTS: Array<{ id: string; th: string; abbr: string }> = [
  { id: "lawful_good", th: "Lawful Good (จริงธรรม)", abbr: "LG" },
  { id: "neutral_good", th: "Neutral Good (กลางธรรม)", abbr: "NG" },
  { id: "chaotic_good", th: "Chaotic Good (วิถีธรรม)", abbr: "CG" },
  { id: "lawful_neutral", th: "Lawful Neutral (จริงกลาง)", abbr: "LN" },
  { id: "true_neutral", th: "True Neutral (กลางแท้)", abbr: "TN" },
  { id: "chaotic_neutral", th: "Chaotic Neutral (วิถีกลาง)", abbr: "CN" },
  { id: "lawful_evil", th: "Lawful Evil (จริงชั่ว)", abbr: "LE" },
  { id: "neutral_evil", th: "Neutral Evil (กลางชั่ว)", abbr: "NE" },
  { id: "chaotic_evil", th: "Chaotic Evil (วิถีชั่ว)", abbr: "CE" },
];

/* ---------------- LANGUAGES (D&D 5e standard + exotic) ---------------- */
export const LANGUAGES: Array<{ id: string; th: string; exotic?: boolean }> = [
  { id: "common", th: "Common" },
  { id: "dwarvish", th: "Dwarvish" },
  { id: "elvish", th: "Elvish" },
  { id: "giant", th: "Giant" },
  { id: "gnomish", th: "Gnomish" },
  { id: "goblin", th: "Goblin" },
  { id: "halfling", th: "Halfling" },
  { id: "orc", th: "Orc" },
  { id: "abyssal", th: "Abyssal", exotic: true },
  { id: "celestial", th: "Celestial", exotic: true },
  { id: "draconic", th: "Draconic", exotic: true },
  { id: "deep_speech", th: "Deep Speech", exotic: true },
  { id: "infernal", th: "Infernal", exotic: true },
  { id: "primordial", th: "Primordial", exotic: true },
  { id: "sylvan", th: "Sylvan", exotic: true },
  { id: "undercommon", th: "Undercommon", exotic: true },
];

/* ---------------- ORIGIN FEATS (D&D 2024 PHB — 10 official Origin Feats from backgrounds) ---------------- */
// Source: D&D Beyond "The Backgrounds and Origin Feats in the 2024 Player's Handbook".
// D&D 2024 Origin Feats use the character's Proficiency Bonus (PB) — NOT fixed numbers like 5e.
export const ORIGIN_FEATS: Record<string, { th: string; description: string; descriptionTh: string }> = {
  alert: {
    th: "Alert",
    description: "Add your Proficiency Bonus when you roll Initiative. You can also swap your Initiative with a willing ally in the same combat.",
    descriptionTh: "+PB ในการทอย Initiative, สลับ Initiative กับพันธมิตรที่ยินยอมใน combat เดียวกันได้",
  },
  crafter: {
    th: "Crafter",
    description: "Gain proficiency with three different sets of Artisan's Tools. Gain a 20 percent discount on nonmagical items. Can craft an item from a Fast Crafting table, which lasts until you finish another Long Rest.",
    descriptionTh: "เครื่องมือช่าง 3 อย่าง, ลด 20% ราคาของ non-magical, คราฟต์ของจาก Fast Crafting table (หายไปหลัง Long Rest)",
  },
  healer: {
    th: "Healer",
    description: "When you Utilize a Healer's Kit as an action, a creature can expend one of its Hit Point Dice to heal. Your Proficiency Bonus is added to the roll. The creature also gains 1 Hit Die at the end of the next Short Rest.",
    descriptionTh: "ใช้ Healer's Kit เป็น action: สัตว์เป้าหมายเสีย HD 1 ลูกเพื่อฟื้น HP +PB, และได้ HD 1 ลูกคืนหลัง Short Rest ถัดไป",
  },
  lucky: {
    th: "Lucky",
    description: "After finishing a Long Rest, you have a number of Luck Points equal to your Proficiency Bonus. You can expend one when you make a D20 Test to give yourself Advantage on the roll.",
    descriptionTh: "PB Luck Points ต่อ Long Rest — ใช้ 1 point เพื่อให้ Advantage ใน D20 Test",
  },
  magic_initiate: {
    th: "Magic Initiate",
    description: "You gain two cantrips and one level 1 spell from the Cleric, Druid, or Wizard spell list. You choose Wisdom, Intelligence, or Charisma as your spellcasting modifier. You can cast the level 1 spell once per Long Rest without a slot, or with a slot if you have one.",
    descriptionTh: "2 cantrips + 1 เวท Lv.1 จาก Cleric/Druid/Wizard — เลือก WIS/INT/CHA เป็น spellcasting mod, ร่าย Lv.1 ได้ 1 ครั้ง/Long Rest ฟรี",
  },
  musician: {
    th: "Musician",
    description: "Gain proficiency with three musical instruments of your choice. At the end of a Short or Long Rest, you may play the instrument and grant Heroic Inspiration to a number of allies equal to your Proficiency Bonus.",
    descriptionTh: "ดนตรี 3 ชนิด, หลัง Short/Long Rest มอบ Heroic Inspiration ให้พันธมิตร PB ตัว",
  },
  savage_attacker: {
    th: "Savage Attacker",
    description: "Once per turn, when you hit a target with a weapon attack, you can roll the weapon damage dice twice and use either roll against the target.",
    descriptionTh: "1 ครั้ง/เทิร์น เมื่อโจมตีอาวุธโดน — ทอย damage เต๋า 2 รอบแล้วเลือกค่าที่ดีกว่า",
  },
  skilled: {
    th: "Skilled",
    description: "Gain proficiency in any combination of three skills or tools of your choice. You can take this feat more than once.",
    descriptionTh: "+3 skill/tool proficiencies ตามเลือก (เลือกซ้ำได้)",
  },
  tavern_brawler: {
    th: "Tavern Brawler",
    description: "When you hit with an Unarmed Strike and deal damage, you can deal 1d4 + your Strength modifier Bludgeoning damage instead of the normal damage. You have proficiency with improvised weapons. When you hit a creature with an Unarmed Strike or an improvised weapon, you can roll a d4 and add it to the damage roll.",
    descriptionTh: "Unarmed Strike 1d4+STR, ถนัดอาวุธส้อม, โจมตี Unarmed/Improvised โดนแล้ว +1d4 damage",
  },
  tough: {
    th: "Tough",
    description: "When you first gain this Origin feat, your Hit Point maximum increases by twice your character level. Thereafter, your Hit Point maximum increases by 2 each time you level up.",
    descriptionTh: "+2 HP ต่อเลเวล (Lv.1 = +2 HP, สะสมทุกเลเวล)",
  },
};

/* ---------------- ALL 12 SRD CLASSES ---------------- */
export const CLASSES: Record<string, any> = {
  barbarian: {
    th: "Barbarian (บาร์บาเรียน)", hitDie: 12, caster: false,
    array: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
    acCalc: (c: any) => 10 + mod(c.abilities.con) + mod(c.abilities.dex), // Unarmored Defense
    weapon: "greataxe", ranged: "handaxe",
    skills: ["athletics", "intimidation", "perception", "survival"],
    saves: ["str", "con"],
    feature: "Rage: ได้เปรียบ STR check, +2 ดาเมจโจมตีระยะประชิด, ต้านทาน bludgeoning/piercing/slashing (2 ครั้ง/วันที่ Lv.1)",
  },
  bard: {
    th: "Bard (บาร์ด)", hitDie: 8, caster: true, castAbil: "cha",
    array: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 },
    acCalc: (c: any) => 12 + mod(c.abilities.dex), // light armor
    weapon: "rapier", ranged: "shortbow",
    skills: ["deception", "performance", "persuasion", "stealth"],
    saves: ["dex", "cha"],
    feature: "Spellcasting (CHA): Vicious Mockery, Healing Word, Charm Person · Bardic Inspiration (เต๋าโบนัส 1d6)",
  },
  cleric: {
    th: "Cleric (พระ)", hitDie: 8, caster: true, castAbil: "wis",
    array: { str: 14, dex: 10, con: 13, int: 8, wis: 15, cha: 12 },
    acCalc: () => 16, // chain mail
    weapon: "mace", ranged: null,
    skills: ["insight", "religion", "medicine", "persuasion"],
    saves: ["wis", "cha"],
    feature: "Spellcasting (WIS): Sacred Flame, Cure Wounds, Guiding Bolt · Channel Divinity: Turn Undead / Preserve Life",
  },
  druid: {
    th: "Druid (ดรูอิด)", hitDie: 8, caster: true, castAbil: "wis",
    array: { str: 10, dex: 14, con: 13, int: 12, wis: 15, cha: 10 },
    acCalc: (c: any) => 11 + mod(c.abilities.dex), // leather
    weapon: "mace", ranged: null,
    skills: ["arcana", "nature", "medicine", "perception"],
    saves: ["int", "wis"],
    feature: "Spellcasting (WIS): Produce Flame, Cure Wounds, Entangle · Wild Shape (แปลงร่างเป็นสัตว์)",
  },
  fighter: {
    th: "Fighter (นักรบ)", hitDie: 10, caster: false,
    array: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
    acCalc: () => 16, // chain mail
    weapon: "longsword", ranged: "light_crossbow",
    skills: ["athletics", "perception", "intimidation"],
    saves: ["str", "con"],
    feature: "Second Wind: ฟื้น 1d10+level (1 ครั้ง/short rest) · Fighting Style",
  },
  monk: {
    th: "Monk (นักพรต)", hitDie: 8, caster: false,
    array: { str: 12, dex: 15, con: 13, int: 10, wis: 14, cha: 8 },
    acCalc: (c: any) => 10 + mod(c.abilities.dex) + mod(c.abilities.wis), // Unarmored Defense
    weapon: "shortsword", ranged: null,
    skills: ["acrobatics", "athletics", "insight", "stealth"],
    saves: ["str", "dex"],
    feature: "Martial Arts: ต่อยมือเปล่า 1d4+DEX, bonus action ต่อยมือเปล่า · Flurry of Blows (ต่อย 2 ครั้ง, ใช้ 1 ki)",
  },
  paladin: {
    th: "Paladin (พลาเดิน)", hitDie: 10, caster: true, castAbil: "cha",
    array: { str: 15, dex: 10, con: 14, int: 8, wis: 12, cha: 13 },
    acCalc: () => 16, // chain mail
    weapon: "longsword", ranged: null,
    skills: ["athletics", "insight", "intimidation", "persuasion"],
    saves: ["wis", "cha"],
    feature: "Divine Sense · Lay on Hands (ฟื้น 5×level HP, หรือแก้โรค/พิษ) · Spellcasting ที่ Lv.1 (D&D 2024)",
  },
  ranger: {
    th: "Ranger (เรนเจอร์)", hitDie: 10, caster: true, castAbil: "wis",
    array: { str: 13, dex: 15, con: 14, int: 10, wis: 12, cha: 8 },
    acCalc: (c: any) => 12 + mod(c.abilities.dex), // studded leather
    weapon: "shortsword", ranged: "longbow",
    skills: ["animal_handling", "athletics", "perception", "survival", "stealth"],
    saves: ["str", "dex"],
    feature: "Favored Enemy (ได้เปรียบติดตาม) · Natural Explorer · Spellcasting ที่ Lv.1 (D&D 2024)",
  },
  rogue: {
    th: "Rogue (โรค)", hitDie: 8, caster: false,
    array: { str: 8, dex: 15, con: 13, int: 12, wis: 10, cha: 14 },
    acCalc: (c: any) => 11 + mod(c.abilities.dex), // leather
    weapon: "shortsword", ranged: "shortbow",
    skills: ["stealth", "acrobatics", "deception", "perception", "investigation"],
    saves: ["dex", "int"],
    feature: "Sneak Attack: +Xd6 เมื่อโจมตีแบบได้เปรียบ (ซ่อนก่อน) · Expertise (เพิ่ม prof x2 ใน 2 สกิล)",
  },
  sorcerer: {
    th: "Sorcerer (เซอร์เซอเรอร์)", hitDie: 6, caster: true, castAbil: "cha",
    array: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 },
    acCalc: (c: any) => 10 + mod(c.abilities.dex), // no armor
    weapon: "dagger", ranged: null,
    skills: ["arcana", "deception", "intimidation", "persuasion"],
    saves: ["con", "cha"],
    feature: "Spellcasting (CHA): Fire Bolt, Magic Missile, Burning Hands · Sorcery Points (metamagic ที่ Lv.3)",
  },
  warlock: {
    th: "Warlock (วอร์ล็อค)", hitDie: 8, caster: true, castAbil: "cha",
    array: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 },
    acCalc: (c: any) => 11 + mod(c.abilities.dex), // light armor
    weapon: "dagger", ranged: "light_crossbow",
    skills: ["arcana", "deception", "history", "intimidation"],
    saves: ["wis", "cha"],
    feature: "Pact Magic (CHA): Eldritch Blast, Hex · Otherworldly Patron (Lv.1) · Eldritch Invocations (Lv.2)",
  },
  wizard: {
    th: "Wizard (พ่อมด)", hitDie: 6, caster: true, castAbil: "int",
    array: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
    acCalc: (c: any) => 10 + mod(c.abilities.dex),
    weapon: "dagger", ranged: null,
    skills: ["arcana", "investigation", "history", "religion"],
    saves: ["int", "wis"],
    feature: "Spellcasting (INT): Fire Bolt, Magic Missile, Burning Hands · Arcane Recovery (คืน slot ตอน short rest)",
  },
};

/* ---------------- CLASS FEATURES BY LEVEL (expanded for all 12 classes) ---------------- */
export const FEATURES: Record<string, Record<number, any[]>> = {
  barbarian: {
    1: [
      { k: "rage", th: "Rage (ความเกรี้ยวกราด)", desc: "Bonus action: ได้เปรียบ STR check, +2 ดาเมจโจมตีระยะประชิด, ต้านทาน bludgeoning/piercing/slashing. 2 ครั้ง/long rest ที่ Lv.1" },
      { k: "unarmored_defense", th: "Unarmored Defense (เกราะธรรมชาติ)", desc: "AC = 10 + DEX + CON ขณะไม่สวมเกราะ" },
    ],
    2: [{ k: "reckless_attack", th: "Reckless Attack (โจมตีบ้าบิ่น)", desc: "ได้เปรียบการโจมตี STR ระยะประชิด แต่ศัตรูโจมตีคุณได้เปรียบ" }],
    3: [{ k: "primal_path", th: "Primal Path", desc: "เลือก subclass: Berserker (Frenzy) หรือ Totem Warrior" }],
    4: [{ k: "asi", th: "Ability Score Improvement", desc: "+2 ค่า ability หนึ่งค่า หรือ +1 สองค่า (สูงสุด 20)" }],
    5: [
      { k: "extra_attack", th: "Extra Attack (โจมตีเพิ่ม)", desc: "โจมตี 2 ครั้งต่อ 1 Attack action" },
      { k: "fast_movement", th: "Fast Movement", desc: "ความเร็ว +10 ฟุต ขณะไม่สวมเกราะหนัก" },
    ],
  },
  bard: {
    1: [
      { k: "spellcasting", th: "Spellcasting", desc: "Cast bard spells (CHA). Cantrips: Vicious Mockery, Prestidigitation. Spells: Healing Word, Charm Person" },
      { k: "bardic_inspiration", th: "Bardic Inspiration", desc: "Bonus action: give ally a 1d6 to add to one attack/save/ability check within 10 min. Cha mod/long rest" },
    ],
    2: [{ k: "jack_of_all_trades", th: "Jack of All Trades", desc: "Add half proficiency to ability checks you're not proficient in" }],
    3: [{ k: "expertise", th: "Expertise", desc: "Double proficiency bonus in 2 chosen skills · Cutting Words (subclass: Lore)" }],
    4: [{ k: "asi", th: "Ability Score Improvement", desc: "+2 to one ability or +1 to two (max 20)" }],
    5: [{ k: "font_of_inspiration", th: "Font of Inspiration", desc: "Regain Bardic Inspiration on short rest · Inspiration die becomes 1d8" }],
  },
  cleric: {
    1: [{ k: "spellcasting", th: "Spellcasting (ร่ายเวท)", desc: "Sacred Flame, Cure Wounds, Healing Word, Guiding Bolt · Divine Domain feature" }],
    2: [{ k: "channel_divinity", th: "Channel Divinity (พลังพระเจ้า)", desc: "Turn Undead (ไล่ undead หนี) หรือ Preserve Life (ฟื้น 5×level, ไม่เกินครึ่ง Max HP). 1 ครั้ง/short rest" }],
    3: [{ k: "lv2_spells", th: "เวทระดับ 2", desc: "ปลด Spiritual Weapon, Hold Person, Aid" }],
    4: [{ k: "asi", th: "Ability Score Improvement", desc: "+2 ค่า ability หนึ่งค่า หรือ +1 สองค่า (สูงสุด 20)" }],
    5: [{ k: "lv3_spells", th: "เวทระดับ 3", desc: "ปลด Spirit Guardians, Revivify, Mass Healing Word" }],
  },
  druid: {
    1: [
      { k: "spellcasting", th: "Spellcasting", desc: "Druidcraft, Produce Flame, Cure Wounds, Entangle" },
      { k: "wild_shape", th: "Wild Shape", desc: "Turn into a beast CR ≤ 1/4 (no flying/swimming at Lv.1). 2/short rest" },
    ],
    2: [{ k: "wild_shape_improved", th: "Wild Shape (CR 1/2)", desc: "Can now transform into CR 1/2 beasts" }],
    3: [{ k: "lv2_spells", th: "Level 2 Spells", desc: "Unlocks Moonbeam, Barkskin, Spike Growth" }],
    4: [{ k: "asi", th: "Ability Score Improvement", desc: "+2 to one ability or +1 to two (max 20)" }],
    5: [{ k: "lv3_spells", th: "Level 3 Spells", desc: "Unlocks Call Lightning, Conjure Animals" }],
  },
  fighter: {
    1: [
      { k: "second_wind", th: "Second Wind (ลมหายใจที่สอง)", desc: "Bonus action: ฟื้น 1d10+level. 1 ครั้ง/short rest" },
      { k: "fighting_style", th: "Fighting Style (สไตล์การต่อสู้)", desc: "เลือก: Defense (+1 AC), Dueling (+2 ดาเมจมือเดียว), Great Weapon, Protection, Archery (+2 โจมตีระยะไกล)" },
    ],
    2: [{ k: "action_surge", th: "Action Surge (พุ่งแรง)", desc: "ทำ action เพิ่ม 1 ครั้งในเทิร์นเดียว. 1 ครั้ง/short rest" }],
    3: [{ k: "martial_archetype", th: "Martial Archetype", desc: "เลือก: Champion (crit 19-20), Battle Master (maneuvers), Eldritch Knight" }, { k: "improved_critical", th: "Improved Critical (Champion)", desc: "Critical hit on 19-20 (Champion archetype)" }],
    4: [{ k: "asi", th: "Ability Score Improvement", desc: "+2 ค่า ability หนึ่งค่า หรือ +1 สองค่า (สูงสุด 20)" }],
    5: [{ k: "extra_attack", th: "Extra Attack (โจมตีเพิ่ม)", desc: "โจมตี 2 ครั้งต่อ 1 Attack action" }],
  },
  monk: {
    1: [
      { k: "martial_arts", th: "Martial Arts", desc: "Unarmed strike 1d4+DEX. Bonus action unarmed strike after Attack action" },
      { k: "unarmored_defense", th: "Unarmored Defense", desc: "AC = 10 + DEX + WIS while unarmored" },
    ],
    2: [
      { k: "ki", th: "Ki", desc: "Ki points = level. Flurry of Blows (2 unarmed, 1 ki), Patient Defense (Disengage+Dodge, 1 ki), Step of the Wind (Dash+Disengage, 1 ki)" },
    ],
    3: [{ k: "monastic_tradition", th: "Monastic Tradition", desc: "Choose: Open Hand, Shadow, Four Elements" }],
    4: [{ k: "asi", th: "Ability Score Improvement", desc: "+2 to one ability or +1 to two (max 20) · Slow Fall (halve fall damage)" }],
    5: [{ k: "extra_attack", th: "Extra Attack", desc: "Attack twice per Attack action · Stunning Strike (1 ki to force CON save, stun on fail)" }],
  },
  paladin: {
    1: [
      { k: "divine_sense", th: "Divine Sense", desc: "Detect celestials/fiends/undead within 60 ft. Cha mod/long rest" },
      { k: "lay_on_hands", th: "Lay on Hands", desc: "Heal pool = 5×level HP (action to touch-heal). Or cure 1 disease/poison per 5 HP spent" },
    ],
    2: [
      { k: "spellcasting", th: "Spellcasting", desc: "Half-caster (CHA). Smite spells, Bless, Cure Wounds" },
      { k: "divine_smite", th: "Divine Smite", desc: "When you hit with melee weapon, spend 1 spell slot for extra 2d8 radiant (+1d8 per slot level above 1)" },
      { k: "fighting_style", th: "Fighting Style", desc: "Choose: Defense, Dueling, Great Weapon, Protection" },
    ],
    3: [{ k: "sacred_oath", th: "Sacred Oath", desc: "Choose: Devotion, Ancients, Vengeance · Channel Divinity options" }],
    4: [{ k: "asi", th: "Ability Score Improvement", desc: "+2 to one ability or +1 to two (max 20)" }],
    5: [{ k: "extra_attack", th: "Extra Attack", desc: "Attack twice per Attack action" }],
  },
  ranger: {
    1: [
      { k: "favored_enemy", th: "Favored Enemy", desc: "Advantage on Survival to track, and on Int checks to recall info about chosen type" },
      { k: "natural_explorer", th: "Natural Explorer", desc: "Double proficiency on Survival in favored terrain; no slow from difficult terrain" },
    ],
    2: [
      { k: "spellcasting", th: "Spellcasting", desc: "Half-caster (WIS). Hunter's Mark, Cure Wounds, Pass Without Trace" },
      { k: "fighting_style", th: "Fighting Style", desc: "Choose: Archery, Defense, Dueling, Two-Weapon" },
    ],
    3: [{ k: "ranger_conclave", th: "Ranger Conclave", desc: "Choose: Hunter, Beast Master · Primeval Awareness" }],
    4: [{ k: "asi", th: "Ability Score Improvement", desc: "+2 to one ability or +1 to two (max 20)" }],
    5: [{ k: "extra_attack", th: "Extra Attack", desc: "Attack twice per Attack action" }],
  },
  rogue: {
    1: [
      { k: "sneak_attack", th: "Sneak Attack (โจมตีลอบ)", desc: "+1d6 (Lv.1), +2d6 (Lv.3), +3d6 (Lv.5) เมื่อโจมตีแบบได้เปรียบ หรือมีพันธมิตรอยู่ใกล้เป้า" },
      { k: "expertise", th: "Expertise (ความเชี่ยวชาญ)", desc: "เพิ่ม proficiency x2 ใน 2 สกิลที่เลือก (Stealth + Thieves' Tools ทั่วไป)" },
    ],
    2: [{ k: "cunning_action", th: "Cunning Action (แอคชั่นเจ้าเล่ห์)", desc: "Dash/Disengage/Hide เป็น bonus action" }],
    3: [{ k: "roguish_archetype", th: "Roguish Archetype", desc: "เลือก: Thief (Fast Hands - ใช้ไอเทมเป็น bonus action), Assassin, Arcane Trickster" }],
    4: [{ k: "asi", th: "Ability Score Improvement", desc: "+2 ค่า ability หนึ่งค่า หรือ +1 สองค่า (สูงสุด 20)" }],
    5: [{ k: "uncanny_dodge", th: "Uncanny Dodge (หลบหลีกประหลาด)", desc: "Reaction: ลดดาเมจครึ่งหนึ่งจากผู้โจมตีที่มองเห็น. 1 ครั้ง/รอบ" }],
  },
  sorcerer: {
    1: [
      { k: "spellcasting", th: "Spellcasting", desc: "Sorcerer spells (CHA). Cantrips: Fire Bolt, Light. Spells: Magic Missile, Burning Hands" },
      { k: "sorcerous_origin", th: "Sorcerous Origin", desc: "Choose: Draconic (extra HP, elemental affinity) or Wild Magic" },
    ],
    2: [{ k: "font_of_magic", th: "Font of Magic", desc: "Sorcery Points = level. Create spell slot (2 SP = Lv1 slot) or convert slot to SP" }],
    3: [{ k: "metamagic", th: "Metamagic", desc: "Choose 2: Quickened (bonus action), Twinned (2 targets), Empowered (reroll dmg), Subtle" }],
    4: [{ k: "asi", th: "Ability Score Improvement", desc: "+2 to one ability or +1 to two (max 20)" }],
    5: [{ k: "metamagic_2", th: "Additional Metamagic", desc: "Learn 1 more Metamagic option" }],
  },
  warlock: {
    1: [
      { k: "pact_magic", th: "Pact Magic", desc: "Warlock spells (CHA). Cantrips: Eldritch Blast. Spells: Hex, Hellish Rebuke" },
      { k: "otherworldly_patron", th: "Otherworldly Patron", desc: "Choose: Archfey, Fiend, Great Old One · Patron feature" },
    ],
    2: [{ k: "eldritch_invocations", th: "Eldritch Invocations", desc: "Choose 2: Agonizing Blast (+CHA to Eldritch Blast), Devil's Sight, Mask of Many Faces" }],
    3: [{ k: "pact_boon", th: "Pact Boon", desc: "Choose: Pact of the Chain (familiar), Blade (weapon), Tome (rituals)" }],
    4: [{ k: "asi", th: "Ability Score Improvement", desc: "+2 to one ability or +1 to two (max 20)" }],
    5: [{ k: "eldritch_invocations_2", th: "Additional Invocation", desc: "Learn 1 more Eldritch Invocation · Lv3 slots" }],
  },
  wizard: {
    1: [
      { k: "spellcasting", th: "Spellcasting (ร่ายเวท)", desc: "เวท Wizard (INT). Cantrips: Fire Bolt, Mage Hand, Light. Spells: Magic Missile, Burning Hands, Shield" },
      { k: "arcane_recovery", th: "Arcane Recovery (ฟื้นเวท)", desc: "1 ครั้ง/long rest ตอน short rest คืน spell slot รวมระดับไม่เกิน level/2 (ปัดขึ้น)" },
    ],
    2: [{ k: "arcane_tradition", th: "Arcane Tradition", desc: "เลือก: Evocation (Sculpt Spells), Abjuration (Ward), Conjuration, Divination, Enchantment, Illusion, Necromancy, Transmutation" }],
    3: [{ k: "lv2_spells", th: "เวทระดับ 2", desc: "ปลด Scorching Ray, Misty Step, Web, Invisibility" }],
    4: [{ k: "asi", th: "Ability Score Improvement", desc: "+2 ค่า ability หนึ่งค่า หรือ +1 สองค่า (สูงสุด 20)" }],
    5: [{ k: "lv3_spells", th: "เวทระดับ 3", desc: "ปลด Fireball, Counterspell, Fly, Lightning Bolt" }],
  },
};

/* ---------------- WEAPONS (D&D 2024 PHB — with 8 official Masteries + Versatile dmg + Reach) ---------------- */
// D&D 2024 weapon properties: Ammunition, Finesse, Heavy, Light, Loading, Range, Reach, Special, Thrown, Two-Handed, Versatile
// D&D 2024 Weapon Mastery — 8 official masteries (Flex was DROPPED before publication):
//   Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex
// Source: D&D Beyond "Your Guide to Weapon Mastery in the 2024 Player's Handbook" — confirms exactly 8 masteries.
// Each weapon now has: dmg (1-hand), versatileDmg (2-hand), reach (ft, default 5), rangeNormal/rangeLong (ft, for ranged/thrown), mastery (2024 property)
export const WEAPONS: Record<string, any> = {
  // === Simple Melee ===
  club:        { th: "Club",        dmg: "1d4", abil: "str", ranged: false, price: 1,   type: "simple", weight: 2,  properties: ["light"],                         mastery: null,         reach: 5 },
  dagger:      { th: "Dagger",      dmg: "1d4", abil: "dex", ranged: false, price: 2,   type: "simple", weight: 1,  properties: ["finesse","light","thrown"],     mastery: "nick",       reach: 5, thrown: true, rangeNormal: 20, rangeLong: 60 },
  greatclub:   { th: "Greatclub",   dmg: "1d8", abil: "str", ranged: false, price: 2,   type: "simple", weight: 10, properties: ["two-handed"],                    mastery: "push",     reach: 5 },
  handaxe:     { th: "Handaxe",     dmg: "1d6", abil: "str", ranged: false, price: 5,   type: "simple", weight: 2,  properties: ["light","thrown"],               mastery: "vex",        reach: 5, thrown: true, rangeNormal: 20, rangeLong: 60 },
  javelin:     { th: "Javelin",     dmg: "1d6", abil: "str", ranged: false, price: 5,   type: "simple", weight: 2,  properties: ["thrown"],                       mastery: "slow",       reach: 5, thrown: true, rangeNormal: 30, rangeLong: 120 },
  light_hammer:{ th: "Light Hammer",dmg: "1d4", abil: "str", ranged: false, price: 2,   type: "simple", weight: 2,  properties: ["light","thrown"],               mastery: "nick",       reach: 5, thrown: true, rangeNormal: 20, rangeLong: 60 },
  mace:        { th: "Mace",        dmg: "1d6", abil: "str", ranged: false, price: 5,   type: "simple", weight: 4,  properties: [],                                mastery: "sap",        reach: 5 },
  quarterstaff:{ th: "Quarterstaff",dmg: "1d6", abil: "str", ranged: false, price: 2,   type: "simple", weight: 4,  properties: ["versatile"], versatileDmg: "1d8", mastery: "topple",  reach: 5 },
  sickle:      { th: "Sickle",      dmg: "1d4", abil: "str", ranged: false, price: 1,   type: "simple", weight: 2,  properties: ["light"],                         mastery: "nick",       reach: 5 },
  spear:       { th: "Spear",       dmg: "1d6", abil: "str", ranged: false, price: 1,   type: "simple", weight: 3,  properties: ["thrown","versatile"], versatileDmg: "1d8", mastery: "sap", reach: 5, thrown: true, rangeNormal: 20, rangeLong: 60 },
  // === Simple Ranged ===
  light_crossbow:{ th: "Light Crossbow", dmg: "1d8", abil: "dex", ranged: true, price: 25, type: "simple", weight: 5, properties: ["ammunition","loading","two-handed"], mastery: "slow", rangeNormal: 80, rangeLong: 320 },
  dart:        { th: "Dart",        dmg: "1d4", abil: "dex", ranged: true,  price: 5,   type: "simple", weight: 0.25,properties: ["finesse","thrown"],             mastery: "vex",        thrown: true, rangeNormal: 20, rangeLong: 60 },
  shortbow:    { th: "Shortbow",    dmg: "1d6", abil: "dex", ranged: true,  price: 25,  type: "simple", weight: 2,  properties: ["ammunition","two-handed"],       mastery: "vex",        rangeNormal: 80, rangeLong: 320 },
  sling:       { th: "Sling",       dmg: "1d4", abil: "dex", ranged: true,  price: 1,   type: "simple", weight: 0,  properties: ["ammunition"],                    mastery: "slow",     rangeNormal: 30, rangeLong: 120 },
  // === Martial Melee ===
  battleaxe:   { th: "Battleaxe",   dmg: "1d8", abil: "str", ranged: false, price: 10,  type: "martial", weight: 4, properties: ["versatile"], versatileDmg: "1d10", mastery: "topple",  reach: 5 },
  flail:       { th: "Flail",       dmg: "1d8", abil: "str", ranged: false, price: 10,  type: "martial", weight: 2, properties: [],                                mastery: "sap",        reach: 5 },
  glaive:      { th: "Glaive",      dmg: "1d10",abil: "str", ranged: false, price: 20,  type: "martial", weight: 6, properties: ["heavy","reach","two-handed"],   mastery: "graze",      reach: 10 },
  greataxe:    { th: "Greataxe",    dmg: "1d12",abil: "str", ranged: false, price: 30,  type: "martial", weight: 7, properties: ["heavy","two-handed"],           mastery: "cleave",     reach: 5 },
  greatsword:  { th: "Greatsword",  dmg: "2d6", abil: "str", ranged: false, price: 50,  type: "martial", weight: 6, properties: ["heavy","two-handed"],           mastery: "graze",      reach: 5 },
  halberd:     { th: "Halberd",     dmg: "1d10",abil: "str", ranged: false, price: 20,  type: "martial", weight: 6, properties: ["heavy","reach","two-handed"],   mastery: "cleave",     reach: 10 },
  lance:       { th: "Lance",       dmg: "1d12",abil: "str", ranged: false, price: 10,  type: "martial", weight: 6, properties: ["reach","special"],               mastery: "topple",     reach: 10 },
  longsword:   { th: "Longsword",   dmg: "1d8", abil: "str", ranged: false, price: 15,  type: "martial", weight: 3, properties: ["versatile"], versatileDmg: "1d10", mastery: "sap",  reach: 5 },
  morningstar: { th: "Morningstar", dmg: "1d8", abil: "str", ranged: false, price: 15,  type: "martial", weight: 4, properties: [],                                mastery: "sap",        reach: 5 },
  pike:        { th: "Pike",        dmg: "1d10",abil: "str", ranged: false, price: 5,   type: "martial", weight: 18,properties: ["heavy","reach","two-handed"],   mastery: "push",       reach: 10 },
  rapier:      { th: "Rapier",      dmg: "1d8", abil: "dex", ranged: false, price: 25,  type: "martial", weight: 2, properties: ["finesse"],                       mastery: "vex",        reach: 5 },
  scimitar:    { th: "Scimitar",    dmg: "1d6", abil: "dex", ranged: false, price: 25,  type: "martial", weight: 3, properties: ["finesse","light"],               mastery: "nick",       reach: 5 },
  shortsword:  { th: "Shortsword",  dmg: "1d6", abil: "dex", ranged: false, price: 10,  type: "martial", weight: 2, properties: ["finesse","light"],               mastery: "vex",        reach: 5 },
  trident:     { th: "Trident",     dmg: "1d6", abil: "str", ranged: false, price: 5,   type: "martial", weight: 4, properties: ["thrown","versatile"], versatileDmg: "1d8", mastery: "topple", reach: 5, thrown: true, rangeNormal: 20, rangeLong: 60 },
  war_pick:    { th: "War Pick",    dmg: "1d8", abil: "str", ranged: false, price: 5,   type: "martial", weight: 2, properties: [],                                mastery: "sap",     reach: 5 },
  warhammer:   { th: "Warhammer",   dmg: "1d8", abil: "str", ranged: false, price: 15,  type: "martial", weight: 2, properties: ["versatile"], versatileDmg: "1d10", mastery: "push",  reach: 5 },
  whip:        { th: "Whip",        dmg: "1d4", abil: "dex", ranged: false, price: 2,   type: "martial", weight: 3, properties: ["finesse","reach"],               mastery: "slow",       reach: 10 },
  // === Martial Ranged ===
  blowgun:     { th: "Blowgun",     dmg: "1d1", abil: "dex", ranged: true,  price: 10,  type: "martial", weight: 1,  properties: ["ammunition","loading"],          mastery: null,         rangeNormal: 25, rangeLong: 100 },
  hand_crossbow:{ th: "Hand Crossbow",dmg: "1d6",abil: "dex", ranged: true,  price: 75,  type: "martial", weight: 3,  properties: ["ammunition","light","loading"], mastery: "vex",        rangeNormal: 30, rangeLong: 120 },
  heavy_crossbow:{ th: "Heavy Crossbow",dmg: "1d10",abil:"dex", ranged: true, price: 50, type: "martial", weight: 18, properties: ["ammunition","heavy","loading","two-handed"], mastery: "push", rangeNormal: 100, rangeLong: 400 },
  longbow:     { th: "Longbow",     dmg: "1d8", abil: "dex", ranged: true,  price: 50,  type: "martial", weight: 2,  properties: ["ammunition","heavy","two-handed"], mastery: "slow",  rangeNormal: 150, rangeLong: 600 },
  net:         { th: "Net",         dmg: "0",   abil: "dex", ranged: true,  price: 1,   type: "martial", weight: 3,  properties: ["thrown","special"],              mastery: null,        thrown: true, rangeNormal: 5, rangeLong: 15 },
  // === Magic Weapons (+1/+2/+3) — masteries reassigned to 2024 (no Flex) ===
  dagger_p1:      { th: "Dagger +1",      dmg: "1d4", abil: "dex", ranged: false, price: 800,   type: "magic", plus: 1, properties: ["finesse","light","thrown"],     mastery: "nick",       reach: 5, thrown: true, rangeNormal: 20, rangeLong: 60, rarity: "uncommon" },
  shortsword_p1:  { th: "Shortsword +1",  dmg: "1d6", abil: "dex", ranged: false, price: 1000,  type: "magic", plus: 1, properties: ["finesse","light"],               mastery: "vex",        reach: 5, rarity: "uncommon" },
  longsword_p1:   { th: "Longsword +1",   dmg: "1d8", abil: "str", ranged: false, price: 1000,  type: "magic", plus: 1, properties: ["versatile"], versatileDmg: "1d10", mastery: "sap", reach: 5, rarity: "uncommon" },
  longsword_p2:   { th: "Longsword +2",   dmg: "1d8", abil: "str", ranged: false, price: 4000,  type: "magic", plus: 2, properties: ["versatile"], versatileDmg: "1d10", mastery: "sap", reach: 5, rarity: "rare" },
  longsword_p3:   { th: "Longsword +3",   dmg: "1d8", abil: "str", ranged: false, price: 12000, type: "magic", plus: 3, properties: ["versatile"], versatileDmg: "1d10", mastery: "sap", reach: 5, rarity: "very_rare" },
  warhammer_p1:   { th: "Warhammer +1",   dmg: "1d8", abil: "str", ranged: false, price: 1000,  type: "magic", plus: 1, properties: ["versatile"], versatileDmg: "1d10", mastery: "push",  reach: 5, rarity: "uncommon" },
  rapier_p1:      { th: "Rapier +1",      dmg: "1d8", abil: "dex", ranged: false, price: 1000,  type: "magic", plus: 1, properties: ["finesse"],                       mastery: "vex",        reach: 5, rarity: "uncommon" },
  greataxe_p1:    { th: "Greataxe +1",    dmg: "1d12",abil: "str", ranged: false, price: 1000,  type: "magic", plus: 1, properties: ["heavy","two-handed"],           mastery: "cleave",     reach: 5, rarity: "uncommon" },
  greatsword_p1:  { th: "Greatsword +1",  dmg: "2d6", abil: "str", ranged: false, price: 1000,  type: "magic", plus: 1, properties: ["heavy","two-handed"],           mastery: "graze",      reach: 5, rarity: "uncommon" },
  longbow_p1:     { th: "Longbow +1",     dmg: "1d8", abil: "dex", ranged: true,  price: 1200,  type: "magic", plus: 1, properties: ["ammunition","heavy","two-handed"], mastery: "slow", rangeNormal: 150, rangeLong: 600, rarity: "uncommon" },
  shortbow_p1:    { th: "Shortbow +1",    dmg: "1d6", abil: "dex", ranged: true,  price: 800,   type: "magic", plus: 1, properties: ["ammunition","two-handed"],       mastery: "vex",        rangeNormal: 80, rangeLong: 320, rarity: "uncommon" },
  mace_p1:        { th: "Mace +1",        dmg: "1d6", abil: "str", ranged: false, price: 800,   type: "magic", plus: 1, properties: [],                                mastery: "sap",        reach: 5, rarity: "uncommon" },
  dagger_venom:   { th: "Dagger of Venom",dmg: "1d4", abil: "dex", ranged: false, price: 2500,  type: "magic", plus: 0, properties: ["finesse","light","thrown"],     mastery: "nick",       reach: 5, thrown: true, rangeNormal: 20, rangeLong: 60, rarity: "rare", special: "Poison: press button to coat blade, +2d6 poison dmg for 1 minute" },
  sun_blade:      { th: "Sun Blade",      dmg: "1d8", abil: "dex", ranged: false, price: 8000,  type: "magic", plus: 2, properties: ["finesse","versatile"], versatileDmg: "1d10", mastery: "vex", reach: 5, rarity: "rare", special: "Sun Blade: emits light, +1d8 radiant vs undead", requires_attunement: true },
  holy_avenger:   { th: "Holy Avenger",   dmg: "1d8", abil: "str", ranged: false, price: 50000, type: "magic", plus: 3, properties: ["versatile"], versatileDmg: "1d10", mastery: "sap", reach: 5, rarity: "legendary", special: "Holy Avenger: +3, aura vs evil, bonus damage to undead/fiends", requires_attunement: true },
};

/* ---------------- WEAPON MASTERY DESCRIPTIONS (D&D 2024 — 8 official masteries, Flex dropped) ---------------- */
export const WEAPON_MASTERIES: Record<string, { th: string; description: string; descriptionTh: string }> = {
  cleave:  { th: "Cleave",  description: "On hit, deal weapon damage to one creature within 5 ft of target (no ability mod). Once per turn.", descriptionTh: "โจมตีแล้ว: ศัตรูตัวอื่นในระยะ 5 ฟุตโดน dmg ด้วย (ไม่รวม ability mod) — 1 ครั้ง/เทิร์น" },
  graze:   { th: "Graze",   description: "On miss, deal damage equal to ability modifier (minimum 1).", descriptionTh: "พลาด: โดน dmg เท่ากับ ability mod (ขั้นต่ำ 1)" },
  nick:    { th: "Nick",    description: "Two-weapon fighting: bonus attack uses weapon's damage die (no ability mod needed). Once per turn.", descriptionTh: "Two-Weapon: bonus attack ได้ dmg เต็มเต๋า (ไม่ต้องลด ability mod) — 1 ครั้ง/เทิร์น" },
  push:    { th: "Push",    description: "On hit, push target 10 ft away if they are Large or smaller.", descriptionTh: "โจมตีแล้ว: ผลักเป้า 10 ฟุต (ถ้า Large หรือเล็กกว่า)" },
  sap:     { th: "Sap",     description: "On hit, target has disadvantage on next attack roll before next turn.", descriptionTh: "โจมตีแล้ว: เป้าเสียเปรียบโจมตีครั้งถัดไป" },
  slow:    { th: "Slow",    description: "On hit, reduce target's speed by 10 ft until start of next turn.", descriptionTh: "โจมตีแล้ว: ลดความเร็วเป้า 10 ฟุต จนถึงต้นเทิร์นถัดไป" },
  topple:  { th: "Topple",  description: "On hit, force target to make a CON save or fall prone (DC = 8 + prof + ability mod).", descriptionTh: "โจมตีแล้ว: เป้า CON save ไม่ผ่าน → ล้ม (DC 8+prof+abil)" },
  vex:     { th: "Vex",     description: "On hit, gain advantage on next attack roll against target before next turn.", descriptionTh: "โจมตีแล้ว: ได้เปรียบโจมตีครั้งถัดไปใส่เป้า" },
};

export const weaponByName = (nm: string) => Object.entries(WEAPONS).find(([, w]) => w.th === nm);

/* ---------------- ARMOR (D&D 2024 PHB) ---------------- */
// D&D 2024 changes:
//   - No more STR requirement for heavy armor (was in 2014, removed in 2024)
//   - No more stealth disadvantage from armor (removed in 2024 — simplified)
//   - Don/Doff times: Light 1min/1min, Medium 5min/1min, Heavy 10min/5min, Shield 1 action/1 action
//   - Categories: Light (full DEX), Medium (DEX max 2), Heavy (no DEX)
export const ARMOR: Record<string, any> = {
  // Light armor (full DEX bonus)
  padded:          { th: "Padded",          acBase: 11, dexBonus: true,  price: 5,    type: "light",  weight: 8,  donTime: "1 min",  doffTime: "1 min" },
  leather:         { th: "Leather",         acBase: 11, dexBonus: true,  price: 10,   type: "light",  weight: 10, donTime: "1 min",  doffTime: "1 min" },
  studded_leather: { th: "Studded Leather", acBase: 12, dexBonus: true,  price: 45,   type: "light",  weight: 13, donTime: "1 min",  doffTime: "1 min" },
  // Medium armor (DEX max 2)
  chain_shirt:     { th: "Chain Shirt",     acBase: 13, dexBonus: true, maxDex: 2, price: 50,  type: "medium", weight: 20, donTime: "5 min", doffTime: "1 min" },
  scale_mail:      { th: "Scale Mail",      acBase: 14, dexBonus: true, maxDex: 2, price: 50,  type: "medium", weight: 45, donTime: "5 min", doffTime: "1 min" },
  breastplate:     { th: "Breastplate",     acBase: 14, dexBonus: true, maxDex: 2, price: 400, type: "medium", weight: 20, donTime: "5 min", doffTime: "1 min" },
  half_plate:      { th: "Half Plate",      acBase: 15, dexBonus: true, maxDex: 2, price: 750, type: "medium", weight: 40, donTime: "5 min", doffTime: "1 min" },
  // Heavy armor (no DEX bonus) — D&D 2024: no STR requirement, no stealth disadvantage
  ring_mail:       { th: "Ring Mail",       acBase: 14, dexBonus: false, price: 30,   type: "heavy", weight: 30, donTime: "10 min", doffTime: "5 min" },
  chain_mail:      { th: "Chain Mail",      acBase: 16, dexBonus: false, price: 75,   type: "heavy", weight: 55, donTime: "10 min", doffTime: "5 min" },
  splint:          { th: "Splint",          acBase: 17, dexBonus: false, price: 200,  type: "heavy", weight: 60, donTime: "10 min", doffTime: "5 min" },
  plate:           { th: "Plate",           acBase: 18, dexBonus: false, price: 1500, type: "heavy", weight: 65, donTime: "10 min", doffTime: "5 min" },
  // Shields (+2 AC, separate slot)
  shield:          { th: "Shield",          acPlus: 2,  price: 10, type: "shield", slot: "shield", weight: 6, donTime: "1 action", doffTime: "1 action" },
};

/* ---------------- MAGIC ITEMS (expanded) ---------------- */
export const MAGIC_ITEMS: Record<string, any> = {
  "Cloak of Elvenkind": { slot: "cloak", effect: "adv_stealth", price: 500, desc: "Advantage on Stealth checks while worn; enemies have disadvantage on Perception to find you" },
  "Boots of Elvenkind": { slot: "boots", effect: "adv_stealth", price: 500, desc: "Silent footsteps — advantage on Stealth checks" },
  "Gloves of Thievery": { slot: "gloves", effect: "sleight5", price: 500, desc: "+5 Sleight of Hand" },
  "Studded Leather Armor +1": { slot: "armor", acBase: 12, acBonus: 1, price: 1500, desc: "Light armor AC 12+DEX+1" },
  "Studded Leather Armor +2": { slot: "armor", acBase: 12, acBonus: 2, price: 4000, desc: "Light armor AC 12+DEX+2" },
  "Studded Leather Armor +3": { slot: "armor", acBase: 12, acBonus: 3, price: 8000, desc: "Light armor AC 12+DEX+3" },
  "Chain Mail +1": { slot: "armor", acBase: 16, acBonus: 1, price: 1500, desc: "Heavy armor AC 17 (no DEX)" },
  "Plate Armor +1": { slot: "armor", acBase: 18, acBonus: 1, price: 4500, desc: "Heavy armor AC 19 (no DEX)" },
  "Plate Armor +2": { slot: "armor", acBase: 18, acBonus: 2, price: 8000, desc: "Heavy armor AC 20 (no DEX)" },
  "Ring of Protection": { slot: "ring", acPlus: 1, savePlus: 1, price: 2000, desc: "+1 AC and +1 to all saving throws" },
  "Ring of Invisibility": { slot: "ring", effect: "invisibility", price: 20000, desc: "Turn invisible (🫥 button in combat) — attacks have advantage, enemies attack you with disadvantage, until you attack" },
  "Amulet of Health": { slot: "amulet", effect: "con19", price: 8000, desc: "Sets Constitution to 19 while worn ( recalculates Max HP )" },
  "Belt of Giant Strength (Hill)": { slot: "belt", effect: "str21", price: 12000, desc: "Sets Strength to 21 while worn" },
  "Headband of Intellect": { slot: "head", effect: "int19", price: 4000, desc: "Sets Intelligence to 19 while worn" },
  "Gauntlets of Ogre Power": { slot: "gloves", effect: "str19", price: 4000, desc: "Sets Strength to 19 while worn" },
  "Bracers of Archery": { slot: "bracers", effect: "archery2", price: 1500, desc: "+2 damage with longbows/shortbows" },
  "Bag of Holding": { slot: "bag", price: 1000, desc: "Extradimensional bag, holds vast items (no mechanical effect)" },
  "Boots of Striding and Springing": { slot: "boots", effect: "speed", price: 1500, desc: "Speed not reduced by heavy armor; +5 ft long jump" },
  "Cloak of Protection": { slot: "cloak", acPlus: 1, savePlus: 1, price: 1500, desc: "+1 AC and +1 to all saving throws" },
  "Winged Boots": { slot: "boots", effect: "fly", price: 8000, desc: "Fly up to 1 hour per day" },
  "Periapt of Proof Against Poison": { slot: "amulet", effect: "poison_immune", price: 5000, desc: "Immune to poison" },
  "Brooch of Shielding": { slot: "amulet", effect: "magic_resist", price: 1500, desc: "+1 AC vs magic missiles (immune) and resistance to magic damage" },
  "Goggles of Night": { slot: "head", effect: "darkvision", price: 500, desc: "Darkvision 60 ft" },
  "Druid's Bell": { slot: "wondrous", effect: "druid_focus", price: 100, desc: "Druid spellcasting focus" },
  "Holy Symbol": { slot: "wondrous", effect: "cleric_focus", price: 5, desc: "Cleric/Paladin spellcasting focus" },
  "Arcane Focus": { slot: "wondrous", effect: "wizard_focus", price: 10, desc: "Wizard/Sorcerer/Warlock spellcasting focus" },
};
export const wornHas = (c: any, eff: string) => (c.worn || []).some((n: string) => MAGIC_ITEMS[n] && MAGIC_ITEMS[n].effect === eff);

/* ---------------- CONSUMABLES (expanded) ---------------- */
export const CONSUMABLES: Record<string, any> = {
  "Potion of Healing": { heal: "2d4+2", combat: true, price: 50 },
  "Potion of Greater Healing": { heal: "4d4+4", combat: true, price: 150 },
  "Potion of Superior Healing": { heal: "8d4+8", combat: true, price: 750 },
  "Potion of Supreme Healing": { heal: "10d4+20", combat: true, price: 2500 },
  "Potion of Climbing": { effect: "adv_athletics_climb", duration: "1 hour", combat: false, price: 100 },
  "Potion of Healing (Greater)": { heal: "4d4+4", combat: true, price: 150 },
  "Antitoxin": { cure: "poisoned", combat: true, price: 50, also: "adv_poison_save_1hr" },
  "Elixir of Health": { cure: "disease", also: "cures_blinded_deafened_paralyzed_poisoned", combat: true, price: 500 },
  "Potion of Fire Resistance": { effect: "fire_resist", duration: "10 min", combat: false, price: 250 },
  "Potion of Cold Resistance": { effect: "cold_resist", duration: "10 min", combat: false, price: 250 },
  "Potion of Invisibility": { effect: "invisible", duration: "1 hour or until attack", combat: true, price: 5000 },
  "Oil of Sharpness": { effect: "weapon_p1", duration: "permanent (1 application)", combat: false, price: 500 },
  "Rations": { heal: "1d4", combat: false, price: 1 },
  "Torch": { effect: "light", duration: "1 hour", combat: false, price: 1 },
  "Healer's Kit": { effect: "stabilize", uses: 10, combat: true, price: 5 },
  "Acid (vial)": { dmg: "2d6", combat: true, ranged: true, price: 25, dmgType: "acid" },
  "Alchemist's Fire": { dmg: "1d4", combat: true, ranged: true, price: 50, dmgType: "fire", ongoing: "1d4 fire/round until doused" },
  "Holy Water": { dmg: "2d6", combat: true, ranged: true, price: 25, dmgType: "radiant", vs: "undead/fiends" },
  "Tanglefoot Bag": { effect: "restrained", combat: true, ranged: true, price: 50, save: "dex_dc10" },
  "Thunderstone": { effect: "deafened", combat: true, ranged: true, price: 50, save: "con_dc10" },
};

/* ---------------- IN-ENGINE BESTIARY (expanded + SRD fallback) ---------------- */
export const BESTIARY: Record<string, any> = {
  // CR 0-1/8
  giant_rat: { th: "Giant Rat", ac: 12, hp: 7, atk: 4, dmg: "1d4+2", init: 2, xp: 25, sv: { dex: 2, con: 0, wis: 0 } },
  bat: { th: "Bat", ac: 12, hp: 1, atk: 0, dmg: "1d1", init: 2, xp: 10, sv: { dex: 0, con: 0, wis: 0 } },
  cat: { th: "Cat", ac: 12, hp: 3, atk: 4, dmg: "1d1", init: 2, xp: 10, sv: { dex: 2, con: 0, wis: 2 } },
  crab: { th: "Crab", ac: 15, hp: 2, atk: 0, dmg: "1d1", init: -1, xp: 10, sv: { dex: -1, con: 0, wis: 0 } },
  frog: { th: "Frog", ac: 11, hp: 1, atk: 0, dmg: "0", init: 1, xp: 10, sv: { dex: 1, con: 0, wis: 0 } },
  // CR 1/4
  bandit: { th: "Bandit", ac: 12, hp: 11, atk: 3, dmg: "1d6+1", init: 1, xp: 25, sv: { dex: 1, con: 1, wis: 0 } },
  cultist: { th: "Cultist", ac: 12, hp: 9, atk: 3, dmg: "1d6+1", init: 1, xp: 25, sv: { dex: 1, con: 0, wis: 0 } },
  kobold: { th: "Kobold", ac: 12, hp: 5, atk: 4, dmg: "1d4+2", init: 2, xp: 25, sv: { dex: 2, con: 0, wis: -1 } },
  goblin: { th: "Goblin", ac: 13, hp: 7, atk: 4, dmg: "1d6+2", init: 2, xp: 50, sv: { dex: 2, con: 0, wis: -1 } },
  skeleton: { th: "Skeleton", ac: 13, hp: 13, atk: 4, dmg: "1d6+2", init: 2, xp: 50, sv: { dex: 2, con: 2, wis: -3 } },
  wolf: { th: "Wolf", ac: 13, hp: 11, atk: 4, dmg: "2d4+2", init: 2, xp: 50, sv: { dex: 2, con: 1, wis: 1 } },
  // CR 1/2
  zombie: { th: "Zombie", ac: 8, hp: 22, atk: 3, dmg: "1d6+1", init: -2, xp: 50, sv: { dex: -2, con: 3, wis: -2 } },
  draft_horse: { th: "Draft Horse", ac: 10, hp: 19, atk: 6, dmg: "1d6+4", init: 0, xp: 50, sv: { dex: 0, con: 3, wis: -1 } },
  giant_wasp: { th: "Giant Wasp", ac: 12, hp: 13, atk: 4, dmg: "1d6+2", init: 2, xp: 100, sv: { dex: 2, con: 1, wis: 0 } },
  goblin_boss: { th: "Goblin Boss", ac: 14, hp: 21, atk: 4, dmg: "1d6+2", init: 2, xp: 100, sv: { dex: 2, con: 1, wis: -1 } },
  // CR 1
  orc: { th: "Orc", ac: 13, hp: 15, atk: 5, dmg: "1d12+3", init: 1, xp: 100, sv: { dex: 1, con: 3, wis: 0 } },
  dire_wolf: { th: "Dire Wolf", ac: 14, hp: 37, atk: 5, dmg: "2d6+3", init: 2, xp: 200, sv: { dex: 2, con: 3, wis: 1 } },
  ghoul: { th: "Ghoul", ac: 12, hp: 22, atk: 4, dmg: "2d6+2", init: 2, xp: 200, sv: { dex: 2, con: 0, wis: 0 } },
  giant_spider: { th: "Giant Spider", ac: 14, hp: 26, atk: 5, dmg: "1d8+3", init: 3, xp: 200, poison: { dc: 11, dmg: "2d8" }, sv: { dex: 3, con: 1, wis: 0 } },
  bugbear: { th: "Bugbear", ac: 16, hp: 27, atk: 4, dmg: "2d8+2", init: 2, xp: 200, sv: { dex: 2, con: 1, wis: 0 } },
  // CR 2
  ogre: { th: "Ogre", ac: 11, hp: 59, atk: 6, dmg: "2d8+4", init: -1, xp: 450, sv: { dex: -1, con: 3, wis: -2 } },
  giant_constrictor_snake: { th: "Giant Constrictor Snake", ac: 12, hp: 60, atk: 6, dmg: "2d6+4", init: 2, xp: 450, sv: { dex: 2, con: 3, wis: 0 } },
  // CR 3
  owlbear: { th: "Owlbear", ac: 13, hp: 59, atk: 7, dmg: "1d10+5", init: 2, xp: 700, sv: { dex: 1, con: 3, wis: 1 } },
  manticore: { th: "Manticore", ac: 14, hp: 68, atk: 6, dmg: "1d8+3", init: 3, xp: 700, sv: { dex: 2, con: 3, wis: 1 } },
  // CR 4
  ettin: { th: "Ettin", ac: 13, hp: 85, atk: 7, dmg: "2d6+4", init: 0, xp: 1100, sv: { dex: 0, con: 4, wis: -1 } },
  // CR 5
  hill_giant: { th: "Hill Giant", ac: 13, hp: 105, atk: 8, dmg: "3d8+5", init: -1, xp: 1800, sv: { dex: -1, con: 4, wis: 0 } },
  // CR 8
  young_red_dragon: { th: "Young Red Dragon", ac: 18, hp: 178, atk: 10, dmg: "2d10+6", init: 2, xp: 3900, breath: { type: "fire", dmg: "10d6", save: "dex", dc: 17 }, sv: { dex: 4, con: 7, wis: 3 } },
};
export const monSave = (e: any, abil: string) => (e.sv && e.sv[abil] !== undefined ? e.sv[abil] : 0);

/* ---------------- SLOT TABLE (Lv.1-9) ---------------- */
export const SLOT_TABLE: Record<number, number[]> = {
  // Full casters: [Lv1, Lv2, Lv3, Lv4, Lv5, Lv6, Lv7, Lv8, Lv9]
  1: [2], 2: [3], 3: [4, 2], 4: [4, 3], 5: [4, 3, 2], 6: [4, 3, 3], 7: [4, 3, 3, 1], 8: [4, 3, 3, 2], 9: [4, 3, 3, 3, 1], 10: [4, 3, 3, 3, 2], 11: [4, 3, 3, 3, 2, 1], 12: [4, 3, 3, 3, 2, 1], 13: [4, 3, 3, 3, 2, 1, 1], 14: [4, 3, 3, 3, 2, 1, 1], 15: [4, 3, 3, 3, 2, 1, 1, 1], 16: [4, 3, 3, 3, 2, 1, 1, 1], 17: [4, 3, 3, 3, 2, 1, 1, 1, 1], 18: [4, 3, 3, 3, 3, 1, 1, 1, 1], 19: [4, 3, 3, 3, 3, 2, 1, 1, 1], 20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};

/* ---------------- HALF-CASTER SLOT TABLE (Paladin/Ranger, Lv.1-20) ----------------
 * D&D 2024 PHB — Paladin/Ranger are half-casters: slots at level L = full-caster at ceil(L/2).
 * Formula: HALF_CASTER_SLOTS[L] = SLOT_TABLE[Math.ceil(L/2)]
 *
 * IMPORTANT (D&D 2024 change from 2014):
 *   - 2014: Paladin/Ranger start casting at Lv2
 *   - 2024: Paladin/Ranger start casting at Lv1 (get 2 × Lv1 slots at Lv1)
 *
 * Table (verified against SLOT_TABLE[ceil(L/2)]):
 *   Lv1: [2]              (ceil(1/2)=1 → SLOT_TABLE[1]=[2])
 *   Lv2: [2]              (ceil(2/2)=1 → SLOT_TABLE[1]=[2])
 *   Lv3: [3]              (ceil(3/2)=2 → SLOT_TABLE[2]=[3])
 *   Lv4: [3]              (ceil(4/2)=2 → SLOT_TABLE[2]=[3])
 *   Lv5: [4,2]            (ceil(5/2)=3 → SLOT_TABLE[3]=[4,2])
 *   Lv6: [4,2]            (ceil(6/2)=3 → SLOT_TABLE[3]=[4,2])
 *   Lv7: [4,3]            (ceil(7/2)=4 → SLOT_TABLE[4]=[4,3])
 *   Lv8: [4,3]            (ceil(8/2)=4 → SLOT_TABLE[4]=[4,3])
 *   Lv9: [4,3,2]          (ceil(9/2)=5 → SLOT_TABLE[5]=[4,3,2])
 *   Lv10: [4,3,2]         (ceil(10/2)=5 → SLOT_TABLE[5]=[4,3,2])
 *   Lv11: [4,3,3]         (ceil(11/2)=6 → SLOT_TABLE[6]=[4,3,3])
 *   Lv12: [4,3,3]         (ceil(12/2)=6 → SLOT_TABLE[6]=[4,3,3])
 *   Lv13: [4,3,3,1]       (ceil(13/2)=7 → SLOT_TABLE[7]=[4,3,3,1])  ← Lv4 spells unlocked
 *   Lv14: [4,3,3,1]       (ceil(14/2)=7 → SLOT_TABLE[7]=[4,3,3,1])
 *   Lv15: [4,3,3,2]       (ceil(15/2)=8 → SLOT_TABLE[8]=[4,3,3,2])
 *   Lv16: [4,3,3,2]       (ceil(16/2)=8 → SLOT_TABLE[8]=[4,3,3,2])
 *   Lv17: [4,3,3,3,1]     (ceil(17/2)=9 → SLOT_TABLE[9]=[4,3,3,3,1]) ← Lv5 spells unlocked
 *   Lv18: [4,3,3,3,1]     (ceil(18/2)=9 → SLOT_TABLE[9]=[4,3,3,3,1])
 *   Lv19: [4,3,3,3,2]     (ceil(19/2)=10 → SLOT_TABLE[10]=[4,3,3,3,2])
 *   Lv20: [4,3,3,3,2]     (ceil(20/2)=10 → SLOT_TABLE[10]=[4,3,3,3,2])
 *
 * Source: D&D 2024 PHB "Spell Slots per Spell Level" Paladin & Ranger table.
 * Bug history: previous table capped at Lv3 spells ([4,3,2] from Lv15-20) — was wrong.
 */
export const HALF_CASTER_SLOTS: Record<number, number[]> = {
  1: [2], 2: [2], 3: [3], 4: [3], 5: [4, 2], 6: [4, 2], 7: [4, 3], 8: [4, 3],
  9: [4, 3, 2], 10: [4, 3, 2], 11: [4, 3, 3], 12: [4, 3, 3],
  13: [4, 3, 3, 1], 14: [4, 3, 3, 1], 15: [4, 3, 3, 2], 16: [4, 3, 3, 2],
  17: [4, 3, 3, 3, 1], 18: [4, 3, 3, 3, 1], 19: [4, 3, 3, 3, 2], 20: [4, 3, 3, 3, 2],
};

/* ---------------- MAP ENGINE ---------------- */
export const DIRV: Record<string, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] };
export const MAP_ICON: Record<string, string> = { town: "🏘️", building: "🏠", room: "▦", dungeon: "🕳️", wilderness: "🌲", place: "📍" };

/* ================ DOMAIN: Damage Types & Resistance ================ */
export const DAMAGE_TYPES = [
  "bludgeoning", "piercing", "slashing",
  "fire", "cold", "lightning", "thunder", "acid", "poison",
  "radiant", "necrotic", "force", "psychic",
] as const;

// Apply resistance/vulnerability/immunity to raw damage
export function applyDamageModifiers(rawDmg: number, dmgType: string, mods: {
  resistances?: string[]; vulnerabilities?: string[]; immunities?: string[];
}): number {
  if (!mods) return rawDmg;
  if (mods.immunities?.includes(dmgType)) return 0;
  if (mods.resistances?.includes(dmgType)) return Math.floor(rawDmg / 2);
  if (mods.vulnerabilities?.includes(dmgType)) return rawDmg * 2;
  return rawDmg;
}

/* ================ DOMAIN: Cover System ================ */
// Cover gives AC bonus against attacks
export const COVER_AC_BONUS: Record<string, number> = {
  none: 0,
  half: 2,          // +2 AC
  "three-quarter": 5, // +5 AC
  total: 100,        // can't be targeted
};

/* ================ DOMAIN: Vision & Lighting ================ */
export type LightLevel = "bright" | "dim" | "darkness";
export type VisionType = "normal" | "darkvision" | "blindsight" | "truesight" | "tremorsense";

// Determine if a creature can see a target given lighting and vision
export function canSeeTarget(viewerVision: VisionType[], targetConcealment: LightLevel, targetInvisible: boolean): boolean {
  if (targetInvisible && !viewerVision.includes("truesight") && !viewerVision.includes("blindsight")) return false;
  if (targetConcealment === "bright") return true;
  if (targetConcealment === "dim") return viewerVision.includes("darkvision") || viewerVision.includes("truesight") || viewerVision.includes("blindsight") || viewerVision.includes("normal");
  if (targetConcealment === "darkness") return viewerVision.includes("darkvision") || viewerVision.includes("truesight") || viewerVision.includes("blindsight") || viewerVision.includes("tremorsense");
  return true;
}

/* ================ DOMAIN: Passive Perception ================ */
export function passivePerception(c: any): number {
  // D&D 5e/2024 Passive Perception: 10 + WIS mod + PB (if proficient) + PB (if Expertise)
  // Source: roll20.net/compendium/dnd5e/Ability%20Scores#content
  //   "Passive Perception = 10 + Wisdom modifier + proficiency bonus (if proficient)."
  // Expertise doubles the proficiency bonus — same applies to passive checks.
  const wisMod = mod(c.abilities?.wis || 10);
  const isProf = (CLASSES[c.cls]?.skills.includes("perception") || c.extraSkills?.includes("perception"));
  const isExpertise = (c.expertise || []).includes("perception");
  const pb = profByLevel(c.level);
  let prof = 0;
  if (isExpertise) prof = pb * 2;
  else if (isProf) prof = pb;
  return 10 + wisMod + prof;
}

/* ================ DOMAIN: Encounter Difficulty (XP Budget — D&D 2024) ================ */
// D&D 2024 encounter difficulty thresholds (per-character XP ceiling).
// Source: Roll20 2024 Compendium — "Combat Encounters" — 3 tiers: Low / Moderate / High.
// (Old 5e tiers: Easy / Medium / Hard / Deadly — REMOVED in 2024.)
// We provide thresholds for levels 1-20 (capped at 5 for the legacy rateEncounterDifficulty).
export const ENCOUNTER_THRESHOLDS: Record<number, number[]> = {
  // [low, moderate, high] per character (2024 official values)
  1:  [50, 75, 100],
  2:  [100, 150, 200],
  3:  [150, 225, 400],
  4:  [250, 375, 500],
  5:  [500, 750, 1100],
  6:  [600, 1000, 1400],
  7:  [750, 1300, 1700],
  8:  [1000, 1700, 2100],
  9:  [1300, 2000, 2600],
  10: [1600, 2300, 3100],
  11: [1900, 2900, 4100],
  12: [2200, 3700, 4700],
  13: [2600, 4200, 5400],
  14: [2900, 4900, 6200],
  15: [3300, 5400, 7800],
  16: [3800, 6100, 9800],
  17: [4500, 7200, 11700],
  18: [5000, 8700, 14200],
  19: [5500, 10700, 17200],
  20: [6400, 13200, 22000],
};

/**
 * Legacy encounter difficulty rater — for display in UI combat feed.
 * Uses D&D 2024 thresholds: Low / Moderate / High (with trivial below and impossible above).
 */
export function rateEncounterDifficulty(totalXP: number, charLevel: number): string {
  const lvl = Math.min(20, Math.max(1, charLevel));
  const thresholds = ENCOUNTER_THRESHOLDS[lvl] || ENCOUNTER_THRESHOLDS[1];
  // [low, moderate, high]
  if (totalXP < thresholds[0] * 0.5) return "เล็กน้อย";
  if (totalXP <= thresholds[0]) return "ต่ำ (Low)";
  if (totalXP <= thresholds[1]) return "ปานกลาง (Moderate)";
  if (totalXP <= thresholds[2]) return "สูง (High)";
  return "รุนแรง (Impossible)";
}

/* ================ DOMAIN: Time & Calendar ================ */
export function gameTimeToString(time: { day: number; hour: number }): string {
  const h = time.hour % 24;
  const period = h < 12 ? "เช้า" : h < 18 ? "บ่าย" : "ค่ำ";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `วันที่ ${time.day}, ชม. ${hour12} ${period}`;
}

export function getLightLevelForHour(hour: number): LightLevel {
  if (hour >= 6 && hour < 18) return "bright";
  if (hour >= 5 && hour < 6) return "dim";
  if (hour >= 18 && hour < 19) return "dim";
  return "darkness";
}

/* ================ DOMAIN: Quest Journal ================ */
export interface Quest {
  id: string;
  title: string;
  description: string;
  status: "active" | "completed" | "failed";
  objectives: { text: string; done: boolean }[];
  reward?: string;
  giver?: string;
}

/* ================ DOMAIN: Grapple/Shove ================ */
// Grapple: Athletics (attacker) vs Athletics/Acrobatics (target)
// Shove: Athletics (attacker) vs Athletics/Acrobatics (target) — push 5ft or knock prone
export function grappleCheck(attackerMod: number, defenderMod: number): { success: boolean; roll: number; dc: number } {
  const r = Math.floor(Math.random() * 20) + 1 + attackerMod;
  const dc = 8 + defenderMod; // simplified: defender's check is 8 + their mod
  return { success: r >= dc, roll: r, dc };
}

/* ================ DOMAIN: Two-Weapon Fighting (Dual Wield) ================ */
// When holding two light weapons, can make a bonus action attack with the off-hand
// Off-hand damage = weapon die only (no ability mod unless Fighting Style: Two-Weapon)
export function canDualWield(c: any): boolean {
  const melee = getMeleeWeapon(c);
  return melee && melee.properties?.includes("light");
}

// Helper that doesn't create circular import
function getMeleeWeapon(c: any): any {
  return WEAPONS[c?.weapon] || null;
}

