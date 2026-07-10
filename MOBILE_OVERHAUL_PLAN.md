# D&D Solo AI DM — Mobile-First UX Overhaul Plan

> Target app: `src/components/DnDSolo.tsx` (4,972 lines, monolith) + 36 domain modules under `src/lib/`.
> Stack confirmed from `package.json`: Next.js 16, React 19, Tailwind v4, shadcn/ui (full set), **Zustand 5, framer-motion 12, vaul (Drawer), cmdk (Command), embla-carousel, react-resizable-panels, @dnd-kit, sonner, react-query** — all already installed.

---

## 0. Current-State Findings (grounds every decision below)

| Finding | Evidence | Impact |
|---|---|---|
| **Theme is NOT centralized.** `globals.css` ships the default neutral shadcn palette (grayscale oklch). The dark-fantasy palette (`#0D0A14`-family bg, `#E0A83E` gold) lives in a **`css` template string inside the component** (`DnDSolo.tsx` lines 3191–3256), re-injected via `<style>{css}</style>` in every render branch. | `globals.css:46-113` vs `DnDSolo.tsx:3191-3256` | Refactoring responsive styles means editing one fragile string. Centralizing is a prerequisite quick-win. |
| **Fonts loaded via runtime `@import`** of Google Fonts inside that same CSS string (Cinzel + Sarabun). Re-fetched, blocks render. | `DnDSolo.tsx:3192` | Move to `next/font` self-host. |
| **Zero responsive CSS.** Only `prefers-reduced-motion` media query exists. Layout is `flex-direction: column` with `max-width:640px; margin:0 auto`. | `DnDSolo.tsx:3193, 3904` | Everything is desktop-assumed; mobile is broken by default. |
| **`use-mobile.ts` has a single 768px breakpoint**, returns `boolean`. No tablet (768–1024) vs desktop (>1024) distinction. | `src/hooks/use-mobile.ts:3` | Need a 3-tier breakpoint hook. |
| **6 separate boolean modal states** (`mapOpen`, `sheetOpen`, `questJournalOpen`, `dmHelperOpen`, `contentManagerOpen`, `shopOpen`) — each rendered as a hand-rolled `.sheet-overlay`/`.sheet-modal` bottom sheet. All 6 trigger buttons sit in the sticky header on **one row**. | `DnDSolo.tsx:636-684, 3871-3877, 3942, 3976, 4176, 4337, 4435` | Header button bar overflows/wraps badly on phones — primary mobile complaint ("too many buttons"). |
| **Combat grid 12×10** with inline-styled cells; bounds-checked at lines 1322, 1355, 2067. On a 360px-wide phone, 12 cols ≈ 30px cells — **below the 44px tap target**, and no zoom/pan. | `DnDSolo.tsx:1171-1173, 1322` | Core "grid too small on mobile" complaint. |
| **~62 `useState` calls** in one component; no external store despite **Zustand being installed**. | grep count | State sprawl; re-renders of the whole 5k-line tree; hard to extract components. |
| **Heavy inline `style={{...}}`** instead of utility classes (hundreds of instances). | throughout render | Painful to make responsive — must migrate to classes as we touch each surface. |
| **Library already installed but largely unused in the monolith**: Zustand, framer-motion, vaul/Drawer, cmdk/Command, embla-carousel, react-resizable-panels, sonner, react-query. | `package.json` vs grep of DnDSolo | Biggest opportunity: the tooling is there, just not wired in. |
| **DM scene-continuity gap**: `analyzeIntent`/`processPlayerInput` (`@/lib/dialogue`) + narrative engine exist, but scene/location/time/last-events aren't strongly threaded into each `/api/dm` call as a compact context payload. | `DnDSolo.tsx` DM call sites; `src/lib/dialogue.ts`, `src/lib/narrative.ts` | The stated "DM doesn't maintain scene continuity" pain point. |
| **Shop has no search** — only tab filters (weapons/armor/magic/consumables/sell). | `DnDSolo.tsx:3992, 3976` | Stated pain point; `cmdk` is already a dependency. |
| **UI copy is Thai** (Sarabun font). Every new string must be Thai; keep emoji icons (already used). | throughout | Localization constraint on all new copy. |

**Color palette to centralize** (extracted from `DnDSolo.tsx:3193-3255`):
- bg gradient: `#241C3A → #141020` (root), `#1E1830` (panel), `#1B1530` (input/chip bg), `#221C38` (abil/item bg)
- border: `#3A3054`, `#4A3F6E`
- gold accent: `#E0A83E` (→ `#B8842A` gradient), dim gold `#B9A96A`
- text: `#EAE0CC` (parchment), muted `#8A7F9E`, `#9C92B8`, `#C9BFE0`
- HP: `#7FA85C` (green) / `#E0A83E` (amber) / `#C74B44` (red)
- slots/teal `#6FB3AB`, enemy `#241528`/`#6E3448`, buffs blue `#3B6E7A`/`#A0D0E0`

---

## A. Mobile-First Layout Architecture

### A.1 Three-tier breakpoint system
Replace `use-mobile.ts` with a richer hook (keep the old export as an alias so existing call sites don't break):

```
src/hooks/use-breakpoint.ts  (NEW)
  - useBreakpoint(): 'mobile' | 'tablet' | 'desktop'
  - useIsMobile() (re-export, <768) — backward compatible
```
Breakpoints: **mobile <768px · tablet 768–1023px · desktop ≥1024px** (matches the existing 768 split and adds the tablet tier).

### A.2 Layout shells per tier

**Mobile (`<768px`)** — single-pane, app-shell model:
```
┌───────────────────────────┐
│ SceneHeader (compact)     │  ← location + time + HP strip only; buttons move to nav
├───────────────────────────┤
│                           │
│   Active Panel (1 of N)   │  ← fills viewport; swipe horizontally to change panel
│   [Chat | Combat | Sheet] │     (embla-carousel or framer-motion drag)
│                           │
├───────────────────────────┤
│ Contextual Quick Actions  │  ← changes per scene (see Area B); 44px taps
├───────────────────────────┤
│ ▶ Chat  ⚔️ Combat  📜 Sheet │  ← BottomNav (fixed, safe-area padding)
│      🗺️ More  ⚙️ Menu       │
└───────────────────────────┘
```
- Modals (Shop, Map, Content, Quests, AI-DM helper) become **`Drawer` (vaul)** from the bottom — full-height on mobile, ~85vh, draggable to dismiss. Replaces the 6 hand-rolled `.sheet-overlay` blocks.
- "More" opens a `Sheet` (side) listing the secondary actions (Map, Shop, Content, Quests, AI-DM, Save/Load, Settings).

**Tablet (768–1023px)** — two-pane:
- Left (60%): primary panel (Chat or Combat). Right (40%): secondary (Sheet/Map) as a persistent `Sheet`-like column.
- `react-resizable-panels` already installed — use it here.

**Desktop (≥1024px)** — three-column resizable workspace (current intent, but cleaned up):
- Left rail: navigation/scene header. Center: Chat or Combat. Right: Character sheet (persistent).
- `react-resizable-panels` for the columns; `sidebar.tsx` (already present) for the rail.

### A.3 Touch optimization
- **44×44px minimum tap targets** — add a global rule: `.btn { min-height:44px; min-width:44px; }` (currently buttons are `padding:10px 12px` ≈ 40px — just under). Bump mobile to `min-height:44px`.
- **BottomNav items 56px tall** with `env(safe-area-inset-bottom)` padding for iPhone home indicator.
- **Gesture support**: horizontal swipe to switch panels (framer-motion `drag="x"` with snap, or embla). Pinch-zoom + two-finger pan on the combat grid (see A.4). Swipe-down on Drawers to dismiss (vaul gives this free).
- **Active panel indicator dots** above the bottom nav (like iOS page dots) so swipe navigation is discoverable.

### A.4 Combat grid on small screens — three strategies, pick by context
The grid is 12×10. On a 360px phone, full grid = 30px cells (unusable). Solution = **pinch-zoom + pan canvas**, with a fallback "simplified" toggle:

1. **Default (mobile): zoomable canvas.** Render the grid inside a pan/zoom container (framer-motion `drag` + wheel/pinch via a small `usePinchZoom` hook or `@dnd-kit` is not needed; use a lightweight transform). Default zoom shows a 6×6 viewport; pinch to zoom; two-finger/drag to pan. Tap a token to select; tap a highlighted square to move.
2. **Movement-preview layer** overlays reachable squares (BFS from token up to `speed/5` squares, respecting occupied/blocked) — see Area C.
3. **"Theater" simplified toggle**: a button collapses the grid to a vertical enemy stack (enemy cards with HP bars, range indicators) for players who don't want tactics. Reuses existing `.enemy-card` styling. Combat still resolves identically via the engine (`cb.grid` is already abstract `{w,h}` + positions per worklog note "Combat ไม่ผูกกับ Grid").

**Tablet/desktop**: grid renders at native 12×10 with larger cells (≥40px), no zoom needed.

CSS specifically needed (new in `globals.css` after token centralization):
```css
.grid-viewport { overflow:hidden; touch-action:none; }       /* enables pinch/pan */
.grid-canvas  { transform-origin:0 0; will-change:transform; }
.cell         { min-width:36px; min-height:36px; }            /* scales with zoom */
@media (min-width:768px){ .cell{ min-width:40px; min-height:40px; } }
```

---

## B. Contextual UI (Quick Actions)

### B.1 Context model
Derive a `SceneContext` from existing state the component already tracks (`c.sceneType`, `combat`, `scene`, location tags). The narrative engine already emits `SceneType` (`town|building|room|dungeon|wilderness|combat|social`). Map it:

| `sceneType` / state | Quick Actions shown |
|---|---|
| `town` / `building` (shop/tavern/temple) | พูดคุย (Talk) · ร้านค้า (Shop) · พัก (Rest) · เดินทาง (Travel) · กระดานเควสต์ (Quest Board) |
| `combat` (truthy) | โจมตี (Attack) · เสกเวท (Spell) · ใช้ของ (Item) · เคลื่อนที่ (Move) · วิ่ง (Dash) · ตั้งรับ (Dodge) · หนี (Flee) |
| `dungeon` / `room` | ค้นหา (Search) · ฟังเสียง (Listen) · แฝงตัว (Move Stealthily) · เปิดประตู (Open Door) |
| `social` | โน้มน้าว (Persuade) · ขู่ (Intimidate) · หลอก (Deceive) · สังเกต (Insight) · ซื้อขาย (Trade) |
| `wilderness` (default/exploration) | เดินทาง (Travel) · สำรวจ (Search) · พัก (Rest) · ซ่อน (Stealth) · ดูแผนที่ (Map) |

### B.2 Implementation
- A `quickActions` selector in the Zustand store computes the action set from `{sceneType, inCombat}`.
- Render as a horizontally-scrollable strip of 44px pill buttons **above the bottom nav** (mobile) and as a contextual toolbar (desktop). Each button maps to either a pre-filled chat intent (`analyzeIntent` already classifies) or a direct engine action.
- **Context detection** = pure function `deriveSceneContext(state): SceneContext`. Combat overrides everything (when `combat` truthy → combat actions). Otherwise use `c.sceneType`. This keeps detection deterministic and testable — no extra AI round-trip.
- The existing header buttons (Shop, Map, Sheet, Quests, AI-DM, Content) are **removed from the header** and reorganized: the most contextually-relevant one appears in the Quick Actions strip; the rest live in the "More" sheet. This is what fixes "too many buttons visible at once".

---

## C. Combat UX Improvements

### C.1 Initiative timeline (visual)
- Horizontal scrollable timeline using the existing `cb.order` (initiative order). Each combatant = a pill avatar (`avatar.tsx`) sized 44px; current turn highlighted with a gold ring (`#E0A83E`). A small "⏭ 3 เทิร์น" countdown shows turns until the player acts.
- Place it as a sticky strip at the top of the Combat panel (replaces whatever initiative list exists today).

### C.2 Enemy HP bars on tokens
- Tokens already exist on the grid. Add a thin HP bar under each enemy token (reuse the `hpPctColor` helper at `DnDSolo.tsx:589`: green/amber/red). On mobile zoom view, show bars only when token is selected/zoomed to avoid clutter.

### C.3 Movement preview
- When the player taps "Move", run BFS over the grid from the player's position up to `⌊speed/5⌋` squares, skipping occupied cells and walls. Overlay reachable squares with a translucent teal (`#6FB3AB` at 30% alpha, matching the slot-pip color). Tap a square → animate token along path (framer-motion) → call existing movement code (`DnDSolo.tsx:1322` bounds logic).
- Show AoE preview for spells similarly (the `aoe.ts` Domain 29 already computes shapes — sphere/cube/cone/line/cylinder; reuse `COMMON_SPELL_AREAS`).

### C.4 Action buttons grouped by Action Economy
- Use `toggle-group.tsx` (already installed) with three segments: **Action / Bonus Action / Reaction**. Each segment lists the available actions of that type (the `actionSystem.ts` / `engine/actionEconomy.ts` modules already model action types). Disabled segments grey out when that action type is spent this turn.
- This directly satisfies "Action buttons grouped by type".

### C.5 Turn indicator banner
- A slim banner (`#1B1530` bg, gold left border) above the log: "🛡️ ถึงตาคุณแล้ว!" (Your Turn) or "⚔️ ตาศัตรู — ก็อบลินกำลังเคลื่อนที่..." (Enemy Turn — Goblin is moving...). Use framer-motion `AnimatePresence` for slide-in/out.
- Wire to the existing `emitTurnStart`/`emitTurnEnd` EventBus events (`engineAdapters.ts`).

### C.6 Auto-end turn + undo
- After the player takes one Action (and optionally a Bonus Action), show a subtle "จบเทิร์น ▶" prompt that auto-advances after 1.5s unless tapped to extend.
- Keep a one-step undo snapshot (`gameState.ts` already has `SaveSnapshot`/versioned state — reuse the snapshot pattern for a lightweight `prevTurnSnapshot` in the combat slice). Undo via `alert-dialog.tsx` confirmation or a 5-second `sonner` toast with an "เลิกทำ" (Undo) action button.

---

## D. DM Chat & Story Improvements

### D.1 Streaming DM responses
- Convert `/api/dm` (`src/app/api/dm/route.ts`) to return a **streaming response** (ReadableStream / SSE) from the GLM-4-Plus call (the `z-ai-web-dev-sdk` supports streaming). Client reads chunks and appends to the in-progress DM message with a typing cursor.
- The current "DM กำลังคิด..." thinking dots (`DnDSolo.tsx:3911`) stay until the first chunk, then become a live-updating bubble.
- This is the highest-impact "immersion" win and is filed under Phase 4 only because it touches the API route; the UI prep (a `<StreamingMessage>` component) can be staged in Phase 2.

### D.2 Story log with collapsible rounds
- Wrap the log (`DnDSolo.tsx:3904-3912`) in a virtualized list (see G.3). Group entries by scene/round and render each combat round as a collapsible `accordion.tsx` summary: "⚔️ รอบที่ 3 — โจมตีกอบลิน 14ดาเมจ". Expand to see roll tickets. Non-combat narration stays flat.
- Collapsed-by-default for rounds older than the current one; current round expanded.

### D.3 Quick reply suggestions
- After each DM response, show 3–4 suggested replies as tappable chips above the input. Generated from: (a) the contextual Quick Actions set (Area B), (b) the DM's `requires` field (the DM already emits `requires: ["..."]` prompts — surface them as chips), and (c) a small heuristic list per scene type.
- Low-cost: the `requires` array is already in the response shape — just render it.

### D.4 Visual scene header
- Promote the existing inline header chips (`DnDSolo.tsx:3864-3868`: 📍 scene, ⏰ time, 🌤️ weather, 🌍 environment, 🎬 sceneType) into a dedicated `<SceneHeader>` component with an icon + location name + time-of-day + weather. On mobile, compact to one row (location · time). This data already exists — it's purely a presentation extraction.

### D.5 Narration animations
- DM messages fade-in word-by-word (or sentence-by-sentence) via framer-motion. Respect `prefers-reduced-motion` (the existing CSS already partially does at line 3252 — extend it). Keep it subtle (150ms fade, 8px translate-y).

---

## E. Character Sheet Redesign

### E.1 Card-based layout + swipe
- Replace the current tabbed sheet (`.sheet-tabs` / `.sheet-tab`, lines 3236-3238) with **5 cards** in an `embla-carousel`: **Stats · Skills · Spells · Inventory · Features**. Swipe between them on mobile; tabs on desktop.
- Each card uses the existing `card.tsx` primitive (currently unused for the sheet).

### E.2 Visual status indicators
- **HP ring/bar** at top of Stats card (reuse `HPBar` component at line 590 + `progress.tsx`).
- **AC shield** — a styled badge (`badge.tsx`) shaped like a shield, top-right of Stats card.
- **Conditions as icons** — map each of the 15 conditions (`CONDITIONS_TH`) to an emoji/lucide icon row; tap for tooltip (`tooltip.tsx`) with the Thai description.

### E.3 Quick equip/unequip
- Inventory card items get a tap → `popover.tsx` menu: Equip / Unequip / Use / Drop. Calls existing `equipment.ts` / `inventory.ts` engine functions. The `wornHas` helper is already imported.

### E.4 Spell book as visual cards
- Each known spell = a mini-card with: **level badge** (`badge.tsx`, e.g. "Lv3"), **school color stripe** (8 schools → 8 colors; reuse chart palette `--chart-1..5` + 3 custom), spell name, cast-time, range. Tap opens details (already fetched via `fetchSpell`/`srd.ts`). The `.spell-row.known` style (line 3255) becomes a full card.

---

## F. Onboarding & Tutorial

### F.1 First-run overlay
- 3–4 step full-screen overlay (framer-motion) shown when no save exists (`!hasSave`): (1) "AI เป็น DM — คุยได้เหมือนเล่นจริง", (2) "โยนลูกเต๋า ต่อสู้บนกริด", (3) "เลือกปุ่มตามสถานการณ์", (4) "พร้อม? เลือกตัวละคร". Dismiss state persisted to `localStorage` (`onboarded_v1`).

### F.2 Tooltips on first encounter
- Use `tooltip.tsx` to annotate the first time each system appears (combat grid, spell book, shop). Track "seen" flags in localStorage. Lightweight: a `useTooltipTour` hook.

### F.3 "ทำอะไรได้บ้าง?" help button
- A persistent help affordance (in the "More" sheet on mobile, header icon on desktop) that opens a `command.tsx` (cmdk) palette listing context-appropriate suggestions, computed from the same `deriveSceneContext` selector as Quick Actions. Doubles as the shop search (F + G).

### F.4 Sample character quick-start
- Add 2–3 pre-made characters to the menu (`DnDSolo.tsx:3262` menu branch) — "นักรบ มือใหม่" (Fighter), "ผู้วิเศษ ผู้รอบรู้" (Wizard), "โจร ผู้แอบแฝง" (Rogue). Each calls `makeCharacter(...)` (line 88) with curated abilities/spells/equipment and jumps straight to play. Eliminates the character-creation friction for first-timers.

---

## G. Technical Architecture

### G.1 Break up DnDSolo.tsx — yes, decisively
The 4,972-line monolith must be split. Proposed tree (new files under `src/components/dnd/`):

```
app/page.tsx
└─ <DnDSoloApp/>                      (orchestrator; reads store, routes by phase)
   ├─ SceneHeader                      (location/time/weather/sceneType strip)
   ├─ MainViewport                     (responsive: 1/2/3 panes by breakpoint)
   │   ├─ [mobile] SwipeablePanels     (embla)  + BottomNav + MoreSheet
   │   ├─ [tablet] TwoPane             (react-resizable-panels)
   │   └─ [desktop] ThreePane          (react-resizable-panels + sidebar)
   ├─ panels/
   │   ├─ DMChatPanel
   │   │   ├─ StoryLog                 (virtualized + collapsible rounds)
   │   │   ├─ StreamingMessage
   │   │   ├─ QuickReplies
   │   │   └─ ChatInput
   │   ├─ CombatPanel
   │   │   ├─ TurnBanner
   │   │   ├─ InitiativeTimeline
   │   │   ├─ CombatGrid
   │   │   │   ├─ GridViewport        (pinch/pan container)
   │   │   │   ├─ TokenLayer           (tokens + HP bars + selection)
   │   │   │   └─ MovementPreview      (BFS reachable squares + AoE)
   │   │   └─ ActionBar                (Action/Bonus/Reaction toggle-group)
   │   ├─ CharacterPanel
   │   │   ├─ StatsCard  SkillsCard  SpellsCard  InventoryCard  FeaturesCard
   │   │   └─ StatusBadges             (HP ring, AC shield, condition icons)
   │   ├─ ShopPanel                    (cmdk search + category tabs)
   │   ├─ WorldMapPanel
   │   └─ ContentManagerPanel
   ├─ ContextualQuickActions           (strip, driven by deriveSceneContext)
   ├─ Drawers/ (Shop, Map, Content, Quests, AI-DM helper)   ← vaul Drawer
   └─ OnboardingOverlay + HelpPalette  (cmdk) + TooltipTour
```
Shared presentational atoms (`HPBar`, `RollTicket`, `Stamp`) extracted from the monolith as `src/components/dnd/atoms/*`.

### G.2 State management — migrate to Zustand (already installed)
Move the ~62 `useState` calls into typed slices with `persist` middleware (enables offline/PWA in Phase 3):

```
src/store/index.ts            — combine + persist
src/store/slices/gameSlice.ts    — phase, scene, location, gameTime, weather, sceneType
src/store/slices/combatSlice.ts  — cb, initiative, currentTurn, prevTurnSnapshot (undo)
src/store/slices/characterSlice.ts — c, asiPicks, conditions, slots
src/store/slices/chatSlice.ts    — log[], streaming text, thinking
src/store/slices/uiSlice.ts      — activePanel, drawerOpen, breakpoint, onboarded, tooltipTour
src/store/slices/worldSlice.ts   — map, quests, contentRegistry
```
Selective subscriptions (`useGameStore(s => s.combat)`) prevent the whole tree re-rendering on every HP tick. The engine adapters (`engineAdapters.ts`) dispatch into slices instead of calling `setC`/`setCombat` closures.

### G.3 Mobile performance
- **Virtualize the story log** (`@tanstack/react-virtual` — note: react-query is installed but react-virtual is NOT; add it, or hand-roll a windowed list). Long campaigns produce hundreds of log entries currently all rendered.
- **Lazy-load heavy panels**: `CombatPanel`, `ShopPanel`, `ContentManagerPanel`, `WorldMapPanel` via `next/dynamic` with `{ ssr:false }` — they're modal/secondary on mobile.
- **Memoize combat grid cells**; the grid re-renders on every state change today. Split into a `TokenLayer` that subscribes only to positions.
- **Persist + lazy-load SRD data**: `react-query` (installed, unused) caches Open5e spell/monster fetches across sessions.
- **Fonts via `next/font`** (self-host) instead of runtime Google `@import`.

### G.4 PWA
- `next-pwa`-style manifest: add `public/manifest.webmanifest`, icons, `theme_color:#0D0A14`, `background_color:#141020`, `display:standalone`. Register a service worker for offline shell + cached SRD JSON.
- The Zustand `persist` middleware (G.2) gives offline game-state; combine with `react-query` `persistQueryClient` for offline SRD lookups.
- "Install to home screen" prompt via `beforeinstallprompt`.

---

## Phased Implementation

Legend — Complexity: **S** (<½ day) · **M** (½–1 day) · **L** (1–2 days). Deps list task IDs.

### PHASE 1 — Quick Wins (1–2 days)
Goal: biggest perceived improvement per hour; no architecture risk.

| ID | Task | Files | Cx | Deps | Risk |
|----|------|-------|----|------|------|
| P1.1 | **Centralize theme** into `globals.css`: add dark-fantasy tokens to `.dark` (and a `.dnd` scope) — bg `#141020`, panel `#1E1830`, gold `#E0A83E`, HP colors, parchment `#EAE0CC`, borders. Remove the `css` string from DnDSolo.tsx; replace `className` references. | `globals.css`, `DnDSolo.tsx:3191-3256` (delete), all `style={{color:"#E0A83E"}}`→class | M | — | Low; large mechanical find/replace. **Regression test all screens visually.** |
| P1.2 | **Move fonts to `next/font`** (Cinzel + Sarabun, self-hosted); remove the runtime `@import` in the deleted CSS string. | `src/app/layout.tsx`, `DnDSolo.tsx` | S | P1.1 | Low |
| P1.3 | **Extend breakpoint hook**: add `use-breakpoint.ts` (mobile/tablet/desktop); keep `useIsMobile` alias. | `src/hooks/use-breakpoint.ts` | S | — | None |
| P1.4 | **44px tap targets**: global `.btn{min-height:44px}` (mobile), bump bottom-nav/drawer items. | `globals.css` | S | P1.1 | Low |
| P1.5 | **Collapse header buttons → "More" menu**: wrap the 6 header buttons (`DnDSolo.tsx:3871-3877`) into a `Sheet`/overflow on mobile; show only the most context-relevant one inline. Immediate fix for "too many buttons". | `DnDSolo.tsx:3857-3901` | M | P1.3 | Low |
| P1.6 | **Shop search**: add a `command.tsx` (cmdk) search box at top of the Shop modal filtering weapons/armor/magic/consumables by name. | `DnDSolo.tsx:3976+` (shop branch) | M | — | Low; cmdk already installed. |
| P1.7 | **Quick-reply chips from `requires`**: render the DM response's `requires[]` array as tappable chips above the input. | `DnDSolo.tsx` chat input area | S | — | Low; data already present. |
| P1.8 | **Sample characters**: add 3 pre-mades to the menu branch calling `makeCharacter(...)`. | `DnDSolo.tsx:3262` menu | S | — | None |
| P1.9 | **Compact SceneHeader on mobile**: one-row location·time; hide secondary chips behind tap. | `DnDSolo.tsx:3856-3901` | S | P1.5 | Low |

**Phase 1 exit criteria:** phone-width (375px) header no longer overflows; shop searchable; theme no longer inline; fonts self-hosted; first-timer can start in 1 tap.

---

### PHASE 2 — Core UX (3–5 days)
Goal: layout restructure, contextual UI, combat improvements. Depends on P1.1 (tokens) and P1.3 (breakpoints).

| ID | Task | Files | Cx | Deps | Risk |
|----|------|-------|----|------|------|
| P2.1 | **Zustand store + slices** (G.2). Migrate the ~62 useState into `gameSlice/combatSlice/characterSlice/chatSlice/uiSlice/worldSlice`. Keep DnDSolo.tsx as a thin shell reading the store for this phase (don't fully split yet). | `src/store/*`, `DnDSolo.tsx` | L | P1.1 | **High** — large mechanical migration; risk of subtle state-binding regressions. Mitigate: migrate slice-by-slice, keep a parallel `useState` fallback, run combat/leveling test scripts. |
| P2.2 | **BottomNav + SwipeablePanels** (mobile shell, A.2). 3 primary panels (Chat/Combat/Sheet) in an embla carousel; `More` opens a `Sheet`. | `src/components/dnd/BottomNav.tsx`, `SwipeablePanels.tsx` | M | P2.1, P1.3 | Med — must preserve current single-pane behavior on desktop. |
| P2.3 | **Replace 6 modals with `Drawer`** (vaul) — Shop, Map, Content, Quests, AI-DM helper, ASI. Reuse `.sheet-modal` styling as Drawer content. | `DnDSolo.tsx:3942,3976,4176,4337,4435`, `src/components/dnd/Drawers/*` | M | P2.1 | Low |
| P2.4 | **`deriveSceneContext` + ContextualQuickActions** strip (Area B). Pure selector in `uiSlice`; renders action pills above BottomNav. | `src/lib/sceneContext.ts`, `src/components/dnd/ContextualQuickActions.tsx` | M | P2.1 | Low |
| P2.5 | **Desktop/tablet panes** via `react-resizable-panels` (A.2). | `src/components/dnd/MainViewport.tsx` | M | P2.2 | Med |
| P2.6 | **Combat grid zoom/pan viewport** (A.4): wrap grid in `GridViewport` (pinch/drag), default 6×6 view on mobile, theater-toggle fallback. | `src/components/dnd/CombatGrid/GridViewport.tsx` | L | P2.2 | **High** — coordinate transforms + tap-vs-pan disambiguation. Mitigate: use a vetted lib (e.g. `react-zoom-pan-pinch`) instead of hand-rolling. |
| P2.7 | **Movement preview** (C.3): BFS reachable squares + AoE overlay (reuse `aoe.ts`). | `MovementPreview.tsx`, `src/lib/movement.ts` | M | P2.6 | Med |
| P2.8 | **InitiativeTimeline + TurnBanner** (C.1, C.5): horizontal avatar pills + framer-motion banner wired to `emitTurnStart/End`. | `InitiativeTimeline.tsx`, `TurnBanner.tsx` | M | P2.1 | Low |
| P2.9 | **Enemy HP bars on tokens** (C.2): thin bar under token, reuse `hpPctColor` (line 589). | `TokenLayer.tsx` | S | P2.6 | Low |
| P2.10 | **ActionBar grouped by action economy** (C.4): `toggle-group.tsx` Action/Bonus/Reaction. | `ActionBar.tsx`, `src/lib/actionSystem.ts` | M | P2.1 | Med — depends on actionSystem tagging actions by type. |
| P2.11 | **StreamingMessage UI prep** (D.1 client side): a component that renders progressively-arriving text (works against current non-streaming response too). | `StreamingMessage.tsx` | S | P2.1 | Low |

**Phase 2 exit criteria:** on a phone you can play full combat with a zoomable grid, see whose turn it is, preview movement, and the UI offers the right actions for the scene; desktop keeps a multi-pane layout.

---

### PHASE 3 — Polish (3–5 days)
Goal: character sheet, onboarding, animations, PWA. Depends on P2.1 (store) and P2.3 (Drawer).

| ID | Task | Files | Cx | Deps | Risk |
|----|------|-------|----|------|------|
| P3.1 | **Character sheet → 5 swipeable cards** (E.1–E.4): Stats/Skills/Spells/Inventory/Features via embla; visual HP ring + AC shield + condition icons; equip/unequip popover; spell cards with school color. | `src/components/dnd/CharacterPanel/*` | L | P2.1, P2.3 | Med — large extraction from current sheet tab code. |
| P3.2 | **Story log collapsible rounds + virtualization** (D.2): accordion per round; windowed list. | `StoryLog.tsx`; add `@tanstack/react-virtual` | M | P2.1 | Med — virtualization with variable-height roll tickets. |
| P3.3 | **Narration fade-in animations** (D.5): framer-motion word/sentence fade; honor `prefers-reduced-motion`. | `StreamingMessage.tsx`, `StoryLog.tsx` | S | P3.2 | Low |
| P3.4 | **Onboarding overlay + tooltip tour** (F.1, F.2): 4-step first-run; `useTooltipTour` with localStorage flags. | `OnboardingOverlay.tsx`, `src/hooks/use-tooltip-tour.ts` | M | P2.2 | Low |
| P3.5 | **Help palette ("ทำอะไรได้บ้าง?")** (F.3): cmdk `Command` palette with context suggestions; reuse `deriveSceneContext`. | `HelpPalette.tsx` | M | P2.4 | Low |
| P3.6 | **PWA**: manifest + service worker + icons; Zustand `persist` + react-query `persistQueryClient` for offline. | `public/manifest.webmanifest`, `next.config.ts`, SW | M | P2.1 | Med — SW caching strategy must not serve stale SRD; version the cache. |
| P3.7 | **Scene continuity payload to `/api/dm`** (D / stated pain): send a compact context block (location, sceneType, gameTime, last 3 log summaries, active quests, party state) with each DM call. Modify the prompt builder. | `src/app/api/dm/route.ts`, `src/lib/dialogue.ts`, `DnDSolo.tsx` call sites | M | P2.1 | Med — prompt-size budget; summarize log server-side to avoid token bloat. |

**Phase 3 exit criteria:** installable PWA; new player onboarded in <60s; character sheet is card-based and swipeable; DM remembers the scene across turns.

---

### PHASE 4 — Advanced (ongoing)
Goal: streaming, voice, deeper AI DM.

| ID | Task | Files | Cx | Deps | Risk |
|----|------|-------|----|------|------|
| P4.1 | **Server-side streaming** for `/api/dm` (D.1): ReadableStream/SSE from GLM-4-Plus; client `StreamingMessage` consumes it. | `src/app/api/dm/route.ts`, `ChatInput` | L | P2.11 | Med — SDK streaming API; must keep intent classification (`/api/intent`) working pre-stream. |
| P4.2 | **Voice I/O** (TTS narration + mic input via Web Speech / the TTS & ASR skills). | new module | L | P4.1 | Med — latency & permission UX. |
| P4.3 | **DM memory/summary store**: persist rolling scene summaries to Prisma (`prisma/schema.prisma`) so continuity survives reloads; feed into P3.7 payload. | `src/lib/dialogue.ts`, `prisma/schema.prisma` | L | P3.7 | Med |
| P4.4 | **Advanced tactical AI polish**: surface the existing `planning.ts` "AI log" (Domain 32) as optional combat commentary; difficulty tuning. | `CombatPanel` | M | P2.8 | Low |
| P4.5 | **Analytics/telemetry** (opt-in) on which actions players use → refine Quick Actions. | new | M | P2.4 | Low (privacy) |

---

## Recommended sequencing & critical path
```
P1.1 ─┬─ P1.2
      ├─ P1.4 ─ P1.5 ─ P1.9
      └─ P1.3 ─┐
                ├─ P2.1 (store) ─┬─ P2.2 ─ P2.5
                │                ├─ P2.3
                │                ├─ P2.4 (quick actions)
                │                ├─ P2.8 (initiative/banner)
                │                ├─ P2.10 (action bar)
                │                └─ P2.11 ─ P4.1 (streaming)
                └─ P2.6 (grid zoom) ─ P2.7 (move preview) ─ P2.9 (HP bars)
P1.6, P1.7, P1.8 — independent, do anytime in Phase 1.
P3.* — after P2.1; P3.7 can start in parallel with P3.1.
```
**Critical path:** P1.1 → P1.3 → P2.1 → P2.2 → P2.6 → (rest of combat). The store migration (P2.1) and grid zoom (P2.6) are the two highest-risk, highest-value items — schedule them first inside Phase 2 with dedicated test runs (the repo has `scripts/test_combat.ts`, `test_engine_all.ts` to lean on).

## Top risk callouts
1. **P2.1 (store migration)** — largest blast radius. Migrate slice-by-slice; keep the engine test scripts green after each slice.
2. **P2.6 (grid pinch/pan)** — hand-rolled transforms are bug-prone. **Use `react-zoom-pan-pinch`** (add dep) rather than building from framer-motion drag.
3. **P1.1 (theme centralization)** — hundreds of inline `style={{color:"#E0A83E"}}` to convert; easy to miss spots. Do a grep-sweep for the hex literals afterward (the palette is enumerated in §0).
4. **P3.7 / P4.1 (DM changes)** — prompt/token budget; summarize logs server-side; keep `/api/intent` non-streaming so intent routing stays fast.
5. **Thai copy** — all new strings must be Thai; keep a glossary so "Talk/Shop/Rest" translations stay consistent with existing labels (e.g. ร้านค้า, พัก, เดินทาง already used in code).

## "Definition of done" for the overhaul
- Playable end-to-end on a 375px phone with one thumb (chat → combat → loot → level up) with no horizontal scroll except the combat grid.
- Header shows ≤2 buttons on mobile; context actions surface automatically.
- Grid is pinch-zoomable with movement preview; initiative & turn banner always visible in combat.
- App is installable (PWA) and resumable offline from last save.
- `DnDSolo.tsx` is ≤ ~400 lines (orchestrator); all surfaces live in `src/components/dnd/*` reading a typed Zustand store.
