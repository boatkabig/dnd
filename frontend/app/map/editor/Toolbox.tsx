'use client';

import { Hand, MousePointer2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

export type Tool = 'hand' | 'select';

interface ToolboxProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
}

export function Toolbox({ activeTool, onToolChange }: ToolboxProps) {
  const { t } = useI18n();
  const toolLabels = t.mapEditor.tools;

  const tools = [
    { id: 'select' as Tool, icon: MousePointer2, label: toolLabels.select },
    { id: 'hand' as Tool, icon: Hand, label: toolLabels.hand },
  ];

  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20">
      <div className="bg-[#0a0a14]/95 backdrop-blur-sm rounded-xl p-1.5 flex flex-col gap-1 border border-white/10 shadow-xl">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          
          return (
            <button
              key={tool.id}
              onClick={() => onToolChange(tool.id)}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                isActive
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              }`}
              title={tool.label}
            >
              <Icon size={20} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
