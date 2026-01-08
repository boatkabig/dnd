'use client';

import { useState, useEffect } from 'react';
import { Move, Maximize2, RotateCcw, Grid, ChevronUp, ChevronDown, Magnet } from 'lucide-react';
import type { Editor } from './useEditor';

interface MapCalibrationProps {
  editor: Editor;
}

export function MapCalibration({ editor }: MapCalibrationProps) {
  const selectedSprite = editor.selectedSprite;
  
  // Local state for live editing
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [scaleW, setScaleW] = useState(100);
  const [scaleH, setScaleH] = useState(100);
  
  // Sync with selected sprite
  useEffect(() => {
    if (selectedSprite) {
      setOffsetX(selectedSprite.x);
      setOffsetY(selectedSprite.y);
      // Reset scale to 100% when selecting new sprite
    }
  }, [selectedSprite?.id]);
  
  if (!selectedSprite || selectedSprite.layer !== 'background') {
    return null;
  }
  
  const asset = editor.getAsset(selectedSprite.assetId);
  if (!asset) return null;
  
  const isSnapEnabled = selectedSprite.snapToGrid;
  
  // Toggle snap to grid
  const toggleSnap = () => {
    editor.updateSpriteSnapToGrid(selectedSprite.id, !selectedSprite.snapToGrid);
  };
  
  // Apply offset change
  const handleOffsetChange = (axis: 'x' | 'y', value: number) => {
    if (axis === 'x') {
      setOffsetX(value);
      editor.updateSpritePosition(selectedSprite.id, value, selectedSprite.y);
    } else {
      setOffsetY(value);
      editor.updateSpritePosition(selectedSprite.id, selectedSprite.x, value);
    }
  };
  
  // Fine-tune buttons
  const nudge = (axis: 'x' | 'y', delta: number) => {
    if (axis === 'x') {
      const newX = selectedSprite.x + delta;
      setOffsetX(newX);
      editor.updateSpritePosition(selectedSprite.id, newX, selectedSprite.y);
    } else {
      const newY = selectedSprite.y + delta;
      setOffsetY(newY);
      editor.updateSpritePosition(selectedSprite.id, selectedSprite.x, newY);
    }
  };
  
  // Scale sprite
  const applyScale = (scalePercent: number, axis: 'w' | 'h' | 'both') => {
    const factor = scalePercent / 100;
    let newW = selectedSprite.width;
    let newH = selectedSprite.height;
    
    if (axis === 'w' || axis === 'both') {
      newW = asset.width * factor;
    }
    if (axis === 'h' || axis === 'both') {
      newH = asset.height * factor;
    }
    
    editor.updateSpriteSize(selectedSprite.id, newW, newH);
  };
  
  // Reset transform
  const resetTransform = () => {
    setOffsetX(0);
    setOffsetY(0);
    setScaleW(100);
    setScaleH(100);
    editor.updateSpriteTransform(selectedSprite.id, 0, 0, asset.width, asset.height);
  };
  
  // Fit to grid (nearest whole cells)
  const fitToGrid = () => {
    const cellSize = editor.gridSettings.cellSize;
    const cellsW = Math.round(selectedSprite.width / cellSize);
    const cellsH = Math.round(selectedSprite.height / cellSize);
    const newW = cellsW * cellSize;
    const newH = cellsH * cellSize;
    editor.updateSpriteSize(selectedSprite.id, newW, newH);
    setScaleW(Math.round((newW / asset.width) * 100));
    setScaleH(Math.round((newH / asset.height) * 100));
  };
  
  const cellSize = editor.gridSettings.cellSize;
  const currentCellsW = (selectedSprite.width / cellSize).toFixed(2);
  const currentCellsH = (selectedSprite.height / cellSize).toFixed(2);
  
  return (
    <div className="absolute right-4 top-20 z-20">
      <div className="bg-[#0a0a14]/95 backdrop-blur-sm rounded-xl p-3 border border-white/10 shadow-xl w-56">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-white text-sm font-medium">
            <Grid size={16} className="text-blue-400" />
            <span>ปรับแผนที่</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleSnap}
              className={`p-1.5 rounded transition-colors ${
                isSnapEnabled 
                  ? 'bg-blue-600 text-white' 
                  : 'text-yellow-400 bg-yellow-500/20'
              }`}
              title={isSnapEnabled ? 'Snap to Grid: ON' : 'Advanced Mode: ปรับละเอียด'}
            >
              <Magnet size={14} />
            </button>
            <button
              onClick={resetTransform}
              className="p-1.5 rounded text-white/60 hover:bg-white/10 hover:text-white transition-colors"
              title="รีเซ็ต"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
        
        {/* Advanced mode indicator */}
        {!isSnapEnabled && (
          <div className="mb-3 p-2 bg-yellow-500/10 rounded text-xs text-yellow-400 border border-yellow-500/20">
            โหมดละเอียด: ปรับตำแหน่งแบบ pixel
          </div>
        )}
        
        {/* Grid info */}
        <div className="mb-3 p-2 bg-white/5 rounded text-xs text-white/70">
          <div>ขนาด: {currentCellsW} × {currentCellsH} cells</div>
          <div className="text-white/50">({Math.round(selectedSprite.width)} × {Math.round(selectedSprite.height)} px)</div>
        </div>
        
        {/* Position offset */}
        <div className="mb-3">
          <label className="text-white/60 text-xs mb-1.5 flex items-center gap-1">
            <Move size={12} />
            ตำแหน่ง (px)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1">
              <span className="text-white/50 text-xs">X</span>
              <div className="flex-1 flex">
                <button
                  onClick={() => nudge('x', -1)}
                  className="p-1 bg-white/10 rounded-l hover:bg-white/20 text-white/60"
                >
                  <ChevronDown size={12} />
                </button>
                <input
                  type="number"
                  value={Math.round(selectedSprite.x)}
                  onChange={(e) => handleOffsetChange('x', parseFloat(e.target.value) || 0)}
                  className="w-full px-1 py-1 bg-white/10 text-white text-xs text-center focus:outline-none"
                />
                <button
                  onClick={() => nudge('x', 1)}
                  className="p-1 bg-white/10 rounded-r hover:bg-white/20 text-white/60"
                >
                  <ChevronUp size={12} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-white/50 text-xs">Y</span>
              <div className="flex-1 flex">
                <button
                  onClick={() => nudge('y', -1)}
                  className="p-1 bg-white/10 rounded-l hover:bg-white/20 text-white/60"
                >
                  <ChevronDown size={12} />
                </button>
                <input
                  type="number"
                  value={Math.round(selectedSprite.y)}
                  onChange={(e) => handleOffsetChange('y', parseFloat(e.target.value) || 0)}
                  className="w-full px-1 py-1 bg-white/10 text-white text-xs text-center focus:outline-none"
                />
                <button
                  onClick={() => nudge('y', 1)}
                  className="p-1 bg-white/10 rounded-r hover:bg-white/20 text-white/60"
                >
                  <ChevronUp size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Size */}
        <div className="mb-3">
          <label className="text-white/60 text-xs mb-1.5 flex items-center gap-1">
            <Maximize2 size={12} />
            ขนาด (px)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1">
              <span className="text-white/50 text-xs">W</span>
              <input
                type="number"
                value={Math.round(selectedSprite.width)}
                onChange={(e) => {
                  const newW = parseFloat(e.target.value) || 1;
                  editor.updateSpriteSize(selectedSprite.id, newW, selectedSprite.height);
                }}
                className="w-full px-2 py-1 rounded bg-white/10 border border-white/10 text-white text-xs text-center focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-white/50 text-xs">H</span>
              <input
                type="number"
                value={Math.round(selectedSprite.height)}
                onChange={(e) => {
                  const newH = parseFloat(e.target.value) || 1;
                  editor.updateSpriteSize(selectedSprite.id, selectedSprite.width, newH);
                }}
                className="w-full px-2 py-1 rounded bg-white/10 border border-white/10 text-white text-xs text-center focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
        </div>
        
        {/* Quick actions */}
        <div className="flex gap-2">
          <button
            onClick={fitToGrid}
            className="flex-1 px-2 py-1.5 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 transition-colors"
          >
            Fit to Grid
          </button>
          <button
            onClick={resetTransform}
            className="flex-1 px-2 py-1.5 rounded bg-white/10 text-white/80 text-xs font-medium hover:bg-white/20 transition-colors"
          >
            รีเซ็ต
          </button>
        </div>
      </div>
    </div>
  );
}
