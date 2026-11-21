import React, { useEffect, useRef, useState } from 'react';
import {
  Crop,
  Download,
  FlipHorizontal2,
  FlipVertical2,
  FolderPlus,
  RotateCw,
  SplitSquareHorizontal,
} from 'lucide-react';
import {
  applyColorGradeToImageData,
  DEFAULT_EFFECTS,
  isColorGradeIdentity,
  isEffectsIdentity,
  PHOTO_STYLE_PRESETS,
} from '../engine/colorEngine';
import {
  applyMirrorModeToCanvas,
  drawCreativeEffectsOverlays,
  drawMaskShapePath,
  LoadedMediaCache,
} from '../engine/renderer';
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
  onOpenExport: () => void;
}

const ASPECT_PRESETS: { id: CropAspectPreset; label: string; ratio: number | null }[] = [
  { id: 'original', label: 'Original', ratio: null },
  { id: '16:9', label: '16:9 Wide', ratio: 16 / 9 },
  { id: '4:3', label: '4:3 Photo', ratio: 4 / 3 },
  { id: '1:1', label: '1:1 Square', ratio: 1 },
  { id: '4:5', label: '4:5 Portrait', ratio: 4 / 5 },
  { id: '9:16', label: '9:16 Story', ratio: 9 / 16 },
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
  onOpenExport,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rgbRef = useRef<HTMLSpanElement>(null);
  const gradedOffRef = useRef<HTMLCanvasElement | null>(null);
  const untouchedOffRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [compareSplit, setCompareSplit] = useState<number | null>(null);
  const [aspectPreset, setAspectPreset] = useState<CropAspectPreset>('original');
  const [photoZoom, setPhotoZoom] = useState<'fit' | '100' | '150'>('fit');

  const photoClips = clips.filter((c) => c.kind === 'image' || c.kind === 'video');
  const activeClip =
    selectedClip && (selectedClip.kind === 'image' || selectedClip.kind === 'video')
      ? selectedClip
      : photoClips[0] ?? null;
  const activeAsset = assets.find((a) => a.id === activeClip?.assetId) ?? null;

  // Step 1: Build cached graded + untouched buffers ONLY when clip styling/geometry changes
  useEffect(() => {
    if (!activeClip || !activeAsset) return;
    const img = cache.images.get(activeAsset.id);
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const w = 960;
    const h = 600;

    if (!untouchedOffRef.current) untouchedOffRef.current = document.createElement('canvas');
    if (!gradedOffRef.current) gradedOffRef.current = document.createElement('canvas');

    const uCanvas = untouchedOffRef.current;
    const gCanvas = gradedOffRef.current;
    uCanvas.width = w;
    uCanvas.height = h;
    gCanvas.width = w;
    gCanvas.height = h;

    const uCtx = uCanvas.getContext('2d', { willReadFrequently: true });
    const gCtx = gCanvas.getContext('2d', { willReadFrequently: true });
    if (!uCtx || !gCtx) return;

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

    const rw = Math.max(2, Math.round(drawW));
    const rh = Math.max(2, Math.round(drawH));
    const pixBlock = activeClip.effects?.pixelate ?? 0;

    // Grade only the photo pixels (not the #0B0C0E background matte)
    let gradedPhotoSource: CanvasImageSource = img;
    const needsGrade =
      !isColorGradeIdentity(activeClip.color) ||
      !isEffectsIdentity(activeClip.effects) ||
      pixBlock > 1;
    if (needsGrade) {
      const tmp = document.createElement('canvas');
      tmp.width = rw;
      tmp.height = rh;
      const tCtx = tmp.getContext('2d', { willReadFrequently: true });
      if (tCtx) {
        if (pixBlock > 1) {
          const pw = Math.max(4, Math.round(rw / pixBlock));
          const ph = Math.max(4, Math.round(rh / pixBlock));
          const mini = document.createElement('canvas');
          mini.width = pw;
          mini.height = ph;
          const mCtx = mini.getContext('2d');
          if (mCtx) {
            mCtx.drawImage(img, 0, 0, pw, ph);
            tCtx.imageSmoothingEnabled = false;
            tCtx.drawImage(mini, 0, 0, rw, rh);
            tCtx.imageSmoothingEnabled = true;
          } else {
            tCtx.drawImage(img, 0, 0, rw, rh);
          }
        } else {
          const blurPx = activeClip.effects?.blur ?? 0;
          if (blurPx > 0) tCtx.filter = `blur(${blurPx}px)`;
          tCtx.drawImage(img, 0, 0, rw, rh);
          tCtx.filter = 'none';
        }
        applyMirrorModeToCanvas(tCtx, tmp, activeClip.effects?.mirrorMode);
        const imgData = tCtx.getImageData(0, 0, rw, rh);
        applyColorGradeToImageData(imgData.data, activeClip.color, activeClip.effects, rw);
        tCtx.putImageData(imgData, 0, 0);

        const glowAmt = activeClip.effects?.glow ?? 0;
        if (glowAmt > 0) {
          tCtx.save();
          tCtx.globalCompositeOperation = 'screen';
          tCtx.globalAlpha = Math.min(0.45, (glowAmt / 100) * 0.4);
          tCtx.filter = `blur(${Math.round(8 + glowAmt * 0.14)}px)`;
          tCtx.drawImage(tmp, 0, 0);
          tCtx.restore();
        }
        drawCreativeEffectsOverlays(tCtx, rw, rh, activeClip.effects);
        gradedPhotoSource = tmp;
      }
    }

    const drawTransformed = (
      targetCtx: CanvasRenderingContext2D,
      src: CanvasImageSource,
      withFrameEffects: boolean
    ) => {
      targetCtx.fillStyle = '#0B0C0E';
      targetCtx.fillRect(0, 0, w, h);
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
      const rx = -drawW / 2 + cLeft;
      const ry = -drawH / 2 + cTop;
      const rWidth = Math.max(1, drawW - cLeft - cRight);
      const rHeight = Math.max(1, drawH - cTop - cBottom);
      const cornerRad = activeClip.effects?.cornerRadius ?? 0;
      const maskShape = withFrameEffects ? activeClip.effects?.maskShape : 'rect';

      if (withFrameEffects && (activeClip.effects?.dropShadow ?? 0) > 0.5) {
        targetCtx.save();
        targetCtx.shadowColor = 'rgba(0,0,0,0.75)';
        targetCtx.shadowBlur = activeClip.effects?.dropShadow ?? 0;
        targetCtx.fillStyle = '#000000';
        drawMaskShapePath(targetCtx, maskShape, rx, ry, rWidth, rHeight, cornerRad);
        targetCtx.fill();
        targetCtx.restore();
      }

      targetCtx.save();
      drawMaskShapePath(targetCtx, maskShape, rx, ry, rWidth, rHeight, cornerRad);
      targetCtx.clip();
      targetCtx.drawImage(src, -drawW / 2, -drawH / 2, drawW, drawH);
      targetCtx.restore();

      const bw = withFrameEffects ? activeClip.effects?.borderWidth ?? 0 : 0;
      if (bw > 0.25) {
        drawMaskShapePath(targetCtx, maskShape, rx, ry, rWidth, rHeight, cornerRad);
        targetCtx.strokeStyle = activeClip.effects?.borderColor ?? '#FFFFFF';
        targetCtx.lineWidth = bw;
        targetCtx.stroke();
      }
      targetCtx.restore();
    };

    drawTransformed(uCtx, img, false);
    drawTransformed(gCtx, gradedPhotoSource, true);

    // Draw instant composite after updating buffers
    drawComposite(compareSplit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeClip?.id,
    activeClip?.color,
    activeClip?.effects,
    activeClip?.transform,
    activeAsset,
    cache,
    mediaRevision,
  ]);

  // Step 2: Fast <1ms split wipe redraw when compareSplit changes
  function drawComposite(splitFrac: number | null) {
    const canvas = canvasRef.current;
    const uCanvas = untouchedOffRef.current;
    const gCanvas = gradedOffRef.current;
    if (!canvas || !uCanvas || !gCanvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (splitFrac !== null) {
      const sx = Math.round(w * splitFrac);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, sx, h);
      ctx.clip();
      ctx.drawImage(uCanvas, 0, 0);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, 0, w - sx, h);
      ctx.clip();
      ctx.drawImage(gCanvas, 0, 0);
      ctx.restore();

      targetBadge(ctx, w, sx);
    } else {
      ctx.drawImage(gCanvas, 0, 0);
    }
  }

  useEffect(() => {
    drawComposite(compareSplit);
  }, [compareSplit]);

  function targetBadge(ctx: CanvasRenderingContext2D, w: number, sx: number) {
    ctx.strokeStyle = '#E4E6EB';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, ctx.canvas.height);
    ctx.stroke();

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
      aria-label="Photo Editor Workspace"
      className="flex flex-col h-full bg-[#111214] min-w-0 overflow-hidden select-none"
    >
      {/* Photo Editor Toolbar */}
      <div className="h-10 px-3 bg-[#16171B] border-b border-[#24272E] flex items-center justify-between gap-2 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[12px] font-semibold text-[#E5E7EB] whitespace-nowrap">
            Photo Editor
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

          <div className="flex items-center gap-1.5 border-l border-[#262930] pl-2">
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
                title="Flip Left/Right"
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
                title="Flip Up/Down"
                aria-label="Flip Vertical"
                className={`p-1.5 rounded border cursor-pointer ${
                  activeClip.transform.flipV
                    ? 'bg-[#252A34] border-[#3B82F6] text-white'
                    : 'bg-[#1C1E24] border-[#2A2D36] text-[#C7CBD4] hover:text-white'
                }`}
              >
                <FlipVertical2 className="w-3 h-3" />
              </button>
              <div className="hidden xl:flex items-center gap-1.5 pl-2 border-l border-[#262930]">
                <span className="text-[10px] text-[#8E939E] whitespace-nowrap">Straighten</span>
                <input
                  type="range"
                  min={-45}
                  max={45}
                  step={1}
                  value={Math.max(-45, Math.min(45, activeClip.transform.rotation))}
                  aria-label="Straighten Angle"
                  onChange={(e) =>
                    onUpdateClip(activeClip.id, (c) => ({
                      ...c,
                      transform: { ...c.transform, rotation: Number(e.target.value) },
                    }))
                  }
                  className="w-16 studio-slider"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            ref={rgbRef}
            className="hidden xl:inline text-[11px] font-mono-tabular text-[#9CA3AF] whitespace-nowrap min-w-[110px] text-right"
          >
            Hover for RGB
          </span>
          <select
            aria-label="Photo Zoom"
            value={photoZoom}
            onChange={(e) => setPhotoZoom(e.target.value as 'fit' | '100' | '150')}
            className="bg-[#1C1E24] border border-[#2A2D36] rounded px-2 py-1 text-[11px] text-[#E5E7EB] cursor-pointer"
          >
            <option value="fit">Fit</option>
            <option value="100">100%</option>
            <option value="150">150%</option>
          </select>
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
            <span>Compare Before / After</span>
          </button>
          <button
            type="button"
            onClick={onOpenExport}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#E5E7EB] bg-[#20232B] hover:bg-[#2A2E38] border border-[#2F3440] rounded cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3 h-3" />
            <span>Save Photo</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Stage */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 bg-[#0B0C0E] relative overflow-auto">
        <canvas
          ref={canvasRef}
          width={960}
          height={600}
          data-testid="photo-studio-canvas"
          onPointerMove={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const fracX = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
            if (compareSplit !== null && e.buttons === 1) {
              setCompareSplit(fracX);
            }
            const ctx = canvas.getContext('2d');
            if (ctx && rgbRef.current) {
              const px = Math.min(canvas.width - 1, Math.max(0, Math.floor(fracX * canvas.width)));
              const py = Math.min(
                canvas.height - 1,
                Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height))
              );
              const d = ctx.getImageData(px, py, 1, 1).data;
              rgbRef.current.textContent = `R ${d[0]} · G ${d[1]} · B ${d[2]}`;
            }
          }}
          onPointerLeave={() => {
            if (rgbRef.current) rgbRef.current.textContent = 'Hover for RGB';
          }}
          style={
            photoZoom === 'fit'
              ? { maxWidth: '100%', maxHeight: '100%', aspectRatio: '16 / 10' }
              : photoZoom === '100'
              ? { width: '960px', height: '600px' }
              : { width: '1440px', height: '900px' }
          }
          className={`block bg-black shadow-2xl ${
            compareSplit !== null ? 'cursor-ew-resize' : 'cursor-crosshair'
          }`}
        />
      </div>

      {/* Quick One-Click Photo Styles */}
      {activeClip && (
        <div className="px-4 py-1.5 bg-[#15161B] border-t border-[#24272E] flex items-center gap-2 overflow-x-auto shrink-0">
          <span className="text-[11px] font-medium text-[#8E939E] whitespace-nowrap shrink-0">
            Quick Styles:
          </span>
          {PHOTO_STYLE_PRESETS.map((style) => (
            <button
              key={style.id}
              type="button"
              onClick={() =>
                onUpdateClip(activeClip.id, (c) => ({
                  ...c,
                  color: style.buildGrade(),
                  effects: { ...DEFAULT_EFFECTS, ...(style.effects ?? {}) },
                }))
              }
              className="px-2.5 py-1 text-[11px] font-medium text-[#D1D5DB] hover:text-white bg-[#1D2027] hover:bg-[#282D38] border border-[#2A2E38] rounded cursor-pointer whitespace-nowrap shrink-0"
            >
              {style.label}
            </button>
          ))}
        </div>
      )}

      {/* Photo Filmstrip Selector */}
      <div className="h-22 px-4 py-2 bg-[#141519] border-t border-[#24272E] flex items-center gap-2.5 overflow-x-auto shrink-0">
        {photoClips.map((c) => {
          const asset = assets.find((a) => a.id === c.assetId);
          const isActive = activeClip?.id === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelectClip(c.id)}
              className={`h-full aspect-video rounded border overflow-hidden relative shrink-0 cursor-pointer transition-colors ${
                isActive
                  ? 'border-[#3B82F6] ring-1 ring-[#3B82F6]/50'
                  : 'border-[#2A2D36] hover:border-[#4B5563]'
              }`}
            >
              {asset?.src && (
                <img
                  src={asset.src}
                  alt={c.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              )}
              <span className="absolute inset-x-0 bottom-0 px-1.5 py-0.5 bg-black/75 text-[10px] text-[#E5E7EB] truncate text-left">
                {c.name}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
