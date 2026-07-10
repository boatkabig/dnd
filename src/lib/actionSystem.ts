/**
 * Action System — D&D 5e Action Economy.
 *
 * Defines what a character can do in one turn:
 *   1 Movement + 1 Action + 1 Bonus Action (if available) + 1 Free Interaction + Reactions
 *
 * Action Metadata lets the AI DM answer "ฉันทำอะไรได้บ้าง?" by filtering
 * available actions based on the character's current state.
 */

/* ================ Types ================ */

export type ActionType = "action" | "bonus_action" | "reaction" | "movement" | "free_interaction" | "special";
export type ActionCategory = "attack" | "magic" | "social" | "exploration" | "utility" | "defense" | "movement" | "stealth";
export type ActionResolution = "attack_roll" | "saving_throw" | "ability_check" | "skill_check" | "contest" | "automatic" | "healing" | "varies";
export type TargetType = "self" | "creature" | "object" | "area" | "point" | "none" | "varies";

export interface ActionMetadata {
  id: string;
  name: string;
  nameTh: string;
  description: string;
  descriptionTh: string;
  type: ActionType;
  category: ActionCategory;
  cost: string;              // "1 Action", "1 Bonus Action", "1 Reaction", "Movement", "Free"
  resourceCost?: string;     // "Spell Slot Lv3", "1 Rage", "1 Ki", "1 Sorcery Point"
  targetType: TargetType;
  range?: string;            // "Melee", "Ranged 30ft", "Self", "Touch"
  requirements?: string[];   // ["ว่างมือ", "มีอาวุธ", "ไม่ใช่ Incapacitated", "มี Spell Slot"]
  resolution: ActionResolution;
  icon?: string;             // emoji
}

/* ================ All D&D 5e Actions ================ */

export const ALL_ACTIONS: ActionMetadata[] = [
  // --- Standard Actions ---
  {
    id: "attack", name: "Attack", nameTh: "โจมตี", description: "Make a melee or ranged weapon attack.",
    descriptionTh: "โจมตีด้วยอาวุธระยะประชิดหรือระยะไกล",
    type: "action", category: "attack", cost: "1 Action", targetType: "creature", range: "Melee/Ranged",
    requirements: ["มีอาวุธ", "เป้าหมายอยู่ในระยะ"], resolution: "attack_roll", icon: "⚔️",
  },
  {
    id: "cast_spell", name: "Cast Spell", nameTh: "ร่ายเวทมนตร์", description: "Cast a spell using a spell slot or cantrip.",
    descriptionTh: "ร่ายเวทมนตร์โดยใช้ spell slot หรือ cantrip",
    type: "action", category: "magic", cost: "1 Action", resourceCost: "Spell Slot (หรือ Cantrip ฟรี)",
    targetType: "varies", range: "varies",
    requirements: ["สายเวท", "มี Spell Slot หรือ Cantrip"], resolution: "varies", icon: "✨",
  },
  {
    id: "dash", name: "Dash", nameTh: "วิ่งเร็ว", description: "Gain extra movement equal to your speed.",
    descriptionTh: "เพิ่ม movement เท่ากับความเร็วของคุณ",
    type: "action", category: "movement", cost: "1 Action", targetType: "self", resolution: "automatic", icon: "🏃",
  },
  {
    id: "dodge", name: "Dodge", nameTh: "หลบหลีก", description: "Attacks against you have disadvantage, DEX saves have advantage.",
    descriptionTh: "การโจมตีใส่คุณเสียเปรียบ, DEX save ได้เปรียบ จนถึงเทิร์นหน้า",
    type: "action", category: "defense", cost: "1 Action", targetType: "self", resolution: "automatic", icon: "🌀",
  },
  {
    id: "disengage", name: "Disengage", nameTh: "ถอยออก", description: "Move without provoking opportunity attacks.",
    descriptionTh: "เคลื่อนที่โดยไม่โดน Opportunity Attack",
    type: "action", category: "movement", cost: "1 Action", targetType: "self", resolution: "automatic", icon: "🚶",
  },
  {
    id: "help", name: "Help", nameTh: "ช่วยเหลือ", description: "Give an ally advantage on their next attack or ability check.",
    descriptionTh: "ให้พันธมิตรได้เปรียบในการโจมตีหรือ ability check ครั้งถัดไป",
    type: "action", category: "utility", cost: "1 Action", targetType: "creature", range: "5ft",
    requirements: ["มีพันธมิตรในระยะ"], resolution: "automatic", icon: "🤝",
  },
  {
    id: "hide", name: "Hide", nameTh: "ซ่อน", description: "Make a Stealth check to become hidden.",
    descriptionTh: "ทอย Stealth check เพื่อซ่อนตัว",
    type: "action", category: "stealth", cost: "1 Action", targetType: "self",
    requirements: ["ไม่ได้ถูกเห็น", "มีที่ซ่อน"], resolution: "skill_check", icon: "🌫️",
  },
  {
    id: "ready", name: "Ready", nameTh: "เตรียมพร้อม", description: "Prepare an action with a trigger. Uses Reaction when triggered.",
    descriptionTh: "เตรียม action พร้อมเงื่อนไข trigger — ใช้ Reaction เมื่อตรงเงื่อนไข",
    type: "action", category: "utility", cost: "1 Action + Reaction", targetType: "varies",
    resolution: "varies", icon: "⏳",
  },
  {
    id: "search", name: "Search", nameTh: "ค้นหา", description: "Use Perception or Investigation to find something.",
    descriptionTh: "ใช้ Perception หรือ Investigation เพื่อค้นหา",
    type: "action", category: "exploration", cost: "1 Action", targetType: "area",
    resolution: "skill_check", icon: "🔍",
  },
  {
    id: "study", name: "Study", nameTh: "ศึกษา", description: "Use Arcana, History, Nature, or Religion to analyze.",
    descriptionTh: "ใช้ Arcana, History, Nature หรือ Religion เพื่อวิเคราะห์",
    type: "action", category: "exploration", cost: "1 Action", targetType: "object",
    resolution: "skill_check", icon: "📖",
  },
  {
    id: "influence", name: "Influence", nameTh: "โน้มน้าว", description: "Use Persuasion, Deception, or Intimidation.",
    descriptionTh: "ใช้ Persuasion, Deception หรือ Intimidation",
    type: "action", category: "social", cost: "1 Action", targetType: "creature", range: "30ft",
    resolution: "skill_check", icon: "💬",
  },
  {
    id: "grapple", name: "Grapple", nameTh: "จับตรึง", description: "Athletics vs target's Athletics/Acrobatics. Target becomes Restrained.",
    descriptionTh: "Athletics vs Athletics/Acrobatics ของศัตรู → ศัตรูถูกตรึง (Restrained)",
    type: "action", category: "attack", cost: "1 Action", targetType: "creature", range: "Melee",
    requirements: ["มีมือว่าง", "เป้าหมายในระยะประชิด"], resolution: "contest", icon: "🤼",
  },
  {
    id: "shove", name: "Shove", nameTh: "ผลัก/ล้ม", description: "Athletics vs target's Athletics/Acrobatics. Push 5ft or knock Prone.",
    descriptionTh: "Athletics vs Athletics/Acrobatics → ผลัก 5 ฟุต หรือ ล้ม (Prone)",
    type: "action", category: "attack", cost: "1 Action", targetType: "creature", range: "Melee",
    requirements: ["เป้าหมายในระยะประชิด"], resolution: "contest", icon: "💪",
  },
  {
    id: "use_object", name: "Use an Object", nameTh: "ใช้สิ่งของ", description: "Interact with an object (drink potion, light torch, etc.).",
    descriptionTh: "ใช้สิ่งของ (ดื่มยา, จุดคบเพลิง, ฯลฯ)",
    type: "action", category: "utility", cost: "1 Action", targetType: "object",
    resolution: "automatic", icon: "🧪",
  },

  // --- Bonus Actions (only available with specific features) ---
  {
    id: "off_hand_attack", name: "Off-Hand Attack", nameTh: "โจมตีมือนอก", description: "Two-Weapon Fighting: bonus action attack with light weapon.",
    descriptionTh: "Two-Weapon Fighting: bonus action โจมตีด้วยอาวุธ light มือนอก",
    type: "bonus_action", category: "attack", cost: "1 Bonus Action", targetType: "creature", range: "Melee",
    requirements: ["ถืออาวุธ light", "ยังไม่ได้ใช้ Bonus Action"], resolution: "attack_roll", icon: "⚔️⚔️",
  },
  {
    id: "cunning_action", name: "Cunning Action", nameTh: "Cunning Action", description: "Rogue: Dash/Disengage/Hide as bonus action.",
    descriptionTh: "Rogue: Dash/Disengage/Hide เป็น bonus action",
    type: "bonus_action", category: "utility", cost: "1 Bonus Action", targetType: "self",
    requirements: ["Rogue Lv.2+", "ยังไม่ได้ใช้ Bonus Action"], resolution: "automatic", icon: "💨",
  },
  {
    id: "rage", name: "Rage", nameTh: "Rage", description: "Barbarian: enter rage as bonus action.",
    descriptionTh: "Barbarian: เข้าสู่ Rage เป็น bonus action",
    type: "bonus_action", category: "attack", cost: "1 Bonus Action", resourceCost: "1 Rage Charge",
    targetType: "self", requirements: ["Barbarian", "ยังไม่ได้ใช้ Bonus Action", "ยังไม่ได้ Rage"], resolution: "automatic", icon: "🔥",
  },
  {
    id: "bardic_inspiration", name: "Bardic Inspiration", nameTh: "Bardic Inspiration", description: "Bard: give ally a bonus die.",
    descriptionTh: "Bard: ให้พันธมิตรเต๋าโบนัส",
    type: "bonus_action", category: "utility", cost: "1 Bonus Action", resourceCost: "1 Inspiration Die",
    targetType: "creature", range: "60ft", requirements: ["Bard", "ยังไม่ได้ใช้ Bonus Action"], resolution: "automatic", icon: "🎵",
  },
  {
    id: "healing_word", name: "Healing Word", nameTh: "Healing Word", description: "Cleric: bonus action heal spell.",
    descriptionTh: "Cleric: เวทรักษาเป็น bonus action",
    type: "bonus_action", category: "magic", cost: "1 Bonus Action", resourceCost: "Spell Slot Lv1+",
    targetType: "creature", range: "60ft", requirements: ["Cleric", "มี Spell Slot"], resolution: "healing", icon: "💚",
  },
  {
    id: "misty_step", name: "Misty Step", nameTh: "Misty Step", description: "Teleport 30ft as bonus action.",
    descriptionTh: "เทเลพอร์ต 30 ฟุต เป็น bonus action",
    type: "bonus_action", category: "magic", cost: "1 Bonus Action", resourceCost: "Spell Slot Lv2+",
    targetType: "self", requirements: ["มี Spell Slot Lv2+"], resolution: "automatic", icon: "🌀",
  },
  {
    id: "second_wind", name: "Second Wind", nameTh: "Second Wind", description: "Fighter: heal 1d10+level as bonus action.",
    descriptionTh: "Fighter: ฟื้น 1d10+level เป็น bonus action",
    type: "bonus_action", category: "defense", cost: "1 Bonus Action", resourceCost: "1/Short Rest",
    targetType: "self", requirements: ["Fighter", "ยังไม่ได้ใช้"], resolution: "healing", icon: "🛡️",
  },
  {
    id: "action_surge", name: "Action Surge", nameTh: "Action Surge", description: "Fighter: gain one additional action.",
    descriptionTh: "Fighter: ได้ action เพิ่ม 1 ครั้ง",
    type: "bonus_action", category: "attack", cost: "1 Bonus Action (no action in 2024)", resourceCost: "1/Short Rest",
    targetType: "self", requirements: ["Fighter Lv.2+", "ยังไม่ได้ใช้"], resolution: "automatic", icon: "⚡",
  },
  {
    id: "flurry_of_blows", name: "Flurry of Blows", nameTh: "Flurry of Blows", description: "Monk: 2 unarmed strikes as bonus action.",
    descriptionTh: "Monk: ต่อยมือเปล่า 2 ครั้ง เป็น bonus action",
    type: "bonus_action", category: "attack", cost: "1 Bonus Action", resourceCost: "1 Ki Point",
    targetType: "creature", range: "Melee", requirements: ["Monk Lv.2+", "มี Ki"], resolution: "attack_roll", icon: "🥋",
  },

  // --- Reactions ---
  {
    id: "opportunity_attack", name: "Opportunity Attack", nameTh: "Opportunity Attack", description: "Attack when enemy leaves your reach.",
    descriptionTh: "โจมตีเมื่อศัตรูออกจากระยะประชิด",
    type: "reaction", category: "attack", cost: "1 Reaction", targetType: "creature", range: "Melee",
    requirements: ["ศัตรูออกจากระยะ", "มี Reaction"], resolution: "attack_roll", icon: "⚔️",
  },
  {
    id: "shield_spell", name: "Shield", nameTh: "Shield", description: "Wizard: +5 AC as reaction when hit.",
    descriptionTh: "Wizard: +5 AC เป็น reaction เมื่อโดนโจมตี",
    type: "reaction", category: "defense", cost: "1 Reaction", resourceCost: "Spell Slot Lv1+",
    targetType: "self", requirements: ["รู้เวท Shield", "มี Spell Slot", "กำลังถูกโจมตี"], resolution: "automatic", icon: "🛡️",
  },
  {
    id: "counterspell", name: "Counterspell", nameTh: "Counterspell",
    description: "D&D 2024: Target makes a Constitution saving throw vs your spell save DC. On failure, spell dissipates and slot is NOT expended. No auto-fail on lower-level spells. No upcast benefit.",
    descriptionTh: "D&D 2024: เป้าทอย CON save เทียบ spell save DC ของคุณ — ไม่ผ่าน = เวทสลาย + slot ไม่หาย, ไม่มี auto-fail, ไม่มี upcast",
    type: "reaction", category: "magic", cost: "1 Reaction", resourceCost: "Spell Slot Lv3",
    targetType: "creature", requirements: ["รู้เวท Counterspell", "ศัตรูกำลังร่ายเวท"], resolution: "saving_throw", icon: "🚫",
  },
  {
    id: "hellish_rebuke", name: "Hellish Rebuke", nameTh: "Hellish Rebuke", description: "Warlock: deal fire damage when hit.",
    descriptionTh: "Warlock: สะท้อนดาเมจไฟเมื่อโดนโจมตี",
    type: "reaction", category: "magic", cost: "1 Reaction", resourceCost: "Spell Slot",
    targetType: "creature", requirements: ["Warlock", "กำลังถูกโจมตี"], resolution: "saving_throw", icon: "🔥",
  },

  // --- Movement ---
  {
    id: "move", name: "Move", nameTh: "เคลื่อนที่", description: "Move up to your speed on the grid.",
    descriptionTh: "เคลื่อนที่บนกริดได้ตามความเร็ว (ไม่ใช้ Action)",
    type: "movement", category: "movement", cost: "Movement", targetType: "self",
    resolution: "automatic", icon: "👣",
  },

  // --- Free Interaction ---
  {
    id: "free_interaction", name: "Free Interaction", nameTh: "การกระทำฟรี", description: "Draw weapon, open door, pick up item, etc.",
    descriptionTh: "ชักดาบ, เปิดประตู, หยิบของ ฯลฯ (1 ครั้ง/เทิร์น)",
    type: "free_interaction", category: "utility", cost: "Free", targetType: "object",
    resolution: "automatic", icon: "✋",
  },
];

/* ================ Action Availability ================ */

export interface CharacterState {
  class: string;
  level: number;
  caster: boolean;
  hasAction: boolean;
  hasBonusAction: boolean;
  hasReaction: boolean;
  movementLeft: number;
  incapacitated: boolean;
  raging: boolean;
  secondWindUsed: boolean;
  actionSurgeUsed: boolean;
  rageUsed: number;
  maxRages: number;
  kiUsed: number;
  maxKi: number;
  bardicInspirationUsed: number;
  maxBardicInspiration: number;
  spellSlots: number[];
  knownSpells: string[];
  hasLightWeapon: boolean;
  conditions: string[];
}

/**
 * Get all actions available to a character given their current state.
 * Filters by: action economy (action/bonus/reaction left?), class requirements,
 * resource availability, conditions, and equipment.
 */
export function getAvailableActions(state: CharacterState): ActionMetadata[] {
  return ALL_ACTIONS.filter((action) => {
    // Incapacitated characters can't take actions
    if (state.incapacitated && action.type !== "reaction") return false;

    // Check action type availability
    if (action.type === "action" && !state.hasAction) return false;
    if (action.type === "bonus_action" && !state.hasBonusAction) return false;
    if (action.type === "reaction" && !state.hasReaction) return false;
    if (action.type === "movement" && state.movementLeft <= 0) return false;

    // Check class-specific requirements
    switch (action.id) {
      case "off_hand_attack":
        return state.hasLightWeapon;
      case "cunning_action":
        return state.class === "rogue" && state.level >= 2;
      case "rage":
        return state.class === "barbarian" && !state.raging && state.rageUsed < state.maxRages;
      case "bardic_inspiration":
        return state.class === "bard" && state.bardicInspirationUsed < state.maxBardicInspiration;
      case "healing_word":
        return state.class === "cleric" && state.caster && state.spellSlots.some((s) => s > 0);
      case "second_wind":
        return state.class === "fighter" && !state.secondWindUsed;
      case "action_surge":
        return state.class === "fighter" && state.level >= 2 && !state.actionSurgeUsed;
      case "flurry_of_blows":
        return state.class === "monk" && state.level >= 2 && state.kiUsed < state.maxKi;
      case "cast_spell":
        return state.caster && (state.knownSpells.length > 0 || state.spellSlots.some((s) => s > 0));
      case "misty_step":
        return state.caster && state.spellSlots.length >= 2 && state.spellSlots[1] > 0;
      case "shield_spell":
        return state.class === "wizard" && state.spellSlots[0] > 0;
      case "counterspell":
        return state.class === "wizard" && state.spellSlots.length >= 3 && state.spellSlots[2] > 0;
      case "hellish_rebuke":
        return state.class === "warlock" && state.spellSlots.some((s) => s > 0);
      default:
        return true;
    }
  });
}

/**
 * Get a human-readable summary of available actions for the AI DM.
 */
export function getAvailableActionsSummary(state: CharacterState): string {
  const available = getAvailableActions(state);
  const actions = available.filter((a) => a.type === "action").map((a) => a.nameTh);
  const bonusActions = available.filter((a) => a.type === "bonus_action").map((a) => a.nameTh);
  const reactions = available.filter((a) => a.type === "reaction").map((a) => a.nameTh);
  const movement = state.movementLeft > 0 ? `เคลื่อนที่ (${state.movementLeft} ช่อง)` : null;

  const parts: string[] = [];
  if (state.hasAction && actions.length > 0) parts.push(`Action: ${actions.join(", ")}`);
  if (state.hasBonusAction && bonusActions.length > 0) parts.push(`Bonus Action: ${bonusActions.join(", ")}`);
  if (state.hasReaction && reactions.length > 0) parts.push(`Reaction: ${reactions.join(", ")}`);
  if (movement) parts.push(movement);

  return parts.length > 0 ? parts.join(" | ") : "ไม่มี action ให้ทำ";
}
