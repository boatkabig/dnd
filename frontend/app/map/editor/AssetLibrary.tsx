'use client';

import { Trash2, Plus } from 'lucide-react';
import type { Editor } from './useEditor';
import { useI18n } from '@/lib/i18n-context';

interface AssetLibraryProps {
  editor: Editor;
}

export function AssetLibrary({ editor }: AssetLibraryProps) {
  const { t } = useI18n();
  const me = t.mapEditor;
  const spriteAssets = editor.assets.filter(a => a.type === 'sprite');

  const handlePlaceSprite = (assetId: string) => {
    const asset = editor.getAsset(assetId);
    if (asset) {
      editor.placeSprite(asset, 100, 100);
    }
  };

  return (
    <aside className="w-64 bg-[#0a0a14] border-l border-white/10 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10">
        <h2 className="text-white/80 text-sm font-medium">{me.assetLibrary}</h2>
        <p className="text-white/40 text-[10px]">{me.assetLibraryDesc}</p>
      </div>

      {/* Asset List */}
      <div className="flex-1 overflow-y-auto p-2">
        {spriteAssets.length === 0 ? (
          <div className="text-center py-8 text-white/30 text-xs">
            <p>{me.noAssets}</p>
            <p className="mt-1">{me.noAssetsHint}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {spriteAssets.map((asset) => (
              <div
                key={asset.id}
                className="group relative bg-white/5 rounded-lg overflow-hidden hover:bg-white/10 transition-colors"
              >
                <img
                  src={asset.imageUrl}
                  alt={asset.name}
                  className="w-full aspect-square object-cover"
                />
                
                {/* Overlay with actions */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={() => handlePlaceSprite(asset.id)}
                    className="w-8 h-8 bg-purple-600 hover:bg-purple-500 rounded-lg flex items-center justify-center text-white"
                    title={me.placeOnCanvas}
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    onClick={() => editor.removeAsset(asset.id)}
                    className="w-8 h-8 bg-red-600/50 hover:bg-red-600 rounded-lg flex items-center justify-center text-white"
                    title={me.deleteAsset}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Name */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1">
                  <p className="text-white/80 text-[10px] truncate">{asset.name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
