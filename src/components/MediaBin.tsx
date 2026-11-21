import React, { memo, useRef, useState } from 'react';
import {
  Captions,
  Film,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  List,
  Music,
  Palette,
  Plus,
  Search,
  Sparkles,
  Type,
} from 'lucide-react';
import { secondsToTimecode } from '../engine/timecode';
import { MediaAsset } from '../engine/types';

interface MediaBinProps {
  assets: MediaAsset[];
  selectedAssetId: string | null;
  fps: number;
  onSelectAsset: (assetId: string) => void;
  onInsertAssetToTimeline: (asset: MediaAsset) => void;
  onAddTitleClip: (preset?: 'hero' | 'lower-third' | 'caption') => void;
  onAddAdjustmentLayer?: () => void;
  onAddColorMatte?: () => void;
  onAddSynthAudioClip: () => void;
  onImportFiles: (files: FileList) => void;
}

export const MediaBin: React.FC<MediaBinProps> = memo(({
  assets,
  selectedAssetId,
  fps,
  onSelectAsset,
  onInsertAssetToTimeline,
  onAddTitleClip,
  onAddAdjustmentLayer,
  onAddColorMatte,
  onAddSynthAudioClip,
  onImportFiles,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState<'all' | 'visual' | 'audio'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const filtered = assets.filter((a) => {
    const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filterKind === 'visual') return a.kind === 'image' || a.kind === 'video';
    if (filterKind === 'audio') return a.kind === 'audio';
    return true;
  });

  return (
    <aside
      aria-label="Media Library"
      className={`flex flex-col h-full bg-[#16171B] border-r border-[#262930] select-none transition-colors ${
        isDraggingOver ? 'ring-1 ring-inset ring-[#3B82F6] bg-[#1A1D24]' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          onImportFiles(e.dataTransfer.files);
        }
      }}
    >
      {/* Panel Header */}
      <div className="h-9 px-3 border-b border-[#24272E] flex items-center justify-between gap-2 shrink-0">
        <span className="text-[12px] font-semibold text-[#D1D5DB] whitespace-nowrap">
          Media Library
        </span>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Import Photos, Videos, or Music"
          aria-label="Add Media"
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded cursor-pointer whitespace-nowrap"
        >
          <FolderPlus className="w-3 h-3" />
          <span>Add Media</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onImportFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />
      </div>

      {/* Quick Create Bar */}
      <div className="px-2 py-1.5 border-b border-[#24272E] bg-[#141519] grid grid-cols-3 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onAddTitleClip('hero')}
          title="Add Title Overlay at Playhead (T)"
          className="flex items-center justify-center gap-1 py-1 text-[10px] font-medium text-[#C7CBD4] hover:text-white bg-[#1D2027] hover:bg-[#272B34] border border-[#2A2E38] rounded-xs cursor-pointer whitespace-nowrap"
        >
          <Type className="w-3 h-3 text-[#A78BFA]" />
          <span>+ Title</span>
        </button>
        <button
          type="button"
          onClick={() => onAddTitleClip('caption')}
          title="Add Subtitles / Caption at Playhead"
          className="flex items-center justify-center gap-1 py-1 text-[10px] font-medium text-[#C7CBD4] hover:text-white bg-[#1D2027] hover:bg-[#272B34] border border-[#2A2E38] rounded-xs cursor-pointer whitespace-nowrap"
        >
          <Captions className="w-3 h-3 text-[#60A5FA]" />
          <span>+ Caption</span>
        </button>
        <button
          type="button"
          onClick={onAddSynthAudioClip}
          title="Add Ambient Sound Bed to Audio Track"
          className="flex items-center justify-center gap-1 py-1 text-[10px] font-medium text-[#C7CBD4] hover:text-white bg-[#1D2027] hover:bg-[#272B34] border border-[#2A2E38] rounded-xs cursor-pointer whitespace-nowrap"
        >
          <Music className="w-3 h-3 text-[#34D399]" />
          <span>+ Audio</span>
        </button>
        <button
          type="button"
          onClick={() => onAddTitleClip('lower-third')}
          title="Add Speaker Name Lower Third Bar"
          className="flex items-center justify-center gap-1 py-1 text-[10px] font-medium text-[#C7CBD4] hover:text-white bg-[#1D2027] hover:bg-[#272B34] border border-[#2A2E38] rounded-xs cursor-pointer whitespace-nowrap"
        >
          <Sparkles className="w-3 h-3 text-[#F472B6]" />
          <span>+ Lower 3rd</span>
        </button>
        {onAddAdjustmentLayer && (
          <button
            type="button"
            onClick={onAddAdjustmentLayer}
            title="Add Adjustment Layer to Grade & Style All Tracks Below"
            className="flex items-center justify-center gap-1 py-1 text-[10px] font-medium text-[#C7CBD4] hover:text-white bg-[#1D2027] hover:bg-[#272B34] border border-[#2A2E38] rounded-xs cursor-pointer whitespace-nowrap"
          >
            <Layers className="w-3 h-3 text-[#C084FC]" />
            <span>+ Adj. Layer</span>
          </button>
        )}
        {onAddColorMatte && (
          <button
            type="button"
            onClick={onAddColorMatte}
            title="Add Gradient Color Matte Backdrop"
            className="flex items-center justify-center gap-1 py-1 text-[10px] font-medium text-[#C7CBD4] hover:text-white bg-[#1D2027] hover:bg-[#272B34] border border-[#2A2E38] rounded-xs cursor-pointer whitespace-nowrap"
          >
            <Palette className="w-3 h-3 text-[#F59E0B]" />
            <span>+ Matte</span>
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="p-2 border-b border-[#24272E] space-y-2 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files..."
            aria-label="Search media files"
            className="w-full bg-[#111215] border border-[#272A32] rounded pl-8 pr-2.5 py-1 text-[12px] text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none focus:border-[#3B82F6]"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5 bg-[#111215] p-0.5 rounded border border-[#252830]">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'visual', label: 'Photos/Video' },
                { id: 'audio', label: 'Audio' },
              ] as const
            ).map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setFilterKind(k.id)}
                className={`px-2 py-0.5 text-[10px] font-medium rounded-sm cursor-pointer whitespace-nowrap ${
                  filterKind === k.id
                    ? 'bg-[#262932] text-white'
                    : 'text-[#8E939E] hover:text-[#D1D5DB]'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 bg-[#111215] p-0.5 rounded border border-[#252830]">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Grid View"
              className={`p-1 rounded-sm cursor-pointer ${
                viewMode === 'grid' ? 'bg-[#262932] text-white' : 'text-[#8E939E] hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="List View"
              className={`p-1 rounded-sm cursor-pointer ${
                viewMode === 'list' ? 'bg-[#262932] text-white' : 'text-[#8E939E] hover:text-white'
              }`}
            >
              <List className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Asset List / Grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-center px-4 text-[#6B7280]">
            <p className="text-[12px] text-[#9CA3AF] font-medium">No matching files</p>
            <p className="text-[11px] mt-1">
              Drop photos, videos, or music here, or click Add Media.
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((asset) => {
              const selected = asset.id === selectedAssetId;
              return (
                <div
                  key={asset.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-auteur-asset', asset.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className={`group rounded border transition-colors overflow-hidden bg-[#1C1E23] ${
                    selected
                      ? 'border-[#3B82F6] ring-1 ring-[#3B82F6]/40'
                      : 'border-[#282B33] hover:border-[#3D424E]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectAsset(asset.id)}
                    onDoubleClick={() => onInsertAssetToTimeline(asset)}
                    className="w-full text-left cursor-pointer focus-visible:outline-none"
                  >
                    <div className="aspect-video bg-[#0F1013] relative overflow-hidden flex items-center justify-center">
                      {asset.kind === 'image' && asset.src ? (
                        <img
                          src={asset.src}
                          alt={asset.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : asset.kind === 'video' && asset.src ? (
                        <video
                          src={asset.src}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#141A21] px-2">
                          <div className="flex items-end gap-0.5 h-6 w-full justify-center">
                            {(asset.waveformPeaks ?? [0.3, 0.7, 0.5, 0.8, 0.4, 0.6]).slice(0, 20).map((pk, idx) => (
                              <span
                                key={idx}
                                className="w-1 bg-[#10B981]/75 rounded-xs"
                                style={{ height: `${Math.max(15, pk * 100)}%` }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      <span className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/75 text-[10px] font-mono-tabular text-[#E5E7EB] rounded-xs">
                        {secondsToTimecode(asset.duration, fps).slice(3)}
                      </span>
                    </div>
                    <div className="p-1.5">
                      <p className="text-[11px] font-medium text-[#E5E7EB] truncate">
                        {asset.name}
                      </p>
                      <p className="text-[10px] text-[#8E939E] truncate mt-0.5">
                        {asset.kind === 'audio'
                          ? `${(asset.sampleRate ?? 48000) / 1000}kHz Audio`
                          : `${asset.width}×${asset.height}`}
                      </p>
                    </div>
                  </button>
                  <div className="px-1.5 pb-1.5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => onInsertAssetToTimeline(asset)}
                      aria-label={`Add ${asset.name} to timeline`}
                      className="w-full flex items-center justify-center gap-1 py-1 text-[10px] font-medium text-[#C7CBD4] hover:text-white bg-[#23262E] hover:bg-[#2E333E] rounded-xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add to Timeline</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="divide-y divide-[#22252C]">
            {filtered.map((asset) => {
              const selected = asset.id === selectedAssetId;
              return (
                <div
                  key={asset.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-auteur-asset', asset.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-xs transition-colors ${
                    selected ? 'bg-[#252B36]' : 'hover:bg-[#1D2026]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectAsset(asset.id)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    {asset.kind === 'video' ? (
                      <Film className="w-3.5 h-3.5 text-[#3B82F6] shrink-0" />
                    ) : asset.kind === 'audio' ? (
                      <Music className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5 text-[#A78BFA] shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[11px] text-[#E5E7EB] truncate">{asset.name}</p>
                      <p className="text-[10px] text-[#8E939E] font-mono-tabular">
                        {secondsToTimecode(asset.duration, fps)} · {asset.codec}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onInsertAssetToTimeline(asset)}
                    aria-label={`Add ${asset.name}`}
                    className="p-1 text-[#9CA3AF] hover:text-white hover:bg-[#2B2F3A] rounded-xs cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dropzone Hint */}
      <div className="px-3 py-2 border-t border-[#24272E] text-[11px] text-[#7D838F] shrink-0">
        Drag files onto timeline tracks or click Add to Timeline.
      </div>
    </aside>
  );
});
