// Map Editor Types

export interface MapAsset {
    id: string;
    name: string;
    imageUrl: string;
    width: number;
    height: number;
    type: 'map' | 'sprite';
}

export interface Sprite {
    id: string;
    assetId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    locked: boolean;
    layer: 'background' | 'objects';
    snapToGrid: boolean;  // false for background maps that need fine adjustment
}

// Terrain Types
export type TerrainType = 'normal' | 'water' | 'difficult' | 'hazard' | 'eraser';

export interface TerrainCell {
    elevation: number;      // in feet: 0, 5, 10, 15, 20...
    type: TerrainType;
}

// Terrain grid key format: "x,y" where x,y are grid coordinates
export type TerrainGrid = Record<string, TerrainCell>;

export type GridType = 'square' | 'hex-h' | 'hex-v' | 'isometric';
export type GridLineStyle = 'solid' | 'dashed' | 'dots';

export interface GridSettings {
    enabled: boolean;
    type: GridType;
    lineStyle: GridLineStyle;
    cellSize: number;
    color: string;       // hex color
    opacity: number;     // 0-1
}

export interface CanvasState {
    panX: number;
    panY: number;
    zoom: number;
}

export interface EditorState {
    assets: MapAsset[];
    sprites: Sprite[];
    selectedSpriteId: string | null;
    gridSettings: GridSettings;
    terrainGrid: TerrainGrid;
    showTerrain: boolean;
    walls: WallSegment[];
    selectedWallId: string | null;
}

export const DEFAULT_GRID_SETTINGS: GridSettings = {
    enabled: true,
    type: 'square',
    lineStyle: 'solid',
    cellSize: 50,
    color: '#ffffff',
    opacity: 0.15,
};

// Elevation color mapping
export const ELEVATION_COLORS: Record<number, string> = {
    [-10]: '#1e3a5f', // Deep pit - dark blue
    [-5]: '#2563eb',  // Pit/Water - blue
    [0]: '#22c55e',   // Ground - green
    [5]: '#eab308',   // Low - yellow
    [10]: '#f97316',  // Medium - orange
    [15]: '#ef4444',  // High - red
    [20]: '#a855f7',  // Very high - purple
};

// ============================
// Wall System Types (D&D 5e)
// ============================

// How passage works
export type PassageType = 'passable' | 'impassable' | 'difficult';

// Wall visibility
export type VisibilityType = 'transparent' | 'opaque';

// Grid point (corner of cells, not center)
export interface GridPoint {
    x: number;  // grid X
    y: number;  // grid Y
}

// Wall segment between two grid points
export interface WallSegment {
    id: string;
    p1: GridPoint;  // Start point
    p2: GridPoint;  // End point

    // Physical properties (BE calculates cover from height)
    height: number;             // in feet (determines cover)
    hp?: number;                // current HP (destructible walls)
    maxHp?: number;             // max HP

    // Passage and visibility
    passage: PassageType;       // passable, impassable, difficult
    visibility: VisibilityType; // transparent, opaque

    // Door properties
    isDoor: boolean;
    doorState?: 'open' | 'closed' | 'locked';

    // Indestructible walls
    indestructible: boolean;
}

// Wall segment key format: "x1,y1-x2,y2" normalized (smaller point first)
export function getWallKey(p1: GridPoint, p2: GridPoint): string {
    // Normalize: smaller point first
    if (p1.x < p2.x || (p1.x === p2.x && p1.y < p2.y)) {
        return `${p1.x},${p1.y}-${p2.x},${p2.y}`;
    }
    return `${p2.x},${p2.y}-${p1.x},${p1.y}`;
}

// Default wall properties
export const DEFAULT_WALL: Omit<WallSegment, 'id' | 'p1' | 'p2'> = {
    height: 10,
    passage: 'impassable',
    visibility: 'opaque',
    isDoor: false,
    indestructible: false,
};


