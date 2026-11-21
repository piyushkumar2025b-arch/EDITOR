import React, { useRef, useState } from 'react';
import {
  Film,
  FolderPlus,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Music,
  Plus,
  Search,
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
  onAddTitleClip: () => void;
  onImportFiles: (files: FileList) => void;
}

export const MediaBin: React.FC<MediaBinProps> = ({
  assets,
  selectedAssetId,
  fps,
  onSelectAsset,
  onInsertAssetToTimeline,
  onAddTitleClip,
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
      aria-label="Project Media Bin"
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
          Project Bin
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onAddTitleClip}
            title="New Title / Lower Third"
            aria-label="New Title Clip"
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#C7CBD4] hover:text-white bg-[#20232A] hover:bg-[#2A2E37] rounded border border-[#2D313B] cursor-pointer whitespace-nowrap"
          >
            <Type className="w-3 h-3" />
            <span>Title</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Import Photo, Video, or Audio"
            aria-label="Import Media"
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded cursor-pointer whitespace-nowrap"
          >
            <FolderPlus className="w-3 h-3" />
            <span>Import</span>
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
      </div>

      {/* Filter & Search Bar */}
      <div className="p-2 border-b border-[#24272E] space-y-2 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter media..."
            aria-label="Filter media assets"
            className="w-full bg-[#111215] border border-[#272A32] rounded pl-8 pr-2.5 py-1 text-[12px] text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none focus:border-[#3B82F6]"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5 bg-[#111215] p-0.5 rounded border border-[#252830]">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'visual', label: 'Visual' },
                { id: 'audio', label: 'Audio' },
              ] as const
            ).map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setFilterKind(k.id)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-sm cursor-pointer ${
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
            <p className="text-[12px] text-[#9CA3AF] font-medium">No matching assets</p>
            <p className="text-[11px] mt-1">
              Drop photos, videos, or audio here, or click Import.
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
                      aria-label={`Insert ${asset.name} to timeline`}
                      className="w-full flex items-center justify-center gap-1 py-1 text-[10px] font-medium text-[#C7CBD4] hover:text-white bg-[#23262E] hover:bg-[#2E333E] rounded-xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Insert at Playhead</span>
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
                    aria-label={`Insert ${asset.name}`}
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
        Drag & drop local JPG, PNG, MP4, WebM, or WAV/MP3 files into bin.
      </div>
    </aside>
  );
};
