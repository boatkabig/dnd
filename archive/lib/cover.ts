/**
 * Cover & Positioning System — กำบังและตำแหน่ง (20.1–20.9)
 */

/* ======================================================================
 * 20.1 POSITION
 * ====================================================================== */

export interface Position {
  x: number;
  y: number;
  z?: number;            // elevation (0 = ground level)
  facing?: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
}

/* ======================================================================
 * 20.2 DISTANCE
 * ====================================================================== */

export function getDistance(a: Position, b: Position): number {
  // Manhattan distance on grid (each square = 5 ft)
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return (dx + dy) * 5; // return in feet
}

export function getGridDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); // in squares
}

export function isMeleeRange(a: Position, b: Position, reach: number = 1): boolean {
  return getGridDistance(a, b) <= reach;
}

export function isWithinRange(a: Position, b: Position, rangeFt: number): boolean {
  return getDistance(a, b) <= rangeFt;
}

/* ======================================================================
 * 20.3 COVER
 * ====================================================================== */

export type CoverLevel = "none" | "half" | "three_quarter" | "total";

export const COVER_AC_BONUS: Record<CoverLevel, number> = {
  none: 0,
  half: 2,           // +2 AC
  three_quarter: 5,  // +5 AC
  total: 999,         // can't be targeted
};

export const COVER_DEX_SAVE_BONUS: Record<CoverLevel, number> = {
  none: 0,
  half: 2,           // +2 DEX saves
  three_quarter: 5,  // +5 DEX saves
  total: 999,
};

export const COVER_LABEL_TH: Record<CoverLevel, string> = {
  none: "ไม่มีกำบัง",
  half: "กำบังครึ่ง (+2 AC)",
  three_quarter: "กำบัง 3/4 (+5 AC)",
  total: "กำบังเต็ม (ไม่ถูกเป้าได้)",
};

/* ======================================================================
 * 20.4 COVER CALCULATION
 * ====================================================================== */

/**
 * Calculate cover level from attacker to target.
 * Checks for obstacles (walls, pillars, etc.) between them.
 */
export function calculateCover(
  attacker: Position,
  target: Position,
  obstacles: { pos: Position; coverLevel: CoverLevel }[],
): { cover: CoverLevel; blockingObstacle?: string } {
  // Use Bresenham line to check obstacles between attacker and target
  let x0 = attacker.x, y0 = attacker.y;
  const x1 = target.x, y1 = target.y;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let bestCover: CoverLevel = "none";

  while (true) {
    if (x0 === x1 && y0 === y1) break;
    if (!(x0 === attacker.x && y0 === attacker.y)) {
      // Check obstacles at this position
      const obstacle = obstacles.find((o) => o.pos.x === x0 && o.pos.y === y0);
      if (obstacle) {
        // Take the best cover
        const levels: CoverLevel[] = ["none", "half", "three_quarter", "total"];
        if (levels.indexOf(obstacle.coverLevel) > levels.indexOf(bestCover)) {
          bestCover = obstacle.coverLevel;
        }
      }
    }
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }

  return { cover: bestCover };
}

/* ======================================================================
 * 20.5 LINE OF ATTACK
 * ====================================================================== */

export function hasLineOfAttack(
  attacker: Position,
  target: Position,
  walls: Position[],
): { canAttack: boolean; blockedBy?: Position } {
  // Same as line of sight but only blocked by total cover (walls)
  let x0 = attacker.x, y0 = attacker.y;
  const x1 = target.x, y1 = target.y;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (x0 === x1 && y0 === y1) break;
    if (!(x0 === attacker.x && y0 === attacker.y)) {
      if (walls.some((w) => w.x === x0 && w.y === y0)) {
        return { canAttack: false, blockedBy: { x: x0, y: y0 } };
      }
    }
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return { canAttack: true };
}

/* ======================================================================
 * 20.6 HEIGHT ADVANTAGE
 * ====================================================================== */

export function hasHighGround(attacker: Position, target: Position): boolean {
  if (attacker.z === undefined || target.z === undefined) return false;
  return attacker.z > target.z;
}

export function getHighGroundBonus(attacker: Position, target: Position): { bonus: number; reasonTh: string } {
  if (hasHighGround(attacker, target)) {
    return { bonus: 2, reasonTh: "ที่สูง — +2 โจมตี (Homebrew)" };
  }
  return { bonus: 0, reasonTh: "" };
}

/* ======================================================================
 * 20.7 AREA POSITIONING
 * ====================================================================== */

export type FormationType = "line" | "circle" | "scattered" | "tight" | "flanking";

export function isFlanking(
  ally: Position,
  target: Position,
  enemy: Position,
): boolean {
  // Flanking: ally and enemy are on opposite sides of target
  const allyToTarget = { x: target.x - ally.x, y: target.y - ally.y };
  const enemyToTarget = { x: target.x - enemy.x, y: target.y - enemy.y };
  // Opposite if vectors are roughly opposite
  return (allyToTarget.x === -enemyToTarget.x && allyToTarget.y === -enemyToTarget.y);
}

export function isChokePoint(positions: Position[], width: number = 1): boolean {
  // Simplified: if all positions are in a line with width 1, it's a choke point
  const xs = Array.from(new Set(positions.map((p) => p.x)));
  const ys = Array.from(new Set(positions.map((p) => p.y)));
  return xs.length <= width || ys.length <= width;
}

/* ======================================================================
 * 20.8 FORCED POSITION CHANGE
 * ====================================================================== */

export type ForcedMovementType = "push" | "pull" | "knockback" | "teleport" | "fall";

export interface ForcedMovement {
  type: ForcedMovementType;
  distance: number;       // ft
  direction?: { x: number; y: number };
  provokesOpportunity: boolean;
  reasonTh: string;
}

export function createPush(distanceFt: number, direction: { x: number; y: number }, source: string = "Shove"): ForcedMovement {
  return { type: "push", distance: distanceFt, direction, provokesOpportunity: false, reasonTh: `ถูกผลัก ${distanceFt} ฟุต จาก ${source}` };
}

export function createPull(distanceFt: number, source: string = "Thunderwave"): ForcedMovement {
  return { type: "pull", distance: distanceFt, provokesOpportunity: false, reasonTh: `ถูกดึง ${distanceFt} ฟุต จาก ${source}` };
}

export function createKnockback(distanceFt: number, source: string = "Explosion"): ForcedMovement {
  return { type: "knockback", distance: distanceFt, provokesOpportunity: false, reasonTh: `ถูกกระเด็น ${distanceFt} ฟุต จาก ${source}` };
}

export function createTeleport(distanceFt: number, source: string = "Misty Step"): ForcedMovement {
  return { type: "teleport", distance: distanceFt, provokesOpportunity: false, reasonTh: `เทเลพอร์ต ${distanceFt} ฟุต จาก ${source}` };
}

export function createFall(distanceFt: number): ForcedMovement {
  return { type: "fall", distance: distanceFt, provokesOpportunity: false, reasonTh: `ตกจากที่สูง ${distanceFt} ฟุต` };
}

/* ======================================================================
 * 20.9 POSITION EVENTS
 * ====================================================================== */

export type PositionEvent = "enter_area" | "leave_area" | "become_adjacent" | "enter_range" | "leave_range" | "fall";

export interface PositionTrigger {
  event: PositionEvent;
  area?: { x: number; y: number; radius: number };  // for enter/leave area
  range?: number;                                     // for enter/leave range
  action: string;
  descriptionTh: string;
}

export function checkPositionTriggers(
  oldPos: Position,
  newPos: Position,
  triggers: PositionTrigger[],
  referencePos?: Position,
): PositionTrigger[] {
  const fired: PositionTrigger[] = [];

  for (const trigger of triggers) {
    switch (trigger.event) {
      case "enter_area":
        if (trigger.area) {
          const wasOutside = Math.abs(oldPos.x - trigger.area.x) + Math.abs(oldPos.y - trigger.area.y) > trigger.area.radius;
          const isInside = Math.abs(newPos.x - trigger.area.x) + Math.abs(newPos.y - trigger.area.y) <= trigger.area.radius;
          if (wasOutside && isInside) fired.push(trigger);
        }
        break;
      case "leave_area":
        if (trigger.area) {
          const wasInside = Math.abs(oldPos.x - trigger.area.x) + Math.abs(oldPos.y - trigger.area.y) <= trigger.area.radius;
          const isOutside = Math.abs(newPos.x - trigger.area.x) + Math.abs(newPos.y - trigger.area.y) > trigger.area.radius;
          if (wasInside && isOutside) fired.push(trigger);
        }
        break;
      case "enter_range":
        if (trigger.range && referencePos) {
          const wasOutside = getDistance(oldPos, referencePos) > trigger.range;
          const isInside = getDistance(newPos, referencePos) <= trigger.range;
          if (wasOutside && isInside) fired.push(trigger);
        }
        break;
      case "leave_range":
        if (trigger.range && referencePos) {
          const wasInside = getDistance(oldPos, referencePos) <= trigger.range;
          const isOutside = getDistance(newPos, referencePos) > trigger.range;
          if (wasInside && isOutside) fired.push(trigger);
        }
        break;
      case "fall":
        if (newPos.z !== undefined && oldPos.z !== undefined && newPos.z < oldPos.z) {
          fired.push(trigger);
        }
        break;
    }
  }

  return fired;
}
