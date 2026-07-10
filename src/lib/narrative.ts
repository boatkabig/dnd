/**
 * Domain 33: Narrative Engine
 *
 * เนื้อเรื่อง — Story Arc, Scene, Branch, Consequence
 *
 * Sub-systems:
 *  33.1 Story Arc — overall campaign narrative structure
 *  33.2 Scene Management — current scene state, transitions
 *  33.3 Branching Narrative — choices that change the story
 *  33.4 Consequence Tracking — long-term effects of choices
 *  33.5 Pacing Engine — control tension/release rhythm
 *  33.6 Foreshadowing — plant seeds for future payoffs
 *  33.7 Theme Tracking — maintain story themes
 *  33.8 Narration Generator — build narration from scene state
 *
 * Whereas Domain 26 (World) tracks *state* (quests, factions, lore),
 * Domain 33 tracks *narrative flow* — how the story unfolds beat by beat.
 */

/* ======================================================================
 * 33.1 STORY ARC
 * ====================================================================== */

export type ArcPhase = "setup" | "inciting_incident" | "rising_action" | "midpoint" | "complication" | "climax" | "falling_action" | "resolution" | "epilogue";

export interface StoryArc {
  id: string;
  title: string;
  description: string;
  currentPhase: ArcPhase;
  phasesVisited: ArcPhase[];
  startedAt: number;
  estimatedLength: number; // expected scenes
  scenesCompleted: number;
  themes: string[]; // e.g. ["redemption", "sacrifice"]
  protagonistArc?: string; // character growth summary
}

export function createStoryArc(spec: { id: string; title: string; description: string; themes?: string[]; estimatedLength?: number; startedAt?: number }): StoryArc {
  return {
    id: spec.id,
    title: spec.title,
    description: spec.description,
    currentPhase: "setup",
    phasesVisited: ["setup"],
    startedAt: spec.startedAt ?? Date.now(),
    estimatedLength: spec.estimatedLength ?? 20,
    scenesCompleted: 0,
    themes: spec.themes ?? [],
  };
}

export function advanceArc(arc: StoryArc, newPhase?: ArcPhase): StoryArc {
  const phaseOrder: ArcPhase[] = ["setup", "inciting_incident", "rising_action", "midpoint", "complication", "climax", "falling_action", "resolution", "epilogue"];
  const next = newPhase || phaseOrder[Math.min(phaseOrder.length - 1, phaseOrder.indexOf(arc.currentPhase) + 1)];
  return {
    ...arc,
    currentPhase: next,
    phasesVisited: arc.phasesVisited.includes(next) ? arc.phasesVisited : [...arc.phasesVisited, next],
    scenesCompleted: arc.scenesCompleted + 1,
  };
}

/* ======================================================================
 * 33.2 SCENE MANAGEMENT
 * ====================================================================== */

export type SceneType = "exploration" | "combat" | "social" | "puzzle" | "transition" | "cutscene" | "rest" | "revelation";

export type SceneTension = "calm" | "low" | "medium" | "high" | "climax";

export interface Scene {
  id: string;
  arcId: string;
  type: SceneType;
  title: string;
  description: string;
  locationId: string;
  tension: SceneTension;
  playerChoices: SceneChoice[];
  npcsPresent: string[];
  objectives: string[];
  completedObjectives: string[];
  startedAt: number;
  endedAt?: number;
  outcome?: "success" | "partial" | "failure" | "skipped";
  branchTaken?: string;
}

export interface SceneChoice {
  id: string;
  label: string;
  description: string;
  requiresCheck?: { skill: string; dc: number };
  requiresItem?: string;
  requiresFlag?: string;
  consequences: string[]; // narrative description
  branchId?: string;
  nextSceneId?: string;
  tensionShift?: number; // -2 to +2
}

export function createScene(spec: { id: string; arcId: string; type: SceneType; title: string; description: string; locationId: string; tension?: SceneTension; npcsPresent?: string[]; objectives?: string[]; startedAt?: number }): Scene {
  return {
    id: spec.id,
    arcId: spec.arcId,
    type: spec.type,
    title: spec.title,
    description: spec.description,
    locationId: spec.locationId,
    tension: spec.tension ?? "low",
    playerChoices: [],
    npcsPresent: spec.npcsPresent ?? [],
    objectives: spec.objectives ?? [],
    completedObjectives: [],
    startedAt: spec.startedAt ?? Date.now(),
  };
}

export function completeObjective(scene: Scene, objectiveId: string): Scene {
  if (scene.completedObjectives.includes(objectiveId)) return scene;
  return { ...scene, completedObjectives: [...scene.completedObjectives, objectiveId] };
}

export function isSceneComplete(scene: Scene): boolean {
  return scene.objectives.every((o) => scene.completedObjectives.includes(o));
}

export function endScene(scene: Scene, outcome: Scene["outcome"], branchTaken?: string, endedAt: number = Date.now()): Scene {
  return {
    ...scene,
    endedAt,
    outcome,
    branchTaken,
  };
}

/* ======================================================================
 * 33.3 BRANCHING NARRATIVE
 * ====================================================================== */

export interface NarrativeBranch {
  id: string;
  arcId: string;
  label: string;
  description: string;
  parentBranchId?: string;
  choiceId?: string; // which SceneChoice triggers this branch
  mutuallyExclusiveWith?: string[];
  locksBranches?: string[];
  requiresFlags?: string[];
  setsFlags?: string[];
  scenes: string[]; // scene IDs in this branch
}

export interface BranchTracker {
  branches: Record<string, NarrativeBranch>;
  activeBranches: Set<string>;
  completedBranches: Set<string>;
  flags: Record<string, boolean>;
}

export function createBranchTracker(): BranchTracker {
  return {
    branches: {},
    activeBranches: new Set(),
    completedBranches: new Set(),
    flags: {},
  };
}

export function registerBranch(tracker: BranchTracker, branch: NarrativeBranch): BranchTracker {
  // Check mutual exclusion
  if (branch.mutuallyExclusiveWith?.some((id) => tracker.activeBranches.has(id))) {
    return tracker; // cannot activate
  }
  const activeArray = Array.from(tracker.activeBranches);
  return {
    ...tracker,
    branches: { ...tracker.branches, [branch.id]: branch },
    activeBranches: new Set([...activeArray, branch.id]),
    flags: branch.setsFlags ? branch.setsFlags.reduce((f, flag) => ({ ...f, [flag]: true }), tracker.flags) : tracker.flags,
  };
}

export function completeBranch(tracker: BranchTracker, branchId: string): BranchTracker {
  const branch = tracker.branches[branchId];
  if (!branch) return tracker;
  const active = new Set(tracker.activeBranches);
  active.delete(branchId);
  const completed = new Set(tracker.completedBranches);
  completed.add(branchId);
  return {
    ...tracker,
    activeBranches: active,
    completedBranches: completed,
    // Lock any branches this one locks
    branches: branch.locksBranches
      ? Object.fromEntries(
          Object.entries(tracker.branches).map(([id, b]) =>
            branch.locksBranches!.includes(id) ? [id, { ...b, locked: true } as NarrativeBranch] : [id, b]
          )
        )
      : tracker.branches,
  };
}

/* ======================================================================
 * 33.4 CONSEQUENCE TRACKING
 * ====================================================================== */

export interface Consequence {
  id: string;
  description: string;
  triggeredBy: string; // choice/branch/action id
  triggeredAt: number;
  immediateEffects: string[];
  delayedEffects: Array<{ description: string; delaySeconds: number; appliesAt: number }>;
  applied: boolean;
}

export interface ConsequenceTracker {
  consequences: Consequence[];
  pendingDelayed: Consequence[]; // not yet applied
}

export function createConsequenceTracker(): ConsequenceTracker {
  return { consequences: [], pendingDelayed: [] };
}

export function registerConsequence(tracker: ConsequenceTracker, c: Consequence): ConsequenceTracker {
  return {
    ...tracker,
    consequences: [...tracker.consequences, c],
    pendingDelayed: c.delayedEffects.length > 0 ? [...tracker.pendingDelayed, c] : tracker.pendingDelayed,
  };
}

export function checkPendingConsequences(tracker: ConsequenceTracker, worldSeconds: number): { tracker: ConsequenceTracker; fired: Consequence[] } {
  const fired: Consequence[] = [];
  const remaining: Consequence[] = [];
  for (const c of tracker.pendingDelayed) {
    const allApply = c.delayedEffects.every((e) => worldSeconds >= e.appliesAt);
    if (allApply) {
      fired.push({ ...c, applied: true });
    } else {
      remaining.push(c);
    }
  }
  return {
    tracker: {
      ...tracker,
      pendingDelayed: remaining,
      consequences: tracker.consequences.map((c) => fired.find((f) => f.id === c.id) || c),
    },
    fired,
  };
}

/* ======================================================================
 * 33.5 PACING ENGINE
 * ====================================================================== */

export interface PacingState {
  currentTension: SceneTension;
  recentTensions: SceneTension[]; // last N scenes
  recommendedNextTension: SceneTension;
  scenesSinceRest: number;
  scenesSinceCombat: number;
  scenesSinceRevelation: number;
  pacingNotes: string[];
}

export function createPacingState(): PacingState {
  return {
    currentTension: "calm",
    recentTensions: [],
    recommendedNextTension: "low",
    scenesSinceRest: 0,
    scenesSinceCombat: 0,
    scenesSinceRevelation: 0,
    pacingNotes: [],
  };
}

export function updatePacingAfterScene(state: PacingState, scene: Scene): PacingState {
  const newTensions = [...state.recentTensions, scene.tension].slice(-5);
  // Compute recommended next tension based on rhythm
  let recommended: SceneTension = "low";
  const notes: string[] = [];
  if (state.scenesSinceRest >= 4) {
    recommended = "calm";
    notes.push("ผู้เล่นน่าจะต้องพักแล้ว");
  } else if (state.scenesSinceCombat >= 3 && scene.tension !== "climax") {
    recommended = "medium";
    notes.push("น่าจะถึงเวลามีการต่อสู้");
  } else if (state.scenesSinceRevelation >= 5) {
    recommended = "high";
    notes.push("ถึงเวลาเผยความลับหรือปมใหม่");
  } else if (scene.tension === "climax") {
    recommended = "low";
    notes.push("หลัง climax ควรมี scene สงบให้พักใจ");
  } else if (scene.tension === "calm") {
    recommended = "low";
    notes.push("หลัง scene สงบ ค่อยๆ เพิ่ม tension");
  }
  return {
    currentTension: scene.tension,
    recentTensions: newTensions,
    recommendedNextTension: recommended,
    scenesSinceRest: scene.type === "rest" ? 0 : state.scenesSinceRest + 1,
    scenesSinceCombat: scene.type === "combat" ? 0 : state.scenesSinceCombat + 1,
    scenesSinceRevelation: scene.type === "revelation" ? 0 : state.scenesSinceRevelation + 1,
    pacingNotes: notes,
  };
}

/* ======================================================================
 * 33.6 FORESHADOWING
 * ====================================================================== */

export interface Foreshadow {
  id: string;
  description: string;
  plantedAtSceneId: string;
  plantedAtSeconds: number;
  payoffSceneId?: string;
  payoffAtSeconds?: number;
  requiredArcPhase?: ArcPhase;
  status: "planted" | "hinted" | "payoff" | "abandoned";
}

export interface ForeshadowTracker {
  items: Record<string, Foreshadow>;
}

export function createForeshadowTracker(): ForeshadowTracker {
  return { items: {} };
}

export function plantForeshadow(tracker: ForeshadowTracker, spec: { id: string; description: string; plantedAtSceneId: string; plantedAtSeconds: number; requiredArcPhase?: ArcPhase }): ForeshadowTracker {
  return {
    items: {
      ...tracker.items,
      [spec.id]: {
        id: spec.id,
        description: spec.description,
        plantedAtSceneId: spec.plantedAtSceneId,
        plantedAtSeconds: spec.plantedAtSeconds,
        requiredArcPhase: spec.requiredArcPhase,
        status: "planted",
      },
    },
  };
}

export function hintForeshadow(tracker: ForeshadowTracker, id: string): ForeshadowTracker {
  const item = tracker.items[id];
  if (!item) return tracker;
  return { items: { ...tracker.items, [id]: { ...item, status: "hinted" } } };
}

export function payoffForeshadow(tracker: ForeshadowTracker, id: string, payoffSceneId: string, payoffAtSeconds: number): ForeshadowTracker {
  const item = tracker.items[id];
  if (!item) return tracker;
  return {
    items: {
      ...tracker.items,
      [id]: { ...item, status: "payoff", payoffSceneId, payoffAtSeconds },
    },
  };
}

export function getReadyForeshadows(tracker: ForeshadowTracker, currentPhase: ArcPhase): Foreshadow[] {
  const phaseOrder: ArcPhase[] = ["setup", "inciting_incident", "rising_action", "midpoint", "complication", "climax", "falling_action", "resolution", "epilogue"];
  const currentIdx = phaseOrder.indexOf(currentPhase);
  return Object.values(tracker.items).filter((f) => {
    if (f.status !== "planted" && f.status !== "hinted") return false;
    if (!f.requiredArcPhase) return true; // no constraint
    return currentIdx >= phaseOrder.indexOf(f.requiredArcPhase);
  });
}

/* ======================================================================
 * 33.7 THEME TRACKING
 * ====================================================================== */

export interface ThemeState {
  themes: Record<string, { occurrences: number; lastSceneId?: string; intensity: number }>;
}

export function createThemeState(initialThemes: string[] = []): ThemeState {
  const themes: ThemeState["themes"] = {};
  for (const t of initialThemes) themes[t] = { occurrences: 0, intensity: 0.5 };
  return { themes };
}

export function observeTheme(state: ThemeState, theme: string, sceneId: string, intensityBoost = 0.1): ThemeState {
  const existing = state.themes[theme] || { occurrences: 0, intensity: 0.5 };
  return {
    themes: {
      ...state.themes,
      [theme]: {
        occurrences: existing.occurrences + 1,
        lastSceneId: sceneId,
        intensity: Math.min(1, existing.intensity + intensityBoost),
      },
    },
  };
}

export function getDominantThemes(state: ThemeState, topN = 3): string[] {
  return Object.entries(state.themes)
    .sort((a, b) => b[1].intensity - a[1].intensity)
    .slice(0, topN)
    .map(([t]) => t);
}

/* ======================================================================
 * 33.8 NARRATION GENERATOR
 * ====================================================================== */

export interface NarrationDirective {
  sceneTitle: string;
  openingLine: string;
  tone: string;
  suggestedLength: string; // "1-2 ประโยค" etc.
  includeSensoryDetails: string[];
  callToAction: string;
  revealForeshadow?: string;
  recommendedTension: SceneTension;
  pacingNotes: string[];
}

export function generateNarrationDirective(
  scene: Scene,
  arc: StoryArc,
  pacing: PacingState,
  readyForeshadows: Foreshadow[] = [],
  dominantThemes: string[] = [],
): NarrationDirective {
  const toneMap: Record<SceneTension, string> = {
    calm: "สงบ ผ่อนคลาย",
    low: "บรรยายเรื่อยเปื่อย",
    medium: "ตึงเครียดเล็กน้อย",
    high: "เร่งเดิน ตื่นเต้น",
    climax: "รุนแรง เร่งรัด",
  };
  const lengthMap: Record<SceneTension, string> = {
    calm: "3-5 ประโยค (พักผ่อน)",
    low: "2-4 ประโยค",
    medium: "2-3 ประโยค",
    high: "1-2 ประโยค ตัดให้เร็ว",
    climax: "1-2 ประโยค เร่งรัด",
  };
  const sensoryByType: Record<SceneType, string[]> = {
    exploration: ["เสียง", "กลิ่น", "แสง"],
    combat: ["เสียงอาวุธ", "กลิ่นเลือด", "ความร้อน"],
    social: ["สีหน้า NPC", "น้ำเสียง", "ท่าทาง"],
    puzzle: ["รายละเอียดของวัตถุ", "สัญลักษณ์", "รอยรั่ว"],
    transition: ["ทิวทัศน์", "เสียงธรรมชาติ"],
    cutscene: ["วิชวล", "เสียงเพลง"],
    rest: ["ความสงบ", "กลิ่นอาหาร"],
    revelation: ["แสงวาบ", "เสียงสั่น"],
  };
  const foreshadow = readyForeshadows[0]; // plant/pay off first ready one
  return {
    sceneTitle: scene.title,
    openingLine: `บรรยายฉาก ${scene.type} ที่ ${scene.locationId} (tension: ${scene.tension})`,
    tone: toneMap[scene.tension] + (dominantThemes.length > 0 ? ` · ธีม: ${dominantThemes.join(", ")}` : ""),
    suggestedLength: lengthMap[scene.tension],
    includeSensoryDetails: sensoryByType[scene.type] || [],
    callToAction: scene.playerChoices.length > 0
      ? `นำเสนอตัวเลือก ${scene.playerChoices.length} อย่าง`
      : "จบด้วยสถานการณ์ที่ชวนตัดสินใจ",
    revealForeshadow: foreshadow?.description,
    recommendedTension: pacing.recommendedNextTension,
    pacingNotes: pacing.pacingNotes,
  };
}

/* ======================================================================
 * NARRATIVE ENGINE (combines all sub-systems)
 * ====================================================================== */

export interface NarrativeEngine {
  arc: StoryArc;
  currentScene: Scene | null;
  sceneHistory: Scene[];
  branches: BranchTracker;
  consequences: ConsequenceTracker;
  pacing: PacingState;
  foreshadows: ForeshadowTracker;
  themes: ThemeState;
}

export function createNarrativeEngine(arc: StoryArc): NarrativeEngine {
  return {
    arc,
    currentScene: null,
    sceneHistory: [],
    branches: createBranchTracker(),
    consequences: createConsequenceTracker(),
    pacing: createPacingState(),
    foreshadows: createForeshadowTracker(),
    themes: createThemeState(arc.themes),
  };
}

export function enterScene(engine: NarrativeEngine, scene: Scene): NarrativeEngine {
  return { ...engine, currentScene: scene };
}

export function completeScene(engine: NarrativeEngine, outcome: Scene["outcome"], branchTaken?: string): NarrativeEngine {
  if (!engine.currentScene) return engine;
  const ended = endScene(engine.currentScene, outcome, branchTaken);
  const newPacing = updatePacingAfterScene(engine.pacing, ended);
  return {
    ...engine,
    currentScene: null,
    sceneHistory: [...engine.sceneHistory, ended],
    pacing: newPacing,
    arc: advanceArc(engine.arc),
  };
}
