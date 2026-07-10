import type { Page, Route } from "@playwright/test";

/**
 * Shape of the parsed object the client expects inside `data.text`
 * (see src/app/api/dm/route.ts + callDM() in src/components/DnDSolo.tsx).
 * Only the fields our specs actually populate are typed strictly; everything
 * else the DM can send (world_map, map_update, dungeon_*, updates, requires)
 * is intentionally omitted by our mocks and is safe to omit per the contract.
 */
export interface MockDmResponse {
  narration: string;
  scene?: string | null;
  start_combat?: { monsters: string[]; surprise?: boolean } | null;
}

/**
 * Installs a route handler for POST /api/dm that NEVER hits a real LLM.
 *
 * Responses are served by call index: the 1st intercepted call gets
 * responses[0], the 2nd gets responses[1], etc. Once the queue is
 * exhausted, every further call re-serves the LAST entry — the app can
 * (and does) make extra /api/dm calls we don't always anticipate
 * (e.g. narrateCombatEvent after a kill), so this keeps the mock robust
 * instead of throwing on an unmatched call.
 *
 * Returns a getter for how many times the route was actually invoked, so
 * a test can assert every /api/dm call in the run was intercepted (>0)
 * and therefore never reached the network.
 */
export function mockDm(page: Page, responses: MockDmResponse[]) {
  if (responses.length === 0) {
    throw new Error("mockDm requires at least one response");
  }
  let callCount = 0;

  return {
    install: async () => {
      await page.route("**/api/dm", async (route: Route) => {
        const idx = Math.min(callCount, responses.length - 1);
        const body = responses[idx];
        callCount++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ text: JSON.stringify(body) }),
        });
      });
    },
    getCallCount: () => callCount,
  };
}

/**
 * The DM screen also fires a best-effort POST /api/intent (LLM-based intent
 * classifier) on every free-text action. It already falls back gracefully
 * on any failure, but we still stub it so the suite never attempts a real
 * outbound LLM call from this endpoint either.
 */
export async function mockIntent(page: Page) {
  await page.route("**/api/intent", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ intent: "unknown", confidence: 0.1 }),
    });
  });
}
