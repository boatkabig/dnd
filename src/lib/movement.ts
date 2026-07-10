/**
 * Movement System — 3-layer architecture.
 *
 * Layer 1: Movement Capability — what CAN the character do? (speeds, restrictions)
 * Layer 2: Movement Execution  — HOW does the character move? (walk, crawl, dash, teleport, etc.)
 * Layer 3: Movement Resolution — what HAPPENS during/after movement? (terrain, opportunity, traps, visibility)
 *
 * This separation lets the AI DM plan routes, assess risk, and reason about movement
 * more effectively than a single monolithic module.
 */

import { mod } from "./gameData";

/* ======================================================================
 * LAYER 1: MOVEMENT CAPABILITY
 * What speeds does the character have? What restricts them?
 * ====================================================================== */

export interface MovementSpeeds {
  walk: number;        // ft per round
  climb?: number;
  swim?: number;
  fly?: number;
  hover?: boolean;     // can hover in place while flying
  burrow?: number;
}

export interface MovementRestriction {
  type: "grappled" | "restrained" | "stunned" | "paralyzed" | "petrified" | "exhausted" | "encumbrance" | "magical";
  speedMultiplier: number;  // 0 = can't move, 0.5 = half speed, 1 = normal
  description: string;
  descriptionTh: string;
}

/** Condition → movement restriction mapping */
export const CONDITION_MOVEMENT: Record<string, MovementRestriction> = {
  grappled: { type: "grappled", speedMultiplier: 0, description: "Speed becomes 0", descriptionTh: "ความเร็วเป็น 0" },
  restrained: { type: "restrained", speedMultiplier: 0, description: "Speed becomes 0", descriptionTh: "ความเร็วเป็น 0" },
  stunned: { type: "stunned", speedMultiplier: 0, description: "Cannot move", descriptionTh: "เคลื่อนที่ไม่ได้" },
  paralyzed: { type: "paralyzed", speedMultiplier: 0, description: "Cannot move", descriptionTh: "เคลื่อนที่ไม่ได้" },
  petrified: { type: "petrified", speedMultiplier: 0, description: "Cannot move", descriptionTh: "เคลื่อนที่ไม่ได้" },
  prone: { type: "magical", speedMultiplier: 0.5, description: "Crawling costs double; standing costs half speed", descriptionTh: "คลานใช้ movement x2; ลุกขึ้นใช้ movement ครึ่งหนึ่ง" },
  exhausted: { type: "exhausted", speedMultiplier: 0.5, description: "Speed halved (Exhaustion Lv2+)", descriptionTh: "ความเร็วลดครึ่ง (Exhaustion Lv2+)" },
};

/**
 * Get effective speed for a character given their conditions and buffs.
 */
export function getEffectiveSpeed(
  baseSpeed: number,
  conditions: string[],
  buffs: any[],
  encumbranceLevel: number = 0,  // 0=none, 1=encumbered (speed -10), 2=heavily encumbered (speed -20)
): { speed: number; restrictions: MovementRestriction[]; canMove: boolean } {
  const restrictions: MovementRestriction[] = [];

  // Check conditions
  for (const cond of conditions) {
    const r = CONDITION_MOVEMENT[cond];
    if (r) restrictions.push(r);
  }

  // If any restriction sets speed to 0, can't move
  const hardStop = restrictions.some((r) => r.speedMultiplier === 0);
  if (hardStop) {
    return { speed: 0, restrictions, canMove: false };
  }

  // Apply multipliers (take the worst)
  let speed = baseSpeed;
  for (const r of restrictions) {
    if (r.speedMultiplier < 1) {
      speed = Math.min(speed, Math.floor(baseSpeed * r.speedMultiplier));
    }
  }

  // Encumbrance
  if (encumbranceLevel === 1) speed = Math.max(0, speed - 10);
  if (encumbranceLevel === 2) speed = Math.max(0, speed - 20);

  // Movement buffs (Haste doubles, Longstrider +10, Slow halves)
  for (const buff of buffs || []) {
    if (buff.name === "Haste") speed = Math.floor(speed * 2);
    else if (buff.name === "Slow") speed = Math.floor(speed / 2);
    else if (buff.name === "Longstrider") speed += 10;
  }

  return { speed, restrictions, canMove: speed > 0 };
}

/* ======================================================================
 * LAYER 2: MOVEMENT EXECUTION
 * HOW does the character move?
 * ====================================================================== */

export type MovementType = "walk" | "crawl" | "climb" | "swim" | "fly" | "burrow" | "teleport" | "forced" | "fall";

export interface MovementAction {
  type: MovementType;
  distance: number;       // ft
  cost: number;           // movement points consumed
  actionCost?: string;    // "1 Action" for Dash, "Free" for normal, null for forced
  description: string;
  descriptionTh: string;
  provokesOpportunity: boolean;  // does this provoke opportunity attacks?
  passesThroughTerrain: boolean; // does this interact with terrain? (teleport = false)
}

/**
 * Calculate movement cost for walking on normal terrain.
 * 5 ft = 1 movement point. Difficult terrain = 2x.
 */
export function walkCost(distanceFt: number, difficultTerrain: boolean = false): number {
  return difficultTerrain ? Math.ceil(distanceFt / 5) * 2 : Math.ceil(distanceFt / 5);
}

/**
 * Crawl (while Prone): costs double movement.
 */
export function crawlCost(distanceFt: number, difficultTerrain: boolean = false): number {
  return walkCost(distanceFt, difficultTerrain) * 2;
}

/**
 * Stand up from Prone: costs half your speed.
 */
export function standUpCost(speed: number): number {
  return Math.floor(speed / 2 / 5); // in movement points (5ft = 1 point)
}

/**
 * Dash: adds speed equal to your current speed (uses 1 Action).
 */
export function dashBonus(speed: number): number {
  return Math.floor(speed / 5); // additional movement points
}

/**
 * Long Jump: distance = STR score (if running) or half (if standing).
 * Uses movement equal to jump distance.
 */
export function longJump(strScore: number, hasRunningStart: boolean): { distance: number; movementCost: number } {
  const distance = hasRunningStart ? strScore : Math.floor(strScore / 2);
  return { distance, movementCost: Math.ceil(distance / 5) };
}

/**
 * High Jump: height = 3 + STR mod (if running) or half (if standing).
 * Uses movement equal to jump distance.
 */
export function highJump(strScore: number, hasRunningStart: boolean): { height: number; movementCost: number } {
  const strMod = mod(strScore);
  const height = hasRunningStart ? 3 + strMod : Math.floor((3 + strMod) / 2);
  return { height: Math.max(0, height), movementCost: 1 }; // ~1 square of movement
}

/**
 * Climb: costs 2x movement (unless you have climb speed).
 */
export function climbCost(distanceFt: number, hasClimbSpeed: boolean): number {
  return hasClimbSpeed ? walkCost(distanceFt) : walkCost(distanceFt) * 2;
}

/**
 * Swim: costs 2x movement (unless you have swim speed).
 */
export function swimCost(distanceFt: number, hasSwimSpeed: boolean): number {
  return hasSwimSpeed ? walkCost(distanceFt) : walkCost(distanceFt) * 2;
}

/**
 * Fly: costs 1x movement (same as walking).
 */
export function flyCost(distanceFt: number): number {
  return walkCost(distanceFt);
}

/**
 * Teleport: no movement cost, no terrain interaction, no opportunity attack.
 */
export function teleport(distanceFt: number): MovementAction {
  return {
    type: "teleport",
    distance: distanceFt,
    cost: 0,
    actionCost: "1 Bonus Action",
    description: `Teleport ${distanceFt} ft`,
    descriptionTh: `เทเลพอร์ต ${distanceFt} ฟุต`,
    provokesOpportunity: false,
    passesThroughTerrain: false,
  };
}

/**
 * Forced movement (shove, thunderwave, gust): doesn't use own movement,
 * doesn't provoke opportunity attack (usually).
 */
export function forcedMovement(distanceFt: number, source: string): MovementAction {
  return {
    type: "forced",
    distance: distanceFt,
    cost: 0,
    actionCost: undefined,
    description: `Pushed ${distanceFt} ft by ${source}`,
    descriptionTh: `ถูกผลัก ${distanceFt} ฟุต จาก ${source}`,
    provokesOpportunity: false,
    passesThroughTerrain: true,
  };
}

/**
 * Squeeze through narrow space: costs 1x movement but attacks against
 * the creature have advantage while squeezing.
 */
export function squeezeCost(distanceFt: number): number {
  return walkCost(distanceFt); // same cost, but disadvantage on attacks/advantage to attackers
}

/* ======================================================================
 * LAYER 3: MOVEMENT RESOLUTION
 * What happens during/after movement?
 * ====================================================================== */

export interface TerrainEffect {
  name: string;
  nameTh: string;
  difficult: boolean;          // costs 2x movement
  damage?: string;             // e.g. "1d6 fire" for lava
  damageType?: string;
  saveDC?: number;              // save to avoid effect
  saveAbility?: string;        // "dex", "con", etc.
  saveSuccess?: "half" | "none" | "negate";
  knockProne?: boolean;
  description: string;
  descriptionTh: string;
}

export const TERRAIN_TYPES: Record<string, TerrainEffect> = {
  normal: { name: "Normal", nameTh: "ปกติ", difficult: false, description: "Normal terrain", descriptionTh: "พื้นปกติ" },
  difficult: { name: "Difficult Terrain", nameTh: "พื้นที่ลำบาก", difficult: true, description: "Costs 2x movement", descriptionTh: "ใช้ movement x2" },
  ice: { name: "Ice", nameTh: "น้ำแข็ง", difficult: true, knockProne: true, saveDC: 10, saveAbility: "dex", saveSuccess: "negate",
    description: "DC 10 DEX save or fall prone", descriptionTh: "ทอย DEX save DC 10 ไม่ผ่านจะล้ม" },
  lava: { name: "Lava", nameTh: "ลาวา", difficult: false, damage: "1d6 fire", damageType: "fire", saveDC: 0,
    description: "1d6 fire damage per square", descriptionTh: "โดน 1d6 fire damage ต่อช่อง" },
  water_shallow: { name: "Shallow Water", nameTh: "น้ำตื้น", difficult: true, description: "Difficult terrain", descriptionTh: "พื้นที่ลำบาก" },
  water_deep: { name: "Deep Water", nameTh: "น้ำลึก", difficult: true, description: "Must swim", descriptionTh: "ต้องว่ายน้ำ" },
  web: { name: "Web", nameTh: "ใยแมงมุม", difficult: true, saveDC: 12, saveAbility: "str", saveSuccess: "negate",
    description: "DC 12 STR save or restrained", descriptionTh: "ทอย STR save DC 12 ไม่ผ่านจะถูกตรึง" },
  spike_growth: { name: "Spike Growth", nameTh: "หนามเจริญ", difficult: true, damage: "2d4 piercing", damageType: "piercing",
    description: "2d4 piercing damage per square", descriptionTh: "โดน 2d4 piercing damage ต่อช่อง" },
  grease: { name: "Grease", nameTh: "น้ำมัน", difficult: false, knockProne: true, saveDC: 10, saveAbility: "dex", saveSuccess: "negate",
    description: "DC 10 DEX save or fall prone", descriptionTh: "ทอย DEX save DC 10 ไม่ผ่านจะล้ม" },
};

export interface OpportunityAttackCheck {
  provokes: boolean;
  reason: string;
  reasonTh: string;
}

/**
 * Check if moving from A to B provokes opportunity attacks.
 * Provokes when leaving an enemy's reach (adjacent square) unless:
 * - Disengage action used
 * - Teleporting
 * - Forced movement
 */
export function checkOpportunityAttack(
  fromPos: { x: number; y: number },
  toPos: { x: number; y: number },
  enemyPositions: { uid: string; pos: { x: number; y: number }; reach: number }[],
  movementType: MovementType,
  disengaged: boolean,
): OpportunityAttackCheck {
  // Teleport and forced movement don't provoke
  if (movementType === "teleport" || movementType === "forced") {
    return { provokes: false, reason: "Teleport/forced movement doesn't provoke", reasonTh: "เทเลพอร์ต/ถูกผลัก ไม่กระตุ้น Opportunity Attack" };
  }
  // Disengage prevents all opportunity attacks
  if (disengaged) {
    return { provokes: false, reason: "Disengaged", reasonTh: "ใช้ Disengage — ไม่โดน Opportunity Attack" };
  }

  // Check if leaving any enemy's reach
  for (const enemy of enemyPositions) {
    const distFrom = Math.abs(fromPos.x - enemy.pos.x) + Math.abs(fromPos.y - enemy.pos.y);
    const distTo = Math.abs(toPos.x - enemy.pos.x) + Math.abs(toPos.y - enemy.pos.y);
    // If we were in reach but now we're not → provokes
    if (distFrom <= enemy.reach && distTo > enemy.reach) {
      return {
        provokes: true,
        reason: `Leaving ${enemy.uid}'s reach`,
        reasonTh: `ออกจากระยะประชิดของ ${enemy.uid} — โดน Opportunity Attack!`,
      };
    }
  }

  return { provokes: false, reason: "Not leaving reach", reasonTh: "ไม่ออกจากระยะประชิด" };
}

/**
 * Check if a square is occupied (can't move there).
 */
export function isSquareOccupied(
  pos: { x: number; y: number },
  creaturePositions: { x: number; y: number; size?: number }[],
): boolean {
  return creaturePositions.some((c) => c.x === pos.x && c.y === pos.y);
}

/**
 * Check line of movement — can the character move from A to B?
 * Simple check: no walls/obstacles in the way.
 */
export function canMoveTo(
  from: { x: number; y: number },
  to: { x: number; y: number },
  grid: { w: number; h: number },
  walls: { x: number; y: number }[],
  creatures: { x: number; y: number }[],
): { canMove: boolean; reason: string; reasonTh: string } {
  // Check bounds
  if (to.x < 0 || to.x >= grid.w || to.y < 0 || to.y >= grid.h) {
    return { canMove: false, reason: "Out of bounds", reasonTh: "ตำแหน่งนอกกริด" };
  }
  // Check walls
  if (walls.some((w) => w.x === to.x && w.y === to.y)) {
    return { canMove: false, reason: "Wall", reasonTh: "มีกำแพง" };
  }
  // Check occupied by creature
  if (isSquareOccupied(to, creatures)) {
    return { canMove: false, reason: "Occupied", reasonTh: "ช่องนั้นมีสิ่งมีชีวิตอยู่" };
  }
  return { canMove: true, reason: "OK", reasonTh: "ผ่าน" };
}

/**
 * Falling damage: 1d6 per 10 ft, capped at 20d6 (200 ft).
 */
export function fallDamage(distanceFt: number): { dice: string; diceCount: number; capped: boolean } {
  const dice = Math.min(20, Math.floor(distanceFt / 10));
  return { dice: `${dice}d6 bludgeoning`, diceCount: dice, capped: dice >= 20 };
}

/**
 * Calculate effective reach for a creature.
 * Default: 1 square (5 ft). Reach weapons: 2 squares (10 ft).
 */
export function getReach(weaponProperties: string[] = []): number {
  return weaponProperties.includes("reach") ? 2 : 1;
}

/* ======================================================================
 * PATHFINDING HELPER
 * ====================================================================== */

export interface PathSquare {
  x: number; y: number;
  cost: number;           // movement cost to reach this square
  terrain: string;        // terrain type key
  occupied: boolean;
  wall: boolean;
}

/**
 * Simple BFS pathfinding on the grid.
 * Returns the path as a list of {x, y} or null if no path.
 */
export function findPath(
  start: { x: number; y: number },
  end: { x: number; y: number },
  grid: { w: number; h: number },
  walls: { x: number; y: number }[],
  creatures: { x: number; y: number }[],
  terrainMap: Record<string, { x: number; y: number; type: string }>,
  maxDistance: number = 50,
): { x: number; y: number }[] | null {
  const visited = new Set<string>();
  const queue: { x: number; y: number; path: { x: number; y: number }[]; cost: number }[] = [
    { x: start.x, y: start.y, path: [{ x: start.x, y: start.y }], cost: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.cost > maxDistance) continue;
    if (current.x === end.x && current.y === end.y) return current.path;

    const key = `${current.x},${current.y}`;
    if (visited.has(key)) continue;
    visited.add(key);

    // Check 4 adjacent squares (Manhattan movement)
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dy] of dirs) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || nx >= grid.w || ny < 0 || ny >= grid.h) continue;
      if (walls.some((w) => w.x === nx && w.y === ny)) continue;

      // Terrain cost
      const terrainKey = terrainMap[`${nx},${ny}`]?.type || "normal";
      const terrain = TERRAIN_TYPES[terrainKey] || TERRAIN_TYPES.normal;
      const stepCost = terrain.difficult ? 2 : 1;

      // Can move through creatures (allies) but can't stop on them
      const occupied = creatures.some((c) => c.x === nx && c.y === ny);
      if (occupied && !(nx === end.x && ny === end.y)) continue;

      queue.push({
        x: nx, y: ny,
        path: [...current.path, { x: nx, y: ny }],
        cost: current.cost + stepCost,
      });
    }
  }

  return null; // no path found
}

/**
 * Get all squares within movement range (for highlighting on grid).
 * Returns list of {x, y, cost} for each reachable square.
 */
export function getReachableSquares(
  start: { x: number; y: number },
  movementPoints: number,
  grid: { w: number; h: number },
  walls: { x: number; y: number }[],
  creatures: { x: number; y: number }[],
  terrainMap: Record<string, { x: number; y: number; type: string }>,
): { x: number; y: number; cost: number }[] {
  const result: { x: number; y: number; cost: number }[] = [];
  const visited = new Map<string, number>();

  const queue: { x: number; y: number; cost: number }[] = [{ x: start.x, y: start.y, cost: 0 }];
  visited.set(`${start.x},${start.y}`, 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.cost >= movementPoints) continue;

    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dy] of dirs) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || nx >= grid.w || ny < 0 || ny >= grid.h) continue;
      if (walls.some((w) => w.x === nx && w.y === ny)) continue;
      if (creatures.some((c) => c.x === nx && c.y === ny)) continue;

      const terrainKey = terrainMap[`${nx},${ny}`]?.type || "normal";
      const terrain = TERRAIN_TYPES[terrainKey] || TERRAIN_TYPES.normal;
      const stepCost = terrain.difficult ? 2 : 1;
      const totalCost = current.cost + stepCost;

      const key = `${nx},${ny}`;
      const prevCost = visited.get(key);
      if (prevCost !== undefined && prevCost <= totalCost) continue;
      if (totalCost > movementPoints) continue;

      visited.set(key, totalCost);
      result.push({ x: nx, y: ny, cost: totalCost });
      queue.push({ x: nx, y: ny, cost: totalCost });
    }
  }

  return result;
}
