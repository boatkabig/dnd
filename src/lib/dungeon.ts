/**
 * Domain 36: Dungeon Blueprint System
 *
 * DM เตรียม dungeon ทั้งหมดครั้งเดียวตอนผู้เล่นเข้า dungeon entrance
 * Engine เก็บ blueprint และ reveal ทีละห้องตามที่ผู้เล่น explore (fog of war)
 *
 * Design sources:
 *  - Mike Shea (Sly Flourish) — 5-Room Dungeon pattern
 *  - Justin Alexander (The Alexandrian) — Node-based design (3+ exits/room)
 *  - D&D 5e DMG — "Dungeon Adventures" (chapter 5)
 *
 * Sub-systems:
 *  36.1 Dungeon Blueprint — top-level dungeon structure
 *  36.2 Room              — single room with contents, role, atmosphere
 *  36.3 Room Connection   — door/corridor/secret between rooms
 *  36.4 Room Role         — 5-Room pattern tags (entrance/puzzle/setback/climax/reward)
 *  36.5 Dungeon Run State — progress tracking, visited/cleared, boss state
 *  36.6 5-Room Validation — engine checks blueprint has all 5 roles
 *  36.7 Fog-of-War Reveal — what player can see now
 */

/* ======================================================================
 * 36.1 DUNGEON BLUEPRINT
 * ====================================================================== */

export type DungeonTheme =
  | "crypt"        // หลุมศพ — undead, necrotic, dark
  | "cave"         // ถ้ำธรรมชาติ — beasts, oozes, damp
  | "wizard_tower" // หอเวท — constructs, magical traps, arcane
  | "abandoned_mine" // เหมืองร้าง — kobolds, oozes, cave-ins
  | "ancient_temple" // วัดโบราณ — cultists, guardians, divine traps
  | "sewer"        // ท่อระบายน้ำ — oozes, rats, disease
  | "ruined_castle" // ปราสาทร้าง — bandits, undead, decay
  | "forest_shrine" // ศาลาในป่า — fey, beasts, natural
  | "underwater"   // ใต้น้ำ — sea creatures, drowning hazard
  | "fiendish"     // ขุมนรก — fiends, fire, alignment hazard
  | "generic";     // อื่น ๆ

export interface DungeonBlueprint {
  id: string;            // snake_case stable id (e.g. "wave_echo_cave")
  name: string;          // display name (Thai ok, e.g. "ถ้ำเสียงคลื่น")
  theme: DungeonTheme;
  entranceWorldMapId: string;   // world map node id where this dungeon sits
  entranceRoomId: string;       // room id where player enters
  description: string;          // short flavor text shown when first entered
  rooms: Room[];
  connections: RoomConnection[];
  bossRoomId?: string;          // climax room (if any)
  rewardRoomId?: string;        // final reward room
  totalSecrets: number;         // # of secret doors/treasures
  recommendedLevel: number;     // DM-suggested party level
  estimatedRoomsToClear: number; // approximate # of rooms for full clear
  hook?: string;                // why player is here (1-2 sentences)
  antagonist?: string;          // who/what is the boss
  loot?: DungeonLootSpec[];     // DM-curated treasure hoards per room
}

export interface DungeonLootSpec {
  roomId: string;
  items: string[];   // item descriptors (e.g. "Potion of Healing", "Longsword +1", "50gp")
  isHidden: boolean; // requires Perception/Investigation to find
  detectionDC?: number;
}

/* ======================================================================
 * 36.2 ROOM
 * ====================================================================== */

export type RoomRole =
  | "entrance"     // Room 1: Entrance + Guardian
  | "puzzle"       // Room 2: Puzzle / Roleplay challenge
  | "setback"      // Room 3: Trick / Trap / Setback
  | "climax"       // Room 4: Big fight (boss)
  | "reward"       // Room 5: Reward / Revelation
  | "transition"   // corridor / stairway (not in 5-Room but common)
  | "secret"       // hidden room (off main path)
  | "empty";       // dressing only (atmosphere, lore)

export type RoomShape = "square" | "rect" | "round" | "irregular" | "corridor";
export type RoomSize = "tiny" | "small" | "medium" | "large" | "huge";

export interface Room {
  id: string;             // snake_case (e.g. "entrance_chamber", "boss_lair")
  name: string;           // display name (Thai ok)
  role: RoomRole;
  shape: RoomShape;
  size: RoomSize;
  dimensions?: { width: number; height: number }; // in 5-foot squares (for combat grid)
  description: string;            // DM-prepared narration for entering
  atmosphere?: string;            // sensory details (smell/sound/light)
  contents: RoomContent[];        // what's in the room
  exits: string[];                // connection ids leading out
  isSecret: boolean;              // requires Perception check to discover
  secretDetectionDC?: number;     // DC for Perception/Investigation to find (if secret)
  isLocked?: boolean;             // entrance locked (need key / Thieves' Tools)
  lockDC?: number;
  // Optional: DM can pre-stage encounter here
  stagedEncounter?: {
    monsterIds: string[];
    surprise?: boolean;
    isBoss?: boolean;
    lairActions?: string[];
  };
  // Optional: pre-staged trap
  stagedTrap?: {
    name: string;
    description: string;
    detectionDC: number;
    disableDC: number;
    damage: string;
    damageType: string;
    saveAbility: "dex" | "str" | "con" | "wis" | "int" | "cha";
    saveDC: number;
    triggerType: "step_on" | "open" | "touch" | "time" | "condition";
  };
  // Optional: pre-staged puzzle
  stagedPuzzle?: {
    name: string;
    description: string;
    solution: string;        // DM knows the answer (for narration)
    solutionCheck?: { skill: string; dc: number }; // if solvable by skill
    hintDC?: number;         // Investigation/Insight to get hint
    rewardItems?: string[];  // what solving gives
    failureConsequence?: string;
  };
  // Optional: pre-staged loot (overlaps with DungeonLootSpec but room-level)
  stagedLoot?: string[];
}

export interface RoomContent {
  type:
    | "monster"        // combat encounter
    | "trap"           // trap (hidden or visible)
    | "treasure"       // gold / items / hoard
    | "puzzle"         // interactive puzzle
    | "npc"            // NPC to talk to
    | "lore"           // inscription, journal, mural
    | "object"         // chest, lever, statue, fountain
    | "secret_door"    // hidden passage
    | "environment"    // water, chasm, altar, pit
    | "dressing";      // atmospheric only (cobwebs, broken furniture)
  description: string;
  isHidden?: boolean;       // requires check to find
  detectionDC?: number;
  interactionNote?: string; // hint to DM about how players typically interact
}

/* ======================================================================
 * 36.3 ROOM CONNECTION
 * ====================================================================== */

export type ConnectionType = "door" | "corridor" | "stair" | "secret_door" | "open_archway" | "trapdoor" | "portal";

export interface RoomConnection {
  id: string;
  from: string;        // room id
  to: string;          // room id
  type: ConnectionType;
  direction: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "up" | "down";
  description?: string;
  isLocked?: boolean;
  lockDC?: number;     // Thieves' Tools DC to unlock
  isSecret?: boolean;
  secretDetectionDC?: number; // Perception DC to spot (if secret)
  isTrapped?: boolean;
  trapRef?: string;    // optional: ref to trap definition
}

/* ======================================================================
 * 36.4 DUNGEON RUN STATE — tracks player's progress through a dungeon
 * ====================================================================== */

export interface DungeonRunState {
  blueprintId: string;
  currentRoomId: string;
  visitedRoomIds: string[];     // rooms player has entered
  clearedRoomIds: string[];     // rooms where encounter/trap resolved
  discoveredSecretRoomIds: string[]; // secret rooms player found
  discoveredSecretConnectionIds: string[]; // secret doors player found
  bossDefeated: boolean;
  totalRooms: number;
  roomsCleared: number;
  totalSecrets: number;
  secretsFound: number;
  startedAtSeconds: number;
  /** Returns 0..1 progress through the dungeon */
  progress: number;
  /** True if player has reached the boss room (whether defeated or not) */
  hasReachedBoss: boolean;
}

export function createDungeonRunState(
  blueprint: DungeonBlueprint,
  startSeconds = Date.now(),
): DungeonRunState {
  return {
    blueprintId: blueprint.id,
    currentRoomId: blueprint.entranceRoomId,
    visitedRoomIds: [blueprint.entranceRoomId],
    clearedRoomIds: [],
    discoveredSecretRoomIds: [],
    discoveredSecretConnectionIds: [],
    bossDefeated: false,
    totalRooms: blueprint.rooms.length,
    roomsCleared: 0,
    totalSecrets: blueprint.totalSecrets,
    secretsFound: 0,
    startedAtSeconds: startSeconds,
    progress: 0,
    hasReachedBoss: false,
  };
}

export function moveToRoom(
  state: DungeonRunState,
  blueprint: DungeonBlueprint,
  roomId: string,
): { state: DungeonRunState; room: Room | null; isFirstVisit: boolean } {
  const room = blueprint.rooms.find((r) => r.id === roomId);
  if (!room) return { state, room: null, isFirstVisit: false };

  const isFirstVisit = !state.visitedRoomIds.includes(roomId);
  const newVisited = isFirstVisit ? [...state.visitedRoomIds, roomId] : state.visitedRoomIds;
  const hasReachedBoss = state.hasReachedBoss || roomId === blueprint.bossRoomId;

  return {
    state: {
      ...state,
      currentRoomId: roomId,
      visitedRoomIds: newVisited,
      hasReachedBoss,
    },
    room,
    isFirstVisit,
  };
}

export function markRoomCleared(state: DungeonRunState, roomId: string): DungeonRunState {
  if (state.clearedRoomIds.includes(roomId)) return state;
  const cleared = [...state.clearedRoomIds, roomId];
  const roomsCleared = cleared.length;
  const progress = state.totalRooms > 0 ? roomsCleared / state.totalRooms : 0;
  return { ...state, clearedRoomIds: cleared, roomsCleared, progress };
}

export function markBossDefeated(state: DungeonRunState): DungeonRunState {
  return { ...state, bossDefeated: true };
}

export function discoverSecretRoom(state: DungeonRunState, roomId: string): DungeonRunState {
  if (state.discoveredSecretRoomIds.includes(roomId)) return state;
  const discovered = [...state.discoveredSecretRoomIds, roomId];
  const secretsFound = Math.min(state.totalSecrets, state.secretsFound + 1);
  return { ...state, discoveredSecretRoomIds: discovered, secretsFound };
}

export function discoverSecretConnection(state: DungeonRunState, connectionId: string): DungeonRunState {
  if (state.discoveredSecretConnectionIds.includes(connectionId)) return state;
  const discovered = [...state.discoveredSecretConnectionIds, connectionId];
  const secretsFound = Math.min(state.totalSecrets, state.secretsFound + 1);
  return { ...state, discoveredSecretConnectionIds: discovered, secretsFound };
}

/* ======================================================================
 * 36.5 5-ROOM VALIDATION
 * ====================================================================== */

export interface DungeonValidationResult {
  isValid: boolean;
  missingRoles: RoomRole[];
  warnings: string[];
  errors: string[];
}

export function validateDungeonBlueprint(blueprint: DungeonBlueprint): DungeonValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required: at least 5 rooms (5-Room pattern), at least 1 entrance
  if (blueprint.rooms.length < 5) {
    warnings.push(`Dungeon has only ${blueprint.rooms.length} rooms — 5-Room pattern recommends 5+`);
  }

  // Required: entrance room exists
  const entrance = blueprint.rooms.find((r) => r.role === "entrance");
  if (!entrance) errors.push("Missing 'entrance' role room");
  if (blueprint.entranceRoomId && !blueprint.rooms.find((r) => r.id === blueprint.entranceRoomId)) {
    errors.push(`entranceRoomId '${blueprint.entranceRoomId}' not found in rooms[]`);
  }

  // Required: at least 1 of each 5-Room role
  const requiredRoles: RoomRole[] = ["entrance", "puzzle", "setback", "climax", "reward"];
  const presentRoles = new Set(blueprint.rooms.map((r) => r.role));
  const missingRoles = requiredRoles.filter((r) => !presentRoles.has(r));
  if (missingRoles.length > 0) {
    warnings.push(`Missing 5-Room roles: ${missingRoles.join(", ")} — dungeon may feel incomplete`);
  }

  // Required: connections form a connected graph (every room reachable from entrance)
  if (entrance) {
    const reachable = new Set<string>([entrance.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const conn of blueprint.connections) {
        if (reachable.has(conn.from) && !reachable.has(conn.to)) {
          reachable.add(conn.to);
          changed = true;
        }
        if (reachable.has(conn.to) && !reachable.has(conn.from)) {
          reachable.add(conn.from);
          changed = true;
        }
      }
    }
    const unreachable = blueprint.rooms.filter((r) => !reachable.has(r.id) && !r.isSecret);
    if (unreachable.length > 0) {
      warnings.push(`Unreachable non-secret rooms: ${unreachable.map((r) => r.id).join(", ")}`);
    }
  }

  // Boss room reference must exist
  if (blueprint.bossRoomId && !blueprint.rooms.find((r) => r.id === blueprint.bossRoomId)) {
    errors.push(`bossRoomId '${blueprint.bossRoomId}' not found in rooms[]`);
  }

  // Connection refs must point to real rooms
  for (const conn of blueprint.connections) {
    if (!blueprint.rooms.find((r) => r.id === conn.from)) {
      errors.push(`Connection '${conn.id}' from '${conn.from}' references non-existent room`);
    }
    if (!blueprint.rooms.find((r) => r.id === conn.to)) {
      errors.push(`Connection '${conn.id}' to '${conn.to}' references non-existent room`);
    }
  }

  return {
    isValid: errors.length === 0,
    missingRoles,
    warnings,
    errors,
  };
}

/* ======================================================================
 * 36.6 FOG-OF-WAR REVEAL
 * ====================================================================== */

export interface VisibleRoomInfo {
  roomId: string;
  name: string;
  role: RoomRole;
  /** Was this room visited by player? (full info shown) */
  visited: boolean;
  /** Is this room currently occupied? (current room) */
  isCurrent: boolean;
  /** Is this room adjacent to a visited room? (basic info shown) */
  isAdjacent: boolean;
  /** Is this room a secret room that's been discovered? */
  isSecretDiscovered: boolean;
  /** Exit info player can see */
  visibleExits: Array<{
    connectionId: string;
    direction: string;
    type: ConnectionType;
    /** For secret doors: only shown if discovered */
    isSecret: boolean;
    isSecretDiscovered: boolean;
    isLocked: boolean;
    /** Room name only shown if visited OR adjacent (else "unknown") */
    destinationName?: string;
    destinationVisited: boolean;
  }>;
}

export function getVisibleDungeonInfo(
  state: DungeonRunState,
  blueprint: DungeonBlueprint,
): {
  currentRoom: Room | null;
  visibleRooms: VisibleRoomInfo[];
  /** Rooms adjacent to current room (for movement UI) */
  availableExits: Array<{
    connection: RoomConnection;
    destinationRoom: Room;
    isLocked: boolean;
    isSecret: boolean;
    isSecretDiscovered: boolean;
  }>;
} {
  const currentRoom = blueprint.rooms.find((r) => r.id === state.currentRoomId) || null;

  // Visible rooms = visited + adjacent to visited (excluding secret unless discovered)
  const visibleRoomIds = new Set<string>();
  for (const visitedId of state.visitedRoomIds) {
    visibleRoomIds.add(visitedId);
    // Add adjacent rooms via non-secret connections (or discovered secret connections)
    for (const conn of blueprint.connections) {
      if (conn.from === visitedId || conn.to === visitedId) {
        const otherId = conn.from === visitedId ? conn.to : conn.from;
        if (conn.isSecret) {
          // Only reveal if discovered
          if (state.discoveredSecretConnectionIds.includes(conn.id)) {
            visibleRoomIds.add(otherId);
          }
        } else {
          visibleRoomIds.add(otherId);
        }
      }
    }
  }
  // Add discovered secret rooms
  for (const secretId of state.discoveredSecretRoomIds) visibleRoomIds.add(secretId);

  const visibleRooms: VisibleRoomInfo[] = blueprint.rooms
    .filter((r) => visibleRoomIds.has(r.id))
    .map((r) => {
      const visited = state.visitedRoomIds.includes(r.id);
      const isCurrent = r.id === state.currentRoomId;
      const isSecretDiscovered = state.discoveredSecretRoomIds.includes(r.id);
      const isAdjacent = !visited && isRoomAdjacentToVisited(r.id, state, blueprint);

      const visibleExits: VisibleRoomInfo["visibleExits"] = blueprint.connections
        .filter((c) => c.from === r.id || c.to === r.id)
        .map((c) => {
          const destId = c.from === r.id ? c.to : c.from;
          const destRoom = blueprint.rooms.find((rr) => rr.id === destId);
          const destVisited = state.visitedRoomIds.includes(destId);
          const secretDiscovered = state.discoveredSecretConnectionIds.includes(c.id);
          // Hide secret exits unless discovered
          if (c.isSecret && !secretDiscovered) return null;
          return {
            connectionId: c.id,
            direction: c.direction,
            type: c.type,
            isSecret: !!c.isSecret,
            isSecretDiscovered: secretDiscovered,
            isLocked: !!c.isLocked,
            destinationName: destVisited && destRoom ? destRoom.name : undefined,
            destinationVisited: destVisited,
          };
        })
        .filter(Boolean) as VisibleRoomInfo["visibleExits"];

      return {
        roomId: r.id,
        name: r.name,
        role: r.role,
        visited,
        isCurrent,
        isAdjacent,
        isSecretDiscovered,
        visibleExits,
      };
    });

  // Available exits from current room (for movement UI)
  const availableExits = currentRoom
    ? blueprint.connections
        .filter((c) => c.from === currentRoom.id || c.to === currentRoom.id)
        .map((c) => {
          const destId = c.from === currentRoom.id ? c.to : c.from;
          const destRoom = blueprint.rooms.find((rr) => rr.id === destId);
          if (!destRoom) return null;
          const isSecretDiscovered = state.discoveredSecretConnectionIds.includes(c.id);
          // Hide secret exits unless discovered
          if (c.isSecret && !isSecretDiscovered) return null;
          return {
            connection: c,
            destinationRoom: destRoom,
            isLocked: !!c.isLocked,
            isSecret: !!c.isSecret,
            isSecretDiscovered,
          };
        })
        .filter(Boolean) as NonNullable<ReturnType<typeof getVisibleDungeonInfo>["availableExits"][number]>[]
    : [];

  return { currentRoom, visibleRooms, availableExits };
}

function isRoomAdjacentToVisited(
  roomId: string,
  state: DungeonRunState,
  blueprint: DungeonBlueprint,
): boolean {
  for (const conn of blueprint.connections) {
    if (conn.from !== roomId && conn.to !== roomId) continue;
    const otherId = conn.from === roomId ? conn.to : conn.from;
    if (!state.visitedRoomIds.includes(otherId)) continue;
    if (conn.isSecret && !state.discoveredSecretConnectionIds.includes(conn.id)) continue;
    return true;
  }
  return false;
}

/* ======================================================================
 * 36.7 DUNGEON SUMMARY HELPERS (for UI display)
 * ====================================================================== */

export function summarizeDungeonProgress(state: DungeonRunState, blueprint: DungeonBlueprint): string {
  const pct = Math.round(state.progress * 100);
  const boss = state.bossDefeated ? "บอสกำจัดแล้ว" : state.hasReachedBoss ? "เจอบอสแล้ว" : "ยังไม่เจอบอส";
  return `${state.roomsCleared}/${state.totalRooms} ห้อง (${pct}%) · ${boss} · ความลับ ${state.secretsFound}/${state.totalSecrets}`;
}

export function getRoomRoleLabel(role: RoomRole): string {
  const map: Record<RoomRole, string> = {
    entrance: "ทางเข้า",
    puzzle: "ปริศนา",
    setback: "อุปสรรค/กับดัก",
    climax: "บอส",
    reward: "รางวัล",
    transition: "ทางเดิน",
    secret: "ห้องลับ",
    empty: "ห้องว่าง",
  };
  return map[role];
}

export function getRoomRoleIcon(role: RoomRole): string {
  const map: Record<RoomRole, string> = {
    entrance: "🚪",
    puzzle: "🧩",
    setback: "⚠️",
    climax: "💀",
    reward: "💎",
    transition: "→",
    secret: "❓",
    empty: "·",
  };
  return map[role];
}

export function getConnectionTypeLabel(type: ConnectionType): string {
  const map: Record<ConnectionType, string> = {
    door: "ประตู",
    corridor: "ทางเดิน",
    stair: "บันได",
    secret_door: "ประตูลับ",
    open_archway: "ซุ้มเปิด",
    trapdoor: "พื้นประตูกับดัก",
    portal: "ประตูมิติ",
  };
  return map[type];
}

/* ======================================================================
 * 36.8 QUEST ↔ DUNGEON LINKAGE HELPERS
 * ====================================================================== */

/**
 * Returns true if a quest objective targets this dungeon (by location id).
 * Used by the engine to auto-complete objectives when boss is defeated or
 * specific items are picked up.
 */
export function isObjectiveInThisDungeon(
  objective: { targetId?: string; type: string },
  blueprint: DungeonBlueprint,
): boolean {
  if (!objective.targetId) return false;
  // targetId can be either the dungeon id, the boss room id, or a room id
  return (
    objective.targetId === blueprint.id ||
    objective.targetId === blueprint.bossRoomId ||
    blueprint.rooms.some((r) => r.id === objective.targetId)
  );
}
