/**
 * D&D 2024 Compliance Smoke Test
 * Verifies that the engine implements the corrected 2024 rules correctly.
 */
import {
  SOLO_DIFFICULTY_THRESHOLDS,
  calculateDifficulty,
  getDifficultyThresholds,
  encounterMultiplier,
  suggestedCR,
} from "../src/lib/encounter";
import {
  recoverHitDice,
  createHitDicePool,
  canRest,
  checkInterruption,
} from "../src/lib/engine/rest";
import { concentrationCheckDC } from "../src/lib/engine/effects";
import { concentrationCheckDC as magicConcDC } from "../src/lib/engine/magic";
import { resolveContestedAction } from "../src/lib/engine/combat";
import { influenceDC, resolveInfluence } from "../src/lib/social";
import { exhaustionPenalty, exhaustionSpeedPenalty } from "../src/lib/gameData";
import { WEAPONS, WEAPON_MASTERIES, ORIGIN_FEATS } from "../src/lib/gameData";

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra: string = "") {
  if (cond) { pass++; console.log(`✓ ${label}`); }
  else { fail++; console.log(`✗ ${label}${extra ? " — " + extra : ""}`); }
}

console.log("=== D&D 2024 Compliance Smoke Test ===\n");

// 1. Encounter difficulty uses 3 tiers (low/moderate/high) + 2 informal (trivial/impossible)
console.log("1. Encounter Difficulty (D&D 2024: Low/Moderate/High)");
const t1 = getDifficultyThresholds(1);
check("Lv1 Low = 50 (2024 official)", t1.low === 50, `got ${t1.low}`);
check("Lv1 Moderate = 75 (2024 official)", t1.moderate === 75, `got ${t1.moderate}`);
check("Lv1 High = 100 (2024 official)", t1.high === 100, `got ${t1.high}`);
check("Encounter multiplier removed (=1)", encounterMultiplier(5, true) === 1);
const d1 = calculateDifficulty(80, 3, 1, 1); // 80 XP vs Lv1 solo
check("80 XP at Lv1 = moderate", d1 === "moderate", `got ${d1}`);

// 2. Long Rest: recover ALL Hit Dice (2024 change)
console.log("\n2. Long Rest — Recover ALL Hit Dice (D&D 2024)");
const pool = createHitDicePool([{ level: 5, hitDie: 8 }]); // 5d8 Hit Dice
pool.totalCurrent = 2; // only 2 left (3 spent)
const recovered = recoverHitDice(pool);
check("Long Rest recovers ALL HD (2024)", recovered.totalCurrent === 5, `got ${recovered.totalCurrent}`);

// 3. Long Rest frequency: 16 hours (not 24)
console.log("\n3. Long Rest Frequency — 16h between rests (D&D 2024)");
const canRestAfter15h = canRest("long_rest", { isSafe: true, isComfortable: true, weather: "clear", hasHostilesNearby: false }, 15);
check("Cannot Long Rest 15h after previous", canRestAfter15h.valid === false);
const canRestAfter17h = canRest("long_rest", { isSafe: true, isComfortable: true, weather: "clear", hasHostilesNearby: false }, 17);
check("Can Long Rest 17h after previous", canRestAfter17h.valid === true);

// 4. Rest interruption: damage_taken hard-interrupts (2024 NEW)
console.log("\n4. Rest Interruption — Damage taken cancels (D&D 2024 NEW)");
const shortInterruptDmg = checkInterruption("short_rest", "damage_taken", 5, 0);
check("Short Rest cancelled by damage", shortInterruptDmg.cancelsRest === true);
const longInterruptDmg = checkInterruption("long_rest", "damage_taken", 90, 0);
check("Long Rest cancelled by damage + grants Short Rest benefits (≥1hr)",
  longInterruptDmg.cancelsRest && longInterruptDmg.grantsShortRestBenefitsInstead);

// 5. Concentration DC capped at 30
console.log("\n5. Concentration DC — Cap 30 (D&D 2024)");
check("Conc DC for 20 dmg = 10", concentrationCheckDC(20) === 10);
check("Conc DC for 30 dmg = 15", concentrationCheckDC(30) === 15);
check("Conc DC for 60 dmg = 30", concentrationCheckDC(60) === 30);
check("Conc DC for 100 dmg = 30 (capped)", concentrationCheckDC(100) === 30);
check("Magic module also caps at 30", magicConcDC(100) === 30);

// 6. Grapple/Shove uses STR/DEX save DC = 8 + STR + PB (not contested)
console.log("\n6. Grapple/Shove — STR/DEX save DC 8+STR+PB (D&D 2024)");
const grappleResult = resolveContestedAction({
  type: "grapple",
  attackerId: "p1", targetId: "goblin1",
  attackerAthleticsMod: 3, // STR +3
  attackerProficiencyBonus: 2, // PB +2
  targetDefenseMod: 1, // STR save +1
  targetDexSaveMod: 2, // DEX save +2 (defender picks better)
});
check("Grapple DC = 8 + STR(3) + PB(2) = 13", grappleResult.saveDC === 13, `got ${grappleResult.saveDC}`);
check("Grapple target uses best save (DEX 2)", grappleResult.targetTotal >= 2);

// 7. Influence Action: DC = max(15, target's Int score)
console.log("\n7. Influence Action — DC max(15, INT score) (D&D 2024)");
check("Influence DC for Int 8 NPC = 15", influenceDC(8) === 15);
check("Influence DC for Int 10 NPC = 15", influenceDC(10) === 15);
check("Influence DC for Int 16 NPC = 16", influenceDC(16) === 16);
check("Influence DC for Int 20 NPC = 20", influenceDC(20) === 20);
// Auto-success case
const auto = resolveInfluence(true, false, false, 0, 10);
check("Reasonable request = auto success", auto.outcome === "auto_success" && auto.rolled === false);
// Auto-fail case
const refuse = resolveInfluence(false, true, false, 0, 10);
check("Repugnant request = auto fail", refuse.outcome === "auto_fail" && refuse.rolled === false);
// Hesitant case
const hesitant = resolveInfluence(false, false, true, 18, 10);
check("Hesitant + roll 18 ≥ DC 15 = success", hesitant.outcome === "success");

// 8. Exhaustion: -2/level D20 Test + -5 ft/level Speed
console.log("\n8. Exhaustion — -2/level D20 + -5 ft/level Speed (D&D 2024)");
check("Exhaustion Lv1 = -2 D20", exhaustionPenalty(1) === 2);
check("Exhaustion Lv3 = -6 D20", exhaustionPenalty(3) === 6);
check("Exhaustion Lv5 = -10 D20", exhaustionPenalty(5) === 10);
check("Exhaustion Speed Lv1 = -5 ft", exhaustionSpeedPenalty(1) === 5);
check("Exhaustion Speed Lv3 = -15 ft", exhaustionSpeedPenalty(3) === 15);
check("Exhaustion Speed Lv5 = -25 ft", exhaustionSpeedPenalty(5) === 25);

// 9. Weapon Mastery: 8 masteries (Flex dropped)
console.log("\n9. Weapon Mastery — 8 official masteries (Flex dropped)");
const masteryKeys = Object.keys(WEAPON_MASTERIES);
check("Exactly 8 masteries", masteryKeys.length === 8, `got ${masteryKeys.length}: ${masteryKeys.join(",")}`);
check("No Flex mastery", !("flex" in WEAPON_MASTERIES));
check("Has all 8: Cleave/Graze/Nick/Push/Sap/Slow/Topple/Vex",
  ["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"].every(m => m in WEAPON_MASTERIES));
check("Longsword mastery is 'sap' (not flex)", WEAPONS.longsword.mastery === "sap");
check("Quarterstaff mastery is 'topple' (not flex)", WEAPONS.quarterstaff.mastery === "topple");

// 10. Origin Feats: 10 official (uses PB not fixed numbers)
console.log("\n10. Origin Feats — 10 official (PB-based)");
const featKeys = Object.keys(ORIGIN_FEATS);
check("10 Origin Feats", featKeys.length === 10, `got ${featKeys.length}`);
check("Has tavern_brawler", "tavern_brawler" in ORIGIN_FEATS);
check("Alert uses PB (not +5)", ORIGIN_FEATS.alert.description.includes("Proficiency Bonus"));
check("Lucky uses PB (not 3)", ORIGIN_FEATS.lucky.description.includes("Proficiency Bonus"));
check("Savage Attacker rolls twice (not reroll)", ORIGIN_FEATS.savage_attacker.description.includes("twice"));

// 11. Species: no ability score bonuses (moved to Background)
console.log("\n11. Species — No ability score bonuses (D&D 2024)");
check("Human bonus is empty {}", Object.keys(WEAPONS).length > 0 && JSON.stringify(require("../src/lib/gameData").RACES.human.bonus) === "{}");
check("Elf bonus is empty {}", JSON.stringify(require("../src/lib/gameData").RACES.elf.bonus) === "{}");

// Summary
console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.error("❌ Some 2024 compliance checks failed");
  process.exit(1);
} else {
  console.log("✅ All D&D 2024 compliance checks passed!");
}
