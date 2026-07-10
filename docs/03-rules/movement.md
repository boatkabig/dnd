# 03 — Movement & Positioning

> ระบบ Movement ของ D&D 5e / 2024 — grid distance, speed, difficult terrain, opportunity attacks, forced movement, flying
>
> **สถานะรวม**: `engine/movement.ts` (683 บรรทัด) implement ครบ 3-layer pipeline (Capability → Execution → Resolution) แต่ **UI ไม่ได้ใช้** — UI เก็บ position แบบ grid (x,y) แบบง่าย ๆ และใช้ `cover.ts: getDistance` (Manhattan) แทน Chebyshev

## ภาพรวม 3-Layer Pipeline

```
Layer 1 (Capability):
  - calculateSpeed(input) → walk/fly/swim/climb/burrow speeds
  - ตรวจ zero-speed conditions, encumbrance, speed modifiers

Layer 2 (Execution):
  - calculateMovementCost(terrain, mode) → ft cost per tile
  - applyDash(state) → ×2 movement this turn
  - applyDisengage(state) → no opp attacks this turn

Layer 3 (Resolution):
  - findPath(start, end, grid) → A* path
  - canMoveTo(from, to, ...) → boolean
```

## กฎที่ Implement

### Position Abstraction

**ไฟล์**: `src/lib/engine/movement.ts:52-77` + `src/lib/cover.ts:9-14`

Position ออกแบบให้รองรับ Grid (x,y), Hex (q,r), หรือ Theater of Mind:

```typescript
export interface Position {
  x: number;
  y: number;
  z?: number;          // 3D combat (flying, burrowing)
}

// Chebyshev distance (8-way) — D&D 5e grid rule
export function gridDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// Distance in feet (1 square = 5 ft)
export function distanceInFeet(a: Position, b: Position): number {
  return gridDistance(a, b) * 5;
}

export function isAdjacent(a: Position, b: Position): boolean {
  return gridDistance(a, b) <= 1;
}

export function isWithinReach(a: Position, b: Position, reach: number): boolean {
  return distanceInFeet(a, b) <= reach;
}
```

⚠️ **ความขัดแย้ง**: `cover.ts:20-25` ใช้ **Manhattan distance** (`|dx| + |dy|`) ในขณะที่ engine/movement.ts ใช้ **Chebyshev** (`max(|dx|, |dy|)`) — D&D 5e อย่างเป็นทางการใช้ Chebyshev

**สถานะ**: ✅ Engine (Chebyshev ถูกต้อง); ⚠️ `cover.ts` ใช้ Manhattan (ผิด)

### Movement Modes (5 โหมด)

**ไฟล์**: `src/lib/engine/movement.ts:83-101`

| Mode | Cost Multiplier | หมายเหตุ |
|---|:---:|---|
| `walk` | 1× | default |
| `fly` | 1× | ใช้ fly speed |
| `swim` | 2× | ใช้ swim speed ลดเหลือ 1× |
| `climb` | 2× | ใช้ climb speed ลดเหลือ 1× |
| `burrow` | 1× | ใช้ burrow speed |

```typescript
export const MOVEMENT_COST_MULTIPLIERS: Record<MovementMode, number> = {
  walk: 1, fly: 1, swim: 2, climb: 2, burrow: 1,
};
```

**สถานะ**: ✅ Engine; ❌ UI (UI มีแค่ character.speed ตัวเดียว ไม่แยก mode)

### Capability Layer — Speed Calculation

**ไฟล์**: `src/lib/engine/movement.ts:152-205` (`calculateSpeed`)

Pipeline คำนวณ speed จริง:
1. Zero-speed conditions (grappled, restrained, paralyzed) → speed 0
2. Encumbrance "over" → speed 0
3. Apply base speeds (walk/fly/swim/climb/burrow)
4. Apply encumbrance penalty (light: -10, heavy: -20)
5. Apply modifiers (flat + multiplier)
6. canMove = มีอย่างน้อย 1 mode > 0

```typescript
export function calculateSpeed(input: SpeedCapabilityInput): SpeedCapability {
  // Zero-speed conditions short-circuit
  if (input.zeroSpeedConditions.length > 0) {
    return { walk: 0, fly: 0, swim: 0, climb: 0, burrow: 0,
             canMove: false, immobilityReason: `Conditions: ...` };
  }
  if (input.encumbranceLevel === "over") {
    return { walk: 0, ..., canMove: false, immobilityReason: "Encumbrance: over capacity" };
  }

  // Start with base speeds
  let walk = input.baseSpeeds.walk;
  let fly = input.baseSpeeds.fly ?? 0;
  // ...

  // Apply encumbrance
  if (input.encumbranceLevel === "light") { walk = Math.max(0, walk - 10); fly = Math.max(0, fly - 10); }
  else if (input.encumbranceLevel === "heavy") { walk = Math.max(0, walk - 20); fly = Math.max(0, fly - 20); }

  // Apply modifiers (multipliers like Haste ×2, Slow ×0.5)
  for (const mod of input.speedModifiers) {
    if (mod.type === "flat") { ... }
    else { // multiplier
      if (!mod.mode || mod.mode === "walk") walk = Math.floor(walk * mod.value);
      // ...
    }
  }
  return { walk, fly, swim, climb, burrow, canMove };
}
```

**สถานะ**: ✅ Engine; ❌ UI (UI ใช้ character.speed ตัวเดียว ไม่คำนวณ modifiers)

### Terrain Types (8 ประเภท)

**ไฟล์**: `src/lib/engine/movement.ts:215-263`

| Terrain | Cost Mult | หมายเหตุ |
|---|:---:|---|
| `normal` | 1× | default |
| `difficult` | 2× | heavy undergrowth, debris, shallow water |
| `very_difficult` | 3× | knee-deep snow, dense thorns (DM call) |
| `impassable` | 0× | walls, solid rock |
| `hazardous` | 1× | 1d6 damage on entry (lava, caltrops) |
| `climbing` | 2× | vertical surface |
| `swimming` | 2× | deep water |
| `flying_only` | 1× | chasm, air — only flyers can cross |

```typescript
export function calculateMovementCost(terrain: TerrainType, mode: MovementMode = "walk"): number {
  const terrainDef = TERRAIN_TYPES[terrain];
  if (terrainDef.costMultiplier === 0) return Infinity; // impassable
  const modeMult = MOVEMENT_COST_MULTIPLIERS[mode];
  return 5 * terrainDef.costMultiplier * modeMult;
}
```

**สถานะ**: ✅ Engine; ❌ UI

### Movement Actions (Dash, Disengage)

**ไฟล์**: `src/lib/engine/movement.ts:286-345`

```typescript
export function applyDash(state: MovementActionState): MovementActionState {
  return { ...state, hasDashed: true, dashCount: state.dashCount + 1 };
}

export function applyDisengage(state: MovementActionState): MovementActionState {
  return { ...state, hasDisengaged: true };
}

// 0 Dashes = ×1, 1 Dash = ×2, 2 Dashes (Cunning Action) = ×3
export function getDashMultiplier(state: MovementActionState): number {
  return 1 + state.dashCount;
}

export function getEffectiveMovement(speed: number, state: MovementActionState): number {
  return speed * getDashMultiplier(state);
}
```

**สถานะ**: ✅ Engine; ❌ UI (UI ไม่ track dash/disengage state อย่างเป็นระบบ)

### Stand from Prone

**ไฟล์**: `src/lib/engine/actionEconomy.ts:206` (STANDARD_ACTIONS)

```typescript
{ id: "stand_from_prone", name: "Stand from Prone",
  description: "Stand up from prone; consumes half your movement.",
  cost: { movement: 0 }, tags: ["movement"] },
```

⚠️ **BUG**: D&D 5e กำหนดว่าลุกจาก prone ใช้ movement ครึ่งหนึ่งของ speed แต่ `cost.movement: 0` หมายถึงไม่ใช้อะไรเลย — ควรเป็น dynamic ตาม speed หรือใช้ flag พิเศษ

**สถานะ**: ⚠️ Implement ผิด (cost ผิด)

### Opportunity Attacks

**ไฟล์**: `src/lib/engine/movement.ts:482-507` (`getOpportunityAttackers`) + `src/lib/engine/combat.ts:553-570` (`getOpportunityAttackTargets`)

D&D 5e: ออกจาก enemy reach (5 ฟุตขึ้นไป) โดยไม่ Disengage → provokes

```typescript
export function getOpportunityAttackers(
  from: Position, to: Position, threats: ThreatRange[],
): ThreatRange[] {
  return threats.filter(threat => {
    const wasInReach = isWithinReach(from, threat.position, threat.reach);
    const isInReach = isWithinReach(to, threat.position, threat.reach);
    return wasInReach && !isInReach; // only leaving reach provokes
  });
}

// Disengage prevents all opportunity attacks this turn
export function canMoveSafely(
  from: Position, to: Position, threats: ThreatRange[], hasDisengaged: boolean,
): boolean {
  if (hasDisengaged) return true;
  return getOpportunityAttackers(from, to, threats).length === 0;
}
```

**สถานะ**: ✅ Engine; ❌ UI

### Forced Movement (Push/Pull/Drag/Teleport)

**ไฟล์**: `src/lib/engine/movement.ts:510-617` (`resolveForcedMovement`)

D&D 5e forced movement rules:
- **Push**: target ออกจาก source
- **Pull**: target เข้าหา source
- **Drag**: ทิศทางอิสระ (grappler ลาก grappled)
- **Teleport**: instant, ignores terrain + opportunity attacks
- Forced movement ทุกประเภท **ไม่ provoke opportunity attacks** (ยกเว้น teleport ซึ่งก็ไม่ provoke อยู่แล้ว)

```typescript
export function resolveForcedMovement(
  targetPosition: Position,
  req: ForcedMovementRequest,
  getTile: (pos: Position) => TerrainType,
  gridSize: { width: number; height: number },
): ForcedMovementResult {
  if (req.type === "teleport") {
    // Teleport: instant, no collision check (cannot teleport into solid object)
    const targetPos = req.direction
      ? { x: targetPosition.x + req.direction.dx, y: targetPosition.y + req.direction.dy }
      : req.sourcePosition;
    const blocked = !inBounds || terrain === "impassable";
    return { newPosition: blocked ? targetPosition : targetPos,
             actualDistance: blocked ? 0 : req.distance,
             provokedOpportunityAttacks: false,
             hitObstacle: blocked };
  }
  // Push/Pull/Drag: step one square at a time until distance consumed or obstacle hit
  // ...
  return { newPosition: pos, actualDistance: actualDist,
           provokedOpportunityAttacks: false, // forced movement never provokes
           hitObstacle: actualDist < req.distance };
}
```

`cover.ts` มี simplified versions:
- `createPush(distanceFt, direction, source)`
- `createPull(distanceFt, source)`
- `createKnockback(distanceFt, source)`
- `createTeleport(distanceFt, source)`
- `createFall(distanceFt)`

**สถานะ**: ✅ Engine + lib; ❌ UI

### Flying Rules

**ไฟล์**: `src/lib/engine/movement.ts:621-639` (`FlyingState`, `checkFallRisk`)

D&D 5e flying rules:
- `hover` — ลอยนิ่งได้ (speed 0 ไม่ตก)
- `move` — ต้อง move ทุก round (speed 0 → ตก)

```typescript
export interface FlyingState {
  altitude: number;                  // ft above ground
  flightType: "hover" | "move";
  flySpeed: number;
}

export function checkFallRisk(flying: FlyingState, effectiveSpeed: number): { falls: boolean; fallDistance: number } {
  if (effectiveSpeed > 0) return { falls: false, fallDistance: 0 };
  if (flying.flightType === "hover") return { falls: false, fallDistance: 0 }; // hover OK
  return { falls: true, fallDistance: flying.altitude }; // falls full distance
}
```

**สถานะ**: ✅ Engine; ❌ UI

### Pathfinding (A*)

**ไฟล์**: `src/lib/engine/movement.ts:359-441` (`findPath`)

A* algorithm สำหรับ grid:
- รองรับ 8-directional movement (4-neighbor + 4 diagonals)
- หลีก impassable terrain
- หลีก flying_only ถ้า mode != fly
- คำนวณ cost ตาม terrain + mode

```typescript
export function findPath(
  start: Position, end: Position,
  getTile: (pos: Position) => TerrainType,
  gridSize: { width: number; height: number },
  mode: MovementMode = "walk",
): Position[] | null {
  // A* with gScore (cost so far) + fScore (g + heuristic)
  // heuristic = gridDistance(current, end) * 5 (feet)
  // ... full implementation
}
```

**สถานะ**: ✅ Engine; ❌ UI (UI ไม่มี grid rendering — ใช้ Theater of Mind)

### Creature Size Space & Reach

**ไฟล์**: `src/lib/engine/movement.ts:669-679` (`SIZE_SPACE`, `SIZE_REACH`)

```typescript
export const SIZE_SPACE: Record<CreatureSize, number> = {
  tiny: 2.5, small: 5, medium: 5, large: 10, huge: 15, gargantuan: 20,
};

export const SIZE_REACH: Record<CreatureSize, number> = {
  tiny: 0, small: 5, medium: 5, large: 5, huge: 10, gargantuan: 15,
};
```

**สถานะ**: ✅ Engine; ❌ UI

### Encumbrance (Variant Rule)

**ไฟล์**: `src/lib/engine/movement.ts:124` (`SpeedCapabilityInput.encumbranceLevel`)

D&D 5e variant encumbrance:
- `none` — no penalty
- `light` (5× STR) — speed -10 ft
- `heavy` (10× STR) — speed -20 ft, disadv on attacks/saves/checks
- `over` (15× STR) — speed 0

**สถานะ**: ✅ Engine; ❌ UI

## กฎที่ยังไม่ Implement

- **Crawling** (prone movement) — ควรใช้ 2× cost แต่ไม่ได้ special-case
- **High jump / Long jump** — ไม่มี (STR check + distance)
- **Squeezing** (รูแคบ) — ไม่มี (cost 1 extra ft per ft, disadv on attacks/saves)
- **Mount / Dismount** — ไม่มี
- **Mounted combat** — ไม่มี
- **Difficult terrain + flying** — engine รองรับ แต่ไม่มี UI
- **3D combat** (z-axis) — field มี แต่ logic ไม่คำนวณจริง
- **Prone crawl** — ใช้ climb speed? ไม่ชัดเจน

## D&D 2024 vs 2014 Differences

| กฎ | D&D 2014 | D&D 2024 | Engine ใช้ |
|---|---|---|:---:|
| Stand from Prone | Costs half movement | Same — no change | ⚠️ Bug: cost 0 |
| Crawling | Half speed | Same — no change | ❌ ไม่ special-case |
| Difficult terrain | 2× cost | Same | ✅ |
| Opportunity attacks | On leaving reach | Same — Disengage now Bonus Action option for some classes | ✅ |
| Dash | Action (×2 movement) | Same | ✅ |
| Disengage | Action | Same | ✅ |
| Forced movement | Doesn't provoke | Same | ✅ |
| Grapple drag | Half speed | Same — but DC = 8 + STR + PB now | ✅ Movement |

## อ้างอิง

- [coverage-matrix.md](coverage-matrix.md) — Matrix ภาพรวม
- [02-modules/engine-submodules.md](../02-modules/engine-submodules.md#movementts) — movement.ts รายละเอียด
- [combat.md](combat.md) — Opportunity attacks ใน combat context
- [conditions-effects.md](conditions-effects.md) — Conditions ที่ set speed เป็น 0 (grappled, restrained, paralyzed)
- D&D Beyond Free Rules 2024 — "Movement", "Difficult Terrain", "Forced Movement"
