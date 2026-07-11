import { test, expect } from "@playwright/test";
import { mockDm, mockIntent, type MockDmResponse } from "./mock-dm";
import { OPENING_RESPONSE, quickStartWizard, submitAction } from "./helpers";

const ONE_FROG_COMBAT: MockDmResponse = {
  narration: "E2E_BUFF_MAGE_ARMOR_frog_encounter",
  scene: "จุดเริ่มต้น",
  start_combat: { monsters: ["frog"] },
};

test("✨ casting Mage Armor applies its tracked buff", async ({ page }) => {
  const dm = mockDm(page, [OPENING_RESPONSE, ONE_FROG_COMBAT]);
  await dm.install();
  await mockIntent(page);
  await page.goto("/");

  await quickStartWizard(page);
  await submitAction(page, "เดินเข้าไปในถ้ำ");
  await expect(page.getByText("E2E_BUFF_MAGE_ARMOR_frog_encounter")).toBeVisible();

  await page.getByRole("button", { name: /ร่ายเวท/ }).click();
  await page.getByRole("button", { name: /Mage Armor/ }).click();

  // The buff branch emits this deterministic entry after it updates character
  // state, so this proves the spell was not handled as utility narration.
  await expect(page.getByText(/Mage Armor: AC 13 \+ DEX/)).toBeVisible();
});