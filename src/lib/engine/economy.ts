/**
 * economy.ts — pure shop / treasure economy helpers (D&D 2024-ish pricing).
 *
 * These functions codify the pricing math the solo shop UI (DnDSolo.tsx) uses
 * inline, so it can be tested and reused without duplication. Everything here
 * is PURE: no Math.random, no Date.now. Any randomness (a Persuasion check, a
 * treasure roll) is INJECTED by the caller as an already-resolved number.
 *
 * Pricing model (matches the live shop + D&D 5e/2024 conventions):
 *   - Sell price = 50% of an item's base (buy) price.
 *   - Bargaining is a Persuasion check vs a price-scaled DC; success discounts,
 *     failure offends the merchant (small markup).
 *   - Coin values follow the standard 5e conversion table (in gp).
 */

/** Standard D&D coin → gold-piece value. */
export const COIN_VALUE_GP = {
  cp: 0.01, // copper
  sp: 0.1, // silver
  ep: 0.5, // electrum
  gp: 1, // gold
  pp: 10, // platinum
} as const;

export type CoinType = keyof typeof COIN_VALUE_GP;
export type CoinPurse = Partial<Record<CoinType, number>>;

/** Fraction of base price a merchant pays when buying an item back (D&D 5e: 50%). */
export const SELL_RATE = 0.5;

/** Merchant buyback price for an item, given its base (buy) price. */
export function sellPrice(basePrice: number): number {
  return Math.floor(Math.max(0, basePrice) * SELL_RATE);
}

/**
 * A crude "reputation" discount proxy: wealthier adventurers (a rough stand-in
 * for renown) are offered a small standing discount. Mirrors the shop's inline
 * `c.gold > 500 ? 10 : 0` rule. Returns a percentage (0–100).
 */
export function reputationDiscountPct(gold: number): number {
  return gold > 500 ? 10 : 0;
}

/** Apply a percentage discount to a base price, clamped to a 1 gp minimum. */
export function discountedPrice(basePrice: number, discountPct: number): number {
  return Math.max(1, Math.floor(basePrice * (1 - discountPct / 100)));
}

/** Whether a purse of `gold` gp can afford `price` gp. */
export function canAfford(gold: number, price: number): boolean {
  return gold >= price;
}

/**
 * Bargaining DC: harder for pricier goods. DC = 10 + floor(price/100), capped
 * at 20 (matches the shop's inline rule).
 */
export function bargainDC(basePrice: number): number {
  return Math.min(20, 10 + Math.floor(basePrice / 100));
}

export interface BargainOutcome {
  dc: number;
  success: boolean;
  /** Signed percentage: positive = discount, negative = merchant markup. */
  discountPct: number;
  /** Resulting price after the bargain (>= 1). */
  price: number;
}

/**
 * Resolve a Persuasion bargain. `persuasionTotal` is the already-rolled check
 * total (d20 + modifier), injected by the caller.
 *
 *   - Success (total >= DC): discount = min(30, (total - DC) * 5)%  → up to 30% off.
 *   - Failure: merchant offended → +10% markup.
 */
export function bargainOutcome(persuasionTotal: number, basePrice: number): BargainOutcome {
  const dc = bargainDC(basePrice);
  const success = persuasionTotal >= dc;
  const discountPct = success ? Math.min(30, Math.floor((persuasionTotal - dc) * 5)) : -10;
  return { dc, success, discountPct, price: discountedPrice(basePrice, discountPct) };
}

/** Total gp value of a mixed coin purse. */
export function coinValueGp(purse: CoinPurse): number {
  let total = 0;
  for (const key of Object.keys(COIN_VALUE_GP) as CoinType[]) {
    total += (purse[key] || 0) * COIN_VALUE_GP[key];
  }
  // Round to 2 decimals to avoid float dust (e.g. 0.1 + 0.2).
  return Math.round(total * 100) / 100;
}

export interface TreasureHoard {
  coins?: CoinPurse;
  /** Individual valuables (gems, art objects) as gp values. */
  valuables?: number[];
  /** Sellable items, given by base (buy) price — counted at their sell value. */
  items?: number[];
}

/**
 * Total realizable gp value of a treasure hoard: coins at face, valuables at
 * face, and sellable items at their 50% buyback value.
 */
export function treasureValueGp(hoard: TreasureHoard): number {
  const coins = coinValueGp(hoard.coins || {});
  const valuables = (hoard.valuables || []).reduce((s, v) => s + Math.max(0, v), 0);
  const items = (hoard.items || []).reduce((s, p) => s + sellPrice(p), 0);
  return Math.round((coins + valuables + items) * 100) / 100;
}

/**
 * Resolve a purchase. Pure: returns the new gold and whether it succeeded.
 * Does not mutate. Used to keep buy logic identical + testable.
 */
export function applyPurchase(gold: number, price: number): { ok: boolean; gold: number } {
  if (!canAfford(gold, price)) return { ok: false, gold };
  return { ok: true, gold: gold - price };
}

/** Resolve a sale. Returns the new gold and the amount received. */
export function applySale(gold: number, basePrice: number): { gold: number; received: number } {
  const received = sellPrice(basePrice);
  return { gold: gold + received, received };
}
