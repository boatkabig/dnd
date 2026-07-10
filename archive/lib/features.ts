/**
 * Features System — Data-Driven Feature Engine.
 *
 * Features are abilities from Class, Subclass, Species, Feat, Background.
 * 100% Data Driven — no hardcoded `if class == "rogue"` logic.
 *
 * 15 sub-systems (9.1–9.15)
 *
 * Architecture:
 *   Class/Species/Feat/Item → Feature Definition (data) → Engine processes
 *     ├── Passive: auto-applied modifiers
 *     ├── Active: player activates (costs resource)
 *     ├── Reaction: triggered by events
 *     └── Triggered: auto-fires on game events
 */

/* ======================================================================
 * 9.1 FEATURE SOURCE
 * ====================================================================== */

export type FeatureSource = "species" | "class" | "subclass" | "background" | "feat" | "epic_boon" | "item" | "monster";

/* ======================================================================
 * 9.2 FEATURE TYPE
 * ====================================================================== */

export type FeatureType = "passive" | "active" | "reaction" | "bonus_action" | "triggered" | "choice";

/* ======================================================================
 * 9.6 FEATURE TRIGGER
 * ====================================================================== */

export type FeatureTriggerEvent =
  | "on_attack_roll" | "on_attack_hit" | "on_attack_miss"
  | "on_damage_taken" | "on_damage_dealt"
  | "on_turn_start" | "on_turn_end"
  | "on_round_start" | "on_round_end"
  | "on_movement" | "on_death" | "on_saving_throw"
  | "on_short_rest" | "on_long_rest"
  | "on_kill" | "on_crit" | "on_level_up";

/* ======================================================================
 * 9.7 FEATURE RESOURCE
 * ====================================================================== */

export type RecoveryType = "short_rest" | "long_rest" | "dawn" | "none" | "recharge_5_6" | "recharge_6";

export interface FeatureResource {
  maxUses: number | string;     // number or formula like "proficiency_bonus" or "level"
  currentUses: number;
  recovery: RecoveryType;
  rechargeDice?: string;        // "1d6" for recharge mechanics
}

/* ======================================================================
 * 9.8 FEATURE EFFECT (data-driven)
 * ====================================================================== */

export type FeatureEffectType =
  | "modifier" | "damage" | "healing" | "condition" | "resource"
  | "movement" | "spell" | "summon" | "extra_attack" | "replace_rule" | "choice";

export interface FeatureEffectData {
  type: FeatureEffectType;
  // Modifier
  modifier?: {
    target: "attack_roll" | "damage_roll" | "ac" | "save" | "skill_check" | "speed" | "initiative";
    value: string;              // "1d4", "+2", "proficiency_bonus"
    dice?: boolean;             // true = roll dice, false = flat
  };
  // Damage
  damage?: { formula: string; damageType: string; scaling?: "level" | "proficiency" };
  // Healing
  healing?: { formula: string; };
  // Condition
  condition?: { apply: string; duration?: string; saveDC?: number; saveAbility?: string };
  // Resource change
  resource?: { name: string; delta: number };
  // Movement
  movement?: { type: "teleport" | "push" | "pull" | "speed_bonus"; value: number };
  // Spell
  spell?: { index: string; level: number };
  // Extra attack
  extraAttack?: { count: number };
  // Rule replacement
  replaceRule?: { rule: string; newBehavior: string };
  // Choice
  choice?: { options: string[]; selected?: string };
}

/* ======================================================================
 * 9.9 FEATURE SCALING
 * ====================================================================== */

export interface FeatureScaling {
  type: "level" | "ability" | "proficiency";
  formula: string;              // e.g. "ceil(level/2)d6" for Sneak Attack
  levels?: Record<number, string>; // explicit per-level values
}

/* ======================================================================
 * 9.10 FEATURE REQUIREMENT
 * ====================================================================== */

export interface FeatureRequirement {
  minLevel?: number;
  class?: string;
  subclass?: string;
  weaponType?: string[];        // ["finesse", "ranged"]
  condition?: string;           // must have this condition
  notCondition?: string;        // must NOT have this condition
  hasResource?: string;         // must have this resource available
  hasAdvantage?: boolean;       // must have advantage (Sneak Attack)
  allyAdjacent?: boolean;       // ally within 5ft of target
  description?: string;
  descriptionTh?: string;
}

/* ======================================================================
 * FEATURE DEFINITION (complete)
 * ====================================================================== */

export interface FeatureDef {
  id: string;
  name: string;
  nameTh: string;
  source: FeatureSource;
  sourceName: string;           // "Fighter", "Rogue", "Elf", "War Caster"
  type: FeatureType;
  level?: number;               // level acquired
  description: string;
  descriptionTh: string;
  // Active feature details
  activationType?: "action" | "bonus_action" | "reaction" | "free" | "none";
  // Trigger (for reaction/triggered)
  trigger?: FeatureTriggerEvent;
  triggerCondition?: string;    // additional condition text
  // Resource
  resource?: FeatureResource;
  // Effects
  effects?: FeatureEffectData[];
  // Scaling
  scaling?: FeatureScaling;
  // Requirements
  requirements?: FeatureRequirement;
  // 9.12 Feature Replacement
  replacesRule?: string;
  // 9.13 Feature Choice
  isChoice?: boolean;
  choiceOptions?: string[];
  choiceSelected?: string;
  // 9.14 Feature Upgrade
  upgrades?: string;            // feature ID this upgrades
  // 9.15 Events
  events?: FeatureEvent[];
  // Tags
  tags?: string[];
}

export type FeatureEvent = "on_acquire" | "on_level_up" | "on_activate" | "on_trigger" | "on_expire" | "on_remove";

/* ======================================================================
 * FEATURE LIBRARY — all standard D&D 5e features (data-driven)
 * ====================================================================== */

export const FEATURE_LIBRARY: Record<string, FeatureDef> = {
  // --- Fighter ---
  second_wind: {
    id: "second_wind", name: "Second Wind", nameTh: "Second Wind (ลมหายใจที่สอง)",
    source: "class", sourceName: "Fighter", type: "active", level: 1,
    activationType: "bonus_action",
    description: "Bonus action: heal 1d10 + fighter level.",
    descriptionTh: "Bonus action: ฟื้น 1d10 + level",
    resource: { maxUses: 1, currentUses: 1, recovery: "short_rest" },
    effects: [{ type: "healing", healing: { formula: "1d10+level" } }],
    tags: ["fighter", "healing"],
  },
  action_surge: {
    id: "action_surge", name: "Action Surge", nameTh: "Action Surge (พุ่งแรง)",
    source: "class", sourceName: "Fighter", type: "active", level: 2,
    activationType: "free",
    description: "Gain one additional action on your turn.",
    descriptionTh: "ได้ action เพิ่ม 1 ครั้งในเทิร์นนี้",
    resource: { maxUses: 1, currentUses: 1, recovery: "short_rest" },
    effects: [{ type: "resource", resource: { name: "action", delta: 1 } }],
    tags: ["fighter"],
  },
  extra_attack: {
    id: "extra_attack", name: "Extra Attack", nameTh: "Extra Attack (โจมตีเพิ่ม)",
    source: "class", sourceName: "Fighter/Ranger/Paladin", type: "passive", level: 5,
    description: "Attack twice per Attack action.",
    descriptionTh: "โจมตี 2 ครั้งต่อ 1 Attack action",
    effects: [{ type: "extra_attack", extraAttack: { count: 2 } }],
    tags: ["fighter", "ranger", "paladin", "barbarian", "monk"],
  },
  improved_critical: {
    id: "improved_critical", name: "Improved Critical", nameTh: "Improved Critical (คริติคอลดีขึ้น)",
    source: "class", sourceName: "Fighter (Champion)", type: "passive", level: 3,
    description: "Critical hit on 19-20.",
    descriptionTh: "คริติคอลเมื่อทอยได้ 19-20",
    effects: [{ type: "modifier", modifier: { target: "attack_roll", value: "crit_threshold_19" } }],
    replacesRule: "crit_threshold",
    tags: ["fighter", "champion"],
  },

  // --- Rogue ---
  sneak_attack: {
    id: "sneak_attack", name: "Sneak Attack", nameTh: "Sneak Attack (โจมตีลอบ)",
    source: "class", sourceName: "Rogue", type: "triggered", level: 1,
    trigger: "on_attack_hit",
    description: "Extra damage when you have advantage or an ally is adjacent to target.",
    descriptionTh: "ดาเมจเพิ่มเมื่อโจมตีแบบได้เปรียบหรือมีพันธมิตรอยู่ใกล้เป้า",
    effects: [{
      type: "damage",
      damage: { formula: "ceil(level/2)d6", damageType: "precision", scaling: "level" },
    }],
    requirements: {
      hasAdvantage: true,
      allyAdjacent: true,
      descriptionTh: "ต้องมี advantage หรือพันธมิตรอยู่ใกล้เป้า (อย่างใดอย่างหนึ่ง)",
    },
    scaling: { type: "level", formula: "ceil(level/2)d6", levels: { 1: "1d6", 3: "2d6", 5: "3d6", 7: "4d6", 9: "5d6", 11: "6d6", 13: "7d6", 15: "8d6", 17: "9d6", 19: "10d6" } },
    tags: ["rogue"],
  },
  cunning_action: {
    id: "cunning_action", name: "Cunning Action", nameTh: "Cunning Action (แอคชั่นเจ้าเล่ห์)",
    source: "class", sourceName: "Rogue", type: "bonus_action", level: 2,
    activationType: "bonus_action",
    description: "Dash/Disengage/Hide as bonus action.",
    descriptionTh: "Dash/Disengage/Hide เป็น bonus action",
    effects: [{ type: "choice", choice: { options: ["dash", "disengage", "hide"] } }],
    tags: ["rogue"],
  },
  uncanny_dodge: {
    id: "uncanny_dodge", name: "Uncanny Dodge", nameTh: "Uncanny Dodge (หลบหลีกประหลาด)",
    source: "class", sourceName: "Rogue", type: "reaction", level: 5,
    activationType: "reaction",
    trigger: "on_damage_taken",
    description: "Reaction: halve damage from an attacker you can see.",
    descriptionTh: "Reaction: ลดดาเมจครึ่งหนึ่งจากผู้โจมตีที่มองเห็น",
    effects: [{ type: "modifier", modifier: { target: "damage_roll", value: "half" } }],
    resource: { maxUses: 1, currentUses: 1, recovery: "none" }, // 1/round, not rest
    tags: ["rogue"],
  },
  expertise: {
    id: "expertise", name: "Expertise", nameTh: "Expertise (ความเชี่ยวชาญ)",
    source: "class", sourceName: "Rogue/Bard", type: "passive", level: 1,
    description: "Double proficiency bonus for chosen skills.",
    descriptionTh: "เพิ่ม proficiency x2 ใน 2 สกิลที่เลือก",
    effects: [{ type: "modifier", modifier: { target: "skill_check", value: "double_proficiency" } }],
    isChoice: true, choiceOptions: ["athletics", "acrobatics", "sleight_of_hand", "stealth", "arcana", "history", "investigation", "nature", "religion", "animal_handling", "insight", "medicine", "perception", "survival", "deception", "intimidation", "performance", "persuasion"],
    tags: ["rogue", "bard"],
  },

  // --- Barbarian ---
  rage: {
    id: "rage", name: "Rage", nameTh: "Rage (ความเกรี้ยวกราด)",
    source: "class", sourceName: "Barbarian", type: "active", level: 1,
    activationType: "bonus_action",
    description: "Advantage on STR checks, +2 melee damage, resistance to bludgeoning/piercing/slashing.",
    descriptionTh: "ได้เปรียบ STR check, +2 ดาเมจโจมตี, ต้านทาน bludgeoning/piercing/slashing",
    resource: { maxUses: 2, currentUses: 2, recovery: "long_rest" },
    effects: [
      { type: "modifier", modifier: { target: "damage_roll", value: "+2" } },
      { type: "modifier", modifier: { target: "attack_roll", value: "advantage_str" } },
    ],
    scaling: { type: "level", formula: "level>=9?3:2", levels: { 1: "2", 9: "3", 16: "4" } },
    tags: ["barbarian"],
  },
  unarmored_defense_barbarian: {
    id: "unarmored_defense_barbarian", name: "Unarmored Defense", nameTh: "Unarmored Defense (เกราะธรรมชาติ)",
    source: "class", sourceName: "Barbarian", type: "passive", level: 1,
    description: "AC = 10 + DEX + CON while not wearing armor.",
    descriptionTh: "AC = 10 + DEX + CON ขณะไม่สวมเกราะ",
    effects: [{ type: "replace_rule", replaceRule: { rule: "ac_calc", newBehavior: "10+dex+con" } }],
    tags: ["barbarian"],
  },

  // --- Wizard ---
  arcane_recovery: {
    id: "arcane_recovery", name: "Arcane Recovery", nameTh: "Arcane Recovery (ฟื้นเวท)",
    source: "class", sourceName: "Wizard", type: "active", level: 1,
    activationType: "none",
    description: "Once per long rest, on a short rest recover spell slots totaling ≤ level/2.",
    descriptionTh: "1 ครั้ง/long rest ตอน short rest คืน spell slot รวมระดับไม่เกิน level/2",
    resource: { maxUses: 1, currentUses: 1, recovery: "long_rest" },
    effects: [{ type: "resource", resource: { name: "spell_slots", delta: 1 } }],
    tags: ["wizard"],
  },

  // --- Cleric ---
  channel_divinity: {
    id: "channel_divinity", name: "Channel Divinity", nameTh: "Channel Divinity (พลังพระเจ้า)",
    source: "class", sourceName: "Cleric", type: "active", level: 2,
    activationType: "action",
    description: "Turn Undead or Preserve Life. 1/short rest.",
    descriptionTh: "Turn Undead หรือ Preserve Life. 1 ครั้ง/short rest",
    resource: { maxUses: 1, currentUses: 1, recovery: "short_rest" },
    effects: [{ type: "choice", choice: { options: ["turn_undead", "preserve_life"] } }],
    tags: ["cleric"],
  },
  preserve_life: {
    id: "preserve_life", name: "Preserve Life", nameTh: "Preserve Life (รักษาชีวิต)",
    source: "class", sourceName: "Cleric (Life Domain)", type: "active", level: 2,
    activationType: "action",
    description: "Heal pool = 5 × level, cap half Max HP per target.",
    descriptionTh: "ฟื้น 5×level HP (ไม่เกินครึ่ง Max HP ต่อเป้า)",
    effects: [{ type: "healing", healing: { formula: "5*level" } }],
    requirements: { class: "cleric", minLevel: 2 },
    tags: ["cleric", "healing"],
  },

  // --- Monk ---
  martial_arts: {
    id: "martial_arts", name: "Martial Arts", nameTh: "Martial Arts (ศิลปะการต่อสู้)",
    source: "class", sourceName: "Monk", type: "passive", level: 1,
    description: "Unarmed strike 1d4+DEX. Bonus action unarmed strike after Attack.",
    descriptionTh: "ต่อยมือเปล่า 1d4+DEX, bonus action ต่อยมือเปล่าหลังโจมตี",
    effects: [{ type: "modifier", modifier: { target: "damage_roll", value: "martial_arts_die" } }],
    scaling: { type: "level", formula: "level>=11?1d8:level>=5?1d6:1d4", levels: { 1: "1d4", 5: "1d6", 11: "1d8", 17: "1d10" } },
    tags: ["monk"],
  },
  ki: {
    id: "ki", name: "Ki", nameTh: "Ki (พลังภายใน)",
    source: "class", sourceName: "Monk", type: "active", level: 2,
    description: "Ki points = level. Flurry of Blows, Patient Defense, Step of the Wind.",
    descriptionTh: "Ki = level. Flurry of Blows, Patient Defense, Step of the Wind",
    resource: { maxUses: "level", currentUses: 0, recovery: "short_rest" },
    effects: [{ type: "choice", choice: { options: ["flurry_of_blows", "patient_defense", "step_of_the_wind"] } }],
    tags: ["monk"],
  },
  stunning_strike: {
    id: "stunning_strike", name: "Stunning Strike", nameTh: "Stunning Strike (ต่อยสะกด)",
    source: "class", sourceName: "Monk", type: "active", level: 5,
    activationType: "free",
    trigger: "on_attack_hit",
    description: "Spend 1 Ki: target makes CON save or is stunned.",
    descriptionTh: "ใช้ 1 Ki: เป้าทอย CON save ไม่ผ่านจะมึนงง (Stunned)",
    effects: [{ type: "condition", condition: { apply: "stunned", saveAbility: "con", saveDC: 8 } }],
    resource: { maxUses: "ki", currentUses: 0, recovery: "short_rest" },
    requirements: { class: "monk", minLevel: 5, hasResource: "ki" },
    tags: ["monk"],
  },

  // --- Paladin ---
  divine_smite: {
    id: "divine_smite", name: "Divine Smite", nameTh: "Divine Smite (ฟาดศักดิ์สิทธิ์)",
    source: "class", sourceName: "Paladin", type: "triggered", level: 2,
    trigger: "on_attack_hit",
    description: "When you hit with melee weapon, spend 1 spell slot for extra 2d8 radiant (+1d8 per slot level).",
    descriptionTh: "เมื่อโจมตีโดนด้วยอาวุธระยะประชิด ใช้ 1 spell slot เพิ่ม 2d8 radiant (+1d8 ต่อระดับ slot)",
    effects: [{ type: "damage", damage: { formula: "2d8", damageType: "radiant" } }],
    requirements: { class: "paladin", minLevel: 2, hasResource: "spell_slot" },
    tags: ["paladin"],
  },
  lay_on_hands: {
    id: "lay_on_hands", name: "Lay on Hands", nameTh: "Lay on Hands (วางมือรักษา)",
    source: "class", sourceName: "Paladin", type: "active", level: 1,
    activationType: "action",
    description: "Heal pool = 5 × level HP, or cure 1 disease/poison per 5 HP.",
    descriptionTh: "ฟื้น 5×level HP หรือแก้โรค/พิษ 1 อย่างต่อ 5 HP",
    resource: { maxUses: "5*level", currentUses: 5, recovery: "long_rest" },
    effects: [{ type: "healing", healing: { formula: "pool" } }],
    tags: ["paladin", "healing"],
  },

  // --- Bard ---
  bardic_inspiration: {
    id: "bardic_inspiration", name: "Bardic Inspiration", nameTh: "Bardic Inspiration (แรงบันดาลใจ)",
    source: "class", sourceName: "Bard", type: "active", level: 1,
    activationType: "bonus_action",
    description: "Give ally a bonus die (1d6, scaling) to add to one roll.",
    descriptionTh: "ให้พันธมิตรเต๋าโบนัส (1d6, เพิ่มตามเลเวล) เพิ่มในการทอย 1 ครั้ง",
    resource: { maxUses: "cha_mod", currentUses: 1, recovery: "long_rest" },
    effects: [{ type: "modifier", modifier: { target: "attack_roll", value: "1d6", dice: true } }],
    scaling: { type: "level", formula: "level>=15?1d12:level>=10?1d10:level>=5?1d8:1d6", levels: { 1: "1d6", 5: "1d8", 10: "1d10", 15: "1d12" } },
    tags: ["bard"],
  },
  jack_of_all_trades: {
    id: "jack_of_all_trades", name: "Jack of All Trades", nameTh: "Jack of All Trades (รู้หน่อยไปทั่ว)",
    source: "class", sourceName: "Bard", type: "passive", level: 2,
    description: "Add half proficiency to ability checks you're not proficient in.",
    descriptionTh: "เพิ่มครึ่ง proficiency ใน ability check ที่ไม่ proficient",
    effects: [{ type: "modifier", modifier: { target: "skill_check", value: "half_proficiency" } }],
    tags: ["bard"],
  },

  // --- Sorcerer ---
  font_of_magic: {
    id: "font_of_magic", name: "Font of Magic", nameTh: "Font of Magic (ต้นกำเนิดเวทมนตร์)",
    source: "class", sourceName: "Sorcerer", type: "active", level: 2,
    description: "Sorcery Points = level. Create spell slot or convert slot to SP.",
    descriptionTh: "Sorcery Points = level. สร้าง spell slot หรือแปลง slot เป็น SP",
    resource: { maxUses: "level", currentUses: 0, recovery: "long_rest" },
    effects: [{ type: "resource", resource: { name: "sorcery_points", delta: 0 } }],
    tags: ["sorcerer"],
  },

  // --- Warlock ---
  eldritch_invocations: {
    id: "eldritch_invocations", name: "Eldritch Invocations", nameTh: "Eldritch Invocations (เวทมนตร์เรียก)",
    source: "class", sourceName: "Warlock", type: "choice", level: 2,
    description: "Choose 2 invocations (more at higher levels).",
    descriptionTh: "เลือก 2 invocations (เพิ่มตามเลเวล)",
    isChoice: true,
    choiceOptions: ["agonizing_blast", "devils_sight", "mask_of_many_faces", "repelling_blast", "thirsting_blade"],
    tags: ["warlock"],
  },

  // --- Species Features ---
  darkvision: {
    id: "darkvision", name: "Darkvision", nameTh: "Darkvision (มองเห็นในที่มืด)",
    source: "species", sourceName: "Elf/Dwarf/etc", type: "passive", level: 1,
    description: "See in dim light as bright, darkness as dim, up to 60 ft.",
    descriptionTh: "มองเห็นในแสงสลัวเหมือนแสงสว่าง และในความมืดเหมือนแสงสลัว ระยะ 60 ฟุต",
    effects: [{ type: "modifier", modifier: { target: "skill_check", value: "darkvision_60" } }],
    tags: ["species", "vision"],
  },
  fey_ancestry: {
    id: "fey_ancestry", name: "Fey Ancestry", nameTh: "Fey Ancestry (เชื้อสายนางฟ้า)",
    source: "species", sourceName: "Elf", type: "passive", level: 1,
    description: "Advantage on saves against being charmed. Immune to sleep.",
    descriptionTh: "ได้เปรียบ save ต้านเสน่ห์, ภูมิคุ้มกันการหลับ",
    effects: [{ type: "modifier", modifier: { target: "save", value: "advantage_charmed" } }],
    tags: ["species", "elf"],
  },
  breath_weapon: {
    id: "breath_weapon", name: "Breath Weapon", nameTh: "Breath Weapon (ลมหายใจธาตุ)",
    source: "species", sourceName: "Dragonborn", type: "active", level: 1,
    activationType: "action",
    description: "Exhale elemental energy in a cone/line. Damage scales with level.",
    descriptionTh: "พ่นลมหายใจธาตุในรูปทรงกรวย/เส้น ดาเมจเพิ่มตามเลเวล",
    resource: { maxUses: 1, currentUses: 1, recovery: "short_rest" },
    effects: [{ type: "damage", damage: { formula: "2d6", damageType: "elemental", scaling: "level" } }],
    scaling: { type: "level", formula: "level>=16?5d6:level>=11?4d6:level>=6?3d6:2d6", levels: { 1: "2d6", 6: "3d6", 11: "4d6", 16: "5d6" } },
    tags: ["species", "dragonborn"],
  },

  // --- Feats ---
  lucky: {
    id: "lucky", name: "Lucky", nameTh: "Lucky (โชคดี)",
    source: "feat", sourceName: "Lucky", type: "reaction", level: 1,
    description: "Reroll an attack, ability check, or save. 3/long rest.",
    descriptionTh: "ทอยใหม่ attack, ability check หรือ save. 3 ครั้ง/long rest",
    resource: { maxUses: 3, currentUses: 3, recovery: "long_rest" },
    effects: [{ type: "replace_rule", replaceRule: { rule: "reroll", newBehavior: "reroll_once_keep_better" } }],
    tags: ["feat"],
  },
  war_caster: {
    id: "war_caster", name: "War Caster", nameTh: "War Caster (นักร่ายเวท)",
    source: "feat", sourceName: "War Caster", type: "passive", level: 1,
    description: "Advantage on concentration saves. Cast S spells with hands full. Cast as opportunity attack.",
    descriptionTh: "ได้เปรียบ save สมาธิ, ร่ายเวท S มือไม่ว่างได้, ร่ายเวทเป็น opportunity attack",
    effects: [
      { type: "modifier", modifier: { target: "save", value: "advantage_concentration" } },
      { type: "replace_rule", replaceRule: { rule: "somatic_hands", newBehavior: "can_cast_with_hands_full" } },
    ],
    tags: ["feat"],
  },
  great_weapon_master: {
    id: "great_weapon_master", name: "Great Weapon Master", nameTh: "Great Weapon Master (นักอาวุธหนัก)",
    source: "feat", sourceName: "Great Weapon Master", type: "active", level: 1,
    description: "-5 to hit, +10 damage with heavy weapons. Bonus action attack on crit/kill.",
    descriptionTh: "-5 โจมตี, +10 ดาเมจกับอาวุธ heavy, bonus action โจมตีเมื่อคริต/ฆ่า",
    effects: [
      { type: "modifier", modifier: { target: "attack_roll", value: "-5" } },
      { type: "modifier", modifier: { target: "damage_roll", value: "+10" } },
    ],
    requirements: { weaponType: ["heavy"] },
    tags: ["feat"],
  },
};

/* ======================================================================
 * FEATURE ENGINE — Query & Process
 * ====================================================================== */

/**
 * Get all features for a character given their class, level, species, feats.
 */
export function getCharacterFeatures(
  cls: string,
  level: number,
  species: string,
  feats: string[] = [],
  subclass?: string,
): FeatureDef[] {
  const result: FeatureDef[] = [];

  // Class features
  for (const [id, f] of Object.entries(FEATURE_LIBRARY)) {
    if (f.source === "class" && f.sourceName.toLowerCase().includes(cls.toLowerCase())) {
      if (!f.level || f.level <= level) {
        result.push(f);
      }
    }
  }

  // Species features
  for (const [id, f] of Object.entries(FEATURE_LIBRARY)) {
    if (f.source === "species" && f.sourceName.toLowerCase().includes(species.toLowerCase())) {
      result.push(f);
    }
  }

  // Feats
  for (const featId of feats) {
    const f = FEATURE_LIBRARY[featId];
    if (f && f.source === "feat") result.push(f);
  }

  return result;
}

/**
 * Check if a feature can be activated (requirements + resource).
 */
export function canActivateFeature(feature: FeatureDef, context: {
  level: number;
  hasAdvantage?: boolean;
  allyAdjacent?: boolean;
  weaponProperties?: string[];
  resources?: Record<string, number>;
}): { canActivate: boolean; reasonTh: string } {
  // Check requirements
  if (feature.requirements) {
    const req = feature.requirements;
    if (req.minLevel && context.level < req.minLevel) {
      return { canActivate: false, reasonTh: `ต้องการเลเวล ${req.minLevel}` };
    }
    if (req.hasAdvantage && !context.hasAdvantage && !context.allyAdjacent) {
      return { canActivate: false, reasonTh: "ต้องมี advantage หรือพันธมิตรอยู่ใกล้" };
    }
    if (req.weaponType && context.weaponProperties) {
      const hasWeapon = req.weaponType.some((w) => context.weaponProperties!.includes(w));
      if (!hasWeapon) {
        return { canActivate: false, reasonTh: `ต้องถืออาวุธ ${req.weaponType.join(" หรือ ")}` };
      }
    }
    if (req.hasResource) {
      const available = context.resources?.[req.hasResource] || 0;
      if (available <= 0) {
        return { canActivate: false, reasonTh: `ต้องมี ${req.hasResource}` };
      }
    }
  }

  // Check resource
  if (feature.resource && feature.resource.currentUses <= 0) {
    return { canActivate: false, reasonTh: "ใช้ครบแล้ว (ต้องพัก)" };
  }

  return { canActivate: true, reasonTh: "ใช้ได้" };
}

/**
 * Consume a feature's resource.
 */
export function consumeFeatureResource(feature: FeatureDef): boolean {
  if (!feature.resource) return true;
  if (feature.resource.currentUses <= 0) return false;
  feature.resource.currentUses -= 1;
  return true;
}

/**
 * Restore feature resources on rest.
 */
export function restoreFeatureResources(features: FeatureDef[], restType: "short_rest" | "long_rest" | "dawn"): void {
  for (const f of features) {
    if (!f.resource) continue;
    if (f.resource.recovery === restType || (restType === "long_rest" && f.resource.recovery === "short_rest")) {
      // Resolve maxUses formula
      const max = typeof f.resource.maxUses === "number" ? f.resource.maxUses : 1;
      f.resource.currentUses = max;
    }
  }
}

/**
 * Get features that trigger on a specific event.
 */
export function getTriggeredFeatures(features: FeatureDef[], event: FeatureTriggerEvent): FeatureDef[] {
  return features.filter((f) => f.trigger === event && f.type === "triggered");
}

/**
 * Get passive features (always active).
 */
export function getPassiveFeatures(features: FeatureDef[]): FeatureDef[] {
  return features.filter((f) => f.type === "passive");
}

/**
 * Get reaction features.
 */
export function getReactionFeatures(features: FeatureDef[]): FeatureDef[] {
  return features.filter((f) => f.type === "reaction");
}

/**
 * Get scaling value for a feature at a given level.
 */
export function getScalingValue(feature: FeatureDef, level: number): string | undefined {
  if (!feature.scaling) return undefined;
  if (feature.scaling.levels) {
    // Find the highest level entry ≤ current level
    const keys = Object.keys(feature.scaling.levels).map(Number).sort((a, b) => b - a);
    for (const k of keys) {
      if (level >= k) return feature.scaling.levels[k];
    }
  }
  return feature.scaling.formula;
}

/**
 * Resolve a feature's effects and return what should happen.
 * This is the "data-driven" processor — no hardcoded class logic.
 */
export function processFeatureEffects(feature: FeatureDef, context: {
  level: number;
  charLevel: number;
  targetAC?: number;
}): FeatureEffectData[] {
  const effects = [...(feature.effects ?? [])];

  // Apply scaling to damage/healing formulas
  const scalingValue = getScalingValue(feature, context.level);
  if (scalingValue) {
    for (const e of effects) {
      if (e.damage && e.damage.scaling === "level") {
        e.damage.formula = scalingValue;
      }
      if (e.healing && e.healing.formula === "pool") {
        e.healing.formula = scalingValue;
      }
    }
  }

  return effects;
}
