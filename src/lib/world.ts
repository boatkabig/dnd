/**
 * Domain 26: World & Campaign
 *
 * จัดการโลก เนื้อเรื่อง และความต่อเนื่องของ Campaign
 *
 * Sub-systems:
 *  26.1 World Map       — Region/City/Dungeon/Landmark
 *  26.2 Location        — Description/NPC/Object/Encounter
 *  26.3 Quest System    — Quest/Objective/Reward/Progress
 *  26.4 Campaign State  — Current Story/Completed/Choices/Consequences
 *  26.5 Faction         — Name/Goal/Reputation/Relationship
 *  26.6 Lore            — History/Religion/Culture/Legend
 *  26.7 Economy         — Gold Flow/Shop/Trade/Price
 *
 * Pure data + helpers. AI DM reads from these structures.
 */

/* ======================================================================
 * 26.1 WORLD MAP
 * ====================================================================== */

export type MapNodeType = "region" | "city" | "dungeon" | "landmark" | "wilderness" | "camp";

export interface MapNode {
  id: string;
  name: string;
  type: MapNodeType;
  parentId?: string; // parent region
  coordinates: { x: number; y: number };
  description?: string;
  travelTimeFromNeighbors?: Record<string, number>; // neighborId -> hours
  unlocked: boolean;
  discoveredAt?: number; // in-world seconds
}

export interface WorldMap {
  nodes: Record<string, MapNode>;
  connections: Array<{ from: string; to: string; distanceMiles: number; terrainType?: string }>;
}

export function unlockMapNode(map: WorldMap, nodeId: string, worldSeconds?: number): WorldMap {
  const node = map.nodes[nodeId];
  if (!node) return map;
  return {
    ...map,
    nodes: {
      ...map.nodes,
      [nodeId]: { ...node, unlocked: true, discoveredAt: worldSeconds ?? 0 },
    },
  };
}

export function getReachableNodes(map: WorldMap, fromId: string): Array<{ node: MapNode; distance: number }> {
  const reachable: Array<{ node: MapNode; distance: number }> = [];
  for (const conn of map.connections) {
    if (conn.from === fromId) {
      const node = map.nodes[conn.to];
      if (node?.unlocked) reachable.push({ node, distance: conn.distanceMiles });
    } else if (conn.to === fromId) {
      const node = map.nodes[conn.from];
      if (node?.unlocked) reachable.push({ node, distance: conn.distanceMiles });
    }
  }
  return reachable;
}

/* ======================================================================
 * 26.2 LOCATION
 * ====================================================================== */

export interface Location {
  id: string;
  name: string;
  mapNodeId?: string;
  description: string;
  detailedDescription?: string;
  npcIds: string[];
  objectIds: string[];
  encounterIds: string[];
  ambient?: string; // sensory details
  weather?: string;
  lighting?: string;
  sounds?: string;
  exits: Array<{ direction: string; toLocationId: string; locked?: boolean; description?: string }>;
  tags?: string[];
}

export function summarizeLocation(loc: Location): string {
  const parts: string[] = [loc.name];
  if (loc.npcIds.length > 0) parts.push(`NPC ${loc.npcIds.length}`);
  if (loc.objectIds.length > 0) parts.push(`วัตถุ ${loc.objectIds.length}`);
  if (loc.encounterIds.length > 0) parts.push(`Encounter ${loc.encounterIds.length}`);
  return parts.join(" • ");
}

/* ======================================================================
 * 26.3 QUEST SYSTEM
 * ====================================================================== */

export type QuestStatus = "available" | "active" | "completed" | "failed" | "abandoned";

export type ObjectiveType =
  | "kill"
  | "fetch"
  | "talk"
  | "explore"
  | "escort"
  | "defend"
  | "use_item"
  | "custom";

export interface QuestObjective {
  id: string;
  description: string;
  type: ObjectiveType;
  targetId?: string; // NPC id, item id, location id
  quantity?: number;
  currentProgress: number;
  completed: boolean;
  optional?: boolean;
}

export interface QuestReward {
  gold?: number;
  xp?: number;
  items?: Array<{ itemId: string; quantity: number }>;
  reputation?: Array<{ factionId: string; delta: number }>;
  unlockQuests?: string[];
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  giverNpcId?: string;
  status: QuestStatus;
  objectives: QuestObjective[];
  rewards: QuestReward;
  prerequisiteQuestIds?: string[];
  chainNextQuestId?: string;
  startedAt?: number;
  completedAt?: number;
  branch?: string; // for branching narrative
}

export function isQuestComplete(quest: Quest): boolean {
  const required = quest.objectives.filter((o) => !o.optional);
  return required.every((o) => o.completed);
}

export function progressObjective(quest: Quest, objectiveId: string, amount = 1): Quest {
  return {
    ...quest,
    objectives: quest.objectives.map((o) => {
      if (o.id !== objectiveId || o.completed) return o;
      const newProgress = o.quantity
        ? Math.min(o.quantity, o.currentProgress + amount)
        : o.currentProgress + amount;
      const completed = o.quantity ? newProgress >= o.quantity : newProgress >= 1;
      return { ...o, currentProgress: newProgress, completed };
    }),
  };
}

export function completeQuest(quest: Quest, worldSeconds?: number): Quest {
  return {
    ...quest,
    status: "completed",
    completedAt: worldSeconds,
  };
}

/* ======================================================================
 * 26.4 CAMPAIGN STATE
 * ====================================================================== */

export interface CampaignChoice {
  id: string;
  timestamp: number;
  description: string;
  options: string[];
  selectedOption: string;
  consequences: string[];
}

export interface CampaignState {
  campaignId: string;
  campaignName: string;
  currentChapter: string;
  currentSceneId: string;
  completedQuestIds: string[];
  activeQuestIds: string[];
  availableQuestIds: string[];
  choices: CampaignChoice[];
  flags: Record<string, boolean>; // story flags
  variables: Record<string, number | string>; // custom state
  worldTimeSeconds: number;
}

export function recordChoice(state: CampaignState, choice: CampaignChoice): CampaignState {
  return {
    ...state,
    choices: [...state.choices, choice],
  };
}

export function setFlag(state: CampaignState, flag: string, value = true): CampaignState {
  return {
    ...state,
    flags: { ...state.flags, [flag]: value },
  };
}

export function hasFlag(state: CampaignState, flag: string): boolean {
  return !!state.flags[flag];
}

export function setVariable(state: CampaignState, key: string, value: number | string): CampaignState {
  return {
    ...state,
    variables: { ...state.variables, [key]: value },
  };
}

/* ======================================================================
 * 26.5 FACTION
 * ====================================================================== */

export type FactionRelationship = "ally" | "friendly" | "neutral" | "rival" | "hostile" | "war";

export interface Faction {
  id: string;
  name: string;
  description: string;
  goals: string[];
  leaderId?: string; // NPC id
  members: string[]; // NPC ids
  reputation: number; // -100 to +100 with player party
  relationship: FactionRelationship;
  allies: string[]; // faction ids
  enemies: string[]; // faction ids
  headquarters?: string; // location id
  emblem?: string;
  color?: string;
}

export function factionRelationshipFromReputation(rep: number): FactionRelationship {
  if (rep >= 60) return "ally";
  if (rep >= 20) return "friendly";
  if (rep > -20) return "neutral";
  if (rep > -60) return "rival";
  if (rep > -100) return "hostile";
  return "war";
}

export function adjustFactionReputation(faction: Faction, delta: number): Faction {
  const newRep = Math.max(-100, Math.min(100, faction.reputation + delta));
  return {
    ...faction,
    reputation: newRep,
    relationship: factionRelationshipFromReputation(newRep),
  };
}

/* ======================================================================
 * 26.6 LORE
 * ====================================================================== */

export type LoreCategory = "history" | "religion" | "culture" | "legend" | "geography" | "magic" | "politics";

export interface LoreEntry {
  id: string;
  category: LoreCategory;
  title: string;
  content: string;
  knownByDefault: boolean;
  regionId?: string;
  factionId?: string;
  prerequisites?: string[]; // other lore entry ids
  tags?: string[];
}

export interface LoreDatabase {
  entries: Record<string, LoreEntry>;
  known: Set<string>;
}

export function createLoreDatabase(entries: LoreEntry[] = []): LoreDatabase {
  const map: Record<string, LoreEntry> = {};
  const known = new Set<string>();
  for (const e of entries) {
    map[e.id] = e;
    if (e.knownByDefault) known.add(e.id);
  }
  return { entries: map, known };
}

export function revealLore(db: LoreDatabase, loreId: string): LoreDatabase {
  const known = new Set(db.known);
  known.add(loreId);
  return {
    ...db,
    known,
  };
}

export function getKnownLore(db: LoreDatabase): LoreEntry[] {
  return Array.from(db.known).map((id) => db.entries[id]).filter(Boolean);
}

/* ======================================================================
 * 26.7 ECONOMY
 * ====================================================================== */

export interface ShopInventory {
  shopId: string;
  shopName: string;
  locationId: string;
  items: Array<{ itemId: string; price: number; quantity: number; minReputation?: number }>;
  priceModifier: number; // 1.0 = base, 1.2 = +20%, 0.8 = -20%
  buybackModifier: number; // 0.5 = half price
}

export interface EconomyState {
  shops: Record<string, ShopInventory>;
  partyGold: number;
  globalPriceModifier: number; // affects all shops (events)
}

export function calculateBuyPrice(
  economy: EconomyState,
  shopId: string,
  itemId: string,
  reputation: number,
): { price: number; available: boolean } {
  const shop = economy.shops[shopId];
  if (!shop) return { price: 0, available: false };
  const entry = shop.items.find((i) => i.itemId === itemId);
  if (!entry || entry.quantity <= 0) return { price: 0, available: false };
  if (entry.minReputation !== undefined && reputation < entry.minReputation) {
    return { price: 0, available: false };
  }
  const repDiscount = Math.floor(reputation / 20) * 0.05; // 5% per 20 rep
  const finalPrice = Math.floor(
    entry.price * shop.priceModifier * economy.globalPriceModifier * (1 - repDiscount),
  );
  return { price: Math.max(1, finalPrice), available: true };
}

export function calculateSellPrice(
  economy: EconomyState,
  shopId: string,
  baseItemPrice: number,
): number {
  const shop = economy.shops[shopId];
  if (!shop) return Math.floor(baseItemPrice * 0.5);
  return Math.max(1, Math.floor(baseItemPrice * shop.buybackModifier * economy.globalPriceModifier));
}

export function buyItem(
  economy: EconomyState,
  shopId: string,
  itemId: string,
  quantity: number,
  reputation: number,
): { economy: EconomyState; success: boolean; totalPaid: number; reason?: string } {
  const shop = economy.shops[shopId];
  if (!shop) return { economy, success: false, totalPaid: 0, reason: "ไม่พบร้านค้า" };
  const entry = shop.items.find((i) => i.itemId === itemId);
  if (!entry || entry.quantity < quantity) {
    return { economy, success: false, totalPaid: 0, reason: "สินค้าไม่เพียงพอ" };
  }
  if (entry.minReputation !== undefined && reputation < entry.minReputation) {
    return { economy, success: false, totalPaid: 0, reason: "ชื่อเสียงไม่เพียงพอ" };
  }
  const unit = calculateBuyPrice(economy, shopId, itemId, reputation);
  if (!unit.available) return { economy, success: false, totalPaid: 0, reason: "ไม่สามารถซื้อได้" };
  const totalPaid = unit.price * quantity;
  if (economy.partyGold < totalPaid) {
    return { economy, success: false, totalPaid: 0, reason: "ทองไม่เพียงพอ" };
  }
  const newItems = shop.items.map((i) =>
    i.itemId === itemId ? { ...i, quantity: i.quantity - quantity } : i,
  );
  return {
    economy: {
      ...economy,
      partyGold: economy.partyGold - totalPaid,
      shops: {
        ...economy.shops,
        [shopId]: { ...shop, items: newItems },
      },
    },
    success: true,
    totalPaid,
  };
}

/* ======================================================================
 * CAMPAIGN FACTORY
 * ====================================================================== */

export function createCampaign(spec: {
  id: string;
  name: string;
  startingChapter: string;
  startingSceneId: string;
  startingGold: number;
}): CampaignState {
  return {
    campaignId: spec.id,
    campaignName: spec.name,
    currentChapter: spec.startingChapter,
    currentSceneId: spec.startingSceneId,
    completedQuestIds: [],
    activeQuestIds: [],
    availableQuestIds: [],
    choices: [],
    flags: {},
    variables: {},
    worldTimeSeconds: 0,
  };
}
