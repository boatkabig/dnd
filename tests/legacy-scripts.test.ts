// Runs the pre-existing domain smoke-test scripts under scripts/*.ts.
// Those scripts are standalone (they use their own pass/fail counters and
// call process.exit(1) on failure) rather than Vitest test() blocks, so each
// one is executed in its own child process via tsx. That keeps a script's
// process.exit() call from ever touching the Vitest process itself.
//
// scripts/test_api_e2e.ts is intentionally excluded: it makes HTTP calls
// against a running dev server on localhost:3000 and is not a unit test.
import { describe, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");

const SCRIPTS = [
  "scripts/test_dice.ts",
  "scripts/test_skills.ts",
  "scripts/test_combat.ts",
  "scripts/test_magic.ts",
  "scripts/test_roll_system.ts",
  "scripts/test_dungeon_system.ts",
  "scripts/test_half_caster_slots.ts",
  "scripts/test_dm_schema.ts",
  "scripts/test_dnd_2024_compliance.ts",
  "scripts/test_engine_wiring.ts",
  "scripts/test_vision.ts",
];

describe.each(SCRIPTS)("legacy script: %s", (script) => {
  it("runs and exits 0", () => {
    try {
      execFileSync(process.execPath, [TSX_CLI, script], {
        cwd: ROOT,
        stdio: "pipe",
      });
    } catch (err: any) {
      const output = [err.stdout, err.stderr]
        .filter(Boolean)
        .map(String)
        .join("\n");
      throw new Error(`${script} failed:\n${output || err.message}`);
    }
  });
});
