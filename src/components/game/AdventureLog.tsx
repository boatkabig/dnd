"use client";

import React from "react";
import { RollTicket } from "../DnDSolo";

export interface AdventureLogProps {
  log: any[];
  thinking: boolean;
  logRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

export default function AdventureLog({ log, thinking, logRef, onScroll }: AdventureLogProps) {
  return (
    <div ref={logRef} onScroll={onScroll} style={{ flex: 1, overflowY: "auto", padding: "10px 14px", maxWidth: 640, width: "100%", margin: "0 auto", boxSizing: "border-box", minHeight: 0 }}>
      {/* Phase 0 fix: window log to last 80 entries on render (full log kept in state for persistence) */}
      {log.slice(-80).map((e) => {
        if (e.type === "dm") return <div key={e.id} className="msg-dm">{e.text}</div>;
        if (e.type === "player") return <div key={e.id} className="msg-player">{e.text}</div>;
        if (e.type === "roll") return <RollTicket key={e.id} entry={e} />;
        return <div key={e.id} className="msg-system">— {e.text} —</div>;
      })}
      {thinking && <div className="msg-system thinking-dots">DM กำลังคิด<span>.</span><span>.</span><span>.</span></div>}
    </div>
  );
}
