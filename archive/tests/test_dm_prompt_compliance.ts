/**
 * DM System Prompt Compliance Test — D&D 2024 Rules Reference
 * Verifies that buildSystemPrompt() includes all the corrected 2024 rules.
 */
import assert from "assert";

// We can't directly import buildSystemPrompt (it's not exported) — instead
// read the source file and verify the rules are present.

import * as fs from "fs";
import * as path from "path";

const DnDSoloSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "components", "DnDSolo.tsx"),
  "utf-8",
);

// Extract just the buildSystemPrompt function content
const startIdx = DnDSoloSource.indexOf("function buildSystemPrompt(");
const endIdx = DnDSoloSource.indexOf("\n}\n", startIdx);
const promptFn = DnDSoloSource.slice(startIdx, endIdx + 2);

let pass = 0, fail = 0;
const failures: string[] = [];

function test(name: string, cond: boolean, msg?: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}: ${msg || "condition failed"}`);
    console.log(`  ✗ ${name} — ${msg || "failed"}`);
  }
}

console.log("=== DM System Prompt D&D 2024 Compliance ===\n");

// Required rules that must appear in the DM system prompt
const required2024Rules = [
  // Critical Hit
  { name: "Critical Hit: double ALL dice (not weapon dice only)", pattern: /double ALL damage dice|ALL damage dice/i },
  { name: "Critical Hit: includes Sneak Attack", pattern: /Sneak Attack/i },
  { name: "Critical Hit: includes Smite", pattern: /Smite/i },
  { name: "Critical Hit: includes Hex / Hunter's Mark", pattern: /Hex.*Hunter's Mark|Hunter's Mark.*Hex/i },

  // Weapon Mastery
  { name: "Weapon Mastery: 8 masteries", pattern: /8\s+ชนิด|8 ชนิด/i },
  { name: "Weapon Mastery: Flex dropped", pattern: /Flex dropped|Flex.*dropped/i },

  // Surprise
  { name: "Surprise: Disadvantage on Initiative (not skip turn)", pattern: /Surprise.*Initiative|Initiative.*เสียเปรียบ/i },

  // Grapple/Shove
  { name: "Grapple: STR/DEX save (not contested)", pattern: /STR.*DEX save|save.*DC = 8/i },

  // Concentration
  { name: "Concentration DC cap 30", pattern: /capped at 30|cap 30/i },

  // Long Rest
  { name: "Long Rest: recover ALL Hit Dice", pattern: /คืน Hit Dice ทั้งหมด|recover ALL/i },
  { name: "Long Rest: 16h between rests", pattern: /16 ชม|16h/i },

  // Short Rest
  { name: "Short Rest: 1 hour + Hit Dice", pattern: /Short Rest.*1 ชม|1 ชม.*Hit Dice/i },
  { name: "Rest interruption: damage cancels", pattern: /combat\/spell\/damage/i },

  // Exhaustion
  { name: "Exhaustion: -2/level D20 + -5 ft/level Speed", pattern: /-2\/level|-5 ft\/level/i },

  // Encounter Difficulty
  { name: "Encounter Difficulty: Low/Moderate/High", pattern: /Low.*Moderate.*High/i },
  { name: "Encounter XP: flat (no multiplier)", pattern: /flat XP|ไม่มี multiplier/i },

  // Healing Spells
  { name: "Healing Word: 2d4 (2024 buff)", pattern: /Healing Word.*2d4|2d4.*Healing Word/i },
  { name: "Cure Wounds: 2d8 (2024 buff)", pattern: /Cure Wounds.*2d8|2d8.*Cure Wounds/i },

  // Counterspell
  { name: "Counterspell: CON save", pattern: /Counterspell.*CON save|CON save.*Counterspell/i },

  // Origin Feats
  { name: "Origin Feats: 10 official", pattern: /10 ตัว|10 official/i },
  { name: "Origin Feats: tavern_brawler included", pattern: /Tavern Brawler/i },
  { name: "Origin Feats: uses PB", pattern: /ใช้ PB|Proficiency Bonus/i },

  // Species
  { name: "Species: no ASI bonus (moved to Background)", pattern: /ไม่ให้ ability score bonus|ย้ายไป Background/i },

  // Tool + Skill
  { name: "Tool + Skill = Advantage", pattern: /Tool.*Skill.*Advantage|Advantage.*Tool/i },

  // Influence Action
  { name: "Influence Action: Hesitant + DC 15/INT", pattern: /Hesitant.*DC|max\(15.*INT/i },

  // General 2024 reference
  { name: "References D&D 2024", pattern: /D&D 2024|D&D 2024 Rules/i },
];

for (const rule of required2024Rules) {
  test(rule.name, rule.pattern.test(promptFn), `pattern not found in buildSystemPrompt`);
}

// Also verify NO leftover 5e references that should be removed
const forbidden5eReferences = [
  { name: "No 'weapon dice only' comment (was incorrect)", pattern: /weapon dice only/i },
  { name: "No Flex mastery as weapon property (Flex dropped — only mention 'Flex dropped' as note)", pattern: /mastery.*[=:].*["']flex["']/i },
  { name: "No 'easy/medium/hard/deadly' difficulty tiers (2024 uses Low/Moderate/High)", pattern: /trivial.*easy.*medium.*hard.*deadly/i },
  { name: "No '6 deadly encounters' (2024 removed adventuring day)", pattern: /6 deadly encounters/i },
  { name: "No species ASI bonus in RACES (moved to Background)", pattern: /human.*bonus.*str.*1.*dex.*1/i },
];

for (const ref of forbidden5eReferences) {
  // We want these to NOT be in the prompt
  test(ref.name, !ref.pattern.test(promptFn), "forbidden 5e reference still present");
}

console.log(`\n=== SUMMARY ===`);
console.log(`✓ Passed: ${pass}`);
console.log(`✗ Failed: ${fail}`);
if (failures.length > 0) {
  console.log("\n--- FAILURES ---");
  for (const f of failures) {
    console.log(`  ✗ ${f}`);
  }
}
process.exit(fail > 0 ? 1 : 0);
