'use client';

import { Fence, Eye, EyeOff, DoorOpen, DoorClosed, Lock, Trash2, Shield } from 'lucide-react';
import type { Editor } from './useEditor';
import type { PassageType } from './types';

interface PropertiesPanelProps {
  editor: Editor;
}

const PASSAGE_OPTIONS: { value: PassageType; label: string }[] = [
  { value: 'passable', label: 'ผ่านได้' },
  { value: 'difficult', label: 'ลำบาก' },
  { value: 'impassable', label: 'ไม่ได้' },
];

export function PropertiesPanel({ editor }: PropertiesPanelProps) {
  const { selectedWall, updateWall, deleteWall, selectWall } = editor;
  
  // No selection = don't show
  if (!selectedWall) {
    return null;
  }
  
  const wall = selectedWall;
  
  return (
    <div className="absolute right-4 bottom-4 z-20">
      <div className="bg-[#0a0a14]/95 backdrop-blur-sm rounded-xl p-3 border border-white/10 shadow-xl w-56">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-white text-sm font-medium">
            <Fence size={14} className="text-amber-400" />
            <span>Properties</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => deleteWall(wall.id)}
              className="p-1 rounded text-red-400 hover:bg-red-500/20"
              title="ลบ"
            >
              <Trash2 size={12} />
            </button>
            <button
              onClick={() => selectWall(null)}
              className="text-white/40 hover:text-white text-xs px-1"
            >
              ✕
            </button>
          </div>
        </div>
        
        {/* Height & HP */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-white/50 text-[10px]">ความสูง (ft)</label>
            <input
              type="number"
              value={wall.height}
              onChange={(e) => updateWall(wall.id, { height: parseInt(e.target.value) || 0 })}
              className="w-full px-2 py-1 rounded bg-white/10 text-white text-xs"
              step="5"
              min="0"
            />
          </div>
          <div>
            <label className="text-white/50 text-[10px]">HP</label>
            <input
              type="number"
              value={wall.hp || 0}
              onChange={(e) => updateWall(wall.id, { 
                hp: parseInt(e.target.value) || 0,
                maxHp: wall.maxHp || parseInt(e.target.value) || 0
              })}
              className="w-full px-2 py-1 rounded bg-white/10 text-white text-xs"
              min="0"
              disabled={wall.indestructible}
            />
          </div>
        </div>
        
        {/* Indestructible */}
        <button
          onClick={() => updateWall(wall.id, { indestructible: !wall.indestructible })}
          className={`w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs mb-2 ${
            wall.indestructible 
              ? 'bg-blue-600 text-white' 
              : 'bg-white/5 text-white/50 hover:bg-white/10'
          }`}
        >
          <Shield size={12} />
          {wall.indestructible ? 'ทำลายไม่ได้' : 'ทำลายได้'}
        </button>
        
        {/* Passage */}
        <div className="flex gap-1 mb-2">
          {PASSAGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateWall(wall.id, { passage: opt.value })}
              className={`flex-1 px-1 py-1 rounded text-[10px] ${
                wall.passage === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-white/50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        
        {/* Visibility & Door */}
        <div className="flex gap-1 mb-2">
          <button
            onClick={() => updateWall(wall.id, { 
              visibility: wall.visibility === 'opaque' ? 'transparent' : 'opaque' 
            })}
            className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] ${
              wall.visibility === 'opaque' ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/50'
            }`}
          >
            {wall.visibility === 'opaque' ? <EyeOff size={10} /> : <Eye size={10} />}
            {wall.visibility === 'opaque' ? 'ทึบ' : 'โปร่ง'}
          </button>
          
          <button
            onClick={() => updateWall(wall.id, { 
              isDoor: !wall.isDoor,
              doorState: !wall.isDoor ? 'closed' : undefined,
            })}
            className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] ${
              wall.isDoor ? 'bg-amber-600 text-white' : 'bg-white/5 text-white/50'
            }`}
          >
            <DoorClosed size={10} />
            ประตู
          </button>
        </div>
        
        {/* Door State */}
        {wall.isDoor && (
          <div className="flex gap-1">
            {(['open', 'closed', 'locked'] as const).map((state) => (
              <button
                key={state}
                onClick={() => updateWall(wall.id, { doorState: state })}
                className={`flex-1 flex items-center justify-center py-1 rounded text-[10px] ${
                  wall.doorState === state
                    ? state === 'open' ? 'bg-green-600 text-white' 
                    : state === 'locked' ? 'bg-red-600 text-white' 
                    : 'bg-amber-600 text-white'
                    : 'bg-white/5 text-white/50'
                }`}
              >
                {state === 'open' ? <DoorOpen size={10} /> : state === 'locked' ? <Lock size={10} /> : <DoorClosed size={10} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
