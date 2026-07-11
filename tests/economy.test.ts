import { describe, it, expect } from "vitest";
import {
  sellPrice,
  reputationDiscountPct,
  discountedPrice,
  canAfford,
  bargainDC,
  bargainOutcome,
  coinValueGp,
  treasureValueGp,
  applyPurchase,
  applySale,
  COIN_VALUE_GP,
  SELL_RATE,
} from "../src/lib/engine/economy";

describe("economy: sell / buy pricing", () => {
  it("sells at 50% of base price, floored", () => {
    expect(SELL_RATE).toBe(0.5);
    expect(sellPrice(15)).toBe(7); // floor(7.5)
    expect(sellPrice(10)).toBe(5);
    expect(sellPrice(1)).toBe(0); // floor(0.5)
    expect(sellPrice(0)).toBe(0);
    expect(sellPrice(-5)).toBe(0); // clamped, never negative
  });

  it("applies a standing reputation discount only when wealthy", () => {
    expect(reputationDiscountPct(0)).toBe(0);
    expect(reputationDiscountPct(500)).toBe(0);
    expect(reputationDiscountPct(501)).toBe(10);
  });

  it("discounts a price with a 1 gp floor", () => {
    expect(discountedPrice(100, 10)).toBe(90);
    expect(discountedPrice(100, 0)).toBe(100);
    expect(discountedPrice(2, 90)).toBe(1); // floor would give 0 → clamped to 1
    expect(discountedPrice(100, -10)).toBe(110); // negative discount = markup
  });

  it("gates affordability", () => {
    expect(canAfford(15, 15)).toBe(true);
    expect(canAfford(14, 15)).toBe(false);
  });
});

describe("economy: bargaining", () => {
  it("scales the DC with price, capped at 20", () => {
    expect(bargainDC(0)).toBe(10);
    expect(bargainDC(500)).toBe(15);
    expect(bargainDC(5000)).toBe(20); // 10 + 50, capped
  });

  it("discounts on a successful Persuasion check (up to 30%)", () => {
    // base 100 → DC 11. total 15 → success, (15-11)*5 = 20% off → 80 gp.
    const win = bargainOutcome(15, 100);
    expect(win.dc).toBe(11);
    expect(win.success).toBe(true);
    expect(win.discountPct).toBe(20);
    expect(win.price).toBe(80);
  });

  it("caps the discount at 30%", () => {
    // total far above DC → discount clamped at 30%.
    const big = bargainOutcome(40, 100);
    expect(big.discountPct).toBe(30);
    expect(big.price).toBe(70);
  });

  it("marks up 10% when the merchant is offended (failure)", () => {
    const fail = bargainOutcome(5, 100); // DC 11 → fail
    expect(fail.success).toBe(false);
    expect(fail.discountPct).toBe(-10);
    expect(fail.price).toBe(110);
  });
});

describe("economy: coins & treasure", () => {
  it("uses the standard 5e coin conversion table", () => {
    expect(COIN_VALUE_GP).toEqual({ cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 });
  });

  it("totals a mixed purse in gp without float dust", () => {
    expect(coinValueGp({ gp: 10 })).toBe(10);
    expect(coinValueGp({ pp: 2, gp: 5, sp: 3 })).toBe(25.3);
    expect(coinValueGp({ cp: 100 })).toBe(1);
    expect(coinValueGp({})).toBe(0);
  });

  it("values a hoard as coins + valuables + 50% item buyback", () => {
    const hoard = {
      coins: { gp: 50, sp: 20 },
      valuables: [100, 25], // gems at face value
      items: [30, 10], // sellable at 50% → 15 + 5
    };
    // 52 (coins) + 125 (valuables) + 20 (items) = 197
    expect(treasureValueGp(hoard)).toBe(197);
  });

  it("handles an empty hoard", () => {
    expect(treasureValueGp({})).toBe(0);
  });
});

describe("economy: transaction resolvers", () => {
  it("resolves a purchase only when affordable", () => {
    expect(applyPurchase(15, 10)).toEqual({ ok: true, gold: 5 });
    expect(applyPurchase(5, 10)).toEqual({ ok: false, gold: 5 });
    expect(applyPurchase(10, 10)).toEqual({ ok: true, gold: 0 });
  });

  it("resolves a sale at buyback value", () => {
    expect(applySale(100, 15)).toEqual({ gold: 107, received: 7 });
  });
});
