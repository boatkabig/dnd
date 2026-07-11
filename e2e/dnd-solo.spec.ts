import { test, expect, type Page, type Locator } from "@playwright/test";
import { mockDm, mockIntent, type MockDmResponse } from "./mock-dm";

/**
 * Smoke test for the DnDSolo monolith (src/components/DnDSolo.tsx). This is a
 * regression net for "renders but does nothing" bugs across the upcoming
 * refactor — every assertion below checks user-visible rendered output
 * (visible text, visible HP numbers, visible screens), never internal
 * component state/props.
 *
 * Contract deviation discovered while building this suite (see report):
 * the OPENING /api/dm call made by startNewGame() does NOT honor
 * `start_combat` — only the follow-up call made by submitAction() does.
 * So reaching combat requires: (1) Start Adventure → opening narration,
 * then (2) submit one free-text action → narration + start_combat.
 *
 * Also: melee attacks whiff for a range reason unrelated to the to-hit
 * roll — the player token spawns several grid squares from the enemies,
 * outside a normal melee weapon's reach. The fighter's ranged weapon
 * (Light Crossbow, normal range 80 ft / 16 squares) always reaches, so
 * both combat tests use the "🏹 ยิง" (ranged attack) button instead of
 * melee "⚔️ โจมตี".
 */

const OPENING_NARRATION = "E2E_OPENING_NARRATION_the_tavern_creaks_softly";
const COMBAT_NARRATION = "E2E_COMBAT_NARRATION_goblins_leap_from_the_brush";

const OPENING_RESPONSE: MockDmResponse = {
  narration: OPENING_NARRATION,
  scene: "จุดเริ่มต้น",
};

const TWO_GOBLIN_COMBAT_RESPONSE: MockDmResponse = {
  narration: COMBAT_NARRATION,
  scene: "จุดเริ่มต้น",
  start_combat: { monsters: ["goblin", "goblin"] },
};

// D&D 2024 surprise: the surprised side has DISADVANTAGE on its Initiative
// roll only — it does NOT lose or skip its turn. Two goblins (not one) so a
// single player attack can never wipe the whole encounter before the enemy
// phase runs — one goblin always survives to prove it still acts.
const SURPRISE_NARRATION = "E2E_SURPRISE_NARRATION_you_catch_the_goblins_off_guard";

const SURPRISE_TWO_GOBLIN_COMBAT_RESPONSE: MockDmResponse = {
  narration: SURPRISE_NARRATION,
  scene: "จุดเริ่มต้น",
  start_combat: { monsters: ["goblin", "goblin"], surprise: true },
};

// One heading per ccStep (0-9) — used to confirm each step actually
// rendered before advancing, so the loop below can't silently race ahead
// of a still-in-flight React re-render.
const STEP_HEADINGS = [
  "ขั้นตอนที่ 1: คอนเซ็ปต์ตัวละคร",
  "ขั้นตอนที่ 2: เลือกอาชีพ (Class)",
  "ขั้นตอนที่ 3: เลือกเผ่าพันธุ์ (Species)",
  "ขั้นตอนที่ 4: เลือกภูมิหลัง (Background) + Origin Feat",
  "ขั้นตอนที่ 5: กำหนด Ability Scores (รวม ASI จาก Background)",
  "ขั้นตอนที่ 6: เลือกสกิล (Skill Proficiency)",
  "ขั้นตอนที่ 7: เลือกอุปกรณ์เริ่มต้น",
  "ขั้นตอนที่ 8: เลือกเวทมนตร์",
  "ขั้นตอนที่ 9: เลือก Alignment และภาษา",
  "ขั้นตอนที่ 10: บุคลิก/ลักษณะ และรายละเอียด",
];

/** Drives real character creation UI through all 11 steps (ccStep 0-10). */
async function createCharacterThroughAllSteps(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "✦ เริ่มแคมเปญใหม่" }).click();

  // Step 0 (concept): only the name field gates nothing, but we fill it
  // since the final "Start Adventure" button is disabled without a name.
  await page.getByPlaceholder("ชื่อตัวละคร...").fill(name);

  // Steps 0 → 9: all defaults (class/race/background/abilities/etc.) are
  // already valid, so "ถัดไป →" is never disabled. We assert each step's
  // heading is actually on screen (auto-retrying) before clicking "Next",
  // so the loop can't outrun a still-in-flight re-render.
  for (const heading of STEP_HEADINGS) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await page.getByRole("button", { name: "ถัดไป →" }).click();
  }

  // Required checkpoint: the final review/confirm screen (ccStep === 10)
  // must actually be reached, with its content visible.
  await expect(page.getByText("ขั้นตอนที่ 11: ตรวจสอบ Character Sheet")).toBeVisible();
  await expect(page.getByText(name, { exact: false })).toBeVisible();
  await expect(page.getByText(/HP:/)).toBeVisible();
  await expect(page.getByText(/AC:/)).toBeVisible();
}

/**
 * Full happy path up through combat entry: create character, start the
 * adventure (1st /api/dm call — opening narration only, per the contract
 * deviation above), then submit one free-text action (2nd /api/dm call —
 * narration + start_combat with 2 goblins). Returns the enemy-card locator
 * plus each enemy's starting HP text for the caller to act on.
 *
 * `expectedNarration` lets callers reuse this for a differently-mocked 2nd
 * /api/dm response (e.g. the surprise-encounter variant below) while still
 * asserting the correct narration actually rendered.
 */
async function reachCombatWithTwoGoblins(
  page: Page,
  name: string,
  expectedNarration: string = COMBAT_NARRATION,
): Promise<{ enemyCards: Locator; initialHp: string[] }> {
  await createCharacterThroughAllSteps(page, name);

  await page.getByRole("button", { name: "⚔️ เริ่มการผจญภัย" }).click();
  await expect(page.getByText(OPENING_NARRATION)).toBeVisible();

  await page.getByPlaceholder("จะทำอะไรต่อ? (พิมพ์ action อิสระ...)").fill("ลุยต่อไปข้างหน้า");
  await page.getByRole("button", { name: "ส่ง" }).click();
  await expect(page.getByText(expectedNarration)).toBeVisible();

  // Combat entered: 2 enemy cards, each showing the goblin's starting HP.
  const enemyCards = page.locator(".enemy-card");
  await expect(enemyCards).toHaveCount(2);
  const initialHp = await Promise.all(
    [0, 1].map((i) => enemyCards.nth(i).locator(".hpbar-label").innerText()),
  );
  for (const hp of initialHp) {
    expect(hp.trim()).toBe("7/7");
  }
  return { enemyCards, initialHp };
}

async function readHp(enemyCards: Locator, count: number): Promise<string[]> {
  return Promise.all(
    Array.from({ length: count }, (_, i) => enemyCards.nth(i).locator(".hpbar-label").innerText()),
  );
}

/**
 * Clicks the ranged attack button (client-side resolved, no extra /api/dm
 * round-trip needed for HP to move) until SOME enemy's HP text changes, or
 * gives up after maxAttempts. A single click can miss (attack rolls are
 * RNG), so we retry a bounded number of times rather than asserting after
 * exactly one click — this keeps the test deterministic without needing to
 * seed the dice.
 */
async function rangedAttackUntilHpChanges(
  page: Page,
  enemyCards: Locator,
  initialHp: string[],
  maxAttempts = 6,
): Promise<string[]> {
  const rangedButton = page.getByRole("button", { name: /ยิง/ });
  let current = initialHp;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await rangedButton.click();
    await page.waitForTimeout(150);
    current = await readHp(enemyCards, initialHp.length);
    if (current.some((hp, i) => hp.trim() !== initialHp[i].trim())) break;
  }
  return current;
}

test("character creation through all 11 steps → adventure start → combat → attack lowers enemy HP", async ({
  page,
}) => {
  const dm = mockDm(page, [OPENING_RESPONSE, TWO_GOBLIN_COMBAT_RESPONSE]);
  await dm.install();
  await mockIntent(page);

  await page.goto("/");

  const { enemyCards, initialHp } = await reachCombatWithTwoGoblins(page, "Testira Ironfoot");

  const afterAttackHp = await rangedAttackUntilHpChanges(page, enemyCards, initialHp);

  const parseHp = (s: string) => parseInt(s.split("/")[0], 10);
  const anyDecreased = afterAttackHp.some((hp, i) => parseHp(hp) < parseHp(initialHp[i]));
  expect(
    anyDecreased,
    `expected some enemy HP to drop below starting values ${initialHp.join(", ")}, got ${afterAttackHp.join(", ")}`,
  ).toBeTruthy();

  // Every /api/dm call this run was intercepted by our mock — never a real LLM.
  expect(dm.getCallCount()).toBeGreaterThan(0);
});

// Target selection is now wired through the bridge-backed combat slice
// (src/components/game/CombatView.tsx): clicking an enemy card records it as the
// selected target (`combatTargetId` in DnDSolo), and the attack/ranged buttons
// pass that id to playerCombatAction → doWeaponAttack, which resolves the hit
// against the chosen enemy via combatBridge. So selecting the 2nd enemy and
// attacking now damages the 2nd enemy specifically — this test is a real pass.
test("selecting the 2nd enemy as target and attacking damages the 2nd enemy", async ({ page }) => {
  const dm = mockDm(page, [OPENING_RESPONSE, TWO_GOBLIN_COMBAT_RESPONSE]);
  await dm.install();
  await mockIntent(page);

  await page.goto("/");

  const { enemyCards, initialHp } = await reachCombatWithTwoGoblins(page, "Testira Ironfoot");

  // Click the SECOND enemy's card to (attempt to) select it as target.
  await enemyCards.nth(1).click();

  const afterAttackHp = await rangedAttackUntilHpChanges(page, enemyCards, initialHp);

  // Behaviorally-correct expectation: the enemy the player selected (index 1)
  // should be the one that took damage. Currently false — damage always
  // lands on enemy index 0 — so this assertion fails, which is expected.
  expect(afterAttackHp[1].trim()).not.toBe(initialHp[1].trim());
});

// Regression test for the fixed bug: DnDSolo.tsx used to have a leftover
// 2014-style `if (cb.surprise) { ...; return; }` branch that RETURNED before
// runEnemyPhase() ran, so surprised enemies never got a turn on round 1. The
// D&D 2024 rule is Initiative-roll disadvantage ONLY — surprised creatures
// still act normally.
test("a surprised enemy still takes its turn on round 1 (D&D 2024: surprise = initiative disadvantage only, not a skipped turn)", async ({
  page,
}) => {
  const dm = mockDm(page, [OPENING_RESPONSE, SURPRISE_TWO_GOBLIN_COMBAT_RESPONSE]);
  await dm.install();
  await mockIntent(page);

  await page.goto("/");

  await reachCombatWithTwoGoblins(page, "Sera Quickblade", SURPRISE_NARRATION);

  // Every enemy turn is logged with a "<name> AI: <action>" system line the
  // instant its turn is processed (src/lib/engine/enemyAI.ts, before any
  // movement/range check or attack roll) — so it's a distance- and
  // RNG-independent proof that an enemy's turn actually ran, unlike an
  // attack-roll ticket (which depends on the goblin closing melee range —
  // not guaranteed within a single turn on this map) or the round counter
  // (which the OLD buggy branch also incremented, so it can't distinguish
  // fixed vs. broken).
  //
  // Who wins initiative is itself RNG — surprise only disadvantages the
  // enemies' roll, it does not guarantee the player goes first — so we can't
  // assert on an absolute count. Instead: capture the count of these lines
  // BEFORE the player acts, then assert it INCREASES after the player's turn
  // ends, proving the post-player-turn enemy phase ran. Before the fix,
  // `cb.surprise` caused an early `return` right before that exact phase, so
  // the count would never increase.
  const aiTurnLines = page.getByText(/Goblin AI:/);
  const beforeCount = await aiTurnLines.count();

  // One ranged attack always consumes a level-1 character's action (no Extra
  // Attack / bonus-action features at level 1), ending the player's turn.
  await page.getByRole("button", { name: /ยิง/ }).click();

  await expect
    .poll(() => aiTurnLines.count(), {
      message: "expected at least one more enemy turn to be processed after the player's turn ended",
    })
    .toBeGreaterThan(beforeCount);
});
