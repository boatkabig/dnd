/**
 * Items System — ไอเท็มทุกชนิดในโลกเกม (13.1–13.8)
 *
 * Items = สิ่งของทั้งหมดในโลก (ไม่ใช่ Equipment ที่สวมใส่อย่างเดียว)
 * แยกจาก Equipment (ใช้งาน), Inventory (ถือครอง), Objects (ในฉาก)
 */

/* ======================================================================
 * 13.1 ITEM TYPE
 * ====================================================================== */

export type ItemType =
  | "equipment" | "consumable" | "magic_item" | "quest_item"
  | "material" | "treasure" | "tool" | "currency" | "scroll" | "weapon" | "armor";

/* ======================================================================
 * 13.2 ITEM DATA
 * ====================================================================== */

export type Rarity = "common" | "uncommon" | "rare" | "very_rare" | "legendary" | "artifact";

export const RARITY_TH: Record<Rarity, string> = {
  common: "ทั่วไป", uncommon: "ไม่ธรรมดา", rare: "หายาก",
  very_rare: "หายากมาก", legendary: "ตำนาน", artifact: "อาร์ติแฟกต์",
};

export interface ItemDef {
  id: string;
  name: string;
  nameTh?: string;
  type: ItemType;
  description: string;
  descriptionTh?: string;
  weight: number;
  value: number;            // gp
  rarity: Rarity;
  tags: string[];
  // 13.3 Consumable
  consumable?: {
    uses: number;
    maxUses: number;
    effect: string;        // "heal:2d4+2", "cure:poisoned", "damage:2d6:acid"
    combatUsable: boolean;
  };
  // 13.4 Magic Item
  magic?: {
    requiresAttunement: boolean;
    attunementRequirement?: string;  // "by a wizard", "by a spellcaster"
    charges?: number;
    maxCharges?: number;
    recharge?: "dawn" | "1d6_5_6" | "none";
    passiveEffect?: string;
    activeAbility?: string;
    spellIndex?: string;           // for spell scrolls/wands
    spellLevel?: number;
  };
  // 13.5 Activation
  activation?: "action" | "bonus_action" | "reaction" | "passive" | "command_word" | "use";
  // 13.8 Identification
  identified?: boolean;
  identifyDC?: number;
}

/* ======================================================================
 * 13.3 CONSUMABLE HELPERS
 * ====================================================================== */

export function consumeItem(item: ItemDef): { consumed: boolean; effect?: string; remaining: number } {
  if (!item.consumable) return { consumed: false, remaining: 0 };
  if (item.consumable.uses <= 0) return { consumed: false, remaining: 0 };
  item.consumable.uses -= 1;
  return { consumed: true, effect: item.consumable.effect, remaining: item.consumable.uses };
}

export function isConsumable(item: ItemDef): boolean {
  return item.type === "consumable" || !!item.consumable;
}

/* ======================================================================
 * 13.4 MAGIC ITEM HELPERS
 * ====================================================================== */

export function isMagicItem(item: ItemDef): boolean {
  return item.type === "magic_item" || !!item.magic;
}

export function requiresAttunement(item: ItemDef): boolean {
  return item.magic?.requiresAttunement ?? false;
}

/* ======================================================================
 * 13.6 ITEM CHARGES
 * ====================================================================== */

export function useItemCharge(item: ItemDef): boolean {
  if (!item.magic?.charges || item.magic.charges <= 0) return false;
  item.magic.charges -= 1;
  return true;
}

export function rechargeItem(item: ItemDef): void {
  if (item.magic?.maxCharges) {
    item.magic.charges = item.magic.maxCharges;
  }
}

export function rollRechargeItem(item: ItemDef): boolean {
  if (item.magic?.recharge === "1d6_5_6") {
    const roll = Math.floor(Math.random() * 6) + 1;
    if (roll >= 5 && item.magic.charges !== undefined && item.magic.maxCharges) {
      item.magic.charges = Math.min(item.magic.maxCharges, item.magic.charges + 1);
      return true;
    }
  }
  return false;
}

/* ======================================================================
 * 13.7 ITEM INTERACTION
 * ====================================================================== */

export type ItemInteraction = "pick_up" | "drop" | "use" | "throw" | "break" | "examine" | "activate" | "read";

export function canInteract(item: ItemDef, interaction: ItemInteraction): boolean {
  switch (interaction) {
    case "use": return isConsumable(item) || !!item.magic?.activeAbility;
    case "throw": return item.type === "consumable" || item.tags.includes("thrown");
    case "break": return item.weight > 0 && item.type !== "quest_item";
    case "activate": return !!item.magic?.activeAbility || !!item.magic?.spellIndex;
    case "read": return item.type === "scroll";
    case "pick_up": return item.type !== "currency";
    case "drop": return true;
    case "examine": return true;
    default: return false;
  }
}

/* ======================================================================
 * 13.8 ITEM IDENTIFICATION
 * ====================================================================== */

export function identifyItem(item: ItemDef, arcanaResult: number, identifyDC?: number): boolean {
  const dc = identifyDC || item.identifyDC || 15;
  if (arcanaResult >= dc) {
    item.identified = true;
    return true;
  }
  return false;
}

export function isIdentified(item: ItemDef): boolean {
  return item.identified ?? true; // non-magic items are always identified
}

/* ======================================================================
 * SRD SYNC — convert SRD equipment/magic-item to ItemDef
 * ====================================================================== */

export function convertSRDEquipment(srd: any): ItemDef {
  const isWeapon = srd.weapon_category !== undefined;
  const isArmor = srd.armor_category !== undefined;

  return {
    id: srd.index,
    name: srd.name,
    type: isWeapon ? "weapon" : isArmor ? "armor" : "equipment",
    description: Array.isArray(srd.desc) ? srd.desc.join(" ") : (srd.desc || ""),
    weight: srd.weight || 0,
    value: srd.cost?.quantity || 0,
    rarity: "common",
    tags: [srd.equipment_category?.name || "equipment"],
    identified: true,
  };
}

export function convertSRDMagicItem(srd: any): ItemDef {
  return {
    id: srd.index,
    name: srd.name,
    type: "magic_item",
    description: Array.isArray(srd.desc) ? srd.desc.join(" ") : (srd.desc || ""),
    weight: 0,
    value: 0,
    rarity: (srd.rarity?.name?.toLowerCase().replace(" ", "_") || "rare") as Rarity,
    tags: [srd.equipment_category?.name || "magic"],
    magic: {
      requiresAttunement: !!(srd.desc && srd.desc.join(" ").toLowerCase().includes("requires attunement")),
    },
    identified: false,
    identifyDC: 15,
  };
}
