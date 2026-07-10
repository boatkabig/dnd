# 02 — Dungeon System (Domain 36)

> `src/lib/dungeon.ts` + `src/lib/dungeonTables.ts` — Domain 36: Dungeon Blueprint System
> รวม ~1,470 บรรทัด, 34 exports — เป็น domain ล่าสุดที่เพิ่มเข้ามาในระบบ

## ภาพรวม

| ไฟล์ | บรรทัด | Exports | ใช้ใน UI? | หน้าที่ |
|---|---:|---:|:---:|---|
| [`dungeon.ts`](#dungeonts) | 568 | 26 | ✅ | Blueprint + Room + Connection + Run State + Validation + Fog-of-War |
| [`dungeonTables.ts`](#dungeontablests) | 902 | 8 | ✅ | Random tables + procedural generator + templates |

## Design Sources

- **Mike Shea (Sly Flourish)** — 5-Room Dungeon pattern
- **Justin Alexander (The Alexandrian)** — Node-based design (3+ exits/room)
- **D&D 5e DMG chapter 5** — "Dungeon Adventures"
- **D&D 2024 DMG** — community-equivalent tables

## Design Philosophy

> "DM เตรียม dungeon ทั้งหมดครั้งเดียวตอนผู้เล่นเข้า dungeon entrance
> Engine เก็บ blueprint และ reveal ทีละห้องตามที่ผู้เล่น explore (fog of war)"

- **Blueprint** = full dungeon structure (เตรียมล่วงหน้า)
- **Run State** = player's progress (visited/cleared/boss state)
- **Fog of War** = engine reveal เฉพาะ visited + adjacent rooms

---

## dungeon.ts
**Path**: `src/lib/dungeon.ts` | **บรรทัด**: 568 | **Exports**: 26 | **ใช้ใน UI?**: ✅ ใช้โดยตรง

### หน้าที่

**Domain 36: Dungeon Blueprint System** — 7 sub-systems:

- **36.1 Dungeon Blueprint** — top-level dungeon structure (id, name, theme, rooms[], connections[], bossRoomId?, rewardRoomId?, loot?)
- **36.2 Room** — single room with role, contents, atmosphere, stagedEncounter?, stagedTrap?, stagedPuzzle?, stagedLoot?
- **36.3 Room Connection** — door/corridor/stair/secret_door/open_archway/trapdoor/portal + direction + lock + secret
- **36.4 Room Role** — 5-Room pattern tags (entrance, puzzle, setback, climax, reward, transition, secret, empty)
- **36.5 Dungeon Run State** — progress tracking (visited/cleared, boss defeated, secrets found)
- **36.6 5-Room Validation** — engine checks blueprint has all 5 roles + connected graph
- **36.7 Fog-of-War Reveal** — what player can see now (current room + adjacent)

### 11 Dungeon Themes

| Theme | คำอธิบาย |
|---|---|
| `crypt` | หลุมศพ — undead, necrotic, dark |
| `cave` | ถ้ำธรรมชาติ — beasts, oozes, damp |
| `wizard_tower` | หอเวท — constructs, magical traps, arcane |
| `abandoned_mine` | เหมืองร้าง — kobolds, oozes, cave-ins |
| `ancient_temple` | วัดโบราณ — cultists, guardians, divine traps |
| `sewer` | ท่อระบายน้ำ — oozes, rats, disease |
| `ruined_castle` | ปราสาทร้าง — bandits, undead, decay |
| `forest_shrine` | ศาลาในป่า — fey, beasts, natural |
| `underwater` | ใต้น้ำ — sea creatures, drowning hazard |
| `fiendish` | ขุมนรก — fiends, fire, alignment hazard |
| `generic` | อื่น ๆ |

### 8 Room Roles (5-Room pattern)

| Role | บรรทัด | ไอคอน | หน้าที่ |
|---|---|---|---|
| `entrance` | 70 | 🚪 | Room 1: Entrance + Guardian |
| `puzzle` | 71 | 🧩 | Room 2: Puzzle / Roleplay challenge |
| `setback` | 72 | ⚠️ | Room 3: Trick / Trap / Setback |
| `climax` | 73 | 💀 | Room 4: Big fight (boss) |
| `reward` | 74 | 💎 | Room 5: Reward / Revelation |
| `transition` | 75 | → | corridor / stairway (not in 5-Room) |
| `secret` | 76 | ❓ | hidden room (off main path) |
| `empty` | 77 | · | dressing only (atmosphere, lore) |

### Exports หลัก

#### 36.1 Blueprint

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `DungeonTheme` (type) | 26 | 11 themes |
| `DungeonBlueprint` (interface) | 39 | id, name, theme, entranceWorldMapId, entranceRoomId, description, rooms[], connections[], bossRoomId?, rewardRoomId?, totalSecrets, recommendedLevel, estimatedRoomsToClear, hook?, antagonist?, loot? |
| `DungeonLootSpec` (interface) | 58 | roomId, items[], isHidden, detectionDC? |

#### 36.2 Room

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `RoomRole` (type) | 69 | 8 roles |
| `RoomShape` (type) | 79 | square, rect, round, irregular, corridor |
| `RoomSize` (type) | 80 | tiny, small, medium, large, huge |
| `Room` (interface) | 82 | id, name, role, shape, size, dimensions?, description, atmosphere?, contents[], exits[], isSecret, secretDetectionDC?, isLocked?, lockDC?, stagedEncounter?, stagedTrap?, stagedPuzzle?, stagedLoot? |
| `RoomContent` (interface) | 130 | type (monster/trap/treasure/puzzle/npc/lore/object/secret_door/environment/dressing), description, isHidden?, detectionDC?, interactionNote? |

#### 36.3 Connection

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `ConnectionType` (type) | 152 | door, corridor, stair, secret_door, open_archway, trapdoor, portal |
| `RoomConnection` (interface) | 154 | id, from, to, type, direction (n/s/e/w/ne/nw/se/sw/up/down), description?, isLocked?, lockDC?, isSecret?, secretDetectionDC?, isTrapped?, trapRef? |

#### 36.4 Run State

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `DungeonRunState` (interface) | 173 | blueprintId, currentRoomId, visitedRoomIds[], clearedRoomIds[], discoveredSecretRoomIds[], discoveredSecretConnectionIds[], bossDefeated, totalRooms, roomsCleared, totalSecrets, secretsFound, startedAtSeconds, progress (0..1), hasReachedBoss |
| `createDungeonRunState(blueprint, startSeconds?)` | 192 | factory — start at entrance room |
| `moveToRoom(state, blueprint, roomId)` | 214 | ย้าย player → room ใหม่ (return { state, room, isFirstVisit }) |
| `markRoomCleared(state, roomId)` | 238 | mark room as cleared (update progress) |
| `markBossDefeated(state)` | 246 | mark boss defeated |
| `discoverSecretRoom(state, roomId)` | 250 | เพิ่ม secret room ใน discovered list + secretsFound+1 |
| `discoverSecretConnection(state, connectionId)` | 257 | เพิ่ม secret door ใน discovered list + secretsFound+1 |

#### 36.5 5-Room Validation

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `DungeonValidationResult` (interface) | 268 | isValid, missingRoles[], warnings[], errors[] |
| `validateDungeonBlueprint(blueprint)` | 275 | ตรวจ: ≥5 rooms, has entrance, has 5 roles, connected graph, boss room exists, connection refs valid |

Validation checks:
- ≥5 rooms recommended (warning ถ้าน้อยกว่า)
- entrance role exists + entranceRoomId valid
- 5 roles present (entrance, puzzle, setback, climax, reward)
- connected graph (BFS from entrance — every non-secret room reachable)
- bossRoomId references valid room
- connections from/to reference valid rooms

#### 36.6 Fog-of-War Reveal

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `VisibleRoomInfo` (interface) | 349 | roomId, name, role, visited, isCurrent, isAdjacent, isSecretDiscovered, visibleExits[] |
| `getVisibleDungeonInfo(state, blueprint)` | 376 | คืน { currentRoom, visibleRooms[], availableExits[] } |

Fog-of-War logic:
- Visible rooms = visited + adjacent to visited (ผ่าน non-secret connections หรือ discovered secret connections)
- Discovered secret rooms = always visible
- Secret exits = hidden ถ้าไม่ discovered
- Destination room name = shown เฉพาะถ้า visited หรือ adjacent

#### 36.7 Summary & Quest Linkage Helpers

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `summarizeDungeonProgress(state, blueprint)` | 501 | "3/5 ห้อง (60%) · บอสกำจัดแล้ว · ความลับ 1/2" |
| `getRoomRoleLabel(role)` | 507 | ไทย label ("ทางเข้า", "ปริศนา", "อุปสรรค/กับดัก", "บอส", "รางวัล", "ทางเดิน", "ห้องลับ", "ห้องว่าง") |
| `getRoomRoleIcon(role)` | 521 | emoji (🚪, 🧩, ⚠️, 💀, 💎, →, ❓, ·) |
| `getConnectionTypeLabel(type)` | 535 | ไทย label ("ประตู", "ทางเดิน", "บันได", "ประตูลับ", "ซุ้มเปิด", "พื้นประตูกับดัก", "ประตูมิติ") |
| `isObjectiveInThisDungeon(objective, blueprint)` | 557 | ตรวจว่า quest objective target dungeon นี้ไหม |

### Dependencies

ไม่ import จาก module อื่น — pure module

### สถานะการใช้งาน

- **UI (DnDSolo.tsx)**: ✅ import โดยตรง — `createDungeonRunState`, `moveToRoom`, `markRoomCleared`, `markBossDefeated`, `discoverSecretRoom`, `discoverSecretConnection`, `getVisibleDungeonInfo`, `validateDungeonBlueprint`, `summarizeDungeonProgress`, `getRoomRoleLabel`, `getRoomRoleIcon`, `getConnectionTypeLabel`, `isObjectiveInThisDungeon` + types `DungeonBlueprint`, `DungeonRunState`, `Room`, `RoomConnection`, `RoomRole`, `ConnectionType`
- **Tests**: ✅ test_dungeon_system, test_comprehensive

---

## dungeonTables.ts
**Path**: `src/lib/dungeonTables.ts` | **บรรทัด**: 902 | **Exports**: 8 | **ใช้ใน UI?**: ✅ ใช้โดยตรง (`generateProceduralDungeon`)

### หน้าที่

**Domain 36 (cont): Dungeon Tables & Procedural Generator** — 2 sub-systems:

- **36.9 Random Tables** — room contents, treasure hoards, dressing, monsters, traps, puzzles (by theme)
- **36.10 Procedural Generation** — quick dungeon generator (สำหรับ "random dungeon" mode)

### Exports หลัก

#### Random Tables

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `DUNGEON_DRESSING_TABLE` | 27 | atmospheric dressing ต่อ theme (crypt, cave, wizard_tower, abandoned_mine, ancient_temple, sewer, ruined_castle, forest_shrine, underwater, fiendish, generic) — 7 entries per theme |
| `DUNGEON_MONSTER_TABLE` | 130 | monster pool ต่อ theme — { id, th, cr, weight } สำหรับ procedural generation |
| `TREASURE_TABLE` | 263 | 4 tiers (Lv.1-4, 5-10, 11-16, 17-20) — goldRange + gems + items |
| `TRAP_TABLE` | 281 | 8 trap templates (dart_trap, pit_trap, fire_rune, poison_needle, collapsing_ceiling, flood_room, gas_leak, summoning_circle) |
| `PUZZLE_TABLE` | 358 | puzzle templates (procedural generator ใช้) |

#### Procedural Generation

| Export | บรรทัด | หน้าที่ |
|---|---:|---|
| `ProceduralDungeonParams` (interface) | 420 | theme, partyLevel, numRooms?, dungeonId, dungeonName, entranceWorldMapId, hook?, antagonist?, seed? |
| `generateProceduralDungeon(params)` | 569 | **main entry** — คืน DungeonBlueprint สมบูรณ์ |
| `DUNGEON_TEMPLATES` | 853 | 6 ready-made templates (old_bonecrypt, wizard_tower_aldric, spider_cave, ruined_keep_ironwolf, temple_forgotten_dawn, abyssal_rift) |

### Algorithm ของ generateProceduralDungeon

```
1. สร้าง RNG (seeded mulberry32 ถ้ามี seed, ไม่งั้น Math.random)
2. กำหนด numRooms (default 5-7 สุ่ม)
3. สร้าง 5-Room spine: entrance → puzzle → setback → climax → reward
4. เพิ่ม extra rooms (transition/secret/empty) จนถึง numRooms
5. Reorder: entrance ต้อง first, reward ต้อง last, climax ต้อง 2nd-to-last
6. สร้าง room แต่ละห้อง:
   - room id: `${role}_${i+1}` (e.g. "entrance_1", "puzzle_2")
   - room name: สุ่มจาก ROOM_NAME_PARTS[theme] (prefix + suffix)
   - secret room: isSecret=true
7. สร้าง connections แบบ linear: room[i] → room[i+1]
   - secret room: ใช้ secret_door
   - first connection: door
   - อื่น ๆ: สุ่ม door/corridor/open_archway
   - เพิ่ม 1 secret branch (50% โอกาส)
8. สร้าง room contents:
   - entrance: dressing + monster (CR ~ party level)
   - puzzle: puzzle from PUZZLE_TABLE
   - setback: trap from TRAP_TABLE
   - climax: monster (boss, CR ~ party level + 2 to +4)
   - reward: treasure from TREASURE_TABLE (matching party level)
9. สร้าง blueprint object พร้อม metadata
```

### Helper Functions (private — ไม่ export)

| Function | บรรทัด | หน้าที่ |
|---|---|---|
| `makeRng(seed?)` | 481 | seeded RNG (mulberry32) หรือ Math.random |
| `pick(arr, rng)`, `pickN(arr, n, rng)`, `randomInt(min, max, rng)` | 493-510 | random utilities |
| `makeRoomName(theme, rng)` | 512 | สุ่มชื่อห้องจาก prefix+suffix |
| `pickMonstersForLevel(theme, level, rng, count)` | 517 | กรอง monster ตาม CR ≤ level+2 |
| `pickBossForLevel(theme, level, rng)` | 534 | กรอง boss ตาม CR ≥ level+1 และ ≤ level+4 |
| `makeTreasureForLevel(level, rng)` | 555 | สร้าง treasure จาก TREASURE_TABLE tier |
| `makeRoomForRole(role, roomId, name, theme, level, rng, isSecret)` | (ไม่ export) | สร้าง room object สำหรับ role ที่กำหนด |

### Dependencies

```typescript
import type {
  DungeonBlueprint, DungeonTheme, Room, RoomConnection,
  RoomRole, RoomContent, ConnectionType,
} from "./dungeon.js";
```

Type-only imports — dungeonTables.ts ใช้ structures จาก dungeon.ts แต่ไม่ได้ execute อะไร

### สถานะการใช้งาน

- **UI (DnDSolo.tsx)**: ✅ import โดยตรง — `generateProceduralDungeon`, `ProceduralDungeonParams`
- **Tests**: ✅ test_dungeon_system, test_comprehensive

---

## การใช้งานใน UI (DnDSolo.tsx)

### เมื่อผู้เล่นเข้า dungeon entrance

```typescript
// 1. DM/LLM เลือก theme + party level → เรียก procedural generator
const blueprint = generateProceduralDungeon({
  theme: "crypt",
  partyLevel: character.level,
  numRooms: 6,
  dungeonId: "wave_echo_cave",
  dungeonName: "ถ้ำเสียงคลื่น",
  entranceWorldMapId: currentMapNode.id,
  hook: "ชาวบ้านรายงานเสียงผีเสียงหลงในถ้ำ",
  antagonist: "Bone Necromancer",
});

// 2. Validate blueprint
const validation = validateDungeonBlueprint(blueprint);
if (!validation.isValid) {
  // fallback to template or error
}

// 3. สร้าง run state
const runState = createDungeonRunState(blueprint);

// 4. ส่ง context ไป DM (ใน system prompt)
// [🏰 DUNGEON CONTEXT] + current room description + available exits
```

### เมื่อผู้เล่นเคลื่อนที่

```typescript
// 1. Player พิมพ์ "ไปทางเหนือ"
// 2. DM/LLM ตอบว่าย้ายห้อง
const { state: newState, room, isFirstVisit } = moveToRoom(
  runState, blueprint, targetRoomId
);

// 3. ถ้า first visit → ส่ง room description ไป DM สำหรับ narration
if (isFirstVisit) {
  const roomDesc = `${room.name}: ${room.description}\n${room.atmosphere ?? ""}`;
  // append to DM context
}

// 4. ถ้า room มี stagedEncounter → start combat
if (room.stagedEncounter) {
  // initCombat with monsterIds
}

// 5. ถ้า room มี stagedTrap → check detection
if (room.stagedTrap) {
  // passivePerception check vs stagedTrap.detectionDC
}

// 6. ถ้า room มี stagedPuzzle → ส่ง puzzle description ไป DM
// 7. ถ้า room มี stagedLoot → แจกรางวัลเมื่อ cleared

// 8. Update run state
setRunState(newState);
```

### การแสดงผลใน UI

```typescript
// Fog-of-War view
const visible = getVisibleDungeonInfo(runState, blueprint);

// Render:
// - currentRoom: ชื่อ + description + atmosphere + contents
// - availableExits: list ของ { direction, type (ประตู/ทางเดิน/...), isLocked, isSecret }
// - visibleRooms: แผนที่ย่อ (visited + adjacent)
// - progress: summarizeDungeonProgress → "3/5 ห้อง (60%) · บอสกำจัดแล้ว"
```

---

## สรุป Dungeon System

### สถานะการ wire

| Component | ใช้ใน UI? | สถานะ |
|---|:---:|---|
| `DungeonBlueprint` type | ✅ | DnDSolo ใช้เป็น state shape |
| `generateProceduralDungeon` | ✅ | DnDSolo เรียกเมื่อเข้า dungeon |
| `createDungeonRunState` | ✅ | ใช้เริ่ม dungeon run |
| `moveToRoom` | ✅ | ใช้เมื่อผู้เล่นย้ายห้อง |
| `markRoomCleared`, `markBossDefeated` | ✅ | ใช้หลัง combat จบ |
| `discoverSecretRoom`, `discoverSecretConnection` | ✅ | ใช้เมื่อ Perception check ผ่าน |
| `getVisibleDungeonInfo` | ✅ | ใช้ render fog-of-war |
| `validateDungeonBlueprint` | ✅ | ใช้หลัง generate เพื่อ sanity check |
| `summarizeDungeonProgress` | ✅ | ใช้ใน progress indicator |
| `getRoomRoleLabel`, `getRoomRoleIcon`, `getConnectionTypeLabel` | ✅ | ใช้ใน UI labels |
| `isObjectiveInThisDungeon` | ✅ | ใช้ auto-complete quest objective |
| `DUNGEON_TEMPLATES` | ❌ | ยังไม่ wire — DM เลือก procedural generation เท่านั้น |

### Design Notes

1. **Blueprint = static** — DM เตรียมครั้งเดียว ไม่เปลี่ยนระหว่าง run
2. **Run State = mutable** — เปลี่ยนตลอดเวลาตาม player action (เก็บใน React state ของ DnDSolo)
3. **Fog-of-War คำนวณใหม่ทุกครั้ง** — `getVisibleDungeonInfo` run ทุก render
4. **5-Room pattern** — engine แนะนำแต่ไม่บังคับ (warning ถ้า missing roles)
5. **Seeded RNG** — `generateProceduralDungeon` รองรับ seed สำหรับ reproducible dungeons (แต่ DnDSolo ยังไม่ได้ใช้)
6. **No dice rolling** — dungeon.ts/dungeonTables.ts ไม่ roll dice เอง — ใช้ RNG ของตัวเองเท่านั้น (สำหรับ procedural gen)
   trap detection, monster initiative, etc. ทำใน DnDSolo หรือ engine

### ขนาดการใช้งาน

- **Number of imports in DnDSolo.tsx**: 12 functions + 5 types จาก dungeon.ts
- **Number of imports in DnDSolo.tsx**: 1 function + 1 type จาก dungeonTables.ts
- **Total**: 19 imports — เป็น domain ที่ wire เข้า UI มากที่สุด

ดูเพิ่มเติม:
- [03-rules/exploration-travel.md](../03-rules/exploration-travel.md) — exploration rules
- [08-gaps/unwired-engine.md](../08-gaps/unwired-engine.md) — engine/ modules ที่ยังไม่ wire
