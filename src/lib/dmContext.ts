/**
 * DM context hygiene.
 *
 * Every exploration turn embeds a full ephemeral snapshot into the user message
 * that is sent to the DM and then KEPT in `history`:
 *
 *   [CURRENT SCENE: …]\n[STORY CONTEXT: …]\n[สถานะ: HP …, gold …, …]…\nPlayer: <text>
 *
 * That snapshot (scene anchor, story context, HP/gold/quest status, intent hint,
 * dungeon hint) is only true for the turn that produced it. Because it stays in
 * history, every later DM call re-sends a stack of FROZEN, now-stale snapshots —
 * a dozen conflicting "current HP/gold" lines, old quest counts, old scenes. That
 * wastes tokens and actively confuses the model about what the present state is.
 *
 * `sanitizeDmHistory` keeps the snapshot only on the MOST RECENT snapshot-bearing
 * message (the genuinely-current state) and reduces every older one to its durable
 * tail — the `Player: <text>` line that carries real narrative continuity. It is
 * pure and non-destructive: it returns a new array and never mutates the stored
 * history, so save files stay byte-for-byte compatible and are cleaned on send.
 */

/** Prelude marker that opens an exploration status blob (see sceneAnchor in DnDSolo). */
const BLOB_PREFIX = "[CURRENT SCENE:";
/** Anchor separating the ephemeral prelude from the durable player action line. */
const PLAYER_ANCHOR = "\nPlayer:";

/** A user message carrying the ephemeral exploration status blob. */
function isSnapshotMessage(m: { role?: string; content?: unknown }): boolean {
  return (
    m?.role === "user" &&
    typeof m.content === "string" &&
    m.content.startsWith(BLOB_PREFIX) &&
    m.content.includes(PLAYER_ANCHOR)
  );
}

/** Reduce a snapshot message's content to just its durable `Player: <text>` tail. */
function durableTail(content: string): string {
  const at = content.indexOf(PLAYER_ANCHOR);
  // Drop the leading "\n" so the result starts exactly at "Player:".
  return at >= 0 ? content.slice(at + 1) : content;
}

/**
 * Strip stale status blobs from all snapshot messages EXCEPT the latest one.
 * Returns a new array; input and its messages are never mutated. Non-snapshot
 * messages (assistant JSON, [ผลทอย] results, combat free-actions) pass through
 * untouched.
 */
export function sanitizeDmHistory<T extends { role?: string; content?: unknown }>(messages: T[]): T[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  // Index of the most recent snapshot message — its blob is the current state, keep it.
  let lastSnapshotIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isSnapshotMessage(messages[i])) { lastSnapshotIdx = i; break; }
  }
  if (lastSnapshotIdx <= 0) return messages; // 0 or 1 snapshot → nothing older to strip.

  return messages.map((m, i) => {
    if (i < lastSnapshotIdx && isSnapshotMessage(m)) {
      return { ...m, content: durableTail(m.content as string) };
    }
    return m;
  });
}
