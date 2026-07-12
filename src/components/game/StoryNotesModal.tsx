"use client";

/**
 * Story Notes modal — Story Notes v2 Wave 2.
 *
 * Presentational shell following the QuestJournalModal template: self-guards on
 * `open`, list + a small add/edit form. Story Notes are narrative continuity only
 * (src/lib/engine/storyNotes.ts) — this component never touches HP/inventory/
 * position/quest state, it only calls the upsert/remove callbacks the parent
 * wires to the pure storyNotes lib.
 *
 * Review finding 5 (visibility filter): `visibility:"dm-only"` notes are DM-authored
 * continuity the player must not see — they are filtered out of the displayed list
 * entirely, so the player can never open or edit one from here.
 */
import React, { useState } from "react";
import { type StoryNote, type StoryNotePriority, type StoryNoteStatus } from "@/lib/engine/storyNotes";

export interface StoryNotesModalProps {
  open: boolean;
  onClose: () => void;
  notes: StoryNote[];
  onUpsert: (note: Omit<StoryNote, "updatedAt" | "id"> & { id?: string }) => void;
  onRemove: (id: string) => void;
}

const PRIORITY_TH: Record<StoryNotePriority, string> = { high: "สูง", normal: "ปกติ", low: "ต่ำ" };
const STATUS_TH: Record<StoryNoteStatus, string> = { active: "ดำเนินอยู่", resolved: "จบแล้ว", archived: "เก็บถาวร" };
const STATUS_COLOR: Record<StoryNoteStatus, string> = { active: "#E0A83E", resolved: "#7FA85C", archived: "#6B6284" };

function emptyDraft() {
  return { title: "", body: "", status: "active" as StoryNoteStatus, priority: "normal" as StoryNotePriority };
}

export default function StoryNotesModal({ open, onClose, notes, onUpsert, onRemove }: StoryNotesModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft());

  if (!open) return null;

  // Never surface DM-only continuity to the player (review finding 5).
  const visibleNotes = notes.filter((n) => n.visibility !== "dm-only").sort((a, b) => b.updatedAt - a.updatedAt);

  function startEdit(note: StoryNote) {
    setEditingId(note.id);
    setDraft({ title: note.title, body: note.body, status: note.status, priority: note.priority });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(emptyDraft());
  }

  function submit() {
    if (!draft.title.trim()) return;
    const editing = editingId ? notes.find((n) => n.id === editingId) : undefined;
    onUpsert({
      id: editingId ?? undefined,
      title: draft.title.trim(),
      body: draft.body.trim(),
      status: draft.status,
      priority: draft.priority,
      // Preserve provenance/visibility of an edited note; new notes are always
      // player-authored + player-visible (players cannot author dm-only notes).
      source: editing?.source ?? "player",
      visibility: editing?.visibility ?? "player",
      linkedEntityIds: editing?.linkedEntityIds ?? [],
    });
    cancelEdit();
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
          <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>📝 Story Notes</span>
          <button className="btn" style={{ padding: "4px 12px" }} onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">
          <div style={{ fontSize: 12, color: "#8A7F9E", marginBottom: 10 }}>
            บันทึกเรื่องราว/เธรดที่ต้องติดตาม — เป็นข้อมูลเสริมให้ DM เท่านั้น ไม่มีผลต่อ HP/ไอเทม/สถานะเกม
          </div>

          {/* Add / edit form */}
          <div style={{ border: "1px solid #3A2F5C", borderRadius: 8, padding: 10, marginBottom: 12 }}>
            <input className="input-main" placeholder="หัวข้อ" value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              style={{ fontSize: 13, padding: "6px 10px", marginBottom: 6, width: "100%" }} />
            <textarea className="input-main" placeholder="รายละเอียด"
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              style={{ width: "100%", fontSize: 13, minHeight: 60, resize: "vertical", marginBottom: 6 }} />
            <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
              {(Object.keys(PRIORITY_TH) as StoryNotePriority[]).map((p) => (
                <button key={p} className={"btn" + (draft.priority === p ? " btn-gold" : "")}
                  style={{ fontSize: 11, padding: "4px 8px" }}
                  onClick={() => setDraft({ ...draft, priority: p })}>ความสำคัญ: {PRIORITY_TH[p]}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
              {(Object.keys(STATUS_TH) as StoryNoteStatus[]).map((s) => (
                <button key={s} className={"btn" + (draft.status === s ? " btn-gold" : "")}
                  style={{ fontSize: 11, padding: "4px 8px" }}
                  onClick={() => setDraft({ ...draft, status: s })}>{STATUS_TH[s]}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-gold" style={{ fontSize: 13, padding: "6px 14px" }}
                disabled={!draft.title.trim()} onClick={submit}>
                {editingId ? "บันทึกการแก้ไข" : "+ เพิ่มบันทึก"}
              </button>
              {editingId && (
                <button className="btn" style={{ fontSize: 13, padding: "6px 14px" }} onClick={cancelEdit}>ยกเลิก</button>
              )}
            </div>
          </div>

          {/* Notes list */}
          {visibleNotes.length === 0 ? (
            <div style={{ fontSize: 13, color: "#8A7F9E", textAlign: "center", padding: 30 }}>ยังไม่มีบันทึก — เพิ่มบันทึกแรกของคุณด้านบน</div>
          ) : (
            visibleNotes.map((note) => (
              <div key={note.id} className="item-row" style={{ marginBottom: 8, borderLeft: `3px solid ${STATUS_COLOR[note.status]}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: STATUS_COLOR[note.status] }}>{note.title}</div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button className="btn" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => startEdit(note)}>แก้ไข</button>
                    <button className="btn btn-red" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => onRemove(note.id)}>ลบ</button>
                  </div>
                </div>
                {note.body && <div style={{ fontSize: 12, color: "#9C92B8", marginTop: 4 }}>{note.body}</div>}
                <div style={{ fontSize: 10, color: "#6B6284", marginTop: 4 }}>
                  {STATUS_TH[note.status]} · ความสำคัญ: {PRIORITY_TH[note.priority]}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
