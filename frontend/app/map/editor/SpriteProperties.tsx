'use client';

import { X, Grid3X3, Trash2 } from 'lucide-react';
import type { Editor } from './useEditor';
import { useI18n } from '@/lib/i18n-context';

interface SpritePropertiesProps {
  editor: Editor;
}

export function SpriteProperties({ editor }: SpritePropertiesProps) {
  const { t } = useI18n();
  const sp = t.mapEditor.sprite;
  const { selectedSprite, gridSettings, resizeSpriteToGrid, deleteSprite, selectSprite } = editor;

  if (!selectedSprite) return null;

  const gridSize = gridSettings.cellSize;
  
  // Calculate current grid cells
  const currentCols = Math.round(selectedSprite.width / gridSize);
  const currentRows = Math.round(selectedSprite.height / gridSize);

  const presets = [
    { label: '1x1', cols: 1, rows: 1 },
    { label: '2x2', cols: 2, rows: 2 },
    { label: '3x3', cols: 3, rows: 3 },
    { label: '5x5', cols: 5, rows: 5 },
    { label: '10x10', cols: 10, rows: 10 },
    { label: '20x20', cols: 20, rows: 20 },
  ];

  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-56">
      <div className="bg-[#0a0a14]/95 backdrop-blur-sm rounded-xl border border-white/10 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <span className="text-white/80 text-sm font-medium">{sp.title}</span>
          <button
            onClick={() => selectSprite(null)}
            className="text-white/40 hover:text-white/80 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-3 space-y-4">
          {/* Size Display */}
          <div className="text-center">
            <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">{sp.size}</p>
            <p className="text-white/80 text-sm font-mono">
              {Math.round(selectedSprite.width)} × {Math.round(selectedSprite.height)} px
            </p>
            <p className="text-white/50 text-xs font-mono">
              ({currentCols} × {currentRows} {sp.cells})
            </p>
          </div>

          {/* Grid Resize */}
          <div>
            <div className="flex items-center gap-1 mb-2">
              <Grid3X3 size={12} className="text-purple-400" />
              <span className="text-white/60 text-xs">{sp.resizeToGrid}</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => resizeSpriteToGrid(selectedSprite.id, preset.cols, preset.rows)}
                  className={`px-2 py-1.5 rounded text-xs transition-colors ${
                    currentCols === preset.cols && currentRows === preset.rows
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Size */}
          <div>
            <p className="text-white/60 text-xs mb-2">{sp.custom} ({sp.cells})</p>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                max="100"
                value={currentCols}
                onChange={(e) => resizeSpriteToGrid(selectedSprite.id, parseInt(e.target.value) || 1, currentRows)}
                className="w-1/2 bg-white/10 border border-white/10 rounded px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-purple-500"
              />
              <span className="text-white/40 self-center">×</span>
              <input
                type="number"
                min="1"
                max="100"
                value={currentRows}
                onChange={(e) => resizeSpriteToGrid(selectedSprite.id, currentCols, parseInt(e.target.value) || 1)}
                className="w-1/2 bg-white/10 border border-white/10 rounded px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Delete */}
          <button
            onClick={() => deleteSprite(selectedSprite.id)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded-lg text-red-400 text-sm transition-colors"
          >
            <Trash2 size={14} />
            {sp.delete}
          </button>
        </div>
      </div>
    </div>
  );
}
