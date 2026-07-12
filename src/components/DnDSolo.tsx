"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ABIL_TH, mod, profByLevel, SKILLS, CONDITIONS_TH,
  DISADV_CONDS, CHECK_DISADV_CONDS, INCAPACITATING_CONDS,
  BACKGROUNDS, RACES, CLASSES, FEATURES,
  CONSUMABLES, BESTIARY, monSave, SLOT_TABLE, HALF_CASTER_SLOTS,
  wornHas,
  applyDamageModifiers, passivePerception, rateEncounterDifficulty,
  gameTimeToString, getLightLevelForHour, grappleCheck,
  ALIGNMENTS, LANGUAGES, ORIGIN_FEATS, WEAPON_MASTERIES,
  type Quest,
} from "@/lib/gameData";
import {
  fetchSpell, srdProbe, type NormalizedSpell,
} from "@/lib/srd";
import {
  computeAC, spellAtkMod, spellDC, getSlotTable, maxSpellLevel, getClassSpellIndices, refreshesOnShortRest,
} from "@/lib/spells";
import {
  saveGame as engineSaveGame, loadGame as engineLoadGame, deleteSave as engineDeleteSave,
  initWorldClockFromLegacy, worldClockToLegacy, getWorldClock, advanceHours as engineAdvanceHours,
  fetchMonsterForCombat, type LegacySave,
  emitAttack, emitHit, emitDamageDealt, emitDamageTaken, emitHeal, emitKill, emitDeath,
  emitTurnStart, emitTurnEnd, emitCastSpell,
  queryFeatureTriggers, getTriggeredFeatures,
} from "@/lib/engineAdapters";
// AI DM Layer (Domain 31-35)
import {
  analyzeIntent, createDialogueSession, processPlayerInput,
  type DialogueSession,
} from "@/lib/dialogue";
import {
  calculateDifficulty, getDifficultyThresholds, suggestedCR,
  crToXP, type DifficultyLevel,
} from "@/lib/encounter";
import {
  createStoryArc, createScene, enterScene, completeScene, updatePacingAfterScene,
  type NarrativeEngine, type Scene, type SceneType,
} from "@/lib/narrative";
import {
  generateFullPlan, selectBestAction, generateDecisionOptions, predictOutcome,
  assessRisk, type PlanningContext, type Goal, type SelectedAction,
} from "@/lib/planning";
import {
  createContentRegistry,
  type ContentRegistry, type ContentType,
} from "@/lib/content";
// Domain 36: Dungeon Blueprint System
import {
  createDungeonRunState, moveToRoom, markRoomCleared, markBossDefeated,
  discoverSecretRoom, discoverSecretConnection, getVisibleDungeonInfo,
  validateDungeonBlueprint, summarizeDungeonProgress,
  getRoomRoleLabel, getRoomRoleIcon, getConnectionTypeLabel,
  isObjectiveInThisDungeon,
  type DungeonBlueprint, type DungeonRunState, type Room, type RoomConnection,
  type RoomRole, type ConnectionType,
} from "@/lib/dungeon";
import {
  generateProceduralDungeon, type ProceduralDungeonParams,
} from "@/lib/dungeonTables";
// Phase 1: DM response schema validation
import { deferConsequenceUpdates, HP_DELTA_CAP } from "@/lib/dmSchema";
import { buildSystemPrompt } from "@/lib/dmPrompt";
import { callDM } from "@/lib/dmClient";
import {
  rollFormula, rollD20, migrateChar, getMelee, getRanged, hasFeature,
  skillMod, saveMod, attackMod, hasDisadv, hasCheckDisadv, isIncapacitated,
  attackerHasAdvVs, spellLegalityMessageTh,
  coverForTarget, sneakDice, critThreshold,
} from "@/lib/characterStats";
import { emptyMap, applyMapUpdate, applyWorldMap } from "@/lib/mapState";
import { hitEnemy, gridDistance, isAdjacent } from "@/lib/combatMath";
import { tickBuffs, applyBuffToCharacter } from "@/lib/buffs";
import { gainXP, applyFeatGrantsToChar } from "@/lib/leveling";
import { runSidekickAssist, resolveDeathSave, checkCombatEnd, runEnemyPhase, applyPendingChanges } from "@/lib/combatResolve";
import SessionZeroModal from "@/components/game/SessionZeroModal";
import OracleModal from "@/components/game/OracleModal";
import QuestJournalModal from "@/components/game/QuestJournalModal";
import AsiModal from "@/components/game/AsiModal";
import SubclassModal from "@/components/game/SubclassModal";
import ReprepareModal from "@/components/game/ReprepareModal";
import CompanionModal from "@/components/game/CompanionModal";
import ShopModal from "@/components/game/ShopModal";
import AiDmHelperModal from "@/components/game/AiDmHelperModal";
import MapModal from "@/components/game/MapModal";
import CombatOverlay from "@/components/game/CombatOverlay";
import { castSRDSpell } from "@/lib/castSpell";
import { resolveWeaponAttack } from "@/lib/weaponAttack";
import ContentManagerModal from "@/components/game/ContentManagerModal";
// Phase 2: Extended class features Lv.1-20
import { getExtendedFeatures, hasASIAtLevel } from "@/lib/featuresExtended";
// Phase 4: progression engine — subclass features + feat effects
import {
  hasClassFeature, featAttackBonus, featDamageBonus,
  needsSubclassChoice, getSubclassById,
  powerAttackModifiers,
} from "@/lib/engine/progression";
import { getSpellcastingRule, canReprepareOnLongRest, reprepareSpells } from "@/lib/magic";
import { computeLongRestRecovery, computeShortRestHeal, restoreSlotsToMax } from "@/lib/engine/rest";
import {
  SIDEKICK_BASES, type SidekickClass,
} from "@/lib/engine/sidekick";
// 1c: hand-rolled game store — APPLY_DM_UPDATES is the atomic DM-update vector
import { createStore, createInitialState, createPlayerState } from "@/lib/store";
import CharacterCreation from "@/components/game/CharacterCreation";
import AdventureLog from "@/components/game/AdventureLog";
import CharacterSheet from "@/components/game/CharacterSheet";
import DungeonView from "@/components/game/DungeonView";
import DMChat from "@/components/game/DMChat";
// 1c-b: bridge-backed combat slice — enemy target picker + the engine attack seam
import { resolveBridgeAttack, toDamageType } from "@/lib/bridgeAttack";
import { buildBridgeState, planMultiattackSequence, getCombatView, moveBy, setMovement } from "@/lib/engine/combatBridge";
import { resolveContestedAction } from "@/lib/engine/combat";
import { checkConcentration, concentrationCheckDC, isConcentrationSpellName, toSpellDisplayName } from "@/lib/engine/effects";
// Phase 3: spell-legality (2024) + vision/LOS wiring — engine-owned rules
import { canCast2024, type SpellLegalityReason } from "@/lib/engine/magic";
import { coverBetween, attackVisibilityModifier, type Obstacle } from "@/lib/engine/vision";
import {
  askOracle, rollRandomEvent,
  type Likelihood, type OracleResult, type RandomEvent,
} from "@/lib/engine/oracle";
import {
  createCampaignMemory, normalizeCampaignMemory, appendFact, startNewSession,
  summarizeMemory, type CampaignMemory, type FactKind,
} from "@/lib/engine/campaignMemory";
import {
  createDefaultSessionZero, normalizeSessionZero, summarizeSessionZero,
  hasStartingSituation, isDefaultSessionZero, type SessionZeroConfig,
} from "@/lib/engine/sessionZero";
import { resolveExplorationTurn } from "@/lib/engine/exploration";
import { bargainOutcome } from "@/lib/engine/economy";
// Shared with game/* components (CharacterCreation, CharacterSheet, AdventureLog) —
// lives in lib/ to avoid a circular import back into this file.
import { d, makeCharacter, SRD_OK, setSrdOk } from "@/lib/dndSoloShared";

/* ============================================================
   D&D 5e SOLO — Full SRD Edition
   - Engine (code): dice, HP/AC, spell slots, all 15 conditions,
     combat (initiative, surprise, sneak attack, multi-attack,
     Action Surge, Spiritual Weapon/Guardians, concentration, death saves),
     XP/leveling (Lv.1-20), magic items, fog-of-war map.
   - DM (AI via /api/dm): narrates / plays NPC only.
   - Spells: fetched dynamically from Open5e v2 (2024 SRD 5.2 + 2014 SRD 5.1) via /api/open5e —
     the engine can execute ANY of the 1,955 SRD spells generically.
   - Monsters: 30+ in-engine bestiary + ALL 3,541+ SRD creatures.
   - Classes: all 12 SRD classes.
   - Races: all 9+ SRD species.
   ============================================================ */

/* ---------------- STORAGE (delegates to engineAdapters for v3 + versioning) ---------------- */
async function saveGame(payload: any) {
  engineSaveGame(payload);
}
async function loadGame(): Promise<LegacySave | null> {
  return engineLoadGame();
}
async function deleteSave() {
  engineDeleteSave();
}

/* ---------------- UI SUBCOMPONENTS ---------------- */
// F4: Memoized HPBar — prevents unnecessary re-renders when HP doesn't change
const HPBar = React.memo(function HPBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const color = pct > 50 ? "#7FA85C" : pct > 25 ? "#E0A83E" : "#C74B44";
  return (
    <div className="hpbar">
      <div className="hpbar-fill" style={{ width: pct + "%", background: color }} />
      <span className="hpbar-label">{hp} / {maxHp} HP</span>
    </div>
  );
});

/* ---------------- MAIN APP ---------------- */
export default function DnDSolo() {
  const [phase, setPhase] = useState<"loading" | "menu" | "create" | "play" | "dead">("loading");
  const [onboardStep, setOnboardStep] = useState<number>(-1); // -1 = not showing, 0-3 = steps
  const [hasSave, setHasSave] = useState(false);
  const [c, setC] = useState<any>(null);
  const [scene, setScene] = useState("");
  const [log, setLog] = useState<any[]>([]);
  const [combat, setCombat] = useState<any>(null);
  const [map, setMap] = useState<any>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [combatMenu, setCombatMenu] = useState<"" | "spell" | "item">("");
  // Task #14: GWM/Sharpshooter −5/+10 power-attack toggle (engine-gated per attack)
  const [powerAttackOn, setPowerAttackOn] = useState(false);
  // Task #14: prepared-caster long-rest re-prepare modal
  const [reprepareOpen, setReprepareOpen] = useState(false);
  const [reprepareSel, setReprepareSel] = useState<string[]>([]);
  // Task #14: companion recruit picker (out of combat)
  const [recruitOpen, setRecruitOpen] = useState(false);
  // 1c-b: which enemy the player has selected to attack (null → first alive fallback)
  const [combatTargetId, setCombatTargetId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"stats" | "skills" | "items" | "spells">("stats");
  const [asiPicks, setAsiPicks] = useState<string[]>([]);
  // Quest journal & game time state
  const [quests, setQuests] = useState<Quest[]>([]);
  const [gameTime, setGameTime] = useState({ day: 1, hour: 8 });
  const [questJournalOpen, setQuestJournalOpen] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  // AI DM Layer state (Domain 31-35)
  const [dialogueSession, setDialogueSession] = useState<DialogueSession | null>(null);
  const [narrativeEngine, setNarrativeEngine] = useState<NarrativeEngine | null>(null);
  const [dmHelperOpen, setDmHelperOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  // Phase 5 — Solo oracle (GM emulator: resolve yes/no uncertainty without the LLM DM)
  const [oracleOpen, setOracleOpen] = useState(false);
  const [oracleLikelihood, setOracleLikelihood] = useState<Likelihood>("50-50");
  const [oracleQuestion, setOracleQuestion] = useState("");
  const [oracleLog, setOracleLog] = useState<Array<{ q: string; res: OracleResult; event: RandomEvent | null }>>([]);
  // Phase 5 — Campaign memory (persisted continuity store fed to the AI DM)
  const [campaignMemory, setCampaignMemory] = useState<CampaignMemory>(() => createCampaignMemory());
  const campaignMemoryRef = useRef<CampaignMemory>(campaignMemory);
  // Task #16 — Session Zero (persisted campaign charter fed to the AI DM). Optional
  // + non-blocking: defaults to a sensible config so skipping it changes nothing.
  const [sessionZeroConfig, setSessionZeroConfig] = useState<SessionZeroConfig>(() => createDefaultSessionZero());
  const sessionZeroRef = useRef<SessionZeroConfig>(sessionZeroConfig);
  const [sessionZeroOpen, setSessionZeroOpen] = useState(false);
  const [szLineInput, setSzLineInput] = useState("");
  const [szVeilInput, setSzVeilInput] = useState("");
  // Domain 35: Content Management state
  const [contentRegistry, setContentRegistry] = useState<ContentRegistry>(() => createContentRegistry());
  const [contentManagerOpen, setContentManagerOpen] = useState(false);
  const [contentImportText, setContentImportText] = useState("");
  const [contentImportMsg, setContentImportMsg] = useState("");
  const [contentExportText, setContentExportText] = useState("");
  const [contentFilterType, setContentFilterType] = useState<ContentType | "all">("all");
  // Shop state (D&D 5e economy)
  const [shopOpen, setShopOpen] = useState(false);
  const [shopTab, setShopTab] = useState<"weapons" | "armor" | "magic" | "consumables" | "sell">("weapons");
  const [shopSearch, setShopSearch] = useState("");
  // Negotiated price from a bargain roll (keyed by item key), applied on the next Buy.
  const [bargainedPrices, setBargainedPrices] = useState<Record<string, number>>({});
  const [ioText, setIoText] = useState("");
  const [ioMsg, setIoMsg] = useState("");
  // Spellbook browser state
  const [spellBrowserOpen, setSpellBrowserOpen] = useState(false);
  const [spellBrowserLoading, setSpellBrowserLoading] = useState(false);
  const [availableSpells, setAvailableSpells] = useState<{ index: string; name: string; level: number }[]>([]);
  const [spellDetail, setSpellDetail] = useState<NormalizedSpell | null>(null);
  const [spellDetailLoading, setSpellDetailLoading] = useState(false);
  // Domain 36: Dungeon Blueprint state
  const [dungeonBlueprint, setDungeonBlueprint] = useState<DungeonBlueprint | null>(null);
  const [dungeonRun, setDungeonRun] = useState<DungeonRunState | null>(null);
  const [dungeonMapOpen, setDungeonMapOpen] = useState(false);
  // Pending room staged encounter (when DM triggers a blueprint room)
  const [pendingRoomEncounter, setPendingRoomEncounter] = useState<{ monsterIds: string[]; surprise: boolean; isBoss: boolean } | null>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const logNearBottomRef = useRef(true);
  const idRef = useRef(0);
  const mapRef = useRef<any>(null);
  const cRef = useRef<any>(null);
  const combatRef = useRef<any>(null);
  const logDataRef = useRef<any[]>([]);
  const dungeonBlueprintRef = useRef<DungeonBlueprint | null>(null);
  const dungeonRunRef = useRef<DungeonRunState | null>(null);
  const nextId = () => ++idRef.current;

  useEffect(() => { mapRef.current = map; }, [map]);
  useEffect(() => { cRef.current = c; }, [c]);
  useEffect(() => { combatRef.current = combat; }, [combat]);
  // 1c-b: drop a stale target selection when combat ends or the chosen enemy is
  // gone/dead (a fresh encounter reuses different uids); attacks then fall back
  // to the first living enemy until the player picks a new target.
  useEffect(() => {
    if (!combat) { if (combatTargetId !== null) setCombatTargetId(null); return; }
    if (combatTargetId && !combat.enemies?.some((e: any) => e.uid === combatTargetId && e.hpNow > 0)) {
      setCombatTargetId(null);
    }
  }, [combat, combatTargetId]);
  useEffect(() => { logDataRef.current = log; }, [log]);
  useEffect(() => { dungeonBlueprintRef.current = dungeonBlueprint; }, [dungeonBlueprint]);
  useEffect(() => { dungeonRunRef.current = dungeonRun; }, [dungeonRun]);
  useEffect(() => { campaignMemoryRef.current = campaignMemory; }, [campaignMemory]);
  useEffect(() => { sessionZeroRef.current = sessionZeroConfig; }, [sessionZeroConfig]);

  // Every DM call must carry campaign memory + the Session-Zero charter so
  // recorded facts/tone stay consistent even when chat history is truncated.
  // Centralized here so no buildSystemPrompt call site can forget them.
  function buildPrompt(c: any, pacing?: any) {
    return buildSystemPrompt(c, pacing, summarizeMemory(campaignMemoryRef.current), summarizeSessionZero(sessionZeroRef.current));
  }

  const [srdStatus, setSrdStatus] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    (async () => {
      const save = await loadGame();
      if (save) {
        // Sync WorldClock with loaded save's gameTime
        if (save.gameTime) {
          initWorldClockFromLegacy(save.gameTime);
          setGameTime(save.gameTime);
        }
      }
      setHasSave(!!save);
      setPhase("menu");
    })();
    srdProbe().then((ok) => { setSrdOk(ok); setSrdStatus(ok ? "online" : "offline"); });
  }, []);

  useEffect(() => {
    // Mobile UX fix: only auto-scroll if the user is already near the bottom.
    // If they've scrolled up to re-read history, don't yank them back down.
    if (logRef.current && logNearBottomRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log, thinking]);

  function handleLogScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    logNearBottomRef.current = distanceFromBottom <= 80;
  }

  const persist = useCallback((cc: any, sc: string, lg: any[], cb: any, hist: any[]) => {
    saveGame({
      c: cc, scene: sc, log: lg.slice(-80), combat: cb, history: hist.slice(-24),
      map: mapRef.current, gameTime: worldClockToLegacy(getWorldClock()), quests,
      dungeonBlueprint: dungeonBlueprintRef.current,
      dungeonRun: dungeonRunRef.current,
      campaignMemory: campaignMemoryRef.current,
      sessionZeroConfig: sessionZeroRef.current,
    });
  }, [quests]);

  // Phase 5: record a continuity fact into campaign memory (keeps ref + state in sync).
  // `at` is stamped here (UI layer) so the engine reducer stays pure/deterministic.
  const rememberFact = useCallback((kind: FactKind, id: string, name: string, detail?: string) => {
    if (!id || !name) return;
    const next = appendFact(campaignMemoryRef.current, { kind, id, name, detail, at: Date.now() });
    campaignMemoryRef.current = next;
    setCampaignMemory(next);
  }, []);

  // Phase 5: ask the solo oracle. RNG (Math.random) lives HERE at the UI edge;
  // the engine (askOracle/rollRandomEvent) is pure and takes the injected roll.
  const askOracleAction = useCallback(() => {
    const d100 = () => Math.floor(Math.random() * 100) + 1;
    const res = askOracle(oracleLikelihood, d100());
    const event = res.randomEvent ? rollRandomEvent(d100(), d100(), d100()) : null;
    setOracleLog((prev) => [{ q: oracleQuestion.trim() || "(ไม่ได้ระบุคำถาม)", res, event }, ...prev].slice(0, 12));
    setOracleQuestion("");
  }, [oracleLikelihood, oracleQuestion]);

  // Task #16 — Session Zero edit helpers (pure engine transforms; state at UI edge).
  const editSz = useCallback((fn: (cfg: SessionZeroConfig) => SessionZeroConfig) => {
    setSessionZeroConfig((prev) => { const next = fn(prev); sessionZeroRef.current = next; return next; });
  }, []);

  function entryNarration(text: string) { return { id: nextId(), type: "dm", text }; }
  function entryPlayer(text: string) { return { id: nextId(), type: "player", text }; }
  function entrySystem(text: string) { return { id: nextId(), type: "system", text }; }

  // Injected dependency bundle for the extracted combat resolvers (combatResolve.ts):
  // the component's log-entry factory + id counter, and the two React-facing seams
  // (player death → setPhase, victory → dungeon-room-clear) they cannot import.
  function combatDeps() {
    return {
      entrySystem, nextId,
      onDeath: () => setPhase("dead"),
      onVictoryDungeon: (e: any[]) => handleCombatEndDungeonUpdate(e, true),
    };
  }

  // Combat spell-menu handler (lifted out of CombatOverlay so the overlay stays
  // presentational): fetch the spell to learn its level, then cast at the lowest
  // legal slot. Legality (known/prepared + slot availability) is enforced
  // authoritatively by the engine (canCast2024) inside castSRDSpell.
  function castSpellFromMenu(idx: string) {
    setThinking(true);
    (async () => {
      try {
        const sp = await fetchSpell(idx, 1, c.level);
        if (!sp) { setLog((prev) => [...prev, entrySystem("⚠️ Spell not found")]); return; }
        const slotLv = sp.level === 0 ? 0 : Math.max(sp.level, 1);
        playerCombatAction("spell", `${idx}@${slotLv}`);
      } finally { setThinking(false); }
    })();
  }

  /** Phase 1: Show DM schema validation warnings to player (transparent about state drift) */
  function logValidationWarnings(res: any, entries: any[]): void {
    const warnings = res?.__validationWarnings;
    if (Array.isArray(warnings) && warnings.length > 0) {
      for (const w of warnings) {
        entries.push(entrySystem(`⚠️ DM schema: ${w}`));
      }
    }
  }

  // Feature-check helper for engine adapters — they need a function (id, key) => boolean
  // Players are always "player" id; enemies don't have features (yet).
  function characterHasFeatureById(id: string, key: string): boolean {
    if (id === "player" || id === cRef.current?.id) {
      return hasFeature(cRef.current, key);
    }
    const cb = combatRef.current;
    if (cb) {
      const enemy = cb.enemies.find((e: any) => e.uid === id);
      if (enemy && enemy.features) return enemy.features.includes(key);
    }
    return false;
  }

  /**
   * Apply a DM response's `updates` to the character — now ATOMIC.
   *
   * The store-owned slices (hp/temp_hp/gold/quests/items/conditions/buffs/loot/
   * npc/faction/env/scene/level_up_choice/rest_trigger/exhaustion) are routed
   * through the pure store reducer (`APPLY_DM_UPDATES`), which builds a brand-new
   * state in full and only commits at the end — so a malformed payload that throws
   * mid-application rolls back everything instead of partial-committing (the legacy
   * bug where setQuests/setGameTime/setPhase fired in-flight while `nc` was still
   * being mutated). The three fields the pure reducer cannot express — items_use
   * consumables (3a), forced-march exhaustion (3b), and level-up class math (3c) —
   * are stripped out and layered around the reducer below. All React setters are
   * deferred to the very end, after every computation has succeeded.
   */
  function applyUpdates(u: any, cc: any, entries: any[]) {
    if (!u) return cc;

    // Fields that need engine / impure handling the pure reducer deliberately omits.
    const { items_use, time_delta, xp_award, ...storeUpdates } = u;

    // === 1. ATOMIC store application (the headline fix) ===================
    const store = createStore(createInitialState({
      player: createPlayerState({
        hp: cc.hp, maxHp: cc.maxHp, tempHp: cc.tempHp || 0, gold: cc.gold,
        xp: cc.xp, level: cc.level,
        inventory: [...cc.inventory], conditions: [...cc.conditions], buffs: [...(cc.buffs || [])],
        feats: [...(cc.feats || [])],
        exhaustionLevel: cc.exhaustionLevel || 0, pendingAsi: cc.pendingAsi || 0,
        npcAttitudes: { ...(cc.npcAttitudes || {}) }, factionReputation: { ...(cc.factionReputation || {}) },
        weather: cc.weather ?? null, environmentEffect: cc.environmentEffect ?? null, sceneType: cc.sceneType ?? null,
        dead: cc.dead || false,
        lastLongRestHoursAgo: cc.lastLongRestHoursAgo ?? 0, lastShortRestHoursAgo: cc.lastShortRestHoursAgo ?? 0,
      }),
      quests, time: gameTime, phase,
    }));
    store.dispatch({ type: "APPLY_DM_UPDATES", updates: storeUpdates });
    const after = store.getState();

    // Mirror the reducer's new player-facing log lines into the app log
    // (re-issued through entrySystem so ids follow the app's nextId() scheme).
    for (const e of after.log) entries.push(entrySystem(e.text));

    // Fold the store-owned slices back onto the rich character object.
    let nc: any = {
      ...cc,
      hp: after.player.hp, maxHp: after.player.maxHp, tempHp: after.player.tempHp,
      gold: after.player.gold, xp: after.player.xp, level: after.player.level,
      inventory: [...after.player.inventory], conditions: [...after.player.conditions], buffs: after.player.buffs,
      feats: after.player.feats,
      exhaustionLevel: after.player.exhaustionLevel, pendingAsi: after.player.pendingAsi,
      npcAttitudes: after.player.npcAttitudes, factionReputation: after.player.factionReputation,
      weather: after.player.weather, environmentEffect: after.player.environmentEffect, sceneType: after.player.sceneType,
      dead: after.player.dead,
      lastLongRestHoursAgo: after.player.lastLongRestHoursAgo, lastShortRestHoursAgo: after.player.lastShortRestHoursAgo,
    };
    // Task #14: ASI-granting feats (Keen Mind/Actor/Resilient). A newly-granted
    // feat just landed in nc.feats above; applyFeatGrants adds its +1 ability
    // (and save proficiency for Resilient) IDEMPOTENTLY — the featGrantsApplied
    // ledger means a re-applied update never doubles the bonus. Derived stats
    // (max HP on CON, AC on DEX/armor) are recomputed at this same seam.
    nc = applyFeatGrantsToChar(nc, (t) => entries.push(entrySystem(t)));

    const newQuests = after.quests;
    let newGameTime = gameTime;

    // === 2. (3a) items_use — consume CONSUMABLES to heal / cure ===========
    // Applied after the reducer so hp_delta lands first (legacy ordering).
    (items_use || []).forEach((it: string) => {
      const idx = nc.inventory.indexOf(it);
      if (idx < 0) { entries.push(entrySystem(`ไม่มี ${it} ในเป้สัมภาระ`)); return; }
      const consum = CONSUMABLES[it];
      nc.inventory.splice(idx, 1);
      if (consum && consum.heal) {
        const h = rollFormula(consum.heal);
        nc.hp = Math.min(nc.maxHp, nc.hp + h.total);
        entries.push(entrySystem(`🧪 ใช้ ${it}: ฟื้น ${h.total} HP → ${nc.hp}/${nc.maxHp}`));
      } else if (consum && consum.cure) {
        const ci = nc.conditions.indexOf(consum.cure);
        if (ci >= 0) { nc.conditions.splice(ci, 1); entries.push(entrySystem(`🧪 ใช้ ${it}: หายจาก ${consum.cure}`)); }
        else entries.push(entrySystem(`🧪 ใช้ ${it}: ไม่มีสถานะให้แก้ (เสียของฟรี)`));
      } else {
        entries.push(entrySystem(`ใช้: ${it}`));
      }
    });

    // === 3. (3c) xp_award — gainXP does the full class math (HP/slots/feats) =
    if (xp_award) nc = gainXP(nc, xp_award, (t) => entries.push(entrySystem(t)));

    // === 4. (3b) time_delta — WorldClock sync + rest timers + forced march ==
    if (time_delta) {
      newGameTime = engineAdvanceHours(time_delta);
      nc.lastLongRestHoursAgo = (nc.lastLongRestHoursAgo ?? 0) + time_delta;
      nc.lastShortRestHoursAgo = (nc.lastShortRestHoursAgo ?? 0) + time_delta;
      entries.push(entrySystem(`⏰ เวลาผ่านไป ${time_delta} ชม. → ${gameTimeToString(newGameTime)}`));
      // Forced march (D&D 2024 RAW): >8h travel without a rest → CON save or exhaustion.
      if (time_delta >= 8 && !u.rest_trigger) {
        const hoursBeyond = time_delta - 8;
        if (hoursBeyond > 0) {
          const forcedMarchDC = 10 + hoursBeyond;
          const conSave = rollD20(saveMod(nc, "con"));
          if (conSave.total < forcedMarchDC) {
            nc.exhaustionLevel = Math.max(0, Math.min(6, (nc.exhaustionLevel || 0) + 1));
            entries.push(entrySystem(`😮‍💨 Forced March Exhaustion! เดินทาง ${time_delta} ชม. (เกิน 8 ชม.) → CON save ${conSave.total} < DC ${forcedMarchDC} → Exhaustion +1 → Lv.${nc.exhaustionLevel}`));
            if (nc.exhaustionLevel >= 6) nc.dead = true;
          } else {
            entries.push(entrySystem(`💪 Forced March: เดินทาง ${time_delta} ชม. → CON save ${conSave.total} ≥ DC ${forcedMarchDC} → ไม่เหนื่อยล้า`));
          }
        }
      }
    }

    // === 5. (3d) Commit the deferred slices ONCE, at the very end ==========
    // No React setter fires mid-flight — any throw above discards everything.
    if (u.quest_add || u.quest_update) setQuests(newQuests);
    // Phase 5: log a newly-received quest into campaign memory for cross-session continuity.
    if (u.quest_add && u.quest_add.id && u.quest_add.title) {
      rememberFact("quest", `quest:${u.quest_add.id}`, u.quest_add.title, u.quest_add.giver ? `จาก ${u.quest_add.giver}` : undefined);
    }
    if (time_delta) setGameTime(newGameTime);
    if (nc.dead) setPhase("dead");
    return nc;
  }

  // Get total AC bonus from active buffs
  function buffACBonus(cc: any): number {
    return (cc.buffs || []).reduce((sum: number, b: any) => {
      if (b.name === "Shield") return sum + 5;
      if (b.name === "Shield of Faith") return sum + 2;
      if (b.name === "Haste") return sum + 2;
      if (b.name === "Mage Armor" && cc.abilities) {
        // Mage Armor sets AC to 13+DEX (already in computeAC if mageArmor flag set); treat as +0 here
        return sum;
      }
      return sum;
    }, 0);
  }

  /* -------- Domain 36: Dungeon Blueprint application -------- */
  function applyDungeonBlueprint(blueprint: any, pushEntry?: (t: string) => void): DungeonBlueprint | null {
    if (!blueprint || !blueprint.id || !Array.isArray(blueprint.rooms)) return null;
    // Validate blueprint
    const validation = validateDungeonBlueprint(blueprint as DungeonBlueprint);
    if (!validation.isValid) {
      if (pushEntry) pushEntry(`⚠️ Dungeon blueprint ไม่ถูกต้อง: ${validation.errors.join("; ")}`);
      return null;
    }
    // Set blueprint as active dungeon
    const bp = blueprint as DungeonBlueprint;
    dungeonBlueprintRef.current = bp;
    setDungeonBlueprint(bp);
    // Create run state
    const runState = createDungeonRunState(bp);
    dungeonRunRef.current = runState;
    setDungeonRun(runState);

    if (pushEntry) {
      pushEntry(`🏰 เข้าสู่ดันเจี้ยน: ${bp.name} (${bp.rooms.length} ห้อง · แนะนำ Lv.${bp.recommendedLevel})`);
      if (bp.hook) pushEntry(`📜 ${bp.hook}`);
      if (validation.warnings.length > 0) pushEntry(`⚠️ DM hint: ${validation.warnings.join("; ")}`);
      if (validation.missingRoles.length > 0) pushEntry(`📐 5-Room: ขาด ${validation.missingRoles.join(", ")} (ยังเล่นได้แต่ไม่ครบ pattern)`);
    }
    // Auto-trigger entrance room staged encounter if any
    const entranceRoom = bp.rooms.find((r) => r.id === bp.entranceRoomId);
    if (entranceRoom?.stagedEncounter && entranceRoom.stagedEncounter.monsterIds.length > 0) {
      setPendingRoomEncounter({
        monsterIds: entranceRoom.stagedEncounter.monsterIds,
        surprise: !!entranceRoom.stagedEncounter.surprise,
        isBoss: !!entranceRoom.stagedEncounter.isBoss,
      });
    }
    return bp;
  }

  /** DM moves player to a room in current dungeon blueprint */
  function applyDungeonRoomMove(roomId: string, pushEntry?: (t: string) => void): { room: Room | null; isFirstVisit: boolean } {
    const bp = dungeonBlueprintRef.current;
    const run = dungeonRunRef.current;
    if (!bp || !run) return { room: null, isFirstVisit: false };
    const result = moveToRoom(run, bp, roomId);
    if (!result.room) {
      if (pushEntry) pushEntry(`⚠️ ไม่พบห้อง "${roomId}" ในดันเจี้ยน`);
      return { room: null, isFirstVisit: false };
    }
    dungeonRunRef.current = result.state;
    setDungeonRun(result.state);
    if (pushEntry && result.isFirstVisit) {
      pushEntry(`🚪 เข้าสู่${result.room.name} [${getRoomRoleLabel(result.room.role)}]`);
      if (result.room.atmosphere) pushEntry(`   🌫️ ${result.room.atmosphere}`);
      // If reached boss room for first time, warn
      if (bp.bossRoomId === roomId) {
        pushEntry(`💀 บอสลา! ถึงห้อง climax แล้ว`);
      }
    }
    // Auto-stage room contents on first visit
    if (result.isFirstVisit && result.room.stagedEncounter) {
      setPendingRoomEncounter({
        monsterIds: result.room.stagedEncounter.monsterIds,
        surprise: !!result.room.stagedEncounter.surprise,
        isBoss: !!result.room.stagedEncounter.isBoss,
      });
    }
    return { room: result.room, isFirstVisit: result.isFirstVisit };
  }

  /** Process DM command to enter a dungeon (sent via "dungeon_enter" field) */
  function applyDungeonEnter(spec: any, pushEntry?: (t: string) => void): DungeonBlueprint | null {
    if (!spec) return null;
    // If DM gave a full blueprint, use it
    if (spec.rooms && Array.isArray(spec.rooms) && spec.rooms.length > 0) {
      return applyDungeonBlueprint(spec, pushEntry);
    }
    // If DM gave just a theme/id, generate procedurally
    if (spec.theme && spec.id) {
      const gen = generateProceduralDungeon({
        theme: spec.theme,
        partyLevel: cRef.current?.level || 1,
        dungeonId: spec.id,
        dungeonName: spec.name || spec.id,
        entranceWorldMapId: mapRef.current?.current || "unknown",
        hook: spec.hook,
        antagonist: spec.antagonist,
      });
      return applyDungeonBlueprint(gen, pushEntry);
    }
    if (pushEntry) pushEntry(`⚠️ dungeon_enter ไม่สมบูรณ์ — ต้องมี rooms[] หรือ theme+id`);
    return null;
  }

  /** Exit current dungeon (back to world map) */
  function exitDungeon(pushEntry?: (t: string) => void) {
    if (pushEntry && dungeonBlueprintRef.current) {
      const summary = dungeonRunRef.current
        ? summarizeDungeonProgress(dungeonRunRef.current, dungeonBlueprintRef.current)
        : "";
      pushEntry(`🚪 ออกจากดันเจี้ยน ${dungeonBlueprintRef.current.name} — ${summary}`);
    }
    dungeonBlueprintRef.current = null;
    dungeonRunRef.current = null;
    setDungeonBlueprint(null);
    setDungeonRun(null);
  }

  /** Check current room's staged trap (returns trap info for DM/engine to resolve) */
  function getCurrentRoomStagedTrap(): Room["stagedTrap"] | null {
    const bp = dungeonBlueprintRef.current;
    const run = dungeonRunRef.current;
    if (!bp || !run) return null;
    const room = bp.rooms.find((r) => r.id === run.currentRoomId);
    return room?.stagedTrap || null;
  }

  /** Mark current room as cleared (called after combat/trap resolved) */
  function clearCurrentRoom(pushEntry?: (t: string) => void) {
    const bp = dungeonBlueprintRef.current;
    const run = dungeonRunRef.current;
    if (!bp || !run) return;
    const wasBossRoom = bp.bossRoomId === run.currentRoomId;
    const newRun = markRoomCleared(run, run.currentRoomId);
    if (wasBossRoom) {
      const bossDefeatedRun = markBossDefeated(newRun);
      dungeonRunRef.current = bossDefeatedRun;
      setDungeonRun(bossDefeatedRun);
      if (pushEntry) pushEntry(`🏆 กำจัดบอสแล้ว! ${summarizeDungeonProgress(bossDefeatedRun, bp)}`);
      // Phase 3: auto-complete active quests whose title/description references this dungeon
      // (the Quest type in gameData.ts is simplified — no objective-type tracking — so we
      // mark all objectives of relevant quests as done when boss is defeated)
      const dungeonNameLower = bp.name.toLowerCase();
      const dungeonIdLower = bp.id.toLowerCase();
      const updatedQuests = quests.map((q) => {
        if (q.status !== "active") return q;
        // Heuristic: if quest title or description mentions dungeon name/id, mark as complete
        const titleMatch = q.title.toLowerCase().includes(dungeonNameLower) || q.title.toLowerCase().includes(dungeonIdLower);
        const descMatch = q.description.toLowerCase().includes(dungeonNameLower) || q.description.toLowerCase().includes(dungeonIdLower);
        if (!titleMatch && !descMatch) return q;
        // Mark all objectives done + set status completed
        return {
          ...q,
          objectives: q.objectives.map((o) => ({ ...o, done: true })),
          status: "completed" as const,
        };
      });
      const newlyCompleted = updatedQuests.filter((q, i) => q.status === "completed" && quests[i].status !== "completed");
      if (newlyCompleted.length > 0) {
        setQuests(updatedQuests);
        if (pushEntry) {
          newlyCompleted.forEach((q) => pushEntry(`✅ เควสต์สำเร็จอัตโนมัติ: ${q.title}`));
        }
      }
    } else {
      dungeonRunRef.current = newRun;
      setDungeonRun(newRun);
      if (pushEntry) pushEntry(`✓ ${summarizeDungeonProgress(newRun, bp)}`);
    }
  }

  /** Apply all DM response fields related to dungeon (dungeon_enter/room_move/exit)
   *  Each sub-update is isolated in try/catch — a malformed dungeon payload must
   *  never throw and must never discard the rest of this response's updates. */
  function applyDungeonUpdates(res: any, entries: any[]): void {
    // 1. dungeon_enter — set or generate blueprint
    if (res.dungeon_enter) {
      try {
        // If already in a dungeon, exit first (DM gave us a new one)
        if (dungeonBlueprintRef.current) {
          exitDungeon((t) => entries.push(entrySystem(t)));
        }
        applyDungeonEnter(res.dungeon_enter, (t) => entries.push(entrySystem(t)));
      } catch (e: any) {
        console.warn("[applyDungeonUpdates] dungeon_enter skipped:", e);
        entries.push(entrySystem(`⚠️ dungeon_enter ไม่สมบูรณ์ — ข้าม`));
      }
    }
    // 2. dungeon_room_move — move to new room
    if (res.dungeon_room_move && res.dungeon_room_move.room_id) {
      try {
        if (!dungeonBlueprintRef.current) {
          entries.push(entrySystem(`⚠️ dungeon_room_move ใช้ไม่ได้ — ยังไม่ได้เข้าดันเจี้ยน`));
        } else {
          applyDungeonRoomMove(res.dungeon_room_move.room_id, (t) => entries.push(entrySystem(t)));
        }
      } catch (e: any) {
        console.warn("[applyDungeonUpdates] dungeon_room_move skipped:", e);
        entries.push(entrySystem(`⚠️ dungeon_room_move ล้มเหลว — ข้าม`));
      }
    }
    // 3. dungeon_exit — leave dungeon back to world map
    if (res.dungeon_exit === true || res.dungeon_exit === "true") {
      try {
        exitDungeon((t) => entries.push(entrySystem(t)));
      } catch (e: any) {
        console.warn("[applyDungeonUpdates] dungeon_exit skipped:", e);
        entries.push(entrySystem(`⚠️ dungeon_exit ล้มเหลว — ข้าม`));
      }
    }
  }

  /** After combat ends, mark current dungeon room cleared (called by combat end handlers) */
  function handleCombatEndDungeonUpdate(entries: any[], wasVictory: boolean): void {
    if (!dungeonBlueprintRef.current || !dungeonRunRef.current) return;
    if (wasVictory) {
      clearCurrentRoom((t) => entries.push(entrySystem(t)));
    }
  }

  /* -------- combat engine -------- */
  async function initCombat(monsterIds: string[], cc: any, entries: any[], surprise = false) {
    const ids = (monsterIds || []).slice(0, 6);
    const enemies: any[] = [];
    // Phase 0 fix: parallel fetch with Promise.all instead of sequential await
    // (was: sequential loop with await — slow when fetching 3+ monsters from Open5e)
    const fetchResults = await Promise.all(
      ids.map(async (id) => {
        let base = BESTIARY[id];
        if (!base && SRD_OK) {
          const srdMon = await fetchMonsterForCombat(id);
          if (srdMon) return { kind: "srd" as const, id, data: srdMon };
        }
        if (base) return { kind: "bestiary" as const, id, data: base };
        return { kind: "missing" as const, id, data: null };
      })
    );
    for (const r of fetchResults) {
      if (r.kind === "srd" && r.data) {
        r.data.uid = `${r.id}_${enemies.length}`;
        enemies.push(r.data);
      } else if (r.kind === "bestiary" && r.data) {
        enemies.push({ uid: `${r.id}_${enemies.length}`, id: r.id, ...r.data, hpNow: r.data.hp, conditions: [] });
      } else {
        entries.push(entrySystem(`⚠️ engine ไม่รู้จักมอนสเตอร์ "${r.id}" — ข้ามตัวนี้`));
      }
    }
    if (enemies.length === 0) return null;

    // Generate a tactical battle grid (12x10) with token positions
    const GRID_W = 12, GRID_H = 10;
    // Player starts at bottom-center
    const playerPos = { x: Math.floor(GRID_W / 2), y: GRID_H - 2 };
    // Enemies spread across the top half, spread out
    const enemyPositions: Record<string, { x: number; y: number }> = {};
    enemies.forEach((e, i) => {
      const spread = enemies.length > 1 ? i / (enemies.length - 1) : 0.5;
      enemyPositions[e.uid] = {
        x: Math.round(1 + spread * (GRID_W - 2)),
        y: 1 + (i % 3),
      };
    });

    // Roll initiative for everyone (player + each enemy)
    // D&D 2024 RAW: Initiative is ALWAYS rolled first
    // D&D 2024 Surprise: NOT a turn-skip — surprised creatures roll Initiative with Disadvantage.
    // Source: D&D Beyond Free Rules 2024 — "Initiative". They can act/move/react normally on round 1.
    const pInit = rollD20(mod(cc.abilities.dex)); // player ambusher: no disadvantage
    const enemyInits = enemies.map((e) => {
      // D&D 2024: surprised enemies roll Initiative with Disadvantage (roll 2d20, take lower)
      const roll1 = d(20) + e.init;
      const roll2 = d(20) + e.init;
      const finalInit = surprise ? Math.min(roll1, roll2) : roll1;
      return { uid: e.uid, th: e.th, init: finalInit, roll1, roll2 };
    });
    const eInitBest = Math.max(...enemyInits.map((e) => e.init));
    // Initiative is NOT a check vs DC — it's a roll to determine turn order
    // Do NOT show "vs DC" or "MISS/HIT" — just show the roll and who goes first
    entries.push({ id: nextId(), type: "roll", title: "Initiative", roll: pInit, extra: `ศัตรูทอยได้สูงสุด ${eInitBest} — ${pInit.total >= eInitBest ? "คุณได้เริ่มก่อน" : "ศัตรูเริ่มก่อน"}` });

    // Stage C (combat-state migration): the initiative each combatant rolled
    // above is FED INTO the bridge (below), which becomes the single owner of
    // initiative order + values. `cb.initOrder`/`cb.currentInitIdx` are derived
    // from getCombatView() rather than held as a parallel copy. Map uid→init so
    // the bridge seed can carry the exact rolled totals.
    const enemyInitByUid: Record<string, number> = {};
    enemyInits.forEach((e) => { enemyInitByUid[e.uid] = e.init; });

    // D&D 2024 Surprise: enemies rolled Initiative with Disadvantage but still act normally
    const playerFirst = pInit.total >= eInitBest;
    entries.push(entrySystem(`⚔️ เข้าสู่การต่อสู้! ${enemies.map((e) => e.th).join(", ")} — ${playerFirst ? "คุณได้เริ่มก่อน" : "ศัตรูเริ่มก่อน"}`));
    if (surprise) {
      entries.push(entrySystem("🗡️ Surprise! (D&D 2024) ศัตรูทอย Initiative เสียเปรียบ — แต่ยังได้แอคชั่น/Move/Reaction ปกติในรอบแรก"));
      // Flag for UI display only — does NOT skip turn (D&D 2024)
      enemies.forEach((e) => { e.surprised = true; });
    }
    entries.push(entrySystem(`🗺️ สนามรบขนาด ${GRID_W}×${GRID_H} ช่อง — คุณอยู่ตำแหน่ง (${playerPos.x},${playerPos.y}) ศัตรูอยู่ทางตอนเหนือ`));
    // Encounter difficulty rating (uses both legacy rating + Domain 35 encounter engine)
    const totalXP = enemies.reduce((a, e) => a + (e.xp || 50), 0);
    const difficulty = rateEncounterDifficulty(totalXP, cc.level);
    // Domain 35: use encounter engine for precise difficulty + thresholds
    const encounterDifficulty = calculateDifficulty(totalXP, enemies.length, cc.level, 1);
    const thresholds = getDifficultyThresholds(cc.level);
    entries.push(entrySystem(`📊 ความยาก: ${difficulty} / ${encounterDifficulty} (XP รวม ${totalXP}, ${enemies.length} ศัตรู)`));
    entries.push(entrySystem(`   📈 Lv.${cc.level} thresholds (D&D 2024): trivial ${thresholds.trivial}/low ${thresholds.low}/moderate ${thresholds.moderate}/high ${thresholds.high}/impossible ${thresholds.impossible}`));
    // DM hint: suggest CR for future encounters (2024 tiers)
    const lowCRs = suggestedCR(cc.level, "low");
    if (lowCRs.length > 0) {
      entries.push(entrySystem(`   💡 CR แนะนำสำหรับ Lv.${cc.level} low: ${lowCRs.join(", ")}`));
    }

    const cb: any = {
      enemies, round: 1, playerFirst, dodge: false, surprise: !!surprise, bonusUsed: false, extraAction: false,
      grid: { w: GRID_W, h: GRID_H },
      playerPos,
      enemyPositions,
      movementLeft: cc.speed || 30, // D&D 5e: use character's speed (dwarf=25, monk=30+10, etc.)
      hasMoved: false,
    };
    // Stage A+C (combat-state migration): the persistent bridge state OWNS enemy
    // HP (A) and initiative order/values (C). Enemy blobs are bestiary/SRD shapes
    // (not NormalizedCreature), so adapt them to RawCombatantInput here. `hpNow`
    // on each blob is a projection of this; the `initiative` seed (each
    // combatant's already-rolled total) makes the bridge the single owner of
    // turn order — createCombat's sort reproduces the app's prior stable
    // descending order exactly (see tests/combat-bridge.test.ts).
    cb.bridge = buildBridgeState([
      { id: "player", name: cc.name, ac: cc.ac, hp: cc.hp, maxHp: cc.maxHp, speed: cc.speed || 30, isPlayer: true, initiative: pInit.total },
      ...enemies.map((e: any) => ({
        id: e.uid,
        name: e.th,
        ac: e.ac,
        hp: e.hp,
        maxHp: e.hp,
        speed: typeof e.speed === "number" ? e.speed : 30,
        isPlayer: false,
        initiative: enemyInitByUid[e.uid] ?? e.init,
      })),
    ]);
    // Stage C: initiative order + current-turn pointer are now a projection of
    // the seeded bridge (single source), not independently-held state. The
    // derived order/values/flags are byte-identical to the prior local sort.
    cb.initOrder = getCombatView(cb.bridge).order.map((o) => ({
      uid: o.id, name: o.name, init: o.initiative, isPlayer: o.isPlayer,
    }));
    cb.currentInitIdx = cb.initOrder.findIndex((o: any) => o.isPlayer === playerFirst);
    return cb;
  }

  /** Phase 1 fix: build pacing object for buildSystemPrompt from narrativeEngine state */
  function getPacingForPrompt(): any {
    if (!narrativeEngine) return null;
    const p = narrativeEngine.pacing;
    return {
      currentTension: p.currentTension,
      recommendedNextTension: p.recommendedNextTension,
      scenesSinceRest: p.scenesSinceRest,
      scenesSinceCombat: p.scenesSinceCombat,
      scenesSinceRevelation: p.scenesSinceRevelation,
      pacingNotes: p.pacingNotes,
      arcPhase: narrativeEngine.arc.currentPhase,
    };
  }

  async function narrateCombatEvent(summary: string, cc: any, sc: string, baseLog: any[], hist: any[]) {
    setThinking(true);
    try {
      // Include scene anchor + story context for combat narration too
      const sceneAnchor = `[CURRENT SCENE: ${sc || "?"} — ผู้เล่นอยู่ที่นี่ ห้ามเปลี่ยนสถานที่]\n`;
      const newHist = [...hist, { role: "user", content: `${sceneAnchor}${summary}` }];
      const res = await callDM(buildPrompt(cc, getPacingForPrompt()), newHist);
      const entries = [entryNarration(res.narration)];
      logValidationWarnings(res, entries);
      let nc = applyUpdates(res.updates, cc, entries);
      let nsc = res.scene || sc;
      let ncb = null;
      let nmp = applyWorldMap(res.world_map, mapRef.current, (t) => entries.push(entrySystem(t)));
      nmp = applyMapUpdate(res.map_update, nmp, (t) => entries.push(entrySystem(t)));
      // Phase 5: record newly-discovered places into campaign memory for continuity.
      if (res.map_update?.add_location?.id && res.map_update.add_location.name) {
        rememberFact("place", `place:${res.map_update.add_location.id}`, res.map_update.add_location.name, res.map_update.add_location.type);
      }
      // Domain 36: apply dungeon updates (enter/room_move/exit)
      applyDungeonUpdates(res, entries);
      // Auto-trigger staged encounter if pending (from new room entry)
      if (pendingRoomEncounter && !res.start_combat) {
        ncb = await initCombat(pendingRoomEncounter.monsterIds, nc, entries, pendingRoomEncounter.surprise);
        if (pendingRoomEncounter.isBoss) {
          entries.push(entrySystem(`💀 บอสแอคชั่น! (ใช้ lair actions ถ้ามี)`));
        }
        setPendingRoomEncounter(null);
      }
      if (nmp && nmp.current && nmp.nodes[nmp.current]) nmp.nodes[nmp.current].visited = true;
      mapRef.current = nmp;
      if (res.start_combat && res.start_combat.monsters) {
        ncb = await initCombat(res.start_combat.monsters, nc, entries, res.start_combat.surprise);
      }
      const finalHist = [...newHist, { role: "assistant", content: JSON.stringify(res) }];
      const finalLog = [...baseLog, ...entries];
      cRef.current = nc; combatRef.current = ncb; logDataRef.current = finalLog;
      setC(nc); setScene(nsc); setLog(finalLog); setCombat(ncb); setHistory(finalHist); setMap(nmp);
      persist(nc, nsc, finalLog, ncb, finalHist);
      if (nc.dead) setPhase("dead");
    } catch (e: any) {
      const finalLog = [...baseLog, entrySystem("⚠️ DM ขัดข้อง: " + e.message + " (ลองพิมพ์ต่อได้)")];
      setLog(finalLog);
    } finally { setThinking(false); }
  }

  function commitCombat(cc2: any, cb2: any, log2: any[]) {
    cRef.current = cc2; combatRef.current = cb2; logDataRef.current = log2;
    setC(cc2); setCombat(cb2); setLog(log2);
  }


  function playerCombatAction(kind: string, payload?: any) {
    const combat0 = combatRef.current;
    const c0 = cRef.current;
    const log0 = logDataRef.current;
    if (!combat0 || thinking) return;
    let cc = { ...c0 };
    let cb = { ...combat0, enemies: combat0.enemies.map((e: any) => ({ ...e })) };
    const entries: any[] = [];

    // --- unconscious: death save loop (routed through shared resolveDeathSave helper, which
    //     wraps engine.combat.rollDeathSave; 3 successes = stable, 3 failures = dead,
    //     nat-20 = revive 1 HP, nat-1 = 2 failures) ---
    if (cc.hp <= 0 && !cc.dead) {
      const dsResult = resolveDeathSave(cc, entries, true, combatDeps());
      cc = dsResult.cc;
      if (dsResult.state === "dead") {
        const finalLog = [...log0, ...entries];
        commitCombat(cc, null, finalLog); persist(cc, scene, finalLog, null, history);
        return;
      }
      if (dsResult.state === "stable" || dsResult.state === "revived" || cc.hp > 0) {
        // Clear combat state completely — player is revived, combat ends
        cb = null as any;
        const finalLog = [...log0, ...entries];
        commitCombat(cc, null, finalLog); persist(cc, scene, finalLog, null, history);
        narrateCombatEvent(`[จบ combat] ${cc.name} หมดสติแต่รอดชีวิต (stable, 1 HP). ศัตรูจากไปแล้ว. บรรยายฉากที่ฟื้นขึ้นมา`, cc, scene, finalLog, history);
        return;
      }
      // Still unconscious — enemies attack, then advance round
      cb.round += 1;
      // Clear hiddenAdv/invisible when downed
      cb.invisible = false;
      cc.hiddenAdv = false;
      const finalLog = [...log0, ...entries];
      commitCombat(cc, cb, finalLog); persist(cc, scene, finalLog, cb, history);
      return;
    }

    // If incapacitated (stunned/paralyzed/etc), skip turn
    if (isIncapacitated(cc)) {
      entries.push(entrySystem(`😵 ${cc.name} ไร้ความสามารถ (${cc.conditions.filter((c:string)=>INCAPACITATING_CONDS.includes(c)).join(", ")}) — เสียเทิร์น`));
      // Remove one round of stun conditions that auto-end (simplified)
      // Then enemies act
      cb.dodge = false;
      cc.conditions = [...cc.conditions];
      const proneIdx = cc.conditions.indexOf("prone");
      if (proneIdx >= 0) { cc.conditions.splice(proneIdx, 1); entries.push(entrySystem("🧍 Stood up — no longer Prone")); }
      // enemies act
      cc = runEnemyPhase(cb, cc, entries, true, combatDeps());
      cb.round += 1;
      cb.bonusUsed = false; cb.extraAction = false;
      const finalLog = [...log0, ...entries];
      commitCombat(cc, cb, finalLog);
      persist(cc, scene, finalLog, cb, history);
      return;
    }

    cb.dodge = false;
    cc.conditions = [...cc.conditions];
    const proneIdx = cc.conditions.indexOf("prone");
    if (proneIdx >= 0) {
      cc.conditions.splice(proneIdx, 1);
      entries.push(entrySystem("🧍 Stood up (half movement used) — no longer Prone"));
    }
    let fled = false;
    let endsTurn = true;

    // Weapon-attack context for the extracted resolveWeaponAttack (weaponAttack.ts):
    // the selected target, power-attack toggle, ref-reading feature check, and logging.
    const attackCtx = { targetId: payload, powerAttackOn, characterHasFeatureById, deps: combatDeps() };

    if (kind === "attack" || kind === "attack_ranged") {
      const w = kind === "attack_ranged" ? getRanged(cc) : getMelee(cc);
      const label = kind === "attack_ranged" ? "🏹 Shoot" : "Attack";
      // B3: Extra Attack scales with level — Fighter gets 3 at L11, 4 at L20
      const allFeats = getExtendedFeatures()[cc.cls] || {};
      let numAttacks = 1;
      // Check for extra_attack, extra_attack_3, extra_attack_4 in cumulative features
      for (let lv = 1; lv <= cc.level; lv++) {
        const feats = allFeats[lv] || [];
        for (const f of feats) {
          if (f.k === "extra_attack") numAttacks = Math.max(numAttacks, 2);
          if (f.k === "extra_attack_3") numAttacks = Math.max(numAttacks, 3);
          if (f.k === "extra_attack_4") numAttacks = Math.max(numAttacks, 4);
        }
      }
      // Monk: Martial Arts gives bonus action unarmed strike after Attack
      const monkBonus = hasFeature(cc, "martial_arts");
      for (let i = 0; i < numAttacks; i++) {
        if (!cb.enemies.some((e: any) => e.hpNow > 0)) break;
        if (i > 0) entries.push(entrySystem("⚔️ Extra Attack — second strike"));
        ({ cc, cb } = resolveWeaponAttack(w, label, cc, cb, entries, attackCtx));
      }
      cc.attackedThisRound = true; // Track for Rage maintenance
      if (monkBonus && cb.enemies.some((e:any) => e.hpNow > 0) && !cb.bonusUsed) {
        // D&D 2024: Monk Martial Arts die = 1d4 at Lv1-4, 1d6 at Lv5-10, 1d8 at Lv11-16, 1d10 at Lv17+
        const martialDie = cc.level >= 17 ? "1d10" : cc.level >= 11 ? "1d8" : cc.level >= 5 ? "1d6" : "1d4";
        entries.push(entrySystem(`🥋 Martial Arts — bonus action unarmed strike (${martialDie}+DEX)`));
        ({ cc, cb } = resolveWeaponAttack({ th: "Unarmed Strike", dmg: martialDie, abil: "dex", ranged: false, reach: 5, properties: [] }, "👊", cc, cb, entries, attackCtx));
        cb.bonusUsed = true;
      }
    } else if (kind === "item") {
      const item = CONSUMABLES[payload];
      const idx = cc.inventory.indexOf(payload);
      if (item && idx >= 0) {
        cc.inventory = [...cc.inventory];
        cc.inventory.splice(idx, 1);
        if (item.heal) {
          const h = rollFormula(item.heal);
          cc.hp = Math.min(cc.maxHp, cc.hp + h.total);
          entries.push(entrySystem(`🧪 Used ${payload}: healed ${h.total} HP → ${cc.hp}/${cc.maxHp}`));
        }
        if (item.cure) {
          const ci = cc.conditions.indexOf(item.cure);
          cc.conditions = [...cc.conditions];
          if (ci >= 0) { cc.conditions.splice(ci, 1); entries.push(entrySystem(`🧪 Used ${payload}: cured ${item.cure}`)); }
          else entries.push(entrySystem(`🧪 Used ${payload}: no ${item.cure} to cure (wasted)`));
        }
        if (item.dmg) {
          // thrown item like Acid, Holy Water
          const target = cb.enemies.find((e:any)=>e.hpNow>0);
          if (target) {
            const dr = rollFormula(item.dmg);
            hitEnemy(cb, target, dr.total);
            entries.push({ id: nextId(), type: "roll", title: `${payload} → ${target.th}`, roll: { die:0, other:null, mod:0, total:0, adv:"none" }, success: true, extra: `${item.dmgType||""} ${dr.total} → ${target.th} ${target.hpNow<=0?"dead!":`${target.hpNow} HP left`}` });
          }
        }
        if (hasFeature(cc, "fast_hands") && !cb.bonusUsed) {
          cb.bonusUsed = true; endsTurn = false;
          entries.push(entrySystem("🖐️ Fast Hands (bonus action) — can still take main action"));
        }
      }
      setCombatMenu("");
    } else if (kind === "spell") {
      // payload is "spellIndex@slotLevel"
      const [spellIndex, slotStr] = String(payload).split("@");
      const slotLevel = parseInt(slotStr, 10);
      // Cast async — but we're in a sync function. Mark thinking and handle async.
      setThinking(true);
      (async () => {
        try {
          const result = await castSRDSpell(spellIndex, slotLevel, cc, cb, entries, combatDeps(), combatTargetId);
          cc = result.cc; cb = result.cb;
          let finalEndsTurn = result.endsTurn;
          // Action Surge: keep turn going
          if (finalEndsTurn && cb.extraAction) {
            cb.extraAction = false;
            finalEndsTurn = false;
            entries.push(entrySystem("⚡ Action Surge triggers — take 1 more action!"));
          }
          setCombatMenu("");
          // win check
          let endW = checkCombatEnd(cb, cc, entries, combatDeps());
          cc = endW.cc;
          if (endW.ended) {
            const finalLog = [...log0, ...entries];
            commitCombat(cc, null, finalLog);
            setThinking(false);
            narrateCombatEvent(`[จบ combat] ${cc.name} ชนะ! กำจัด ${cb.enemies.map((e:any)=>e.th).join(", ")}. HP คงเหลือ ${cc.hp}/${cc.maxHp}. บรรยายผลหลังการต่อสู้และอาจให้ loot — อย่าลืมอ้างถึงแผลที่ได้รับและสภาพรอบตัวในฉากเดิม`, cc, scene, finalLog, history);
            return;
          }
          if (!finalEndsTurn) {
            const finalLog = [...log0, ...entries];
            commitCombat(cc, cb, finalLog);
            persist(cc, scene, finalLog, cb, history);
            setThinking(false);
            return;
          }
          // enemies act
          // D&D 2024: surprise affects the initiative ROLL only — surprised
          // enemies still take their turn normally. Clear the round-1-only
          // advantage flag and fall through to the normal enemy phase below.
          if (cb.surprise) cb.surprise = false;
          // auto-spells: Spiritual Weapon + Spirit Guardians
          if (cb.spiritualWeapon) {
            const t = cb.enemies.find((e:any)=>e.hpNow>0);
            if (t) {
              const atk = rollD20(spellAtkMod(cc), t.glow ? "advantage" : "none");
              if (t.glow) t.glow = false;
              const hit = atk.die !== 1 && (atk.die === 20 || atk.total >= t.ac);
              let extra: string | null = null;
              if (hit) {
                const dr = rollFormula("1d8");
                let dmg = dr.total + mod(cc.abilities[CLASSES[cc.cls].castAbil]);
                if (atk.die === 20) dmg += rollFormula("1d8").total;
                hitEnemy(cb, t, dmg);
                extra = `${dmg} damage → ${t.th} ${t.hpNow<=0?"dead!":`${t.hpNow} HP left`}`;
              }
              entries.push({ id: nextId(), type: "roll", title: `⚔️ Spiritual Weapon → ${t.th}`, roll: atk, vsAc: t.ac, success: hit, extra });
            }
            cb.swRounds = (cb.swRounds ?? 10) - 1;
            if (cb.swRounds <= 0) { cb.spiritualWeapon = false; entries.push(entrySystem("⚔️ Spiritual Weapon expires")); }
          }
          if (cb.spiritGuardians) {
            const dc = spellDC(cc);
            const dr = rollFormula("3d8");
            for (const t of cb.enemies) {
              if (t.hpNow <= 0) continue;
              const sv = rollD20(monSave(t, "wis"));
              const failed = sv.total < dc;
              const dmg = failed ? dr.total : Math.floor(dr.total / 2);
              hitEnemy(cb, t, dmg);
              entries.push({ id: nextId(), type: "roll", title: `👻 Spirit Guardians → ${t.th} (WIS save DC ${dc})`, roll: sv, dc, success: failed, extra: `${dmg} radiant → ${t.th} ${t.hpNow<=0?"dead!":`${t.hpNow} HP left`}` });
            }
          }
          endW = checkCombatEnd(cb, cc, entries, combatDeps());
          cc = endW.cc;
          if (endW.ended) {
            const finalLog = [...log0, ...entries];
            commitCombat(cc, null, finalLog);
            setThinking(false);
            narrateCombatEvent(`[จบ combat] ${cc.name} ชนะ! กำจัด ${cb.enemies.map((e:any)=>e.th).join(", ")}. HP คงเหลือ ${cc.hp}/${cc.maxHp}. บรรยายผลหลังการต่อสู้และอาจให้ loot — อย่าลืมอ้างถึงแผลที่ได้รับและสภาพรอบตัวในฉากเดิม`, cc, scene, finalLog, history);
            return;
          }
          cc = runEnemyPhase(cb, cc, entries, true, combatDeps());
          // Emit turn-end for player + turn-start for new round
          emitTurnEnd("player", cb.round);
          cb.round += 1; cb.bonusUsed = false; cb.extraAction = false; cb.movementLeft = cc.speed || 30; cb.hasMoved = false; cb.enemies.forEach((e:any) => e.reactionUsed = false);
          if (cb.bridge) cb.bridge = setMovement(cb.bridge, "player", cb.movementLeft);
          emitTurnStart("player", cb.round);
          const finalLog = [...log0, ...entries];
          commitCombat(cc, cb, finalLog);
          persist(cc, scene, finalLog, cb, history);
        } catch (e: any) {
          entries.push(entrySystem("⚠️ Spell cast failed: " + e.message));
          const finalLog = [...log0, ...entries];
          setLog(finalLog);
        } finally {
          setThinking(false);
        }
      })();
      return; // async branch handles commit
    } else if (kind === "second_wind") {
      if (hasFeature(cc, "second_wind") && !cc.secondWindUsed) {
        const h = rollFormula(`1d10+${cc.level}`);
        cc.hp = Math.min(cc.maxHp, cc.hp + h.total);
        cc.secondWindUsed = true;
        entries.push(entrySystem(`🛡️ Second Wind: healed ${h.total} HP → ${cc.hp}/${cc.maxHp}`));
        if (!cb.bonusUsed) { cb.bonusUsed = true; endsTurn = false; entries.push(entrySystem("💨 Bonus action — can still take main action")); }
      }
    } else if (kind === "action_surge") {
      if (hasFeature(cc, "action_surge") && !cc.actionSurgeUsed) {
        cc.actionSurgeUsed = true;
        cb.extraAction = true;
        endsTurn = false;
        entries.push(entrySystem("⚡ Action Surge! แอคชั่นถัดไปจะไม่จบเทิร์น — ทำได้ 2 แอคชั่นรอบนี้"));
      }
    } else if (kind === "move") {
      // Move player token on the grid. payload = "x,y"
      const [mx, my] = String(payload).split(",").map(Number);
      if (cb.playerPos && cb.grid) {
        const dist = gridDistance(cb.playerPos, { x: mx, y: my });
        const moveCost = dist * 5; // D&D 5e: 1 square = 5 ft; movement is tracked in feet
        if (moveCost > (cb.movementLeft || 0)) {
          entries.push(entrySystem(`⚠️ เคลื่อนที่ไม่ได้ — ต้องการ ${moveCost} ฟุต แต่เหลือ movement ${cb.movementLeft} ฟุต`));
        } else if (mx < 0 || mx >= cb.grid.w || my < 0 || my >= cb.grid.h) {
          entries.push(entrySystem(`⚠️ ตำแหน่งนอกกริด`));
        } else {
          // Check if target square is occupied by an enemy
          const occupied = cb.enemies.some((e: any) => e.hpNow > 0 && cb.enemyPositions[e.uid]?.x === mx && cb.enemyPositions[e.uid]?.y === my);
          if (occupied) {
            entries.push(entrySystem(`⚠️ ช่องนั้นมีศัตรูอยู่ — เคลื่อนที่ไม่ได้`));
          } else {
            const oldPos = { ...cb.playerPos };
            // Opportunity Attack check: was player adjacent to any enemy BEFORE moving, and is no longer adjacent after?
            const wasAdjacentTo = cb.enemies.filter((e: any) => e.hpNow > 0 && cb.enemyPositions[e.uid] && isAdjacent(oldPos, cb.enemyPositions[e.uid]));
            const newPos = { x: mx, y: my };
            const stillAdjacentTo = wasAdjacentTo.filter((e: any) => isAdjacent(newPos, cb.enemyPositions[e.uid]));
            const provokedOA = wasAdjacentTo.filter((e: any) => !stillAdjacentTo.includes(e));
            cb.playerPos = newPos;
            cb.movementLeft -= moveCost;
            cb.hasMoved = true;
            // Route the spend through the feet-native bridge so it stays authoritative/testable.
            // cb.movementLeft (reset every round/Dash below) remains the gameplay gate — the bridge
            // tracker is kept in lockstep via setMovement rather than trusted for blocking, so a
            // stale bridge tracker can never cause a spurious move block.
            if (cb.bridge) {
              const mv = moveBy(cb.bridge, "player", moveCost);
              cb.bridge = mv.ok ? mv.state : setMovement(cb.bridge, "player", cb.movementLeft);
            }
            entries.push(entrySystem(`🏃 เคลื่อนที่จาก (${oldPos.x},${oldPos.y}) → (${mx},${my}) — ใช้ ${moveCost} ฟุต (เหลือ ${cb.movementLeft} ฟุต)`));
            // Opportunity Attacks from enemies provoked by leaving their reach
            // D&D 5e RAW: OA uses Reaction — each enemy can only make 1 OA per round
            if (provokedOA.length > 0 && !cb.disengageUsed) {
              for (const e of provokedOA) {
                if (e.hpNow <= 0 || cc.hp <= 0) break;
                // Check if this enemy already used their reaction this round
                if (e.reactionUsed) {
                  entries.push(entrySystem(`⚠️ ${e.th} ใช้ Reaction ไปแล้ว — ไม่สามารถทำ Opportunity Attack`));
                  continue;
                }
                e.reactionUsed = true; // Mark reaction as used
                entries.push(entrySystem(`⚠️ Opportunity Attack! ${e.th} โจมตีขณะคุณเคลื่อนที่ออก (ใช้ Reaction)`));
                const oaAtk = rollD20(e.atk || 4, "none");
                const oaHit = oaAtk.die !== 1 && (oaAtk.die === 20 || oaAtk.total >= cc.ac);
                if (oaHit) {
                  const oaDmg = rollFormula(e.dmg || "1d6+2");
                  cc.hp = Math.max(0, cc.hp - oaDmg.total);
                  entries.push({ id: nextId(), type: "roll", title: `${e.th} Opportunity Attack`, roll: oaAtk, vsAc: cc.ac, success: true, extra: `${e.dmg}=${oaDmg.total} → HP ${cc.hp}` });
                  if (cc.hp <= 0) {
                    entries.push(entrySystem(`💀 ${cc.name} ล้มลงหมดสติจาก Opportunity Attack!`));
                    break;
                  }
                } else {
                  entries.push({ id: nextId(), type: "roll", title: `${e.th} Opportunity Attack`, roll: oaAtk, vsAc: cc.ac, success: false, extra: null });
                }
              }
            }
          }
        }
      }
    } else if (kind === "dash") {
      // D&D 5e RAW: Dash = Action → gain extra movement equal to speed
      cb.movementLeft += (cc.speed || 30);
      if (cb.bridge) cb.bridge = setMovement(cb.bridge, "player", cb.movementLeft);
      entries.push(entrySystem(`🏃 Dash: ใช้ Action — เพิ่ม movement ${cc.speed || 30} ฟุต (รวม ${cb.movementLeft} ฟุต)`));
    } else if (kind === "help") {
      // D&D 5e RAW: Help = Action → ally gains advantage on next attack vs target
      const target = cb.enemies.find((e: any) => e.hpNow > 0);
      if (target) {
        entries.push(entrySystem(`🤝 Help: ใช้ Action — การโจมตีถัดไปใส่ ${target.th} ได้เปรียบ`));
        target.helpBuff = true; // next attack vs this target has advantage
      }
    } else if (kind === "search") {
      // D&D 5e RAW: Search = Action → Perception or Investigation check
      let searchAdv: "none" | "advantage" | "disadvantage" = hasCheckDisadv(cc) ? "disadvantage" : "none";
      const r = rollD20(skillMod(cc, "perception"), searchAdv);
      const dc = 15;
      const ok = r.total >= dc;
      entries.push({ id: nextId(), type: "roll", title: "Search (Perception)", roll: r, dc, success: ok, extra: ok ? "พบศัตรูที่ซ่อนอยู่!" : "ไม่พบอะไร" });
      if (ok) {
        // Reveal any hidden enemies
        cb.enemies.forEach((e: any) => { if (e.hidden) { e.hidden = false; entries.push(entrySystem(`👁️ เจอ ${e.th} ที่ซ่อนอยู่!`)); } });
      }
    } else if (kind === "rage") {
      if (hasFeature(cc, "rage") && !cc.raging && cc.rageUsed < (cc.level >= 6 ? 4 : cc.level >= 3 ? 3 : 2)) {
        cc.raging = true;
        cc.rageUsed += 1;
        entries.push(entrySystem(`🔥 Rage: advantage on Str checks, +${cc.level >= 9 ? 3 : 2} melee damage, resistance to bludgeoning/piercing/slashing. Ends if you don't attack for a round.`));
        if (!cb.bonusUsed) { cb.bonusUsed = true; endsTurn = false; }
      }
    } else if (kind === "lay_on_hands") {
      if (hasFeature(cc, "lay_on_hands") && cc.layOnHandsPool > 0) {
        const heal = Math.min(cc.layOnHandsPool, cc.maxHp - cc.hp);
        cc.hp += heal;
        cc.layOnHandsPool -= heal;
        entries.push(entrySystem(`🤲 Lay on Hands: healed ${heal} HP → ${cc.hp}/${cc.maxHp} (pool: ${cc.layOnHandsPool} left)`));
      }
    } else if (kind === "ki_flurry") {
      if (hasFeature(cc, "martial_arts") && cc.kiUsed < cc.level) {
        cc.kiUsed += 1;
        // Two extra unarmed strikes
        for (let i = 0; i < 2; i++) {
          if (!cb.enemies.some((e:any)=>e.hpNow>0)) break;
          ({ cc, cb } = resolveWeaponAttack({ th: "Unarmed Strike", dmg: "1d4", abil: "dex", ranged: false }, `🥋 Flurry ${i+1}`, cc, cb, entries, attackCtx));
        }
        entries.push(entrySystem(`🌀 Flurry of Blows (1 ki point, ${cc.level - cc.kiUsed} ki left)`));
      }
    } else if (kind === "bardic_inspiration") {
      if (hasFeature(cc, "bardic_inspiration") && cc.bardicInspirationUsed < (mod(cc.abilities.cha) || 1)) {
        cc.bardicInspirationUsed += 1;
        cb.bardicInspiration = true;
        entries.push(entrySystem("🎵 Bardic Inspiration: next attack gains +1d6 damage"));
        if (!cb.bonusUsed) { cb.bonusUsed = true; endsTurn = false; }
      }
    } else if (kind === "heroic_inspiration") {
      // Phase 2: Heroic Inspiration (D&D 2024 core) — grant advantage on next d20 roll
      if (cc.heroicInspiration) {
        cc.heroicInspiration = false;
        cc.hiddenAdv = true; // reuse hiddenAdv flag for "next attack advantage"
        entries.push(entrySystem("⭐ Heroic Inspiration: การทอย d20 ครั้งถัดไปได้เปรียบ (consumed)"));
        endsTurn = false; // free action
      }
    } else if (kind === "preserve_life") {
      if (hasFeature(cc, "preserve_life") && !cc.preserveLifeUsed) {
        const cap = Math.floor(cc.maxHp / 2);
        if (cc.hp >= cap) {
          entries.push(entrySystem(`🕊️ Preserve Life unavailable — HP already exceeds half Max HP (RAW cap ${cap})`));
        } else {
          const heal = Math.min(5 * cc.level, cap - cc.hp);
          cc.preserveLifeUsed = true;
          cc.hp += heal;
          entries.push(entrySystem(`🕊️ Channel Divinity — Preserve Life: healed ${heal} HP → ${cc.hp}/${cc.maxHp}`));
        }
      }
    } else if (kind === "hide") {
      // === D&D 5e Stealth Rules (RAW) ===
      // 1. Roll Stealth check (Dexterity + proficiency if proficient)
      // 2. Compare against EACH enemy's Passive Perception (10 + WIS mod + proficiency)
      // 3. If Stealth > Passive Perception → enemy doesn't know your position (Hidden)
      // 4. Hidden = advantage on attacks + enemies attack you with disadvantage
      // 5. Hidden ends when you attack, cast spell, make noise, or enter line of sight
      // 6. Enemies can use Search action (Perception check) to find you
      let hadv: "none" | "advantage" | "disadvantage" = hasCheckDisadv(cc) ? "disadvantage" : "none";
      if (wornHas(cc, "adv_stealth")) hadv = hadv === "disadvantage" ? "none" : "advantage";
      const r = rollD20(skillMod(cc, "stealth"), hadv);
      // Check against each enemy's passive perception
      // D&D 5e/2024 Passive Perception = 10 + WIS mod + proficiency (if proficient in Perception)
      // Source: PHB "Passive Checks: ...such as a score for Passive Perception... = 10 + all modifiers that normally apply to the check"
      // Open5e creatures have pre-computed `passivePerception` field — use it directly
      // Legacy BESTIARY monsters don't have this field → compute from WIS modifier
      const stealthResult = r.total;
      const enemyChecks = cb.enemies.filter((e: any) => e.hpNow > 0).map((e: any) => {
        let enemyPassivePerc: number;
        if (e.passivePerception && e.passivePerception > 0) {
          // Open5e pre-computed value (already includes WIS mod + proficiency)
          enemyPassivePerc = e.passivePerception;
        } else {
          // Legacy BESTIARY: compute from WIS modifier (not WIS save modifier!)
          // e.sv.wis is the WIS SAVE modifier (WIS mod + PB if proficient in WIS saves)
          // We need WIS ability modifier — extract from abilities or estimate from save
          const wisMod = e.abilities?.wis ? Math.floor((e.abilities.wis - 10) / 2) : (e.sv?.wis ?? 0);
          enemyPassivePerc = 10 + wisMod;
        }
        const detected = stealthResult <= enemyPassivePerc;
        return { name: e.th, passivePerc: enemyPassivePerc, detected };
      });
      const allHidden = enemyChecks.every((ec: any) => !ec.detected);
      const someDetected = enemyChecks.some((ec: any) => ec.detected);
      cc.hiddenAdv = allHidden;
      cc.hiddenStealthRoll = stealthResult; // store for enemy Search checks
      const checkSummary = enemyChecks.map((ec: any) => `${ec.name}(PP ${ec.passivePerc}):${ec.detected ? "เห็น" : "ไม่เห็น"}`).join(", ");
      entries.push({
        id: nextId(), type: "roll", title: "Hide (Stealth)", roll: r,
        success: allHidden,
        extra: allHidden
          ? `ซ่อนสำเร็จ! Stealth ${stealthResult} > ทุกศัตรู — โจมตีได้เปรียบ, ศัตรูเสียเปรียบโจมตีคุณ`
          : someDetected
            ? `ซ่อนไม่สำเร็ยบางส่วน — ${enemyChecks.filter((ec: any) => ec.detected).map((ec: any) => ec.name).join(", ")} เห็นคุณ`
            : `ล้มเหลว — ทุกศัตรูเห็นคุณ`
      });
      entries.push(entrySystem(`   📊 ${checkSummary}`));
      // E2: D&D 2024 — successful Hide grants Invisible condition (not just hiddenAdv flag)
      if (allHidden) {
        if (!cc.conditions.includes("invisible")) {
          cc.conditions.push("invisible");
          entries.push(entrySystem("🫥 D&D 2024: Hide สำเร็จ → Invisible condition (ศัตรูโจมตีคุณเสียเปรียบ, คุณโจมตีได้เปรียบ)"));
        }
      }
      // E2: Light level affects stealth — dim light gives +2 to Stealth
      const currentHour = worldClockToLegacy(getWorldClock()).hour;
      const lightLevel = getLightLevelForHour(currentHour);
      if (lightLevel === "dim" || lightLevel === "darkness") {
        entries.push(entrySystem(`   🌙 แสง${lightLevel === "dim" ? "สลัว" : "มืด"} — ช่วยให้ซ่อนได้ดีขึ้น`));
      }
      if (hasFeature(cc, "cunning_action") && !cb.bonusUsed) {
        cb.bonusUsed = true; endsTurn = false;
        entries.push(entrySystem("💨 Cunning Action (bonus action) — ยังโจมตีได้"));
      }
    } else if (kind === "dodge") {
      // D&D 5e RAW: Dodge = Action (entire turn's action)
      cb.dodge = true;
      entries.push(entrySystem(`🌀 Dodge: ใช้ Action — ศัตรูโจมตีคุณเสียเปรียบจนถึงเทิร์นถัดไป`));
      // Dodge consumes the Action — turn ends (unless Rogue Cunning Action makes it bonus)
      if (!hasFeature(cc, "cunning_action")) {
        endsTurn = true;
      } else if (!cb.bonusUsed) {
        cb.bonusUsed = true; endsTurn = false;
        entries.push(entrySystem("💨 Cunning Action (bonus action) — ยังโจมตีได้"));
      }
    } else if (kind === "disengage") {
      // D&D 5e RAW: Disengage = Action (prevents OA for rest of turn)
      cb.disengageUsed = true;
      entries.push(entrySystem(`🚶 Disengage: ใช้ Action — ไม่ก่อ Opportunity Attack ในเทิร์นนี้`));
      // Rogues with Cunning Action can Disengage as bonus action
      if (hasFeature(cc, "cunning_action") && !cb.bonusUsed) {
        cb.bonusUsed = true;
        endsTurn = false;
        entries.push(entrySystem("💨 Cunning Action (bonus action) — ยังเคลื่อนที่/โจมตีได้"));
      }
    } else if (kind === "ready") {
      // Phase 2: Ready Action (D&D 2024) — prepare a reaction with trigger
      // Simplified: player ready a melee attack that triggers when enemy moves adjacent
      cb.readyAction = { trigger: "enemy_approach", action: "attack" };
      entries.push(entrySystem(`⏰ Ready Action: ใช้ Action — เตรียมโจมตีเมื่อศัตรูเข้าใกล้ (Reaction)`));
      endsTurn = true;
    } else if (kind === "invisible") {
      if ((cc.worn || []).includes("Ring of Invisibility") && !cb.invisible) {
        cb.invisible = true;
        cc.hiddenAdv = true;
        entries.push(entrySystem("🫥 Ring of Invisibility: you fade — next attack has advantage, enemies attack you with disadvantage"));
      }
    } else if (kind === "grapple") {
      // D&D 2024 Grapple (engine combat.resolveContestedAction): Unarmed Strike →
      // target makes STR or DEX save (its choice) vs DC = 8 + STR mod + PB. No contested check.
      const target = cb.enemies.find((e: any) => e.hpNow > 0);
      if (target) {
        const res = resolveContestedAction({
          type: "grapple",
          attackerId: "player",
          targetId: target.uid,
          attackerAthleticsMod: mod(cc.abilities.str),
          attackerProficiencyBonus: profByLevel(cc.level),
          targetDefenseMod: monSave(target, "str"),
          targetDexSaveMod: monSave(target, "dex"),
        });
        const sv = { die: res.targetRoll, other: null, mod: res.targetTotal - res.targetRoll, total: res.targetTotal, adv: "none" as const };
        entries.push({ id: nextId(), type: "roll", title: `จับตรึง ${target.th} (STR/DEX save vs DC ${res.saveDC})`, roll: sv, dc: res.saveDC, success: res.success, extra: res.success ? `${target.th} ถูกตรึง (Grappled — speed 0)` : `${target.th} หลุดจากการจับ` });
        if (res.success) {
          if (!target.conditions) target.conditions = [];
          const cond = res.conditionApplied || "grappled";
          if (!target.conditions.includes(cond)) target.conditions.push(cond);
          target.speedReduced = (target.speedReduced || 0) + 999; // speed = 0 while grappled
        }
      }
    } else if (kind === "shove") {
      // D&D 2024 Shove (engine combat.resolveContestedAction): Unarmed Strike →
      // target makes STR or DEX save (its choice) vs DC = 8 + STR mod + PB. Here: knock Prone.
      const target = cb.enemies.find((e: any) => e.hpNow > 0);
      if (target) {
        const res = resolveContestedAction({
          type: "shove_prone",
          attackerId: "player",
          targetId: target.uid,
          attackerAthleticsMod: mod(cc.abilities.str),
          attackerProficiencyBonus: profByLevel(cc.level),
          targetDefenseMod: monSave(target, "str"),
          targetDexSaveMod: monSave(target, "dex"),
        });
        const sv = { die: res.targetRoll, other: null, mod: res.targetTotal - res.targetRoll, total: res.targetTotal, adv: "none" as const };
        entries.push({ id: nextId(), type: "roll", title: `ผลัก/ล้ม ${target.th} (STR/DEX save vs DC ${res.saveDC})`, roll: sv, dc: res.saveDC, success: res.success, extra: res.success ? `${target.th} ล้ม (Prone)` : `${target.th} ต้านทานได้` });
        if (res.success) {
          if (!target.conditions) target.conditions = [];
          const cond = res.conditionApplied || "prone";
          if (!target.conditions.includes(cond)) target.conditions.push(cond);
        }
      }
    } else if (kind === "dual_wield") {
      // D&D 5e RAW Two-Weapon Fighting: both weapons must have Light property
      // Bonus action attack with off-hand weapon
      const mainW = getMelee(cc);
      // Check if main weapon has Light property
      if (!mainW || !(mainW.properties || []).includes("light")) {
        entries.push(entrySystem("⚠️ อาวุธหลักไม่ใช่ Light — ไม่สามารถใช้ Two-Weapon Fighting ได้"));
      } else {
        const target = cb.enemies.find((e: any) => e.hpNow > 0);
        if (target && mainW) {
          const atk = rollD20(attackMod(cc, mainW), hasDisadv(cc) ? "disadvantage" : "none");
          const hit = atk.die !== 1 && (atk.die === 20 || atk.total >= target.ac);
          let extra: string | null = null;
          if (hit) {
            const dmgR = rollFormula(mainW.dmg);
            let dmg = dmgR.total;
            // Two-Weapon Fighting Style: add ability modifier to off-hand damage
            if (hasFeature(cc, "two_weapon_fighting")) {
              dmg += mod(cc.abilities[mainW.abil]);
            }
            if (atk.die === 20) dmg += rollFormula(mainW.dmg).total;
            hitEnemy(cb, target, dmg);
            extra = `${mainW.dmg}(${dmgR.rolls.join("+")})${hasFeature(cc, "two_weapon_fighting") ? `+${mod(cc.abilities[mainW.abil])}` : ""} = ${dmg} → ${target.th} ${target.hpNow <= 0 ? "ตาย!" : `เหลือ ${target.hpNow} HP`}`;
          }
          entries.push({ id: nextId(), type: "roll", title: `⚔️⚔️ มือนอก → ${target.th}`, roll: atk, vsAc: target.ac, success: hit, extra });
          cb.bonusUsed = true;
        }
      }
    } else if (kind === "flee") {
      const best = cc.abilities.dex >= cc.abilities.str ? "acrobatics" : "athletics";
      let adv: "none" | "advantage" | "disadvantage" = hasCheckDisadv(cc) ? "disadvantage" : "none";
      if (hasFeature(cc, "cunning_action")) adv = adv === "disadvantage" ? "none" : "advantage";
      const r = rollD20(skillMod(cc, best), adv);
      const ok = r.total >= 12;
      entries.push({ id: nextId(), type: "roll", title: `Flee (${SKILLS[best].th})`, roll: r, dc: 12, success: ok });
      if (ok) fled = true;
    }

    // Action Surge
    if (endsTurn && cb.extraAction && ["attack", "attack_ranged", "item", "dodge"].includes(kind)) {
      cb.extraAction = false;
      endsTurn = false;
      entries.push(entrySystem("⚡ Action Surge triggers — take 1 more action!"));
    }

    // win check
    let endW = checkCombatEnd(cb, cc, entries, combatDeps());
    cc = endW.cc;
    if (endW.ended || fled) {
      const finalLog = [...log0, ...entries];
      commitCombat(cc, null, finalLog);
      const summary = fled
        ? `[combat end] ${cc.name} fled the fight successfully. Narrate the escape`
        : `[จบ combat] ${cc.name} ชนะ! กำจัด ${cb.enemies.map((e: any) => e.th).join(", ")}. HP คงเหลือ ${cc.hp}/${cc.maxHp}. บรรยายผลหลังการต่อสู้และอาจให้ loot — อย่าลืมอ้างถึงแผลที่ได้รับและสภาพรอบตัวในฉากเดิม`;
      narrateCombatEvent(summary, cc, scene, finalLog, history);
      return;
    }

    if (!endsTurn && !fled) {
      const finalLog = [...log0, ...entries];
      commitCombat(cc, cb, finalLog);
      persist(cc, scene, finalLog, cb, history);
      return;
    }

    // enemies act
    if (!fled) {
      // D&D 2024: surprise affects the initiative ROLL only — surprised
      // enemies still take their turn normally. Clear the round-1-only
      // advantage flag and fall through to the normal enemy phase below.
      if (cb.surprise) cb.surprise = false;
      if (cb.spiritualWeapon) {
        const t = cb.enemies.find((e: any) => e.hpNow > 0);
        if (t) {
          const atk = rollD20(spellAtkMod(cc), t.glow ? "advantage" : "none");
          if (t.glow) t.glow = false;
          const hit = atk.die !== 1 && (atk.die === 20 || atk.total >= t.ac);
          let extra: string | null = null;
          if (hit) {
            const dr = rollFormula("1d8");
            let dmg = dr.total + mod(cc.abilities[CLASSES[cc.cls].castAbil]);
            if (atk.die === 20) dmg += rollFormula("1d8").total;
            hitEnemy(cb, t, dmg);
            extra = `${dmg} damage → ${t.th} ${t.hpNow<=0?"dead!":`${t.hpNow} HP left`}`;
          }
          entries.push({ id: nextId(), type: "roll", title: `⚔️ Spiritual Weapon → ${t.th}`, roll: atk, vsAc: t.ac, success: hit, extra });
        }
        cb.swRounds = (cb.swRounds ?? 10) - 1;
        if (cb.swRounds <= 0) { cb.spiritualWeapon = false; entries.push(entrySystem("⚔️ Spiritual Weapon expires")); }
      }
      if (cb.spiritGuardians) {
        const dc = spellDC(cc);
        const dr = rollFormula("3d8");
        for (const t of cb.enemies) {
          if (t.hpNow <= 0) continue;
          const sv = rollD20(monSave(t, "wis"));
          const failed = sv.total < dc;
          const dmg = failed ? dr.total : Math.floor(dr.total / 2);
          hitEnemy(cb, t, dmg);
          entries.push({ id: nextId(), type: "roll", title: `👻 Spirit Guardians → ${t.th} (WIS save DC ${dc})`, roll: sv, dc, success: failed, extra: `${dmg} radiant → ${t.th} ${t.hpNow<=0?"dead!":`${t.hpNow} HP left`}` });
        }
      }
      endW = checkCombatEnd(cb, cc, entries, combatDeps());
      cc = endW.cc;
      if (endW.ended) {
        const finalLog = [...log0, ...entries];
        commitCombat(cc, null, finalLog);
        narrateCombatEvent(`[จบ combat] ${cc.name} ชนะ! กำจัด ${cb.enemies.map((e: any) => e.th).join(", ")}. HP คงเหลือ ${cc.hp}/${cc.maxHp}. บรรยายผลหลังการต่อสู้และอาจให้ loot — อย่าลืมอ้างถึงแผลที่ได้รับและสภาพรอบตัวในฉากเดิม`, cc, scene, finalLog, history);
        return;
      }
      // Task #14: sidekick assist acts at the END of the player's turn, before
      // the enemies. Its damage routes through hitEnemy (bridge-owned HP).
      runSidekickAssist(cb, cc, (t) => entries.push(entrySystem(t)), combatTargetId);
      const skEnd = checkCombatEnd(cb, cc, entries, combatDeps());
      cc = skEnd.cc;
      if (skEnd.ended) {
        const finalLog = [...log0, ...entries];
        commitCombat(cc, null, finalLog);
        narrateCombatEvent(`[จบ combat] ${cc.name} ชนะ! กำจัด ${cb.enemies.map((e: any) => e.th).join(", ")}. HP คงเหลือ ${cc.hp}/${cc.maxHp}. บรรยายผลหลังการต่อสู้และอาจให้ loot — อย่าลืมอ้างถึงแผลที่ได้รับและสภาพรอบตัวในฉากเดิม`, cc, scene, finalLog, history);
        return;
      }
      // Tick buff durations BEFORE enemies attack (= end of player's turn)
      cc = tickBuffs(cc, (t) => entries.push(entrySystem(t)));
      cc = runEnemyPhase(cb, cc, entries, true, combatDeps());
      cb.round += 1; cb.bonusUsed = false; cb.extraAction = false; cb.movementLeft = cc.speed || 30; cb.hasMoved = false; cb.enemies.forEach((e:any) => e.reactionUsed = false);
      if (cb.bridge) cb.bridge = setMovement(cb.bridge, "player", cb.movementLeft);
      // End of round: rage expires if no attack happened this round
      if (cc.raging && !cc.attackedThisRound) {
        cc.raging = false;
        entries.push(entrySystem("🔥 Rage หมด (ไม่ได้โจมตีในรอบนี้)"));
      }
      cc.attackedThisRound = false; // reset for next round
    }

    const finalLog = [...log0, ...entries];
    commitCombat(cc, cb, finalLog);
    persist(cc, scene, finalLog, cb, history);
  }

  async function submitCombatTalk(text: string) {
    if (!text.trim() || thinking || !combatRef.current) return;
    setInput("");
    const cb: any = combatRef.current;
    const cc = cRef.current;
    const baseLog = [...logDataRef.current, entryPlayer(text)];
    logDataRef.current = baseLog;
    setLog(baseLog);
    setThinking(true);
    try {
          const enemiesTxt = cb.enemies.map((e: any) => `${e.th}${e.hpNow <= 0 ? " (ตายแล้ว)" : ` ${e.hpNow}/${e.hp} HP`}`).join(", ");
      const hist = [...history, {
        role: "user",
        content: `[ระหว่าง COMBAT รอบ ${cb.round} — ศัตรู: ${enemiesTxt} — HP ผู้เล่น ${cc.hp}/${cc.maxHp}]\nผู้เล่นทำ free action (พูด/ตะโกน/ถาม/สังเกต — ไม่ใช้เทิร์น): ${text}\nตอบ narration สั้น 1-3 ประโยคเท่านั้น ห้ามใช้ requires, ห้าม start_combat, ห้ามแก้ HP/ไอเทม/XP ผ่าน updates, ห้ามจบ combat — ถ้าผู้เล่นถามสถานะศัตรู บรรยายจากตัวเลขจริงใน context (เลือดเต็ม = ยังไม่บาดเจ็บ) ห้ามแต่งเลขเอง ห้ามพูดคำว่า engine/ระบบ`,
      }];
      const res = await callDM(buildPrompt(cc, getPacingForPrompt()), hist);
      const finalHist = [...hist, { role: "assistant", content: JSON.stringify(res) }];
      const finalLog = [...logDataRef.current, entryNarration(res.narration)];
      logDataRef.current = finalLog;
      setLog(finalLog); setHistory(finalHist);
      persist(cRef.current, scene, finalLog, combatRef.current, finalHist);
    } catch (e: any) {
      const finalLog = [...logDataRef.current, entrySystem("⚠️ DM ขัดข้อง: " + e.message + " — ลองส่งใหม่")];
      logDataRef.current = finalLog;
      setLog(finalLog);
    } finally { setThinking(false); }
  }

  async function submitAction(text: string) {
    if (!text.trim() || thinking || combat) return;
    setInput("");
    const baseLog = [...log, entryPlayer(text)];
    setLog(baseLog);
    setThinking(true);
    try {
      // AI DM Layer: analyze player intent (Domain 31) for DM hint
      // Try LLM-based classifier first (more accurate for Thai/natural language)
      // Fall back to keyword-based classifier if LLM fails or returns "unknown"
      let intentResult = analyzeIntent(text); // keyword fallback (synchronous)
      try {
        const intentResp = await fetch("/api/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (intentResp.ok) {
          const llmIntent = await intentResp.json();
          if (llmIntent.intent && llmIntent.intent !== "unknown") {
            // LLM gave us a confident answer — use it
            intentResult = {
              intent: llmIntent.intent,
              confidence: llmIntent.confidence ?? 0.7,
              emotionTone: llmIntent.tone,
            };
          } else if (llmIntent.intent === "unknown" && intentResult.intent === "unknown") {
            // Both classifiers agree it's unknown — keep unknown with LLM confidence
            intentResult = { intent: "unknown", confidence: llmIntent.confidence ?? 0.2 };
          }
          // Otherwise: keyword classifier got something but LLM said unknown — trust keyword (faster, more lenient)
        }
      } catch (intentErr) {
        // LLM call failed — fall back to keyword classifier result
        console.warn("Intent LLM call failed, using keyword fallback:", intentErr);
      }
      setLastIntent(intentResult.intent);
      const knownPlaces = mapRef.current ? Object.keys(mapRef.current.nodes).slice(0, 40).join(",") : "-";
      // Include intent analysis as DM hint
      const intentHint = `\n[AI DM hint: intent=${intentResult.intent} confidence=${intentResult.confidence.toFixed(2)}${intentResult.emotionTone ? ` tone=${intentResult.emotionTone}` : ""}]`;
      // Scene anchor — prominently placed BEFORE the player message so DM can't miss it
      const sceneAnchor = `[CURRENT SCENE: ${scene || "?"} — ผู้เล่นอยู่ที่นี่ตอนนี้ ห้ามเปลี่ยนสถานที่โดยที่ผู้เล่นไม่ได้บอกว่าจะไป]\n`;

      // === Story Context — สรุปสถานะโลกให้ DM รู้เรื่องราวทั้งหมด ===
      const activeQuests = quests.filter(q => q.status === "active").map(q => {
        const objDone = (q.objectives || []).filter((o:any) => o.done).length;
        const objTotal = (q.objectives || []).length;
        return `${q.title}${objTotal > 0 ? ` (${objDone}/${objTotal} objectives)` : ""}`;
      }).join("; ") || "ไม่มี";

      const npcList = Object.entries(c.npcAttitudes || {}).map(([id, att]: [string, any]) => `${id}:${att}`).join(", ") || "ไม่มี";
      const factionList = Object.entries(c.factionReputation || {}).map(([id, rep]: [string, any]) => `${id}:${rep > 0 ? "+" : ""}${rep}`).join(", ") || "ไม่มี";

      // Recent events recap — สรุป 5 事件ล่าสุดจาก log (ไม่ใช่ history)
      const recentLogEntries = log.slice(-8).filter((e: any) => e.type === "dm" || e.type === "system").map((e: any) => {
        if (e.type === "dm") return `DM: ${e.text.slice(0, 120)}`;
        if (e.type === "system") return e.text.slice(0, 100);
        return "";
      }).filter(Boolean).join(" | ");
      const recentEvents = recentLogEntries ? `\n[RECENT EVENTS: ${recentLogEntries}]` : "";

      // Rest state — tell DM when player last rested
      const longRestHoursAgo = c.lastLongRestHoursAgo ?? 99;
      const shortRestHoursAgo = c.lastShortRestHoursAgo ?? 99;
      const restState = longRestHoursAgo < 2 ? "เพิ่งตื่นนอน (Long Rest ใหม่ๆ ไม่ถึง 2 ชม.ที่แล้ว — ห้ามแนะนำให้พักอีก!)"
        : longRestHoursAgo < 8 ? `พักยาวครั้งล่าสุด ${longRestHoursAgo} ชม.ที่แล้ว (ยังสดชื่น — ไม่ควรแนะนำให้พัก)`
        : longRestHoursAgo < 16 ? `พักยาวครั้งล่าสุด ${longRestHoursAgo} ชม.ที่แล้ว (เริ่มเหนื่อยเล็กน้อย — อาจแนะนำได้ถ้าเหมาะสม)`
        : `พักยาวครั้งล่าสุด ${longRestHoursAgo} ชม.ที่แล้ว (เหนื่อยมาก — ควรพัก)`;
      const hitDiceState = `${c.hitDiceLeft || 0}/${c.level} Hit Dice`;

      const storyContext = `[STORY CONTEXT:
- เควสต์ที่กำลังทำ: ${activeQuests}
- ความสัมพันธ์ NPC: ${npcList}
- ชื่อเสียงกลุ่ม: ${factionList}
- อากาศ: ${c.weather || "ปกติ"} | สภาพแวดล้อม: ${c.environmentEffect || "ปกติ"}
- Exhaustion: Lv.${c.exhaustionLevel || 0}${c.exhaustionLevel ? ` (-${c.exhaustionLevel * 2} ต่อ D20 Test)` : ""}
- พักผ่อน: ${restState} | ${hitDiceState}
- วันที่ ${gameTimeToString(worldClockToLegacy(getWorldClock()))}]${recentEvents}
`;

      const status = `[สถานะ: HP ${c.hp}/${c.maxHp}, AC ${c.ac}, Level ${c.level}, ทอง ${c.gold} gp, สถานที่: ${scene || "?"}, ตำแหน่งบนแผนที่: ${mapRef.current && mapRef.current.current ? mapRef.current.current : "-"}, สถานที่ที่รู้จัก: ${knownPlaces}, สภาวะ: ${c.conditions.join(",") || "-"}, buffs: ${(c.buffs || []).map((b:any)=>b.name).join(",") || "-"}, ไอเทมในเป้: ${c.inventory.join(", ") || "-"}${CLASSES[c.cls].caster ? `, spell slots: ${c.slots.join("/")}` : ""}]`;

      // === Domain 36: Auto-detect dungeon context — DM ต้องเป็นคนตัดสินใจ ===
      let dungeonHint = "";
      const currentMapNode = mapRef.current && mapRef.current.current ? mapRef.current.nodes?.[mapRef.current.current] : null;
      const isAtDungeonEntrance = currentMapNode?.type === "dungeon";
      if (dungeonBlueprintRef.current && dungeonRunRef.current) {
        // Player is inside a dungeon — show full state to DM
        const bp = dungeonBlueprintRef.current;
        const run = dungeonRunRef.current;
        const currentRoom = bp.rooms.find((r) => r.id === run.currentRoomId);
        const visibleExits = bp.connections
          .filter((c2: RoomConnection) => c2.from === run.currentRoomId || c2.to === run.currentRoomId)
          .filter((c2: RoomConnection) => !c2.isSecret || run.discoveredSecretConnectionIds.includes(c2.id))
          .map((c2: RoomConnection) => {
            const destId = c2.from === run.currentRoomId ? c2.to : c2.from;
            const destRoom = bp.rooms.find((r) => r.id === destId);
            return `${c2.direction}→${destRoom?.name || "?"}${c2.isLocked ? "🔒" : ""}${c2.isSecret ? "(secret)" : ""}`;
          }).join(", ");
        dungeonHint = `\n[🏰 DUNGEON CONTEXT: อยู่ในดันเจี้ยน "${bp.name}" (theme: ${bp.theme}) — ห้องปัจจุบัน: ${currentRoom?.name || "?"} [${currentRoom ? getRoomRoleLabel(currentRoom.role) : "?"}] — progress ${run.roomsCleared}/${run.totalRooms} ห้อง cleared · boss ${run.bossDefeated ? "defeated ✓" : run.hasReachedBoss ? "encountered" : "not yet"} · secrets ${run.secretsFound}/${run.totalSecrets} — ทางออก: ${visibleExits || "ไม่มี"} — ผู้เล่นอยู่ในดันเจี้ยนแล้ว ห้ามส่ง dungeon_enter ซ้ำ ใช้ dungeon_room_move ถ้าผู้เล่นจะย้ายห้อง หรือ dungeon_exit ถ้าผู้เล่นออกจากดันเจี้ยน]`;
      } else if (isAtDungeonEntrance && /เข้า|ใน|enter|inside|สำรวจ|investigate|ไปดันเจี|ไปถ้ำ|ไปปราสาท|ไปหอ|ไปวัด/i.test(text)) {
        // Player is AT a dungeon-type world map node AND expressing intent to enter
        // → DM MUST create dungeon blueprint automatically using dungeon_enter
        dungeonHint = `\n[🏰 DUNGEON ENTER REQUIRED: ผู้เล่นอยู่ที่ dungeon entrance "${currentMapNode.name}" บน world map และต้องการเข้าสำรวจ — DM ต้องส่ง dungeon_enter field ใน response นี้เพื่อสร้าง blueprint ทั้งหมด (5-8 ห้อง ตาม 5-Room pattern) ครั้งเดียว — ใช้รูปแบบสั้น { theme: "...", id: "...", name: "...", hook: "..." } engine จะ procedural generate ให้อัตโนมัติ — เลือก theme ตามบรรยากาศ (crypt/cave/wizard_tower/abandoned_mine/ancient_temple/sewer/ruined_castle/forest_shrine/underwater/fiendish/generic) — ห้ามให้ผู้เล่นเลือก theme เอง DM เป็นคนตัดสินใจ]`;
      } else if (isAtDungeonEntrance) {
        // Player is at dungeon entrance but hasn't expressed intent to enter yet — soft hint
        dungeonHint = `\n[🏰 DUNGEON NEARBY: ผู้เล่นอยู่ที่ dungeon entrance "${currentMapNode.name}" — ถ้าผู้เล่นบอกว่าจะเข้า ให้ใช้ dungeon_enter สร้าง blueprint ทันที]`;
      }

      let hist = [...history, { role: "user", content: `${sceneAnchor}${storyContext}${status}${intentHint}${dungeonHint}\nPlayer: ${text}` }];
      let res = await callDM(buildPrompt(c, getPacingForPrompt()), hist);
      hist = [...hist, { role: "assistant", content: JSON.stringify(res) }];

      let entries = [entryNarration(res.narration)];
      logValidationWarnings(res, entries);
      // Rule 2.3 guard: if this response asks for a check/save, its consequences
      // (damage/gold/items/conditions/buffs) must wait for the roll — the follow-up
      // response (res2) applies them. Otherwise the player is punished/rewarded
      // before the dice are known, and a successful roll can't undo it.
      const setupUpdates = res.requires && !res.start_combat
        ? deferConsequenceUpdates(res.updates)
        : res.updates;
      let cc = applyUpdates(setupUpdates, c, entries);

      // === Narrative Pacing: track scene type + tension ===
      let sc = res.scene || scene;
      if (narrativeEngine) {
        const sceneType = (res.updates?.scene_type || cc.sceneType || "exploration") as any;
        const tension = res.start_combat ? "high" as const : cc.conditions?.length > 0 ? "medium" as const : "low" as const;
        const sceneObj = createScene({
          id: `scene_${Date.now()}`,
          arcId: narrativeEngine.arc.id,
          type: sceneType,
          title: sc || "Exploration",
          description: res.narration.slice(0, 100),
          locationId: mapRef.current?.current || "unknown",
          tension,
        });
        let updatedEngine = enterScene(narrativeEngine, sceneObj);
        updatedEngine = completeScene(updatedEngine, "success");
        setNarrativeEngine(updatedEngine);
        // Log pacing notes if any
        if (updatedEngine.pacing.pacingNotes.length > 0) {
          entries.push(entrySystem(`📖 DM Pacing: ${updatedEngine.pacing.pacingNotes.join(" · ")}`));
        }
      }
      let cb: any = null;
      // Process world_map (rare, but possible if DM expands the world) then map_update
      let mp = applyWorldMap(res.world_map, mapRef.current, (t) => entries.push(entrySystem(t)));
      mp = applyMapUpdate(res.map_update, mp, (t) => entries.push(entrySystem(t)));
      // Domain 36: apply dungeon updates (enter/room_move/exit)
      applyDungeonUpdates(res, entries);
      // Auto-trigger staged encounter if pending (from new room entry)
      if (pendingRoomEncounter && !res.start_combat && !res.requires) {
        cb = await initCombat(pendingRoomEncounter.monsterIds, cc, entries, pendingRoomEncounter.surprise);
        if (pendingRoomEncounter.isBoss) {
          entries.push(entrySystem(`💀 บอสลา! ระวัง lair actions`));
        }
        setPendingRoomEncounter(null);
      }
      // Mark current as visited on relocation
      if (mp && mp.current && mp.nodes[mp.current]) mp.nodes[mp.current].visited = true;

      if (res.requires && !res.start_combat) {
        const rq = res.requires;
        let rollEntry: any, resultText: string = "";
        if (rq.type === "check" && SKILLS[rq.skill]) {
          let adv: "none" | "advantage" | "disadvantage" = rq.advantage || "none";
          if (rq.skill === "stealth" && wornHas(cc, "adv_stealth") && adv !== "advantage") adv = "advantage";
          if (hasCheckDisadv(cc)) adv = adv === "advantage" ? "none" : "disadvantage";
          const r = rollD20(skillMod(cc, rq.skill), adv);
          const ok = r.total >= rq.dc;
          rollEntry = { id: nextId(), type: "roll", title: `${SKILLS[rq.skill].th} check`, roll: r, dc: rq.dc, success: ok };
          resultText = `[ผลทอย] ${rq.skill} check: ทอยได้ ${r.total} vs DC ${rq.dc} → ${ok ? "สำเร็จ" : "ล้มเหลว"}${r.die === 20 ? " (Nat 20!)" : r.die === 1 ? " (Nat 1!)" : ""}. บรรยายผลต่อ`;
        } else if (rq.type === "save") {
          const svAdv: "none" | "disadvantage" = rq.ability === "dex" && cc.conditions.includes("restrained") ? "disadvantage" : "none";
          const r = rollD20(saveMod(cc, rq.ability), svAdv);
          const ok = r.total >= rq.dc;
          let extra: string | null = null;
          if (rq.on_fail_damage) {
            const dr = rollFormula(rq.on_fail_damage);
            const rawDmg = ok ? (rq.half_on_success ? Math.floor(dr.total / 2) : 0) : dr.total;
            // Sanity-cap LLM-authored dice-formula damage by the same bound as hp_delta —
            // a bad/huge formula (e.g. "50d6") must not exceed the engine's HP delta cap.
            const dmg = Math.min(rawDmg, HP_DELTA_CAP);
            if (dmg > 0) { cc = { ...cc, hp: Math.max(0, cc.hp - dmg) }; extra = `ดาเมจ ${dmg}${rawDmg > dmg ? ` (ตัดจาก ${rawDmg} ตาม cap)` : ""} → HP ${cc.hp}/${cc.maxHp}`; }
          }
          rollEntry = { id: nextId(), type: "roll", title: `${ABIL_TH[rq.ability]} saving throw`, roll: r, dc: rq.dc, success: ok, extra };
          resultText = `[ผลทอย] ${rq.ability} save: ${r.total} vs DC ${rq.dc} → ${ok ? "สำเร็จ" : "ล้มเหลว"}${extra ? " " + extra : ""}. บรรยายผลต่อ`;
        }
        if (rollEntry) {
          entries.push(rollEntry);
          setLog([...baseLog, ...entries]);
          hist = [...hist, { role: "user", content: resultText }];
          const res2 = await callDM(buildPrompt(cc, getPacingForPrompt()), hist);
          hist = [...hist, { role: "assistant", content: JSON.stringify(res2) }];
          entries.push(entryNarration(res2.narration));
          cc = applyUpdates(res2.updates, cc, entries);
          sc = res2.scene || sc;
          mp = applyWorldMap(res2.world_map, mp, (t) => entries.push(entrySystem(t)));
          mp = applyMapUpdate(res2.map_update, mp, (t) => entries.push(entrySystem(t)));
          applyDungeonUpdates(res2, entries);
          if (mp && mp.current && mp.nodes[mp.current]) mp.nodes[mp.current].visited = true;
          if (res2.start_combat && res2.start_combat.monsters) cb = await initCombat(res2.start_combat.monsters, cc, entries, res2.start_combat.surprise);
        }
      }
      if (!cb && res.start_combat) {
        // Normalize: DM sometimes sends `true` (boolean) instead of { monsters: [...] }
        // Auto-recover by detecting combat intent from narration keywords
        let combatMonsters: string[] | null = null;
        let combatSurprise = false;
        if (res.start_combat.monsters && Array.isArray(res.start_combat.monsters)) {
          combatMonsters = res.start_combat.monsters;
          combatSurprise = !!res.start_combat.surprise;
        } else if (res.start_combat === true || (typeof res.start_combat === "object" && !res.start_combat.monsters)) {
          // Try to detect monster names from narration (best-effort recovery)
          // Include BOTH English (kebab-case monster ids) AND Thai common names
          const narrationLower = (res.narration || "").toLowerCase();
          // Map: Thai name → SRD/Open5e monster id (kebab-case)
          const thaiMonsterMap: Record<string, string> = {
            "ก็อบลิน": "goblin", "กอบลิน": "goblin",
            "หมาป่า": "wolf", "wolf": "wolf",
            "โคบอลด์": "kobold", "kobold": "kobold",
            "โจร": "bandit", "bandit": "bandit",
            "โครงกระดูก": "skeleton", "skeleton": "skeleton",
            "ซอมบี้": "zombie", "zombie": "zombie", "ศพเดินได้": "zombie",
            "ออร์ค": "orc", "orc": "orc",
            "กุล": "ghoul", "ghoul": "ghoul",
            "แมงมุม": "giant-spider", "spider": "giant-spider",
            "หมี": "brown-bear", "bear": "brown-bear",
            "หนู": "rat", "rat": "rat",
            "อันธพาล": "thug", "thug": "thug",
            "อัศวิน": "knight", "knight": "knight",
            "ทหารผ่านศึก": "veteran", "veteran": "veteran",
            "ผี": "ghost", "ghost": "ghost",
            "ปีศาจ": "imp", "imp": "imp",
            "มังกร": "young-red-dragon",
            "โอเกอร์": "ogre", "ogre": "ogre",
            "ทรอลล์": "troll", "troll": "troll",
            "ฮาร์ปี้": "harpy", "harpy": "harpy",
            "แวมไพร์": "vampire-spawn",
            "ลิช": "lich", "lich": "lich",
            "มนุษย์กิ้งก่า": "lizardfolk",
            "เงา": "shadow", "shadow": "shadow",
          };
          const detected: string[] = [];
          // Check Thai keys (narration might be Thai)
          for (const [thaiName, monsterId] of Object.entries(thaiMonsterMap)) {
            if (res.narration.includes(thaiName) && !detected.includes(monsterId)) {
              detected.push(monsterId);
            }
          }
          // Also check English keys in lowercased narration (already covers via thaiMonsterMap above for english keys)
          if (detected.length > 0) {
            combatMonsters = detected.slice(0, 3); // limit to 3
            entries.push(entrySystem(`⚠️ DM ส่ง start_combat ไม่ครบ — engine ตรวจพบมอนสเตอร์จาก narration: ${detected.join(", ")}`));
          }
        }
        if (combatMonsters && combatMonsters.length > 0) {
          cb = await initCombat(combatMonsters, cc, entries, combatSurprise);
        }
      }

      if (cb && !cb.playerFirst) { cc = runEnemyPhase(cb, cc, entries, false, combatDeps()); cb.round += 1; }

      if (cc.hp <= 0 && !cc.dead && !cb) {
        const dsResult = resolveDeathSave(cc, entries, false, combatDeps());
        cc = dsResult.cc;
      }

      const finalLog = [...baseLog, ...entries];
      // Smart history trimming — keep first 2 (world map setup) + summary of middle + last 21.
      // Total is capped at 24 so persist()'s own hist.slice(-24) keeps the whole thing
      // (a 25-item trim would let persist drop one of the first-2 setup messages on save).
      let trimmedHist = hist;
      if (hist.length > 24) {
        const first2 = hist.slice(0, 2);
        const lastN = hist.slice(-21);
        // Build summary of skipped messages
        const skipped = hist.slice(2, -21);
        const skipSummary = skipped.map((h: any) => {
          if (h.role === "user") {
            const playerMatch = h.content.match(/Player:\s*(.+)/);
            return playerMatch ? `ผู้เล่น: "${playerMatch[1].slice(0, 80)}"` : "";
          } else if (h.role === "assistant") {
            try {
              const j = JSON.parse(h.content);
              return `DM: ${j.narration?.slice(0, 80) || ""}${j.start_combat ? " [combat]" : ""}`;
            } catch { return ""; }
          }
          return "";
        }).filter(Boolean).join(" → ");
        const summaryEntry = { role: "user" as const, content: `[SUMMARY OF PAST EVENTS: ${skipSummary}]` };
        trimmedHist = [...first2, summaryEntry, ...lastN];
      }
      mapRef.current = mp;
      setC(cc); setScene(sc); setCombat(cb); setLog(finalLog); setHistory(trimmedHist); setMap(mp);
      persist(cc, sc, finalLog, cb, trimmedHist);
    } catch (e: any) {
      setLog((prev) => [...prev, entrySystem("⚠️ DM ขัดข้อง: " + e.message + " — ลองส่งใหม่อีกครั้ง")]);
    } finally {
      setThinking(false);
    }
  }

  async function longRest() {
    if (thinking || combat) return;
    // D&D 2024: must wait at least 16 hours between Long Rests
    const lastRest = c.lastLongRestHoursAgo ?? 99;
    if (lastRest < 16) {
      setLog((prev) => [...prev, entrySystem(`⏳ ยังพักยาวไม่ได้ — D&D 2024: ต้องรออย่างน้อย 16 ชม. หลัง Long Rest ครั้งก่อน (ผ่านไป ${lastRest} ชม. แล้ว)`)]);
      return;
    }
    // Advance time by 8 hours via WorldClock adapter
    const newTime = engineAdvanceHours(8);
    const recovery = computeLongRestRecovery({
      maxHP: c.maxHp, level: c.level, exhaustionLevel: c.exhaustionLevel || 0, slotsMax: c.slotsMax,
    });
    const cc = {
      ...c, hp: recovery.hp, slots: recovery.slots, secondWindUsed: false, conditions: [],
      actionSurgeUsed: false, preserveLifeUsed: false, arcaneRecoveryUsed: false, venomUsed: false,
      deathSaves: { s: 0, f: 0 },
      hitDiceLeft: recovery.hitDiceLeft, // D&D 2024: recover ALL hit dice on long rest
      rageUsed: 0, kiUsed: 0, sorceryPoints: c.level, layOnHandsPool: c.level * 5, bardicInspirationUsed: 0,
      raging: false, mageArmor: false,
      buffs: [], // clear all buffs on long rest
      lastLongRestHoursAgo: 0, // reset rest timer
      lastShortRestHoursAgo: 0,
      exhaustionLevel: recovery.exhaustionLevel, // D&D 2024: reduce exhaustion by 1
      heroicInspiration: true, // D&D 2024: Heroic Inspiration — refresh on long rest
    };
    cc.ac = computeAC(cc);
    const entries = [
      entrySystem(`🌙 พักยาว (8 ชม.): HP เต็ม, spell slots คืน, สภาวะ/buff หายหมด, Hit Dice คืนทั้งหมด (${cc.hitDiceLeft}/${c.level})${cc.exhaustionLevel < (c.exhaustionLevel || 0) ? `, Exhaustion ลดเหลือ Lv.${cc.exhaustionLevel}` : ""}`),
      entrySystem(`⏰ เวลาผ่านไป 8 ชม. → ${gameTimeToString(newTime)}`),
    ];
    setGameTime(newTime);
    const baseLog = [...log, ...entries];
    setC(cc); setLog(baseLog);
    persist(cc, scene, baseLog, combat, history);
    narrateCombatEvent(`[Long Rest] ${cc.name} พักผ่อนเต็มคืนและตื่นขึ้นมาในตอนเช้า — รู้สึกสดชื่น HP เต็ม spell slots คืนทั้งหมด บรรยายเช้าวันใหม่สั้นๆ อย่าแนะนำให้พักอีกเพราะเพิ่งตื่นนอนมาใหม่`, cc, scene, baseLog, history);
  }

  /**
   * Task #16 — Exploration/travel turn (out of combat). Advances ~1 hour of
   * in-game time and runs a deterministic exploration turn: a random-encounter
   * check + (on a hit) an oracle random event, logged as a procedural beat so the
   * solo player gets an exploration loop without an LLM round-trip. RNG (d20 +
   * d100s) lives HERE at the UI edge; the engine (resolveExplorationTurn) is pure.
   */
  /* -------- Shop handlers (extracted from the inline ShopModal onClicks) -------- */
  function shopBuy(label: string, price: number, invItem: string, bargainKey?: string) {
    if (c.gold < price) return;
    const nc = { ...c, gold: c.gold - price, inventory: [...c.inventory, invItem] };
    setC(nc); setLog([...log, entrySystem(`🏪 ซื้อ ${label} — ${price} gp → เหลือ ${nc.gold} gp`)]);
    persist(nc, scene, [...log, entrySystem(`🏪 ซื้อ ${label} — ${price} gp`)], null, history);
    // A bargained price is spent once used — a fresh negotiation is needed next time.
    if (bargainKey) setBargainedPrices((prev) => { const next = { ...prev }; delete next[bargainKey]; return next; });
  }
  function shopBargain(key: string, basePrice: number, label: string) {
    // D&D 5e Bargaining: Persuasion check vs a price-scaled DC. Pure economy engine
    // owns the rule; the d20 roll (RNG) is injected here at the UI edge.
    const r = rollD20(skillMod(c, "persuasion"));
    const { dc: bargainDC, success, discountPct: discount, price: newPrice } = bargainOutcome(r.total, basePrice);
    setLog([...log, entrySystem(`🗣️ เจรจา ${label}: Persuasion ${r.total} vs DC ${bargainDC} → ${success ? `สำเร็จ! ลด ${discount}% → ${newPrice} gp` : `ล้มเหลว! ราคาเพิ่ม ${Math.abs(discount)}% → ${newPrice} gp`}`)]);
    setBargainedPrices((prev) => ({ ...prev, [key]: newPrice }));
  }
  function shopSell(item: string, index: number, sellPrice: number) {
    const nc = { ...c, gold: c.gold + sellPrice, inventory: c.inventory.filter((_: string, j: number) => j !== index) };
    setC(nc); setLog([...log, entrySystem(`🏪 ขาย ${item} — +${sellPrice} gp → รวม ${nc.gold} gp`)]);
    persist(nc, scene, [...log, entrySystem(`🏪 ขาย ${item} — +${sellPrice} gp`)], null, history);
  }

  function exploreAction() {
    if (thinking || combat) return;
    const d20 = () => Math.floor(Math.random() * 20) + 1;
    const d100 = () => Math.floor(Math.random() * 100) + 1;
    const turn = resolveExplorationTurn({
      hoursAdvanced: 1,
      encounterChancePer20: 6, // 30% per exploration turn
      encounterRoll: d20(),
      focusRoll: d100(), actionRoll: d100(), themeRoll: d100(),
    });
    const newTime = engineAdvanceHours(turn.hoursAdvanced);
    setGameTime(newTime);
    const entries = [
      entrySystem(turn.summary),
      entrySystem(`⏰ เวลาผ่านไป ${turn.hoursAdvanced} ชม. → ${gameTimeToString(newTime)}`),
    ];
    const baseLog = [...log, ...entries];
    setLog(baseLog);
    persist(c, scene, baseLog, combat, history);
    // On an encounter, hand the oracle beat to the DM so it can narrate/escalate
    // (mirrors how other solo beats are surfaced). No-op wording keeps it a hint,
    // not a forced combat — the DM decides how the situation unfolds.
    if (turn.encounter.triggered && turn.event) {
      narrateCombatEvent(
        `[Exploration Event] ระหว่างเดินทาง เกิดเหตุการณ์สุ่ม (oracle): ${turn.event.focusLabel} — แนวคิด "${turn.event.meaning.prompt}". บรรยายสั้น ๆ ว่าเกิดอะไรขึ้นบนเส้นทาง แล้วจบด้วยสถานการณ์ที่ผู้เล่นต้องตัดสินใจ (อาจนำไปสู่การต่อสู้ การสำรวจ หรือการเจรจา ตามความเหมาะสม)`,
        c, scene, baseLog, history,
      );
    }
  }

  function applyAsi() {
    if (asiPicks.length !== 2 || !c || !c.pendingAsi) return;
    const cc = { ...c, abilities: { ...c.abilities } };
    const oldConMod = mod(cc.abilities.con);
    asiPicks.forEach((a) => { cc.abilities[a] = Math.min(20, cc.abilities[a] + 1); });
    const newConMod = mod(cc.abilities.con);
    const entries = [entrySystem(`💪 Ability Score Improvement: ${asiPicks.map((a) => ABIL_TH[a] + " +1").join(", ")}`)];
    if (newConMod > oldConMod) {
      const diff = (newConMod - oldConMod) * cc.level;
      cc.maxHp += diff; cc.hp += diff;
      entries.push(entrySystem(`❤️ CON modifier increased → Max HP +${diff} (retroactive)`));
    }
    const oldAc = cc.ac;
    cc.ac = computeAC(cc);
    if (cc.ac !== oldAc) entries.push(entrySystem(`🛡 AC changed ${oldAc} → ${cc.ac}`));
    cc.pendingAsi -= 1;
    const finalLog = [...log, ...entries];
    setC(cc); setLog(finalLog); setAsiPicks([]);
    persist(cc, scene, finalLog, combat, history);
  }

  function chooseSubclass(subId: string) {
    if (!c) return;
    const sub = getSubclassById(subId);
    if (!sub) return;
    const cc = { ...c, subclass: subId };
    const entries = [entrySystem(`🎓 เลือก Subclass: ${sub.th}`)];
    // Grant (log) all subclass features already unlocked at the current level.
    for (let lv = 1; lv <= cc.level; lv++) {
      (sub.features?.[lv] || []).forEach((f: any) => {
        entries.push(entrySystem(`✨ ${f.th} — ${f.desc}`));
      });
    }
    cc.ac = computeAC(cc);
    const finalLog = [...log, ...entries];
    setC(cc); setLog(finalLog);
    persist(cc, scene, finalLog, combat, history);
  }

  function shortRest() {
    if (thinking || combat) return;
    if ((c.hitDiceLeft || 0) <= 0) {
      setLog((prev) => [...prev, entrySystem("⛺ ไม่มี Hit Dice เหลือ — ต้องพักยาวเพื่อฟื้นคืน")]);
      return;
    }
    const cls = CLASSES[c.cls];
    const r = rollFormula(`1d${cls.hitDie}`);
    const heal = computeShortRestHeal(r.total, mod(c.abilities.con));
    const cc: any = {
      ...c,
      hp: Math.min(c.maxHp, c.hp + heal),
      hitDiceLeft: c.hitDiceLeft - 1,
      secondWindUsed: false,
      actionSurgeUsed: false,
      preserveLifeUsed: false,
      raging: false,
      lastShortRestHoursAgo: 0, // reset short rest timer
    };
    const entries = [entrySystem(`⛺ พักสั้น (1 ชม.): ทอย Hit Die d${cls.hitDie}=${r.total} → ฟื้น ${heal} HP → ${cc.hp}/${cc.maxHp} · Hit Dice เหลือ ${cc.hitDiceLeft}/${c.level}`)];
    // Advance time by 1 hour via WorldClock adapter
    const newTime = engineAdvanceHours(1);
    setGameTime(newTime);
    entries.push(entrySystem(`⏰ เวลาผ่านไป 1 ชม. → ${gameTimeToString(newTime)}`));
    if (hasFeature(cc, "arcane_recovery") && !cc.arcaneRecoveryUsed && cc.slots.some((v: number, i: number) => v < cc.slotsMax[i])) {
      let budget = Math.ceil(cc.level / 2);
      cc.slots = cc.slots.slice();
      const recovered: string[] = [];
      for (let li = cc.slots.length - 1; li >= 0; li--) {
        const slotLv = li + 1;
        while (budget >= slotLv && cc.slots[li] < cc.slotsMax[li]) {
          cc.slots[li] += 1; budget -= slotLv; recovered.push(`Lv${slotLv}`);
        }
      }
      if (recovered.length > 0) {
        cc.arcaneRecoveryUsed = true;
        entries.push(entrySystem(`📖 Arcane Recovery: คืน spell slot ${recovered.join(", ")}`));
      }
    }
    // Reset death saves (player is at rest, stable)
    if (cc.hp > 0) cc.deathSaves = { s: 0, f: 0 };
    // Phase 2: Warlock Pact Magic refreshes on short rest (D&D 2024)
    if (refreshesOnShortRest(cc.cls) && cc.slotsMax && cc.slotsMax.length > 0) {
      cc.slots = restoreSlotsToMax(cc.slotsMax);
      entries.push(entrySystem(`🔮 Pact Magic: คืน spell slot ทั้งหมด (short rest refresh)`));
    }
    const finalLog = [...log, ...entries];
    setC(cc); setLog(finalLog);
    persist(cc, scene, finalLog, null, history);
  }

  /* -------- spellbook management -------- */
  async function openSpellBrowser() {
    setSpellBrowserOpen(true);
    setSpellBrowserLoading(true);
    try {
      const cls = CLASSES[c.cls];
      const maxLv = maxSpellLevel(c.cls, c.level);
      const all: { index: string; name: string; level: number }[] = [];
      for (let lv = 0; lv <= maxLv; lv++) {
        const indices = await getClassSpellIndices(cls.th.toLowerCase(), lv);
        for (const idx of indices) {
          // pretty-name from index
          const name = idx.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          all.push({ index: idx, name, level: lv });
        }
      }
      all.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
      setAvailableSpells(all);
    } catch (e: any) {
      setLog((prev) => [...prev, entrySystem("⚠️ Could not load spell list: " + e.message)]);
    } finally { setSpellBrowserLoading(false); }
  }

  async function viewSpellDetail(index: string) {
    setSpellDetailLoading(true);
    setSpellDetail(null);
    try {
      const sp = await fetchSpell(index, 1, c.level);
      setSpellDetail(sp);
    } catch (e: any) {
      setLog((prev) => [...prev, entrySystem("⚠️ Could not load spell: " + e.message)]);
    } finally { setSpellDetailLoading(false); }
  }

  function learnSpell(index: string) {
    if ((c.knownSpells || []).includes(index)) return;
    // Phase 4: enforce the D&D 2024 prepared/known cap via the magic engine.
    // Known casters (Bard/Sorcerer/Ranger/Warlock) hold a FIXED number of leveled
    // spells; they may only swap on level-up. Cantrips (level 0) don't count.
    const castAbil = CLASSES[c.cls]?.castAbil;
    const learningLevel = availableSpells.find((s) => s.index === index)?.level ?? 1;
    const rule = castAbil ? getSpellcastingRule(c.cls, c.level, mod(c.abilities[castAbil])) : null;
    if (castAbil && learningLevel > 0) {
      if (rule && rule.kind === "known" && rule.maxHeld > 0) {
        // Count leveled spells currently known (exclude confirmed cantrips).
        const leveledKnown = (c.knownSpells || []).filter((idx: string) => {
          const info = availableSpells.find((s) => s.index === idx);
          return info ? info.level > 0 : true;
        }).length;
        if (leveledKnown >= rule.maxHeld) {
          setLog((prev) => [...prev, entrySystem(`📕 รู้เวทครบจำนวนแล้ว (${leveledKnown}/${rule.maxHeld}) — ${CLASSES[c.cls].th} เป็น Known caster เปลี่ยนเวทได้เฉพาะตอนเลเวลอัพ`)]);
          return;
        }
      }
    }
    // Task #14: prepared casters add to the SPELLBOOK (pool). It only becomes
    // "prepared" (castable) if there's room under the prepared cap; otherwise
    // the player must re-prepare after a long rest to swap it in. Cantrips are
    // always prepared. Known casters keep prepared == spellbook.
    const spellbook = [...(c.spellbook || c.knownSpells || [])];
    if (!spellbook.includes(index)) spellbook.push(index);
    const entries = [entrySystem(`📖 Learned spell: ${index.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}`)];
    let knownSpells = c.knownSpells || [];
    const isCantrip = learningLevel === 0;
    if (rule && rule.kind === "prepared" && rule.maxHeld > 0 && !isCantrip) {
      const preparedLeveled = knownSpells.filter((idx: string) => {
        const info = availableSpells.find((s) => s.index === idx);
        return info ? info.level > 0 : true;
      }).length;
      if (preparedLeveled >= rule.maxHeld) {
        entries.push(entrySystem(`📗 เพิ่มลงสมุดเวทแล้ว แต่เตรียมเวทเต็ม (${preparedLeveled}/${rule.maxHeld}) — พักยาวแล้วกด "🔄 เตรียมเวทใหม่" เพื่อสลับเข้ามาเตรียม`));
      } else {
        knownSpells = [...knownSpells, index];
      }
    } else {
      knownSpells = [...knownSpells, index];
    }
    const cc = { ...c, knownSpells, spellbook };
    const finalLog = [...log, ...entries];
    setC(cc); setLog(finalLog);
    persist(cc, scene, finalLog, combat, history);
  }

  /**
   * Task #14: re-prepare a prepared caster's spells (Cleric/Druid/Paladin/
   * Wizard). Available at/after a long rest. The engine (magic.reprepareSpells)
   * owns the cap + which classes may swap; cantrips are always kept. `selection`
   * is the desired list of LEVELED spell indices from the spellbook.
   */
  async function openReprepare() {
    if (thinking || combat || !canReprepareOnLongRest(c.cls)) return;
    // Populate availableSpells (level info for the whole class list) so the modal
    // can tell cantrips (always prepared) from leveled spells (capped).
    if (availableSpells.length === 0) await openSpellBrowser();
    // Seed the selection with the currently-prepared leveled spells.
    const leveledPrepared = (c.knownSpells || []).filter((idx: string) => {
      const info = availableSpells.find((s) => s.index === idx);
      return info ? info.level > 0 : true;
    });
    setReprepareSel(leveledPrepared);
    setReprepareOpen(true);
  }

  function commitReprepare(selection: string[]) {
    const castAbil = CLASSES[c.cls]?.castAbil;
    if (!castAbil || !canReprepareOnLongRest(c.cls)) { setReprepareOpen(false); return; }
    const spellbook: string[] = c.spellbook || c.knownSpells || [];
    // Cantrips (level 0) are always prepared and never counted against the cap.
    const isCantripIdx = (idx: string) => {
      const info = availableSpells.find((s) => s.index === idx);
      return info ? info.level === 0 : false;
    };
    const cantrips = (c.knownSpells || []).filter(isCantripIdx);
    // Only LEVELED spells are managed by the cap; drop any cantrip that leaked in.
    const desiredLeveled = selection.filter((idx) => !isCantripIdx(idx));
    const res = reprepareSpells(c.cls, c.level, mod(c.abilities[castAbil]), spellbook, desiredLeveled);
    if (!res.ok) { setReprepareOpen(false); return; }
    const knownSpells = [...cantrips.filter((x: string) => !res.prepared.includes(x)), ...res.prepared];
    const cc = { ...c, knownSpells };
    const entries = [entrySystem(`🔄 เตรียมเวทใหม่: ${res.reasonTh} — เตรียม ${res.prepared.length} เวท`)];
    const finalLog = [...log, ...entries];
    setC(cc); setLog(finalLog); setReprepareOpen(false);
    persist(cc, scene, finalLog, combat, history);
  }

  /* -------- Task #14: sidekick companion -------- */
  function recruitSidekick(config: { baseKey: string; klass: SidekickClass } | null) {
    if (!c) return;
    const cc: any = { ...c };
    if (config && SIDEKICK_BASES[config.baseKey]) {
      cc.sidekick = { baseKey: config.baseKey, klass: config.klass, level: Math.max(1, Math.min(10, c.level || 1)) };
    } else {
      delete cc.sidekick;
    }
    const entries = [entrySystem(config ? `🐕 รับสหาย: ${SIDEKICK_BASES[config!.baseKey]?.name} (${config!.klass})` : "🐾 ปลดสหายแล้ว")];
    const finalLog = [...log, ...entries];
    setC(cc); setLog(finalLog); setRecruitOpen(false);
    persist(cc, scene, finalLog, combat, history);
  }

  /* -------- new game flow -------- */
  // Quick-start with a pre-made character
  async function quickStart(cls: string) {
    const presets: Record<string, { name: string; race: string; bg: string; abilities: any; skills: string[]; expertise?: string[]; spells?: string[] }> = {
      fighter: { name: "Thorin", race: "dwarf", bg: "soldier", abilities: { str: 16, dex: 12, con: 15, int: 10, wis: 10, cha: 10 }, skills: ["athletics", "intimidation", "perception"] },
      rogue: { name: "Sylas", race: "halfling", bg: "criminal", abilities: { str: 8, dex: 16, con: 13, int: 12, wis: 10, cha: 12 }, skills: ["stealth", "perception", "investigation", "acrobatics"], expertise: ["stealth"] },
      wizard: { name: "Elara", race: "elf", bg: "sage", abilities: { str: 8, dex: 14, con: 13, int: 16, wis: 12, cha: 10 }, skills: ["arcana", "investigation", "perception"], spells: ["fire-bolt", "mage-armor", "magic-missile", "shield"] },
    };
    const p = presets[cls];
    if (!p) return;
    const cc = makeCharacter(p.name, p.race, cls, p.bg, {
      abilities: p.abilities,
      extraSkills: p.skills,
      expertise: p.expertise || [],
      knownSpells: p.spells || [],
    });
    cRef.current = cc; combatRef.current = null;
    const arc = createStoryArc({
      id: `arc_${Date.now()}`, title: `Campaign of ${cc.name}`,
      description: `${RACES[p.race].th} ${CLASSES[cls].th} adventure`, themes: ["adventure", "discovery"],
    });
    setNarrativeEngine({ arc, currentScene: null, sceneHistory: [], branches: { branches: {}, activeBranches: new Set(), completedBranches: new Set(), flags: {} }, consequences: { consequences: [], pendingDelayed: [] }, pacing: { currentTension: "calm", recentTensions: [], recommendedNextTension: "low", scenesSinceRest: 0, scenesSinceCombat: 0, scenesSinceRevelation: 0, pacingNotes: [] }, foreshadows: { items: {} }, themes: { themes: { adventure: { occurrences: 0, intensity: 0.5 }, discovery: { occurrences: 0, intensity: 0.5 } } } } as NarrativeEngine);
    setC(cc); setScene(""); setLog([]); setCombat(null); setHistory([]); setMap(null);
    setPhase("play");
    // Show onboarding on first play
    if (!localStorage.getItem("dnd_solo_onboarded")) {
      setOnboardStep(0);
      localStorage.setItem("dnd_solo_onboarded", "1");
    }
    setThinking(true);
    try {
      const hist = [{ role: "user", content: `[เริ่มแคมเปญใหม่] สร้างฉากเปิดที่น่าติดตามสำหรับ ${cc.name} (${RACES[p.race].th} ${CLASSES[cls].th} level 1, ภูมิหลัง ${BACKGROUNDS[p.bg].th}). เริ่มในเมืองเล็กหรือโรงเตี๊ยมพร้อม hook ภารกิจแรก ทำให้ภูมิหลังมีผลกับฉากเปิด\n\nสำคัญมาก: ต้องใช้ฟิลด์ "world_map" ใน response แรกนี้เพื่อสร้างแผนที่โลกที่สมบูรณ์ — เมืองเริ่มต้นเป็น hub + สถานที่รอบๆ 3-5 แห่ง (ร้านค้า, โรงเตี๊ยม, วัด) + พื้นที่ป่า/ถนน 2-3 แห่ง + ดันเจี้ยน/ซากปรักหักพัง/ถ้ำ 2-3 แห่ง เชื่อมด้วยทิศ (n/s/e/w/ne/nw/se/sw) ใช้ id snake_case ภาษาอังกฤษคงที่ ผู้เล่นจะเห็นสถานที่ทั้งหมดบนแผนที่ (มี fog-of-war สำหรับที่ยังไม่ไป)` }];
      const res = await callDM(buildPrompt(cc, getPacingForPrompt()), hist);
      let entries: any[] = [entryNarration(res.narration)];
      logValidationWarnings(res, entries);
      let nc = applyUpdates(res.updates, cc, entries);
      let sc = res.scene || "";
      let mp = applyWorldMap(res.world_map, null, (t) => entries.push(entrySystem(t)));
      mp = applyMapUpdate(res.map_update, mp, (t) => entries.push(entrySystem(t)));
      applyDungeonUpdates(res, entries);
      if (mp && mp.current && mp.nodes[mp.current]) mp.nodes[mp.current].visited = true;
      mapRef.current = mp;
      let ncb: any = null;
      if (res.start_combat && res.start_combat.monsters) {
        ncb = await initCombat(res.start_combat.monsters, nc, entries, res.start_combat.surprise);
      }
      const finalHist = [...hist, { role: "assistant", content: JSON.stringify(res) }];
      const finalLog = [...entries];
      if (ncb && !ncb.playerFirst) { nc = runEnemyPhase(ncb, nc, finalLog, false, combatDeps()); ncb.round += 1; }
      setC(nc); setScene(sc); setLog(finalLog); setCombat(ncb); setHistory(finalHist); setMap(mp);
      persist(nc, sc, finalLog, ncb, finalHist);
    } catch (e: any) {
      setLog([entrySystem("⚠️ DM ขัดข้อง: " + e.message + " — ลองส่งใหม่อีกครั้ง")]);
    } finally { setThinking(false); }
  }

  async function startNewGame(cc: any) {
    cRef.current = cc; combatRef.current = null;
    // AI DM Layer: initialize narrative engine for this campaign (Domain 33)
    const arc = createStoryArc({
      id: `arc_${Date.now()}`,
      title: `Campaign of ${cc.name}`,
      description: `${RACES[cc.race].th} ${CLASSES[cc.cls].th} adventure`,
      themes: ["adventure", "discovery"],
      estimatedLength: 20,
    });
    setNarrativeEngine({ arc, currentScene: null, sceneHistory: [], branches: { branches: {}, activeBranches: new Set(), completedBranches: new Set(), flags: {} }, consequences: { consequences: [], pendingDelayed: [] }, pacing: { currentTension: "calm", recentTensions: [], recommendedNextTension: "low", scenesSinceRest: 0, scenesSinceCombat: 0, scenesSinceRevelation: 0, pacingNotes: [] }, foreshadows: { items: {} }, themes: { themes: { adventure: { occurrences: 0, intensity: 0.5 }, discovery: { occurrences: 0, intensity: 0.5 } } } });
    const entries = [entrySystem(`สร้างตัวละคร: ${cc.name} — ${RACES[cc.race].th} ${CLASSES[cc.cls].th} (${BACKGROUNDS[cc.background].th}) · HP ${cc.hp} · AC ${cc.ac}`)];
    setC(cc); setLog(entries); setCombat(null); setScene(""); setHistory([]);
    setPhase("play");
    setThinking(true);
    try {
      const hist = [{ role: "user", content: `[เริ่มแคมเปญใหม่] สร้างฉากเปิดที่น่าติดตามสำหรับ ${cc.name} (${RACES[cc.race].th} ${CLASSES[cc.cls].th} level 1, ภูมิหลัง ${BACKGROUNDS[cc.background].th}). เริ่มในเมืองเล็กหรือโรงเตี๊ยมพร้อม hook ภารกิจแรก ทำให้ภูมิหลังมีผลกับฉากเปิด\n\nสำคัญมาก: ต้องใช้ฟิลด์ "world_map" ใน response แรกนี้เพื่อสร้างแผนที่โลกที่สมบูรณ์ — เมืองเริ่มต้นเป็น hub + สถานที่รอบๆ 3-5 แห่ง (ร้านค้า, โรงเตี๊ยม, วัด) + พื้นที่ป่า/ถนน 2-3 แห่ง + ดันเจี้ยน/ซากปรักหักพัง 2-3 แห่ง เชื่อมด้วยทิศ (n/s/e/w/ne/nw/se/sw) ใช้ id snake_case ภาษาอังกฤษคงที่ ผู้เล่นจะเห็นสถานที่ทั้งหมดบนแผนที่ (มี fog-of-war สำหรับที่ยังไม่ไป)` }];
      const res = await callDM(buildPrompt(cc, getPacingForPrompt()), hist);
      const newHist = [...hist, { role: "assistant", content: JSON.stringify(res) }];
      const e2 = [...entries, entryNarration(res.narration)];
      const sc = res.scene || "จุดเริ่มต้น";
      // Process world_map first (full world pre-generation), then any single map_update
      let mp = applyWorldMap(res.world_map, null, (t) => e2.push(entrySystem(t)));
      mp = applyMapUpdate(res.map_update, mp, (t) => e2.push(entrySystem(t)));
      applyDungeonUpdates(res, e2);
      if (!mp || !mp.current) {
        mp = emptyMap();
        mp.nodes.start = { name: sc, type: "town", x: 0, y: 0, visited: true };
        mp.current = "start";
      }
      // Mark current as visited
      if (mp.current && mp.nodes[mp.current]) mp.nodes[mp.current].visited = true;
      mapRef.current = mp;
      // Apply updates (items, conditions, buffs)
      let finalCc = cc;
      if (res.updates) finalCc = applyUpdates(res.updates, cc, e2);
      // Task #16: seed the Session-Zero starting situation as the first campaign
      // facts (place + bond NPC) so continuity carries from turn one. Only when the
      // player actually authored a starting situation (else nothing to seed).
      const sz0 = sessionZeroRef.current;
      if (hasStartingSituation(sz0)) {
        rememberFact("place", "sz_start_location", sz0.situation.location, sz0.situation.hook);
        e2.push(entrySystem(`🎭 จุดเริ่มต้น (Session Zero): ${sz0.situation.location} — ${sz0.situation.hook}`));
      }
      if (sz0.situation.bondNpc.name) {
        rememberFact("npc", "sz_bond_npc", sz0.situation.bondNpc.name, sz0.situation.bondNpc.relationship);
      }
      setLog(e2); setScene(sc); setHistory(newHist); setMap(mp); setC(finalCc);
      persist(finalCc, sc, e2, null, newHist);
      setHasSave(true);
    } catch (e: any) {
      setLog((prev) => [...prev, entrySystem("⚠️ เริ่มแคมเปญไม่สำเร็จ: " + e.message)]);
    } finally { setThinking(false); }
  }

  async function continueGame() {
    const save = await loadGame();
    if (!save) return;
    const cc = save.c ? migrateChar(save.c) : null;
    const mp = save.map || null;
    mapRef.current = mp;
    cRef.current = cc; combatRef.current = save.combat || null; logDataRef.current = save.log || [];
    // Restore dungeon blueprint + run state (Domain 36)
    const loadedBlueprint = (save as any).dungeonBlueprint || null;
    const loadedRun = (save as any).dungeonRun || null;
    dungeonBlueprintRef.current = loadedBlueprint;
    dungeonRunRef.current = loadedRun;
    setDungeonBlueprint(loadedBlueprint);
    setDungeonRun(loadedRun);
    if (save.quests) setQuests(save.quests);
    // Phase 5: restore campaign memory and mark a NEW play session (continuity across sessions).
    const restoredMem = startNewSession(normalizeCampaignMemory((save as any).campaignMemory));
    campaignMemoryRef.current = restoredMem;
    setCampaignMemory(restoredMem);
    // Task #16: restore the Session-Zero charter (default if the save predates it).
    const restoredSz = normalizeSessionZero((save as any).sessionZeroConfig);
    sessionZeroRef.current = restoredSz;
    setSessionZeroConfig(restoredSz);
    setC(cc); setScene(save.scene); setLog(save.log || []); setCombat(save.combat || null); setHistory(save.history || []); setMap(mp);
    idRef.current = Math.max(0, ...(save.log || []).map((e: any) => e.id || 0));
    setPhase(cc && cc.dead ? "dead" : "play");
  }

  async function resetAll() {
    await deleteSave();
    mapRef.current = null;
    cRef.current = null; combatRef.current = null; logDataRef.current = [];
    dungeonBlueprintRef.current = null;
    dungeonRunRef.current = null;
    const freshMem = createCampaignMemory();
    campaignMemoryRef.current = freshMem;
    setCampaignMemory(freshMem);
    const freshSz = createDefaultSessionZero();
    sessionZeroRef.current = freshSz;
    setSessionZeroConfig(freshSz);
    setHasSave(false); setC(null); setLog([]); setCombat(null); setHistory([]); setScene(""); setMap(null);
    setDungeonBlueprint(null); setDungeonRun(null);
    setPhase("menu");
  }

  /* ---------------- RENDER ---------------- */
  if (phase === "loading") {
    return (<div className="dnd-root"><div style={{ margin: "auto", color: "#8A7F9E" }}>Loading...</div></div>);
  }

  if (phase === "menu") {
    return (
      <div className="dnd-root">

        <div style={{ margin: "auto", textAlign: "center", padding: 24, maxWidth: 480, width: "100%" }}>
          <div className="dnd-display" style={{ fontSize: 15, color: "#E0A83E" }}>แคมเปญเดี่ยว · 2024 SRD</div>
          <h1 className="dnd-display" style={{ fontSize: 40, margin: "6px 0 4px", color: "#EAE0CC" }}>D&amp;D 5e</h1>
          <div style={{ color: "#8A7F9E", fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
            AI เป็น DM · engine บังคับกฎ RAW<br/>
            <span style={{ color: "#B9A96A" }}>12 คลาส · 9+ เผ่าพันธุ์ · 1,955 เวทมนตร์ · 3,541+ มอนสเตอร์ · 2,319 magic items · 15 สภาวะ</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {hasSave && <button className="btn btn-gold" style={{ padding: 14 }} onClick={continueGame}>▶ เล่นต่อจากเซฟ</button>}
            <button className="btn" style={{ padding: 14 }} onClick={() => setPhase("create")}>✦ เริ่มแคมเปญใหม่</button>
            <button className="btn" style={{ padding: "10px 14px", fontSize: 13 }} onClick={() => setSessionZeroOpen(true)}>
              🎭 Session Zero (ไม่บังคับ){isDefaultSessionZero(sessionZeroConfig) ? "" : " ✓"}
            </button>
            {/* Quick-start sample characters */}
            <div style={{ borderTop: "1px solid #3A3054", paddingTop: 12, marginTop: 4 }}>
              <div style={{ fontSize: 11, color: "#8A7F9E", marginBottom: 8 }}>⚡ เริ่มเล่นทันที:</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" style={{ flex: 1, fontSize: 12, padding: 10 }} onClick={() => quickStart("fighter")}>⚔️ นักรบ</button>
                <button className="btn" style={{ flex: 1, fontSize: 12, padding: 10 }} onClick={() => quickStart("rogue")}>🗡️ โจร</button>
                <button className="btn" style={{ flex: 1, fontSize: 12, padding: 10 }} onClick={() => quickStart("wizard")}>🔮 พ่อมด</button>
              </div>
            </div>
            <button className="btn" onClick={async () => {
              const s = await loadGame();
              setIoText(s ? JSON.stringify(s) : "");
              setIoMsg(s ? "เซฟปัจจุบัน — คัดลอกเก็บเป็นสำรอง หรือวางเซฟอื่นทับแล้วกดนำเข้า" : "ยังไม่มีเซฟ — วาง JSON ที่ส่งออกจากเวอร์ชันอื่นแล้วกดนำเข้า");
              setIoOpen(true);
            }}>💾 ส่งออก / นำเข้าเซฟ</button>
            <button className="btn" onClick={async () => {
              const s = await loadGame();
              if (!s) { alert("ยังไม่มีเซฟ — เริ่มเกมใหม่ก่อนแล้วบันทึก"); return; }
              const charName = (s.c?.name || "character").replace(/[^\w\-]+/g, "_");
              const dateStr = new Date().toISOString().slice(0, 10);
              const filename = `dnd_save_${charName}_${dateStr}.json`;
              const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = filename;
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}>⬇️ ดาวน์โหลดเซฟเป็นไฟล์ .json</button>
            {hasSave && <button className="btn btn-red" onClick={resetAll}>ลบเซฟทั้งหมด</button>}
          </div>
          <div style={{ fontSize: 11, marginTop: 16, color: srdStatus === "online" ? "#7FB069" : "#6B6284" }}>
            {srdStatus === "checking" ? "🌐 กำลังเช็ค Open5e API..." : srdStatus === "online" ? "🌐 Open5e v2 (2024 SRD 5.2 + 2014 SRD 5.1): เชื่อมต่อแล้ว — เวทมนตร์ 1,955 + มอนสเตอร์ 3,541 + magic items 2,319" : "🌐 SRD API: เข้าถึงไม่ได้ — ใช้ bestiary ภายในเครื่อง"}
          </div>
          {ioOpen && (
            <div className="sheet-overlay" onClick={() => setIoOpen(false)}>
              <div className="sheet-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
                <div style={{ padding: 16, textAlign: "left" }}>
                  <div className="dnd-display" style={{ fontSize: 17, color: "#E0A83E", marginBottom: 6 }}>💾 ส่งออก / นำเข้าเซฟ</div>
                  <div style={{ fontSize: 12, color: "#8A7F9E", marginBottom: 10 }}>{ioMsg}</div>
                  <textarea
                    value={ioText}
                    onChange={(e) => setIoText(e.target.value)}
                    placeholder='วาง JSON เซฟที่นี่'
                    style={{ width: "100%", boxSizing: "border-box", height: 150, background: "#1B1530", border: "1px solid #4A3F6E", borderRadius: 10, color: "#EAE0CC", padding: 10, fontSize: 11, fontFamily: "monospace", outline: "none", resize: "vertical" }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button className="btn" disabled={!ioText} onClick={async () => {
                      try { await navigator.clipboard.writeText(ioText); setIoMsg("✅ คัดลอกแล้ว"); }
                      catch { setIoMsg("คัดลอกไม่สำเร็จ — เลือกทั้งหมดเอง"); }
                    }}>📋 คัดลอก</button>
                    <button className="btn btn-gold" style={{ flex: 1 }} disabled={!ioText.trim()} onClick={async () => {
                      try {
                        const data = JSON.parse(ioText.trim());
                        if (!data || !data.c || !data.c.name || !CLASSES[data.c.cls]) throw new Error("เซฟไม่ถูกต้อง");
                        data.c = migrateChar(data.c);
                        await saveGame(data);
                        setHasSave(true);
                        setIoMsg(`✅ นำเข้าเซฟของ ${data.c.name} (Lv.${data.c.level}) สำเร็จ`);
                      } catch (e: any) { setIoMsg("⚠️ นำเข้าไม่สำเร็จ: " + e.message); }
                    }}>📥 นำเข้า</button>
                    <button className="btn" onClick={() => setIoOpen(false)}>ปิด</button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {<SessionZeroModal open={sessionZeroOpen} config={sessionZeroConfig} onClose={() => setSessionZeroOpen(false)} editSz={editSz} lineInput={szLineInput} setLineInput={setSzLineInput} veilInput={szVeilInput} setVeilInput={setSzVeilInput} />}
        </div>
      </div>
    );
  }

  if (phase === "create") {
    return <CharacterCreation onComplete={startNewGame} onCancel={() => setPhase("menu")} />;
  }

  if (phase === "dead") {
    return (
      <div className="dnd-root">

        <div style={{ margin: "auto", textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 56 }}>☠️</div>
          <h1 className="dnd-display" style={{ color: "#C74B44" }}>ตำนานของ{c ? c.name : "ฮีโร่"} จบลงแล้ว</h1>
          <div style={{ color: "#8A7F9E", marginBottom: 20 }}>{c ? `Level ${c.level} · ${c.xp} XP` : ""}</div>
          <button className="btn btn-gold" onClick={resetAll}>เริ่มตำนานบทใหม่</button>
        </div>
      </div>
    );
  }

  /* ---- PLAY ---- */
  const cls = c ? CLASSES[c.cls] : null;
  const downed = c && c.hp <= 0 && !c.dead;
  const meleeW = c ? getMelee(c) : null;
  const rangedW = c ? getRanged(c) : null;
  const combatItems = c ? c.inventory.filter((it: string) => CONSUMABLES[it] && CONSUMABLES[it].combat) : [];
  const maxSpellLv = c && cls && cls.caster ? maxSpellLevel(c.cls, c.level) : 0;
  const knownSpellsList = c?.knownSpells || [];
  // Build "known spell + cantrips" grouped by level for combat UI
  const knownSpellsByLevel: { level: number; indices: string[] }[] = [];
  if (c && cls?.caster) {
    for (let lv = 0; lv <= maxSpellLv; lv++) {
      const indices = knownSpellsList.filter((idx: string) => {
        // We need to know the level — but fetching each is expensive. We'll trust the SRD index naming convention for now.
        // For simplicity, group all known spells under their actual level after fetch. We'll display flat list instead.
        return true;
      });
      if (lv === 0) knownSpellsByLevel.push({ level: 0, indices });
    }
  }

  return (
    <div className="dnd-root">

      {/* ONBOARDING OVERLAY (P3.3) — first-time player guide */}
      {onboardStep >= 0 && onboardStep <= 3 && (
        <div className="onboarding-overlay" onClick={() => setOnboardStep(-1)}>
          <div className="onboarding-card" onClick={(e) => e.stopPropagation()}>
            {onboardStep === 0 && (
              <>
                <div className="onboarding-icon">🎲</div>
                <div className="onboarding-title">ยินดีต้อนรับสู่ D&D Solo!</div>
                <div className="onboarding-text">
                  คุณจะเล่นเป็นตัวละครในโลกแฟนตาซี AI เป็น Dungeon Master (DM) เล่าเรื่องและเล่นเป็น NPC ทุกตัว ส่วน engine เป็นคนทอยลูกเต๋าและคำนวณกฎ D&D 2024 ให้คุณ
                </div>
              </>
            )}
            {onboardStep === 1 && (
              <>
                <div className="onboarding-icon">💬</div>
                <div className="onboarding-title">พิมพ์เพื่อเล่น</div>
                <div className="onboarding-text">
                  พิมพ์สิ่งที่ตัวละครจะทำในช่องด้านล่าง เช่น "สำรวจรอบๆ", "คุยกับพ่อค้า", "โจมตีกอบลิน" หรือกดปุ่มลัดด้านบนช่องพิมพ์ก็ได้ DM จะตอบเป็นน้ำเสียงภาษาไทย
                </div>
              </>
            )}
            {onboardStep === 2 && (
              <>
                <div className="onboarding-icon">⚔️</div>
                <div className="onboarding-title">การต่อสู้</div>
                <div className="onboarding-text">
                  เมื่อ DM เริ่มการต่อสู้ จะมีกริด 12×10 ปรากฏขึ้น กดพื้นเขียวเพื่อเคลื่อนที่ กดปุ่มโจมตีเพื่อตีศัตรู engine จะทอยลูกเต๋าให้อัตโนมัติ รวมถึงคำนวณดาเมจ AC HP และสภาวะต่างๆ
                </div>
              </>
            )}
            {onboardStep === 3 && (
              <>
                <div className="onboarding-icon">📜</div>
                <div className="onboarding-title">ตัวละครของคุณ</div>
                <div className="onboarding-text">
                  กดปุ่ม 📜 เพื่อดูสถานะตัวละคร — ค่าสถานะ สกิล เวทมนตร์ ไอเทม และความสามารถ กด ☰ เพิ่มเติม เพื่อเปิดร้านค้า AI DM Helper และ Content Manager
                </div>
              </>
            )}
            <div className="onboarding-dots">
              {[0,1,2,3].map(i => (
                <div key={i} className={"onboarding-dot" + (i === onboardStep ? " active" : "")} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {onboardStep > 0 && <button className="btn" style={{ flex: 1 }} onClick={() => setOnboardStep(onboardStep - 1)}>ย้อน</button>}
              {onboardStep < 3 ? (
                <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => setOnboardStep(onboardStep + 1)}>ถัดไป →</button>
              ) : (
                <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => setOnboardStep(-1)}>เริ่มเล่น! ⚔️</button>
              )}
            </div>
            {onboardStep < 3 && <button className="btn" style={{ marginTop: 8, fontSize: 12, color: "#8A7F9E" }} onClick={() => setOnboardStep(-1)}>ข้าม</button>}
          </div>
        </div>
      )}

      {/* HEADER */}
      {/* HEADER — Phase 6: compact 2-row layout (was: cluttered 15+ items in one row) */}
      <div style={{ padding: "8px 14px", borderBottom: "1px solid #3A3054", background: "rgba(20,16,32,0.9)", position: "sticky", top: 0, zIndex: 10, paddingTop: "max(8px, env(safe-area-inset-top))" }}>
        {/* Row 1: name + level + buttons (compact) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <span className="dnd-display" style={{ fontSize: 16, color: "#E0A83E", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
            <span style={{ fontSize: 11, color: "#8A7F9E", whiteSpace: "nowrap" }}>Lv.{c.level} {cls.th}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setSheetOpen(true)}>📜</button>
            <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setMapOpen(true)}>🗺️</button>
            {dungeonBlueprint && (
              <button className="btn" style={{ padding: "4px 8px", fontSize: 12, background: "#3A2F5C", borderColor: "#E0A83E" }} onClick={() => setDungeonMapOpen(true)}>🏰{dungeonRun?.roomsCleared || 0}/{dungeonRun?.totalRooms || 0}</button>
            )}
            {quests.filter(q => q.status === "active").length > 0 && (
              <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setQuestJournalOpen(true)}>📜{quests.filter(q => q.status === "active").length}</button>
            )}
            <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setMoreMenuOpen(true)}>☰</button>
          </div>
        </div>
        {/* Row 2: HP bar + AC + gold (always visible) */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}><HPBar hp={c.hp} maxHp={c.maxHp} /></div>
          <div style={{ fontSize: 12, color: "#C9BFE0", whiteSpace: "nowrap" }}>🛡{c.ac} · 💰{c.gold}</div>
        </div>
        {/* Row 3 (compact, small): scene + time + status effects only */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3, flexWrap: "wrap", fontSize: 10, color: "#8A7F9E" }}>
          <span>📍 {scene || "—"}</span>
          <span>⏰ {gameTimeToString(gameTime)}</span>
          {c?.weather && <span style={{ color: "#6B9BD2" }}>🌤️{c.weather}</span>}
          {c?.exhaustionLevel > 0 && <span style={{ color: "#C74B44" }}>😮‍💨{c.exhaustionLevel}</span>}
          {c?.sceneType && c.sceneType !== "exploration" && <span style={{ color: "#E0A83E" }}>🎬{c.sceneType}</span>}
          {c.raging && <span style={{ color: "#E08E4F" }}>🔥Rage</span>}
          {c.conditions.length > 0 && <span style={{ color: "#C9A0DC" }}>{c.conditions.map((cd: string) => CONDITIONS_TH[cd]?.split(" (")[0] || cd).join(",")}</span>}
        </div>
        {/* Row 4: spell slots (casters only) */}
        {cls.caster && (
          <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            {c.slotsMax.map((max: number, li: number) => (
              <span key={li} style={{ fontSize: 10, color: "#6FB3AB" }}>
                Lv{li + 1}: {Array.from({ length: max }).map((_, i) => (<span key={i} className={"slotpip " + (i < c.slots[li] ? "full" : "used")} />))}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* LOG */}
      <AdventureLog log={log} thinking={thinking} logRef={logRef} onScroll={handleLogScroll} />

      {/* ASI + SUBCLASS level-up modals */}
      <AsiModal open={(c?.pendingAsi ?? 0) > 0} abilities={c?.abilities ?? {}} picks={asiPicks} setPicks={setAsiPicks} onConfirm={applyAsi} />
      <SubclassModal open={!!(c && !combat && !c.pendingAsi && needsSubclassChoice(c.cls, c.level, c.subclass))} cls={c?.cls ?? ""} level={c?.level ?? 1} onChoose={chooseSubclass} />

      {/* RE-PREPARE + COMPANION modals */}
      <ReprepareModal open={reprepareOpen} c={c} availableSpells={availableSpells} sel={reprepareSel} setSel={setReprepareSel} onCommit={commitReprepare} onClose={() => setReprepareOpen(false)} />
      <CompanionModal open={recruitOpen && !!c && !combat} sidekick={c?.sidekick} onClose={() => setRecruitOpen(false)} onRecruit={recruitSidekick} />

      {/* MORE MENU — secondary actions (Shop, AI DM, Content) */}
      {moreMenuOpen && !combat && (
        <div className="sheet-overlay" onClick={() => setMoreMenuOpen(false)}>
          <div className="sheet-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
              <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>☰ เพิ่มเติม</span>
              <button className="btn" style={{ padding: "4px 12px" }} onClick={() => setMoreMenuOpen(false)}>✕</button>
            </div>
            <div className="sheet-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "12px 14px" }}
                onClick={() => { setShopOpen(true); setMoreMenuOpen(false); }}>
                🏪 ร้านค้า — ซื้อขายอาวุธ เกราะ ของวิเศษ ยา
              </button>
              <button className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "12px 14px" }}
                onClick={() => { setOracleOpen(true); setMoreMenuOpen(false); }}>
                🔮 ถามออราเคิล — ตัดสินความไม่แน่นอนแบบ solo (ไม่ต้องรอ DM)
              </button>
              <button className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "12px 14px" }}
                onClick={() => { setSessionZeroOpen(true); setMoreMenuOpen(false); }}>
                🎭 Session Zero — โทน, safety tools, น้ำหนักสามเสาหลัก
              </button>
              <button className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "12px 14px" }}
                onClick={() => { setDmHelperOpen(true); setMoreMenuOpen(false); }}>
                🤖 AI DM Helper — ดูสถานะ engine, intent, narrative
              </button>
              <button className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "12px 14px" }}
                onClick={() => { setContentManagerOpen(true); setMoreMenuOpen(false); }}>
                📦 Content Manager — import/export homebrew
              </button>
              <button className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "12px 14px" }}
                onClick={() => { setRecruitOpen(true); setMoreMenuOpen(false); }}>
                🐕 สหายร่วมทาง {c?.sidekick ? `— ${SIDEKICK_BASES[c.sidekick.baseKey]?.name}` : "— รับสหายช่วยรบ"}
              </button>
              <button className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "12px 14px" }}
                onClick={() => { setIoOpen(true); setMoreMenuOpen(false); }}>
                💾 บันทึก / โหลด / ส่งออก
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MORE MENU — during combat (limited actions) */}
      {moreMenuOpen && combat && (
        <div className="sheet-overlay" onClick={() => setMoreMenuOpen(false)}>
          <div className="sheet-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
              <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>☰ เพิ่มเติม</span>
              <button className="btn" style={{ padding: "4px 12px" }} onClick={() => setMoreMenuOpen(false)}>✕</button>
            </div>
            <div className="sheet-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: "#8A7F9E", textAlign: "center", padding: 10 }}>ร้านค้าและบางฟีเจอร์ไม่พร้อมใช้ระหว่างการต่อสู้</div>
              <button className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "12px 14px" }}
                onClick={() => { setDmHelperOpen(true); setMoreMenuOpen(false); }}>
                🤖 AI DM Helper
              </button>
              <button className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "12px 14px" }}
                onClick={() => { setSheetOpen(true); setMoreMenuOpen(false); }}>
                📜 ตัวละคร
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SESSION ZERO MODAL — Task #16 campaign charter (deterministic engine: src/lib/engine/sessionZero.ts) */}
      {<SessionZeroModal open={sessionZeroOpen} config={sessionZeroConfig} onClose={() => setSessionZeroOpen(false)} editSz={editSz} lineInput={szLineInput} setLineInput={setSzLineInput} veilInput={szVeilInput} setVeilInput={setSzVeilInput} />}

      {/* ORACLE MODAL — Phase 5 solo GM emulator (src/lib/engine/oracle.ts) */}
      <OracleModal open={oracleOpen} onClose={() => setOracleOpen(false)} question={oracleQuestion} setQuestion={setOracleQuestion} likelihood={oracleLikelihood} setLikelihood={setOracleLikelihood} log={oracleLog} onAsk={askOracleAction} />

      {/* QUEST JOURNAL MODAL */}
      <QuestJournalModal open={questJournalOpen} onClose={() => setQuestJournalOpen(false)} quests={quests} />

      {/* SHOP MODAL — D&D 5e economy (component: game/ShopModal) */}
      <ShopModal open={shopOpen && !!c && !combat} c={c} tab={shopTab} setTab={setShopTab} search={shopSearch} setSearch={setShopSearch} bargainedPrices={bargainedPrices} onBuy={shopBuy} onBargain={shopBargain} onSell={shopSell} onClose={() => setShopOpen(false)} />

      {/* CONTENT MANAGER MODAL (component: game/ContentManagerModal) */}
      <ContentManagerModal open={contentManagerOpen && !!c} onClose={() => setContentManagerOpen(false)}
        registry={contentRegistry} setRegistry={setContentRegistry}
        importText={contentImportText} setImportText={setContentImportText}
        importMsg={contentImportMsg} setImportMsg={setContentImportMsg}
        filterType={contentFilterType} setFilterType={setContentFilterType}
        exportText={contentExportText} setExportText={setContentExportText} />

      {/* AI DM HELPER MODAL (component: game/AiDmHelperModal) */}
      <AiDmHelperModal open={dmHelperOpen && !!c} onClose={() => setDmHelperOpen(false)} level={c?.level ?? 1} lastIntent={lastIntent} narrativeEngine={narrativeEngine} />

      {/* MAP MODAL (component: game/MapModal) */}
      <MapModal open={mapOpen} onClose={() => setMapOpen(false)} map={map} />

      {/* DUNGEON MAP MODAL — Domain 36: top-down room layout with fog-of-war */}
      {dungeonMapOpen && dungeonBlueprint && dungeonRun && (
        <DungeonView
          dungeonBlueprint={dungeonBlueprint}
          dungeonRun={dungeonRun}
          setDungeonMapOpen={setDungeonMapOpen}
        />
      )}

      {/* CHARACTER SHEET MODAL */}
      {sheetOpen && (
        <CharacterSheet
          c={c} cls={cls} meleeW={meleeW} rangedW={rangedW} gameTime={gameTime}
          maxSpellLv={maxSpellLv} knownSpellsList={knownSpellsList}
          sheetTab={sheetTab} setSheetTab={setSheetTab} setSheetOpen={setSheetOpen}
          log={log} scene={scene} combat={combat} history={history} thinking={thinking}
          setC={setC} setLog={setLog} persist={persist} entrySystem={entrySystem}
          viewSpellDetail={viewSpellDetail} openSpellBrowser={openSpellBrowser} learnSpell={learnSpell}
          spellBrowserLoading={spellBrowserLoading} spellBrowserOpen={spellBrowserOpen}
          availableSpells={availableSpells} spellDetail={spellDetail} spellDetailLoading={spellDetailLoading}
        />
      )}

      {/* COMBAT PANEL */}
      <CombatOverlay
        combat={combat} c={c} cls={cls} meleeW={meleeW} rangedW={rangedW}
        thinking={thinking} downed={downed}
        combatMenu={combatMenu} setCombatMenu={setCombatMenu}
        combatTargetId={combatTargetId} setCombatTargetId={setCombatTargetId}
        powerAttackOn={powerAttackOn} setPowerAttackOn={setPowerAttackOn}
        playerCombatAction={playerCombatAction} onCastSpell={castSpellFromMenu}
        knownSpellsList={knownSpellsList} combatItems={combatItems} />

      {/* INPUT */}
      <DMChat
        c={c} cls={cls} combat={combat} thinking={thinking} input={input} setInput={setInput}
        submitAction={submitAction} submitCombatTalk={submitCombatTalk}
        shortRest={shortRest} longRest={longRest} openReprepare={openReprepare}
        exploreAction={exploreAction}
      />
    </div>
  );
}




