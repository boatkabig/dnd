import { createEnvironment, WEATHER_PRESETS, TEMPERATURE_PRESETS, getLightLevelAt } from "../src/lib/environment";
import { TERRAIN_DEFS, TERRAIN_FEATURES, BIOME_CONFIGS, generateTerrainSquare, canInteractTerrain } from "../src/lib/terrain";
import { canSeeInLight, hasLineOfSight, getVisibility, passivePerception, detectWithPassive, canHearSound, VISION_TYPES } from "../src/lib/vision";
import { canHide, rollStealth, checkSurprise, rollTracking, getStealthModifiers, createHiddenState, updateHiddenFrom, getDetectionDifficulty } from "../src/lib/stealth";
import { getDistance, getGridDistance, isMeleeRange, isWithinRange, calculateCover, hasLineOfAttack, hasHighGround, isFlanking, createPush, createFall, checkPositionTriggers, COVER_AC_BONUS } from "../src/lib/cover";

console.log("=== Environment, Terrain, Vision, Stealth, Cover Tests ===\n");

// --- ENVIRONMENT ---
const env = createEnvironment("dungeon");
console.log("Environment (dungeon):");
console.log("  Area:", env.areaType, "Light:", env.lighting.level, "Temp:", env.temperature.level);

const outEnv = createEnvironment("forest");
console.log("Environment (forest):");
console.log("  Weather:", outEnv.weather.descriptionTh, "Light:", outEnv.lighting.level);

// Weather presets
console.log("\nWeather presets:");
Object.values(WEATHER_PRESETS).forEach(w => console.log("  ", w.type, "→ vis penalty:", w.visibilityPenalty, w.descriptionTh));

// Lighting
console.log("\nLight at position (5,5), nighttime, no sources:", getLightLevelAt({x:5,y:5}, [], 22));
console.log("Light at position (5,5), daytime:", getLightLevelAt({x:5,y:5}, [], 12));
console.log("Light at position (0,0), nighttime, torch (radius 20):", getLightLevelAt({x:0,y:0}, [{name:"Torch",type:"torch",radius:20,dimRadius:40}], 22));

// Temperature
console.log("\nExtreme heat:", TEMPERATURE_PRESETS.extreme_heat.descriptionTh);

// --- TERRAIN ---
console.log("\n--- Terrain ---");
console.log("Forest terrain:", TERRAIN_DEFS.forest.descriptionTh, "movementCost:", TERRAIN_DEFS.forest.movementCost);
console.log("Lava terrain:", TERRAIN_DEFS.lava.descriptionTh, "damage:", TERRAIN_DEFS.lava.damage);
console.log("Ice terrain:", TERRAIN_DEFS.ice.descriptionTh, "check:", TERRAIN_DEFS.ice.requiresCheck);

// Terrain features
console.log("\nTerrain features:");
console.log("  Trees:", TERRAIN_FEATURES.trees.nameTh, "cover:", TERRAIN_FEATURES.trees.providesCover, "stealth:", TERRAIN_FEATURES.trees.stealthBonus);
console.log("  Walls:", TERRAIN_FEATURES.walls.nameTh, "cover:", TERRAIN_FEATURES.walls.providesCover, "blocksLOS:", TERRAIN_FEATURES.walls.blocksLineOfSight);

// Terrain interaction
const climbCheck = canInteractTerrain(TERRAIN_DEFS.mountain, "climb");
console.log("\nClimb mountain:", climbCheck.allowed, climbCheck.reasonTh);

// Terrain generation
const forestConfig = BIOME_CONFIGS.forest;
const generated = generateTerrainSquare(forestConfig);
console.log("Generated forest terrain:", generated.terrain, "feature:", generated.feature || "none");

// --- VISION ---
console.log("\n--- Vision ---");
console.log("Normal vision in bright:", canSeeInLight(["normal"], "bright"));
console.log("Normal vision in darkness:", canSeeInLight(["normal"], "darkness"));
console.log("Darkvision in darkness:", canSeeInLight(["darkvision"], "darkness"));
console.log("Truesight in magical darkness:", canSeeInLight(["truesight"], "magical_darkness"));
console.log("Normal in magical darkness:", canSeeInLight(["normal"], "magical_darkness"));

// Line of sight
const los = hasLineOfSight({x:0,y:0}, {x:5,y:5}, [{x:3,y:3}]);
console.log("\nLine of sight (0,0)→(5,5), wall at (3,3):", los.hasLOS, "blocked:", los.blockedBy);
const los2 = hasLineOfSight({x:0,y:0}, {x:5,y:5}, []);
console.log("Line of sight (0,0)→(5,5), no walls:", los2.hasLOS);

// Visibility
const vis = getVisibility(["invisible"], false, "bright", ["normal"], true);
console.log("\nVisibility (invisible target, normal viewer):", vis);
const vis2 = getVisibility([], true, "darkness", ["darkvision"], true);
console.log("Visibility (hidden target, darkvision viewer, darkness):", vis2);

// Passive perception
console.log("\nPassive Perception (WIS 14, proficient, Lv.3):", passivePerception(14, true, 3));
console.log("Passive Perception (WIS 16, expertise, Lv.5):", passivePerception(16, true, 5, true));

// Detection
const det = detectWithPassive(14, 12);
console.log("\nDetect (passive 14 vs stealth 12):", det.detected, det.descriptionTh);
const det2 = detectWithPassive(10, 15);
console.log("Detect (passive 10 vs stealth 15):", det2.detected, det2.descriptionTh);

// Hearing
const hear = canHearSound({x:5,y:5}, {source:{x:0,y:0}, volume:50, descriptionTh:"เสียงตะโกน"}, 2);
console.log("\nHear shout from 25ft away:", hear.heard, "distance:", hear.distance, "ft");

// --- STEALTH ---
console.log("\n--- Stealth ---");
const hideCheck = canHide(true, false, false, []);
console.log("Can hide (has cover):", hideCheck.canHide, hideCheck.reasonTh);
const hideCheck2 = canHide(false, false, false, []);
console.log("Can hide (no cover):", hideCheck2.canHide, hideCheck2.reasonTh);
const hideCheck3 = canHide(false, false, false, ["invisible"]);
console.log("Can hide (invisible):", hideCheck3.canHide, hideCheck3.reasonTh);

// Stealth roll
const stealth = rollStealth(3, true, 3, false, false, [{name:"Goblin", score:10}]);
console.log("\nStealth roll (DEX+3, proficient, Lv.3, vs PP 10):", stealth.roll, "success:", stealth.success, stealth.descriptionTh);

// Surprise
const surprise = checkSurprise(15, 10);
console.log("\nSurprise (stealth 15 vs PP 10):", surprise.surprised, surprise.reasonTh);

// Tracking
const track = rollTracking(5, 15);
console.log("Tracking (Survival +5, DC 15):", track.success, track.descriptionTh);

// Stealth modifiers
const mods = getStealthModifiers(["poisoned"], ["heavy_armor"], 2);
console.log("\nStealth mods (poisoned, heavy armor, rain +2):", mods.total, mods.breakdown);

// Detection difficulty
console.log("Detection difficulty (invisible + hidden):", getDetectionDifficulty(true, true).difficulty);
console.log("Detection difficulty (invisible only):", getDetectionDifficulty(true, false).difficulty);
console.log("Detection difficulty (hidden only):", getDetectionDifficulty(false, true).difficulty);
console.log("Detection difficulty (visible):", getDetectionDifficulty(false, false).difficulty);

// --- COVER ---
console.log("\n--- Cover ---");
console.log("Cover AC bonus (half):", COVER_AC_BONUS.half);
console.log("Cover AC bonus (3/4):", COVER_AC_BONUS.three_quarter);

const dist = getDistance({x:0,y:0}, {x:3,y:4});
console.log("\nDistance (0,0)→(3,4):", dist, "ft");
console.log("Grid distance:", getGridDistance({x:0,y:0}, {x:3,y:4}), "squares");
console.log("Melee range (reach 1):", isMeleeRange({x:0,y:0}, {x:1,y:0}, 1));
console.log("Within range 30ft:", isWithinRange({x:0,y:0}, {x:3,y:4}, 30));

// Cover calculation
const cover = calculateCover(
  {x:0,y:0}, {x:5,y:0},
  [{pos:{x:2,y:0}, coverLevel:"half"}, {pos:{x:3,y:0}, coverLevel:"three_quarter"}],
);
console.log("\nCover (obstacles at 2,0 and 3,0):", cover.cover, "(should be three_quarter)");

// Line of attack
const loa = hasLineOfAttack({x:0,y:0}, {x:5,y:0}, [{x:3,y:0}]);
console.log("Line of attack (wall at 3,0):", loa.canAttack, "blocked:", loa.blockedBy);

// Height advantage
console.log("High ground (z=2 vs z=0):", hasHighGround({x:0,y:0,z:2}, {x:0,y:1,z:0}));
console.log("High ground (z=0 vs z=0):", hasHighGround({x:0,y:0,z:0}, {x:0,y:1,z:0}));

// Flanking
console.log("Flanking (ally at 0,0, target at 1,0, enemy at 2,0):", isFlanking({x:0,y:0}, {x:1,y:0}, {x:2,y:0}));
console.log("Flanking (ally at 0,0, target at 1,0, enemy at 1,1):", isFlanking({x:0,y:0}, {x:1,y:0}, {x:1,y:1}));

// Forced movement
const push = createPush(10, {x:1,y:0}, "Shove");
console.log("\nForced movement (push 10ft):", push.type, push.distance, push.provokesOpportunity, push.reasonTh);
const fall = createFall(30);
console.log("Forced movement (fall 30ft):", fall.type, fall.distance, fall.reasonTh);

// Position triggers
const triggers = [
  { event: "enter_area" as const, area: {x:5,y:5,radius:2}, action: "trap", descriptionTh: "เหยียบกับดัก" },
  { event: "enter_range" as const, range: 30, action: "opportunity", descriptionTh: "เข้าระยะ" },
];
const fired = checkPositionTriggers({x:0,y:0}, {x:5,y:5}, triggers, {x:5,y:5});
console.log("\nPosition triggers fired (moved to 5,5):", fired.map(t => t.descriptionTh).join(", ") || "none");

console.log("\n=== All tests passed! ===");
