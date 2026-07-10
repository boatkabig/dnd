import {
  rollAbilityCheck, rollSkillCheck, rollFlexibleCheck, rollSavingThrow,
  passiveScore, rollContestedCheck, rollGroupCheck, applyHelp, rollToolCheck,
  rollImprovisedCheck, analyzeIntent, DC_TIERS, proficiencyBonus,
  type ProficiencyLevel,
} from "../src/lib/skills";

console.log("=== Skills System Tests ===\n");

// 5.1 Ability Check
const ac = rollAbilityCheck(16, 15, "none", 1);
console.log("Ability Check (STR 16, DC 15):", ac.die, "+", ac.modifier, "=", ac.total, "→", ac.isSuccess ? "สำเร็จ" : "ล้มเหลว");

// 5.2 Skill Check
const sc = rollSkillCheck(16, "athletics", 13, "proficient", 1);
console.log("Skill Check (Athletics, STR 16, proficient, DC 13):", sc.die, "+", sc.modifier, "=", sc.total, "→", sc.isSuccess ? "สำเร็จ" : "ล้มเหลว");

// Flexible: STR (Intimidation)
const fc = rollFlexibleCheck(16, "intimidation", 13, "proficient", 3);
console.log("Flexible: STR (Intimidation) DC 13:", fc.die, "+", fc.modifier, "=", fc.total, "→", fc.isSuccess ? "สำเร็จ" : "ล้มเหลว");

// 5.3 Saving Throw
const sv = rollSavingThrow(14, true, 3, 15);
console.log("Saving Throw (DEX 14, proficient, Lv.3, DC 15):", sv.die, "+", sv.modifier, "=", sv.total, "→", sv.isSuccess ? "สำเร็จ" : "ล้มเหลว");

// 5.4 Passive Check
const pp = passiveScore(14, "proficient", 1);
console.log("Passive Perception (WIS 14, proficient, Lv.1):", pp);

const pp2 = passiveScore(16, "expertise", 5);
console.log("Passive Perception (WIS 16, expertise, Lv.5):", pp2);

// 5.5 Contested Check
const cc = rollContestedCheck(5, {}, 3, {});
console.log("Contested (A:+5 vs B:+3):", cc.contestedResult.totalA, "vs", cc.contestedResult.totalB, "→ winner:", cc.contestedResult.winner);

// 5.6 Group Check
const gc = rollGroupCheck([
  { modifier: 5 }, { modifier: 3 }, { modifier: 2 },
], 12);
console.log("Group Check (3 members, DC 12):", gc.groupResult.successes, "success,", gc.groupResult.failures, "fail →", gc.groupResult.groupSuccess ? "กลุ่มสำเร็จ" : "กลุ่มล้มเหลว");

// 5.7 Help
const helped = applyHelp({ disadvantage: false });
console.log("Help action → advantage:", helped.advantage);

// 5.8 Tool Check
const tc = rollToolCheck(14, true, 1, 12);
console.log("Tool Check (DEX 14, proficient, DC 12):", tc.die, "+", tc.modifier, "=", tc.total, "→", tc.isSuccess ? "สำเร็จ" : "ล้มเหลว");

// 5.9 Improvised: CON (Intimidation) — staring contest
const ic = rollImprovisedCheck(16, "con", "intimidation", 13, "proficient", 3);
console.log("Improvised CON (Intimidation):", ic.intent, "→", ic.die, "+", ic.modifier, "=", ic.total, "→", ic.isSuccess ? "สำเร็จ" : "ล้มเหลว");

// Intent Analysis
console.log("\n--- Intent Analysis ---");
const intents = [
  "ฉันแอบเดินผ่านยาม",
  "ฉันพังประตูด้วยขวาน",
  "ฉันวิเคราะห์อักษรโบราณ",
  "ฉันใช้กำลังข่มขู่ทหารยาม",
  "ฉันหลบกับดัก",
];
for (const intent of intents) {
  const analysis = analyzeIntent(intent, 13);
  console.log(`"${intent}" → ${analysis.descriptionTh} [type: ${analysis.checkType}]`);
}

// DC Tiers
console.log("\n--- DC Tiers ---");
Object.entries(DC_TIERS).forEach(([key, tier]) => {
  console.log(`  ${key}: DC ${tier.dc} (${tier.nameTh})`);
});

// Proficiency levels
console.log("\n--- Proficiency (Lv.5) ---");
(["none", "half", "proficient", "expertise"] as ProficiencyLevel[]).forEach((pl) => {
  console.log(`  ${pl}: +${proficiencyBonus(5, pl)}`);
});

console.log("\n=== All tests passed! ===");
