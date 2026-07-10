/**
 * ============================================================================
 * D&D Engine Design Document — Chapter 08: Movement & Positioning
 * ============================================================================
 *
 * Version: 1.0
 * Target: D&D 5e / 2024 Compatible
 * Architecture: 3-Layer — Capability → Execution → Resolution
 *
 * Core Principles:
 *   1. Position is abstract — supports Grid (5 ft squares), Hex, or Theater of Mind.
 *   2. Capability Layer: "Can the creature move at all?" (effects, conditions, speed)
 *   3. Execution Layer: "How much movement is allowed?" (Dash, difficult terrain)
 *   4. Resolution Layer: "Where does the creature end up?" (pathfinding, collision)
 *   5. Speed = base + modifiers (armor, conditions, effects, encumbrance).
 *   6. Movement cost: difficult terrain = 2×, climbing = 2×, swimming = 2×.
 *   7. Opportunity attacks: leaving enemy reach provokes (unless Disengage).
 *   8. Forced movement: push, pull, drag, teleport — never provoke opportunity attacks.
 *   9. Movement modes: walk, fly, swim, climb, burrow (each has its own speed).
 *
 * 3-Layer Pipeline:
 *   Layer 1 (Capability):
 *     - calculateSpeed(character) → walk, fly, swim, climb, burrow speeds
 *     - checkCanMove(character) → boolean (not paralyzed, not grappled, speed > 0)
 *   Layer 2 (Execution):
 *     - calculateMovementCost(path, terrain) → ft cost
 *     - dash(tracker) → doubles movement remaining
 *     - disengage(tracker) → no opportunity attacks this turn
 *   Layer 3 (Resolution):
 *     - findPath(start, end, grid) → A* path
 *     - canMoveTo(character, position) → boolean
 *     - moveCharacter(character, path) → updated character at new position
 *
 * Cross-References:
 *   - Character.ts (Chapter 01) → character.speed, character.position
 *   - Effects.ts (Chapter 06) → speed modifiers (Haste, Slow, Restrained)
 *   - ActionEconomy.ts (Chapter 02) → movement consumption, Dash action
 *   - Combat.ts (Chapter 03) → opportunity attacks, positioning during combat
 * ============================================================================
 */

import type { AbilityName, CreatureSize, SpeedSet } from "./character";

// ============================================================================
// 1. POSITION ABSTRACTION — Grid, Hex, or Theater of Mind
// ============================================================================

/**
 * Position is intentionally abstract — supports grid (x,y), hex (q,r), or
 * Theater of Mind (zone-based). Combat system uses Position to compute distance.
 */
export interface Position {
  x: number;
  y: number;
  /** Optional Z for 3D combat (flying, burrowing). */
  z?: number;
}

/** Distance between two positions using Chebyshev (8-way) — D&D 5e grid rule. */
export function gridDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Distance in feet (1 square = 5 ft in D&D 5e grid). */
export function distanceInFeet(a: Position, b: Position): number {
  return gridDistance(a, b) * 5;
}

/** Check if two positions are adjacent (within 1 square). */
export function isAdjacent(a: Position, b: Position): boolean {
  return gridDistance(a, b) <= 1;
}

/** Check if two positions are within `reach` feet of each other. */
export function isWithinReach(a: Position, b: Position, reach: number): boolean {
  return distanceInFeet(a, b) <= reach;
}

// ============================================================================
// 2. MOVEMENT MODES
// ============================================================================

export type MovementMode =
  | "walk"
  | "fly"
  | "swim"
  | "climb"
  | "burrow";

/**
 * Movement cost multiplier per mode.
 * D&D 5e: every foot of climbing, swimming, or crawling costs 1 extra foot
 * (i.e. 2× cost) unless the creature has a special speed for that mode.
 */
export const MOVEMENT_COST_MULTIPLIERS: Record<MovementMode, number> = {
  walk: 1,
  fly: 1,
  swim: 2,
  climb: 2,
  burrow: 1,
};

// ============================================================================
// 3. CAPABILITY LAYER — Can the creature move?
// ============================================================================

/**
 * Inputs needed for capability calculation.
 * Decoupled from Character — caller pulls ability mod + active effects.
 */
export interface SpeedCapabilityInput {
  /** Base speeds from species/armor. */
  baseSpeeds: SpeedSet;
  /** Active effect modifiers (e.g. Haste ×2, Slow ×0.5, Heavy Armor −10 ft). */
  speedModifiers: Array<{
    source: string;                  // effect instance ID
    type: "multiplier" | "flat";     // multiplier (0.5 = half) or flat (-10 ft)
    value: number;
    mode?: MovementMode;             // if specific to a movement mode
  }>;
  /** Active conditions that set speed to 0 (grappled, restrained, paralyzed). */
  zeroSpeedConditions: string[];     // condition IDs currently active
  /** Encumbrance: "none" | "light" (−10 ft) | "heavy" (−20 ft) | "over" (speed 0). */
  encumbranceLevel: "none" | "light" | "heavy" | "over";
  /** Creature size (affects nothing mechanically in 5e, but kept for UI). */
  size?: CreatureSize;
}

export interface SpeedCapability {
  walk: number;
  fly: number;
  swim: number;
  climb: number;
  burrow: number;
  /** True if any movement mode > 0 and not blocked by conditions. */
  canMove: boolean;
  /** Reason for immobility (if canMove is false). */
  immobilityReason?: string;
}

/**
 * Compute the effective speed for each movement mode.
 * Pipeline:
 *   1. Start with base speed for each mode
 *   2. Apply flat modifiers (armor, encumbrance)
 *   3. Apply multipliers (Haste ×2, Slow ×0.5)
 *   4. If zero-speed conditions active, set all to 0
 *   5. If encumbrance "over", set all to 0
 *
 * Returns speeds for all 5 modes (0 if unavailable).
 */
export function calculateSpeed(input: SpeedCapabilityInput): SpeedCapability {
  // Zero-speed conditions short-circuit
  if (input.zeroSpeedConditions.length > 0) {
    return {
      walk: 0, fly: 0, swim: 0, climb: 0, burrow: 0,
      canMove: false,
      immobilityReason: `Conditions: ${input.zeroSpeedConditions.join(", ")}`,
    };
  }
  if (input.encumbranceLevel === "over") {
    return {
      walk: 0, fly: 0, swim: 0, climb: 0, burrow: 0,
      canMove: false,
      immobilityReason: "Encumbrance: over capacity",
    };
  }

  // Start with base speeds
  let walk = input.baseSpeeds.walk;
  let fly = input.baseSpeeds.fly ?? 0;
  let swim = input.baseSpeeds.swim ?? 0;
  let climb = input.baseSpeeds.climb ?? 0;
  let burrow = input.baseSpeeds.burrow ?? 0;

  // Apply encumbrance (light: -10, heavy: -20)
  if (input.encumbranceLevel === "light") {
    walk = Math.max(0, walk - 10);
    fly = Math.max(0, fly - 10);
  } else if (input.encumbranceLevel === "heavy") {
    walk = Math.max(0, walk - 20);
    fly = Math.max(0, fly - 20);
  }

  // Apply modifiers
  for (const mod of input.speedModifiers) {
    if (mod.type === "flat") {
      if (!mod.mode || mod.mode === "walk") walk = Math.max(0, walk + mod.value);
      if (!mod.mode || mod.mode === "fly") fly = Math.max(0, fly + mod.value);
      if (!mod.mode || mod.mode === "swim") swim = Math.max(0, swim + mod.value);
      if (!mod.mode || mod.mode === "climb") climb = Math.max(0, climb + mod.value);
      if (!mod.mode || mod.mode === "burrow") burrow = Math.max(0, burrow + mod.value);
    } else {
      // Multiplier (e.g. Haste ×2, Slow ×0.5)
      if (!mod.mode || mod.mode === "walk") walk = Math.floor(walk * mod.value);
      if (!mod.mode || mod.mode === "fly") fly = Math.floor(fly * mod.value);
      if (!mod.mode || mod.mode === "swim") swim = Math.floor(swim * mod.value);
      if (!mod.mode || mod.mode === "climb") climb = Math.floor(climb * mod.value);
      if (!mod.mode || mod.mode === "burrow") burrow = Math.floor(burrow * mod.value);
    }
  }

  const canMove = walk > 0 || fly > 0 || swim > 0 || climb > 0 || burrow > 0;
  return { walk, fly, swim, climb, burrow, canMove };
}

// ============================================================================
// 4. EXECUTION LAYER — How much movement is allowed?
// ============================================================================

/**
 * Terrain types affecting movement cost.
 * Data-driven — adding a new terrain requires only a new entry.
 */
export type TerrainType =
  | "normal"
  | "difficult"        // 2× cost (heavy undergrowth, debris, shallow water)
  | "very_difficult"   // 3× cost (knee-deep snow, dense thorns — DM call)
  | "impassable"       // walls, solid rock — cannot move through
  | "hazardous"        // damages those who enter (lava, caltrops)
  | "climbing"         // vertical surface (uses climb speed)
  | "swimming"         // water deep enough to swim (uses swim speed)
  | "flying_only";     // chasm, air — only flyers can cross

export interface TerrainDef {
  type: TerrainType;
  name: string;
  /** Movement cost multiplier (1 = normal, 2 = difficult, 0 = impassable). */
  costMultiplier: number;
  /** Whether it deals damage on entry. */
  damagePerTurn?: string;             // dice expr
  damageType?: string;
  /** Whether flying creatures are unaffected. */
  bypassedByFlying?: boolean;
}

export const TERRAIN_TYPES: Record<TerrainType, TerrainDef> = {
  normal: { type: "normal", name: "Normal", costMultiplier: 1 },
  difficult: { type: "difficult", name: "Difficult Terrain", costMultiplier: 2 },
  very_difficult: { type: "very_difficult", name: "Very Difficult Terrain", costMultiplier: 3 },
  impassable: { type: "impassable", name: "Impassable", costMultiplier: 0 },
  hazardous: { type: "hazardous", name: "Hazardous", costMultiplier: 1, damagePerTurn: "1d6", damageType: "fire", bypassedByFlying: true },
  climbing: { type: "climbing", name: "Climbing Surface", costMultiplier: 2 },
  swimming: { type: "swimming", name: "Deep Water", costMultiplier: 2 },
  flying_only: { type: "flying_only", name: "Air/Chasm", costMultiplier: 1, bypassedByFlying: true },
};

/**
 * Calculate the movement cost (in feet) to traverse a single tile.
 * Cost = 5 ft × terrain_multiplier × mode_multiplier.
 */
export function calculateMovementCost(
  terrain: TerrainType,
  mode: MovementMode = "walk",
): number {
  const terrainDef = TERRAIN_TYPES[terrain];
  if (terrainDef.costMultiplier === 0) return Infinity; // impassable
  const modeMult = MOVEMENT_COST_MULTIPLIERS[mode];
  // If creature has appropriate speed (swim speed for water, climb for climbing),
  // modeMult becomes 1 instead of 2. Caller decides by passing mode = "walk" if
  // they have a swim speed (treats water as normal terrain for that creature).
  return 5 * terrainDef.costMultiplier * modeMult;
}

/**
 * Total movement cost for a path (list of positions with terrains).
 * Returns Infinity if any tile is impassable.
 */
export function calculatePathCost(
  path: Array<{ position: Position; terrain: TerrainType }>,
  mode: MovementMode = "walk",
): number {
  let total = 0;
  for (const step of path) {
    const cost = calculateMovementCost(step.terrain, mode);
    if (!Number.isFinite(cost)) return Infinity;
    total += cost;
  }
  return total;
}

// ============================================================================
// 5. MOVEMENT ACTIONS — Dash, Disengage, Withdraw
// ============================================================================

export interface MovementActionState {
  /** Whether Dash was used this turn (doubles movement). */
  hasDashed: boolean;
  /** Number of Dashes (Action + Bonus Action with Cunning Action). */
  dashCount: number;
  /** Whether Disengage was used (no opportunity attacks this turn). */
  hasDisengaged: boolean;
  /** Whether Withdraw is active (some homebrew variants). */
  hasWithdrawn: boolean;
  /** Movement mode currently active (walk, fly, etc.). */
  currentMode: MovementMode;
}

export function createMovementState(mode: MovementMode = "walk"): MovementActionState {
  return {
    hasDashed: false,
    dashCount: 0,
    hasDisengaged: false,
    hasWithdrawn: false,
    currentMode: mode,
  };
}

/**
 * Apply Dash: doubles the character's available movement this turn.
 * Each additional Dash (e.g. Bonus Action) adds another ×1 movement.
 * So 1 Dash = ×2 movement, 2 Dashes = ×3 movement, etc.
 */
export function applyDash(state: MovementActionState): MovementActionState {
  return {
    ...state,
    hasDashed: true,
    dashCount: state.dashCount + 1,
  };
}

/**
 * Apply Disengage: movement does not provoke opportunity attacks this turn.
 */
export function applyDisengage(state: MovementActionState): MovementActionState {
  return { ...state, hasDisengaged: true };
}

/**
 * Get the effective movement multiplier from Dashes.
 * 0 Dashes = ×1, 1 Dash = ×2, 2 Dashes = ×3, ...
 */
export function getDashMultiplier(state: MovementActionState): number {
  return 1 + state.dashCount;
}

/**
 * Effective movement available this turn (speed × dash multiplier).
 */
export function getEffectiveMovement(
  speed: number,
  state: MovementActionState,
): number {
  return speed * getDashMultiplier(state);
}

// ============================================================================
// 6. PATHFINDING — A* Algorithm for grid
// ============================================================================

/**
 * A* pathfinding on a grid. Returns the optimal path from start to end.
 *
 * Caller supplies a `getTile` callback that returns the terrain at each position.
 * Algorithm avoids impassable tiles; minimizes total movement cost.
 *
 * Returns null if no path exists.
 */
export function findPath(
  start: Position,
  end: Position,
  getTile: (pos: Position) => TerrainType,
  gridSize: { width: number; height: number },
  mode: MovementMode = "walk",
): Position[] | null {
  if (start.x === end.x && start.y === end.y) return [start];

  const inBounds = (p: Position) =>
    p.x >= 0 && p.x < gridSize.width && p.y >= 0 && p.y < gridSize.height;

  const key = (p: Position) => `${p.x},${p.y}`;

  // 4-directional movement (D&D 5e default)
  const neighbors: Array<{ dx: number; dy: number }> = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
  ];
  // Diagonals (D&D 5e optional: diagonals count as 1 square, no extra cost)
  const diagonalNeighbors: Array<{ dx: number; dy: number }> = [
    { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
    { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
  ];
  const allNeighbors = [...neighbors, ...diagonalNeighbors];

  const openSet = new Set<string>([key(start)]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[key(start), 0]]);
  const fScore = new Map<string, number>([[key(start), gridDistance(start, end) * 5]]);

  while (openSet.size > 0) {
    // Find node in openSet with lowest fScore
    let currentKey: string | null = null;
    let currentF = Infinity;
    for (const k of Array.from(openSet)) {
      const f = fScore.get(k) ?? Infinity;
      if (f < currentF) {
        currentF = f;
        currentKey = k;
      }
    }
    if (!currentKey) break;

    const [cx, cy] = currentKey.split(",").map(Number);
    const current = { x: cx, y: cy };
    if (current.x === end.x && current.y === end.y) {
      // Reconstruct path
      const path: Position[] = [current];
      let ck = currentKey;
      while (cameFrom.has(ck)) {
        ck = cameFrom.get(ck)!;
        const [px, py] = ck.split(",").map(Number);
        path.unshift({ x: px, y: py });
      }
      return path;
    }

    openSet.delete(currentKey);

    for (const dir of allNeighbors) {
      const neighbor: Position = { x: current.x + dir.dx, y: current.y + dir.dy };
      if (!inBounds(neighbor)) continue;
      const terrain = getTile(neighbor);
      if (terrain === "impassable") continue;
      // Flying-only terrain: only crossable if mode is fly
      if (terrain === "flying_only" && mode !== "fly") continue;

      const stepCost = calculateMovementCost(terrain, mode);
      if (!Number.isFinite(stepCost)) continue;

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + stepCost;
      const nKey = key(neighbor);
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, currentKey);
        gScore.set(nKey, tentativeG);
        fScore.set(nKey, tentativeG + gridDistance(neighbor, end) * 5);
        openSet.add(nKey);
      }
    }
  }
  return null; // No path found
}

/**
 * Check if a character can move to a target position given their remaining movement.
 * Does NOT consider opportunity attacks — caller handles via Combat.
 */
export function canMoveTo(
  from: Position,
  to: Position,
  getTile: (pos: Position) => TerrainType,
  gridSize: { width: number; height: number },
  movementRemaining: number,
  mode: MovementMode = "walk",
): boolean {
  const path = findPath(from, to, getTile, gridSize, mode);
  if (!path) return false;
  const cost = calculatePathCost(
    path.map(p => ({ position: p, terrain: getTile(p) })),
    mode,
  );
  return cost <= movementRemaining;
}

// ============================================================================
// 7. OPPORTUNITY ATTACKS
// ============================================================================

export interface ThreatRange {
  /** Character ID who threatens. */
  characterId: string;
  position: Position;
  /** Reach in feet (typically 5, Polearm Master = 10). */
  reach: number;
}

/**
 * Check if moving from `from` to `to` provokes opportunity attacks.
 * D&D 5e rule: leaving an enemy's reach (5 ft or more) provokes.
 *
 * Returns the list of threatening characters who get an opportunity attack.
 */
export function getOpportunityAttackers(
  from: Position,
  to: Position,
  threats: ThreatRange[],
): ThreatRange[] {
  return threats.filter(threat => {
    const wasInReach = isWithinReach(from, threat.position, threat.reach);
    const isInReach = isWithinReach(to, threat.position, threat.reach);
    // Provokes if was in reach AND is no longer in reach
    return wasInReach && !isInReach;
  });
}

/**
 * Check if a creature can move without provoking opportunity attacks.
 * True if Disengaged OR if no enemies threaten the path.
 */
export function canMoveSafely(
  from: Position,
  to: Position,
  threats: ThreatRange[],
  hasDisengaged: boolean,
): boolean {
  if (hasDisengaged) return true;
  return getOpportunityAttackers(from, to, threats).length === 0;
}

// ============================================================================
// 8. FORCED MOVEMENT — Push, Pull, Drag, Teleport
// ============================================================================

export type ForcedMovementType =
  | "push"        // away from source
  | "pull"        // toward source
  | "drag"        // in any direction (typically with grapple)
  | "teleport";   // instant — ignores terrain and opportunity attacks

export interface ForcedMovementRequest {
  type: ForcedMovementType;
  targetId: string;
  sourcePosition: Position;          // origin of the forced movement
  distance: number;                  // ft
  /** Direction for drag (otherwise computed from source/target positions). */
  direction?: { dx: number; dy: number };
  /** Whether to ignore opportunity attacks (teleport always does). */
  ignoreOpportunityAttacks?: boolean;
  /** Whether to ignore difficult terrain (teleport always does). */
  ignoreTerrain?: boolean;
}

export interface ForcedMovementResult {
  newPosition: Position;
  actualDistance: number;            // may be less than requested (collision)
  provokedOpportunityAttacks: boolean;
  hitObstacle: boolean;
}

/**
 * Resolve forced movement. Pure function — caller applies result to character.
 *
 * D&D 5e rules:
 *   - Push: target moves away from source
 *   - Pull: target moves toward source
 *   - Drag: target moves in arbitrary direction (grappler drags grappled)
 *   - Teleport: instant, ignores terrain + opportunity attacks
 *   - All forced movement (except teleport) does NOT provoke opportunity attacks
 *     (D&D 2024 change — D&D 2014 RAW also doesn't provoke)
 */
export function resolveForcedMovement(
  targetPosition: Position,
  req: ForcedMovementRequest,
  getTile: (pos: Position) => TerrainType,
  gridSize: { width: number; height: number },
): ForcedMovementResult {
  // Teleport: instant, no collision check (D&D 5e: cannot teleport into solid object)
  if (req.type === "teleport") {
    // Direction provided = absolute target
    const targetPos = req.direction
      ? { x: targetPosition.x + req.direction.dx, y: targetPosition.y + req.direction.dy }
      : req.sourcePosition;
    const inBounds = targetPos.x >= 0 && targetPos.x < gridSize.width &&
                     targetPos.y >= 0 && targetPos.y < gridSize.height;
    const terrain = getTile(targetPos);
    const blocked = !inBounds || terrain === "impassable";
    return {
      newPosition: blocked ? targetPosition : targetPos,
      actualDistance: blocked ? 0 : req.distance,
      provokedOpportunityAttacks: false,
      hitObstacle: blocked,
    };
  }

  // Determine direction vector
  let dx = 0, dy = 0;
  if (req.type === "push") {
    // Away from source
    dx = Math.sign(targetPosition.x - req.sourcePosition.x);
    dy = Math.sign(targetPosition.y - req.sourcePosition.y);
    if (dx === 0 && dy === 0) dx = 1; // fallback if same position
  } else if (req.type === "pull") {
    // Toward source
    dx = Math.sign(req.sourcePosition.x - targetPosition.x);
    dy = Math.sign(req.sourcePosition.y - targetPosition.y);
  } else if (req.direction) {
    dx = req.direction.dx;
    dy = req.direction.dy;
  }

  // Normalize to unit (diagonal = 1 square per step)
  const norm = Math.sqrt(dx * dx + dy * dy);
  if (norm > 0) { dx = Math.round(dx / norm); dy = Math.round(dy / norm); }

  // Step one square at a time until distance consumed or obstacle hit
  let pos: Position = { ...targetPosition };
  let actualDist = 0;
  const stepFeet = 5;
  const maxSteps = Math.floor(req.distance / stepFeet);

  for (let i = 0; i < maxSteps; i++) {
    const next: Position = { x: pos.x + dx, y: pos.y + dy };
    const inBounds = next.x >= 0 && next.x < gridSize.width &&
                     next.y >= 0 && next.y < gridSize.height;
    if (!inBounds) break;
    const terrain = getTile(next);
    if (terrain === "impassable") break;
    pos = next;
    actualDist += stepFeet;
  }

  return {
    newPosition: pos,
    actualDistance: actualDist,
    provokedOpportunityAttacks: false, // forced movement never provokes
    hitObstacle: actualDist < req.distance,
  };
}

// ============================================================================
// 9. FLYING RULES
// ============================================================================

export interface FlyingState {
  altitude: number;                  // ft above ground
  /** "hover" = can stay aloft without moving; "move" = must move each round. */
  flightType: "hover" | "move";
  /** Speed in ft per round. */
  flySpeed: number;
}

/**
 * Check if a flying creature falls when its speed is reduced to 0.
 * D&D 5e: hover creatures stay aloft; others fall.
 */
export function checkFallRisk(flying: FlyingState, effectiveSpeed: number): { falls: boolean; fallDistance: number } {
  if (effectiveSpeed > 0) return { falls: false, fallDistance: 0 };
  if (flying.flightType === "hover") return { falls: false, fallDistance: 0 };
  return { falls: true, fallDistance: flying.altitude };
}

// ============================================================================
// 10. SUMMARY — For AI DM / UI
// ============================================================================

/**
 * Produce a human-readable summary of a character's movement capability.
 */
export function summarizeMovement(
  speed: SpeedCapability,
  state: MovementActionState,
  movementRemaining: number,
): string {
  const parts: string[] = [];
  if (!speed.canMove) return `Cannot move: ${speed.immobilityReason ?? "unknown"}`;
  parts.push(`Walk ${speed.walk} ft`);
  if (speed.fly > 0) parts.push(`Fly ${speed.fly} ft`);
  if (speed.swim > 0) parts.push(`Swim ${speed.swim} ft`);
  if (speed.climb > 0) parts.push(`Climb ${speed.climb} ft`);
  if (speed.burrow > 0) parts.push(`Burrow ${speed.burrow} ft`);
  parts.push(`Remaining ${movementRemaining} ft`);
  if (state.hasDashed) parts.push(`Dashed ×${state.dashCount}`);
  if (state.hasDisengaged) parts.push("Disengaged");
  return parts.join(" · ");
}

/**
 * Get the size of a creature's space (in feet), per D&D 5e size table.
 */
export const SIZE_SPACE: Record<CreatureSize, number> = {
  tiny: 2.5, small: 5, medium: 5, large: 10, huge: 15, gargantuan: 20,
};

/**
 * Get the size of a creature's reach (in feet).
 * Most creatures have 5 ft reach; Large+ with natural reach can have 10+.
 */
export const SIZE_REACH: Record<CreatureSize, number> = {
  tiny: 0, small: 5, medium: 5, large: 5, huge: 10, gargantuan: 15,
};

// Re-export for callers that want the convenience
export type { SpeedSet };
