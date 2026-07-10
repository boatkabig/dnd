/**
 * Inventory System — กระเป๋าและการจัดการของ (14.1–14.7)
 *
 * Inventory = ระบบถือครอง (เก็บ/ถอด/ย้าย/น้ำหนัก/เงิน)
 * แยกจาก Equipment (สวมใส่), Items (ทุกชนิด), Objects (ในฉาก)
 */

/* ======================================================================
 * 14.1 CONTAINER
 * ====================================================================== */

export type ContainerType = "backpack" | "bag" | "chest" | "storage" | "bank";

export interface Container {
  id: string;
  name: string;
  nameTh: string;
  type: ContainerType;
  maxWeight: number;        // 0 = unlimited
  maxSlots: number;         // 0 = unlimited
  items: InventorySlot[];
}

/* ======================================================================
 * 14.2 ITEM STORAGE
 * ====================================================================== */

export interface InventorySlot {
  itemId: string;
  itemName: string;
  quantity: number;
  weight: number;           // per item
  stackable: boolean;
  tags?: string[];
}

/* ======================================================================
 * 14.3 WEIGHT SYSTEM
 * ====================================================================== */

export type EncumbranceLevel = "none" | "encumbered" | "heavily_encumbered" | "overloaded";

export interface WeightState {
  currentWeight: number;
  maxCapacity: number;       // STR * 15
  encumberedAt: number;      // STR * 5
  heavilyEncumberedAt: number; // STR * 10
  level: EncumbranceLevel;
  speedPenalty: number;      // 0, -10, -20, 0 (can't move)
}

export function calculateWeight(container: Container): number {
  return container.items.reduce((sum, slot) => sum + (slot.weight * slot.quantity), 0);
}

export function getEncumbrance(strScore: number, currentWeight: number): WeightState {
  const maxCapacity = strScore * 15;
  const encumberedAt = strScore * 5;
  const heavilyAt = strScore * 10;

  let level: EncumbranceLevel = "none";
  let speedPenalty = 0;

  if (currentWeight > maxCapacity) {
    level = "overloaded";
    speedPenalty = 999; // can't move
  } else if (currentWeight > heavilyAt) {
    level = "heavily_encumbered";
    speedPenalty = 20;
  } else if (currentWeight > encumberedAt) {
    level = "encumbered";
    speedPenalty = 10;
  }

  return { currentWeight, maxCapacity, encumberedAt, heavilyEncumberedAt: heavilyAt, level, speedPenalty };
}

/* ======================================================================
 * 14.4 CURRENCY
 * ====================================================================== */

export interface Currency {
  cp: number;   // copper
  sp: number;   // silver
  ep: number;   // electrum
  gp: number;   // gold
  pp: number;   // platinum
}

export function createCurrency(gp: number = 0): Currency {
  return { cp: 0, sp: 0, ep: 0, gp, pp: 0 };
}

export function toGold(c: Currency): number {
  return c.pp * 10 + c.gp + c.ep * 0.5 + c.sp * 0.1 + c.cp * 0.01;
}

export function addGold(c: Currency, amount: number): void {
  c.gp += amount;
}

export function spendGold(c: Currency, amount: number): boolean {
  if (toGold(c) < amount) return false;
  // Simplified: deduct from gp, convert down if needed
  let remaining = amount;
  if (c.pp > 0) { const fromPP = Math.min(c.pp, Math.ceil(remaining / 10)); c.pp -= fromPP; remaining -= fromPP * 10; }
  if (remaining > 0 && c.gp >= remaining) { c.gp -= remaining; remaining = 0; }
  else if (remaining > 0) { const need = remaining - c.gp; c.gp = 0; remaining = need; if (c.ep > 0) { const fromEP = Math.min(c.ep, Math.ceil(remaining * 2)); c.ep -= fromEP; remaining -= fromEP * 0.5; } if (remaining > 0 && c.sp > 0) { const fromSP = Math.min(c.sp, Math.ceil(remaining * 10)); c.sp -= fromSP; remaining -= fromSP * 0.1; } if (remaining > 0 && c.cp > 0) { const fromCP = Math.min(c.cp, Math.ceil(remaining * 100)); c.cp -= fromCP; remaining -= fromCP * 0.01; } }
  return remaining <= 0;
}

/* ======================================================================
 * 14.2 INVENTORY OPERATIONS
 * ====================================================================== */

export function addItem(container: Container, item: InventorySlot): boolean {
  // Check weight limit
  if (container.maxWeight > 0) {
    const newWeight = calculateWeight(container) + (item.weight * item.quantity);
    if (newWeight > container.maxWeight) return false;
  }
  // Check slot limit
  if (container.maxSlots > 0 && container.items.length >= container.maxSlots && !item.stackable) return false;

  // Stack if possible
  if (item.stackable) {
    const existing = container.items.find((s) => s.itemId === item.itemId);
    if (existing) {
      existing.quantity += item.quantity;
      return true;
    }
  }

  container.items.push({ ...item });
  return true;
}

export function removeItem(container: Container, itemId: string, quantity: number = 1): boolean {
  const slot = container.items.find((s) => s.itemId === itemId);
  if (!slot || slot.quantity < quantity) return false;
  slot.quantity -= quantity;
  if (slot.quantity <= 0) {
    container.items = container.items.filter((s) => s.itemId !== itemId);
  }
  return true;
}

export function moveItem(from: Container, to: Container, itemId: string, quantity: number = 1): boolean {
  const slot = from.items.find((s) => s.itemId === itemId);
  if (!slot || slot.quantity < quantity) return false;

  const itemToMove: InventorySlot = { ...slot, quantity };
  if (!addItem(to, itemToMove)) return false;
  removeItem(from, itemId, quantity);
  return true;
}

export function splitStack(container: Container, itemId: string, quantity: number): InventorySlot | null {
  const slot = container.items.find((s) => s.itemId === itemId);
  if (!slot || slot.quantity <= quantity) return null;
  slot.quantity -= quantity;
  return { ...slot, quantity };
}

/* ======================================================================
 * 14.6 SEARCH
 * ====================================================================== */

export function searchItems(container: Container, query: {
  name?: string;
  type?: string;
  tag?: string;
}): InventorySlot[] {
  return container.items.filter((slot) => {
    if (query.name && !slot.itemName.toLowerCase().includes(query.name.toLowerCase())) return false;
    if (query.tag && !(slot.tags || []).includes(query.tag)) return false;
    return true;
  });
}

/* ======================================================================
 * 14.7 LOOT SYSTEM
 * ====================================================================== */

export interface LootEntry {
  itemName: string;
  quantity: number;
  chance: number;       // 0-1
  rarity?: string;
}

export function generateLoot(lootTable: LootEntry[]): InventorySlot[] {
  const loot: InventorySlot[] = [];
  for (const entry of lootTable) {
    if (Math.random() <= entry.chance) {
      loot.push({
        itemId: entry.itemName.toLowerCase().replace(/\s+/g, "_"),
        itemName: entry.itemName,
        quantity: entry.quantity,
        weight: 0,
        stackable: entry.quantity > 1,
      });
    }
  }
  return loot;
}

export function addLootToInventory(container: Container, loot: InventorySlot[]): { added: number; failed: number } {
  let added = 0;
  let failed = 0;
  for (const item of loot) {
    if (addItem(container, item)) added++;
    else failed++;
  }
  return { added, failed };
}

/* ======================================================================
 * 14.5 EQUIPMENT INTEGRATION
 * ====================================================================== */

export function createDefaultBackpack(): Container {
  return {
    id: "backpack",
    name: "Backpack",
    nameTh: "เป้สัมภาระ",
    type: "backpack",
    maxWeight: 0, // unlimited for simplicity
    maxSlots: 0,
    items: [],
  };
}
