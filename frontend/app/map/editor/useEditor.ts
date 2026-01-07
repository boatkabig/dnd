'use client';

import { useState, useCallback } from 'react';
import type { MapAsset, Sprite, EditorState, GridSettings } from './types';
import { DEFAULT_GRID_SETTINGS } from './types';

export function useEditor() {
    const [state, setState] = useState<EditorState>({
        assets: [],
        sprites: [],
        selectedSpriteId: null,
        gridSettings: DEFAULT_GRID_SETTINGS,
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

    // Get sprites sorted by layer (background first)
    // Save project to JSON file
    const saveProject = useCallback((filename = 'map-project') => {
        const projectData = {
            version: 1,
            gridSettings: state.gridSettings,
            assets: state.assets,
            sprites: state.sprites,
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
        resizeSpriteToGrid,
        duplicateSprite,
        deleteSprite,
        getAsset,
        saveProject,
        loadProject,
        clearProject,
    };
}

export type Editor = ReturnType<typeof useEditor>;
