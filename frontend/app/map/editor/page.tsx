'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Canvas } from './Canvas';
import { Toolbox, Tool } from './Toolbox';
import { Header } from './Header';
import { AssetLibrary } from './AssetLibrary';
import { MapCalibration } from './MapCalibration';
import { TerrainPanel, type BrushShape } from './TerrainPanel';
import { WallPanel } from './WallPanel';
import { LayerPanel, type EditorLayer } from './LayerPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { useEditor } from './useEditor';
import type { TerrainType } from './types';

export default function MapEditorPage() {
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [showAssetPanel, setShowAssetPanel] = useState(true);
  const editor = useEditor();
  const clipboardRef = useRef<string | null>(null); // Stores copied sprite ID
  
  // Terrain tool state
  const [terrainElevation, setTerrainElevation] = useState(5);
  const [terrainBrushSize, setTerrainBrushSize] = useState(1);
  const [terrainType, setTerrainType] = useState<TerrainType>('normal');
  const [terrainBrushShape, setTerrainBrushShape] = useState<BrushShape>('circle');
  
  // Layer state
  const [activeLayer, setActiveLayer] = useState<EditorLayer>('background');
  const [layerVisibility, setLayerVisibility] = useState<Record<EditorLayer, boolean>>({
    background: true,
    terrain: true,
    structures: true,
    objects: true,
    entities: true,
  });
  
  const handleLayerVisibilityToggle = (layer: EditorLayer) => {
    setLayerVisibility(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Delete key - delete selected sprite
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editor.selectedSpriteId) {
          e.preventDefault();
          editor.deleteSprite(editor.selectedSpriteId);
        }
      }

      // Ctrl+C - Copy sprite
      if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        if (editor.selectedSpriteId) {
          e.preventDefault();
          clipboardRef.current = editor.selectedSpriteId;
        }
      }

      // Ctrl+V - Paste sprite
      if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
        if (clipboardRef.current) {
          e.preventDefault();
          editor.duplicateSprite(clipboardRef.current, 30, 30);
        }
      }

      // Ctrl+D - Duplicate sprite
      if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        if (editor.selectedSpriteId) {
          e.preventDefault();
          editor.duplicateSprite(editor.selectedSpriteId, 30, 30);
        }
      }

      // Escape - Deselect
      if (e.key === 'Escape') {
        editor.selectSprite(null);
      }

      // Rotate shortcuts
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
        if (editor.selectedSprite) {
          e.preventDefault();
          const step = e.shiftKey ? -Math.PI / 12 : Math.PI / 12; // 15 degrees
          const newRotation = (editor.selectedSprite.rotation || 0) + step;
          editor.updateSpriteRotation(editor.selectedSprite.id, newRotation);
        }
      }

      // Reset rotation
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        if (editor.selectedSprite) {
          e.preventDefault();
          editor.updateSpriteRotation(editor.selectedSprite.id, 0);
        }
      }

      // Tool shortcuts
      if (e.key === 'v' && !e.ctrlKey && !e.metaKey) {
        setActiveTool('select');
      }
      if (e.key === 'h' && !e.ctrlKey && !e.metaKey) {
        setActiveTool('hand');
      }
      if (e.key === 't' && !e.ctrlKey && !e.metaKey) {
        setActiveTool('terrain');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor]);

  // Import Map Background (direct)
  const handleImportMap = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && file.type.startsWith('image/')) {
        await editor.placeMapBackground(file);
      }
    };
    input.click();
  }, [editor]);

  // Import Sprite Asset (to library)
  const handleImportSprite = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          await editor.addAsset(file, 'sprite');
        }
      }
    };
    input.click();
  }, [editor]);

  // Handle drag and drop (default to sprite asset)
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        await editor.addAsset(file, 'sprite');
      }
    }
  }, [editor]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div 
      className="h-screen w-screen bg-[#0f0f1a] flex flex-col overflow-hidden"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      tabIndex={0}
    >
      {/* Header */}
      <Header 
        editor={editor}
        onImportMap={handleImportMap}
        onImportSprite={handleImportSprite}
        onToggleAssetPanel={() => setShowAssetPanel(!showAssetPanel)}
        showAssetPanel={showAssetPanel}
      />

      {/* Main Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas Area */}
        <main className="flex-1 relative overflow-hidden">
          <Canvas 
            activeTool={activeTool} 
            editor={editor}
            terrainElevation={terrainElevation}
            terrainBrushSize={terrainBrushSize}
            terrainType={terrainType}
            terrainBrushShape={terrainBrushShape}
          />
          <Toolbox activeTool={activeTool} onToolChange={setActiveTool} />
          
          {/* Terrain Panel - show when terrain layer active */}
          {activeLayer === 'terrain' && (
            <TerrainPanel
              editor={editor}
              elevation={terrainElevation}
              setElevation={setTerrainElevation}
              brushSize={terrainBrushSize}
              setBrushSize={setTerrainBrushSize}
              terrainType={terrainType}
              setTerrainType={setTerrainType}
              brushShape={terrainBrushShape}
              setBrushShape={setTerrainBrushShape}
            />
          )}
          
          {/* Wall Panel - show when structures layer active */}
          {activeLayer === 'structures' && (
            <WallPanel editor={editor} />
          )}
          
          {/* Map Calibration - show when background layer active */}
          {activeLayer === 'background' && (
            <MapCalibration editor={editor} />
          )}
          
          {/* Layer Panel */}
          <LayerPanel
            activeLayer={activeLayer}
            onLayerChange={setActiveLayer}
            visibility={layerVisibility}
            onVisibilityToggle={handleLayerVisibilityToggle}
          />
          
          {/* Properties Panel - shows when any object is selected */}
          <PropertiesPanel editor={editor} />
        </main>

        {/* Asset Library Sidebar */}
        {showAssetPanel && (
          <AssetLibrary editor={editor} />
        )}
      </div>
    </div>
  );
}
