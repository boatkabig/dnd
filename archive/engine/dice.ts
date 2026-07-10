/**
 * ============================================================================
 * D&D Engine Design Document — Chapter 09: Dice & Resolution
 * ============================================================================
 *
 * Version: 1.0
 * Target: D&D 5e / 2024 Compatible
 * Architecture: Pure Dice Engine — no game logic, no Character references
 *
 * Core Principles:
 *   1. Pure Functions — roll(expr, opts) → RollResult. No side effects, no state.
 *   2. Deterministic Mode — withSeed(n) returns a seeded RNG for reproducible tests.
 *   3. Data-Driven Notation — parser supports the full dice expression grammar:
 *        NdS        → roll N dice of S sides        e.g. 2d6
 *        NdS+M      → add modifier M                e.g. 1d20+5
 *        NdSkhK     → keep highest K dice           e.g. 4d6kh3 (ability score roll)
 *        NdSklK     → keep lowest K dice            e.g. 2d20kl1 (disadvantage)
 *        NdS!       → explode on max                e.g. 1d6!
 *        NdSro<N    → reroll results below N        e.g. 1d20ro<2 (GWM)
 *        NdSmin<N   → minimum floor                 e.g. 1d6min2
 *   4. Roll Types — d20 (with adv/dis), damage (with crit doubling),
 *      healing (no negatives), table (1..N).
 *   5. Bonus/Penalty Dice — Bless +1d4, Bane -1d4, Bardic Inspiration +1d6.
 *   6. Reroll Mechanics — Halfling Lucky (reroll nat 1), GWM (reroll low damage).
 *   7. Roll History — every roll recorded for audit/replay.
 * ============================================================================
 */

// ============================================================================
// 1. TYPES
// ============================================================================

/**
 * A single parsed dice term, e.g. "2d6kh1+3" → { count: 2, sides: 6, keepHigh: 1, modifier: 3 }
 * Multiple terms can be combined: "2d6+1d4" → two DiceTerm entries.
 */
export interface DiceTerm {
  count: number;                  // N dice
  sides: number;                  // S sides
  modifier: number;               // +/- M
  keepHigh?: number;              // khK — keep highest K
  keepLow?: number;               // klK — keep lowest K
  rerollBelow?: number;           // ro<N — reroll dice below N (once per die)
  explode?: boolean;              // ! — explode on max (chain)
  min?: number;                   // minN — floor each die at N
  replace?: { from: number; to: number }; // rN=M — replace result N with M
}

/**
 * Detailed result of a single term in a roll expression.
 * Each term produces rolls[], then keep/drop logic produces kept[].
 */
export interface DiceTermResult {
  rolls: number[];                // every die rolled (before keep/drop)
  kept: number[];                 // dice that count toward total
  dropped: number[];              // dice dropped by kh/kl
  sides: number;
  modifier: number;
  subtotal: number;
}

/**
 * Result of any roll() call. Captures everything needed for replay + audit.
 */
export interface RollResult {
  expression: string;
  terms: DiceTermResult[];
  total: number;
  history: string;                // human-readable: "2d6(3,5)+1d4(2)=10"
  isCrit: boolean;                // nat 20 on d20
  isFumble: boolean;              // nat 1 on d20
  advantage?: boolean;
  disadvantage?: boolean;
  bonusDiceTotal?: number;        // sum of Bless-style +1d4
  penaltyDiceTotal?: number;      // sum of Bane-style -1d4
  rerolled?: number[];            // die values that were rerolled (Halfling Lucky)
}

/**
 * Options passed to roll(). All optional.
 */
export interface RollOptions {
  advantage?: boolean;            // d20: roll twice, keep high
  disadvantage?: boolean;         // d20: roll twice, keep low
  bonusDice?: string[];           // ["1d4"] for Bless
  penaltyDice?: string[];         // ["1d4"] for Bane
  rerollOn?: number[];            // reroll d20 if result in list (Halfling Lucky: [1])
  rerollDamageBelow?: number;     // reroll damage dice below N (GWM, Savage Attacker)
  replaceResults?: Array<{ from: number; to: number }>;
  seed?: number;                  // for deterministic testing
  isCritical?: boolean;           // double dice for damage rolls
}

// ============================================================================
// 2. RNG — Default (Math.random) and Seeded (mulberry32)
// ============================================================================

/** RNG function signature — returns [0, 1) like Math.random. */
export type RNG = () => number;

/** Default non-deterministic RNG. */
const DEFAULT_RNG: RNG = Math.random;

/**
 * Mulberry32 — fast, deterministic, seedable PRNG.
 * Same seed always produces the same sequence.
 * Used by withSeed() and RollOptions.seed.
 */
export function mulberry32(seed: number): RNG {
  let s = seed >>> 0;
  return function (): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a seeded RNG instance. Useful for tests + deterministic replays.
 * Usage: const rng = withSeed(42); const result = roll("1d20", { seed: rng });
 */
export function withSeed(seed: number): RNG {
  return mulberry32(seed);
}

/** Roll a single die of `sides` using the given RNG. */
function rollDie(sides: number, rng: RNG): number {
  return Math.floor(rng() * sides) + 1;
}

// ============================================================================
// 3. EXPRESSION PARSER — pure data, no side effects
// ============================================================================

/**
 * Parse a dice expression string into one or more DiceTerm objects.
 *
 * Supported grammar:
 *   NdS[+M][khK|klK][!][ro<N][min<N][rA=B]
 *
 * Examples:
 *   parseExpression("1d20") → [{ count:1, sides:20, modifier:0 }]
 *   parseExpression("2d6+3") → [{ count:2, sides:6, modifier:3 }]
 *   parseExpression("4d6kh3") → [{ count:4, sides:6, modifier:0, keepHigh:3 }]
 *   parseExpression("2d20kl1") → [{ count:2, sides:20, modifier:0, keepLow:1 }]
 *   parseExpression("1d6!") → [{ count:1, sides:6, modifier:0, explode:true }]
 *   parseExpression("1d20ro<2") → [{ count:1, sides:20, modifier:0, rerollBelow:2 }]
 *
 * Multi-term: "2d6+1d4" → two DiceTerm entries.
 * Returns [] on parse failure.
 */
export function parseExpression(expr: string): DiceTerm[] {
  const terms: DiceTerm[] = [];
  // Split on +/- that separate terms (but keep modifier signs within term)
  // Pattern: [count]d<sides>[flags][+/-modifier]
  const termPattern = /(\d*)d(\d+)(kh(\d+)|kl(\d+)|ro<(\d+)|min(\d+)|r(\d+)=(\d+)|!)?([+-]\d+)?/gi;
  let match: RegExpExecArray | null;
  while ((match = termPattern.exec(expr)) !== null) {
    const count = parseInt(match[1] || "1", 10);
    const sides = parseInt(match[2], 10);
    if (!Number.isFinite(count) || !Number.isFinite(sides) || count < 1 || sides < 1) {
      continue;
    }
    const flagStr = match[3] || "";
    const modifier = match[10] ? parseInt(match[10], 10) : 0;

    const term: DiceTerm = { count, sides, modifier };
    if (match[4] !== undefined) term.keepHigh = parseInt(match[4], 10);
    if (match[5] !== undefined) term.keepLow = parseInt(match[5], 10);
    if (match[6] !== undefined) term.rerollBelow = parseInt(match[6], 10);
    if (match[7] !== undefined) term.min = parseInt(match[7], 10);
    if (match[8] !== undefined && match[9] !== undefined) {
      term.replace = { from: parseInt(match[8], 10), to: parseInt(match[9], 10) };
    }
    if (flagStr.includes("!")) term.explode = true;
    terms.push(term);
  }
  return terms;
}

// ============================================================================
// 4. CORE ROLL ENGINE
// ============================================================================

/**
 * Roll a single DiceTerm and return its detailed result.
 * Handles rerollBelow, explode, min, replace, keepHigh, keepLow.
 */
function rollTerm(term: DiceTerm, rng: RNG, opts?: RollOptions): DiceTermResult {
  const rolls: number[] = [];
  const rerolled: number[] = [];

  for (let i = 0; i < term.count; i++) {
    let die = rollDie(term.sides, rng);

    // Reroll below threshold (once per die)
    if (term.rerollBelow !== undefined && die < term.rerollBelow) {
      rerolled.push(die);
      die = rollDie(term.sides, rng);
    }

    // Global reroll hook (Halfling Lucky: reroll nat 1 on d20)
    if (opts?.rerollOn && term.sides === 20 && opts.rerollOn.includes(die)) {
      rerolled.push(die);
      die = rollDie(term.sides, rng);
    }

    // Apply min floor
    if (term.min !== undefined && die < term.min) die = term.min;

    // Apply replace
    if (term.replace && die === term.replace.from) die = term.replace.to;
    if (opts?.replaceResults) {
      for (const rep of opts.replaceResults) {
        if (die === rep.from) die = rep.to;
      }
    }

    rolls.push(die);

    // Explode (chain reroll on max)
    if (term.explode && die === term.sides) {
      let extra = die;
      while (extra === term.sides) {
        extra = rollDie(term.sides, rng);
        if (term.min !== undefined && extra < term.min) extra = term.min;
        rolls.push(extra);
      }
    }
  }

  // Keep high / keep low
  let kept = [...rolls];
  const dropped: number[] = [];
  if (term.keepHigh !== undefined) {
    const sorted = [...rolls].sort((a, b) => b - a);
    kept = sorted.slice(0, term.keepHigh);
    dropped.push(...sorted.slice(term.keepHigh));
  } else if (term.keepLow !== undefined) {
    const sorted = [...rolls].sort((a, b) => a - b);
    kept = sorted.slice(0, term.keepLow);
    dropped.push(...sorted.slice(term.keepLow));
  }

  // Damage reroll below threshold (Great Weapon Master, Savage Attacker)
  if (opts?.rerollDamageBelow !== undefined && term.sides !== 20) {
    kept = kept.map(v => {
      if (v < opts.rerollDamageBelow!) {
        rerolled.push(v);
        return rollDie(term.sides, rng);
      }
      return v;
    });
  }

  const subtotal = kept.reduce((s, r) => s + r, 0) + term.modifier;
  return { rolls, kept, dropped, sides: term.sides, modifier: term.modifier, subtotal };
}

/**
 * Main roll entry point.
 *
 * Examples:
 *   roll("1d20+5") → standard attack roll
 *   roll("1d20", { advantage: true }) → roll twice, keep high
 *   roll("2d6+3", { isCritical: true }) → roll 4d6+3 (doubled dice)
 *   roll("1d20", { bonusDice: ["1d4"], seed: 42 }) → Bless +1d4, deterministic
 *
 * Returns a RollResult with full breakdown for UI display + audit.
 */
export function roll(expression: string, options?: RollOptions): RollResult {
  const rng: RNG = options?.seed !== undefined ? mulberry32(options.seed) : DEFAULT_RNG;

  // === Advantage / Disadvantage (d20 only) ===
  if ((options?.advantage || options?.disadvantage) && expression.includes("d20")) {
    const r1 = rollDie(20, rng);
    let r2 = rollDie(20, rng);
    // Halfling Lucky: reroll nat 1
    if (options?.rerollOn && options.rerollOn.includes(r1)) r2 = rollDie(20, rng);
    const adv = options?.advantage === true;
    const kept = adv ? Math.max(r1, r2) : Math.min(r1, r2);
    const dropped = kept === r1 ? r2 : r1;

    let total = kept;
    let bonusTotal = 0;
    let penaltyTotal = 0;

    // Apply flat modifier from expression (e.g. "1d20+5")
    const terms = parseExpression(expression);
    const flatMod = terms.reduce((s, t) => s + t.modifier, 0);
    total += flatMod;

    // Bonus dice (Bless)
    if (options?.bonusDice) {
      for (const bd of options.bonusDice) {
        const sides = parseInt(bd.match(/d(\d+)/)?.[1] || "4", 10);
        bonusTotal += rollDie(sides, rng);
      }
      total += bonusTotal;
    }
    // Penalty dice (Bane)
    if (options?.penaltyDice) {
      for (const pd of options.penaltyDice) {
        const sides = parseInt(pd.match(/d(\d+)/)?.[1] || "4", 10);
        penaltyTotal += rollDie(sides, rng);
      }
      total -= penaltyTotal;
    }

    return {
      expression,
      terms: [{
        rolls: [r1, r2], kept: [kept], dropped: [dropped],
        sides: 20, modifier: flatMod, subtotal: kept + flatMod,
      }],
      total,
      history: `d20(${r1},${r2})→${kept}${flatMod ? (flatMod > 0 ? "+" : "") + flatMod : ""}${bonusTotal ? `+${bonusTotal}` : ""}${penaltyTotal ? `-${penaltyTotal}` : ""}=${total}`,
      isCrit: kept === 20,
      isFumble: kept === 1,
      advantage: adv,
      disadvantage: !adv,
      bonusDiceTotal: bonusTotal || undefined,
      penaltyDiceTotal: penaltyTotal || undefined,
    };
  }

  // === Standard multi-term roll ===
  const terms = parseExpression(expression);
  const resultTerms: DiceTermResult[] = [];
  let total = 0;
  const historyParts: string[] = [];

  for (const term of terms) {
    // Crit doubling: double dice count (D&D 5e — roll dice twice, not double total)
    const effectiveTerm = options?.isCritical
      ? { ...term, count: term.count * 2 }
      : term;
    const r = rollTerm(effectiveTerm, rng, opts_arg(options));
    resultTerms.push(r);
    total += r.subtotal;
    const modStr = r.modifier ? (r.modifier > 0 ? "+" : "") + r.modifier : "";
    historyParts.push(`${term.count}d${term.sides}(${r.kept.join("+")})${modStr}=${r.subtotal}`);
  }

  // Bonus dice (Bless +1d4)
  let bonusTotal = 0;
  if (options?.bonusDice) {
    for (const bd of options.bonusDice) {
      const sides = parseInt(bd.match(/d(\d+)/)?.[1] || "4", 10);
      const r = rollDie(sides, rng);
      bonusTotal += r;
      historyParts.push(`+${bd}=${r}`);
    }
    total += bonusTotal;
  }
  // Penalty dice (Bane -1d4)
  let penaltyTotal = 0;
  if (options?.penaltyDice) {
    for (const pd of options.penaltyDice) {
      const sides = parseInt(pd.match(/d(\d+)/)?.[1] || "4", 10);
      const r = rollDie(sides, rng);
      penaltyTotal += r;
      historyParts.push(`-${pd}=${r}`);
    }
    total -= penaltyTotal;
  }

  // Crit/fumble detection — only for single d20 terms
  const isD20 = terms.length === 1 && terms[0].sides === 20 && terms[0].count === 1;
  const natRoll = isD20 ? resultTerms[0].kept[0] : 0;

  return {
    expression,
    terms: resultTerms,
    total,
    history: historyParts.join(" · ") + `=${total}`,
    isCrit: isD20 && natRoll === 20,
    isFumble: isD20 && natRoll === 1,
    bonusDiceTotal: bonusTotal || undefined,
    penaltyDiceTotal: penaltyTotal || undefined,
  };
}

/** Helper to filter RollOptions into the shape rollTerm expects. */
function opts_arg(o?: RollOptions): RollOptions | undefined {
  if (!o) return undefined;
  return {
    rerollOn: o.rerollOn,
    rerollDamageBelow: o.rerollDamageBelow,
    replaceResults: o.replaceResults,
  };
}

// ============================================================================
// 5. CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Roll a d20 with optional advantage/disadvantage.
 * Returns the natural die roll, total (with modifier), and crit/fumble flags.
 *
 * Usage: const r = rollD20(5, "advantage");
 *        if (r.isCrit) { ... }
 */
export function rollD20(
  modifier: number = 0,
  adv: "none" | "advantage" | "disadvantage" = "none",
  opts?: { seed?: number; bonusDice?: string[]; penaltyDice?: string[] },
): {
  die: number;
  total: number;
  isCrit: boolean;
  isFumble: boolean;
  adv: "none" | "advantage" | "disadvantage";
} {
  const result = roll(`1d20+${modifier}`, {
    advantage: adv === "advantage",
    disadvantage: adv === "disadvantage",
    seed: opts?.seed,
    bonusDice: opts?.bonusDice,
    penaltyDice: opts?.penaltyDice,
  });
  return {
    die: result.terms[0].kept[0],
    total: result.total,
    isCrit: result.isCrit,
    isFumble: result.isFumble,
    adv,
  };
}

/**
 * Roll a damage expression. If isCritical, dice are doubled (D&D 5e crit rule).
 *
 * Usage: const dmg = rollDamage("2d6+3", isCrit);
 *        const total = dmg.total;
 */
export function rollDamage(
  damageExpr: string,
  isCritical: boolean = false,
  opts?: { seed?: number; rerollDamageBelow?: number },
): RollResult {
  return roll(damageExpr, {
    isCritical,
    seed: opts?.seed,
    rerollDamageBelow: opts?.rerollDamageBelow,
  });
}

/**
 * Roll a single die of N sides. Used for random tables (encounter, treasure, etc.).
 *
 * Usage: const r = rollTable(100); // d100
 */
export function rollTable(sides: number, seed?: number): number {
  const rng = seed !== undefined ? mulberry32(seed) : DEFAULT_RNG;
  return rollDie(sides, rng);
}

/**
 * Roll a healing expression. Healing cannot be negative; total is floored at 0.
 *
 * Usage: const heal = rollHeal("2d8+3");
 */
export function rollHeal(healExpr: string, opts?: { seed?: number; isCritical?: boolean }): RollResult {
  const result = roll(healExpr, { seed: opts?.seed, isCritical: opts?.isCritical });
  return { ...result, total: Math.max(0, result.total) };
}

/**
 * Resolve a contested check (A vs B). Both roll d20 + their modifier.
 * Returns winner ("A", "B", or "tie") and both totals.
 *
 * Usage: const r = rollContest(athleticsModA, athleticsModB);
 *        if (r.winner === "A") { ... grapple success ... }
 */
export function rollContest(
  modA: number,
  modB: number,
  opts?: { seed?: number },
): { winner: "A" | "B" | "tie"; totalA: number; totalB: number; dieA: number; dieB: number } {
  const seedA = opts?.seed;
  const seedB = opts?.seed !== undefined ? opts.seed + 1 : undefined;
  const a = rollD20(modA, "none", { seed: seedA });
  const b = rollD20(modB, "none", { seed: seedB });
  let winner: "A" | "B" | "tie" = "tie";
  if (a.total > b.total) winner = "A";
  else if (b.total > a.total) winner = "B";
  return { winner, totalA: a.total, totalB: b.total, dieA: a.die, dieB: b.die };
}

/**
 * Passive check score: 10 + modifier (D&D 5e Passive Perception etc.).
 * Pure function — no dice rolled.
 */
export function passiveCheck(modifier: number, opts?: { bonus?: number }): number {
  return 10 + modifier + (opts?.bonus ?? 0);
}

// ============================================================================
// 6. ROLL HISTORY (optional, opt-in via global log)
// ============================================================================

/**
 * In-memory roll history for audit + replay.
 * Disabled by default — call enableRollHistory() to enable.
 * NOT used in production game state — purely a debug/testing aid.
 */
export interface RollHistoryEntry {
  timestamp: number;
  expression: string;
  total: number;
  isCrit: boolean;
  isFumble: boolean;
}

const _rollHistory: RollHistoryEntry[] = [];
let _historyEnabled = false;

export function enableRollHistory(): void {
  _historyEnabled = true;
}

export function disableRollHistory(): void {
  _historyEnabled = false;
}

export function getRollHistory(): RollHistoryEntry[] {
  return [..._rollHistory];
}

export function clearRollHistory(): void {
  _rollHistory.length = 0;
}

/** Internal hook used by roll() to record history when enabled. */
export function _recordHistory(entry: RollHistoryEntry): void {
  if (_historyEnabled) _rollHistory.push(entry);
}
