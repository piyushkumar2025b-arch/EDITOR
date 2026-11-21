import React, { useRef, useState } from 'react';
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Move,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  SplitSquareHorizontal,
} from 'lucide-react';
import { secondsToTimecode } from '../engine/timecode';
import {
  ClipTransform,
  MediaAsset,
  SequenceAspectPreset,
  SequenceSettings,
  TimelineClip,
} from '../engine/types';

interface MonitorPanelProps {
  programCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  sequence: SequenceSettings;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isLooping: boolean;
  playbackRate: number;
  sourceAsset: MediaAsset | null;
  selectedClip: TimelineClip | null;
  allowDualMonitor?: boolean;
  showDualMonitor: boolean;
  onToggleDualMonitor: () => void;
  onTogglePlay: () => void;
  onChangePlaybackRate: (rate: number) => void;
  onStepFrame: (delta: number) => void;
  onSeek: (time: number) => void;
  onToggleLoop: () => void;
  onSetInPoint: () => void;
  onSetOutPoint: () => void;
  onInsertSourceAtPlayhead: () => void;
  onChangeAspectRatio: (ratio: SequenceAspectPreset) => void;
  onToggleCinemaBars: () => void;
  onUpdateClipTransform?: (clipId: string, patch: Partial<ClipTransform>) => void;
}

export const MonitorPanel: React.FC<MonitorPanelProps> = ({
  programCanvasRef,
  sequence,
  currentTime,
  duration,
  isPlaying,
  isLooping,
  playbackRate,
  sourceAsset,
  selectedClip,
  allowDualMonitor = true,
  showDualMonitor,
  onToggleDualMonitor,
  onTogglePlay,
  onChangePlaybackRate,
  onStepFrame,
  onSeek,
  onToggleLoop,
  onSetInPoint,
  onSetOutPoint,
  onInsertSourceAtPlayhead,
  onChangeAspectRatio,
  onToggleCinemaBars,
  onUpdateClipTransform,
}) => {
  const [zoom, setZoom] = useState<'fit' | '50' | '100'>('fit');
  const [transformMode, setTransformMode] = useState(false);
  const dragOriginRef = useRef<{
    clientX: number;
    clientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const canDirectTransform =
    Boolean(selectedClip) &&
    selectedClip?.kind !== 'audio' &&
    Boolean(onUpdateClipTransform);

  const aspectValue: SequenceAspectPreset =
    sequence.width === 1080 && sequence.height === 1920
      ? '9:16'
      : sequence.width === 1080 && sequence.height === 1080
      ? '1:1'
      : sequence.width === 1080 && sequence.height === 1350
      ? '4:5'
      : '16:9';

  const canvasDims =
    aspectValue === '9:16'
      ? { w: 405, h: 720 }
      : aspectValue === '1:1'
      ? { w: 640, h: 640 }
      : aspectValue === '4:5'
      ? { w: 512, h: 640 }
      : { w: 960, h: 540 };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!transformMode || !canDirectTransform || !selectedClip) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOriginRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      origX: selectedClip.transform.x,
      origY: selectedClip.transform.y,
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragOriginRef.current || !selectedClip || !onUpdateClipTransform || !programCanvasRef.current) {
      return;
    }
    const rect = programCanvasRef.current.getBoundingClientRect();
    const scaleX = 1280 / Math.max(1, rect.width);
    const scaleY = 720 / Math.max(1, rect.height);
    const dx = (e.clientX - dragOriginRef.current.clientX) * scaleX;
    const dy = (e.clientY - dragOriginRef.current.clientY) * scaleY;
    onUpdateClipTransform(selectedClip.id, {
      x: Math.round(dragOriginRef.current.origX + dx),
      y: Math.round(dragOriginRef.current.origY + dy),
    });
  };

  const handleCanvasPointerUp = () => {
    dragOriginRef.current = null;
  };

  return (
    <section
      aria-label="Video Preview and Clip Viewer"
      className="flex flex-col h-full bg-[#111214] min-w-0 overflow-hidden select-none"
    >
      {/* Monitor Header Bar */}
      <div className="h-9 px-3 bg-[#16171B] border-b border-[#24272E] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[12px] font-semibold text-[#E5E7EB] whitespace-nowrap">
            {showDualMonitor ? 'Clip & Video Preview' : 'Video Preview'}
          </span>
          <span className="text-[11px] text-[#7D838F] truncate hidden xl:inline">
            {transformMode && canDirectTransform
              ? `Drag on video to move "${selectedClip?.name}"`
              : sequence.name}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canDirectTransform && (
            <button
              type="button"
              onClick={() => setTransformMode((m) => !m)}
              aria-pressed={transformMode}
              title="Drag to Move & Resize Selected Clip on Screen"
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                transformMode
                  ? 'bg-[#3B82F6]/20 border-[#3B82F6] text-white'
                  : 'bg-[#1B1D23] border-[#292D36] text-[#9CA3AF] hover:text-white'
              }`}
            >
              <Move className="w-3 h-3" />
              <span>Move & Resize</span>
            </button>
          )}

          {transformMode && selectedClip && onUpdateClipTransform && (
            <div className="flex items-center gap-1 bg-[#1B1D23] border border-[#292D36] rounded px-1.5 py-0.5">
              <button
                type="button"
                onClick={() =>
                  onUpdateClipTransform(selectedClip.id, {
                    scale: Math.max(10, selectedClip.transform.scale - 10),
                  })
                }
                aria-label="Scale Down"
                className="px-1 text-[11px] text-[#C7CBD4] hover:text-white cursor-pointer"
              >
                -
              </button>
              <span className="text-[10px] font-mono-tabular text-[#E5E7EB] min-w-[34px] text-center">
                {Math.round(selectedClip.transform.scale)}%
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateClipTransform(selectedClip.id, {
                    scale: Math.min(250, selectedClip.transform.scale + 10),
                  })
                }
                aria-label="Scale Up"
                className="px-1 text-[11px] text-[#C7CBD4] hover:text-white cursor-pointer"
              >
                +
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateClipTransform(selectedClip.id, { x: 0, y: 0, scale: 100, rotation: 0 })
                }
                title="Reset Position & Size"
                aria-label="Reset Transform"
                className="p-0.5 text-[#8E939E] hover:text-white cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" />
              </button>
            </div>
          )}

          <select
            aria-label="Video Aspect Ratio"
            value={aspectValue}
            onChange={(e) => onChangeAspectRatio(e.target.value as SequenceAspectPreset)}
            className="bg-[#1B1D23] border border-[#292D36] rounded px-2 py-1 text-[11px] text-[#D1D5DB] focus:outline-none focus:border-[#3B82F6] cursor-pointer"
          >
            <option value="16:9">16:9 Wide</option>
            <option value="9:16">9:16 Reels</option>
            <option value="1:1">1:1 Square</option>
            <option value="4:5">4:5 Portrait</option>
          </select>

          <button
            type="button"
            onClick={onToggleCinemaBars}
            aria-pressed={Boolean(sequence.cinemaBars)}
            title="Toggle Widescreen Cinema Black Bars"
            className={`hidden md:flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              sequence.cinemaBars
                ? 'bg-[#252A34] border-[#3B82F6]/60 text-white'
                : 'bg-[#1B1D23] border-[#292D36] text-[#9CA3AF] hover:text-white'
            }`}
          >
            <Clapperboard className="w-3 h-3" />
            <span>Cinema Bars</span>
          </button>

          {allowDualMonitor && (
            <button
              type="button"
              onClick={onToggleDualMonitor}
              aria-pressed={showDualMonitor}
              title="Show Original Clip Alongside Final Video"
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                showDualMonitor
                  ? 'bg-[#252A34] border-[#3B82F6]/60 text-white'
                  : 'bg-[#1B1D23] border-[#292D36] text-[#9CA3AF] hover:text-white'
              }`}
            >
              <SplitSquareHorizontal className="w-3 h-3" />
              <span>Dual View</span>
            </button>
          )}

          <select
            aria-label="Preview Zoom"
            value={zoom}
            onChange={(e) => setZoom(e.target.value as 'fit' | '50' | '100')}
            className="bg-[#1B1D23] border border-[#292D36] rounded px-2 py-1 text-[11px] text-[#D1D5DB] focus:outline-none focus:border-[#3B82F6] cursor-pointer"
          >
            <option value="fit">Fit</option>
            <option value="50">50%</option>
            <option value="100">100%</option>
          </select>
        </div>
      </div>

      {/* Monitor Viewports */}
      <div className="flex-1 min-h-0 p-3 flex items-center justify-center gap-3 bg-[#0C0D0F] overflow-auto">
        {showDualMonitor && (
          <div className="flex-1 h-full flex flex-col bg-[#121317] border border-[#24272E] rounded overflow-hidden min-w-0">
            <div className="h-7 px-2.5 bg-[#17191E] border-b border-[#24272E] flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#9CA3AF] truncate">
                Clip: {sourceAsset ? sourceAsset.name : 'None Selected'}
              </span>
              {sourceAsset && (
                <button
                  type="button"
                  onClick={onInsertSourceAtPlayhead}
                  className="text-[10px] font-medium text-[#60A5FA] hover:text-white cursor-pointer whitespace-nowrap"
                >
                  + Add to Timeline
                </button>
              )}
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center p-2 bg-[#08090B]">
              {sourceAsset ? (
                sourceAsset.kind === 'image' && sourceAsset.src ? (
                  <img
                    src={sourceAsset.src}
                    alt={sourceAsset.name}
                    referrerPolicy="no-referrer"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : sourceAsset.kind === 'video' && sourceAsset.src ? (
                  <video
                    src={sourceAsset.src}
                    controls
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="w-full max-w-xs space-y-2 text-center">
                    <div className="flex items-end justify-center gap-1 h-20 px-4">
                      {(sourceAsset.waveformPeaks ?? []).slice(0, 32).map((pk, idx) => (
                        <span
                          key={idx}
                          className="w-1.5 bg-[#10B981]/80 rounded-xs"
                          style={{ height: `${Math.max(8, pk * 100)}%` }}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] font-mono-tabular text-[#9CA3AF]">
                      {sourceAsset.codec} · {secondsToTimecode(sourceAsset.duration, sequence.fps)}
                    </p>
                  </div>
                )
              ) : (
                <p className="text-[12px] text-[#6B7280]">
                  Click a file in Media Library to preview
                </p>
              )}
            </div>
          </div>
        )}

        {/* Program Monitor Canvas */}
        <div className="flex-1 h-full flex flex-col bg-[#121317] border border-[#24272E] rounded overflow-hidden min-w-0">
          {showDualMonitor && (
            <div className="h-7 px-2.5 bg-[#17191E] border-b border-[#24272E] flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#D1D5DB]">
                Final Video: {sequence.name}
              </span>
              <span className="text-[11px] font-mono-tabular text-[#3B82F6]">
                {secondsToTimecode(currentTime, sequence.fps)}
              </span>
            </div>
          )}
          <div className="flex-1 min-h-0 flex items-center justify-center p-2 bg-[#0D0F13] overflow-auto">
            <canvas
              ref={programCanvasRef}
              width={canvasDims.w}
              height={canvasDims.h}
              data-testid="program-canvas"
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              style={
                zoom === 'fit'
                  ? {
                      width: 'auto',
                      height: 'auto',
                      maxWidth: '100%',
                      maxHeight: '100%',
                      aspectRatio: `${sequence.width} / ${sequence.height}`,
                    }
                  : zoom === '50'
                  ? { width: `${Math.round(canvasDims.w * 0.55)}px`, height: `${Math.round(canvasDims.h * 0.55)}px` }
                  : { width: `${canvasDims.w}px`, height: `${canvasDims.h}px` }
              }
              className={`block bg-black border border-[#2F3542] shadow-2xl ${
                transformMode && canDirectTransform
                  ? 'cursor-move ring-1 ring-[#3B82F6]'
                  : ''
              }`}
            />
          </div>
        </div>
      </div>

      {/* Transport & Timecode Bar */}
      <div className="h-11 px-3 bg-[#16171B] border-t border-[#24272E] flex items-center justify-between gap-3 shrink-0">
        {/* Left: Live SMPTE Timecode */}
        <div className="flex items-center gap-2 min-w-[140px]">
          <span
            data-testid="program-timecode"
            className="text-[13px] font-semibold font-mono-tabular text-[#3B82F6] tracking-tight"
          >
            {secondsToTimecode(currentTime, sequence.fps)}
          </span>
          <span className="text-[11px] font-mono-tabular text-[#6B7280]">
            / {secondsToTimecode(duration, sequence.fps)}
          </span>
        </div>

        {/* Center: Clear Transport Buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onSetInPoint}
            title="Set Export Start Here (I)"
            aria-label="Set Start Point"
            className="px-2 py-1 text-[11px] font-medium text-[#9CA3AF] hover:text-white hover:bg-[#24272F] rounded cursor-pointer whitespace-nowrap"
          >
            In
          </button>
          <button
            type="button"
            onClick={() => onSeek(0)}
            title="Jump to Start"
            aria-label="Go to Start"
            className="p-1.5 text-[#C7CBD4] hover:text-white hover:bg-[#24272F] rounded cursor-pointer"
          >
            <ChevronFirst className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onStepFrame(-1)}
            title="Previous Frame (Left Arrow)"
            aria-label="Previous Frame"
            className="p-1.5 text-[#C7CBD4] hover:text-white hover:bg-[#24272F] rounded cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            title="Play / Pause (Space)"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className={`p-1.5 px-3 rounded transition-colors cursor-pointer ${
              isPlaying
                ? 'bg-[#3B82F6] text-white'
                : 'bg-[#262A33] text-white hover:bg-[#323743]'
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => onStepFrame(1)}
            title="Next Frame (Right Arrow)"
            aria-label="Next Frame"
            className="p-1.5 text-[#C7CBD4] hover:text-white hover:bg-[#24272F] rounded cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onSeek(duration)}
            title="Jump to End"
            aria-label="Go to End"
            className="p-1.5 text-[#C7CBD4] hover:text-white hover:bg-[#24272F] rounded cursor-pointer"
          >
            <ChevronLast className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onSetOutPoint}
            title="Set Export End Here (O)"
            aria-label="Set End Point"
            className="px-2 py-1 text-[11px] font-medium text-[#9CA3AF] hover:text-white hover:bg-[#24272F] rounded cursor-pointer whitespace-nowrap"
          >
            Out
          </button>
        </div>

        {/* Right: Playback Speed + Loop */}
        <div className="flex items-center justify-end gap-1.5 min-w-[140px]">
          <select
            aria-label="Playback Speed"
            value={playbackRate}
            onChange={(e) => onChangePlaybackRate(Number(e.target.value))}
            title="Preview Playback Speed"
            className="bg-[#1B1D23] border border-[#282B33] rounded px-1.5 py-1 text-[11px] font-mono-tabular text-[#D1D5DB] cursor-pointer"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
          </select>

          <button
            type="button"
            onClick={onToggleLoop}
            aria-pressed={isLooping}
            title="Loop Playback"
            aria-label="Loop Playback"
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border cursor-pointer transition-colors ${
              isLooping
                ? 'bg-[#3B82F6]/15 border-[#3B82F6]/60 text-[#60A5FA]'
                : 'bg-[#1B1D23] border-[#282B33] text-[#8E939E] hover:text-white'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>Loop</span>
          </button>
        </div>
      </div>
    </section>
  );
};
