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
}

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
}

export const DEFAULT_GRID_SETTINGS: GridSettings = {
    enabled: true,
    type: 'square',
    lineStyle: 'solid',
    cellSize: 50,
    color: '#ffffff',
    opacity: 0.15,
};
