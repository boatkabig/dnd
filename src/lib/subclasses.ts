/**
 * C1: Subclass data — D&D 2024 PHB
 * Each class gets subclass at a specific level (usually 3).
 * Features are applied via the existing feature system.
 */

export interface SubclassDef {
  id: string;
  classKey: string;
  th: string;
  desc: string;
  /** Level when subclass is chosen */
  unlockLevel: number;
  /** Features granted by this subclass (keyed by level) */
  features: Record<number, Array<{ k: string; th: string; desc: string }>>;
}

export const SUBCLASSES: Record<string, SubclassDef[]> = {
  barbarian: [
    { id: "berserker", classKey: "barbarian", th: "Berserker (เบอร์เซอร์เกอร์)", desc: "Frenzy: rage ให้ bonus action โจมตีมือเปล่า 1 ครั้ง", unlockLevel: 3,
      features: { 3: [{ k: "frenzy", th: "Frenzy", desc: "ระหว่าง Rage: bonus action โจมตีมือเปล่า 1 ครั้ง (ทำ Exhaustion 1 เมื่อ Rage หมด)" }],
                  6: [{ k: "mindless_rage", th: "Mindless Rage", desc: "Immune to charm + frightened ระหว่าง Rage" }],
                  10: [{ k: "intimidating_presence", th: "Intimidating Presence", desc: "Action: ทำให้ศัตรู frightened (CHA save)" }],
                  14: [{ k: "retaliation", th: "Retaliation", desc: "Reaction: โจมตีกลับเมื่อถูกโจมตีในระยะประชิดระหว่าง Rage" }] } },
    { id: "totem_warrior", classKey: "barbarian", th: "Totem Warrior (นักรบโทเทม)", desc: "เลือก spirit animal: Bear (ทนทุก damage type), Eagle (ทัศนวิสัยไกล), Wolf (ally advantage)", unlockLevel: 3,
      features: { 3: [{ k: "spirit_seeker", th: "Spirit Seeker", desc: "Beast Sense + Speak with Animals (ritual)" }],
                  6: [{ k: "totem_spirit", th: "Totem Spirit (Bear)", desc: "ระหว่าง Rage: ทนทาน damage ทุก type ยกเว้น psychic" }],
                  10: [{ k: "spirit_walker", th: "Spirit Walker", desc: "Commune with nature spirits" }],
                  14: [{ k: "totemic_attunement", th: "Totemic Attunement", desc: "Bear: ผลักศัตรูที่โจมตีคุณ" }] } },
  ],
  bard: [
    { id: "lore", classKey: "bard", th: "College of Lore (วิทยาลัยปราชญ์)", desc: "Cutting Words + 3 skills + Magical Secrets ก่อน", unlockLevel: 3,
      features: { 3: [{ k: "cutting_words", th: "Cutting Words", desc: "Reaction: ลด attack/save/check ของศัตรู ด้วย Bardic Inspiration die" },
                     { k: "bonus_proficiencies", th: "Bonus Proficiencies", desc: "เลือก 3 skills เพิ่ม" }],
                  6: [{ k: "magical_secrets_lore", th: "Magical Secrets (early)", desc: "เรียน 2 เวทจาก class ใดก็ได้" }],
                  14: [{ k: "peerless_skill", th: "Peerless Skill", desc: "Bardic Inspiration ใช้กับ ability check ได้" }] } },
    { id: "valor", classKey: "bard", th: "College of Valor (วิทยาลัยผู้กล้า)", desc: "Medium armor + shields + Extra Attack + combat inspiration", unlockLevel: 3,
      features: { 3: [{ k: "combat_inspiration", th: "Combat Inspiration", desc: "Bardic Inspiration ใช้เพิ่ม damage หรือ AC ได้" },
                      { k: "bonus_proficiencies_valor", th: "Bonus Proficiencies", desc: "Medium armor + shields + martial weapons" }],
                  6: [{ k: "extra_attack_valor", th: "Extra Attack", desc: "โจมตี 2 ครั้งต่อ Attack action" }] } },
  ],
  fighter: [
    { id: "champion", classKey: "fighter", th: "Champion (แชมป์เปี้ยน)", desc: "Improved Critical 19-20 + remarkable athlete + superior critical", unlockLevel: 3,
      features: { 3: [{ k: "improved_critical", th: "Improved Critical", desc: "Critical hit on 19-20" }],
                  7: [{ k: "remarkable_athlete", th: "Remarkable Athlete", desc: "+ half proficiency ใน STR/DEX/CON checks ที่ไม่ proficient" }],
                  15: [{ k: "superior_critical", th: "Superior Critical", desc: "Critical hit on 18-20" }],
                  18: [{ k: "survivor", th: "Survivor", desc: "Regen 5 + CON mod HP ต่อรอบถ้า HP < half" }] } },
    { id: "battle_master", classKey: "fighter", th: "Battle Master (แบทเทิลมาสเตอร์)", desc: "Maneuvers + Superiority Dice + Student of War", unlockLevel: 3,
      features: { 3: [{ k: "maneuvers", th: "Maneuvers", desc: "เลือก 3 maneuvers + 4 Superiority Dice (d8)" }],
                  7: [{ k: "maneuvers_2", th: "Additional Maneuvers", desc: "+2 maneuvers + 5 dice" }],
                  10: [{ k: "maneuvers_3", th: "Additional Maneuvers", desc: "+2 maneuvers + 5 dice (d10)" }],
                  15: [{ k: "maneuvers_4", th: "Additional Maneuvers", desc: "+2 maneuvers + 6 dice (d12)" }] } },
  ],
  rogue: [
    { id: "thief", classKey: "rogue", th: "Thief (โจร)", desc: "Fast Hands + Second-Story Work + Supreme Sneak", unlockLevel: 3,
      features: { 3: [{ k: "fast_hands", th: "Fast Hands", desc: "ใช้ไอเทมเป็น bonus action + Sleight of Hand เป็น bonus action" },
                     { k: "second_story_work", th: "Second-Story Work", desc: "ปีนเร็วขึ้น + jump ไกลขึ้น" }],
                  9: [{ k: "supreme_sneak", th: "Supreme Sneak", desc: "Advantage on Stealth ถ้าเคลื่อนที่ไม่เกิน half speed" }],
                  13: [{ k: "use_magic_device", th: "Use Magic Device", desc: "ใช้ magic item ทุกชนิดไม่ต้องอาศัย class/race" }],
                  17: [{ k: "thief_reflexes", th: "Thief's Reflexes", desc: "2 turns ใน round แรกของ combat" }] } },
    { id: "assassin", classKey: "rogue", th: "Assassin (มือสังหาร)", desc: "Assassinate + Poisoner + Infiltration Expertise", unlockLevel: 3,
      features: { 3: [{ k: "assassinate", th: "Assassinate", desc: "Advantage vs surprised creatures + auto-crit vs surprised" }],
                  9: [{ k: "infiltration_expertise", th: "Infiltration Expertise", desc: "Double proficiency on Stealth + Deception" }],
                  13: [{ k: "imposter", th: "Imposter", desc: "Studying someone 1h → สวมรอยได้" }],
                  17: [{ k: "death_strike", th: "Death Strike", desc: "Surprised target ที่ fail save: double damage" }] } },
  ],
  wizard: [
    { id: "evocation", classKey: "wizard", th: "School of Evocation (สายเรียกสร้าง)", desc: "Sculpt Spells + Potent Cantrip + Empowered Evocation", unlockLevel: 3,
      features: { 3: [{ k: "sculpt_spells", th: "Sculpt Spells", desc: "Allies ใน AoE ของ evocation spell ไม่โดน damage" }],
                  6: [{ k: "potent_cantrip", th: "Potent Cantrip", desc: "Cantrip ทำ half damage แม้ save ผ่าน" }],
                  10: [{ k: "empowered_evocation", th: "Empowered Evocation", desc: "+INT mod ให้ evocation spell damage" }],
                  14: [{ k: "overchannel", th: "Overchannel", desc: "Maximize evocation spell damage (cost: necrotic damage)" }] } },
    { id: "abjuration", classKey: "wizard", th: "School of Abjuration (สายป้องกัน)", desc: "Abjuration Ward + Arcane Ward + Spell Resistance", unlockLevel: 3,
      features: { 3: [{ k: "arcane_ward", th: "Arcane Ward", desc: "สร้าง ward (2×wizard level + INT mod HP) ที่ดูด damage" }],
                  6: [{ k: "projected_ward", th: "Projected Ward", desc: "ใช้ ward ป้องกัน ally ได้" }],
                  10: [{ k: "abjuration_resistance", th: "Improved Abjuration", desc: "Advantage on saves vs spells" }] } },
  ],
  cleric: [
    { id: "life", classKey: "cleric", th: "Life Domain (สายชีวิต)", desc: "Heavy armor + heals แรงขึ้น + Preserve Life", unlockLevel: 1,
      features: { 1: [{ k: "heavy_armor", th: "Heavy Armor Proficiency", desc: "ใส่ heavy armor ได้" },
                      { k: "disciple_life", th: "Disciple of Life", desc: "Heal spells แรงขึ้น 2+spell level" }],
                  2: [{ k: "preserve_life", th: "Preserve Life (Channel Divinity)", desc: "ฟื้น 5×level HP แบ่งให้ allies" }] } },
    { id: "war", classKey: "cleric", th: "War Domain (สายสงคราม)", desc: "Martial weapons + War Priest + Guided Strike", unlockLevel: 1,
      features: { 1: [{ k: "martial_weapons", th: "Martial Weapon Proficiency", desc: "ใช้ martial weapons ได้" },
                      { k: "war_priest", th: "War Priest", desc: "Bonus action โจมตี 1 ครั้ง (wisdom mod/long rest)" }] } },
  ],
  paladin: [
    { id: "devotion", classKey: "paladin", th: "Oath of Devotion (คำสาบานจงรักภักดี)", desc: "Sacred Weapon + Turn the Unholy", unlockLevel: 3,
      features: { 3: [{ k: "sacred_weapon", th: "Sacred Weapon (Channel Divinity)", desc: "+CHA mod to attack ให้อาวุธ 1 นาที" }] } },
    { id: "vengeance", classKey: "paladin", th: "Oath of Vengeance (คำสาบานแก้แค้น)", desc: "Abjure Enemy + Vow of Enmity", unlockLevel: 3,
      features: { 3: [{ k: "vow_enmity", th: "Vow of Enmity (Channel Divinity)", desc: "Advantage โจมตี target 1 ตัว 1 นาที" }] } },
  ],
  ranger: [
    { id: "hunter", classKey: "ranger", th: "Hunter Conclave (นักล่า)", desc: "Hunter's Prey + Extra Attack + Stand Against the Tide", unlockLevel: 3,
      features: { 3: [{ k: "hunters_prey", th: "Hunter's Prey", desc: "เลือก: Colossus Slayer (+1d8 damage), Giant Killer (reaction attack), Horde Breaker (extra target)" }] } },
    { id: "beast_master", classKey: "ranger", th: "Beast Master Conclave (นักฝึกสัตว์)", desc: "Animal Companion — beast CR ≤ 1/4", unlockLevel: 3,
      features: { 3: [{ k: "animal_companion", th: "Ranger's Companion", desc: "Beast companion CR ≤ 1/4 — สั่งการด้วย bonus action" }] } },
  ],
  warlock: [
    { id: "fiend", classKey: "warlock", th: "The Fiend (ปีศาจ)", desc: "Dark One's Blessing + Dark One's Own Luck", unlockLevel: 1,
      features: { 1: [{ k: "dark_ones_blessing", th: "Dark One's Blessing", desc: "ฆ่าศัตรู → temp HP = CHA mod + warlock level" }] } },
    { id: "archfey", classKey: "warlock", th: "The Archfey (เจ้าป่า)", desc: "Fey Presence + Misty Escape", unlockLevel: 1,
      features: { 1: [{ k: "fey_presence", th: "Fey Presence", desc: "Action: creatures ใน 10ft ทอย WIS save หรือ charmed/frightened" }] } },
  ],
  sorcerer: [
    { id: "draconic", classKey: "sorcerer", th: "Draconic Bloodline (สายเลือดมังกร)", desc: "Extra HP + elemental affinity + dragon wings", unlockLevel: 1,
      features: { 1: [{ k: "draconic_resilience", th: "Draconic Resilience", desc: "Max HP +1 per level + AC 13+DEX ไม่สวมเกราะ" }] } },
    { id: "wild_magic", classKey: "sorcerer", th: "Wild Magic (เวทป่า)", desc: "Wild Magic Surge + Tides of Chaos + Bend Luck", unlockLevel: 1,
      features: { 1: [{ k: "wild_magic_surge", th: "Wild Magic Surge", desc: "ทุกครั้งที่ร่ายเวท: roll d20 → 1 = wild magic table" },
                      { k: "tides_of_chaos", th: "Tides of Chaos", desc: "Advantage 1 check/save/long rest → recharge on spell cast" }] } },
  ],
  druid: [
    { id: "land", classKey: "druid", th: "Circle of the Land (วงกลมแห่งแผ่นดิน)", desc: "Bonus cantrip + Natural Recovery + Land's Stride", unlockLevel: 2,
      features: { 2: [{ k: "natural_recovery", th: "Natural Recovery", desc: "Short rest: คืน spell slot รวมระดับไม่เกิน half level" }] } },
    { id: "moon", classKey: "druid", th: "Circle of the Moon (วงกลมแห่งดวงจันทร์)", desc: "Combat Wild Shape + Primal Strike", unlockLevel: 2,
      features: { 2: [{ k: "combat_wild_shape", th: "Combat Wild Shape", desc: "Wild Shape เป็น bonus action + CR สูงขึ้น (CR 1, CR 2 at Lv6)" }] } },
  ],
  monk: [
    { id: "open_hand", classKey: "monk", th: "Way of the Open Hand (หมัดแพทย์)", desc: "Open Hand Technique + Wholeness of Body + Tranquility", unlockLevel: 3,
      features: { 3: [{ k: "open_hand_technique", th: "Open Hand Technique", desc: "Flurry of Blows: เลือก push 5ft/knock prone/disadvantage next attack" }] } },
    { id: "shadow", classKey: "monk", th: "Way of Shadow (เงา)", desc: "Shadow Arts + Shadow Step", unlockLevel: 3,
      features: { 3: [{ k: "shadow_arts", th: "Shadow Arts", desc: "ร่าย Darkness/Darkvision/Pass Without Trace/Silence ใช้ ki" }] } },
  ],
};

/** Get available subclasses for a class at a given level */
export function getAvailableSubclasses(classKey: string, level: number): SubclassDef[] {
  const subs = SUBCLASSES[classKey] || [];
  return subs.filter(s => level >= s.unlockLevel);
}

/** Get subclass by ID */
export function getSubclassById(id: string): SubclassDef | null {
  for (const classSubs of Object.values(SUBCLASSES)) {
    const found = classSubs.find(s => s.id === id);
    if (found) return found;
  }
  return null;
}

/** Check if a class should prompt for subclass selection at a given level */
export function shouldPromptSubclass(classKey: string, level: number): boolean {
  const subs = SUBCLASSES[classKey] || [];
  if (subs.length === 0) return false;
  const unlockLevel = subs[0].unlockLevel;
  return level >= unlockLevel;
}
