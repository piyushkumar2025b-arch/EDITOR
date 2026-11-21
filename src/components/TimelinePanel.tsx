import React, { memo, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Bookmark,
  Columns2,
  Copy,
  Eye,
  EyeOff,
  Hand,
  Lock,
  Magnet,
  Maximize2,
  MousePointer2,
  MoveHorizontal,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  Type,
  Unlock,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { generateRulerTicks, secondsToTimecode, snapTime } from '../engine/timecode';
import { getClipSnapPoints } from '../engine/timelineOps';
import {
  MediaAsset,
  SequenceSettings,
  TimelineClip,
  TimelineMarker,
  ToolMode,
  Track,
} from '../engine/types';

interface TimelinePanelProps {
  sequence: SequenceSettings;
  tracks: Track[];
  clips: TimelineClip[];
  assets: MediaAsset[];
  markers: TimelineMarker[];
  currentTime: number;
  duration: number;
  selectedClipId: string | null;
  activeTool: ToolMode;
  snapEnabled: boolean;
  stereoLevels: { leftDb: number; rightDb: number };
  onSelectTool: (tool: ToolMode) => void;
  onToggleSnap: () => void;
  onSelectClip: (clipId: string | null) => void;
  onSeek: (time: number) => void;
  onMoveClip: (clipId: string, newStartTime: number, newTrackId: string) => void;
  onTrimClip: (clipId: string, edge: 'left' | 'right', newTime: number) => void;
  onTrimClipToPlayhead: (clipId: string, edge: 'left' | 'right') => void;
  onSplitClip: (clipId: string, splitTime: number) => void;
  onSplitAllAtPlayhead: () => void;
  onDeleteClip: (clipId: string, ripple: boolean) => void;
  onCloseTrackGaps: (trackId: string) => void;
  onDuplicateClip: (clipId: string) => void;
  onAddMarker: () => void;
  onAddTextAtPlayhead: () => void;
  onToggleTrackProp: (trackId: string, prop: 'muted' | 'solo' | 'locked' | 'visible') => void;
  onAddTrack: (type: 'video' | 'audio') => void;
  onDropAssetAtTime: (assetId: string, trackId: string, time: number) => void;
  onApplyQuickDissolve: (clipId: string) => void;
}

const TRACK_HEIGHT = 48;

export const TimelinePanel: React.FC<TimelinePanelProps> = memo(({
  sequence,
  tracks,
  clips,
  assets,
  markers,
  currentTime,
  duration,
  selectedClipId,
  activeTool,
  snapEnabled,
  stereoLevels,
  onSelectTool,
  onToggleSnap,
  onSelectClip,
  onSeek,
  onMoveClip,
  onTrimClip,
  onTrimClipToPlayhead,
  onSplitClip,
  onSplitAllAtPlayhead,
  onDeleteClip,
  onCloseTrackGaps,
  onDuplicateClip,
  onAddMarker,
  onAddTextAtPlayhead,
  onToggleTrackProp,
  onAddTrack,
  onDropAssetAtTime,
  onApplyQuickDissolve,
}) => {
  const [pixelsPerSecond, setPixelsPerSecond] = useState(52);
  const [dragState, setDragState] = useState<{
    mode: 'move' | 'trim-left' | 'trim-right' | 'scrub' | 'pan';
    clipId?: string;
    startClientX: number;
    origScrollLeft?: number;
    origStartTime: number;
    origDuration: number;
    origTrackId: string;
  } | null>(null);

  const lanesRef = useRef<HTMLDivElement>(null);
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const selectedClip = useMemo(
    () => clips.find((c) => c.id === selectedClipId) ?? null,
    [clips, selectedClipId]
  );

  const timelineWidth = Math.max(960, Math.ceil((duration + 6) * pixelsPerSecond));
  const ticks = useMemo(
    () => generateRulerTicks(duration + 6, pixelsPerSecond, sequence.fps),
    [duration, pixelsPerSecond, sequence.fps]
  );

  const clientXToTime = (clientX: number): number => {
    const el = lanesRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return Math.max(0, x / pixelsPerSecond);
  };

  const clientYToTrackId = (clientY: number, fallbackTrackId: string): string => {
    const el = lanesRef.current;
    if (!el) return fallbackTrackId;
    const rect = el.getBoundingClientRect();
    const y = clientY - rect.top - 28 + el.scrollTop;
    const idx = Math.floor(y / TRACK_HEIGHT);
    if (idx >= 0 && idx < tracks.length) {
      return tracks[idx].id;
    }
    return fallbackTrackId;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState) return;
    if (dragState.mode === 'scrub') {
      onSeek(clientXToTime(e.clientX));
      return;
    }
    if (dragState.mode === 'pan' && lanesRef.current) {
      const dx = e.clientX - dragState.startClientX;
      lanesRef.current.scrollLeft = Math.max(0, (dragState.origScrollLeft ?? 0) - dx);
      return;
    }

    if (!dragState.clipId) return;
    const deltaSec = (e.clientX - dragState.startClientX) / pixelsPerSecond;
    const snapPoints = getClipSnapPoints(clips, currentTime, dragState.clipId);
    const snapThreshold = 10 / pixelsPerSecond;

    if (dragState.mode === 'move') {
      const rawStart = Math.max(0, dragState.origStartTime + deltaSec);
      const snappedStart = snapTime(rawStart, snapPoints, snapThreshold, snapEnabled);
      const targetTrackId = clientYToTrackId(e.clientY, dragState.origTrackId);
      onMoveClip(dragState.clipId, snappedStart, targetTrackId);
    } else if (dragState.mode === 'trim-left') {
      const rawEdge = Math.max(0, dragState.origStartTime + deltaSec);
      const snappedEdge = snapTime(rawEdge, snapPoints, snapThreshold, snapEnabled);
      onTrimClip(dragState.clipId, 'left', snappedEdge);
    } else if (dragState.mode === 'trim-right') {
      const rawEdge = Math.max(0.25, dragState.origStartTime + dragState.origDuration + deltaSec);
      const snappedEdge = snapTime(rawEdge, snapPoints, snapThreshold, snapEnabled);
      onTrimClip(dragState.clipId, 'right', snappedEdge);
    }
  };

  const handlePointerUp = () => {
    if (dragState) setDragState(null);
  };

  const fitTimelineToView = () => {
    const el = lanesRef.current;
    if (!el) return;
    const available = Math.max(300, el.clientWidth - 40);
    const fitZoom = Math.max(18, Math.min(140, Math.floor(available / Math.max(8, duration + 2))));
    setPixelsPerSecond(fitZoom);
  };

  const dbToHeightPct = (db: number) => {
    const clamped = Math.max(-60, Math.min(0, db));
    return ((clamped + 60) / 60) * 100;
  };

  const tools: { id: ToolMode; label: string; shortLabel: string; shortcut: string; icon: React.ReactNode }[] = [
    { id: 'select', label: 'Select & Move Tool', shortLabel: 'Select', shortcut: 'V', icon: <MousePointer2 className="w-3.5 h-3.5" /> },
    { id: 'razor', label: 'Cut Clip Tool', shortLabel: 'Cut', shortcut: 'C', icon: <Scissors className="w-3.5 h-3.5" /> },
    { id: 'trim', label: 'Trim Edges Tool', shortLabel: 'Trim', shortcut: 'B', icon: <MoveHorizontal className="w-3.5 h-3.5" /> },
    { id: 'text', label: 'Add Text Overlay', shortLabel: 'Text', shortcut: 'T', icon: <Type className="w-3.5 h-3.5" /> },
    { id: 'hand', label: 'Scroll / Pan Timeline', shortLabel: 'Pan', shortcut: 'H', icon: <Hand className="w-3.5 h-3.5" /> },
  ];

  const activeToolHint =
    activeTool === 'razor'
      ? 'Cut Mode (C): Click any clip to split it'
      : activeTool === 'trim'
      ? 'Trim Mode (B): Drag clip edges shorter or longer'
      : activeTool === 'hand'
      ? 'Pan Mode (H): Drag tracks left or right to scroll'
      : 'Select Mode (V): Drag clips to move · Drag edges to trim';

  return (
    <section
      aria-label="Timeline Editor"
      className="flex flex-col h-full bg-[#141519] border-t border-[#262930] select-none overflow-hidden"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Timeline Top Action Bar */}
      <div className="h-9 px-3 bg-[#17191E] border-b border-[#24272E] flex items-center justify-between gap-2 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-[12px] font-semibold text-[#D1D5DB] whitespace-nowrap">
            Timeline
          </span>
          <span className="text-[11px] font-mono-tabular text-[#7D838F] whitespace-nowrap">
            {clips.length} clips
          </span>
          <span className="hidden 2xl:inline text-[11px] text-[#8E939E] whitespace-nowrap">
            {activeToolHint}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleSnap}
            aria-pressed={snapEnabled}
            title="Magnet Snap to Edges & Playhead (S)"
            aria-label="Toggle Magnet Snap"
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border cursor-pointer transition-colors whitespace-nowrap ${
              snapEnabled
                ? 'bg-[#3B82F6]/15 border-[#3B82F6]/60 text-[#60A5FA]'
                : 'bg-[#1D1F26] border-[#292D36] text-[#8E939E] hover:text-white'
            }`}
          >
            <Magnet className="w-3 h-3" />
            <span>Snap</span>
          </button>

          <button
            type="button"
            onClick={onAddMarker}
            title="Add Timeline Bookmark at Playhead (M)"
            aria-label="Add Bookmark"
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-[#C7CBD4] hover:text-white bg-[#1D1F26] border border-[#292D36] rounded cursor-pointer whitespace-nowrap"
          >
            <Bookmark className="w-3 h-3" />
            <span>Bookmark</span>
          </button>

          <button
            type="button"
            onClick={onSplitAllAtPlayhead}
            title="Cut All Tracks at Playhead"
            aria-label="Cut All Tracks"
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-[#C7CBD4] hover:text-white bg-[#1D1F26] border border-[#292D36] rounded cursor-pointer whitespace-nowrap"
          >
            <Columns2 className="w-3 h-3" />
            <span>Cut All</span>
          </button>

          {selectedClip && (
            <>
              <button
                type="button"
                onClick={() => onSplitClip(selectedClip.id, currentTime)}
                title="Split Selected Clip at Playhead"
                aria-label="Split Clip at Playhead"
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-[#C7CBD4] hover:text-white bg-[#1D1F26] border border-[#292D36] rounded cursor-pointer whitespace-nowrap"
              >
                <Scissors className="w-3 h-3" />
                <span>Split</span>
              </button>
              <button
                type="button"
                onClick={() => onTrimClipToPlayhead(selectedClip.id, 'left')}
                title="Trim Clip Start to Playhead"
                aria-label="Trim Start to Playhead"
                className="p-1.5 text-[#C7CBD4] hover:text-white bg-[#1D1F26] border border-[#292D36] rounded cursor-pointer"
              >
                <ArrowRightToLine className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => onTrimClipToPlayhead(selectedClip.id, 'right')}
                title="Trim Clip End to Playhead"
                aria-label="Trim End to Playhead"
                className="p-1.5 text-[#C7CBD4] hover:text-white bg-[#1D1F26] border border-[#292D36] rounded cursor-pointer"
              >
                <ArrowLeftToLine className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => onApplyQuickDissolve(selectedClip.id)}
                title="Toggle Smooth Fade In & Out"
                aria-label="Toggle Smooth Fade"
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-[#C7CBD4] hover:text-white bg-[#1D1F26] border border-[#292D36] rounded cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3 h-3" />
                <span>Fade</span>
              </button>
              <button
                type="button"
                onClick={() => onDuplicateClip(selectedClip.id)}
                title="Duplicate Selected Clip"
                aria-label="Duplicate Clip"
                className="p-1.5 text-[#C7CBD4] hover:text-white bg-[#1D1F26] border border-[#292D36] rounded cursor-pointer"
              >
                <Copy className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => onCloseTrackGaps(selectedClip.trackId)}
                title="Remove All Empty Gaps on This Track"
                aria-label="Pack Track"
                className="px-2 py-1 text-[11px] text-[#C7CBD4] hover:text-white bg-[#1D1F26] border border-[#292D36] rounded cursor-pointer whitespace-nowrap"
              >
                Pack Track
              </button>
              <button
                type="button"
                onClick={() => onDeleteClip(selectedClip.id, true)}
                title="Delete Clip and Close Gap (Shift+Delete)"
                aria-label="Delete and Close Gap"
                className="px-2 py-1 text-[11px] text-[#FCA5A5] hover:text-white hover:bg-[#DC2626]/25 bg-[#1D1F26] border border-[#292D36] rounded cursor-pointer whitespace-nowrap"
              >
                Close Gap
              </button>
              <button
                type="button"
                onClick={() => onDeleteClip(selectedClip.id, false)}
                title="Delete Selected Clip (Backspace)"
                aria-label="Delete Selected Clip"
                className="p-1.5 text-[#F87171] hover:text-white hover:bg-[#DC2626]/20 bg-[#1D1F26] border border-[#292D36] rounded cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          )}

          <div className="flex items-center gap-1 ml-1 pl-2 border-l border-[#262930]">
            <button
              type="button"
              onClick={fitTimelineToView}
              title="Fit Whole Project to Window"
              aria-label="Fit Timeline"
              className="p-1 text-[#9CA3AF] hover:text-white cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setPixelsPerSecond((z) => Math.max(18, z - 10))}
              aria-label="Zoom Out Timeline"
              className="p-1 text-[#9CA3AF] hover:text-white cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min={18}
              max={160}
              value={pixelsPerSecond}
              aria-label="Timeline Zoom"
              onChange={(e) => setPixelsPerSecond(Number(e.target.value))}
              className="w-16 studio-slider"
            />
            <button
              type="button"
              onClick={() => setPixelsPerSecond((z) => Math.min(160, z + 10))}
              aria-label="Zoom In Timeline"
              className="p-1 text-[#9CA3AF] hover:text-white cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Timeline Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* 1. Left Tool Strip */}
        <div
          aria-label="Timeline Tools"
          className="w-12 shrink-0 bg-[#16171C] border-r border-[#24272E] py-1.5 flex flex-col items-center gap-1 overflow-y-auto"
        >
          {tools.map((t) => {
            const active = activeTool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (t.id === 'text') {
                    onAddTextAtPlayhead();
                  } else {
                    onSelectTool(t.id);
                  }
                }}
                aria-pressed={active}
                aria-label={`${t.label} (${t.shortcut})`}
                title={`${t.label} (${t.shortcut})`}
                className={`w-10 py-1 flex flex-col items-center justify-center gap-0.5 rounded transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#3B82F6] text-white'
                    : 'text-[#9CA3AF] hover:text-white hover:bg-[#23262F]'
                }`}
              >
                {t.icon}
                <span className="text-[9px] leading-none font-medium">{t.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* 2. Track Headers */}
        <div className="w-36 shrink-0 bg-[#15171B] border-r border-[#24272E] flex flex-col">
          <div className="h-7 px-2 border-b border-[#24272E] flex items-center justify-between text-[10px] font-mono-tabular text-[#6B7280] shrink-0">
            <span>TRACKS</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onAddTrack('video')}
                title="Add New Video Track"
                aria-label="Add Video Track"
                className="flex items-center px-1 py-0.5 text-[9px] text-[#60A5FA] hover:bg-[#242934] rounded-xs cursor-pointer"
              >
                <Plus className="w-2.5 h-2.5" />V
              </button>
              <button
                type="button"
                onClick={() => onAddTrack('audio')}
                title="Add New Audio Track"
                aria-label="Add Audio Track"
                className="flex items-center px-1 py-0.5 text-[9px] text-[#34D399] hover:bg-[#1E2E29] rounded-xs cursor-pointer"
              >
                <Plus className="w-2.5 h-2.5" />A
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {tracks.map((tr) => (
              <div
                key={tr.id}
                style={{ height: TRACK_HEIGHT }}
                className="px-2 border-b border-[#21232A] flex items-center justify-between gap-1 bg-[#16181D]"
              >
                <span
                  className={`text-[11px] font-mono-tabular font-semibold px-1.5 py-0.5 rounded-xs ${
                    tr.type === 'video'
                      ? 'text-[#60A5FA] bg-[#3B82F6]/12'
                      : 'text-[#34D399] bg-[#10B981]/12'
                  }`}
                >
                  {tr.name}
                </span>

                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onToggleTrackProp(tr.id, 'locked')}
                    aria-label={`${tr.locked ? 'Unlock' : 'Lock'} ${tr.name}`}
                    title="Lock Track"
                    className={`p-1 rounded-xs cursor-pointer ${
                      tr.locked ? 'text-[#F59E0B]' : 'text-[#6B7280] hover:text-white'
                    }`}
                  >
                    {tr.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  </button>

                  {tr.type === 'video' ? (
                    <button
                      type="button"
                      onClick={() => onToggleTrackProp(tr.id, 'visible')}
                      aria-label={`Hide or Show ${tr.name}`}
                      title="Show / Hide Track"
                      className={`p-1 rounded-xs cursor-pointer ${
                        tr.visible ? 'text-[#D1D5DB] hover:text-white' : 'text-[#4B5563]'
                      }`}
                    >
                      {tr.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggleTrackProp(tr.id, 'muted')}
                      aria-label={`${tr.muted ? 'Unmute' : 'Mute'} ${tr.name}`}
                      title="Mute Track"
                      className={`p-1 rounded-xs cursor-pointer ${
                        tr.muted ? 'text-[#EF4444]' : 'text-[#D1D5DB] hover:text-white'
                      }`}
                    >
                      {tr.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onToggleTrackProp(tr.id, 'solo')}
                    aria-label={`Solo ${tr.name}`}
                    title="Play Only This Track"
                    className={`px-1 py-0.5 text-[9px] font-bold rounded-xs cursor-pointer ${
                      tr.solo
                        ? 'bg-[#D97706] text-black'
                        : 'text-[#6B7280] hover:text-white'
                    }`}
                  >
                    S
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Scrollable Ruler & Track Lanes */}
        <div
          ref={lanesRef}
          onPointerDown={(e) => {
            if (activeTool === 'hand' && lanesRef.current) {
              setDragState({
                mode: 'pan',
                startClientX: e.clientX,
                origScrollLeft: lanesRef.current.scrollLeft,
                origStartTime: 0,
                origDuration: 0,
                origTrackId: '',
              });
            }
          }}
          className={`flex-1 min-w-0 overflow-auto relative bg-[#111215] ${
            activeTool === 'razor'
              ? 'cursor-crosshair'
              : activeTool === 'hand'
              ? 'cursor-grab active:cursor-grabbing'
              : ''
          }`}
        >
          <div style={{ width: timelineWidth }} className="relative min-h-full">
            {/* Timecode Ruler */}
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                const t = clientXToTime(e.clientX);
                onSeek(t);
                setDragState({
                  mode: 'scrub',
                  startClientX: e.clientX,
                  origStartTime: t,
                  origDuration: 0,
                  origTrackId: '',
                });
              }}
              className="h-7 bg-[#181A20] border-b border-[#272A32] sticky top-0 z-20 cursor-ew-resize"
            >
              {sequence.inPoint !== null && sequence.outPoint !== null && sequence.outPoint > sequence.inPoint && (
                <div
                  className="absolute bottom-0 h-1 bg-[#3B82F6]/50 pointer-events-none"
                  style={{
                    left: sequence.inPoint * pixelsPerSecond,
                    width: (sequence.outPoint - sequence.inPoint) * pixelsPerSecond,
                  }}
                />
              )}

              {ticks.map((tk, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 pointer-events-none"
                  style={{ left: tk.time * pixelsPerSecond }}
                >
                  <div
                    className={`absolute bottom-0 w-px ${
                      tk.major ? 'h-2.5 bg-[#6B7280]' : 'h-1.5 bg-[#374151]'
                    }`}
                  />
                  {tk.major && tk.label && (
                    <span className="absolute top-1 left-1 text-[10px] leading-none font-mono-tabular text-[#8E939E] whitespace-nowrap">
                      {tk.label.slice(3)}
                    </span>
                  )}
                </div>
              ))}

              {markers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeek(m.time);
                  }}
                  title={`${m.label} (${secondsToTimecode(m.time, sequence.fps)})`}
                  style={{ left: m.time * pixelsPerSecond }}
                  className="absolute bottom-0 -translate-x-1/2 w-2.5 h-2.5 bg-[#10B981] hover:bg-[#34D399] rounded-t-xs cursor-pointer"
                />
              ))}
            </div>

            {/* Track Lanes & Clips */}
            <div className="relative">
              {tracks.map((tr) => {
                const trackClips = clips.filter((c) => c.trackId === tr.id);
                return (
                  <div
                    key={tr.id}
                    style={{ height: TRACK_HEIGHT }}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes('application/x-auteur-asset')) {
                        e.preventDefault();
                      }
                    }}
                    onDrop={(e) => {
                      const assetId = e.dataTransfer.getData('application/x-auteur-asset');
                      if (assetId) {
                        e.preventDefault();
                        const dropTime = clientXToTime(e.clientX);
                        onDropAssetAtTime(assetId, tr.id, dropTime);
                      }
                    }}
                    onClick={(e) => {
                      if (activeTool === 'hand') return;
                      if (e.target === e.currentTarget) {
                        onSeek(clientXToTime(e.clientX));
                      }
                    }}
                    className={`relative border-b border-[#1E2027] ${
                      tr.locked ? 'bg-[#121316]/80' : 'bg-[#13151A]'
                    }`}
                  >
                    {trackClips.map((clip) => {
                      const leftPx = clip.startTime * pixelsPerSecond;
                      const widthPx = Math.max(16, clip.duration * pixelsPerSecond);
                      const selected = clip.id === selectedClipId;
                      const asset = assetMap.get(clip.assetId);
                      const hasTransition =
                        (clip.transitionIn && clip.transitionIn !== 'none') ||
                        (clip.transitionOut && clip.transitionOut !== 'none');

                      const paletteClass =
                        clip.kind === 'audio'
                          ? 'bg-[#13382E] border-[#1E5B49] text-[#D1FAE5]'
                          : clip.kind === 'title'
                          ? 'bg-[#312548] border-[#523C7A] text-[#EDE9FE]'
                          : 'bg-[#1C3353] border-[#2C5282] text-[#E0F2FE]';

                      return (
                        <div
                          key={clip.id}
                          data-testid={`timeline-clip-${clip.id}`}
                          style={{ left: leftPx, width: widthPx }}
                          onPointerDown={(e) => {
                            if (activeTool === 'hand') return;
                            e.stopPropagation();
                            if (activeTool === 'razor') {
                              const splitAt = clientXToTime(e.clientX);
                              onSplitClip(clip.id, splitAt);
                              return;
                            }
                            onSelectClip(clip.id);
                            if (tr.locked) return;
                            setDragState({
                              mode: 'move',
                              clipId: clip.id,
                              startClientX: e.clientX,
                              origStartTime: clip.startTime,
                              origDuration: clip.duration,
                              origTrackId: clip.trackId,
                            });
                          }}
                          className={`group absolute top-1 bottom-1 rounded-xs border overflow-hidden flex flex-col justify-between transition-shadow ${paletteClass} ${
                            selected ? 'ring-1.5 ring-[#F59E0B] border-[#F59E0B] z-10' : ''
                          } ${activeTool === 'razor' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
                        >
                          <div className="px-1.5 pt-0.5 flex items-center justify-between gap-1 text-[10px] font-medium leading-none truncate pointer-events-none">
                            <span className="truncate">
                              {hasTransition ? '◆ ' : ''}
                              {clip.name}
                            </span>
                            {widthPx > 85 && (
                              <span className="font-mono-tabular opacity-70 shrink-0">
                                {clip.speed !== 1 ? `${clip.speed}x · ` : ''}
                                {clip.duration.toFixed(1)}s
                              </span>
                            )}
                          </div>

                          <div className="flex-1 min-h-0 px-1 pb-0.5 flex items-end overflow-hidden pointer-events-none">
                            {clip.kind === 'audio' && asset?.waveformPeaks ? (
                              <div className="w-full h-5 flex items-end gap-px opacity-80">
                                {asset.waveformPeaks.slice(0, 48).map((pk, idx) => (
                                  <span
                                    key={idx}
                                    className="flex-1 bg-[#34D399]"
                                    style={{ height: `${Math.max(10, pk * 100)}%` }}
                                  />
                                ))}
                              </div>
                            ) : asset?.src && clip.kind === 'image' ? (
                              <div className="w-full h-4 opacity-45 overflow-hidden rounded-xs">
                                <img
                                  src={asset.src}
                                  alt=""
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : null}
                          </div>

                          {activeTool !== 'razor' && !tr.locked && (
                            <>
                              <div
                                role="separator"
                                aria-label={`Trim start of ${clip.name}`}
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  onSelectClip(clip.id);
                                  setDragState({
                                    mode: 'trim-left',
                                    clipId: clip.id,
                                    startClientX: e.clientX,
                                    origStartTime: clip.startTime,
                                    origDuration: clip.duration,
                                    origTrackId: clip.trackId,
                                  });
                                }}
                                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-[#F59E0B]/80"
                              />
                              <div
                                role="separator"
                                aria-label={`Trim end of ${clip.name}`}
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  onSelectClip(clip.id);
                                  setDragState({
                                    mode: 'trim-right',
                                    clipId: clip.id,
                                    startClientX: e.clientX,
                                    origStartTime: clip.startTime,
                                    origDuration: clip.duration,
                                    origTrackId: clip.trackId,
                                  });
                                }}
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-[#F59E0B]/80"
                              />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Playhead Line */}
            <div
              style={{ left: currentTime * pixelsPerSecond }}
              className="absolute top-0 bottom-0 w-px bg-[#EF4444] pointer-events-none z-30"
            >
              <div className="w-3 h-3 -ml-[5.5px] bg-[#EF4444] rounded-t-xs" />
            </div>
          </div>
        </div>

        {/* 4. Calibrated Stereo Volume Meter */}
        <aside
          aria-label="Master Volume Meter"
          className="w-14 shrink-0 bg-[#15171B] border-l border-[#24272E] px-2 py-2 flex flex-col items-center justify-between"
        >
          <span className="text-[9px] font-mono-tabular text-[#8E939E]">Level</span>
          <div className="flex-1 w-full flex items-stretch justify-center gap-1.5 my-1.5">
            {([
              { ch: 'L', db: stereoLevels.leftDb },
              { ch: 'R', db: stereoLevels.rightDb },
            ] as const).map((m) => {
              const hPct = dbToHeightPct(m.db);
              return (
                <div key={m.ch} className="flex flex-col items-center gap-1 flex-1">
                  <div className="flex-1 w-2.5 bg-[#0C0D10] border border-[#252830] rounded-xs relative overflow-hidden flex items-end">
                    <div
                      className="w-full transition-all duration-75"
                      style={{
                        height: `${hPct}%`,
                        background:
                          'linear-gradient(to top, #10B981 0%, #10B981 65%, #F59E0B 85%, #EF4444 100%)',
                      }}
                    />
                  </div>
                  <span className="text-[9px] font-mono-tabular text-[#8E939E]">{m.ch}</span>
                </div>
              );
            })}
          </div>
          <span className="text-[9px] font-mono-tabular text-[#6B7280]">
            {stereoLevels.leftDb <= -59 ? '-∞' : stereoLevels.leftDb.toFixed(0)}
          </span>
        </aside>
      </div>
    </section>
  );
});
