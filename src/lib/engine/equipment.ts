/**
 * ============================================================================
 * D&D Engine Design Document — Chapter 05: Items & Equipment
 * ============================================================================
 *
 * Version: 1.0
 * Target: D&D 5e / 2024 Compatible
 * Architecture: Data-Driven Item Definitions + Slot-Based Equipment
 *
 * Core Principles:
 *   1. ItemDef is pure data — adding new items requires no code changes.
 *   2. Equipment uses a fixed slot system (16 slots) — easy to render in UI.
 *   3. Attunement is tracked separately (max 3 attuned items per character).
 *   4. Weapon properties, mastery, and armor categories are data tables.
 *   5. Don/Doff times are part of the definition (1 action / 5 min / etc.).
 *   6. Magic item rarity is a typed enum — UI can color-code by rarity.
 *
 * Item Class Hierarchy:
 *   ItemDef (base)
 *   ├── WeaponDef   (extends ItemDef — adds damage, properties, mastery)
 *   ├── ArmorDef    (extends ItemDef — adds AC, DEX cap, don/doff)
 *   ├── ShieldDef   (extends ItemDef — adds AC bonus)
 *   ├── ConsumableDef (extends ItemDef — adds effect on use)
 *   ├── ToolDef     (extends ItemDef — adds tool category)
 *   └── WondrousDef (extends ItemDef — magic item with no slot)
 *
 * Equipment Slot System (16 slots):
 *   Combat: main_hand, off_hand (or two_handed)
 *   Body:   armor, shield, cloak, boots, gloves, bracers, belt
 *   Jewelry: ring1, ring2, amulet, headband
 *   Head:   head (helmet/crown)
 *   Misc:   back, wondrous
 *
 * Attunement:
 *   - Some magic items require attunement (max 3 per character).
 *   - Attunement takes 1 short rest; can be broken at any time.
 *   - Attuned items grant their magical effects while equipped + attuned.
 *
 * Weapon Mastery (D&D 2024):
 *   Fighters, Paladins, Barbarians, Rangers gain Weapon Mastery features
 *   that unlock special effects per weapon: cleave, graze, push, sap, slow,
 *   topple, vex, nick, flex. Each is data-driven (no hardcode).
 * ============================================================================
 */

// ============================================================================
// 1. ITEM RARITY
// ============================================================================

export type ItemRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "very_rare"
  | "legendary"
  | "artifact";

/**
 * Rarity table — UI color + magic-item bonus hint.
 * Data-driven; adding a homebrew rarity requires only a new entry.
 */
export interface RarityDef {
  rarity: ItemRarity;
  name: string;
  /** Suggested UI color (Tailwind class fragment). */
  color: string;
  /** Approximate gold value multiplier. */
  valueMultiplier: number;
  /** Minimum character level suggested (DMG guidance). */
  minLevel?: number;
}

export const ITEM_RARITIES: Record<ItemRarity, RarityDef> = {
  common: { rarity: "common", name: "Common", color: "text-gray-500", valueMultiplier: 1 },
  uncommon: { rarity: "uncommon", name: "Uncommon", color: "text-emerald-600", valueMultiplier: 2, minLevel: 1 },
  rare: { rarity: "rare", name: "Rare", color: "text-sky-600", valueMultiplier: 4, minLevel: 5 },
  very_rare: { rarity: "very_rare", name: "Very Rare", color: "text-purple-600", valueMultiplier: 8, minLevel: 11 },
  legendary: { rarity: "legendary", name: "Legendary", color: "text-orange-600", valueMultiplier: 16, minLevel: 17 },
  artifact: { rarity: "artifact", name: "Artifact", color: "text-rose-700", valueMultiplier: 0, minLevel: 20 },
};

// ============================================================================
// 2. ITEM CATEGORIES & BASE DEFINITION
// ============================================================================

export type ItemCategory =
  | "weapon"
  | "armor"
  | "shield"
  | "consumable"
  | "magic_item"
  | "tool"
  | "gear"
  | "currency"
  | "scroll"
  | "gem"
  | "ammunition";

/**
 * Base item definition. All specific item types extend this.
 * Pure data — no methods, no behavior.
 */
export interface ItemDef {
  id: string;
  name: string;
  nameTh?: string;
  category: ItemCategory;
  price: number;                    // gp
  weight: number;                   // lbs
  rarity?: ItemRarity;
  /** Magic item requires attunement before its effects activate. */
  requiresAttunement?: boolean;
  /** Free-form attunement requirement (e.g. "must be a spellcaster"). */
  attunementRequirement?: string;
  description?: string;
  /** Magic item effect IDs (referenced by Effects system). */
  effectIds?: string[];
  /** Don/doff times for equippable items (e.g. "1 action", "5 minutes"). */
  donTime?: string;
  doffTime?: string;
  /** Tags for AI search (e.g. "fire", "silvered", "adamantine"). */
  tags?: string[];
  /** Source book (e.g. "PHB", "DMG", "XGtE", "Tasha", "Homebrew"). */
  source?: string;
}

// ============================================================================
// 3. WEAPON SYSTEM
// ============================================================================

export type WeaponProperty =
  | "ammunition"
  | "finesse"
  | "heavy"
  | "light"
  | "loading"
  | "range"
  | "reach"
  | "special"
  | "thrown"
  | "two_handed"
  | "versatile";

/**
 * D&D 2024 Weapon Mastery options. Each grants a special effect on hit.
 * Data-driven — adding a new mastery requires only a new entry.
 */
export type WeaponMastery =
  | "cleave"
  | "flex"
  | "graze"
  | "nick"
  | "push"
  | "sap"
  | "slow"
  | "topple"
  | "vex"
  | null;

export interface WeaponMasteryDef {
  mastery: Exclude<WeaponMastery, null>;
  name: string;
  description: string;
  /** Trigger type — when does this mastery's effect fire? */
  trigger: "on_hit" | "on_attack_roll" | "on_damage_roll" | "always";
}

export const WEAPON_MASTERIES: Record<Exclude<WeaponMastery, null>, WeaponMasteryDef> = {
  cleave: { mastery: "cleave", name: "Cleave", description: "On hit, deal weapon damage to a second adjacent creature.", trigger: "on_hit" },
  flex: { mastery: "flex", name: "Flex", description: "When wielded one-handed, use the versatile damage die.", trigger: "always" },
  graze: { mastery: "graze", name: "Graze", description: "On miss, deal damage equal to your ability modifier.", trigger: "on_hit" },
  nick: { mastery: "nick", name: "Nick", description: "Two-weapon fighting: extra attack with off-hand joins main Attack action (no Bonus Action cost).", trigger: "on_attack_roll" },
  push: { mastery: "push", name: "Push", description: "On hit, push target 10 ft away if it is Large or smaller.", trigger: "on_hit" },
  sap: { mastery: "sap", name: "Sap", description: "On hit, target has disadvantage on its next attack roll before its next turn.", trigger: "on_hit" },
  slow: { mastery: "slow", name: "Slow", description: "On hit, target's speed reduced by 10 ft until start of your next turn.", trigger: "on_hit" },
  topple: { mastery: "topple", name: "Topple", description: "On hit, target makes a STR save or falls prone.", trigger: "on_hit" },
  vex: { mastery: "vex", name: "Vex", description: "On hit, you have advantage on your next attack roll against target before end of your next turn.", trigger: "on_hit" },
};

export type WeaponCategory = "simple" | "martial";
export type DamageType =
  | "slashing" | "piercing" | "bludgeoning"
  | "fire" | "cold" | "lightning" | "thunder" | "acid" | "poison"
  | "psychic" | "necrotic" | "radiant" | "force";

export interface WeaponDef extends ItemDef {
  category: "weapon";
  weaponCategory: WeaponCategory;
  damage: string;                  // "1d8" or "1d6"
  versatileDamage?: string;        // "1d10" if versatile property
  damageType: DamageType;
  ability: "str" | "dex";          // primary ability for attack/damage
  properties: WeaponProperty[];
  mastery: WeaponMastery;
  reach: number;                   // ft (5 or 10)
  rangeNormal?: number;            // ft (for ranged/thrown)
  rangeLong?: number;              // ft
  /** Magic +1/+2/+3 to attack and damage rolls. */
  plus?: number;
  /** Special weapon feature description (Lance, Net, etc.). */
  special?: string;
}

// ============================================================================
// 4. ARMOR SYSTEM
// ============================================================================

export type ArmorType = "light" | "medium" | "heavy" | "shield";

export interface ArmorDef extends ItemDef {
  category: "armor" | "shield";
  armorType: ArmorType;
  /** Base AC (e.g. Leather 11, Chain Mail 16, Shield +2). */
  acBase: number;
  /** Whether DEX modifier is added to AC. */
  dexBonus: boolean;
  /** Maximum DEX bonus allowed (medium armor: 2; light/heavy: no cap or no bonus). */
  maxDex?: number;
  /** Magic +1/+2/+3 to AC. */
  acPlus?: number;
  strMin?: number;                 // D&D 2014 only — removed in 2024
  stealthDisadv?: boolean;         // D&D 2014 only — removed in 2024
}

/**
 * Armor category table — data-driven. DEX cap lookup.
 */
export const ARMOR_DEX_CAPS: Record<ArmorType, number | undefined> = {
  light: undefined,    // no cap
  medium: 2,
  heavy: 0,            // no DEX bonus
  shield: undefined,   // shield doesn't have DEX bonus (it's separate)
};

/**
 * Don/doff times for armor (D&D 5e standard).
 * Data-driven table for AI DM to consult.
 */
export const ARMOR_DON_DOFF_TIMES: Record<ArmorType, { don: string; doff: string }> = {
  light: { don: "1 minute", doff: "1 minute" },
  medium: { don: "5 minutes", doff: "1 minute" },
  heavy: { don: "10 minutes", doff: "5 minutes" },
  shield: { don: "1 action", doff: "1 action" },
};

// ============================================================================
// 5. EQUIPMENT SLOTS — 16-Slot System
// ============================================================================

/**
 * 16 equipment slots. Covers all canonical D&D 5e slots.
 * Adding a new slot requires only a new entry in EQUIPMENT_SLOTS.
 */
export type EquipmentSlot =
  | "head"          // helmet, circlet
  | "headband"      // headband of intellect, etc.
  | "armor"         // body armor
  | "shield"        // shield (off-hand defensive)
  | "cloak"         // cloak of protection, cloak of elvenkind
  | "boots"         // boots of striding and springing
  | "gloves"        // gauntlets of ogre power
  | "bracers"       // bracers of archery, bracers of defense
  | "belt"          // belt of giant strength
  | "ring1"         // ring of protection
  | "ring2"         // second ring slot
  | "amulet"        // amulet of health
  | "main_hand"     // primary weapon or one-handed weapon
  | "off_hand"      // off-hand weapon or shield
  | "back"          // wings, cloaks with back slot
  | "wondrous";     // wondrous items that don't fit a slot

export interface EquipmentSlotDef {
  slot: EquipmentSlot;
  name: string;
  description: string;
  /** Whether this slot accepts weapons. */
  acceptsWeapon: boolean;
  /** Whether this slot accepts armor. */
  acceptsArmor: boolean;
  /** Whether this slot accepts magic items. */
  acceptsMagic: boolean;
}

export const EQUIPMENT_SLOTS: Record<EquipmentSlot, EquipmentSlotDef> = {
  head: { slot: "head", name: "Head", description: "Helmet, circlet, hat.", acceptsWeapon: false, acceptsArmor: true, acceptsMagic: true },
  headband: { slot: "headband", name: "Headband", description: "Headbands of intellect or similar.", acceptsWeapon: false, acceptsArmor: false, acceptsMagic: true },
  armor: { slot: "armor", name: "Armor", description: "Body armor (light/medium/heavy).", acceptsWeapon: false, acceptsArmor: true, acceptsMagic: false },
  shield: { slot: "shield", name: "Shield", description: "Shield in off-hand (defensive).", acceptsWeapon: false, acceptsArmor: true, acceptsMagic: true },
  cloak: { slot: "cloak", name: "Cloak", description: "Cloaks and capes.", acceptsWeapon: false, acceptsArmor: false, acceptsMagic: true },
  boots: { slot: "boots", name: "Boots", description: "Boots and footwear.", acceptsWeapon: false, acceptsArmor: false, acceptsMagic: true },
  gloves: { slot: "gloves", name: "Gloves", description: "Gloves and gauntlets.", acceptsWeapon: false, acceptsArmor: true, acceptsMagic: true },
  bracers: { slot: "bracers", name: "Bracers", description: "Bracers and armlets.", acceptsWeapon: false, acceptsArmor: false, acceptsMagic: true },
  belt: { slot: "belt", name: "Belt", description: "Belts and girdles.", acceptsWeapon: false, acceptsArmor: false, acceptsMagic: true },
  ring1: { slot: "ring1", name: "Ring (1)", description: "First ring slot.", acceptsWeapon: false, acceptsArmor: false, acceptsMagic: true },
  ring2: { slot: "ring2", name: "Ring (2)", description: "Second ring slot.", acceptsWeapon: false, acceptsArmor: false, acceptsMagic: true },
  amulet: { slot: "amulet", name: "Amulet", description: "Amulets and necklaces.", acceptsWeapon: false, acceptsArmor: false, acceptsMagic: true },
  main_hand: { slot: "main_hand", name: "Main Hand", description: "Primary weapon.", acceptsWeapon: true, acceptsArmor: false, acceptsMagic: true },
  off_hand: { slot: "off_hand", name: "Off Hand", description: "Off-hand weapon or shield.", acceptsWeapon: true, acceptsArmor: true, acceptsMagic: true },
  back: { slot: "back", name: "Back", description: "Wings, cloaks with back slot.", acceptsWeapon: false, acceptsArmor: false, acceptsMagic: true },
  wondrous: { slot: "wondrous", name: "Wondrous", description: "Wondrous items that don't fit a slot.", acceptsWeapon: false, acceptsArmor: false, acceptsMagic: true },
};

/** Total number of equipment slots (UI hint). */
export const SLOT_COUNT: number = Object.keys(EQUIPMENT_SLOTS).length;

/** All slot names in display order. */
export const SLOT_ORDER: EquipmentSlot[] = [
  "main_hand", "off_hand", "armor", "shield",
  "head", "headband", "cloak", "back",
  "boots", "gloves", "bracers", "belt",
  "ring1", "ring2", "amulet", "wondrous",
];

// ============================================================================
// 6. EQUIPMENT STATE — Per-character equipped items
// ============================================================================

export interface EquipmentState {
  characterId: string;
  /** slot → item instance ID (or null). */
  slots: Record<EquipmentSlot, string | null>;
  /** Items currently attuned (max 3 in D&D 5e). */
  attunedItemIds: string[];
}

/** Create an empty equipment state for a new character. */
export function createEmptyEquipment(characterId: string = ""): EquipmentState {
  const slots = {} as Record<EquipmentSlot, string | null>;
  for (const s of SLOT_ORDER) slots[s] = null;
  return { characterId, slots, attunedItemIds: [] };
}

// ============================================================================
// 7. EQUIP / UNEQUIP — Pure functions
// ============================================================================

/**
 * Validate whether an item can be equipped to a slot.
 * Checks slot compatibility (weapon → main_hand/off_hand only, etc.).
 */
export function canEquipToSlot(item: ItemDef, slot: EquipmentSlot): boolean {
  const slotDef = EQUIPMENT_SLOTS[slot];
  // Weapons: only main_hand or off_hand
  if (item.category === "weapon") {
    return slot === "main_hand" || slot === "off_hand";
  }
  // Body armor: only armor slot
  if (item.category === "armor") {
    return slot === "armor";
  }
  // Shields: shield slot or off_hand (in lieu of a weapon)
  if (item.category === "shield") {
    return slot === "shield" || slot === "off_hand";
  }
  // All other items: respect slot's magic-item flag (UI hint)
  return slotDef.acceptsMagic || slotDef.acceptsArmor;
}

/**
 * Equip an item to a slot. Returns new EquipmentState.
 * If the slot was occupied, the previous item is returned unequipped (caller handles).
 */
export function equipItem(
  state: EquipmentState,
  slot: EquipmentSlot,
  itemId: string,
  item?: ItemDef,
): { state: EquipmentState; displacedItemId: string | null } {
  if (item && !canEquipToSlot(item, slot)) {
    throw new Error(`Item ${item.name} cannot be equipped to slot ${slot}`);
  }
  const displacedItemId = state.slots[slot];
  return {
    state: { ...state, slots: { ...state.slots, [slot]: itemId } },
    displacedItemId,
  };
}

/**
 * Unequip an item from a slot. Returns new EquipmentState.
 * Does NOT auto-unattune — caller must decide (D&D 5e: breaking attunement is intentional).
 */
export function unequipItem(state: EquipmentState, slot: EquipmentSlot): EquipmentState {
  return { ...state, slots: { ...state.slots, [slot]: null } };
}

/**
 * Find which slot an item is equipped to (or null).
 */
export function findEquippedSlot(state: EquipmentState, itemId: string): EquipmentSlot | null {
  for (const s of SLOT_ORDER) {
    if (state.slots[s] === itemId) return s;
  }
  return null;
}

/** List all equipped item IDs (non-null slots). */
export function listEquippedItems(state: EquipmentState): string[] {
  return SLOT_ORDER.map(s => state.slots[s]).filter((id): id is string => id !== null);
}

// ============================================================================
// 8. ATTUNEMENT SYSTEM
// ============================================================================

/** D&D 5e max attuned items per character (some exceptions like Artificer). */
export const MAX_ATTUNED_ITEMS = 3;

/** Number of items currently attuned. */
export function getAttunedCount(state: EquipmentState): number {
  return state.attunedItemIds.length;
}

/** Can the character attune another item? */
export function canAttuneMore(state: EquipmentState): boolean {
  return state.attunedItemIds.length < MAX_ATTUNED_ITEMS;
}

/**
 * Begin attunement to an item. Does NOT enforce equip state — caller must ensure
 * the item is equipped first (D&D 5e requires focus on the item during short rest).
 * Attunement is completed via completeAttunement() after the rest.
 */
export function beginAttunement(state: EquipmentState, itemId: string): EquipmentState {
  if (state.attunedItemIds.includes(itemId)) return state;
  if (!canAttuneMore(state)) {
    throw new Error(`Cannot attune ${itemId}: already at max (${MAX_ATTUNED_ITEMS})`);
  }
  return { ...state, attunedItemIds: [...state.attunedItemIds, itemId] };
}

/** Complete attunement (post-rest). In simple systems, begin = complete. */
export function completeAttunement(state: EquipmentState, itemId: string): EquipmentState {
  return beginAttunement(state, itemId);
}

/** Break attunement to an item. Can be done at any time (no action cost). */
export function breakAttunement(state: EquipmentState, itemId: string): EquipmentState {
  return {
    ...state,
    attunedItemIds: state.attunedItemIds.filter(id => id !== itemId),
  };
}

/** Check if an item is currently attuned. */
export function isAttuned(state: EquipmentState, itemId: string): boolean {
  return state.attunedItemIds.includes(itemId);
}

// ============================================================================
// 9. INVENTORY SYSTEM (separate from equipment)
// ============================================================================

export interface InventoryEntry {
  itemId: string;
  quantity: number;
  /** If equipped, which slot. */
  equippedSlot?: EquipmentSlot;
  /** If attuned. */
  attuned: boolean;
}

export interface InventoryState {
  characterId: string;
  entries: InventoryEntry[];
  gold: number;
  maxWeight: number;
  currentWeight: number;
}

export function createEmptyInventory(characterId: string = "", capacity: number = 150): InventoryState {
  return { characterId, entries: [], gold: 0, maxWeight: capacity, currentWeight: 0 };
}

export function addItem(
  inventory: InventoryState,
  itemId: string,
  quantity: number = 1,
  itemWeight: number = 0,
): InventoryState {
  const existing = inventory.entries.find(e => e.itemId === itemId && !e.equippedSlot);
  if (existing) {
    return {
      ...inventory,
      entries: inventory.entries.map(e =>
        e === existing ? { ...e, quantity: e.quantity + quantity } : e
      ),
      currentWeight: inventory.currentWeight + itemWeight * quantity,
    };
  }
  return {
    ...inventory,
    entries: [...inventory.entries, { itemId, quantity, attuned: false }],
    currentWeight: inventory.currentWeight + itemWeight * quantity,
  };
}

export function removeItem(
  inventory: InventoryState,
  itemId: string,
  quantity: number = 1,
  itemWeight: number = 0,
): InventoryState {
  return {
    ...inventory,
    entries: inventory.entries
      .map(e => {
        if (e.itemId === itemId && !e.equippedSlot) {
          return { ...e, quantity: Math.max(0, e.quantity - quantity) };
        }
        return e;
      })
      .filter(e => e.quantity > 0 || e.equippedSlot !== undefined),
    currentWeight: Math.max(0, inventory.currentWeight - itemWeight * quantity),
  };
}

/** Encumbrance check — D&D 5e variant rule (carrying capacity = STR × 15). */
export function isEncumbered(inventory: InventoryState): boolean {
  return inventory.currentWeight > inventory.maxWeight;
}

export function encumbranceLevel(inventory: InventoryState): "none" | "light" | "heavy" | "over" {
  const pct = inventory.currentWeight / inventory.maxWeight;
  if (pct > 1.0) return "over";
  if (pct > 0.75) return "heavy";
  if (pct > 0.5) return "light";
  return "none";
}

// ============================================================================
// 10. CONSUMABLES & TOOLS
// ============================================================================

export interface ConsumableDef extends ItemDef {
  category: "consumable";
  /** Potion: heal dice expr. Scroll: spell ID. */
  effect: {
    heal?: string;
    damage?: string;
    damageType?: DamageType;
    cureConditionIds?: string[];
    applyEffectIds?: string[];
    castSpellId?: string;
  };
  /** Number of uses (1 for typical potion, more for some items). */
  uses?: number;
}

export interface ToolDef extends ItemDef {
  category: "tool";
  /** Tool category — Thieves' Tools, Herbalism Kit, etc. */
  toolType: string;
  /** Ability typically used (DEX for Thieves' Tools, WIS for Herbalism Kit, etc.). */
  ability: "str" | "dex" | "con" | "int" | "wis" | "cha";
}

// ============================================================================
// 11. STANDARD ITEM CATALOG (data-driven sample)
// ============================================================================

/**
 * Sample standard items. Real implementations load from JSON / database.
 * This array is intentionally short — the engine is data-driven, so the
 * catalog can be expanded without code changes.
 */
export const STANDARD_ITEMS: ItemDef[] = [
  { id: "item_longsword", name: "Longsword", category: "weapon", price: 15, weight: 3, source: "PHB" },
  { id: "item_shortbow", name: "Shortbow", category: "weapon", price: 25, weight: 2, source: "PHB" },
  { id: "item_leather", name: "Leather Armor", category: "armor", price: 10, weight: 10, source: "PHB" },
  { id: "item_chain_mail", name: "Chain Mail", category: "armor", price: 75, weight: 55, source: "PHB" },
  { id: "item_shield", name: "Shield", category: "shield", price: 10, weight: 6, source: "PHB" },
];

/** Look up an item by ID from the standard catalog. */
export function getItemDef(itemId: string): ItemDef | undefined {
  return STANDARD_ITEMS.find(i => i.id === itemId);
}

// ============================================================================
// 12. SUMMARY — For AI DM / UI
// ============================================================================

/** Produce a human-readable summary of a character's equipment. */
export function summarizeEquipment(state: EquipmentState): string {
  const equipped = listEquippedItems(state);
  return `${equipped.length}/${SLOT_COUNT} slots equipped · ${state.attunedItemIds.length}/${MAX_ATTUNED_ITEMS} attuned`;
}

/** Get all magic item effects currently active (equipped + attuned items). */
export function getActiveEffectIds(
  state: EquipmentState,
  items: Record<string, ItemDef>,
): string[] {
  const effects: string[] = [];
  for (const slot of SLOT_ORDER) {
    const itemId = state.slots[slot];
    if (!itemId) continue;
    const item = items[itemId];
    if (!item) continue;
    if (item.rarity && item.effectIds) {
      // Magic item: requires attunement?
      if (item.requiresAttunement) {
        if (state.attunedItemIds.includes(itemId)) {
          effects.push(...item.effectIds);
        }
      } else {
        effects.push(...item.effectIds);
      }
    }
  }
  return effects;
}
