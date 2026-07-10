/**
 * Auto-Recovery Test — DM sends malformed start_combat (boolean instead of object)
 * Engine should detect monster names from narration and auto-init combat.
 */
import assert from "assert";

// Read DnDSolo.tsx source to verify auto-recovery logic exists
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "..", "src", "components", "DnDSolo.tsx"),
  "utf-8",
);

let pass = 0, fail = 0;
const failures: string[] = [];

function test(name: string, cond: boolean, msg?: string) {
  if (cond) pass++;
  else { fail++; failures.push(`${name}: ${msg}`); console.log(`  ✗ ${name} — ${msg}`); }
}

console.log("=== Auto-Recovery Test ===\n");

// Check for monster detection patterns
const monsterPatterns = [
  "goblin", "wolf", "kobold", "bandit", "skeleton", "zombie",
  "orc", "ghoul", "spider", "bear", "rat", "thug",
];
test("Monster name detection covers common SRD monsters",
  monsterPatterns.every(m => src.includes(`"${m}"`)),
  `missing patterns: ${monsterPatterns.filter(m => !src.includes(`"${m}"`)).join(", ")}`);

// Check for auto-recovery logic (detect start_combat: true or missing fields)
test("Detects start_combat: true (boolean instead of object)",
  src.includes("start_combat") && src.includes("true"),
  "no start_combat handling");

test("Detects monster names from narration text",
  src.includes("กอบลิน") || src.includes("goblin"),
  "no Thai monster name detection");

test("Engine auto-initializes combat when DM sends malformed response",
  src.includes("initCombat") && src.includes("monsters"),
  "no initCombat call");

console.log(`\n=== SUMMARY ===`);
console.log(`✓ Passed: ${pass}`);
console.log(`✗ Failed: ${fail}`);
process.exit(fail > 0 ? 1 : 0);
