import { test, expect } from "@playwright/test";
import { mockDm, mockIntent, type MockDmResponse } from "./mock-dm";
import {
  OPENING_RESPONSE,
  reachPlayScreen,
  quickStartWizard,
  submitAction,
} from "./helpers";

/**
 * Feature-flow e2e suite for phase-6 systems built on this branch. Every test
 * drives real user-visible UI against the route-mocked DM (no live LLM, no
 * creds) and asserts rendered output only. Complements dnd-solo.spec.ts (which
 * covers creation → combat → attack + target selection).
 */

// ── 1. Oracle modal (solo GM emulator — src/lib/engine/oracle.ts) ────────────
test("🔮 oracle modal returns a yes/no result with a d100 roll", async ({ page }) => {
  const dm = mockDm(page, [OPENING_RESPONSE]);
  await dm.install();
  await mockIntent(page);
  await page.goto("/");

  await reachPlayScreen(page, "Oracle Seeker");

  // Open the "more" menu, then the oracle.
  await page.getByRole("button", { name: "☰" }).click();
  await page.getByRole("button", { name: /ถามออราเคิล/ }).click();

  // Ask a question at the default likelihood and roll.
  await page.getByPlaceholder("เช่น มีใครซ่อนอยู่ในห้องนี้ไหม?").fill("มีสมบัติซ่อนอยู่ไหม?");
  await page.getByRole("button", { name: "🎲 ถามออราเคิล" }).click();

  // A result row appears showing the underlying d100 roll (deterministic UI:
  // a label + roll is always produced regardless of the RNG outcome).
  await expect(page.getByText(/d100=\d+/)).toBeVisible();
  await expect(page.getByText("มีสมบัติซ่อนอยู่ไหม?")).toBeVisible();
});

// ── 2. Character sheet ───────────────────────────────────────────────────────
test("📜 character sheet opens and shows ability-score tab", async ({ page }) => {
  const dm = mockDm(page, [OPENING_RESPONSE]);
  await dm.install();
  await mockIntent(page);
  await page.goto("/");

  await reachPlayScreen(page, "Sheeta Bookworm");

  await page.getByRole("button", { name: "📜" }).first().click();

  // The sheet renders its own modal with four tabs (div.sheet-tab) + the name.
  const sheet = page.locator(".sheet-modal", { hasText: "ค่าสถานะ" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Sheeta Bookworm")).toBeVisible();
  await expect(sheet.locator(".sheet-tab", { hasText: "สกิล" })).toBeVisible();
  await expect(sheet.locator(".sheet-tab", { hasText: "เวทมนตร์" })).toBeVisible();
});

// ── 3. Long rest restores resources ──────────────────────────────────────────
test("🌙 long rest logs full restoration (HP + spell slots + hit dice)", async ({ page }) => {
  const dm = mockDm(page, [OPENING_RESPONSE]);
  await dm.install();
  await mockIntent(page);
  await page.goto("/");

  await reachPlayScreen(page, "Restus Napworthy");

  await page.getByRole("button", { name: /พักยาว/ }).click();

  // The rest engine writes a system log line describing what was restored.
  await expect(page.getByText(/พักยาว \(8 ชม\./)).toBeVisible();
});

// ── 3b. Exploration turn advances time + logs a procedural beat ──────────────
test("🧭 exploration action logs a travel turn (encounter check)", async ({ page }) => {
  const dm = mockDm(page, [OPENING_RESPONSE]);
  await dm.install();
  await mockIntent(page);
  await page.goto("/");

  await reachPlayScreen(page, "Wanda Wayfarer");

  await page.getByRole("button", { name: /สำรวจ\/เดินทาง/ }).click();

  // The pure exploration engine always writes a summary line for the turn
  // (deterministic regardless of the injected d20/d100 outcome) plus a
  // time-advance line — both surfaced to the game log.
  await expect(page.getByText(/สำรวจ\/เดินทาง 1 ชม\./)).toBeVisible();
  await expect(page.getByText(/เวลาผ่านไป 1 ชม\./)).toBeVisible();
});

// ── 4. Shop economy: buying decrements gold ──────────────────────────────────
test("🏪 buying a weapon in the shop decrements the character's gold", async ({ page }) => {
  const dm = mockDm(page, [OPENING_RESPONSE]);
  await dm.install();
  await mockIntent(page);
  await page.goto("/");

  await reachPlayScreen(page, "Goldspend Merchanty");

  await page.getByRole("button", { name: "☰" }).click();
  await page.getByRole("button", { name: /ร้านค้า/ }).click();

  const shop = page.locator(".sheet-modal", { hasText: "ร้านค้า" });
  const goldLabel = shop.getByText(/💰\s*\d+\s*gp/);
  const before = parseInt((await goldLabel.innerText()).replace(/\D/g, ""), 10);
  expect(before).toBeGreaterThan(0);

  // Click the first affordable (enabled) "buy" button.
  await shop.locator("button:not([disabled])", { hasText: "ซื้อ" }).first().click();

  await expect
    .poll(async () => parseInt((await goldLabel.innerText()).replace(/\D/g, ""), 10))
    .toBeLessThan(before);
});

// ── 5. Spell casting decrements a spell slot ─────────────────────────────────
const ONE_FROG_COMBAT: MockDmResponse = {
  narration: "E2E_FLOWS_FROG_a_croak_in_the_dark",
  scene: "จุดเริ่มต้น",
  // A frog (atk 0 / dmg "0" in the bestiary) can't harm the caster, so the
  // wizard reliably survives to their turn regardless of initiative — keeping
  // the slot-decrement assertion deterministic.
  start_combat: { monsters: ["frog"] },
};

test("✨ casting Magic Missile in combat consumes a spell slot", async ({ page }) => {
  const dm = mockDm(page, [OPENING_RESPONSE, ONE_FROG_COMBAT]);
  await dm.install();
  await mockIntent(page);
  await page.goto("/");

  await quickStartWizard(page);

  await submitAction(page, "เดินเข้าไปในถ้ำ");
  await expect(page.getByText("E2E_FLOWS_FROG_a_croak_in_the_dark")).toBeVisible();

  // Slot pips live in the header (class casters only): full = available slot.
  const fullPips = page.locator(".slotpip.full");
  const before = await fullPips.count();
  expect(before).toBeGreaterThan(0);

  // Open the spell submenu and cast Magic Missile (a bundled SEED spell, level 1).
  await page.getByRole("button", { name: /ร่ายเวท/ }).click();
  await page.getByRole("button", { name: /Magic Missile/ }).click();

  // Exactly one level-1 slot should be spent → one fewer full pip.
  await expect.poll(async () => fullPips.count()).toBeLessThan(before);
});

// ── 5b. Spell targeting honors the player's selected enemy (Task #19) ───────
const TWO_FROG_COMBAT: MockDmResponse = {
  narration: "E2E_FLOWS_TWOFROG_a_pair_of_frogs_blink",
  scene: "จุดเริ่มต้น",
  // Two frogs (atk 0 / dmg "0" in the bestiary) so the wizard survives no
  // matter how many retries the spell-attack-roll loop below needs.
  start_combat: { monsters: ["frog", "frog"] },
};

test("✨ casting a single-target spell damages the SELECTED (non-first) enemy", async ({ page }) => {
  const dm = mockDm(page, [OPENING_RESPONSE, TWO_FROG_COMBAT]);
  await dm.install();
  await mockIntent(page);
  await page.goto("/");

  await quickStartWizard(page);

  await submitAction(page, "เดินเข้าไปในถ้ำ");
  await expect(page.getByText("E2E_FLOWS_TWOFROG_a_pair_of_frogs_blink")).toBeVisible();

  const enemyCards = page.locator(".enemy-card");
  await expect(enemyCards).toHaveCount(2);
  const readHp = () => Promise.all([0, 1].map((i) => enemyCards.nth(i).locator(".hpbar-label").innerText()));
  const initialHp = await readHp();

  // Select the SECOND frog as the target — the same enemy-card click
  // convention already used to select weapon-attack targets.
  await enemyCards.nth(1).click();

  // Fire Bolt (a bundled SEED cantrip, single-target spell-attack-roll) can
  // miss, so retry a bounded number of casts; frogs deal 0 damage, so this is
  // safe regardless of how many rounds it takes.
  const spellButton = page.getByRole("button", { name: /Fire Bolt/ });
  let afterHp = initialHp;
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.getByRole("button", { name: /ร่ายเวท/ }).click();
    await spellButton.click();
    await page.waitForTimeout(150);
    afterHp = await readHp();
    if (afterHp[1].trim() !== initialHp[1].trim()) break;
  }

  // The SELECTED (2nd) frog took the damage; the unselected (1st) frog didn't.
  expect(afterHp[1].trim()).not.toBe(initialHp[1].trim());
  expect(afterHp[0].trim()).toBe(initialHp[0].trim());
});
