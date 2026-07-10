/**
 * Equipment System — อุปกรณ์ที่สวมใส่ (12.1–12.9)
 *
 * Equipment = ของที่ตัวละครใช้งาน (ถือ/สวม)
 * แยกจาก Items (ทุกชนิด), Inventory (ถือครอง), Objects (ในฉาก)
 */

/* ======================================================================
 * 12.1 EQUIPMENT SLOTS
 * ====================================================================== */

export type EquipmentSlot =
  | "main_hand" | "off_hand" | "armor" | "shield"
  | "helmet" | "cloak" | "boots" | "gloves"
  | "ring" | "necklace" | "belt" | "amulet" | "bracers" | "head" | "bag" | "wondrous";

export const SLOT_LABELS_TH: Record<EquipmentSlot, string> = {
  main_hand: "มือหลัก", off_hand: "มือรอง", armor: "เกราะ", shield: "โล่",
  helmet: "หมวก", cloak: "ผ้าคลุม", boots: "รองเท้า", gloves: "ถุงมือ",
  ring: "แหวน", necklace: "สร้อยคอ", belt: "เข็มขัด", amulet: "เครื่องราง",
  bracers: "ปลอกแขน", head: "ศีรษะ", bag: "กระเป๋า", wondrous: "ของวิเศษ",
};

/* ======================================================================
 * 12.2 WEAPON
 * ====================================================================== */

export type WeaponCategory = "simple" | "martial" | "magic" | "improvised";
export type WeaponType = "melee" | "ranged";

export interface WeaponDef {
  id: string;
  name: string;
  category: WeaponCategory;
  type: WeaponType;
  damageDice: string;       // "1d8", "2d6"
  damageType: string;       // "slashing", "piercing", "bludgeoning"
  rangeNormal: number;      // ft (5 for melee, 20-150 for ranged)
  rangeLong?: number;       // ft (for ranged weapons)
  properties: string[];     // ["finesse", "light", "heavy", "reach", "thrown", "two-handed", "versatile", "ammunition", "loading", "special"]
  weight: number;
  value: number;            // gp
  plus?: number;            // magic bonus (+1, +2, +3)
  venom?: boolean;          // Dagger of Venom
  special?: string;         // special ability description
}

/* ======================================================================
 * 12.3 WEAPON PROPERTIES (reference)
 * ====================================================================== */

export const WEAPON_PROPERTIES: Record<string, { name: string; nameTh: string; descTh: string }> = {
  light: { name: "Light", nameTh: "เบา", descTh: "ใช้ Two-Weapon Fighting ได้" },
  finesse: { name: "Finesse", nameTh: "ปราดเปรียว", descTh: "เลือกใช้ STR หรือ DEX" },
  heavy: { name: "Heavy", nameTh: "หนัก", descTh: "Small creature มี disadvantage" },
  reach: { name: "Reach", nameTh: "ระยะยาว", descTh: "เพิ่มระยะโจมตี 5 ฟุต" },
  thrown: { name: "Thrown", nameTh: "ขว้างได้", descTh: "ขว้างได้ตามระยะที่กำหนด" },
  "two-handed": { name: "Two-Handed", nameTh: "สองมือ", descTh: "ต้องใช้สองมือ" },
  versatile: { name: "Versatile", nameTh: "ใช้ได้สองมือ", descTh: "ถือสองมือได้ ดาเมจเพิ่ม" },
  ammunition: { name: "Ammunition", nameTh: "ใช้ลูกธนู", descTh: "ต้องใช้ ammunition" },
  loading: { name: "Loading", nameTh: "บรรจุช้า", descTh: "โจมตีได้ 1 ครั้งต่อ Action" },
  special: { name: "Special", nameTh: "พิเศษ", descTh: "มีกฎพิเศษ" },
};

/* ======================================================================
 * 12.4 ARMOR
 * ====================================================================== */

export type ArmorCategory = "light" | "medium" | "heavy" | "shield";

export interface ArmorDef {
  id: string;
  name: string;
  category: ArmorCategory;
  acBase: number;
  dexBonus: boolean;        // adds DEX mod to AC
  maxDexBonus?: number;     // cap on DEX bonus (0 for heavy, 2 for medium)
  strRequirement?: number;  // minimum STR to wear without speed penalty
  stealthDisadvantage: boolean;
  weight: number;
  value: number;
  plus?: number;            // magic bonus (+1, +2, +3)
}

/* ======================================================================
 * 12.5 EQUIPMENT PROFICIENCY
 * ====================================================================== */

export interface ProficiencyCheck {
  proficient: boolean;
  reasonTh: string;
}

export function checkWeaponProficiency(
  weapon: WeaponDef,
  weaponProficiencies: string[],
  classProficiencies: string[] = [],
): ProficiencyCheck {
  // Check specific weapon proficiency
  if (weaponProficiencies.includes(weapon.id)) return { proficient: true, reasonTh: "เชี่ยวชาญอาวุธนี้" };
  // Check category proficiency (simple/martial)
  if (weaponProficiencies.includes(weapon.category)) return { proficient: true, reasonTh: `เชี่ยวชาญ ${weapon.category}` };
  // Check class proficiencies
  if (classProficiencies.includes(weapon.category)) return { proficient: true, reasonTh: `เชี่ยวชาญ ${weapon.category} จากคลาส` };
  return { proficient: false, reasonTh: "ไม่เชี่ยวชาญ — โจมตีเสียเปรียบ" };
}

export function checkArmorProficiency(
  armor: ArmorDef,
  armorProficiencies: string[],
  classProficiencies: string[] = [],
): ProficiencyCheck {
  if (armorProficiencies.includes(armor.id)) return { proficient: true, reasonTh: "เชี่ยวชาญเกราะนี้" };
  if (armorProficiencies.includes(armor.category)) return { proficient: true, reasonTh: `เชี่ยวชาญ ${armor.category}` };
  if (classProficiencies.includes(armor.category)) return { proficient: true, reasonTh: `เชี่ยวชาญ ${armor.category} จากคลาส` };
  return { proficient: false, reasonTh: "ไม่เชี่ยวชาญ — ไม่สามารถร่ายเวทได้" };
}

/* ======================================================================
 * 12.6 EQUIP / UNEQUIP
 * ====================================================================== */

export interface EquippedItems {
  [slot: string]: string | null;  // slot → item name
}

export interface EquipResult {
  success: boolean;
  slot: EquipmentSlot;
  previousItem?: string;
  reasonTh?: string;
}

export function equipItem(
  equipped: EquippedItems,
  itemName: string,
  slot: EquipmentSlot,
  proficiencyCheck?: ProficiencyCheck,
): { equipped: EquippedItems; result: EquipResult } {
  // Check proficiency if provided
  if (proficiencyCheck && !proficiencyCheck.proficient) {
    // In 5e, you CAN equip without proficiency but with penalties — allow it
    // Just warn
  }

  const previousItem = equipped[slot] || null;
  const newEquipped = { ...equipped, [slot]: itemName };

  return {
    equipped: newEquipped,
    result: {
      success: true,
      slot,
      previousItem: previousItem || undefined,
      reasonTh: previousItem ? `สวม ${itemName} แทน ${previousItem}` : `สวม ${itemName}`,
    },
  };
}

export function unequipItem(
  equipped: EquippedItems,
  slot: EquipmentSlot,
): { equipped: EquippedItems; result: EquipResult } {
  const previousItem = equipped[slot] || null;
  if (!previousItem) {
    return { equipped, result: { success: false, slot, reasonTh: "ไม่มีของในช่องนี้" } };
  }
  const newEquipped = { ...equipped, [slot]: null };
  return {
    equipped: newEquipped,
    result: { success: true, slot, previousItem, reasonTh: `ถอด ${previousItem}` },
  };
}

/* ======================================================================
 * 12.7 EQUIPMENT EFFECT
 * ====================================================================== */

export interface EquipmentEffect {
  acBonus?: number;
  attackBonus?: number;
  damageBonus?: number;
  saveBonus?: number;
  abilityBonus?: Partial<Record<string, number>>;  // { str: 2, con: 2 }
  resistance?: string[];
  immunity?: string[];
  darkvision?: number;
  speedBonus?: number;
  specialAbility?: string;
}

export function getEquipmentEffects(equipped: EquippedItems, magicItems: Record<string, EquipmentEffect>): EquipmentEffect {
  const combined: EquipmentEffect = {
    acBonus: 0, attackBonus: 0, damageBonus: 0, saveBonus: 0,
  };

  for (const item of Object.values(equipped)) {
    if (!item) continue;
    const effect = magicItems[item];
    if (!effect) continue;
    if (effect.acBonus) combined.acBonus! += effect.acBonus;
    if (effect.attackBonus) combined.attackBonus! += effect.attackBonus;
    if (effect.damageBonus) combined.damageBonus! += effect.damageBonus;
    if (effect.saveBonus) combined.saveBonus! += effect.saveBonus;
    if (effect.abilityBonus) {
      combined.abilityBonus = combined.abilityBonus || {};
      for (const [abil, val] of Object.entries(effect.abilityBonus)) {
        if (val === undefined) continue;
        combined.abilityBonus[abil] = (combined.abilityBonus[abil] || 0) + val;
      }
    }
    if (effect.resistance) {
      combined.resistance = [...(combined.resistance || []), ...effect.resistance];
    }
    if (effect.immunity) {
      combined.immunity = [...(combined.immunity || []), ...effect.immunity];
    }
    if (effect.darkvision) combined.darkvision = Math.max(combined.darkvision || 0, effect.darkvision);
    if (effect.speedBonus) combined.speedBonus = (combined.speedBonus || 0) + effect.speedBonus;
  }

  return combined;
}

/* ======================================================================
 * 12.8 EQUIPMENT CONDITION
 * ====================================================================== */

export type EquipmentCondition = "normal" | "damaged" | "broken" | "cursed";

export interface EquipmentState {
  item: string;
  condition: EquipmentCondition;
  hp?: number;            // for breakable items
  maxHp?: number;
}

/* ======================================================================
 * 12.9 ATTUNEMENT
 * ====================================================================== */

export interface AttunementState {
  attunedItems: string[];
  attunedBy: Map<string, string>;  // item → character
  maxAttuned: number;               // default 3
}

export function createAttunementState(maxAttuned: number = 3): AttunementState {
  return { attunedItems: [], attunedBy: new Map(), maxAttuned };
}

export function attuneItem(
  state: AttunementState,
  itemName: string,
  characterId: string,
  requiresAttunement: boolean = true,
): { success: boolean; reasonTh: string } {
  if (!requiresAttunement) return { success: true, reasonTh: "ไม่ต้อง attune" };
  if (state.attunedItems.includes(itemName)) return { success: false, reasonTh: "Attune แล้ว" };
  if (state.attunedItems.length >= state.maxAttuned) return { success: false, reasonTh: `Attune เต็มแล้ว (${state.maxAttuned})` };
  state.attunedItems.push(itemName);
  state.attunedBy.set(itemName, characterId);
  return { success: true, reasonTh: `Attune ${itemName} สำเร็จ` };
}

export function breakAttunement(
  state: AttunementState,
  itemName: string,
): { success: boolean; reasonTh: string } {
  if (!state.attunedItems.includes(itemName)) return { success: false, reasonTh: "ไม่ได้ attune อยู่" };
  state.attunedItems = state.attunedItems.filter((i) => i !== itemName);
  state.attunedBy.delete(itemName);
  return { success: true, reasonTh: `ยกเลิก attune ${itemName}` };
}
