/**
 * C2: General Feats catalog — D&D 2024 PHB
 * These are available at ASI levels (4/8/12/16/19) as an alternative to +2/+1.
 */

export interface FeatDef {
  id: string;
  th: string;
  category: "general" | "fighting_style" | "epic_boon";
  description: string;
  descriptionTh: string;
  /** Mechanical effect key (for engine to apply) */
  effectKey?: string;
}

export const GENERAL_FEATS: Record<string, FeatDef> = {
  ability_improvement: {
    id: "ability_improvement", th: "Ability Score Improvement", category: "general",
    description: "Increase one ability score by 2, or two ability scores by 1 each (max 20).",
    descriptionTh: "+2 ค่า ability หนึ่งค่า หรือ +1 สองค่า (สูงสุด 20)",
  },
  grappler: {
    id: "grappler", th: "Grappler", category: "general",
    description: "Gain advantage on attack rolls against a creature you are Grappling. You can try to restrain a creature you're grappling.",
    descriptionTh: "ได้เปรียบโจมตี creature ที่กำลัง Grapple อยู่, พยายาม restrain ได้",
    effectKey: "grappler",
  },
  great_weapon_master: {
    id: "great_weapon_master", th: "Great Weapon Master", category: "general",
    description: "When you score a critical hit or reduce a creature to 0 HP with a Heavy weapon, you can make one attack as a bonus action. You can also choose to take -5 to attack roll for +10 damage.",
    descriptionTh: "Crit/ฆ่าด้วย Heavy weapon → bonus action โจมตี; -5 to-hit → +10 damage",
    effectKey: "great_weapon_master",
  },
  keen_mind: {
    id: "keen_mind", th: "Keen Mind", category: "general",
    description: "Increase INT by 1 (max 20). You always know which way is north, and you have a perfect memory of anything you've seen or heard in the past month.",
    descriptionTh: "+1 INT (max 20), รู้ทิศเหนือเสมอ, จำทุกอย่างที่เห็น/ได้ยินใน 1 เดือน",
  },
  mobile: {
    id: "mobile", th: "Mobile", category: "general",
    description: "Your speed increases by 10 feet. You don't provoke opportunity attacks from creatures you've attacked this turn. You can move through hostile creatures' spaces.",
    descriptionTh: "+10ft speed, ไม่โดน OA จากที่โจมตีเทิร์นนี้, เดินผ่านศัตรูได้",
    effectKey: "mobile",
  },
  sentinel: {
    id: "sentinel", th: "Sentinel", category: "general",
    description: "You can make an opportunity attack when a creature exits your reach even if they take the Disengage action. When you hit with an opportunity attack, the creature's speed becomes 0 for the rest of the turn.",
    descriptionTh: "OA ได้แม้ศัตรู Disengage; OA โดน → speed 0 จนจบเทิร์น",
    effectKey: "sentinel",
  },
  sharpshooter: {
    id: "sharpshooter", th: "Sharpshooter", category: "general",
    description: "Ranged attacks don't have disadvantage at long range. You can ignore half and three-quarters cover. You can choose -5 to attack for +10 damage.",
    descriptionTh: "ยิงระยะไกลไม่เสียเปรียบ, ไม่สนใจ cover, -5 to-hit → +10 damage",
    effectKey: "sharpshooter",
  },
  war_caster: {
    id: "war_caster", th: "War Caster", category: "general",
    description: "You have advantage on CON saves to maintain concentration. You can cast spells with S components while holding weapons/shields. You can cast a spell as an opportunity attack.",
    descriptionTh: "Adv CON save concentration, ร่ายเวทมี S ได้ขณะถืออาวุธ/โล่, OA เป็น spell ได้",
    effectKey: "war_caster",
  },
  crossbow_expert: {
    id: "crossbow_expert", th: "Crossbow Expert", category: "general",
    description: "You ignore the loading property of crossbows. Being within 5ft of an enemy doesn't impose disadvantage on ranged attacks. You can attack with a hand crossbow as a bonus action after attacking.",
    descriptionTh: "ไม่สน loading, ยิงระยะประชิดไม่เสียเปรียบ, bonus action ยิง hand crossbow",
    effectKey: "crossbow_expert",
  },
  polearm_master: {
    id: "polearm_master", th: "Polearm Master", category: "general",
    description: "You can make a bonus action attack with the butt of a glaive/halberd/quarterstaff/pike (1d4+STR). When a creature enters your reach, you can make an opportunity attack.",
    descriptionTh: "Bonus action โจมตีด้ามอาวุธ (1d4+STR), OA เมื่อศัตรูเข้าระยะ",
    effectKey: "polearm_master",
  },
  resilient: {
    id: "resilient", th: "Resilient", category: "general",
    description: "Increase one ability score by 1 (max 20). Gain proficiency in saving throws using that ability.",
    descriptionTh: "+1 ability (max 20) + proficiency ใน saving throw ของ ability นั้น",
  },
  actor: {
    id: "actor", th: "Actor", category: "general",
    description: "Increase CHA by 1 (max 20). You have advantage on Deception and Performance checks when trying to pass yourself off as a different person.",
    descriptionTh: "+1 CHA (max 20), adv Deception/Performance เวลาสวมรอย",
  },
  dungeon_delver: {
    id: "dungeon_delver", th: "Dungeon Delver", category: "general",
    description: "You have advantage on saves against traps and resistance to trap damage. You can search for traps while moving at a normal pace.",
    descriptionTh: "Adv save vs trap, ทน trap damage, ค้น trap ได้ขณะเดินปกติ",
  },
};

export const FIGHTING_STYLE_FEATS: Record<string, FeatDef> = {
  archery: { id: "archery", th: "Archery (Fighting Style)", category: "fighting_style",
    description: "+2 bonus to ranged weapon attack rolls.", descriptionTh: "+2 โจมตีระยะไกล", effectKey: "fs_archery" },
  defense: { id: "defense", th: "Defense (Fighting Style)", category: "fighting_style",
    description: "+1 bonus to AC while wearing armor.", descriptionTh: "+1 AC ขณะสวมเกราะ", effectKey: "fs_defense" },
  dueling: { id: "dueling", th: "Dueling (Fighting Style)", category: "fighting_style",
    description: "+2 bonus to damage rolls with one-handed weapons while not using a shield.", descriptionTh: "+2 damage อาวุธมือเดียว (ไม่ถือโล่)", effectKey: "fs_dueling" },
  great_weapon: { id: "great_weapon", th: "Great Weapon Fighting (Fighting Style)", category: "fighting_style",
    description: "Reroll 1s and 2s on damage dice with two-handed weapons.", descriptionTh: "Reroll 1-2 บน damage dice อาวุธสองมือ", effectKey: "fs_great_weapon" },
  two_weapon: { id: "two_weapon", th: "Two-Weapon (Fighting Style)", category: "fighting_style",
    description: "+2 bonus to damage with off-hand weapon when dual wielding.", descriptionTh: "+2 damage มือนอก ขณะ dual wield", effectKey: "fs_two_weapon" },
};

export const EPIC_BOON_FEATS: Record<string, FeatDef> = {
  boon_of_blade_mastery: { id: "boon_of_blade_mastery", th: "Boon of Blade Mastery", category: "epic_boon",
    description: "+1 STR or DEX. You gain a +1 bonus to attack and damage rolls with weapons. When you hit with a weapon, you can push the target 5 feet.",
    descriptionTh: "+1 STR/DEX, +1 atk/dmg อาวุธ, ผลักเป้า 5ft เมื่อโจมตีโดน" },
  boon_of_spell_recall: { id: "boon_of_spell_recall", th: "Boon of Spell Recall", category: "epic_boon",
    description: "+1 INT/WIS/CHA. Once per turn, you can cast a spell of level 1-5 without expending a slot.",
    descriptionTh: "+1 INT/WIS/CHA, ร่ายเวท Lv1-5 ฟรี 1 ครั้ง/เทิร์น" },
  boon_of_recovery: { id: "boon_of_recovery", th: "Boon of Recovery", category: "epic_boon",
    description: "+1 CON. You can use a Bonus Action to heal yourself for a number of HP equal to your level. Once used, can't use again until a Short or Long Rest.",
    descriptionTh: "+1 CON, bonus action: ฟื้น HP = level (1/short rest)" },
  boon_of_speed: { id: "boon_of_speed", th: "Boon of Speed", category: "epic_boon",
    description: "+1 DEX. Your speed increases by 10 feet. You can Dash as a Bonus Action.",
    descriptionTh: "+1 DEX, +10ft speed, Dash เป็น bonus action" },
};

/** Get all available feats for ASI selection (General + Fighting Style) */
export function getFeatsForASI(): FeatDef[] {
  return [...Object.values(GENERAL_FEATS), ...Object.values(FIGHTING_STYLE_FEATS)];
}

/** Get epic boon feats (available at Lv19+) */
export function getEpicBoonFeats(): FeatDef[] {
  return Object.values(EPIC_BOON_FEATS);
}
