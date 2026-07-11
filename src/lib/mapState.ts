"use client";

/**
 * Fog-of-war world-map engine — extracted from DnDSolo.tsx (de-monolith refactor).
 *
 * Pure map transforms with no component state: emptyMap (blank graph),
 * applyMapUpdate (incremental discovery: add_location / connect / move_to), and
 * applyWorldMap (lay out a whole world_map array with auto-positioning + fog).
 * Each returns a NEW map; an optional pushEntry callback surfaces log lines.
 * Moved verbatim — no behavior change.
 */
import { DIRV, MAP_ICON } from "./gameData";

export function emptyMap() { return { nodes: {} as Record<string, any>, edges: [] as [string, string][], current: null as string | null }; }

export function applyMapUpdate(mu: any, mp: any, pushEntry?: (t: string) => void) {
  if (!mu) return mp;
  const m = mp ? { nodes: { ...mp.nodes }, edges: mp.edges.slice(), current: mp.current } : emptyMap();
  const al = mu.add_location;
  if (al && al.id) {
    if (!m.nodes[al.id]) {
      let x = 0, y = 0;
      const fromId = al.from && m.nodes[al.from] ? al.from : m.current;
      if (fromId && m.nodes[fromId]) {
        const v = DIRV[al.dir] || [1, 0];
        x = m.nodes[fromId].x + v[0];
        y = m.nodes[fromId].y + v[1];
        let guard = 0;
        while (Object.values(m.nodes).some((n: any) => n.x === x && n.y === y) && guard < 10) { x += 1; guard += 1; }
        m.edges.push([fromId, al.id]);
      }
      m.nodes[al.id] = { name: al.name || al.id, type: MAP_ICON[al.type] ? al.type : "place", x, y };
      if (pushEntry) pushEntry(`🗺️ Discovered new location: ${al.name || al.id}`);
    } else if (m.current && m.current !== al.id && !m.edges.some(([a, b]) => (a === m.current && b === al.id) || (a === al.id && b === m.current))) {
      m.edges.push([m.current, al.id]);
    }
  }
  if (mu.connect && Array.isArray(mu.connect) && mu.connect.length === 2 && m.nodes[mu.connect[0]] && m.nodes[mu.connect[1]]) {
    if (!m.edges.some(([a, b]) => (a === mu.connect[0] && b === mu.connect[1]) || (a === mu.connect[1] && b === mu.connect[0]))) m.edges.push([mu.connect[0], mu.connect[1]]);
  }
  if (mu.move_to && m.nodes[mu.move_to]) m.current = mu.move_to;
  return m;
}

export function applyWorldMap(worldMap: any[], mp: any, pushEntry?: (t: string) => void): any {
  if (!Array.isArray(worldMap) || worldMap.length === 0) return mp;
  const m = mp ? { nodes: { ...mp.nodes }, edges: mp.edges.slice(), current: mp.current } : emptyMap();
  let added = 0;
  for (const loc of worldMap) {
    if (!loc.id || m.nodes[loc.id]) continue;
    let x = 0, y = 0;
    const fromId = loc.from && m.nodes[loc.from] ? loc.from : (m.current || null);
    if (fromId && m.nodes[fromId]) {
      const v = DIRV[loc.dir] || [1, 0];
      x = m.nodes[fromId].x + v[0];
      y = m.nodes[fromId].y + v[1];
      let guard = 0;
      while (Object.values(m.nodes).some((n: any) => n.x === x && n.y === y) && guard < 20) { x += 1; guard += 1; }
      m.edges.push([fromId, loc.id]);
    } else if (m.nodes[Object.keys(m.nodes)[0]]) {
      // Anchor to first node if no from specified
      const firstId = Object.keys(m.nodes)[0];
      const v = DIRV[loc.dir] || [1, 0];
      x = m.nodes[firstId].x + v[0];
      y = m.nodes[firstId].y + v[1];
      m.edges.push([firstId, loc.id]);
    }
    m.nodes[loc.id] = {
      name: loc.name || loc.id,
      type: MAP_ICON[loc.type] ? loc.type : "place",
      x, y,
      description: loc.description,
      visited: false, // player hasn't visited yet — fog of war
    };
    added += 1;
  }
  // If no current, set to first town or first node
  if (!m.current) {
    const townId = worldMap.find((l) => l.type === "town")?.id || Object.keys(m.nodes)[0];
    if (townId && m.nodes[townId]) {
      m.current = townId;
      m.nodes[townId].visited = true;
    }
  }
  if (pushEntry && added > 0) pushEntry(`🗺️ World map generated: ${added} locations laid out (${Object.values(m.nodes).filter((n:any)=>!n.visited).length} undiscovered)`);
  return m;
}

