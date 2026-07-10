/**
 * Smoke test for Domain 36: Dungeon Blueprint System
 * Run with: npx tsx scripts/test_dungeon_system.ts
 */

import {
  createDungeonRunState, moveToRoom, markRoomCleared, markBossDefeated,
  discoverSecretRoom, discoverSecretConnection, getVisibleDungeonInfo,
  validateDungeonBlueprint, summarizeDungeonProgress,
  getRoomRoleLabel, getRoomRoleIcon, isObjectiveInThisDungeon,
  type DungeonBlueprint, type Room, type RoomConnection,
} from "../src/lib/dungeon";
import {
  generateProceduralDungeon, DUNGEON_TEMPLATES, DUNGEON_DRESSING_TABLE,
  DUNGEON_MONSTER_TABLE, TRAP_TABLE, PUZZLE_TABLE, TREASURE_TABLE,
} from "../src/lib/dungeonTables";

let pass = 0;
let fail = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}`);
    fail++;
  }
}

console.log("\n=== Domain 36: Dungeon Blueprint System Smoke Test ===\n");

// Test 1: Procedural dungeon generation
console.log("Test 1: Procedural dungeon generation");
const crypt1 = generateProceduralDungeon({
  theme: "crypt",
  partyLevel: 3,
  dungeonId: "test_crypt",
  dungeonName: "ถ้ำกระดูกทดสอบ",
  entranceWorldMapId: "town",
  hook: "Test hook",
  seed: 42,
});
assert(crypt1.id === "test_crypt", "dungeon id preserved");
assert(crypt1.theme === "crypt", "theme preserved");
assert(crypt1.rooms.length >= 5, `at least 5 rooms (got ${crypt1.rooms.length})`);
assert(!!crypt1.entranceRoomId, "has entrance room");
assert(!!crypt1.bossRoomId, "has boss room (climax role)");
assert(crypt1.connections.length >= crypt1.rooms.length - 1, "enough connections (linear spine)");
assert(crypt1.totalSecrets >= 0, "totalSecrets defined");

// Test 2: Validate the generated blueprint
console.log("\nTest 2: Validate generated blueprint");
const validation = validateDungeonBlueprint(crypt1);
assert(validation.isValid, `blueprint is valid (errors: ${validation.errors.join("; ")})`);
assert(validation.missingRoles.length === 0, `all 5-Room roles present (missing: ${validation.missingRoles.join(",")})`);

// Test 3: Create run state
console.log("\nTest 3: Create dungeon run state");
const runState = createDungeonRunState(crypt1);
assert(runState.currentRoomId === crypt1.entranceRoomId, "starts at entrance");
assert(runState.visitedRoomIds.length === 1, "1 room visited initially");
assert(runState.roomsCleared === 0, "0 rooms cleared initially");
assert(runState.bossDefeated === false, "boss not yet defeated");

// Test 4: Move to next room
console.log("\nTest 4: Move to next room");
const entrance = crypt1.rooms.find((r) => r.id === crypt1.entranceRoomId)!;
assert(entrance.exits.length > 0, "entrance has at least 1 exit");
const firstConn = crypt1.connections.find((c) => c.id === entrance.exits[0])!;
const nextRoomId = firstConn.from === entrance.id ? firstConn.to : firstConn.from;
const moveResult = moveToRoom(runState, crypt1, nextRoomId);
assert(!!moveResult.room, "moved to a real room");
assert(moveResult.isFirstVisit === true, "first visit registered");
assert(moveResult.state.currentRoomId === nextRoomId, "currentRoomId updated");
assert(moveResult.state.visitedRoomIds.length === 2, "now 2 rooms visited");

// Test 5: Mark room cleared
console.log("\nTest 5: Mark room cleared");
const clearedState = markRoomCleared(moveResult.state, nextRoomId);
assert(clearedState.roomsCleared === 1, "1 room cleared");
assert(clearedState.clearedRoomIds.includes(nextRoomId), "room in clearedRoomIds");
assert(clearedState.progress > 0, "progress > 0");

// Test 6: Mark boss defeated
console.log("\nTest 6: Mark boss defeated");
const bossState = markBossDefeated(clearedState);
assert(bossState.bossDefeated === true, "bossDefeated = true");

// Test 7: Get visible dungeon info (fog of war)
console.log("\nTest 7: Fog-of-war reveal");
const visInfo = getVisibleDungeonInfo(runState, crypt1);
assert(visInfo.currentRoom !== null, "current room is set");
assert(visInfo.visibleRooms.length >= 1, "at least 1 visible room");
assert(visInfo.availableExits.length >= 1, "at least 1 available exit from entrance");

// Test 8: Each template generates valid dungeon
console.log("\nTest 8: Each dungeon template generates valid dungeon");
for (const tpl of DUNGEON_TEMPLATES) {
  const gen = generateProceduralDungeon({
    theme: tpl.theme,
    partyLevel: tpl.recommendedLevel,
    dungeonId: tpl.id,
    dungeonName: tpl.name,
    entranceWorldMapId: "test",
    hook: tpl.hook,
    seed: 100,
  });
  const v = validateDungeonBlueprint(gen);
  assert(v.isValid && gen.rooms.length >= 5, `${tpl.name} (${tpl.theme}) — valid, ${gen.rooms.length} rooms`);
}

// Test 9: Each theme produces a dungeon
console.log("\nTest 9: Each theme generates dungeon");
const themes = ["crypt","cave","wizard_tower","abandoned_mine","ancient_temple","sewer","ruined_castle","forest_shrine","underwater","fiendish","generic"] as const;
for (const theme of themes) {
  const gen = generateProceduralDungeon({
    theme,
    partyLevel: 5,
    dungeonId: `theme_${theme}`,
    dungeonName: `Theme ${theme}`,
    entranceWorldMapId: "test",
    seed: 200,
  });
  assert(gen.theme === theme && gen.rooms.length >= 5, `${theme} — generates (${gen.rooms.length} rooms)`);
}

// Test 10: Tables have content
console.log("\nTest 10: Random tables have content");
for (const theme of themes) {
  assert((DUNGEON_DRESSING_TABLE[theme]?.length || 0) >= 5, `${theme} dressing table has 5+ entries`);
  assert((DUNGEON_MONSTER_TABLE[theme]?.length || 0) >= 5, `${theme} monster table has 5+ entries`);
}
assert(TRAP_TABLE.length >= 5, `trap table has 5+ entries (got ${TRAP_TABLE.length})`);
assert(PUZZLE_TABLE.length >= 3, `puzzle table has 3+ entries (got ${PUZZLE_TABLE.length})`);
assert(TREASURE_TABLE.length === 4, `treasure table has 4 tiers (got ${TREASURE_TABLE.length})`);

// Test 11: Roles labels and icons
console.log("\nTest 11: Role labels and icons");
const roles: any[] = ["entrance","puzzle","setback","climax","reward","transition","secret","empty"];
for (const role of roles) {
  assert(getRoomRoleLabel(role).length > 0, `${role} has label`);
  assert(getRoomRoleIcon(role).length > 0, `${role} has icon`);
}

// Test 12: Summarize progress
console.log("\nTest 12: Progress summary");
const summary = summarizeDungeonProgress(runState, crypt1);
assert(summary.includes("0/" + crypt1.rooms.length), `summary shows 0/${crypt1.rooms.length}`);
assert(summary.includes("ยังไม่เจอบอส"), "summary mentions boss not yet");

// Test 13: Quest linkage helper
console.log("\nTest 13: Quest linkage helper");
assert(isObjectiveInThisDungeon({ targetId: crypt1.id, type: "kill" }, crypt1) === true, "matches dungeon id");
assert(isObjectiveInThisDungeon({ targetId: crypt1.bossRoomId!, type: "kill" }, crypt1) === true, "matches boss room id");
assert(isObjectiveInThisDungeon({ targetId: "other_place", type: "kill" }, crypt1) === false, "rejects unrelated target");
assert(isObjectiveInThisDungeon({ type: "kill" }, crypt1) === false, "rejects missing targetId");

// Test 14: Discover secret room
console.log("\nTest 14: Secret discovery");
const secretState1 = discoverSecretRoom(runState, "secret_room_1");
assert(secretState1.discoveredSecretRoomIds.includes("secret_room_1"), "secret room discovered");
assert(secretState1.secretsFound === 1, "secret count incremented");
const secretState2 = discoverSecretRoom(secretState1, "secret_room_1");
assert(secretState2.secretsFound === 1, "discovering same secret again doesn't increment");

// Test 15: Connection discovery
console.log("\nTest 15: Secret connection discovery");
const connState = discoverSecretConnection(runState, "secret_conn_1");
assert(connState.discoveredSecretConnectionIds.includes("secret_conn_1"), "secret connection discovered");

// Test 16: Reaching boss room sets hasReachedBoss
console.log("\nTest 16: hasReachedBoss tracking");
if (crypt1.bossRoomId) {
  const bossReach = moveToRoom(runState, crypt1, crypt1.bossRoomId);
  assert(bossReach.state.hasReachedBoss === true, "hasReachedBoss set when entering boss room");
}

// Test 17: Each room has appropriate contents based on role
console.log("\nTest 17: Room contents match role");
for (const room of crypt1.rooms) {
  switch (room.role) {
    case "entrance":
      // Should have either stagedEncounter or just dressing
      assert(room.contents.length > 0, `entrance room '${room.name}' has content`);
      break;
    case "puzzle":
      assert(!!room.stagedPuzzle, `puzzle room '${room.name}' has stagedPuzzle`);
      break;
    case "setback":
      assert(!!room.stagedTrap, `setback room '${room.name}' has stagedTrap`);
      break;
    case "climax":
      assert(!!room.stagedEncounter?.isBoss, `climax room '${room.name}' has boss encounter`);
      break;
    case "reward":
      assert(!!room.stagedLoot && room.stagedLoot.length > 0, `reward room '${room.name}' has loot`);
      break;
  }
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail > 0 ? 1 : 0);
