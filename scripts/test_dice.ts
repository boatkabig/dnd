import { roll, rollD20, rollDamage, rollContest, rollSimple, parseExpression } from "../src/lib/diceEngine";

console.log("=== Dice Engine Tests ===");

const r1 = rollSimple("2d6+3");
console.log("2d6+3:", r1.total, "rolls:", r1.rolls);

const r2 = rollD20(5, "advantage");
console.log("d20+5 adv: die=" + r2.die + " dropped=" + r2.other + " total=" + r2.total + " crit=" + r2.isCrit);

const r3 = rollD20(3, "disadvantage");
console.log("d20+3 dis: die=" + r3.die + " dropped=" + r3.other + " total=" + r3.total);

const r4 = rollDamage("1d8+3", true);
console.log("Crit 1d8+3: total=" + r4.total + " history=" + r4.history);

const r5 = rollD20(5, "none", { bonusDice: ["1d4"] });
console.log("d20+5 Bless: total=" + r5.total + " history=" + r5.result?.history);

const r6 = rollD20(5, "none", { penaltyDice: ["1d4"] });
console.log("d20+5 Bane: total=" + r6.total + " history=" + r6.result?.history);

const r7 = rollD20(5, "none", { advantage: true, disadvantage: true });
console.log("d20+5 both cancel: die=" + r7.die + " total=" + r7.total);

const r8 = rollContest(5, 3);
console.log("Contest: " + r8.totalA + " vs " + r8.totalB + " winner=" + r8.winner);

const terms = parseExpression("2d20kh1+5");
console.log("Parsed: " + terms.length + " terms keepHigh=" + terms[0].keepHigh);

console.log("=== Done ===");
