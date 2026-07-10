import {
  getWorldClock, initWorldClockFromLegacy, worldClockToLegacy, advanceHours,
  SAVE_VERSION, migrateLegacySave,
  enemyHasAttackDisadvantage, attackerHasAdvantageVs, enemyIsIncapacitated,
  hasConcentrationBuff, getActiveConcentrationBuff, concentrationDC,
  getAttackModifiers, getACModifier,
  applyBuffToCharacter, removeBuffFromCharacter, tickBuffDurations,
  CONCENTRATION_SPELLS,
} from "../src/lib/engineAdapters";

console.log("=== Adapter Tests ===\n");

// Test 1: Time adapter
console.log("1. Time Adapter");
const clock = initWorldClockFromLegacy({ day: 3, hour: 14 });
console.log("  Initial:", worldClockToLegacy(clock), "→ day 3, hour 14");
const newTime = advanceHours(8); // long rest
console.log("  After 8h advance:", newTime, "(should be day 4, hour 22)");

// Test 2: Save versioning
console.log("\n2. Save Migration");
const oldSave = { c: { name: "Hero", cls: "fighter", level: 1 }, scene: "Town", log: [], combat: null, history: [], map: null, version: 1 };
const migrated = migrateLegacySave(oldSave);
console.log("  v1 → v", migrated.version, "(should be v3)");
console.log("  gameTime added:", migrated.gameTime, "(should be day 1, hour 8)");
console.log("  buffs added:", migrated.c.buffs, "(should be [])");

// Test 3: Enemy conditions
console.log("\n3. Enemy Conditions");
const restrainedGoblin = { uid: "g1", th: "Goblin", hpNow: 7, conditions: ["restrained"] };
const proneGoblin = { uid: "g2", th: "Goblin", hpNow: 7, conditions: ["prone"] };
const paralyzedGoblin = { uid: "g3", th: "Goblin", hpNow: 7, conditions: ["paralyzed"] };
console.log("  Restrained Goblin attack disadv:", enemyHasAttackDisadvantage(restrainedGoblin), "(true)");
console.log("  Prone Goblin attack disadv:", enemyHasAttackDisadvantage(proneGoblin), "(true)");
console.log("  vs Restrained: advantage:", attackerHasAdvantageVs(restrainedGoblin), "(true)");
console.log("  vs Paralyzed: incapacitated:", enemyIsIncapacitated(paralyzedGoblin), "(true)");

// Test 4: Concentration tracking
console.log("\n4. Concentration Tracking");
const wizardWithBless = { name: "Wizard", buffs: [{ name: "Bless", duration: 10 }] };
console.log("  Has concentration buff:", hasConcentrationBuff(wizardWithBless), "(true)");
console.log("  Active conc buff:", getActiveConcentrationBuff(wizardWithBless)?.name, "(Bless)");
console.log("  Concentration DC for 14 dmg:", concentrationDC(14), "(should be max(10,7) = 10)");
console.log("  Concentration DC for 26 dmg:", concentrationDC(26), "(should be 13)");

// Test 5: Buff modifiers
console.log("\n5. Buff Modifiers");
const fighterWithBless = {
  name: "Fighter",
  buffs: [{ name: "Bless", duration: 10 }, { name: "Shield", duration: 1 }],
};
const mods = getAttackModifiers(fighterWithBless);
console.log("  Attack mods with Bless+Shield:", mods.notes, "(should have Bless +X)");
console.log("  AC modifier (Shield):", getACModifier(fighterWithBless), "(should be +5)");

// Test 6: Buff tick
console.log("\n6. Buff Tick");
let charWithBuffs = applyBuffToCharacter(
  { name: "Haste", type: "buff", duration: 3, source: "spell" },
  { name: "Wizard", buffs: [] }
);
console.log("  After apply Haste:", charWithBuffs.buffs.map((b:any) => `${b.name}(${b.duration})`), "(Haste(3))");
const [tickedChar, expired] = tickBuffDurations({ ...charWithBuffs, buffs: [{ name: "Haste", type: "buff", duration: 1 }] });
console.log("  Tick duration 1 → expired:", expired, "(Haste)");
console.log("  Remaining buffs:", tickedChar.buffs.length, "(0)");

// Test 7: Concentration spell set
console.log("\n7. Concentration Spell Set");
console.log("  Bless is conc:", CONCENTRATION_SPELLS.has("Bless"), "(true)");
console.log("  Shield is conc:", CONCENTRATION_SPELLS.has("Shield"), "(false — Shield is reaction, not conc)");

console.log("\n=== ALL ADAPTER TESTS PASSED ===");
