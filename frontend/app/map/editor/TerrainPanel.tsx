'use client';

import { useState } from 'react';
import { Mountain, Minus, Plus, Eye, EyeOff, Trash2, Eraser, Circle, Square, RectangleHorizontal } from 'lucide-react';
import type { Editor } from './useEditor';
import { ELEVATION_COLORS, type TerrainType } from './types';

export type BrushShape = 'circle' | 'square' | 'rectangle';

interface TerrainPanelProps {
  editor: Editor;
  elevation: number;
  setElevation: (e: number) => void;
  brushSize: number;
  setBrushSize: (s: number) => void;
  terrainType: TerrainType;
  setTerrainType: (t: TerrainType) => void;
  brushShape: BrushShape;
  setBrushShape: (s: BrushShape) => void;
}

const QUICK_ELEVATIONS = [-10, -5, 0, 5, 10, 15, 20];

export function TerrainPanel({
  editor,
  elevation,
  setElevation,
  brushSize,
  setBrushSize,
  terrainType,
  setTerrainType,
  brushShape,
  setBrushShape,
}: TerrainPanelProps) {
  const [customElevation, setCustomElevation] = useState(elevation.toString());

  // Get color for elevation
  const getElevationColor = (elev: number) => {
    const keys = Object.keys(ELEVATION_COLORS).map(Number).sort((a, b) => b - a);
    for (const key of keys) {
      if (elev >= key) return ELEVATION_COLORS[key];
    }
    return ELEVATION_COLORS[0];
  };

  const handleCustomElevationChange = (value: string) => {
    setCustomElevation(value);
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      setElevation(num);
    }
  };

  const isEraser = elevation === 0;

  return (
    <div className="absolute left-16 top-1/2 -translate-y-1/2 z-20 ml-2">
      <div className="bg-[#0a0a14]/95 backdrop-blur-sm rounded-xl p-3 border border-white/10 shadow-xl w-56">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-white text-sm font-medium">
            <Mountain size={16} className="text-purple-400" />
            <span>Terrain</span>
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => setElevation(0)}
              className={`p-1.5 rounded transition-colors ${
                isEraser
                  ? 'bg-gray-500 text-white'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              }`}
              title="ยางลบ"
            >
              <Eraser size={14} />
            </button>
            <button
              onClick={() => editor.toggleShowTerrain()}
              className="p-1.5 rounded text-white/60 hover:bg-white/10 hover:text-white transition-colors"
              title={editor.showTerrain ? 'ซ่อน terrain' : 'แสดง terrain'}
            >
              {editor.showTerrain ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <button
              onClick={() => editor.clearAllTerrain()}
              className="p-1.5 rounded text-white/60 hover:bg-red-500/20 hover:text-red-400 transition-colors"
              title="ล้างทั้งหมด"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Brush Shape */}
        <div className="mb-3">
          <label className="text-white/60 text-xs mb-1.5 block">รูปแปรง</label>
          <div className="flex gap-1">
            {[
              { id: 'circle' as BrushShape, icon: Circle, label: 'วงกลม' },
              { id: 'square' as BrushShape, icon: Square, label: 'สี่เหลี่ยม' },
              { id: 'rectangle' as BrushShape, icon: RectangleHorizontal, label: 'สี่เหลี่ยมทึบ' },
            ].map((shape) => {
              const Icon = shape.icon;
              return (
                <button
                  key={shape.id}
                  onClick={() => setBrushShape(shape.id)}
                  className={`flex-1 p-2 rounded text-xs font-medium transition-colors flex flex-col items-center gap-1 ${
                    brushShape === shape.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                  title={shape.label}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Brush Size */}
        <div className="mb-3">
          <label className="text-white/60 text-xs mb-1.5 block">ขนาดแปรง</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBrushSize(Math.max(1, brushSize - 1))}
              className="p-1.5 rounded bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
            >
              <Minus size={14} />
            </button>
            <div className="flex-1 text-center text-white font-bold text-lg">
              {brushSize}
            </div>
            <button
              onClick={() => setBrushSize(Math.min(10, brushSize + 1))}
              className="p-1.5 rounded bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Elevation */}
        <div className="mb-3">
          <label className="text-white/60 text-xs mb-1.5 block">ความสูง (ft)</label>
          
          {/* Custom input */}
          <div className="flex items-center gap-2 mb-2">
            <input
              type="number"
              value={customElevation}
              onChange={(e) => handleCustomElevationChange(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded bg-white/10 border border-white/20 text-white text-center text-sm focus:outline-none focus:border-purple-500"
              step="5"
            />
            <div
              className="w-10 h-8 rounded"
              style={{ backgroundColor: isEraser ? '#6b7280' : getElevationColor(elevation) }}
            />
          </div>
          
          {/* Quick buttons */}
          <div className="flex flex-wrap gap-1">
            {QUICK_ELEVATIONS.map((elev) => (
              <button
                key={elev}
                onClick={() => {
                  setElevation(elev);
                  setCustomElevation(elev.toString());
                }}
                className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                  elevation === elev && !isEraser
                    ? 'ring-2 ring-white shadow-lg scale-105'
                    : 'hover:scale-105'
                }`}
                style={{
                  backgroundColor: getElevationColor(elev),
                  color: elev >= 0 && elev <= 5 ? '#000' : '#fff',
                }}
              >
                {elev > 0 ? `+${elev}` : elev}
              </button>
            ))}
          </div>
        </div>

        {/* Terrain Type */}
        <div>
          <label className="text-white/60 text-xs mb-1.5 block">ประเภท</label>
          <div className="grid grid-cols-2 gap-1">
            {([
              { id: 'normal' as TerrainType, label: 'ปกติ' },
              { id: 'water' as TerrainType, label: 'น้ำ' },
              { id: 'difficult' as TerrainType, label: 'ยากลำบาก' },
              { id: 'hazard' as TerrainType, label: 'อันตราย' },
            ]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTerrainType(id)}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                  terrainType === id
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Current Preview */}
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/60">
              {isEraser ? 'โหมดยางลบ' : `${elevation > 0 ? '+' : ''}${elevation} ft`}
            </span>
            <div
              className="px-3 py-1 rounded font-bold"
              style={{
                backgroundColor: isEraser ? '#6b7280' : getElevationColor(elevation),
                color: (elevation >= 0 && elevation <= 5) || isEraser ? '#fff' : '#fff',
              }}
            >
              {isEraser ? 'ลบ' : `${brushShape === 'rectangle' ? '■' : brushShape === 'square' ? '□' : '●'} ${brushSize}`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
