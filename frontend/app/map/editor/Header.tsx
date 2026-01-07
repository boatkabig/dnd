'use client';

import { useState, useRef, useEffect } from 'react';
import { ImagePlus, Map, Layers, ChevronDown, Grid, Save, FolderOpen, FilePlus } from 'lucide-react';
import type { Editor } from './useEditor';
import { GridSettingsPanel } from './GridSettingsPanel';
import { useI18n } from '@/lib/i18n-context';

interface HeaderProps {
  editor: Editor;
  onImportMap: () => void;
  onImportSprite: () => void;
  onToggleAssetPanel: () => void;
  showAssetPanel: boolean;
}

export function Header({ editor, onImportMap, onImportSprite, onToggleAssetPanel, showAssetPanel }: HeaderProps) {
  const { t } = useI18n();
  const me = t.mapEditor;
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleLoadProject = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          await editor.loadProject(file);
        } catch (err) {
          console.error('Failed to load project:', err);
          alert('Failed to load project file');
        }
      }
    };
    input.click();
  };

  return (
    <header className="h-12 bg-[#0a0a14] border-b border-white/10 flex items-center justify-between px-4">
      {/* Left: Logo & Title */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            M
          </div>
          <div>
            <h1 className="text-white font-medium text-sm">{me.title}</h1>
          </div>
        </div>

        {/* Menus */}
        <div ref={menuRef} className="flex items-center gap-1 ml-4">
          {/* File Menu */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === 'file' ? null : 'file');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                openMenu === 'file' ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <FilePlus size={16} />
              <span>File</span>
              <ChevronDown size={14} />
            </button>
            
            {openMenu === 'file' && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-[#0a0a14] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
                <button
                  onClick={() => { editor.clearProject(); setOpenMenu(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-white/80 hover:bg-white/10 text-sm text-left"
                >
                  <FilePlus size={16} className="text-blue-400" />
                  <span>New Project</span>
                </button>
                <button
                  onClick={() => { handleLoadProject(); setOpenMenu(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-white/80 hover:bg-white/10 text-sm text-left"
                >
                  <FolderOpen size={16} className="text-yellow-400" />
                  <span>Open Project</span>
                </button>
                <div className="border-t border-white/10" />
                <button
                  onClick={() => { editor.saveProject('map-project'); setOpenMenu(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-white/80 hover:bg-white/10 text-sm text-left"
                >
                  <Save size={16} className="text-green-400" />
                  <span>Save Project</span>
                </button>
              </div>
            )}
          </div>

          {/* Import Menu */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === 'import' ? null : 'import');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                openMenu === 'import' ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <ImagePlus size={16} />
              <span>{me.import}</span>
              <ChevronDown size={14} />
            </button>
            
            {openMenu === 'import' && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-[#0a0a14] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
                <button
                  onClick={() => { onImportMap(); setOpenMenu(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-white/80 hover:bg-white/10 text-sm text-left"
                >
                  <Map size={16} className="text-purple-400" />
                  <div>
                    <p>{me.mapBackground}</p>
                    <p className="text-white/40 text-[10px]">{me.mapBackgroundDesc}</p>
                  </div>
                </button>
                <button
                  onClick={() => { onImportSprite(); setOpenMenu(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-white/80 hover:bg-white/10 text-sm text-left"
                >
                  <Layers size={16} className="text-green-400" />
                  <div>
                    <p>{me.spriteAsset}</p>
                    <p className="text-white/40 text-[10px]">{me.spriteAssetDesc}</p>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Grid Menu */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === 'grid' ? null : 'grid');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                openMenu === 'grid' ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Grid size={16} />
              <span>{me.grid.title}</span>
              <ChevronDown size={14} />
            </button>
            
            {openMenu === 'grid' && (
              <div 
                className="absolute top-full left-0 mt-1 w-64 bg-[#0a0a14] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <GridSettingsPanel editor={editor} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Asset Panel Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleAssetPanel}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            showAssetPanel ? 'bg-purple-600 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
          }`}
        >
          <Layers size={16} />
          <span>{me.assets} ({editor.assets.filter(a => a.type === 'sprite').length})</span>
        </button>
      </div>
    </header>
  );
}
