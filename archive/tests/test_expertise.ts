/**
 * Skill Modifier & Expertise Test — D&D 5e/2024 Compliant
 * Source: https://roll20.net/compendium/dnd5e/Ability%20Scores#content
 *
 * Expertise rules:
 *   - Proficiency Bonus (PB) = 2 + floor((level-1)/4) — Lv1-4: +2, Lv5-8: +3, etc.
 *   - Proficient skill = ability mod + PB
 *   - Expertise skill = ability mod + (PB × 2) — double proficiency
 *   - Expertise requires proficiency (can't have Expertise without being proficient)
 *
 * Test scenario from user:
 *   Dexterity 15 → DEX modifier = +2
 *   Expertise in Sleight of Hand
 *   Level 1-4 → PB = +2
 *   Expected modifier = DEX(+2) + Expertise(PB × 2 = +4) = +6
 *   Roll d20=17 → total = 17 + 6 = 23 (NOT 17 + 2 = 19)
 */
import assert from "assert";
import { mod, profByLevel, passivePerception, SKILLS, CLASSES } from "../src/lib/gameData";
import { skillCheckMod } from "../src/lib/rollResolver";

let pass = 0, fail = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e: any) { fail++; failures.push(`${name}: ${e.message}`); console.log(`  ✗ ${name} — ${e.message}`); }
}
function eq(actual: any, expected: any, msg?: string) {
  assert.strictEqual(actual, expected, msg ?? `expected ${expected}, got ${actual}`);
}
function ok(cond: boolean, msg?: string) {
  assert.ok(cond, msg);
}

console.log("=== Skill Modifier & Expertise Test ===\n");

// ============ PB FORMULA ============
console.log("1. Proficiency Bonus formula");
test("PB Lv.1 = +2", () => eq(profByLevel(1), 2));
test("PB Lv.4 = +2", () => eq(profByLevel(4), 2));
test("PB Lv.5 = +3", () => eq(profByLevel(5), 3));
test("PB Lv.8 = +3", () => eq(profByLevel(8), 3));
test("PB Lv.9 = +4", () => eq(profByLevel(9), 4));
test("PB Lv.12 = +4", () => eq(profByLevel(12), 4));
test("PB Lv.13 = +5", () => eq(profByLevel(13), 5));
test("PB Lv.16 = +5", () => eq(profByLevel(16), 5));
test("PB Lv.17 = +6", () => eq(profByLevel(17), 6));
test("PB Lv.20 = +6", () => eq(profByLevel(20), 6));

// ============ ABILITY MODIFIER FORMULA ============
console.log("\n2. Ability Modifier formula");
test("Score 8 = -1", () => eq(mod(8), -1));
test("Score 10 = 0", () => eq(mod(10), 0));
test("Score 11 = 0", () => eq(mod(11), 0));
test("Score 12 = +1", () => eq(mod(12), 1));
test("Score 13 = +1", () => eq(mod(13), 1));
test("Score 14 = +2", () => eq(mod(14), 2));
test("Score 15 = +2", () => eq(mod(15), 2));
test("Score 16 = +3", () => eq(mod(16), 3));
test("Score 20 = +5", () => eq(mod(20), 5));

// ============ USER SCENARIO: DEX 15, Expertise Sleight of Hand, Lv.1 ============
console.log("\n3. User Scenario: DEX 15 + Expertise Sleight of Hand + Lv.1");
test("DEX 15 → modifier +2", () => eq(mod(15), 2));
test("Lv.1 → PB +2", () => eq(profByLevel(1), 2));

// Simulate character: Rogue Lv.1, DEX 15, Expertise in Sleight of Hand
const rogue = {
  cls: "rogue",
  level: 1,
  abilities: { str: 10, dex: 15, con: 12, int: 10, wis: 10, cha: 10 },
  extraSkills: ["sleight_of_hand"], // proficient via class skill pick
  expertise: ["sleight_of_hand"],   // Expertise in Sleight of Hand
  worn: [],
};

test("Rogue can pick Sleight of Hand via extraSkills (D&D 5e: Rogue picks 4 from skill list)", () => {
  // Rogue class doesn't auto-grant Sleight of Hand — player must pick it
  // Verify the test character has it in extraSkills
  ok(rogue.extraSkills.includes("sleight_of_hand"), "test char should have Sleight of Hand in extraSkills");
});

// rollResolver.skillCheckMod
test("skillCheckMod(rogue, sleight_of_hand) = +6 (DEX+2 + PB×2 = +6)", () => {
  const m = skillCheckMod(rogue, "sleight_of_hand", CLASSES.rogue.skills, rogue.extraSkills);
  eq(m, 6, `expected +6, got ${m}`);
});

test("Roll d20=17 + modifier=+6 = 23 (NOT 19)", () => {
  const m = skillCheckMod(rogue, "sleight_of_hand", CLASSES.rogue.skills, rogue.extraSkills);
  const dieRoll = 17;
  const total = dieRoll + m;
  eq(total, 23, `expected 23 (17 + 6), got ${total}`);
});

test("Without Expertise, modifier = +4 (DEX+2 + PB+2 = +4)", () => {
  const rogueNoExp = { ...rogue, expertise: [] };
  const m = skillCheckMod(rogueNoExp, "sleight_of_hand", CLASSES.rogue.skills, rogueNoExp.extraSkills);
  eq(m, 4, `expected +4 (DEX+2 + PB+2), got ${m}`);
});

test("Without proficiency, modifier = +2 (DEX+2 only)", () => {
  const rogueNoProf = { ...rogue, extraSkills: [], expertise: [] };
  // Not in class skills AND not in extra skills — should be ability only
  // But rogue class skills include Sleight of Hand — so we need to override class skills too
  const m = skillCheckMod(rogueNoProf, "sleight_of_hand", [], []);
  eq(m, 2, `expected +2 (DEX only), got ${m}`);
});

// ============ PASSIVE PERCEPTION ============
console.log("\n4. Passive Perception (10 + WIS + PB + Expertise)");

test("Passive Perception without proficiency = 10 + WIS", () => {
  const fighter = {
    cls: "fighter", level: 1,
    abilities: { wis: 12 },
    extraSkills: [], expertise: [],
  };
  // Fighter class doesn't have Perception in default skills — but background may add
  // Without proficiency: 10 + 1 (WIS) = 11
  const pp = passivePerception(fighter);
  // Check if fighter has perception in skills
  const hasPerc = CLASSES.fighter.skills.includes("perception");
  if (hasPerc) {
    eq(pp, 13, "fighter has Perception → 10 + 1 (WIS) + 2 (PB) = 13");
  } else {
    eq(pp, 11, "fighter no Perception → 10 + 1 (WIS) = 11");
  }
});

test("Passive Perception with proficiency = 10 + WIS + PB", () => {
  // Rogue with Perception proficiency
  const rogueWithPerc = {
    cls: "rogue", level: 1,
    abilities: { wis: 14 }, // WIS mod +2
    extraSkills: ["perception"],
    expertise: [],
  };
  const pp = passivePerception(rogueWithPerc);
  // 10 + 2 (WIS) + 2 (PB) = 14
  eq(pp, 14, `expected 14, got ${pp}`);
});

test("Passive Perception with Expertise = 10 + WIS + (PB × 2)", () => {
  // Rogue with Expertise in Perception (Lv.1)
  const rogueExpertisePerc = {
    cls: "rogue", level: 1,
    abilities: { wis: 14 }, // WIS mod +2
    extraSkills: ["perception"],
    expertise: ["perception"],
  };
  const pp = passivePerception(rogueExpertisePerc);
  // 10 + 2 (WIS) + (2 × 2 = 4 Expertise) = 16
  eq(pp, 16, `expected 16 (10 + 2 WIS + 4 Expertise), got ${pp}`);
});

test("Passive Perception scales with PB at higher levels", () => {
  // Rogue Lv.5 with Perception + Expertise
  const rogue5 = {
    cls: "rogue", level: 5,
    abilities: { wis: 14 },
    extraSkills: ["perception"],
    expertise: ["perception"],
  };
  const pp = passivePerception(rogue5);
  // 10 + 2 (WIS) + (3 × 2 = 6 Expertise at Lv.5) = 18
  eq(pp, 18, `expected 18 (10 + 2 WIS + 6 Expertise at Lv.5), got ${pp}`);
});

// ============ EXPERTISE EDGE CASES ============
console.log("\n5. Expertise Edge Cases");

test("Expertise without proficiency should NOT apply (defensive)", () => {
  // Character claims Expertise in a skill they're not proficient in — should be ability only
  const badChar = {
    cls: "fighter", level: 1,
    abilities: { dex: 14 },
    extraSkills: [], // not proficient
    expertise: ["sleight_of_hand"], // but claims Expertise — invalid
  };
  // Fighter doesn't have Sleight of Hand in class skills
  const m = skillCheckMod(badChar, "sleight_of_hand", CLASSES.fighter.skills, badChar.extraSkills);
  // Should be ability only (DEX +2) — Expertise requires proficiency
  eq(m, 2, `expected +2 (DEX only — no prof, no Exp), got ${m}`);
});

test("Expertise at Lv.5 = PB × 2 = +6 (Lv.5 PB = +3)", () => {
  const rogue5 = {
    cls: "rogue", level: 5,
    abilities: { dex: 16 }, // DEX +3
    extraSkills: ["stealth"],
    expertise: ["stealth"],
  };
  const m = skillCheckMod(rogue5, "stealth", CLASSES.rogue.skills, rogue5.extraSkills);
  // 3 (DEX) + (3 × 2 = 6 Expertise) = 9
  eq(m, 9, `expected +9 (DEX 3 + Exp 6 at Lv.5), got ${m}`);
});

test("Expertise at Lv.17 = PB × 2 = +12 (Lv.17 PB = +6)", () => {
  const rogue17 = {
    cls: "rogue", level: 17,
    abilities: { dex: 20 }, // DEX +5
    extraSkills: ["stealth"],
    expertise: ["stealth"],
  };
  const m = skillCheckMod(rogue17, "stealth", CLASSES.rogue.skills, rogue17.extraSkills);
  // 5 (DEX) + (6 × 2 = 12 Expertise) = 17
  eq(m, 17, `expected +17 (DEX 5 + Exp 12 at Lv.17), got ${m}`);
});

// ============ SAVING THROWS (no Expertise — but check prof) ============
console.log("\n6. Saving Throw Proficiency");
test("Rogue proficient in DEX saves", () => {
  ok(CLASSES.rogue.saves.includes("dex"));
});
test("Rogue proficient in INT saves", () => {
  ok(CLASSES.rogue.saves.includes("int"));
});
test("Wizard proficient in INT + WIS saves", () => {
  ok(CLASSES.wizard.saves.includes("int"));
  ok(CLASSES.wizard.saves.includes("wis"));
});

// ============ SUMMARY ============
console.log(`\n=== SUMMARY ===`);
console.log(`✓ Passed: ${pass}`);
console.log(`✗ Failed: ${fail}`);
if (failures.length > 0) {
  console.log("\n--- FAILURES ---");
  for (const f of failures) console.log(`  ✗ ${f}`);
}
process.exit(fail > 0 ? 1 : 0);
