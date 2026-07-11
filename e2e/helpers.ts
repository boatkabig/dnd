import { expect, type Page } from "@playwright/test";
import type { MockDmResponse } from "./mock-dm";

/**
 * Shared e2e helpers for driving the DnDSolo UI (src/components/DnDSolo.tsx).
 *
 * These mirror the private helpers in dnd-solo.spec.ts but are exported so the
 * feature-flow specs (dnd-flows.spec.ts) can reuse them without duplicating the
 * 11-step character-creation walk. Everything here asserts user-visible output
 * only — never internal component state — and never reaches a live LLM (all
 * /api/dm + /api/intent traffic is route-mocked by the caller).
 */

export const OPENING_NARRATION = "E2E_FLOWS_OPENING_the_lantern_swings";
export const COMBAT_NARRATION = "E2E_FLOWS_COMBAT_the_goblins_pounce";

export const OPENING_RESPONSE: MockDmResponse = {
  narration: OPENING_NARRATION,
  scene: "จุดเริ่มต้น",
};

export const TWO_GOBLIN_COMBAT_RESPONSE: MockDmResponse = {
  narration: COMBAT_NARRATION,
  scene: "จุดเริ่มต้น",
  start_combat: { monsters: ["goblin", "goblin"] },
};

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
export async function createCharacterThroughAllSteps(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "✦ เริ่มแคมเปญใหม่" }).click();
  await page.getByPlaceholder("ชื่อตัวละคร...").fill(name);
  for (const heading of STEP_HEADINGS) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await page.getByRole("button", { name: "ถัดไป →" }).click();
  }
  await expect(page.getByText("ขั้นตอนที่ 11: ตรวจสอบ Character Sheet")).toBeVisible();
  await expect(page.getByText(name, { exact: false })).toBeVisible();
}

/** Clicks "Start Adventure" and waits for the opening narration to render. */
export async function startAdventure(page: Page): Promise<void> {
  await page.getByRole("button", { name: "⚔️ เริ่มการผจญภัย" }).click();
  await expect(page.getByText(OPENING_NARRATION)).toBeVisible();
}

/** Full path to the live play screen with a freshly-created (default) character. */
export async function reachPlayScreen(page: Page, name: string): Promise<void> {
  await createCharacterThroughAllSteps(page, name);
  await startAdventure(page);
}

/**
 * Quick-start a wizard (Elara) — skips the 11-step creation and yields a level-1
 * caster who already knows Magic Missile (a bundled SEED spell, so casting works
 * fully offline). Dismisses the first-play onboarding overlay it triggers.
 */
export async function quickStartWizard(page: Page): Promise<void> {
  await page.getByRole("button", { name: "🔮 พ่อมด" }).click();
  // First play shows an onboarding overlay; dismiss it via its skip button so it
  // can't intercept later clicks (clicking the overlay itself hits the card,
  // which stops propagation).
  const skip = page.getByRole("button", { name: "ข้าม" });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await expect(page.locator(".onboarding-overlay")).toBeHidden();
  }
  await expect(page.getByText(OPENING_NARRATION)).toBeVisible();
}

/** Submits one free-text action (2nd /api/dm call — the one that honors start_combat). */
export async function submitAction(page: Page, text: string): Promise<void> {
  await page.getByPlaceholder("จะทำอะไรต่อ? (พิมพ์ action อิสระ...)").fill(text);
  await page.getByRole("button", { name: "ส่ง" }).click();
}
