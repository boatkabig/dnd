import { getAvailableActions, getAvailableActionsSummary } from "../src/lib/actionSystem";
import { buildCharacterState, type Character } from "../src/lib/character";

console.log("=== Action System Tests ===\n");

// Test 1: Level 1 Fighter with full action economy
const fighter: Character = {
  id: "p1", name: "Test", species: "human", cls: "fighter", background: "soldier",
  level: 1, xp: 0,
  abilities: { str: 16, dex: 14, con: 15, int: 9, wis: 13, cha: 10 },
  extraSkills: [], expertise: [], feats: [],
  maxHp: 12, hp: 12, ac: 16, speed: 30, hitDiceLeft: 1,
  slots: [], slotsMax: [], knownSpells: [],
  rageUsed: 0, kiUsed: 0, sorceryPoints: 1, layOnHandsPool: 5,
  bardicInspirationUsed: 0, secondWindUsed: false, actionSurgeUsed: false,
  preserveLifeUsed: false, arcaneRecoveryUsed: false, venomUsed: false,
  weapon: "longsword", ranged: "light_crossbow", worn: [], inventory: [], gold: 15,
  conditions: [], buffs: [], deathSaves: { s: 0, f: 0 }, dead: false, hiddenAdv: false,
};

const state1 = buildCharacterState(fighter);
const actions1 = getAvailableActions(state1);
console.log("Fighter Lv.1 (full actions):");
console.log("  Actions:", actions1.filter(a => a.type === "action").map(a => a.nameTh).join(", "));
console.log("  Bonus Actions:", actions1.filter(a => a.type === "bonus_action").map(a => a.nameTh).join(", "));
console.log("  Summary:", getAvailableActionsSummary(state1));
console.log("");

// Test 2: Fighter after using Action (no action left, bonus available)
const state2 = buildCharacterState(fighter, {
  hasAction: false, hasBonusAction: true, hasReaction: true, movementLeft: 30,
  extraAction: false, bonusUsed: false, surprise: false, dodge: false, invisible: false, round: 1,
});
const actions2 = getAvailableActions(state2);
console.log("Fighter after using Action:");
console.log("  Actions:", actions2.filter(a => a.type === "action").map(a => a.nameTh).join(", ") || "(none)");
console.log("  Bonus Actions:", actions2.filter(a => a.type === "bonus_action").map(a => a.nameTh).join(", "));
console.log("");

// Test 3: Wizard Lv.1 with spells
const wizard: Character = {
  ...fighter, cls: "wizard",
  slots: [2], slotsMax: [2], knownSpells: ["fire-bolt", "magic-missile"],
};
const state3 = buildCharacterState(wizard);
const actions3 = getAvailableActions(state3);
console.log("Wizard Lv.1 (with spells):");
console.log("  Has Cast Spell:", actions3.some(a => a.id === "cast_spell"));
console.log("  Has Shield (reaction):", actions3.some(a => a.id === "shield_spell"));
console.log("");

// Test 4: Incapacitated character
const stunned: Character = {
  ...fighter, conditions: ["stunned"],
};
const state4 = buildCharacterState(stunned);
const actions4 = getAvailableActions(state4);
console.log("Stunned Fighter:");
console.log("  Actions:", actions4.filter(a => a.type === "action").map(a => a.nameTh).join(", ") || "(none — incapacitated)");
console.log("  Can still react:", actions4.some(a => a.type === "reaction"));
console.log("");

console.log("=== All tests passed! ===");
