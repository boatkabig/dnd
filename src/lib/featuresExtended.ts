/**
 * Phase 2: Class Features Lv.6-20 (D&D 2024 PHB)
 *
 * Extends FEATURES table in gameData.ts which only goes to Lv.5.
 * Adds ASI at Lv.8/12/16/19, subclass features, and class-specific progression.
 *
 * D&D 2024 ASI schedule: Lv4, 8, 12, 16, 19 (5 total) — or take a feat instead.
 */

import { FEATURES } from "./gameData";

/* ======================================================================
 * ASI levels (same for all classes)
 * ====================================================================== */

const ASI_LEVELS = [4, 8, 12, 16, 19];

function asiFeature(level: number) {
  return { k: "asi", th: "Ability Score Improvement", desc: `+2 ค่า ability หนึ่งค่า หรือ +1 สองค่า หรือเลือก Feat (D&D 2024 Lv.${level})` };
}

/* ======================================================================
 * Lv.6-20 features per class (D&D 2024 PHB)
 * ====================================================================== */

const FEATURES_LV6_20: Record<string, Record<number, any[]>> = {
  barbarian: {
    6: [{ k: "primal_path_feature", th: "Primal Path Feature", desc: "Subclass feature (e.g. Totem Bear: resistance to all damage while raging)" }],
    7: [{ k: "feral_instinct", th: "Feral Instinct", desc: "Advantage on Initiative rolls" }],
    8: [asiFeature(8), { k: "primal_path_feature_2", th: "Primal Path Feature", desc: "Subclass feature" }],
    9: [{ k: "brutal_critical", th: "Brutal Critical", desc: "Roll 1 extra damage die on critical hit (melee)" }],
    10: [{ k: "primal_path_feature_3", th: "Primal Path Feature", desc: "Subclass feature" }],
    11: [{ k: "relentless_rage", th: "Relentless Rage", desc: "If reduced to 0 HP while raging, DC 10 CON save to drop to 1 HP instead" }],
    12: [asiFeature(12)],
    13: [{ k: "brutal_critical_2", th: "Brutal Critical +1", desc: "Roll 2 extra damage dice on critical hit" }],
    14: [{ k: "primal_path_feature_4", th: "Primal Path Feature", desc: "Subclass feature" }],
    15: [{ k: "persistent_rage", th: "Persistent Rage", desc: "Rage doesn't end early from lack of attacks" }],
    16: [asiFeature(16)],
    17: [{ k: "brutal_critical_3", th: "Brutal Critical +2", desc: "Roll 3 extra damage dice on critical hit" }],
    18: [{ k: "indomitable_might", th: "Indomitable Might", desc: "If STR check total < STR score, use STR score instead" }],
    19: [asiFeature(19)],
    20: [{ k: "primal_champion", th: "Primal Champion", desc: "STR and CON +4 (max 24). Rage unlimited (no count limit)" }],
  },
  bard: {
    6: [{ k: "countercharm", th: "Countercharm", desc: "Action: allies within 30ft have advantage vs charm/frighten" }, { k: "bard_college_feature", th: "Bard College Feature", desc: "Subclass feature" }],
    7: [{ k: "expertise", th: "Expertise (additional)", desc: "Choose 2 more skills for Expertise (PB ×2)" }],
    8: [asiFeature(8)],
    9: [{ k: "bard_college_feature_2", th: "Bard College Feature", desc: "Subclass feature" }],
    10: [{ k: "magical_secrets", th: "Magical Secrets", desc: "Learn 2 spells from any class · Bardic Inspiration = 1d10" }],
    11: [{ k: "superior_inspiration", th: "Superior Inspiration", desc: "Regain 1 Bardic Inspiration on Initiative roll" }],
    12: [asiFeature(12)],
    13: [{ k: "magical_secrets_2", th: "Magical Secrets +2", desc: "Learn 2 more spells from any class" }],
    14: [{ k: "bard_college_feature_3", th: "Bard College Feature", desc: "Subclass feature · Bardic Inspiration = 1d12" }],
    15: [{ k: "superior_inspiration_2", th: "Superior Inspiration", desc: "Bardic Inspiration die = 1d12" }],
    16: [asiFeature(16)],
    17: [{ k: "magical_secrets_3", th: "Magical Secrets +2", desc: "Learn 2 more spells from any class" }],
    18: [{ k: "bard_college_feature_4", th: "Bard College Feature", desc: "Subclass feature" }],
    19: [asiFeature(19)],
    20: [{ k: "superior_inspiration_3", th: "Words of Creation", desc: "Bardic Inspiration die = 1d12 + empower effects" }],
  },
  cleric: {
    6: [{ k: "divine_domain_feature", th: "Divine Domain Feature", desc: "Subclass feature (e.g. Knowledge: Channel Divinity: Read Thoughts)" }],
    7: [{ k: "divine_domain_feature_2", th: "Divine Domain Feature", desc: "Subclass feature" }],
    8: [asiFeature(8), { k: "divine_strike", th: "Divine Strike / Blessed Strikes", desc: "+1d8 damage to weapon attacks (or +1d8 cantrip damage)" }],
    9: [{ k: "lv5_spells", th: "เวทระดับ 5", desc: "ปลด Flame Strike, Greater Restoration, Mass Cure Wounds" }],
    10: [{ k: "divine_intervention", th: "Divine Intervention", desc: "10% chance to call deity for aid (action). Increases with level" }],
    11: [{ k: "lv6_spells", th: "เวทระดับ 6", desc: "ปลด Heal, Heroes' Feast, Word of Recall" }],
    12: [asiFeature(12)],
    13: [{ k: "lv7_spells", th: "เวทระดับ 7", desc: "ปลด Fire Storm, Resurrection, Regenerate" }],
    14: [{ k: "divine_domain_feature_3", th: "Divine Domain Feature", desc: "Subclass feature" }],
    15: [{ k: "lv8_spells", th: "เวทระดับ 8", desc: "ปลด Earthquake, Holy Aura" }],
    16: [asiFeature(16)],
    17: [{ k: "lv9_spells", th: "เวทระดับ 9", desc: "ปลด Mass Heal, Gate, True Resurrection" }],
    18: [{ k: "channel_divinity_2", th: "Channel Divinity (3/rest)", desc: "Channel Divinity 3/short rest" }],
    19: [asiFeature(19)],
    20: [{ k: "divine_intervention_100", th: "Divine Intervention (automatic)", desc: "Divine Intervention always succeeds" }],
  },
  druid: {
    6: [{ k: "druid_circle_feature", th: "Druid Circle Feature", desc: "Subclass feature (e.g. Land: Land's Stride)" }],
    7: [{ k: "wild_shape_cr1", th: "Wild Shape (CR 1)", desc: "Can transform into CR 1 beasts" }],
    8: [asiFeature(8), { k: "wild_shape_fly", th: "Wild Shape (flying)", desc: "Can transform into flying beasts" }],
    9: [{ k: "lv5_spells", th: "เวทระดับ 5", desc: "ปลด Wall of Stone, Reincarnate, Insect Plague" }],
    10: [{ k: "druid_circle_feature_2", th: "Druid Circle Feature", desc: "Subclass feature" }],
    11: [{ k: "lv6_spells", th: "เวทระดับ 6", desc: "ปลด Heal, Sunburst, Transport via Plants" }],
    12: [asiFeature(12)],
    13: [{ k: "lv7_spells", th: "เวทระดับ 7", desc: "ปลด Plane Shift, Reverse Gravity, Regenerate" }],
    14: [{ k: "druid_circle_feature_3", th: "Druid Circle Feature", desc: "Subclass feature" }],
    15: [{ k: "lv8_spells", th: "เวทระดับ 8", desc: "ปลด Earthquake, Tsunami, Animal Shapes" }],
    16: [asiFeature(16)],
    17: [{ k: "lv9_spells", th: "เวทระดับ 9", desc: "ปลด Shapechange, Foresight, Storm of Vengeance" }],
    18: [{ k: "timeless_body", th: "Timeless Body + Wild Shape (CR 2)", desc: "Age slower · Wild Shape CR 2 + beasts with swim" }],
    19: [asiFeature(19)],
    20: [{ k: "archdruid", th: "Archdruid", desc: "Unlimited Wild Shape · ignore verbal/somatic components" }],
  },
  fighter: {
    6: [asiFeature(6)],
    7: [{ k: "martial_archetype_feature", th: "Martial Archetype Feature", desc: "Subclass feature (e.g. Champion: Remarkable Athlete)" }],
    8: [asiFeature(8)],
    9: [{ k: "indomitable", th: "Indomitable", desc: "Reroll a failed save. 1/long rest" }],
    10: [{ k: "martial_archetype_feature_2", th: "Martial Archetype Feature", desc: "Subclass feature" }],
    11: [{ k: "extra_attack_3", th: "Extra Attack (3)", desc: "Attack 3 times per Attack action" }],
    12: [asiFeature(12)],
    13: [{ k: "indomitable_2", th: "Indomitable (2/rest)", desc: "Indomitable 2/long rest" }],
    14: [{ k: "martial_archetype_feature_3", th: "Martial Archetype Feature", desc: "Subclass feature" }],
    15: [{ k: "indomitable_3", th: "Indomitable (3/rest)", desc: "Indomitable 3/long rest" }],
    16: [asiFeature(16)],
    17: [{ k: "action_surge_2", th: "Action Surge (2/turn)", desc: "Action Surge 2/short rest · Martial Archetype feature" }],
    18: [{ k: "martial_archetype_feature_4", th: "Martial Archetype Feature", desc: "Subclass feature" }],
    19: [asiFeature(19)],
    20: [{ k: "extra_attack_4", th: "Extra Attack (4)", desc: "Attack 4 times per Attack action" }],
  },
  monk: {
    6: [{ k: "ki_empowered_strikes", th: "Ki-Empowered Strikes", desc: "Unarmed strikes count as magical · Monastic Tradition feature" }],
    7: [{ k: "evasion", th: "Evasion", desc: "DEX save vs area effect: half damage on fail, no damage on success" }, { k: "stillness_of_mind", th: "Stillness of Mind", desc: "Action: end charm/frighten on self" }],
    8: [asiFeature(8), { k: "monastic_tradition_feature_2", th: "Monastic Tradition Feature", desc: "Subclass feature" }],
    9: [{ k: "unarmored_movement_wall", th: "Unarmored Movement (wall)", desc: "Move up vertical surfaces + across water" }],
    10: [{ k: "purity_of_body", th: "Purity of Body", desc: "Immune to disease and poison" }],
    11: [{ k: "monastic_tradition_feature_3", th: "Monastic Tradition Feature", desc: "Subclass feature" }],
    12: [asiFeature(12)],
    13: [{ k: "tongue_of_sun_and_moon", th: "Tongue of the Sun and Moon", desc: "Understand all languages" }],
    14: [{ k: "diamond_soul", th: "Diamond Soul", desc: "Proficiency in all saves · spend 1 ki to reroll a save" }],
    15: [{ k: "timeless_body", th: "Timeless Body", desc: "Age slower · no need for food/water" }],
    16: [asiFeature(16), { k: "monastic_tradition_feature_4", th: "Monastic Tradition Feature", desc: "Subclass feature" }],
    17: [{ k: "empty_body", th: "Empty Body", desc: "Action: become Invisible for 1 min · spend 1 ki to cast Astral Projection" }],
    18: [{ k: "monastic_tradition_feature_5", th: "Monastic Tradition Feature", desc: "Subclass feature" }],
    19: [asiFeature(19)],
    20: [{ k: "perfect_self", th: "Perfect Self", desc: "Regain 4 ki on Initiative roll if at 0" }],
  },
  paladin: {
    6: [{ k: "aura_of_protection", th: "Aura of Protection", desc: "Allies within 10ft add CHA mod to saves" }],
    7: [{ k: "sacred_oath_feature", th: "Sacred Oath Feature", desc: "Subclass feature (e.g. Devotion: Aura of Devotion)" }],
    8: [asiFeature(8), { k: "aura_of_courage", th: "Aura of Courage", desc: "Allies within 10ft immune to frighten" }],
    9: [{ k: "lv3_spells_paladin", th: "เวทระดับ 3", desc: "ปลด Aura of Vitality, Blinding Smite, Crusader's Mantle" }],
    10: [{ k: "aura_of_protection_30", th: "Aura of Protection (30ft)", desc: "Aura range increases to 30ft" }],
    11: [{ k: "improved_divine_smite", th: "Improved Divine Smite", desc: "+1d8 radiant on every melee hit (no slot needed)" }],
    12: [asiFeature(12)],
    13: [{ k: "lv4_spells_paladin", th: "เวทระดับ 4", desc: "ปลด Aura of Life, Aura of Purity, Banishing Smite" }],
    14: [{ k: "sacred_oath_feature_2", th: "Sacred Oath Feature", desc: "Subclass feature · Aura range 30ft" }],
    15: [{ k: "lv5_spells_paladin", th: "เวทระดับ 5", desc: "ปลด Banishing Smite, Destructive Smite" }],
    16: [asiFeature(16)],
    17: [{ k: "sacred_oath_feature_3", th: "Sacred Oath Feature", desc: "Subclass feature" }],
    18: [{ k: "aura_improvements", th: "Aura Improvements", desc: "All auras 30ft" }],
    19: [asiFeature(19)],
    20: [{ k: "holy_nimbus", th: "Holy Nimbus", desc: "Action: shed dim light 30ft, enemies take radiant, advantage vs fiend/undead spells" }],
  },
  ranger: {
    6: [{ k: "favored_enemy_2", th: "Favored Enemy +1", desc: "Choose 1 more favored enemy type · Ranger Conclave feature" }],
    7: [{ k: "ranger_conclave_feature", th: "Ranger Conclave Feature", desc: "Subclass feature" }],
    8: [asiFeature(8), { k: "favored_enemy_3", th: "Favored Enemy +1", desc: "Choose 1 more · Fleet of Foot (+5 speed)" }],
    9: [{ k: "lv3_spells_ranger", th: "เวทระดับ 3", desc: "ปลด Conjure Barrage, Lightning Arrow, Plant Growth" }],
    10: [{ k: "natural_explorer_improved", th: "Natural Explorer (improved)", desc: "No slow from difficult terrain · advantage on Initiative in favored terrain" }],
    11: [{ k: "ranger_conclave_feature_2", th: "Ranger Conclave Feature", desc: "Subclass feature" }],
    12: [asiFeature(12)],
    13: [{ k: "lv4_spells_ranger", th: "เวทระดับ 4", desc: "ปลด Conjure Woodland Beings, Freedom of Movement, Stoneskin" }],
    14: [{ k: "ranger_conclave_feature_3", th: "Ranger Conclave Feature", desc: "Subclass feature · Vanish (Hide as bonus action + can't be tracked)" }],
    15: [{ k: "lv5_spells_ranger", th: "เวทระดับ 5", desc: "ปลด Conjure Volley, Swift Quiver, Tree Stride" }],
    16: [asiFeature(16)],
    17: [{ k: "ranger_conclave_feature_4", th: "Ranger Conclave Feature", desc: "Subclass feature" }],
    18: [{ k: "feral_senses", th: "Feral Senses", desc: "Aware of invisible creatures within 30ft" }],
    19: [asiFeature(19)],
    20: [{ k: "foe_slayer", th: "Foe Slayer", desc: "Once per turn, add WIS mod to attack or damage vs favored enemy" }],
  },
  rogue: {
    6: [asiFeature(6), { k: "roguish_archetype_feature", th: "Roguish Archetype Feature", desc: "Subclass feature" }],
    7: [{ k: "evasion", th: "Evasion", desc: "DEX save vs area: half on fail, none on success" }],
    8: [asiFeature(8)],
    9: [{ k: "roguish_archetype_feature_2", th: "Roguish Archetype Feature", desc: "Subclass feature · Panache (subtle influence)" }],
    10: [{ k: "asi", th: "Ability Score Improvement", desc: "+2 หรือ +1/+1 (D&D 2024)" }],
    11: [{ k: "reliable_talent", th: "Reliable Talent", desc: "Min 10 on proficiency skill checks" }],
    12: [asiFeature(12)],
    13: [{ k: "roguish_archetype_feature_3", th: "Roguish Archetype Feature", desc: "Subclass feature" }],
    14: [{ k: "blindsense", th: "Blindsense", desc: "Aware of hidden creatures within 10ft" }],
    15: [{ k: "slippery_mind", th: "Slippery Mind", desc: "Proficiency in WIS saves" }],
    16: [asiFeature(16)],
    17: [{ k: "roguish_archetype_feature_4", th: "Roguish Archetype Feature", desc: "Subclass feature" }],
    18: [{ k: "elusive", th: "Elusive", desc: "No attack has advantage against you" }],
    19: [asiFeature(19)],
    20: [{ k: "stroke_of_luck", th: "Stroke of Luck", desc: "Once per short rest: turn a miss into hit OR a failed ability check into 20" }],
  },
  sorcerer: {
    6: [{ k: "sorcerous_origin_feature", th: "Sorcerous Origin Feature", desc: "Subclass feature" }],
    7: [{ k: "metamagic_3", th: "Additional Metamagic", desc: "Learn 1 more Metamagic option" }],
    8: [asiFeature(8)],
    9: [{ k: "metamagic_4", th: "Additional Metamagic", desc: "Learn 1 more Metamagic option" }],
    10: [{ k: "metamagic_5", th: "Additional Metamagic", desc: "Learn 1 more Metamagic option" }],
    11: [{ k: "sorcerous_restoration", th: "Sorcerous Restoration", desc: "Regain 4 sorcery points on short rest (1/long rest)" }],
    12: [asiFeature(12)],
    13: [{ k: "metamagic_6", th: "Additional Metamagic", desc: "Learn 1 more Metamagic option" }],
    14: [{ k: "sorcerous_origin_feature_2", th: "Sorcerous Origin Feature", desc: "Subclass feature" }],
    15: [{ k: "metamagic_7", th: "Additional Metamagic", desc: "Learn 1 more Metamagic option" }],
    16: [asiFeature(16)],
    17: [{ k: "metamagic_8", th: "Additional Metamagic", desc: "Learn 1 more Metamagic option" }],
    18: [{ k: "sorcerous_origin_feature_3", th: "Sorcerous Origin Feature", desc: "Subclass feature" }],
    19: [asiFeature(19)],
    20: [{ k: "sorcerous_supremacy", th: "Sorcerous Supremacy", desc: "Regain 4 sorcery points on Initiative roll" }],
  },
  warlock: {
    6: [{ k: "otherworldly_patron_feature", th: "Otherworldly Patron Feature", desc: "Subclass feature" }, { k: "eldritch_invocations_3", th: "Additional Invocation", desc: "Learn 1 more Eldritch Invocation" }],
    7: [{ k: "eldritch_invocations_4", th: "Additional Invocation", desc: "Learn 1 more Eldritch Invocation" }],
    8: [asiFeature(8), { k: "otherworldly_patron_feature_2", th: "Otherworldly Patron Feature", desc: "Subclass feature" }],
    9: [{ k: "mystic_arcanum_6", th: "Mystic Arcanum (Lv6)", desc: "Cast 1 Lv6 spell/long rest without slot" }],
    10: [{ k: "otherworldly_patron_feature_3", th: "Otherworldly Patron Feature", desc: "Subclass feature" }],
    11: [{ k: "mystic_arcanum_7", th: "Mystic Arcanum (Lv7)", desc: "Cast 1 Lv7 spell/long rest · Pact Magic slot Lv5" }],
    12: [asiFeature(12), { k: "eldritch_invocations_5", th: "Additional Invocation", desc: "Learn 1 more Eldritch Invocation" }],
    13: [{ k: "mystic_arcanum_8", th: "Mystic Arcanum (Lv8)", desc: "Cast 1 Lv8 spell/long rest" }],
    14: [{ k: "otherworldly_patron_feature_4", th: "Otherworldly Patron Feature", desc: "Subclass feature" }],
    15: [{ k: "mystic_arcanum_9", th: "Mystic Arcanum (Lv9)", desc: "Cast 1 Lv9 spell/long rest" }],
    16: [asiFeature(16)],
    17: [{ k: "mystic_arcanum_9_2", th: "Mystic Arcanum (additional)", desc: "Choose 1 more Lv9 mystic arcanum" }],
    18: [{ k: "otherworldly_patron_feature_5", th: "Otherworldly Patron Feature", desc: "Subclass feature" }],
    19: [asiFeature(19)],
    20: [{ k: "eldritch_master", th: "Eldritch Master", desc: "1/long rest: regain all spell slots" }],
  },
  wizard: {
    6: [{ k: "arcane_tradition_feature", th: "Arcane Tradition Feature", desc: "Subclass feature (e.g. Evocation: Potent Cantrip)" }],
    7: [{ k: "lv4_spells", th: "เวทระดับ 4", desc: "ปลด Polymorph, Dimension Door, Wall of Fire, Ice Storm" }],
    8: [asiFeature(8), { k: "arcane_tradition_feature_2", th: "Arcane Tradition Feature", desc: "Subclass feature" }],
    9: [{ k: "lv5_spells", th: "เวทระดับ 5", desc: "ปลด Cone of Cold, Hold Monster, Teleport, Wall of Stone" }],
    10: [{ k: "arcane_tradition_feature_3", th: "Arcane Tradition Feature", desc: "Subclass feature" }],
    11: [{ k: "lv6_spells", th: "เวทระดับ 6", desc: "ปลด Disintegrate, Globe of Invulnerability, Sunburst" }],
    12: [asiFeature(12)],
    13: [{ k: "lv7_spells", th: "เวทระดับ 7", desc: "ปลด Forcecage, Plane Shift, Prismatic Spray, Teleport" }],
    14: [{ k: "arcane_tradition_feature_4", th: "Arcane Tradition Feature", desc: "Subclass feature" }],
    15: [{ k: "lv8_spells", th: "เวทระดับ 8", desc: "ปลด Dominate Monster, Earthquake, Maze, Sunburst" }],
    16: [asiFeature(16)],
    17: [{ k: "lv9_spells", th: "เวทระดับ 9", desc: "ปลด Meteor Swarm, Power Word Kill, Time Stop, Wish" }],
    18: [{ k: "spell_mastery", th: "Spell Mastery", desc: "Choose 1 Lv1 + 1 Lv2 spell — cast at will without slot" }],
    19: [asiFeature(19)],
    20: [{ k: "signature_spell", th: "Signature Spell", desc: "Choose 2 Lv3 spells — cast 1/short rest without slot" }],
  },
};

/* ======================================================================
 * Merge: extend FEATURES with Lv.6-20
 * ====================================================================== */

export function getExtendedFeatures(): Record<string, Record<number, any[]>> {
  const merged: Record<string, Record<number, any[]>> = {};
  for (const cls of Object.keys(FEATURES)) {
    merged[cls] = { ...FEATURES[cls] };
    const ext = FEATURES_LV6_20[cls];
    if (ext) {
      for (const lv of Object.keys(ext)) {
        const level = parseInt(lv, 10);
        merged[cls][level] = ext[level];
      }
    }
  }
  return merged;
}

/** Get features for a class at all levels up to `level` (cumulative) */
export function getFeaturesUpToLevel(cls: string, level: number): Array<{ level: number; features: any[] }> {
  const allFeatures = getExtendedFeatures()[cls] || {};
  const result: Array<{ level: number; features: any[] }> = [];
  for (let lv = 1; lv <= level; lv++) {
    if (allFeatures[lv]) {
      result.push({ level: lv, features: allFeatures[lv] });
    }
  }
  return result;
}

/** Check if a class gets ASI at a given level (D&D 2024 schedule) */
export function hasASIAtLevel(cls: string, level: number): boolean {
  return ASI_LEVELS.includes(level);
}

export { ASI_LEVELS, FEATURES_LV6_20 };
