'use client';

import { useState, useCallback } from 'react';
import type { MapAsset, Sprite, EditorState, GridSettings, TerrainCell, TerrainType, WallSegment, GridPoint } from './types';
import { DEFAULT_GRID_SETTINGS, DEFAULT_WALL } from './types';

export function useEditor() {
    const [state, setState] = useState<EditorState>({
        assets: [],
        sprites: [],
        selectedSpriteId: null,
        gridSettings: DEFAULT_GRID_SETTINGS,
        terrainGrid: {},
        showTerrain: true,
        walls: [],
        selectedWallId: null,
    });

    // Grid settings helpers
    const gridSize = state.gridSettings.cellSize;

    // Update grid settings
    const updateGridSettings = useCallback((updates: Partial<GridSettings>) => {
        setState(prev => ({
            ...prev,
            gridSettings: { ...prev.gridSettings, ...updates },
        }));
    }, []);

    // Add asset to library (without placing on canvas)
    const addAsset = useCallback((file: File, type: 'map' | 'sprite' = 'sprite'): Promise<MapAsset> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const imageUrl = e.target?.result as string;
                const img = new window.Image();
                img.onload = () => {
                    const asset: MapAsset = {
                        id: crypto.randomUUID(),
                        name: file.name.replace(/\.[^/.]+$/, ''),
                        imageUrl,
                        width: img.width,
                        height: img.height,
                        type,
                    };
                    setState(prev => ({ ...prev, assets: [...prev.assets, asset] }));
                    resolve(asset);
                };
                img.src = imageUrl;
            };
            reader.readAsDataURL(file);
        });
    }, []);

    // Remove asset from library
    const removeAsset = useCallback((assetId: string) => {
        setState(prev => ({
            ...prev,
            assets: prev.assets.filter(a => a.id !== assetId),
            sprites: prev.sprites.filter(s => s.assetId !== assetId),
        }));
    }, []);

    // Place sprite on canvas from asset
    const placeSprite = useCallback((asset: MapAsset, x = 0, y = 0) => {
        const sprite: Sprite = {
            id: crypto.randomUUID(),
            assetId: asset.id,
            x,
            y,
            width: asset.width,
            height: asset.height,
            rotation: 0,
            locked: false,
            layer: asset.type === 'map' ? 'background' : 'objects',
            snapToGrid: true,  // default snap, can disable in calibration panel
        };
        setState(prev => ({ ...prev, sprites: [...prev.sprites, sprite] }));
        return sprite;
    }, []);

    // Place map background directly
    const placeMapBackground = useCallback((file: File): Promise<Sprite> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const imageUrl = e.target?.result as string;
                const img = new window.Image();
                img.onload = () => {
                    const asset: MapAsset = {
                        id: crypto.randomUUID(),
                        name: file.name.replace(/\.[^/.]+$/, ''),
                        imageUrl,
                        width: img.width,
                        height: img.height,
                        type: 'map',
                    };

                    const sprite: Sprite = {
                        id: crypto.randomUUID(),
                        assetId: asset.id,
                        x: 0,
                        y: 0,
                        width: asset.width,
                        height: asset.height,
                        rotation: 0,
                        locked: false,
                        layer: 'background',
                        snapToGrid: true,  // default snap, can disable in calibration panel
                    };

                    setState(prev => ({
                        ...prev,
                        assets: [...prev.assets, asset],
                        sprites: [...prev.sprites, sprite],
                    }));
                    resolve(sprite);
                };
                img.src = imageUrl;
            };
            reader.readAsDataURL(file);
        });
    }, []);

    // Select sprite
    const selectSprite = useCallback((id: string | null) => {
        setState(prev => ({ ...prev, selectedSpriteId: id }));
    }, []);

    // Update sprite position
    const updateSpritePosition = useCallback((id: string, x: number, y: number) => {
        setState(prev => ({
            ...prev,
            sprites: prev.sprites.map(s => s.id === id ? { ...s, x, y } : s),
        }));
    }, []);

    // Resize sprite to grid cells
    const resizeSpriteToGrid = useCallback((id: string, cols: number, rows: number) => {
        setState(prev => ({
            ...prev,
            sprites: prev.sprites.map(s =>
                s.id === id
                    ? { ...s, width: cols * prev.gridSettings.cellSize, height: rows * prev.gridSettings.cellSize }
                    : s
            ),
        }));
    }, []);

    // Update sprite size directly (pixels)
    const updateSpriteSize = useCallback((id: string, width: number, height: number) => {
        setState(prev => ({
            ...prev,
            sprites: prev.sprites.map(s => s.id === id ? { ...s, width, height } : s),
        }));
    }, []);

    // Update sprite transform (position + size)
    const updateSpriteTransform = useCallback((id: string, x: number, y: number, width: number, height: number) => {
        setState(prev => ({
            ...prev,
            sprites: prev.sprites.map(s => s.id === id ? { ...s, x, y, width, height } : s),
        }));
    }, []);

    // Update sprite rotation
    const updateSpriteRotation = useCallback((id: string, rotation: number) => {
        setState(prev => ({
            ...prev,
            sprites: prev.sprites.map(s => s.id === id ? { ...s, rotation } : s),
        }));
    }, []);

    // Update sprite snapToGrid
    const updateSpriteSnapToGrid = useCallback((id: string, snapToGrid: boolean) => {
        setState(prev => ({
            ...prev,
            sprites: prev.sprites.map(s => s.id === id ? { ...s, snapToGrid } : s),
        }));
    }, []);

    // Duplicate sprite (for copy/paste)
    const duplicateSprite = useCallback((id: string, offsetX = 20, offsetY = 20) => {
        const sprite = state.sprites.find(s => s.id === id);
        if (!sprite) return null;

        const newSprite: Sprite = {
            ...sprite,
            id: crypto.randomUUID(),
            x: sprite.x + offsetX,
            y: sprite.y + offsetY,
        };
        setState(prev => ({
            ...prev,
            sprites: [...prev.sprites, newSprite],
            selectedSpriteId: newSprite.id,
        }));
        return newSprite;
    }, [state.sprites]);

    // Delete sprite
    const deleteSprite = useCallback((id: string) => {
        setState(prev => ({
            ...prev,
            sprites: prev.sprites.filter(s => s.id !== id),
            selectedSpriteId: prev.selectedSpriteId === id ? null : prev.selectedSpriteId,
        }));
    }, []);

    // Get selected sprite
    const selectedSprite = state.sprites.find(s => s.id === state.selectedSpriteId) || null;

    // Get asset by id
    const getAsset = useCallback((assetId: string) => {
        return state.assets.find(a => a.id === assetId);
    }, [state.assets]);

    // ============================
    // Terrain Functions
    // ============================

    // Set terrain cell elevation
    const setTerrainCell = useCallback((gridX: number, gridY: number, elevation: number, type: TerrainType = 'normal') => {
        const key = `${gridX},${gridY}`;
        setState(prev => ({
            ...prev,
            terrainGrid: {
                ...prev.terrainGrid,
                [key]: { elevation, type },
            },
        }));
    }, []);

    // Get terrain cell
    const getTerrainCell = useCallback((gridX: number, gridY: number): TerrainCell | undefined => {
        const key = `${gridX},${gridY}`;
        return state.terrainGrid[key];
    }, [state.terrainGrid]);

    // Clear terrain cell
    const clearTerrainCell = useCallback((gridX: number, gridY: number) => {
        const key = `${gridX},${gridY}`;
        setState(prev => {
            const newGrid = { ...prev.terrainGrid };
            delete newGrid[key];
            return { ...prev, terrainGrid: newGrid };
        });
    }, []);

    // Clear all terrain
    const clearAllTerrain = useCallback(() => {
        setState(prev => ({ ...prev, terrainGrid: {} }));
    }, []);

    // Toggle show terrain
    const toggleShowTerrain = useCallback(() => {
        setState(prev => ({ ...prev, showTerrain: !prev.showTerrain }));
    }, []);

    // Paint terrain area (for brush tool)
    // brushShape: 'circle' = circular, 'square' = square outline, 'rectangle' = filled square
    const paintTerrainArea = useCallback((centerX: number, centerY: number, brushSize: number, elevation: number, type: TerrainType = 'normal', brushShape: 'circle' | 'square' | 'rectangle' = 'circle') => {
        const radius = Math.max(0, Math.floor(brushSize / 2));
        const keysToUpdate: string[] = [];

        // For brush size 1, only update center cell
        if (brushSize <= 1) {
            keysToUpdate.push(`${centerX},${centerY}`);
        } else {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    let shouldInclude = false;

                    if (brushShape === 'circle') {
                        // Circular brush
                        shouldInclude = dx * dx + dy * dy <= radius * radius;
                    } else if (brushShape === 'square') {
                        // Square outline (only edges)
                        const isEdge = Math.abs(dx) === radius || Math.abs(dy) === radius;
                        shouldInclude = isEdge;
                    } else if (brushShape === 'rectangle') {
                        // Filled square
                        shouldInclude = true;
                    }

                    if (shouldInclude) {
                        keysToUpdate.push(`${centerX + dx},${centerY + dy}`);
                    }
                }
            }
        }

        setState(prev => {
            const newGrid = { ...prev.terrainGrid };

            for (const key of keysToUpdate) {
                if (type === 'eraser') {
                    // Eraser mode: delete terrain cell
                    delete newGrid[key];
                } else {
                    // Paint mode: add/update terrain cell
                    newGrid[key] = { elevation, type };
                }
            }

            return { ...prev, terrainGrid: newGrid };
        });
    }, []);

    // ============================
    // Wall Functions
    // ============================

    // Add a new wall segment (with duplicate prevention)
    const addWall = useCallback((p1: GridPoint, p2: GridPoint, defaults?: Partial<WallSegment>) => {
        // Check for duplicate - same endpoints
        const existingWall = state.walls.find(w => {
            const sameDirection = (w.p1.x === p1.x && w.p1.y === p1.y && w.p2.x === p2.x && w.p2.y === p2.y);
            const reverseDirection = (w.p1.x === p2.x && w.p1.y === p2.y && w.p2.x === p1.x && w.p2.y === p1.y);
            return sameDirection || reverseDirection;
        });

        if (existingWall) {
            // Select existing wall instead of creating duplicate
            setState(prev => ({ ...prev, selectedWallId: existingWall.id }));
            return existingWall;
        }

        const wall: WallSegment = {
            id: crypto.randomUUID(),
            p1,
            p2,
            ...DEFAULT_WALL,
            ...defaults,
        };
        setState(prev => ({
            ...prev,
            walls: [...prev.walls, wall],
            selectedWallId: wall.id,
        }));
        return wall;
    }, [state.walls]);

    // Update wall properties
    const updateWall = useCallback((id: string, updates: Partial<WallSegment>) => {
        setState(prev => ({
            ...prev,
            walls: prev.walls.map(w => w.id === id ? { ...w, ...updates } : w),
        }));
    }, []);

    // Delete wall
    const deleteWall = useCallback((id: string) => {
        setState(prev => ({
            ...prev,
            walls: prev.walls.filter(w => w.id !== id),
            selectedWallId: prev.selectedWallId === id ? null : prev.selectedWallId,
        }));
    }, []);

    // Select wall
    const selectWall = useCallback((id: string | null) => {
        setState(prev => ({ ...prev, selectedWallId: id }));
    }, []);

    // Get wall by ID
    const getWall = useCallback((id: string) => {
        return state.walls.find(w => w.id === id) || null;
    }, [state.walls]);

    // Selected wall computed property
    const selectedWall = state.selectedWallId
        ? state.walls.find(w => w.id === state.selectedWallId) || null
        : null;

    // Get sprites sorted by layer (background first)
    // Save project to JSON file
    const saveProject = useCallback((filename = 'map-project') => {
        const projectData = {
            version: 1,
            gridSettings: state.gridSettings,
            assets: state.assets,
            sprites: state.sprites,
            terrainGrid: state.terrainGrid,
            showTerrain: state.showTerrain,
            walls: state.walls,
        };
        const json = JSON.stringify(projectData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [state]);

    // Load project from JSON file
    const loadProject = useCallback((file: File): Promise<void> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = e.target?.result as string;
                    const projectData = JSON.parse(json);

                    if (projectData.version && projectData.assets && projectData.sprites) {
                        setState({
                            assets: projectData.assets || [],
                            sprites: projectData.sprites || [],
                            selectedSpriteId: null,
                            gridSettings: projectData.gridSettings || DEFAULT_GRID_SETTINGS,
                            terrainGrid: projectData.terrainGrid || {},
                            showTerrain: projectData.showTerrain ?? true,
                            walls: projectData.walls || [],
                            selectedWallId: null,
                        });
                        resolve();
                    } else {
                        reject(new Error('Invalid project file format'));
                    }
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }, []);

    // Clear project
    const clearProject = useCallback(() => {
        setState({
            assets: [],
            sprites: [],
            selectedSpriteId: null,
            gridSettings: DEFAULT_GRID_SETTINGS,
            terrainGrid: {},
            showTerrain: true,
            walls: [],
            selectedWallId: null,
        });
    }, []);

    // Sort sprites by layer
    const sortedSprites = [...state.sprites].sort((a, b) => {
        if (a.layer === 'background' && b.layer !== 'background') return -1;
        if (a.layer !== 'background' && b.layer === 'background') return 1;
        return 0;
    });

    return {
        ...state,
        gridSize,
        sprites: sortedSprites,
        selectedSprite,
        updateGridSettings,
        addAsset,
        removeAsset,
        placeSprite,
        placeMapBackground,
        selectSprite,
        updateSpritePosition,
        updateSpriteSize,
        updateSpriteTransform,
        updateSpriteRotation,
        updateSpriteSnapToGrid,
        resizeSpriteToGrid,
        duplicateSprite,
        deleteSprite,
        getAsset,
        saveProject,
        loadProject,
        clearProject,
        // Terrain functions
        setTerrainCell,
        getTerrainCell,
        clearTerrainCell,
        clearAllTerrain,
        toggleShowTerrain,
        paintTerrainArea,
        // Wall functions
        walls: state.walls,
        selectedWall,
        addWall,
        updateWall,
        deleteWall,
        selectWall,
        getWall,
    };
}

export type Editor = ReturnType<typeof useEditor>;
