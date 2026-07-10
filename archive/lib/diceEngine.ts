/**
 * Dice Engine — pure dice rolling, no game rules.
 *
 * Separated from Roll Resolver per architecture advice:
 * - Dice Engine: parse expressions, roll dice, handle reroll/replace/bonus/penalty
 * - Roll Resolver (separate file): knows D&D rules (which modifier, advantage, conditions)
 *
 * Supports: d4/d6/d8/d10/d12/d20/d100, multi-dice, modifiers, keep-highest/lowest,
 * advantage/disadvantage, critical, reroll, replace, bonus dice, penalty dice.
 */

/* ================ Types ================ */

export interface DiceTerm {
  count: number;
  sides: number;
  modifier: number;      // flat +/- modifier
  rolls: number[];       // individual die results
  dropped: number[];     // dropped die results (for keep-highest/lowest)
  keepHigh?: number;     // keep N highest (kh1 = advantage)
  keepLow?: number;      // keep N lowest (kl1 = disadvantage)
  tag?: string;          // "main" | "bonus" | "penalty" | "reroll" | "replace"
}

export interface RollResult {
  terms: DiceTerm[];
  total: number;
  diceTotal: number;     // sum of kept dice (before modifier)
  modifierTotal: number;  // sum of flat modifiers
  naturalDie: number | null; // for d20 rolls: the raw die value (for crit/fumble detection)
  isCrit: boolean;
  isFumble: boolean;
  isAdvantage: boolean;
  isDisadvantage: boolean;
  history: string;       // human-readable breakdown e.g. "d20(15)+5 = 20"
  rerolled?: boolean;
  replaced?: boolean;
}

export interface RollContext {
  advantage?: boolean;
  disadvantage?: boolean;
  bonusDice?: string[];   // e.g. ["1d4"] for Bless
  penaltyDice?: string[]; // e.g. ["1d4"] for Bane
  rerollOnce?: boolean;   // Lucky feat
  replaceWith?: number;   // Portent: replace d20 result with this value
  critThreshold?: number; // default 20, Champion=19
  critMultiplier?: number; // default 2
  tag?: string;
}

/* ================ Parser ================ */

/**
 * Parse a dice expression into DiceTerm[].
 * Supports: "1d20+5", "2d6", "8d6+3", "1d8+1d6+2", "2d20kh1+5"
 * Also supports multiple terms separated by + or -.
 */
export function parseExpression(expr: string): DiceTerm[] {
  const clean = expr.replace(/\s/g, "").replace(/-/g, "+-");
  const parts = clean.split("+").filter((p) => p.length > 0);
  const terms: DiceTerm[] = [];

  for (const part of parts) {
    const negative = part.startsWith("-");
    const p = negative ? part.slice(1) : part;

    // Check for keep-highest/lowest: "2d20kh1" or "2d20kl1"
    const khMatch = p.match(/^(\d*)d(\d+)kh(\d+)$/i);
    const klMatch = p.match(/^(\d*)d(\d+)kl(\d+)$/i);

    // Standard dice: "2d6" or "1d20+5" (modifier handled separately)
    const diceMatch = p.match(/^(\d*)d(\d+)$/i);

    // Pure modifier: "5" or "3"
    const modMatch = p.match(/^(\d+)$/);

    if (khMatch) {
      terms.push({
        count: parseInt(khMatch[1] || "1", 10),
        sides: parseInt(khMatch[2], 10),
        modifier: negative ? -1 : 0,
        rolls: [],
        dropped: [],
        keepHigh: parseInt(khMatch[3], 10),
        tag: "main",
      });
    } else if (klMatch) {
      terms.push({
        count: parseInt(klMatch[1] || "1", 10),
        sides: parseInt(klMatch[2], 10),
        modifier: negative ? -1 : 0,
        rolls: [],
        dropped: [],
        keepLow: parseInt(klMatch[3], 10),
        tag: "main",
      });
    } else if (diceMatch) {
      terms.push({
        count: parseInt(diceMatch[1] || "1", 10),
        sides: parseInt(diceMatch[2], 10),
        modifier: negative ? -1 : 0, // this won't apply since modifier is separate
        rolls: [],
        dropped: [],
        tag: "main",
      });
    } else if (modMatch) {
      // Pure modifier — attach to last term or create a 0d0 term
      const val = parseInt(modMatch[1], 10) * (negative ? -1 : 1);
      if (terms.length > 0) {
        terms[terms.length - 1].modifier += val;
      } else {
        terms.push({ count: 0, sides: 0, modifier: val, rolls: [], dropped: [], tag: "main" });
      }
    }
  }

  return terms;
}

/* ================ Core Roll ================ */

function rollDie(sides: number): number {
  if (sides <= 0) return 0;
  return Math.floor(Math.random() * sides) + 1;
}

function rollDiceTerm(term: DiceTerm): DiceTerm {
  if (term.count === 0 || term.sides === 0) {
    return { ...term, rolls: [], dropped: [] };
  }

  const allRolls: number[] = [];
  for (let i = 0; i < term.count; i++) {
    allRolls.push(rollDie(term.sides));
  }

  // Keep highest (advantage)
  if (term.keepHigh !== undefined && term.keepHigh < allRolls.length) {
    const sorted = [...allRolls].sort((a, b) => b - a);
    const kept = sorted.slice(0, term.keepHigh);
    const dropped = sorted.slice(term.keepHigh);
    return { ...term, rolls: kept, dropped };
  }

  // Keep lowest (disadvantage)
  if (term.keepLow !== undefined && term.keepLow < allRolls.length) {
    const sorted = [...allRolls].sort((a, b) => a - b);
    const kept = sorted.slice(0, term.keepLow);
    const dropped = sorted.slice(term.keepLow);
    return { ...term, rolls: kept, dropped };
  }

  return { ...term, rolls: allRolls, dropped: [] };
}

/**
 * Roll a single dice expression (e.g. "2d6+3", "1d20+5") with optional context.
 * Returns a full RollResult with breakdown.
 */
export function roll(expression: string, ctx?: RollContext): RollResult {
  let terms = parseExpression(expression);

  // Apply advantage/disadvantage to d20 terms
  const hasAdv = ctx?.advantage === true && ctx?.disadvantage !== true;
  const hasDis = ctx?.disadvantage === true && ctx?.advantage !== true;
  // If both advantage AND disadvantage → cancel (RAW: neither applies)
  const bothCancel = ctx?.advantage === true && ctx?.disadvantage === true;

  if (hasAdv && !bothCancel) {
    terms = terms.map((t) =>
      t.sides === 20 && t.count === 1
        ? { ...t, count: 2, keepHigh: 1 }
        : t
    );
  } else if (hasDis && !bothCancel) {
    terms = terms.map((t) =>
      t.sides === 20 && t.count === 1
        ? { ...t, count: 2, keepLow: 1 }
        : t
    );
  }

  // Roll all terms
  let rolledTerms = terms.map(rollDiceTerm);

  // Handle Portent (replace roll)
  if (ctx?.replaceWith !== undefined) {
    rolledTerms = rolledTerms.map((t) => {
      if (t.sides === 20) {
        const replacedDie = ctx.replaceWith!;
        return { ...t, rolls: [replacedDie], dropped: t.rolls, tag: "replaced" };
      }
      return t;
    });
  }

  // Handle reroll (Lucky) — reroll the d20 once and keep the better result
  if (ctx?.rerollOnce) {
    rolledTerms = rolledTerms.map((t) => {
      if (t.sides === 20 && t.rolls.length > 0) {
        const original = t.rolls[0];
        const newRoll = rollDie(20);
        if (newRoll > original) {
          return { ...t, rolls: [newRoll], dropped: [original], tag: "reroll" };
        }
        return { ...t, rolls: [original], dropped: [newRoll], tag: "reroll" };
      }
      return t;
    });
  }

  // Add bonus dice (e.g. Bless +1d4)
  if (ctx?.bonusDice) {
    for (const bd of ctx.bonusDice) {
      const bonusTerms = parseExpression(bd);
      let rolledBonus = bonusTerms.map(rollDiceTerm);
      rolledBonus = rolledBonus.map((t) => ({ ...t, tag: "bonus" }));
      rolledTerms.push(...rolledBonus);
    }
  }

  // Add penalty dice (e.g. Bane -1d4)
  if (ctx?.penaltyDice) {
    for (const pd of ctx.penaltyDice) {
      const penaltyTerms = parseExpression(pd);
      let rolledPenalty = penaltyTerms.map(rollDiceTerm);
      rolledPenalty = rolledPenalty.map((t) => ({ ...t, tag: "penalty", modifier: -Math.abs(t.modifier) }));
      // Make penalty dice subtract
      rolledPenalty = rolledPenalty.map((t) => {
        const diceSum = t.rolls.reduce((a, b) => a + b, 0);
        return { ...t, modifier: -diceSum - t.modifier, rolls: t.rolls, dropped: [], tag: "penalty" };
      });
      rolledTerms.push(...rolledPenalty);
    }
  }

  // Calculate totals
  let diceTotal = 0;
  let modifierTotal = 0;
  let naturalDie: number | null = null;

  for (const t of rolledTerms) {
    if (t.tag === "penalty") {
      // Penalty dice subtract their roll sum
      const diceSum = t.rolls.reduce((a, b) => a + b, 0);
      diceTotal -= diceSum;
    } else if (t.tag === "bonus") {
      const diceSum = t.rolls.reduce((a, b) => a + b, 0);
      diceTotal += diceSum;
    } else {
      const diceSum = t.rolls.reduce((a, b) => a + b, 0);
      diceTotal += diceSum;
      modifierTotal += t.modifier;
      // Track natural die for d20
      if (t.sides === 20 && naturalDie === null && t.rolls.length > 0) {
        naturalDie = t.rolls[0];
      }
    }
  }

  const total = diceTotal + modifierTotal;
  const critThreshold = ctx?.critThreshold ?? 20;
  const isCrit = naturalDie !== null && naturalDie >= critThreshold;
  const isFumble = naturalDie !== null && naturalDie === 1;

  // Build history string
  const parts: string[] = [];
  for (const t of rolledTerms) {
    if (t.count === 0 && t.sides === 0) {
      parts.push(`${t.modifier >= 0 ? "+" : ""}${t.modifier}`);
    } else if (t.tag === "penalty") {
      parts.push(`-${t.rolls.join(",")}`);
    } else if (t.tag === "bonus") {
      parts.push(`+${t.rolls.join(",")}`);
    } else {
      const diceStr = t.rolls.join("+");
      const droppedStr = t.dropped.length > 0 ? ` (drop ${t.dropped.join(",")})` : "";
      const modStr = t.modifier !== 0 ? `${t.modifier >= 0 ? "+" : ""}${t.modifier}` : "";
      parts.push(`d${t.sides}(${diceStr})${droppedStr}${modStr}`);
    }
  }
  const history = parts.join(" · ") + ` = ${total}`;

  return {
    terms: rolledTerms,
    total,
    diceTotal,
    modifierTotal,
    naturalDie,
    isCrit,
    isFumble,
    isAdvantage: hasAdv && !bothCancel,
    isDisadvantage: hasDis && !bothCancel,
    history,
    rerolled: ctx?.rerollOnce === true,
    replaced: ctx?.replaceWith !== undefined,
  };
}

/* ================ Convenience Functions ================ */

/** Simple roll — returns just the total (backwards compatible with old rollFormula) */
export function rollSimple(expression: string): { total: number; rolls: number[]; mod: number; formula: string } {
  const result = roll(expression);
  const allRolls: number[] = [];
  let mod = 0;
  for (const t of result.terms) {
    allRolls.push(...t.rolls);
    mod += t.modifier;
  }
  return { total: result.total, rolls: allRolls, mod, formula: expression };
}

/** Roll a single d20 with modifier — returns die, total, and advantage info */
export function rollD20(modifier: number, adv: "none" | "advantage" | "disadvantage" = "none", ctx?: Partial<RollContext>): {
  die: number; other: number | null; mod: number; total: number; adv: string;
  isCrit: boolean; isFumble: boolean; result?: RollResult;
} {
  const fullCtx: RollContext = {
    ...ctx,
    advantage: adv === "advantage" || ctx?.advantage,
    disadvantage: adv === "disadvantage" || ctx?.disadvantage,
  };
  const result = roll(`1d20+${modifier}`, fullCtx);
  const mainTerm = result.terms.find((t) => t.sides === 20);
  const die = mainTerm?.rolls[0] ?? 0;
  const other = mainTerm?.dropped[0] ?? null;

  return {
    die,
    other,
    mod: modifier,
    total: result.total,
    adv,
    isCrit: result.isCrit,
    isFumble: result.isFumble,
    result,
  };
}

/** Roll for damage with optional crit (doubles dice) */
export function rollDamage(damageExpr: string, isCrit: boolean = false, ctx?: Partial<RollContext>): RollResult {
  if (isCrit) {
    // Double the dice by parsing and doubling count
    const terms = parseExpression(damageExpr);
    const doubledExpr = terms.map((t) => `${t.count * 2}d${t.sides}${t.modifier !== 0 ? (t.modifier >= 0 ? "+" : "") + t.modifier : ""}`).join("+");
    return roll(doubledExpr, ctx);
  }
  return roll(damageExpr, ctx);
}

/** Recharge roll for monster abilities — d6, success on >= threshold */
export function rollRecharge(threshold: number): { roll: number; success: boolean } {
  const r = rollDie(6);
  return { roll: r, success: r >= threshold };
}

/** Random table roll — roll on a table (d20, d100, d12, etc.) */
export function rollTable(sides: number): number {
  return rollDie(sides);
}

/** Wild magic roll — d100 */
export function rollWildMagic(): number {
  return rollDie(100);
}

/** Contest roll — both sides roll, compare totals */
export function rollContest(modA: number, modB: number, advA: "none" | "advantage" | "disadvantage" = "none"): {
  rollA: number; totalA: number; rollB: number; totalB: number; winner: "A" | "B" | "tie";
} {
  const resultA = rollD20(modA, advA);
  const resultB = rollD20(modB, "none");
  let winner: "A" | "B" | "tie" = "tie";
  if (resultA.total > resultB.total) winner = "A";
  else if (resultB.total > resultA.total) winner = "B";
  return {
    rollA: resultA.die,
    totalA: resultA.total,
    rollB: resultB.die,
    totalB: resultB.total,
    winner,
  };
}

/** Passive check — 10 + modifier (no roll) */
export function passiveCheck(modifier: number): number {
  return 10 + modifier;
}
