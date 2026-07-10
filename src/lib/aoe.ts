/**
 * Domain 29: Area of Effect
 *
 * จัดการผลกระทบที่เกิดในพื้นที่
 *
 * Sub-systems:
 *  29.1 Area Shape       — Sphere/Cube/Cone/Line/Cylinder/Emanation
 *  29.2 Area Calculation — Radius/Distance/Collision
 *  29.3 Target Selection — Enemy/Ally/All/Object
 *  29.4 Area Effects     — Damage/Heal/Condition/Terrain Change
 *
 * Pure geometry + filtering. Does not modify state — caller applies effects.
 */

/* ======================================================================
 * 29.1 AREA SHAPE
 * ====================================================================== */

export type AreaShape =
  | "sphere"
  | "cube"
  | "cone"
  | "line"
  | "cylinder"
  | "emanation";

export interface Point {
  x: number;
  y: number;
}

export interface AreaDefinition {
  shape: AreaShape;
  origin: Point;
  // For sphere/cube/emanation: size = radius (sphere/emanation) or side (cube)
  // For cone: length (size) and direction
  // For line: length and width (size and width)
  // For cylinder: radius (size) and height
  size: number; // feet
  width?: number; // feet — for line
  height?: number; // feet — for cylinder
  direction?: { x: number; y: number }; // unit vector — for cone/line
}

/* ======================================================================
 * 29.2 AREA CALCULATION
 * ====================================================================== */

export const FEET_PER_GRID_SQUARE = 5;

export function feetToGrid(feet: number): number {
  return Math.floor(feet / FEET_PER_GRID_SQUARE);
}

export function gridToFeet(grid: number): number {
  return grid * FEET_PER_GRID_SQUARE;
}

export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function gridDistance(a: Point, b: Point): number {
  // Chebyshev distance for grid (8-way movement)
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function pointInArea(point: Point, area: AreaDefinition): boolean {
  switch (area.shape) {
    case "sphere":
    case "emanation": {
      const d = distance(point, area.origin);
      return d <= area.size;
    }
    case "cube": {
      // Cube centered on origin, side = size
      const half = area.size / 2;
      return (
        Math.abs(point.x - area.origin.x) <= half &&
        Math.abs(point.y - area.origin.y) <= half
      );
    }
    case "cone": {
      if (!area.direction) return false;
      const d = distance(point, area.origin);
      if (d > area.size) return false;
      // Check angle (cone is 53.13° = 1/4 circle for D&D 5e by default)
      const toPoint = { x: point.x - area.origin.x, y: point.y - area.origin.y };
      const dot = (toPoint.x * area.direction.x + toPoint.y * area.direction.y) / (d || 1);
      return dot >= 0.7071; // cos(45°) — 90° cone
    }
    case "line": {
      if (!area.direction) return false;
      // Project point onto line
      const toPoint = { x: point.x - area.origin.x, y: point.y - area.origin.y };
      const lineLen = area.size;
      const proj = toPoint.x * area.direction.x + toPoint.y * area.direction.y;
      if (proj < 0 || proj > lineLen) return false;
      // Perpendicular distance
      const perp = Math.abs(toPoint.x * -area.direction.y + toPoint.y * area.direction.x);
      const halfWidth = (area.width ?? 5) / 2;
      return perp <= halfWidth;
    }
    case "cylinder": {
      // 2D top-down: same as sphere
      const d = distance(point, area.origin);
      return d <= area.size;
    }
  }
}

/**
 * Returns grid squares (integer Points) covered by an area.
 * Useful for visualization and for selecting token positions.
 */
export function getAreaSquares(area: AreaDefinition): Point[] {
  const squares: Point[] = [];
  const radiusGrid = feetToGrid(area.size);
  for (let dx = -radiusGrid; dx <= radiusGrid; dx++) {
    for (let dy = -radiusGrid; dy <= radiusGrid; dy++) {
      const p = { x: area.origin.x + dx, y: area.origin.y + dy };
      if (pointInArea(p, area)) squares.push(p);
    }
  }
  return squares;
}

/**
 * Line-of-sight collision: if a wall blocks the path from origin to point,
 * the point is excluded. `wallChecker` returns true if (x,y) is a wall.
 */
export function filterByLineOfSight(
  points: Point[],
  origin: Point,
  wallChecker: (p: Point) => boolean,
): Point[] {
  return points.filter((p) => {
    // Bresenham-style line walk
    const dx = Math.abs(p.x - origin.x);
    const dy = Math.abs(p.y - origin.y);
    const sx = origin.x < p.x ? 1 : -1;
    const sy = origin.y < p.y ? 1 : -1;
    let err = dx - dy;
    let cx = origin.x;
    let cy = origin.y;
    while (!(cx === p.x && cy === p.y)) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
      if (cx === p.x && cy === p.y) break;
      if (wallChecker({ x: cx, y: cy })) return false;
    }
    return true;
  });
}

/* ======================================================================
 * 29.3 TARGET SELECTION
 * ====================================================================== */

export type TargetFilter = "enemy" | "ally" | "all_creatures" | "self" | "object" | "willing_only";

export interface PotentialTarget {
  id: string;
  position: Point;
  isAllyOfCaster: boolean;
  isWilling: boolean;
  isObject: boolean;
  isDead: boolean;
}

export function selectTargetsInArea(
  area: AreaDefinition,
  candidates: PotentialTarget[],
  filter: TargetFilter,
  casterId: string,
): PotentialTarget[] {
  return candidates.filter((c) => {
    if (c.isDead && filter !== "all_creatures") return false;
    if (!pointInArea(c.position, area)) return false;
    switch (filter) {
      case "enemy":
        return !c.isAllyOfCaster && c.id !== casterId;
      case "ally":
        return c.isAllyOfCaster;
      case "all_creatures":
        return true;
      case "self":
        return c.id === casterId;
      case "object":
        return c.isObject;
      case "willing_only":
        return c.isWilling;
    }
  });
}

/* ======================================================================
 * 29.4 AREA EFFECTS
 * ====================================================================== */

export type AreaEffectType =
  | "damage"
  | "heal"
  | "condition"
  | "terrain_change"
  | "buff"
  | "debuff"
  | "save_for_half"
  | "save_for_none";

export interface AreaEffectApplication {
  type: AreaEffectType;
  damageFormula?: string;
  damageType?: string;
  healFormula?: string;
  conditionId?: string;
  conditionDurationRounds?: number;
  terrainChange?: { from: string; to: string };
  save?: { ability: "str" | "dex" | "con" | "int" | "wis" | "cha"; dc: number };
}

export interface AreaEffectResult {
  affectedTargets: Array<{
    targetId: string;
    saveRoll?: number;
    saveSuccess?: boolean;
    damage?: number;
    heal?: number;
    conditionApplied?: string;
  }>;
  areaSquares: Point[];
  note: string;
}

export interface ResolveAreaEffectInput {
  area: AreaDefinition;
  candidates: PotentialTarget[];
  filter: TargetFilter;
  casterId: string;
  effect: AreaEffectApplication;
  rollSave: (targetId: string, ability: string, dc: number) => { roll: number; success: boolean };
  rollDamage: (formula: string) => number;
  rollHeal: (formula: string) => number;
  wallChecker?: (p: Point) => boolean;
}

export function resolveAreaEffect(input: ResolveAreaEffectInput): AreaEffectResult {
  // Filter by LoS if checker provided
  let candidates = input.candidates;
  if (input.wallChecker) {
    const visiblePoints = filterByLineOfSight(
      input.candidates.map((c) => c.position),
      input.area.origin,
      input.wallChecker,
    );
    const visibleSet = new Set(visiblePoints.map((p) => `${p.x},${p.y}`));
    candidates = input.candidates.filter((c) => visibleSet.has(`${c.position.x},${c.position.y}`));
  }

  const targets = selectTargetsInArea(input.area, candidates, input.filter, input.casterId);
  const areaSquares = getAreaSquares(input.area);

  const affectedTargets = targets.map((t) => {
    let saveRoll: number | undefined;
    let saveSuccess: boolean | undefined;
    if (input.effect.save) {
      const result = input.rollSave(
        t.id,
        input.effect.save.ability,
        input.effect.save.dc,
      );
      saveRoll = result.roll;
      saveSuccess = result.success;
    }
    let damage: number | undefined;
    let heal: number | undefined;
    if (input.effect.damageFormula) {
      const fullDamage = input.rollDamage(input.effect.damageFormula);
      if (saveSuccess) {
        damage = input.effect.type === "save_for_none" ? 0 : Math.floor(fullDamage / 2);
      } else {
        damage = fullDamage;
      }
    }
    if (input.effect.healFormula) {
      heal = input.rollHeal(input.effect.healFormula);
    }
    const conditionApplied = saveSuccess ? undefined : input.effect.conditionId;
    return {
      targetId: t.id,
      saveRoll,
      saveSuccess,
      damage,
      heal,
      conditionApplied,
    };
  });

  return {
    affectedTargets,
    areaSquares,
    note: `${input.area.shape} ${input.area.size}ft กระทบ ${affectedTargets.length} เป้าหมาย`,
  };
}

/* ======================================================================
 * COMMON SPELL AREA DEFINITIONS (data-driven)
 * ====================================================================== */

export interface SpellAreaTemplate {
  spellId: string;
  spellName: string;
  area: Omit<AreaDefinition, "origin" | "direction">;
  needsDirection: boolean;
  effect: AreaEffectApplication;
}

export const COMMON_SPELL_AREAS: SpellAreaTemplate[] = [
  {
    spellId: "fireball",
    spellName: "Fireball",
    area: { shape: "sphere", size: 20 },
    needsDirection: false,
    effect: {
      type: "save_for_half",
      damageFormula: "8d6",
      damageType: "fire",
      save: { ability: "dex", dc: 0 }, // DC set by caster
    },
  },
  {
    spellId: "lightning_bolt",
    spellName: "Lightning Bolt",
    area: { shape: "line", size: 100, width: 5 },
    needsDirection: true,
    effect: {
      type: "save_for_half",
      damageFormula: "8d6",
      damageType: "lightning",
      save: { ability: "dex", dc: 0 },
    },
  },
  {
    spellId: "cone_of_cold",
    spellName: "Cone of Cold",
    area: { shape: "cone", size: 60 },
    needsDirection: true,
    effect: {
      type: "save_for_half",
      damageFormula: "8d8",
      damageType: "cold",
      save: { ability: "con", dc: 0 },
    },
  },
  {
    spellId: "shatter",
    spellName: "Shatter",
    area: { shape: "sphere", size: 10 },
    needsDirection: false,
    effect: {
      type: "save_for_half",
      damageFormula: "3d8",
      damageType: "thunder",
      save: { ability: "con", dc: 0 },
    },
  },
  {
    spellId: "mass_healing_word",
    spellName: "Mass Healing Word",
    area: { shape: "sphere", size: 60 },
    needsDirection: false,
    effect: {
      type: "heal",
      healFormula: "1d4+modifier",
    },
  },
];
