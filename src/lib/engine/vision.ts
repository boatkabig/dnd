/**
 * ============================================================================
 * D&D Engine Design Document — Chapter 18: Vision, Senses & Line of Sight
 * ============================================================================
 *
 * Version: 1.0
 * Target: D&D 5e (2024) Compatible
 * Architecture: Pure Vision Engine — no game state, no Character/Combat
 * references. This module is self-contained and is not yet wired into
 * combat.ts / actionEconomy.ts / effects.ts / the UI; a later phase bridges
 * its outputs into those systems.
 *
 * Core Principles:
 *   1. Pure Functions — every export is (input) -> output, no side effects.
 *   2. `Position` is re-used from ./movement (Chebyshev grid, 1 square = 5 ft)
 *      so this module shares the same coordinate space as the rest of the
 *      engine instead of inventing a second grid abstraction.
 *   3. Data in, decisions out. The combat layer decides what to DO with a
 *      PerceptionResult (e.g. impose disadvantage); this module only computes
 *      the facts (can-see, cover, obscurement, LOS).
 *
 * Public API
 * ----------------------------------------------------------------------------
 *   lineOfSight(a, b, obstacles?)        -> LineOfSightResult
 *     Bresenham centerline trace between two grid cells. Blocked only by
 *     obstacles whose `cover` is "total" (solid walls / terrain). This is a
 *     simplified single-line approximation of the 5e corner-to-corner cover
 *     rule (RAW traces from each corner of the attacker's space to each
 *     corner of the target's space); it is adequate for a digital grid VTT
 *     but will occasionally be stricter than a table using minis and rulers.
 *
 *   coverBetween(a, b, obstacles?)       -> CoverResult
 *     Best (highest) cover level found along the same centerline. none (+0),
 *     half (+2 AC/Dex save), threeQuarters (+5 AC/Dex save), or total
 *     (canBeTargeted = false). Only cells strictly between `a` and `b` are
 *     considered; an obstacle sitting exactly on the target's own cell does
 *     not grant it cover from itself.
 *
 *   obscurementAt(pos, env)              -> ObscurementResult
 *     Ambient obscurement at a single grid cell from lighting (dim ->
 *     lightly, darkness -> heavily) and/or physical obscurants (fog,
 *     foliage, smoke — independent of light level). This is a fact about
 *     the ENVIRONMENT, not about any particular observer's senses; canPerceive
 *     is what interprets it per-sense.
 *
 *   canPerceive(observer, target, ctx)   -> PerceptionResult
 *     Decides whether `observer` can perceive `target`, trying normal sight,
 *     darkvision, blindsight, tremorsense, and truesight (in that order,
 *     returning the first sense that succeeds) against the target's cell
 *     environment, invisibility, ground contact, and line of sight / cover
 *     between the two positions. See "Sense assumptions" below for the exact
 *     per-sense rules and the interpretation calls behind them.
 *
 *     IMPORTANT — perceive vs. targetable are different questions:
 *     `canPerceive: false` can mean either "you can't SEE it" (apply the
 *     unseen-target rule below) or "it has total cover" (can't be targeted at
 *     all, full stop — check `result.cover.canBeTargeted` FIRST; if false,
 *     no attack roll happens regardless of any sense). Only once
 *     canBeTargeted is true does attackVisibilityModifier's disadvantage/
 *     advantage apply.
 *
 *   attackVisibilityModifier(attackerSeesTarget, targetSeesAttacker)
 *                                         -> "advantage" | "disadvantage" | "none"
 *     2024 unseen-attacker / unseen-target rule, composed from two directional
 *     canPerceive() calls (attacker->target and target->attacker — lighting
 *     and invisibility can differ per direction, so this module intentionally
 *     does not try to guess the reverse call for you). If a target can't see
 *     its attacker, the attacker has advantage; if an attacker can't see its
 *     target, it has disadvantage; if both apply they cancel to "none" (5e's
 *     general rule: an equal number of advantage/disadvantage sources roll
 *     normally — this is also the well-known "two invisible creatures fight
 *     each other at a flat roll" case).
 *
 * Sense assumptions (documented interpretation calls — RAW is genuinely
 * ambiguous or table-dependent on some of these; change the SENSE_RULES table
 * below if your game rules differently):
 *   - normal sight / darkvision / truesight all require line of sight and are
 *     blocked by total cover (they are still "sight").
 *   - blindsight requires line of sight (blocked by total cover / walls) but
 *     ignores light, magical darkness, physical obscurants, and invisibility.
 *   - tremorsense ignores line of sight entirely (senses vibration through
 *     the ground, including through walls) and ignores light/obscurants/
 *     invisibility, but only detects targets in contact with the ground
 *     (`grounded`, defaults to true).
 *   - darkvision extends into (non-magical) darkness up to its range, but is
 *     defeated entirely by magical darkness (PHB: "magical darkness ...
 *     doesn't allow a creature to see through it with darkvision"). It does
 *     NOT pierce invisibility or heavy physical obscurants (fog/foliage).
 *   - truesight sees through normal AND magical darkness and sees invisible
 *     creatures, but per RAW it is not stated to see through mundane physical
 *     obscurants (fog, foliage, smoke) — those still block it, same as
 *     everyone else who relies on sight.
 *   - a blinded observer (`senses.blinded`) loses normal sight, darkvision,
 *     and truesight (all sight-based); blindsight and tremorsense are
 *     unaffected, since neither relies on sight.
 *   - `invisible` / `blinded` are plain booleans here (not imported from
 *     effects.ts's ConditionType) to keep this module decoupled; their
 *     string IDs there ("invisible", "blinded") line up 1:1 for an easy
 *     future bridge.
 *   - canPerceive only reads the environment at the TARGET's cell; it does
 *     not walk obscurants in intervening cells (e.g. fog halfway along the
 *     path is not modeled). A future phase can extend `ctx` with a per-cell
 *     light/obscurant lookup if that granularity is needed.
 * ============================================================================
 */

import type { Position } from "./movement";
import { distanceInFeet } from "./movement";

export type { Position };

// ============================================================================
// 1. LINE OF SIGHT & COVER
// ============================================================================

export type CoverLevel = "none" | "half" | "threeQuarters" | "total";

/** A grid cell that blocks or partially blocks a line between two other cells. */
export interface Obstacle {
  pos: Position;
  /** Cover this obstacle grants to whatever is behind it. "total" also fully blocks line of sight (solid walls/terrain). */
  cover: CoverLevel;
}

export interface LineOfSightResult {
  hasLineOfSight: boolean;
  /** The obstacle cell that blocked the line, if any. */
  blockedBy?: Position;
}

export interface CoverResult {
  level: CoverLevel;
  /** AC bonus for the defender: 0, 2, 5, or Infinity (total cover). */
  acBonus: number;
  /** Dexterity saving throw bonus for the defender: 0, 2, 5, or Infinity (total cover). */
  dexSaveBonus: number;
  /** False only for total cover — the target cannot be targeted by an attack at all. */
  canBeTargeted: boolean;
}

const COVER_RANK: Record<CoverLevel, number> = { none: 0, half: 1, threeQuarters: 2, total: 3 };

function coverResultFor(level: CoverLevel): CoverResult {
  switch (level) {
    case "none": return { level, acBonus: 0, dexSaveBonus: 0, canBeTargeted: true };
    case "half": return { level, acBonus: 2, dexSaveBonus: 2, canBeTargeted: true };
    case "threeQuarters": return { level, acBonus: 5, dexSaveBonus: 5, canBeTargeted: true };
    case "total": return { level, acBonus: Infinity, dexSaveBonus: Infinity, canBeTargeted: false };
  }
}

/** Bresenham grid cells strictly between `a` and `b` (excludes both endpoints). */
function cellsBetween(a: Position, b: Position): Position[] {
  const cells: Position[] = [];
  let x0 = a.x, y0 = a.y;
  const x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : x0 > x1 ? -1 : 0;
  const sy = y0 < y1 ? 1 : y0 > y1 ? -1 : 0;
  let err = dx - dy;
  while (!(x0 === x1 && y0 === y1)) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
    if (!(x0 === x1 && y0 === y1)) cells.push({ x: x0, y: y0 });
  }
  return cells;
}

/** Whether there is an unobstructed line between two grid positions (blocked only by "total" cover obstacles). */
export function lineOfSight(a: Position, b: Position, obstacles: Obstacle[] = []): LineOfSightResult {
  for (const cell of cellsBetween(a, b)) {
    const blocker = obstacles.find((o) => o.pos.x === cell.x && o.pos.y === cell.y && o.cover === "total");
    if (blocker) return { hasLineOfSight: false, blockedBy: { x: cell.x, y: cell.y } };
  }
  return { hasLineOfSight: true };
}

/** Best (highest) cover level between two grid positions, from obstacles lying strictly between them. */
export function coverBetween(a: Position, b: Position, obstacles: Obstacle[] = []): CoverResult {
  let best: CoverLevel = "none";
  for (const cell of cellsBetween(a, b)) {
    const obstacle = obstacles.find((o) => o.pos.x === cell.x && o.pos.y === cell.y);
    if (obstacle && COVER_RANK[obstacle.cover] > COVER_RANK[best]) {
      best = obstacle.cover;
      if (best === "total") break;
    }
  }
  return coverResultFor(best);
}

// ============================================================================
// 2. LIGHT & OBSCUREMENT
// ============================================================================

export type LightLevel = "bright" | "dim" | "darkness";
export type ObscurementLevel = "none" | "lightly" | "heavily";

export interface EnvironmentAt {
  light: LightLevel;
  /** True if the darkness/dimness here is magical in origin (e.g. the Darkness spell) — blocks normal darkvision. */
  magical?: boolean;
  /** Physical obscurement independent of illumination (fog, foliage, smoke). */
  obscurant?: "none" | "light" | "heavy";
}

export interface ObscurementResult {
  pos: Position;
  level: ObscurementLevel;
  /** Machine-readable contributing factors, e.g. ["darkness"], ["heavy_obscurant"]. */
  reasons: string[];
}

const OBSCUREMENT_RANK: Record<ObscurementLevel, number> = { none: 0, lightly: 1, heavily: 2 };

/** Ambient obscurement at a single grid cell, independent of any observer's senses. */
export function obscurementAt(pos: Position, env: EnvironmentAt): ObscurementResult {
  const reasons: string[] = [];
  let level: ObscurementLevel = "none";
  const bump = (lvl: ObscurementLevel, reason: string) => {
    reasons.push(reason);
    if (OBSCUREMENT_RANK[lvl] > OBSCUREMENT_RANK[level]) level = lvl;
  };
  if (env.light === "dim") bump("lightly", "dim_light");
  if (env.light === "darkness") bump("heavily", "darkness");
  if (env.obscurant === "light") bump("lightly", "light_obscurant");
  if (env.obscurant === "heavy") bump("heavily", "heavy_obscurant");
  return { pos, level, reasons };
}

// ============================================================================
// 3. SENSES & PERCEPTION
// ============================================================================

export type VisionType = "normal" | "darkvision" | "blindsight" | "tremorsense" | "truesight";

/** An observer's sense ranges in feet. Undefined/0 = sense not possessed. */
export interface SenseProfile {
  darkvisionRange?: number;
  blindsightRange?: number;
  tremorsenseRange?: number;
  truesightRange?: number;
  /** Observer has the Blinded condition — disables normal sight, darkvision, and truesight. */
  blinded?: boolean;
}

export interface Observer {
  pos: Position;
  senses: SenseProfile;
}

export interface PerceptionSubject {
  pos: Position;
  invisible?: boolean;
  /** Whether this subject is in contact with the ground (for tremorsense). Defaults to true. */
  grounded?: boolean;
}

export interface PerceptionContext {
  /** Ambient light + obscurant at the TARGET's position. */
  environment: EnvironmentAt;
  /** Obstacles between observer and target for line-of-sight / cover purposes. */
  obstacles?: Obstacle[];
}

export type PerceptionMethod = "sight" | "darkvision" | "blindsight" | "tremorsense" | "truesight" | "none";

export interface PerceptionResult {
  canPerceive: boolean;
  method: PerceptionMethod;
  obscurement: ObscurementResult;
  lineOfSight: LineOfSightResult;
  cover: CoverResult;
}

interface SenseRule {
  /** Ignores ambient light entirely (still subject to blockedByMagicalDarkness / ignoresObscurant below). */
  ignoresLight: boolean;
  /** Magical darkness defeats this sense even though ignoresLight is true (darkvision only). */
  blockedByMagicalDarkness: boolean;
  /** Ignores physical obscurants (fog/foliage/smoke). */
  ignoresObscurant: boolean;
  /** Can perceive an invisible subject. */
  ignoresInvisibility: boolean;
  /** Blocked by total-cover obstacles between observer and target. */
  requiresLineOfSight: boolean;
  /** Only perceives subjects in contact with the ground (tremorsense). */
  requiresGroundContact: boolean;
}

const SENSE_RULES: Record<VisionType, SenseRule> = {
  normal:      { ignoresLight: false, blockedByMagicalDarkness: false, ignoresObscurant: false, ignoresInvisibility: false, requiresLineOfSight: true,  requiresGroundContact: false },
  darkvision:  { ignoresLight: true,  blockedByMagicalDarkness: true,  ignoresObscurant: false, ignoresInvisibility: false, requiresLineOfSight: true,  requiresGroundContact: false },
  truesight:   { ignoresLight: true,  blockedByMagicalDarkness: false, ignoresObscurant: false, ignoresInvisibility: true,  requiresLineOfSight: true,  requiresGroundContact: false },
  blindsight:  { ignoresLight: true,  blockedByMagicalDarkness: false, ignoresObscurant: true,  ignoresInvisibility: true,  requiresLineOfSight: true,  requiresGroundContact: false },
  tremorsense: { ignoresLight: true,  blockedByMagicalDarkness: false, ignoresObscurant: true,  ignoresInvisibility: true,  requiresLineOfSight: false, requiresGroundContact: true },
};

function senseFeasible(
  type: VisionType,
  range: number,
  distanceFt: number,
  env: EnvironmentAt,
  targetInvisible: boolean,
  hasLineOfSight: boolean,
  targetGrounded: boolean,
): boolean {
  const rule = SENSE_RULES[type];
  if (distanceFt > range) return false;
  if (rule.requiresLineOfSight && !hasLineOfSight) return false;
  if (rule.requiresGroundContact && !targetGrounded) return false;
  if (targetInvisible && !rule.ignoresInvisibility) return false;
  if (!rule.ignoresObscurant && env.obscurant === "heavy") return false;
  if (rule.ignoresLight) {
    if (env.light === "darkness" && env.magical && rule.blockedByMagicalDarkness) return false;
  } else {
    if (env.light === "darkness") return false;
  }
  return true;
}

/** Whether `observer` can perceive `target`, and by which sense. */
export function canPerceive(observer: Observer, target: PerceptionSubject, ctx: PerceptionContext): PerceptionResult {
  const distanceFt = distanceInFeet(observer.pos, target.pos);
  const obstacles = ctx.obstacles ?? [];
  const los = lineOfSight(observer.pos, target.pos, obstacles);
  const cover = coverBetween(observer.pos, target.pos, obstacles);
  const obscurement = obscurementAt(target.pos, ctx.environment);
  const targetGrounded = target.grounded ?? true;
  const targetInvisible = !!target.invisible;
  const blinded = !!observer.senses.blinded;

  const candidates: { method: PerceptionMethod; type: VisionType; possessed: boolean; range: number }[] = [
    { method: "sight",       type: "normal",      possessed: !blinded,                                       range: Infinity },
    { method: "darkvision",  type: "darkvision",  possessed: !blinded && !!observer.senses.darkvisionRange,  range: observer.senses.darkvisionRange ?? 0 },
    { method: "blindsight",  type: "blindsight",  possessed: !!observer.senses.blindsightRange,               range: observer.senses.blindsightRange ?? 0 },
    { method: "tremorsense", type: "tremorsense", possessed: !!observer.senses.tremorsenseRange,              range: observer.senses.tremorsenseRange ?? 0 },
    { method: "truesight",   type: "truesight",   possessed: !blinded && !!observer.senses.truesightRange,   range: observer.senses.truesightRange ?? 0 },
  ];

  for (const c of candidates) {
    if (!c.possessed) continue;
    if (senseFeasible(c.type, c.range, distanceFt, ctx.environment, targetInvisible, los.hasLineOfSight, targetGrounded)) {
      return { canPerceive: true, method: c.method, obscurement, lineOfSight: los, cover };
    }
  }
  return { canPerceive: false, method: "none", obscurement, lineOfSight: los, cover };
}

/**
 * 2024 unseen-attacker / unseen-target rule, composed from two directional
 * canPerceive() results. See file header for the cancellation rule.
 */
export function attackVisibilityModifier(
  attackerCanSeeTarget: boolean,
  targetCanSeeAttacker: boolean,
): "advantage" | "disadvantage" | "none" {
  if (!attackerCanSeeTarget && !targetCanSeeAttacker) return "none";
  if (!attackerCanSeeTarget) return "disadvantage";
  if (!targetCanSeeAttacker) return "advantage";
  return "none";
}
