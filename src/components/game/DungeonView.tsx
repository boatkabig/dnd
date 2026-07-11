"use client";

import React from "react";
import {
  getVisibleDungeonInfo, getRoomRoleIcon, getConnectionTypeLabel,
  type DungeonBlueprint, type DungeonRunState, type RoomConnection,
} from "@/lib/dungeon";

export interface DungeonViewProps {
  dungeonBlueprint: DungeonBlueprint;
  dungeonRun: DungeonRunState;
  setDungeonMapOpen: (open: boolean) => void;
}

export default function DungeonView({ dungeonBlueprint, dungeonRun, setDungeonMapOpen }: DungeonViewProps) {
        const info = getVisibleDungeonInfo(dungeonRun, dungeonBlueprint);
        const visibleRooms = info.visibleRooms;
        const CELL = 100, PAD = 50;
        // Calculate layout: place rooms in a grid based on connection topology
        // Use a simple BFS layout from entrance
        const roomPositions: Record<string, { x: number; y: number }> = {};
        const entrance = dungeonBlueprint.rooms.find((r) => r.id === dungeonBlueprint.entranceRoomId);
        if (entrance) {
          roomPositions[entrance.id] = { x: 0, y: 0 };
          const queue: Array<{ id: string; depth: number; siblingIdx: number }> = [{ id: entrance.id, depth: 0, siblingIdx: 0 }];
          const visited = new Set<string>([entrance.id]);
          const depthCounts: Record<number, number> = { 0: 1 };
          while (queue.length > 0) {
            const cur = queue.shift()!;
            for (const conn of dungeonBlueprint.connections) {
              let otherId: string | null = null;
              if (conn.from === cur.id && !visited.has(conn.to)) otherId = conn.to;
              else if (conn.to === cur.id && !visited.has(conn.from)) otherId = conn.from;
              if (!otherId) continue;
              // Skip secret connections unless discovered
              if (conn.isSecret && !dungeonRun.discoveredSecretConnectionIds.includes(conn.id)) continue;
              visited.add(otherId);
              const nextDepth = cur.depth + 1;
              depthCounts[nextDepth] = (depthCounts[nextDepth] || 0) + 1;
              // Layout: x = depth * 2, y = siblingIdx
              roomPositions[otherId] = { x: nextDepth, y: depthCounts[nextDepth] - 1 };
              queue.push({ id: otherId, depth: nextDepth, siblingIdx: depthCounts[nextDepth] - 1 });
            }
          }
        }
        // Adjust y to center each depth column
        const depthRooms: Record<number, string[]> = {};
        for (const [id, pos] of Object.entries(roomPositions)) {
          if (!depthRooms[pos.x]) depthRooms[pos.x] = [];
          depthRooms[pos.x].push(id);
        }
        // Recenter y for each depth
        for (const [id, pos] of Object.entries(roomPositions)) {
          const siblings = depthRooms[pos.x];
          const total = siblings.length;
          const idx = siblings.indexOf(id);
          roomPositions[id] = { x: pos.x, y: idx - (total - 1) / 2 };
        }
        // Only include visible rooms
        const visibleIds = new Set(visibleRooms.map((r) => r.roomId));
        const visiblePositions = Object.entries(roomPositions).filter(([id]) => visibleIds.has(id));
        if (visiblePositions.length === 0) return null;
        const xs = visiblePositions.map(([, p]) => p.x);
        const ys = visiblePositions.map(([, p]) => p.y);
        const minX = Math.min(...xs), minY = Math.min(...ys);
        const maxX = Math.max(...xs), maxY = Math.max(...ys);
        const W = (maxX - minX + 1) * CELL + PAD * 2;
        const H = (maxY - minY + 1) * CELL + PAD * 2;
        const px = (p: { x: number; y: number }) => (p.x - minX) * CELL + PAD + CELL / 2;
        const py = (p: { x: number; y: number }) => (p.y - minY) * CELL + PAD + CELL / 2;
        return (
          <div className="sheet-overlay" onClick={() => setDungeonMapOpen(false)}>
            <div className="sheet-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px" }}>
                <div>
                  <span className="dnd-display" style={{ fontSize: 18, color: "#E0A83E" }}>🏰 {dungeonBlueprint.name}</span>
                  <span style={{ fontSize: 11, color: "#8A7F9E", marginLeft: 8 }}>Theme: {dungeonBlueprint.theme} · แนะนำ Lv.{dungeonBlueprint.recommendedLevel}</span>
                </div>
                <button className="btn" style={{ padding: "4px 12px" }} onClick={() => setDungeonMapOpen(false)}>✕</button>
              </div>
              <div className="sheet-body" style={{ overflow: "auto" }}>
                {/* Progress panel */}
                <div style={{ padding: "8px 12px", background: "#1A142A", borderRadius: 6, marginBottom: 10, fontSize: 12 }}>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span style={{ color: "#7FA85C" }}>✓ Cleared: <b>{dungeonRun.roomsCleared}/{dungeonRun.totalRooms}</b></span>
                    <span style={{ color: dungeonRun.bossDefeated ? "#7FA85C" : "#C74B44" }}>{dungeonRun.bossDefeated ? "🏆 Boss defeated" : "💀 Boss: " + (dungeonRun.hasReachedBoss ? "encountered" : "not yet")}</span>
                    <span style={{ color: "#E0A83E" }}>❓ Secrets: <b>{dungeonRun.secretsFound}/{dungeonRun.totalSecrets}</b></span>
                    <span style={{ color: "#9C92B8" }}>Progress: <b>{Math.round(dungeonRun.progress * 100)}%</b></span>
                  </div>
                  {dungeonBlueprint.hook && <div style={{ marginTop: 4, fontSize: 11, color: "#8A7F9E" }}>📜 {dungeonBlueprint.hook}</div>}
                </div>
                {/* SVG map */}
                <svg width={Math.max(W, 300)} height={Math.max(H, 200)} style={{ display: "block", margin: "0 auto" }}>
                  {/* Connections */}
                  {dungeonBlueprint.connections.map((conn: RoomConnection) => {
                    const fromPos = roomPositions[conn.from];
                    const toPos = roomPositions[conn.to];
                    if (!fromPos || !toPos) return null;
                    // Hide secret connections unless discovered
                    if (conn.isSecret && !dungeonRun.discoveredSecretConnectionIds.includes(conn.id)) return null;
                    // Hide if either endpoint isn't visible
                    if (!visibleIds.has(conn.from) || !visibleIds.has(conn.to)) return null;
                    const isDiscoveredSecret = conn.isSecret && dungeonRun.discoveredSecretConnectionIds.includes(conn.id);
                    const isLocked = conn.isLocked;
                    return (
                      <line
                        key={conn.id}
                        x1={px(fromPos)} y1={py(fromPos)}
                        x2={px(toPos)} y2={py(toPos)}
                        stroke={isDiscoveredSecret ? "#B97EE5" : isLocked ? "#C74B44" : "#4A3F6E"}
                        strokeWidth="2.5"
                        strokeDasharray={isDiscoveredSecret ? "3 3" : "5 4"}
                      />
                    );
                  })}
                  {/* Rooms */}
                  {visibleRooms.map((r) => {
                    const pos = roomPositions[r.roomId];
                    if (!pos) return null;
                    const isCurrent = r.isCurrent;
                    const isVisited = r.visited;
                    const isCleared = dungeonRun.clearedRoomIds.includes(r.roomId);
                    const isBoss = r.roomId === dungeonBlueprint.bossRoomId;
                    const isSecretDiscovered = r.isSecretDiscovered;
                    // Find room to get role icon
                    const room = dungeonBlueprint.rooms.find((rr) => rr.id === r.roomId);
                    const roleIcon = room ? getRoomRoleIcon(room.role) : "📍";
                    const fill = isCurrent ? "#3A2F5C" : isCleared ? "#1A3A2A" : isVisited ? "#2A2040" : "#221C38";
                    const stroke = isCurrent ? "#E0A83E" : isCleared ? "#7FA85C" : isBoss ? "#C74B44" : isSecretDiscovered ? "#B97EE5" : "#3A3054";
                    return (
                      <g key={r.roomId}>
                        {isCurrent && <circle cx={px(pos)} cy={py(pos)} r="32" fill="none" stroke="#E0A83E" strokeWidth="2.5" opacity="0.9" />}
                        <rect
                          x={px(pos) - 28} y={py(pos) - 22}
                          width="56" height="44" rx="6"
                          fill={fill} stroke={stroke} strokeWidth="2"
                          opacity={isVisited || isCurrent ? 1 : 0.5}
                        />
                        <text x={px(pos)} y={py(pos) - 2} textAnchor="middle" fontSize="16">{roleIcon}</text>
                        <text x={px(pos)} y={py(pos) + 14} textAnchor="middle" fontSize="9" fill={isCurrent ? "#E0A83E" : isCleared ? "#7FA85C" : "#C9BFE0"} fontFamily="Sarabun" fontWeight={isCurrent ? "700" : "500"}>
                          {(isVisited || isCurrent) ? r.name.slice(0, 8) : "❓"}
                        </text>
                        {isCleared && <text x={px(pos) + 22} y={py(pos) - 18} fontSize="13">✓</text>}
                        {isBoss && !isCleared && <text x={px(pos) + 22} y={py(pos) - 18} fontSize="13">💀</text>}
                      </g>
                    );
                  })}
                </svg>
                {/* Available exits from current room */}
                {info.availableExits.length > 0 && (
                  <div style={{ marginTop: 14, padding: "8px 12px", background: "#1A142A", borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: "#8A7F9E", marginBottom: 6 }}>ทางออกจากห้องปัจจุบัน:</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {info.availableExits.map((exit) => (
                        <span key={exit.connection.id} style={{
                          fontSize: 11, padding: "3px 8px",
                          background: exit.isLocked ? "#3A1A2A" : exit.isSecret ? "#2A1A3A" : "#1A2A3A",
                          border: `1px solid ${exit.isLocked ? "#7A3B5E" : exit.isSecret ? "#7A5EB0" : "#3B6E7A"}`,
                          borderRadius: 4, color: "#C9BFE0",
                        }}>
                          {exit.isSecret ? "🔓 " : exit.isLocked ? "🔒 " : ""}{exit.connection.direction.toUpperCase()} → {getConnectionTypeLabel(exit.connection.type)}
                          {exit.destinationRoom ? ` · ${exit.destinationRoom.name}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Legend */}
                <div style={{ fontSize: 11, color: "#8A7F9E", textAlign: "center", marginTop: 10, lineHeight: 1.7 }}>
                  🚪 entrance · 🧩 puzzle · ⚠️ setback · 💀 climax/boss · 💎 reward → transition · ❓ secret<br/>
                  วงทอง = ห้องปัจจุบัน · เขียว = ผ่านแล้ว · แดง = บอส · ม่วง = ความลับที่ค้นพบ · จาง = ยังไม่เคยไป
                </div>
              </div>
            </div>
          </div>
        );
}
