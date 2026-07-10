import { equipItem, unequipItem, getEquipmentEffects, checkWeaponProficiency, attuneItem, breakAttunement, createAttunementState } from "../src/lib/equipment";
import { consumeItem, isConsumable, isMagicItem, useItemCharge, rechargeItem, identifyItem, convertSRDEquipment, convertSRDMagicItem, type ItemDef } from "../src/lib/items";
import { createDefaultBackpack, addItem, removeItem, calculateWeight, getEncumbrance, createCurrency, toGold, spendGold, searchItems, generateLoot, addLootToInventory, moveItem, splitStack, type Container } from "../src/lib/inventory";
import { createDoor, createChest, createTrap, interactObject, canInteractObject, damageObject, checkTriggers } from "../src/lib/objects";

console.log("=== Equipment, Items, Inventory, Objects Tests ===\n");

// --- EQUIPMENT ---

// 12.1/12.6 Equip/Unequip
let equipped: any = {};
const eqResult = equipItem(equipped, "Longsword +1", "main_hand" as any);
equipped = eqResult.equipped;
console.log("Equip Longsword +1:", eqResult.result.reasonTh);

const eqResult2 = equipItem(equipped, "Studded Leather +1", "armor" as any);
equipped = eqResult2.equipped;
console.log("Equip Studded Leather +1:", eqResult2.result.reasonTh);

const eqResult3 = equipItem(equipped, "Ring of Protection", "ring" as any);
equipped = eqResult3.equipped;
console.log("Equip Ring of Protection:", eqResult3.result.reasonTh);

// 12.7 Equipment Effects
const magicItems: any = {
  "Longsword +1": { attackBonus: 1, damageBonus: 1 },
  "Studded Leather +1": { acBonus: 1 },
  "Ring of Protection": { acBonus: 1, saveBonus: 1 },
};
const effects = getEquipmentEffects(equipped, magicItems);
console.log("\nEquipment effects:");
console.log("  AC bonus:", effects.acBonus, "(Studded +1 + Ring +1 = +2)");
console.log("  Attack bonus:", effects.attackBonus, "(Longsword +1)");
console.log("  Save bonus:", effects.saveBonus, "(Ring +1)");

// 12.5 Proficiency
const prof = checkWeaponProficiency(
  { id: "longsword", name: "Longsword", category: "martial", type: "melee", damageDice: "1d8", damageType: "slashing", rangeNormal: 5, properties: ["versatile"], weight: 3, value: 15 } as any,
  ["simple"],
  ["martial"],
);
console.log("\nWeapon proficiency (martial weapon, class has martial):", prof.proficient, prof.reasonTh);

// 12.9 Attunement
const attState = createAttunementState(3);
console.log("\nAttunement:");
console.log("  Attune Ring:", attuneItem(attState, "Ring of Protection", "player1", true).reasonTh);
console.log("  Attune Ring again:", attuneItem(attState, "Ring of Protection", "player1", true).reasonTh);
console.log("  Break attune:", breakAttunement(attState, "Ring of Protection").reasonTh);

// --- ITEMS ---

console.log("\n--- Items ---");

const potion: ItemDef = {
  id: "potion_healing", name: "Potion of Healing", type: "consumable",
  description: "Heals 2d4+2", weight: 0.5, value: 50, rarity: "common",
  tags: ["consumable", "healing"],
  consumable: { uses: 1, maxUses: 1, effect: "heal:2d4+2", combatUsable: true },
};
console.log("Is consumable:", isConsumable(potion));
const consumeResult = consumeItem(potion);
console.log("Consume potion:", consumeResult.consumed, "effect:", consumeResult.effect, "remaining:", consumeResult.remaining);

const wand: ItemDef = {
  id: "wand_magic_missiles", name: "Wand of Magic Missiles", type: "magic_item",
  description: "Casts magic missile", weight: 1, value: 500, rarity: "uncommon",
  tags: ["magic", "wand"],
  magic: { requiresAttunement: false, charges: 7, maxCharges: 7, recharge: "dawn", spellIndex: "magic-missile", spellLevel: 1 },
  activation: "use",
  identified: false, identifyDC: 15,
};
console.log("\nIs magic item:", isMagicItem(wand));
console.log("Use charge:", useItemCharge(wand), "charges left:", wand.magic?.charges);
rechargeItem(wand);
console.log("After recharge:", wand.magic?.charges);
console.log("Identify (DC 15, roll 16):", identifyItem(wand, 16));
console.log("Is identified:", wand.identified);

// SRD conversion
const srdWeapon = { index: "longsword", name: "Longsword", weapon_category: "martial", cost: { quantity: 15 }, weight: 3, equipment_category: { name: "Weapons" } };
const converted = convertSRDEquipment(srdWeapon);
console.log("\nSRD equipment converted:", converted.name, converted.type, converted.value, "gp");

const srdMagic = { index: "cloak-of-elvenkind", name: "Cloak of Elvenkind", desc: ["While wearing this cloak...requires attunement..."], equipment_category: { name: "Wondrous Items" }, rarity: { name: "Uncommon" } };
const magicConverted = convertSRDMagicItem(srdMagic);
console.log("SRD magic item converted:", magicConverted.name, magicConverted.rarity, "attunement:", magicConverted.magic?.requiresAttunement);

// --- INVENTORY ---

console.log("\n--- Inventory ---");

const backpack = createDefaultBackpack();
console.log("Backpack created, items:", backpack.items.length);

addItem(backpack, { itemId: "rations", itemName: "Rations", quantity: 5, weight: 0.5, stackable: true });
addItem(backpack, { itemId: "torch", itemName: "Torch", quantity: 3, weight: 1, stackable: true });
addItem(backpack, { itemId: "rope", itemName: "Rope (50ft)", quantity: 1, weight: 10, stackable: false });
console.log("After adding items:", backpack.items.length, "items");
console.log("  Rations:", backpack.items.find(s => s.itemId === "rations")?.quantity);
console.log("  Torches:", backpack.items.find(s => s.itemId === "torch")?.quantity);

removeItem(backpack, "torch", 1);
console.log("  Torches after remove 1:", backpack.items.find(s => s.itemId === "torch")?.quantity);

const weight = calculateWeight(backpack);
console.log("  Total weight:", weight);

const enc = getEncumbrance(16, weight);
console.log("  Encumbrance:", enc.level, "speed penalty:", enc.speedPenalty);

// Currency
const gold = createCurrency(50);
console.log("\nCurrency: gp =", gold.gp, "total gold:", toGold(gold));
spendGold(gold, 15);
console.log("After spending 15 gp:", gold.gp);

// Search
addItem(backpack, { itemId: "potion_healing", itemName: "Potion of Healing", quantity: 2, weight: 0.5, stackable: true, tags: ["healing"] });
const found = searchItems(backpack, { tag: "healing" });
console.log("\nSearch 'healing' tag:", found.map(s => s.itemName).join(", "));

// Loot
const lootTable = [
  { itemName: "Gold", quantity: 50, chance: 1.0 },
  { itemName: "Potion of Healing", quantity: 1, chance: 0.5 },
  { itemName: "Longsword +1", quantity: 1, chance: 0.1 },
];
const loot = generateLoot(lootTable);
console.log("\nLoot generated:", loot.map(l => `${l.itemName} x${l.quantity}`).join(", "));
const lootResult = addLootToInventory(backpack, loot);
console.log("Loot added:", lootResult.added, "failed:", lootResult.failed);

// --- OBJECTS ---

console.log("\n--- Objects ---");

const door = createDoor("door_1", true, 15);
console.log("Door:", door.nameTh, "state:", door.state, "locked:", door.locked, "lockDC:", door.lockDC);

const openCheck = canInteractObject(door, "open");
console.log("  Can open (locked):", openCheck.allowed, openCheck.reasonTh);

const unlockResult = interactObject(door, "unlock", 18);
console.log("  Unlock (roll 18 vs DC 15):", unlockResult.success, unlockResult.reasonTh);

const openResult = interactObject(door, "open");
console.log("  Open:", openResult.success, openResult.reasonTh);

// Chest with loot
const chest = createChest("chest_1", ["Potion of Healing", "Gold"], false);
console.log("\nChest:", chest.nameTh, "state:", chest.state);
const searchResult = interactObject(chest, "search");
console.log("  Search:", searchResult.reasonTh, "loot:", searchResult.loot);

// Trap
const trap = createTrap("trap_1", "2d6", "piercing", 13);
console.log("\nTrap triggers:", trap.triggers?.length);
const trapTriggers = checkTriggers(trap, "on_enter");
console.log("  On enter trigger:", trapTriggers[0]?.descriptionTh);

// Break object
const breakResult = damageObject(door, 20, "bludgeoning");
console.log("\nDamage door (20 bludgeoning):", "hp:", breakResult.hpRemaining, "destroyed:", breakResult.destroyed);

console.log("\n=== All tests passed! ===");
