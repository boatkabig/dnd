/**
 * Domain 31: Dialogue Engine
 *
 * สำหรับ AI DM — จัดการสนทนาขั้นสูงกว่า Domain 22 (Social)
 *
 * Sub-systems:
 *  31.1 Conversation State — current topic, mood, turn, branch
 *  31.2 Intent Analysis — what is player trying to achieve?
 *  31.3 Emotion Tracking — NPC emotional state over time
 *  31.4 Memory Layer — what NPC remembers across sessions
 *  31.5 Response Generation — build structured response from intent + emotion + memory
 *  31.6 Branch Tracking — dialogue tree branches visited
 *  31.7 Conversation Context — recent N turns, summarization
 *  31.8 Termination Conditions — when to end conversation
 *
 * Whereas Domain 22 (Social) handles *mechanics* (checks, bargaining, reputation),
 * Domain 31 handles *flow* — what to say next, how to interpret player intent,
 * how to track long-running relationships in dialogue.
 */

/* ======================================================================
 * 31.1 CONVERSATION STATE
 * ====================================================================== */

export type ConversationPhase = "greeting" | "investigating" | "negotiating" | "concluding" | "ended" | "interrupted";

export interface ConversationState {
  id: string;
  npcId: string;
  playerId: string;
  startedAt: number; // in-world seconds
  phase: ConversationPhase;
  currentTopic: string;
  currentBranchId: string | null;
  turnsElapsed: number;
  lastIntent: string | null;
  lastEmotionShift: string | null;
  endedBy: "player" | "npc" | "system" | null;
  metadata: Record<string, any>;
}

export function startConversation(npcId: string, playerId: string, worldSeconds: number, openingTopic = "greeting"): ConversationState {
  return {
    id: `conv_${npcId}_${worldSeconds}`,
    npcId,
    playerId,
    startedAt: worldSeconds,
    phase: "greeting",
    currentTopic: openingTopic,
    currentBranchId: null,
    turnsElapsed: 0,
    lastIntent: null,
    lastEmotionShift: null,
    endedBy: null,
    metadata: {},
  };
}

export function advanceConversation(state: ConversationState, intent: string, nextTopic?: string): ConversationState {
  return {
    ...state,
    turnsElapsed: state.turnsElapsed + 1,
    lastIntent: intent,
    currentTopic: nextTopic || state.currentTopic,
    phase: derivePhase(state.phase, intent),
  };
}

function derivePhase(current: ConversationPhase, intent: string): ConversationPhase {
  if (intent === "end_conversation" || intent === "leave") return "ended";
  if (intent === "negotiate" || intent === "bargain") return "negotiating";
  if (intent === "investigate" || intent === "ask_question") return "investigating";
  if (intent === "conclude" || intent === "goodbye") return "concluding";
  return current;
}

/* ======================================================================
 * 31.2 INTENT ANALYSIS
 * ====================================================================== */

export type PlayerIntent =
  | "greeting"
  | "ask_question"
  | "investigate"
  | "negotiate"
  | "bargain"
  | "persuade"
  | "intimidate"
  | "deceive"
  | "trade"
  | "give_item"
  | "request_quest"
  | "report_progress"
  | "accuse"
  | "flatter"
  | "threaten"
  | "end_conversation"
  | "leave"
  | "unknown";

export interface IntentAnalysisResult {
  intent: PlayerIntent;
  confidence: number; // 0-1
  topicMentioned?: string;
  npcMentioned?: string;
  locationMentioned?: string;
  itemMentioned?: string;
  emotionTone?: string;
}

/**
 * Lightweight keyword-based intent classifier.
 * For production AI DM use, this would be replaced by an LLM call,
 * but the function signature stays the same — keeping the engine deterministic.
 */
export function analyzeIntent(playerInput: string): IntentAnalysisResult {
  const text = playerInput.toLowerCase();
  const checks: Array<{ intent: PlayerIntent; patterns: RegExp[] }> = [
    { intent: "end_conversation", patterns: [/goodbye|ลาก่อน|บ๊ายบาย|จบสนทนา|ไปก่อน/] },
    { intent: "leave", patterns: [/walk away|ออกไป|จากไป|เดินจากไป/] },
    { intent: "negotiate", patterns: [/negotiate|เจรจา|ต่อรอง|make.*deal/] },
    { intent: "bargain", patterns: [/bargain|ต่อราคา|ลดราคา|cheaper|ถูกกว่า/] },
    { intent: "persuade", patterns: [/persuade|โน้มน้าว|ช่วย|please|ขอร้อง/] },
    { intent: "intimidate", patterns: [/threaten|ข่มขู่|threat|ฆ่า|ตบะ|อันตราย/] },
    { intent: "deceive", patterns: [/lie|โกหก|หลอก|deceive|trick|ไม่จริง/] },
    { intent: "trade", patterns: [/buy|sell|ซื้อ|ขาย|trade|แลก/] },
    { intent: "give_item", patterns: [/give|ให้|มอบ|ส่งมอบ/] },
    { intent: "request_quest", patterns: [/quest|เควสต์|ภารกิจ|งาน|ช่วยทำ|work.*for/] },
    { intent: "report_progress", patterns: [/done|เสร็จแล้ว|สำเร็จ|finished|killed.*it|กำจัดแล้ว/] },
    { intent: "accuse", patterns: [/accuse|กล่าวหา|คุณทำ|you did/] },
    { intent: "flatter", patterns: [/great|amazing|วิเศษ|เก่งมาก|wonderful|brilliant|ฉลาด/] },
    { intent: "ask_question", patterns: [/\?|ไหน|อะไร|ทำไม|how|what|why|when|where|who|ใคร|เมื่อไหร่|ที่ไหน/] },
    { intent: "investigate", patterns: [/investigate|สืบ|ค้นหา|look.*into|tell.*about|เล่าเรื่อง/] },
    { intent: "greeting", patterns: [/^hi$|^hello$|^สวัสดี|^hallo|^hey|^ดี|^greetings/i] },
  ];
  for (const check of checks) {
    for (const pattern of check.patterns) {
      if (pattern.test(text)) {
        return {
          intent: check.intent,
          confidence: 0.7 + Math.random() * 0.3, // simulated confidence
          emotionTone: deriveEmotionTone(check.intent),
        };
      }
    }
  }
  return { intent: "unknown", confidence: 0.2 };
}

function deriveEmotionTone(intent: PlayerIntent): string {
  const map: Partial<Record<PlayerIntent, string>> = {
    intimidate: "aggressive",
    flatter: "warm",
    accuse: "tense",
    persuade: "hopeful",
    deceive: "evasive",
    bargain: "transactional",
    greeting: "neutral",
  };
  return map[intent] || "neutral";
}

/* ======================================================================
 * 31.3 EMOTION TRACKING
 * ====================================================================== */

export type NPCEmotion =
  | "neutral" | "happy" | "angry" | "afraid" | "suspicious"
  | "trusting" | "bored" | "excited" | "sad" | "disgusted"
  | "curious" | "annoyed";

export interface EmotionState {
  current: NPCEmotion;
  intensity: number; // 0-1
  history: Array<{ emotion: NPCEmotion; at: number; reason?: string }>;
}

export function createEmotionState(initial: NPCEmotion = "neutral"): EmotionState {
  return {
    current: initial,
    intensity: 0.5,
    history: [{ emotion: initial, at: Date.now() }],
  };
}

export function shiftEmotion(state: EmotionState, newEmotion: NPCEmotion, delta: number = 0.1, reason?: string): EmotionState {
  const newIntensity = state.current === newEmotion
    ? Math.min(1, state.intensity + delta)
    : Math.max(0.1, Math.min(1, delta));
  return {
    current: newEmotion,
    intensity: newIntensity,
    history: [...state.history, { emotion: newEmotion, at: Date.now(), reason }].slice(-20),
  };
}

/** Apply intent → emotion mapping (e.g. intimidate → afraid/angry) */
export function applyIntentToEmotion(state: EmotionState, intent: PlayerIntent, success: boolean): EmotionState {
  const transitions: Record<PlayerIntent, { success: NPCEmotion; fail: NPCEmotion; delta: number }> = {
    persuade: { success: "trusting", fail: "annoyed", delta: 0.2 },
    intimidate: { success: "afraid", fail: "angry", delta: 0.3 },
    deceive: { success: "trusting", fail: "suspicious", delta: 0.25 },
    flatter: { success: "happy", fail: "suspicious", delta: 0.15 },
    accuse: { success: "afraid", fail: "angry", delta: 0.3 },
    bargain: { success: "neutral", fail: "annoyed", delta: 0.1 },
    negotiate: { success: "trusting", fail: "neutral", delta: 0.15 },
    greeting: { success: "neutral", fail: "neutral", delta: 0.05 },
    ask_question: { success: "curious", fail: "neutral", delta: 0.1 },
    investigate: { success: "curious", fail: "suspicious", delta: 0.15 },
    trade: { success: "neutral", fail: "neutral", delta: 0.05 },
    give_item: { success: "happy", fail: "neutral", delta: 0.2 },
    request_quest: { success: "excited", fail: "neutral", delta: 0.2 },
    report_progress: { success: "happy", fail: "neutral", delta: 0.2 },
    threaten: { success: "afraid", fail: "angry", delta: 0.3 },
    end_conversation: { success: "neutral", fail: "neutral", delta: 0 },
    leave: { success: "neutral", fail: "neutral", delta: 0 },
    unknown: { success: "curious", fail: "neutral", delta: 0.05 },
  };
  const t = transitions[intent] || transitions.unknown;
  return shiftEmotion(state, success ? t.success : t.fail, t.delta, `intent:${intent}:${success ? "ok" : "fail"}`);
}

/* ======================================================================
 * 31.4 MEMORY LAYER
 * ====================================================================== */

export interface DialogueMemory {
  npcId: string;
  factsKnownAboutPlayer: Array<{ fact: string; learnedAt: number; importance: number }>;
  promisesMade: Array<{ promise: string; to: string; at: number; kept?: boolean }>;
  betrayals: Array<{ description: string; at: number }>;
  giftsReceived: Array<{ item: string; at: number; value: number }>;
  secretsRevealed: Array<{ secretId: string; at: number }>;
  topicsDiscussed: string[]; // topic ids already covered
  lastInteractionAt: number;
  relationshipScore: number; // -100 to +100
}

export function createDialogueMemory(npcId: string): DialogueMemory {
  return {
    npcId,
    factsKnownAboutPlayer: [],
    promisesMade: [],
    betrayals: [],
    giftsReceived: [],
    secretsRevealed: [],
    topicsDiscussed: [],
    lastInteractionAt: 0,
    relationshipScore: 0,
  };
}

export function learnFact(mem: DialogueMemory, fact: string, importance = 5, atSeconds = Date.now()): DialogueMemory {
  if (mem.factsKnownAboutPlayer.some((f) => f.fact === fact)) return mem;
  return {
    ...mem,
    factsKnownAboutPlayer: [...mem.factsKnownAboutPlayer, { fact, learnedAt: atSeconds, importance }],
  };
}

export function makePromise(mem: DialogueMemory, promise: string, to: string, atSeconds = Date.now()): DialogueMemory {
  return {
    ...mem,
    promisesMade: [...mem.promisesMade, { promise, to, at: atSeconds }],
  };
}

export function markBetrayal(mem: DialogueMemory, description: string, atSeconds = Date.now()): DialogueMemory {
  return {
    ...mem,
    betrayals: [...mem.betrayals, { description, at: atSeconds }],
    relationshipScore: Math.max(-100, mem.relationshipScore - 30),
  };
}

export function receiveGift(mem: DialogueMemory, item: string, value: number, atSeconds = Date.now()): DialogueMemory {
  return {
    ...mem,
    giftsReceived: [...mem.giftsReceived, { item, at: atSeconds, value }],
    relationshipScore: Math.min(100, mem.relationshipScore + Math.floor(value / 10)),
  };
}

export function revealSecret(mem: DialogueMemory, secretId: string, atSeconds = Date.now()): DialogueMemory {
  if (mem.secretsRevealed.some((s) => s.secretId === secretId)) return mem;
  return {
    ...mem,
    secretsRevealed: [...mem.secretsRevealed, { secretId, at: atSeconds }],
  };
}

export function markTopicDiscussed(mem: DialogueMemory, topic: string): DialogueMemory {
  if (mem.topicsDiscussed.includes(topic)) return mem;
  return { ...mem, topicsDiscussed: [...mem.topicsDiscussed, topic] };
}

/* ======================================================================
 * 31.5 RESPONSE GENERATION
 * ====================================================================== */

export interface ResponseDirective {
  npcReply: string; // hint text for AI DM
  emotion: NPCEmotion;
  suggestedTopic?: string;
  endsConversation: boolean;
  triggersSkillCheck?: { skill: string; dc: number };
  revealInfo?: string[]; // info IDs to unlock
  advanceQuest?: string; // quest ID
}

export function generateResponseDirective(
  intent: PlayerIntent,
  emotion: EmotionState,
  memory: DialogueMemory,
  availableSecrets: string[] = [],
): ResponseDirective {
  // Base directives by intent
  const base: Record<PlayerIntent, Omit<ResponseDirective, "emotion">> = {
    greeting: { npcReply: "NPC ทักทายกลับด้วยน้ำเสียงเป็นมิตร", endsConversation: false, emotion: "neutral" } as any,
    ask_question: { npcReply: "NPC ตอบคำถามอย่างรอบคอบ", suggestedTopic: "investigation", endsConversation: false, emotion: "curious" } as any,
    investigate: { npcReply: "NPC เล่าเรื่องที่รู้พร้อมเกร็ดเล็กเกร็ดน้อย", suggestedTopic: "lore", endsConversation: false, emotion: "curious" } as any,
    negotiate: { npcReply: "NPC พร้อมเจรจา แต่มีเงื่อนไข", suggestedTopic: "deal", endsConversation: false, triggersSkillCheck: { skill: "persuasion", dc: 13 }, emotion: "neutral" } as any,
    bargain: { npcReply: "NPC ต่อรองราคาอย่างเด็ดเดี่ยว", suggestedTopic: "trade", endsConversation: false, triggersSkillCheck: { skill: "persuasion", dc: 15 }, emotion: "neutral" } as any,
    persuade: { npcReply: "NPC ฟังคำโน้มน้าว", endsConversation: false, triggersSkillCheck: { skill: "persuasion", dc: 13 }, emotion: "neutral" } as any,
    intimidate: { npcReply: "NPC ตกใจหรือโกรธกับการข่มขู่", endsConversation: false, triggersSkillCheck: { skill: "intimidation", dc: 13 }, emotion: "afraid" } as any,
    deceive: { npcReply: "NPC สงสัยในคำพูดของผู้เล่น", endsConversation: false, triggersSkillCheck: { skill: "deception", dc: 14 }, emotion: "suspicious" } as any,
    trade: { npcReply: "NPC เปิดรายการสินค้า", suggestedTopic: "shop", endsConversation: false, emotion: "neutral" } as any,
    give_item: { npcReply: "NPC รับของขวัญด้วยความดีใจ", endsConversation: false, emotion: "happy" } as any,
    request_quest: { npcReply: "NPC เสนอภารกิจให้ผู้เล่น", endsConversation: false, advanceQuest: "auto", emotion: "excited" } as any,
    report_progress: { npcReply: "NPC รายงานว่าทำสำเร็จ", endsConversation: false, advanceQuest: "auto", emotion: "happy" } as any,
    accuse: { npcReply: "NPC ปกป้องตัวเอง อาจโกรธ", endsConversation: false, triggersSkillCheck: { skill: "insight", dc: 13 }, emotion: "angry" } as any,
    flatter: { npcReply: "NPC ยิ้มให้แม้จะรู้ว่าเป็นการประจบ", endsConversation: false, triggersSkillCheck: { skill: "persuasion", dc: 11 }, emotion: "happy" } as any,
    threaten: { npcReply: "NPC กลัวหรือเตรียมสู้", endsConversation: false, triggersSkillCheck: { skill: "intimidation", dc: 14 }, emotion: "afraid" } as any,
    end_conversation: { npcReply: "NPC บอกลาด้วยน้ำเสียงสุภาพ", endsConversation: true, emotion: "neutral" } as any,
    leave: { npcReply: "NPC เงียบ — ผู้เล่นเดินจากไป", endsConversation: true, emotion: "neutral" } as any,
    unknown: { npcReply: "NPC สงสัยว่าผู้เล่นหมายถึงอะไร", endsConversation: false, emotion: "curious" } as any,
  };
  const b = base[intent] || base.unknown;
  // Modulate by current emotion
  let npcReply = (b as any).npcReply as string;
  let emotionOut = (b as any).emotion as NPCEmotion;
  if (emotion.current === "angry") {
    npcReply += " (NPC ยังโกรธอยู่ — ตอบสั้น น้ำเสียงแข็ง)";
    emotionOut = "angry";
  } else if (emotion.current === "suspicious") {
    npcReply += " (NPC ระแวง — ตอบแบบหลีกเลี่ยงคำถาม)";
    emotionOut = "suspicious";
  } else if (emotion.current === "trusting" && emotion.intensity > 0.7) {
    npcReply += " (NPC เชื่อใจ — อาจเผยความลับ)";
    if (availableSecrets.length > 0) {
      return {
        ...b,
        npcReply,
        emotion: emotionOut,
        revealInfo: availableSecrets.slice(0, 1),
      } as ResponseDirective;
    }
  }
  // Betrayal impact
  if (memory.betrayals.length > 0) {
    npcReply += " (NPC จำได้ว่าผู้เล่นเคยหักหลัง — ระวังตัว)";
    emotionOut = emotion.current === "neutral" ? "suspicious" : emotionOut;
  }
  return { ...b, npcReply, emotion: emotionOut } as ResponseDirective;
}

/* ======================================================================
 * 31.6 BRANCH TRACKING
 * ====================================================================== */

export interface DialogueBranch {
  id: string;
  label: string;
  parentBranchId: string | null;
  requiredIntent?: PlayerIntent;
  requiresTopic?: string;
  unlocksBranches: string[];
  endsConversation: boolean;
}

export interface BranchVisit {
  branchId: string;
  visitedAt: number;
  outcome: "advanced" | "blocked" | "ended";
}

export function visitBranch(state: ConversationState, branch: DialogueBranch, worldSeconds: number): { state: ConversationState; outcome: BranchVisit["outcome"] } {
  let outcome: BranchVisit["outcome"] = "advanced";
  if (branch.requiredIntent && state.lastIntent !== branch.requiredIntent) {
    outcome = "blocked";
  } else if (branch.endsConversation) {
    outcome = "ended";
  }
  return {
    state: {
      ...state,
      currentBranchId: branch.id,
      phase: outcome === "ended" ? "ended" : state.phase,
      endedBy: outcome === "ended" ? "system" : null,
    },
    outcome,
  };
}

/* ======================================================================
 * 31.7 CONVERSATION CONTEXT (sliding window + summarization)
 * ====================================================================== */

export interface ConversationTurn {
  turn: number;
  speaker: "player" | "npc";
  text: string;
  intent?: PlayerIntent;
  emotion?: NPCEmotion;
  timestamp: number;
}

export interface ConversationContext {
  turns: ConversationTurn[];
  summary?: string; // condensed recent history for AI DM
  totalTokens: number; // approx token count
}

export function addTurn(ctx: ConversationContext, turn: Omit<ConversationTurn, "turn">): ConversationContext {
  const newTurn: ConversationTurn = { ...turn, turn: ctx.turns.length + 1 };
  const turns = [...ctx.turns, newTurn];
  // Keep last 20 turns; summarize older
  const recent = turns.slice(-20);
  const summarized = turns.length > 20 ? summarizeTurns(turns.slice(0, -20)) : undefined;
  return {
    turns: recent,
    summary: ctx.summary
      ? `${ctx.summary} | ${summarized || ""}`
      : summarized,
    totalTokens: recent.reduce((sum, t) => sum + Math.ceil(t.text.length / 4), 0),
  };
}

function summarizeTurns(turns: ConversationTurn[]): string {
  const playerIntents = turns
    .filter((t) => t.speaker === "player" && t.intent)
    .map((t) => t.intent) as PlayerIntent[];
  const npcEmotions = turns
    .filter((t) => t.speaker === "npc" && t.emotion)
    .map((t) => t.emotion) as NPCEmotion[];
  const intentSummary = Array.from(new Set(playerIntents)).slice(-3).join(",");
  const emotionSummary = Array.from(new Set(npcEmotions)).slice(-3).join(",");
  return `ก่อนหน้า: intents=[${intentSummary}] emotions=[${emotionSummary}]`;
}

/* ======================================================================
 * 31.8 TERMINATION CONDITIONS
 * ====================================================================== */

export function shouldEndConversation(state: ConversationState, ctx: ConversationContext, emotion: EmotionState): { end: boolean; reason?: string } {
  if (state.phase === "ended") return { end: true, reason: "Already ended" };
  if (state.turnsElapsed >= 30) return { end: true, reason: "Turn limit reached" };
  if (ctx.totalTokens > 3000) return { end: true, reason: "Context too long — summarize and continue" };
  if (emotion.current === "angry" && emotion.intensity > 0.85) return { end: true, reason: "NPC too angry to continue" };
  if (emotion.current === "afraid" && emotion.intensity > 0.9) return { end: true, reason: "NPC flees in terror" };
  return { end: false };
}

/* ======================================================================
 * DIALOGUE SESSION (combines all sub-systems)
 * ====================================================================== */

export interface DialogueSession {
  conversation: ConversationState;
  emotion: EmotionState;
  memory: DialogueMemory;
  context: ConversationContext;
}

export function createDialogueSession(npcId: string, playerId: string, worldSeconds: number): DialogueSession {
  return {
    conversation: startConversation(npcId, playerId, worldSeconds),
    emotion: createEmotionState("neutral"),
    memory: createDialogueMemory(npcId),
    context: { turns: [], totalTokens: 0 },
  };
}

export function processPlayerInput(
  session: DialogueSession,
  input: string,
  worldSeconds: number,
  availableSecrets: string[] = [],
): { session: DialogueSession; directive: ResponseDirective; intent: IntentAnalysisResult } {
  const intent = analyzeIntent(input);
  const newEmotion = applyIntentToEmotion(session.emotion, intent.intent, true);
  const directive = generateResponseDirective(intent.intent, newEmotion, session.memory, availableSecrets);
  const newConv = advanceConversation(session.conversation, intent.intent, directive.suggestedTopic);
  const newCtx = addTurn(session.context, {
    speaker: "player",
    text: input,
    intent: intent.intent,
    emotion: newEmotion.current,
    timestamp: worldSeconds,
  });
  const mem = directive.revealInfo
    ? directive.revealInfo.reduce((m, s) => revealSecret(m, s, worldSeconds), session.memory)
    : session.memory;
  return {
    session: {
      conversation: newConv,
      emotion: newEmotion,
      memory: directive.revealInfo ? { ...mem, lastInteractionAt: worldSeconds } : { ...session.memory, lastInteractionAt: worldSeconds },
      context: newCtx,
    },
    directive,
    intent,
  };
}
