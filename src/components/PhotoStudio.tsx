import React, { useEffect, useRef, useState } from 'react';
import {
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  FolderPlus,
  RotateCw,
  SplitSquareHorizontal,
} from 'lucide-react';
import {
  applyColorGradeToImageData,
  isColorGradeIdentity,
} from '../engine/colorEngine';
import { LoadedMediaCache } from '../engine/renderer';
import { CropAspectPreset, MediaAsset, TimelineClip } from '../engine/types';

interface PhotoStudioProps {
  clips: TimelineClip[];
  assets: MediaAsset[];
  selectedClip: TimelineClip | null;
  cache: LoadedMediaCache;
  mediaRevision: number;
  onSelectClip: (clipId: string) => void;
  onUpdateClip: (clipId: string, updater: (clip: TimelineClip) => TimelineClip) => void;
  onImportFiles: (files: FileList) => void;
}

const ASPECT_PRESETS: { id: CropAspectPreset; label: string; ratio: number | null }[] = [
  { id: 'original', label: 'Original', ratio: null },
  { id: '16:9', label: '16:9 Cinema', ratio: 16 / 9 },
  { id: '4:3', label: '4:3 Medium Format', ratio: 4 / 3 },
  { id: '1:1', label: '1:1 Square', ratio: 1 },
  { id: '4:5', label: '4:5 Editorial', ratio: 4 / 5 },
  { id: '9:16', label: '9:16 Vertical', ratio: 9 / 16 },
];

export const PhotoStudio: React.FC<PhotoStudioProps> = ({
  clips,
  assets,
  selectedClip,
  cache,
  mediaRevision,
  onSelectClip,
  onUpdateClip,
  onImportFiles,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [compareSplit, setCompareSplit] = useState<number | null>(null);
  const [aspectPreset, setAspectPreset] = useState<CropAspectPreset>('original');
  const [cursorRgb, setCursorRgb] = useState<{ r: number; g: number; b: number } | null>(null);

  const photoClips = clips.filter((c) => c.kind === 'image' || c.kind === 'video');
  const activeClip =
    selectedClip && (selectedClip.kind === 'image' || selectedClip.kind === 'video')
      ? selectedClip
      : photoClips[0] ?? null;
  const activeAsset = assets.find((a) => a.id === activeClip?.assetId) ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeClip || !activeAsset) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const img = cache.images.get(activeAsset.id);
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#0B0C0E';
    ctx.fillRect(0, 0, w, h);

    const mediaAspect = img.naturalWidth / img.naturalHeight;
    const canvasAspect = w / h;
    let drawW = w;
    let drawH = h;
    if (mediaAspect > canvasAspect) {
      drawW = w;
      drawH = w / mediaAspect;
    } else {
      drawH = h;
      drawW = h * mediaAspect;
    }

    const drawUntouched = (targetCtx: CanvasRenderingContext2D) => {
      targetCtx.save();
      targetCtx.translate(w / 2, h / 2);
      targetCtx.rotate((activeClip.transform.rotation * Math.PI) / 180);
      targetCtx.scale(
        activeClip.transform.flipH ? -1 : 1,
        activeClip.transform.flipV ? -1 : 1
      );
      const cTop = (activeClip.transform.cropTop / 100) * drawH;
      const cBottom = (activeClip.transform.cropBottom / 100) * drawH;
      const cLeft = (activeClip.transform.cropLeft / 100) * drawW;
      const cRight = (activeClip.transform.cropRight / 100) * drawW;
      targetCtx.beginPath();
      targetCtx.rect(
        -drawW / 2 + cLeft,
        -drawH / 2 + cTop,
        Math.max(1, drawW - cLeft - cRight),
        Math.max(1, drawH - cTop - cBottom)
      );
      targetCtx.clip();
      targetCtx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      targetCtx.restore();
    };

    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const offCtx = off.getContext('2d', { willReadFrequently: true });
    if (!offCtx) return;
    drawUntouched(offCtx);

    if (!isColorGradeIdentity(activeClip.color)) {
      const imgData = offCtx.getImageData(0, 0, w, h);
      applyColorGradeToImageData(imgData.data, activeClip.color);
      offCtx.putImageData(imgData, 0, 0);
    }

    if (compareSplit !== null) {
      const sx = Math.round(w * compareSplit);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, sx, h);
      ctx.clip();
      drawUntouched(ctx);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, 0, w - sx, h);
      ctx.clip();
      ctx.drawImage(off, 0, 0);
      ctx.restore();

      targetBadge(ctx, w, sx);
    } else {
      ctx.drawImage(off, 0, 0);
    }
  }, [activeClip, activeAsset, cache, compareSplit, mediaRevision]);

  function targetBadge(ctx: CanvasRenderingContext2D, w: number, sx: number) {
    ctx.strokeStyle = '#E4E6EB';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, ctx.canvas.height);
    ctx.stroke();

    // Drag handle circle in center
    const cy = ctx.canvas.height / 2;
    ctx.fillStyle = '#181A20';
    ctx.strokeStyle = '#E4E6EB';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#E4E6EB';
    ctx.font = '600 10px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('‹›', sx, cy);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(17,18,20,0.82)';
    ctx.fillRect(14, 14, 68, 22);
    ctx.fillRect(w - 72, 14, 58, 22);
    ctx.fillStyle = '#E5E7EB';
    ctx.fillText('BEFORE', 22, 29);
    ctx.fillText('AFTER', w - 63, 29);
  }

  const applyAspectCrop = (preset: CropAspectPreset) => {
    setAspectPreset(preset);
    if (!activeClip || !activeAsset) return;
    const def = ASPECT_PRESETS.find((p) => p.id === preset);
    if (!def || def.ratio === null) {
      onUpdateClip(activeClip.id, (c) => ({
        ...c,
        transform: { ...c.transform, cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 },
      }));
      return;
    }

    const srcRatio = activeAsset.width / Math.max(1, activeAsset.height);
    if (srcRatio > def.ratio) {
      const keepWidthFrac = def.ratio / srcRatio;
      const trimEach = ((1 - keepWidthFrac) / 2) * 100;
      onUpdateClip(activeClip.id, (c) => ({
        ...c,
        transform: {
          ...c.transform,
          cropLeft: Number(trimEach.toFixed(1)),
          cropRight: Number(trimEach.toFixed(1)),
          cropTop: 0,
          cropBottom: 0,
        },
      }));
    } else {
      const keepHeightFrac = srcRatio / def.ratio;
      const trimEach = ((1 - keepHeightFrac) / 2) * 100;
      onUpdateClip(activeClip.id, (c) => ({
        ...c,
        transform: {
          ...c.transform,
          cropTop: Number(trimEach.toFixed(1)),
          cropBottom: Number(trimEach.toFixed(1)),
          cropLeft: 0,
          cropRight: 0,
        },
      }));
    }
  };

  return (
    <section
      aria-label="Photo Studio Develop Workspace"
      className="flex flex-col h-full bg-[#111214] min-w-0 overflow-hidden select-none"
    >
      {/* Photo Studio Toolbar */}
      <div className="h-10 px-4 bg-[#16171B] border-b border-[#24272E] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-[12px] font-semibold text-[#E5E7EB] whitespace-nowrap">
            Photo Develop
          </span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded cursor-pointer whitespace-nowrap"
          >
            <FolderPlus className="w-3 h-3" />
            <span>Open Photo</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onImportFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />

          <div className="flex items-center gap-1.5 border-l border-[#262930] pl-2.5">
            <Crop className="w-3.5 h-3.5 text-[#8E939E]" />
            <select
              aria-label="Crop Aspect Ratio"
              value={aspectPreset}
              onChange={(e) => applyAspectCrop(e.target.value as CropAspectPreset)}
              className="bg-[#1C1E24] border border-[#2A2D36] rounded px-2 py-1 text-[11px] text-[#E5E7EB] cursor-pointer"
            >
              {ASPECT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {activeClip && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  onUpdateClip(activeClip.id, (c) => ({
                    ...c,
                    transform: {
                      ...c.transform,
                      rotation: (c.transform.rotation + 90) % 360,
                    },
                  }))
                }
                title="Rotate 90° Clockwise"
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-[#C7CBD4] hover:text-white bg-[#1C1E24] border border-[#2A2D36] rounded cursor-pointer whitespace-nowrap"
              >
                <RotateCw className="w-3 h-3" />
                <span>90°</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateClip(activeClip.id, (c) => ({
                    ...c,
                    transform: { ...c.transform, flipH: !c.transform.flipH },
                  }))
                }
                aria-pressed={Boolean(activeClip.transform.flipH)}
                title="Flip Horizontal"
                aria-label="Flip Horizontal"
                className={`p-1.5 rounded border cursor-pointer ${
                  activeClip.transform.flipH
                    ? 'bg-[#252A34] border-[#3B82F6] text-white'
                    : 'bg-[#1C1E24] border-[#2A2D36] text-[#C7CBD4] hover:text-white'
                }`}
              >
                <FlipHorizontal2 className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateClip(activeClip.id, (c) => ({
                    ...c,
                    transform: { ...c.transform, flipV: !c.transform.flipV },
                  }))
                }
                aria-pressed={Boolean(activeClip.transform.flipV)}
                title="Flip Vertical"
                aria-label="Flip Vertical"
                className={`p-1.5 rounded border cursor-pointer ${
                  activeClip.transform.flipV
                    ? 'bg-[#252A34] border-[#3B82F6] text-white'
                    : 'bg-[#1C1E24] border-[#2A2D36] text-[#C7CBD4] hover:text-white'
                }`}
              >
                <FlipVertical2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {cursorRgb && (
            <span className="text-[11px] font-mono-tabular text-[#9CA3AF] whitespace-nowrap">
              R {cursorRgb.r} · G {cursorRgb.g} · B {cursorRgb.b}
            </span>
          )}
          <button
            type="button"
            onClick={() => setCompareSplit((v) => (v === null ? 0.5 : null))}
            aria-pressed={compareSplit !== null}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded border cursor-pointer transition-colors whitespace-nowrap ${
              compareSplit !== null
                ? 'bg-[#3B82F6]/15 border-[#3B82F6] text-white'
                : 'bg-[#1C1E24] border-[#2A2D36] text-[#C7CBD4] hover:text-white'
            }`}
          >
            <SplitSquareHorizontal className="w-3.5 h-3.5" />
            <span>Before / After Split</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Stage */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 bg-[#0B0C0E] relative overflow-hidden">
        <canvas
          ref={canvasRef}
          width={960}
          height={600}
          data-testid="photo-studio-canvas"
          onPointerMove={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            if (compareSplit !== null && e.buttons === 1) {
              const frac = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
              setCompareSplit(frac);
            }
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const px = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
              const py = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);
              if (px >= 0 && py >= 0 && px < canvas.width && py < canvas.height) {
                const pixel = ctx.getImageData(px, py, 1, 1).data;
                setCursorRgb({ r: pixel[0], g: pixel[1], b: pixel[2] });
              }
            }
          }}
          onPointerDown={(e) => {
            if (compareSplit === null || !canvasRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const frac = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
            setCompareSplit(frac);
          }}
          className="max-w-full max-h-full object-contain shadow-xl cursor-crosshair"
        />
      </div>

      {/* Filmstrip Selector */}
      <div className="h-24 px-4 bg-[#15161A] border-t border-[#24272E] flex items-center gap-3 overflow-x-auto shrink-0">
        {photoClips.map((clip) => {
          const asset = assets.find((a) => a.id === clip.assetId);
          const isSelected = activeClip?.id === clip.id;
          return (
            <button
              key={clip.id}
              type="button"
              onClick={() => onSelectClip(clip.id)}
              className={`shrink-0 w-32 rounded border overflow-hidden text-left transition-colors cursor-pointer ${
                isSelected
                  ? 'border-[#3B82F6] ring-1 ring-[#3B82F6]'
                  : 'border-[#272A32] hover:border-[#424856]'
              }`}
            >
              <div className="h-14 bg-[#0D0E10] overflow-hidden">
                {asset?.src && (
                  <img
                    src={asset.src}
                    alt={clip.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="px-1.5 py-1 bg-[#1B1D23] text-[10px] text-[#D1D5DB] truncate">
                {clip.name}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
