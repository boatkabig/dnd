'use client';

import { Eye, EyeOff, Image, Mountain, Fence, Package, Users } from 'lucide-react';

export type EditorLayer = 'background' | 'terrain' | 'structures' | 'objects' | 'entities';

interface LayerConfig {
  id: EditorLayer;
  label: string;
  icon: React.ElementType;
  color: string;
}

const LAYERS: LayerConfig[] = [
  { id: 'background', label: 'พื้นหลัง', icon: Image, color: '#3b82f6' },
  { id: 'terrain', label: 'ภูมิประเทศ', icon: Mountain, color: '#22c55e' },
  { id: 'structures', label: 'สิ่งปลูกสร้าง', icon: Fence, color: '#f97316' },
  { id: 'objects', label: 'สิ่งของ', icon: Package, color: '#a855f7' },
  { id: 'entities', label: 'Entities', icon: Users, color: '#ef4444' },
];

interface LayerPanelProps {
  activeLayer: EditorLayer;
  onLayerChange: (layer: EditorLayer) => void;
  visibility: Record<EditorLayer, boolean>;
  onVisibilityToggle: (layer: EditorLayer) => void;
}

export function LayerPanel({ 
  activeLayer, 
  onLayerChange, 
  visibility, 
  onVisibilityToggle 
}: LayerPanelProps) {
  return (
    <div className="absolute right-4 top-4 z-20">
      <div className="bg-[#0a0a14]/95 backdrop-blur-sm rounded-xl border border-white/10 shadow-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-white/10">
          <span className="text-white/60 text-xs font-medium">Layers</span>
        </div>
        
        <div className="p-1">
          {LAYERS.map((layer) => {
            const Icon = layer.icon;
            const isActive = activeLayer === layer.id;
            const isVisible = visibility[layer.id];
            
            return (
              <div
                key={layer.id}
                className={`flex items-center gap-1 rounded-lg mb-0.5 ${
                  isActive ? 'bg-white/10' : ''
                }`}
              >
                {/* Visibility toggle */}
                <button
                  onClick={() => onVisibilityToggle(layer.id)}
                  className={`p-1.5 rounded-l-lg transition-colors ${
                    isVisible ? 'text-white/60 hover:text-white' : 'text-white/20'
                  }`}
                  title={isVisible ? 'ซ่อน' : 'แสดง'}
                >
                  {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
                
                {/* Layer button */}
                <button
                  onClick={() => onLayerChange(layer.id)}
                  className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-r-lg transition-colors ${
                    isActive 
                      ? 'text-white' 
                      : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  <Icon 
                    size={14} 
                    style={{ color: isActive ? layer.color : undefined }}
                  />
                  <span className="text-xs">{layer.label}</span>
                  {isActive && (
                    <div 
                      className="w-1.5 h-1.5 rounded-full ml-auto"
                      style={{ backgroundColor: layer.color }}
                    />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
