'use client';

import { Grid } from 'lucide-react';
import type { Editor } from './useEditor';
import type { GridType, GridLineStyle } from './types';
import { useI18n } from '@/lib/i18n-context';

interface GridSettingsPanelProps {
  editor: Editor;
}

export function GridSettingsPanel({ editor }: GridSettingsPanelProps) {
  const { t } = useI18n();
  const { gridSettings, updateGridSettings } = editor;
  const g = t.mapEditor.grid;

  const gridTypes: { id: GridType; label: string; icon: string }[] = [
    { id: 'square', label: g.square, icon: '▦' },
    { id: 'hex-h', label: g.hexH, icon: '⬡' },
    { id: 'hex-v', label: g.hexV, icon: '⬢' },
    { id: 'isometric', label: g.isometric, icon: '◇' },
  ];

  const lineStyles: { id: GridLineStyle; label: string }[] = [
    { id: 'solid', label: g.solid },
    { id: 'dashed', label: g.dashed },
    { id: 'dots', label: g.dots },
  ];

  const colorPresets = [
    { color: '#ffffff', label: g.white },
    { color: '#000000', label: g.black },
    { color: '#ff0000', label: 'Red' },
    { color: '#00ff00', label: 'Green' },
    { color: '#0088ff', label: 'Blue' },
  ];

  return (
    <div className="p-4 space-y-4">
      {/* Enable/Disable */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Grid size={16} className="text-purple-400" />
          <span className="text-white/80 text-sm font-medium">{g.title}</span>
        </div>
        <button
          onClick={() => updateGridSettings({ enabled: !gridSettings.enabled })}
          className={`w-10 h-5 rounded-full transition-colors relative ${
            gridSettings.enabled ? 'bg-purple-600' : 'bg-white/20'
          }`}
        >
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
            gridSettings.enabled ? 'left-5' : 'left-0.5'
          }`} />
        </button>
      </div>

      {gridSettings.enabled && (
        <>
          {/* Grid Type */}
          <div>
            <label className="text-white/50 text-xs block mb-2">{g.type}</label>
            <div className="grid grid-cols-4 gap-1">
              {gridTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => updateGridSettings({ type: type.id })}
                  className={`py-2 rounded text-center transition-colors ${
                    gridSettings.type === type.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                  title={type.label}
                >
                  <span className="text-lg">{type.icon}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Line Style */}
          <div>
            <label className="text-white/50 text-xs block mb-2">{g.lineStyle}</label>
            <div className="grid grid-cols-3 gap-1">
              {lineStyles.map((style) => (
                <button
                  key={style.id}
                  onClick={() => updateGridSettings({ lineStyle: style.id })}
                  className={`py-2 px-2 rounded text-center transition-colors ${
                    gridSettings.lineStyle === style.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  <span className="text-xs">{style.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Cell Size */}
          <div>
            <label className="text-white/50 text-xs block mb-2">
              {g.cellSize}: {gridSettings.cellSize}px
            </label>
            <input
              type="range"
              min="20"
              max="200"
              step="10"
              value={gridSettings.cellSize}
              onChange={(e) => updateGridSettings({ cellSize: parseInt(e.target.value) })}
              className="w-full accent-purple-500"
            />
          </div>

          {/* Color */}
          <div>
            <label className="text-white/50 text-xs block mb-2">{g.color}</label>
            <div className="flex gap-2 items-center">
              {colorPresets.map((preset) => (
                <button
                  key={preset.color}
                  onClick={() => updateGridSettings({ color: preset.color })}
                  className={`w-6 h-6 rounded border-2 transition-all ${
                    gridSettings.color === preset.color
                      ? 'border-purple-500 scale-110'
                      : 'border-transparent hover:border-white/30'
                  }`}
                  style={{ backgroundColor: preset.color }}
                  title={preset.label}
                />
              ))}
              <input
                type="color"
                value={gridSettings.color}
                onChange={(e) => updateGridSettings({ color: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer bg-transparent"
                title={g.custom}
              />
            </div>
          </div>

          {/* Opacity */}
          <div>
            <label className="text-white/50 text-xs block mb-2">
              {g.opacity}: {Math.round(gridSettings.opacity * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={gridSettings.opacity * 100}
              onChange={(e) => updateGridSettings({ opacity: parseInt(e.target.value) / 100 })}
              className="w-full accent-purple-500"
            />
          </div>
        </>
      )}
    </div>
  );
}
