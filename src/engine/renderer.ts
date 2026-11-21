import {
  applyColorGradeToImageData,
  computeScopesFromImageData,
  isColorGradeIdentity,
} from './colorEngine';
import { getActiveClipsAtTime } from './timelineOps';
import {
  MediaAsset,
  ScopeData,
  SequenceSettings,
  TimelineClip,
  Track,
} from './types';

export interface LoadedMediaCache {
  images: Map<string, HTMLImageElement>;
  videos: Map<string, HTMLVideoElement>;
}

export interface RenderOptions {
  showSafeGuides?: boolean;
  showGrid?: boolean;
  beforeAfterSplit?: number | null; // 0..1 fraction for Photo Studio comparison
  computeScopes?: boolean;
}

// Reusable scratch canvas for per-clip grading & cropping
let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

function getScratchContext(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!scratchCanvas) {
    scratchCanvas = document.createElement('canvas');
    scratchCtx = scratchCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (scratchCanvas.width !== width || scratchCanvas.height !== height) {
    scratchCanvas.width = width;
    scratchCanvas.height = height;
  }
  return scratchCtx;
}

function drawVignetteAndGrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  vignette: number,
  grain: number,
  seed: number
) {
  if (vignette !== 0) {
    const grad = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.25,
      w / 2,
      h / 2,
      Math.hypot(w, h) * 0.56
    );
    const alpha = Math.min(0.85, Math.abs(vignette) / 110);
    const col = vignette < 0 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha * 0.7})`;
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, col);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  if (grain > 0) {
    const count = Math.min(1800, Math.round((grain / 100) * 1400));
    const alpha = Math.min(0.18, (grain / 100) * 0.16);
    ctx.save();
    let s = Math.floor(seed * 1000) + 17;
    for (let i = 0; i < count; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const gx = (s % 10000) / 10000 * w;
      s = (s * 1664525 + 1013904223) >>> 0;
      const gy = (s % 10000) / 10000 * h;
      ctx.fillStyle = i % 2 === 0 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
      ctx.fillRect(gx, gy, 1.5, 1.5);
    }
    ctx.restore();
  }
}

function drawTitleOverlay(
  ctx: CanvasRenderingContext2D,
  clip: TimelineClip,
  w: number,
  h: number,
  alpha: number
) {
  const overlay = clip.textOverlay;
  if (!overlay) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  const scaleFactor = w / 1280;
  const fontSize = Math.max(14, Math.round(overlay.fontSize * scaleFactor));
  const subFontSize = Math.max(11, Math.round(fontSize * 0.48));

  ctx.translate(w / 2 + clip.transform.x * scaleFactor, h / 2 + clip.transform.y * scaleFactor);
  ctx.rotate((clip.transform.rotation * Math.PI) / 180);
  const s = clip.transform.scale / 100;
  ctx.scale(s, s);

  if (overlay.lowerThird) {
    const boxW = w * 0.44;
    const boxH = fontSize * 2.1;
    const bx = -w * 0.42;
    const by = h * 0.24;

    if (overlay.backgroundOpacity > 0) {
      ctx.fillStyle = overlay.backgroundColor;
      ctx.globalAlpha = alpha * (overlay.backgroundOpacity / 100);
      ctx.fillRect(bx, by, boxW, boxH);
      ctx.globalAlpha = alpha;
    }

    ctx.fillStyle = '#3B82F6';
    ctx.fillRect(bx, by, 4 * scaleFactor, boxH);

    ctx.font = `${overlay.fontWeight} ${fontSize}px "DM Sans", sans-serif`;
    ctx.fillStyle = overlay.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(overlay.text, bx + 18 * scaleFactor, by + 12 * scaleFactor);

    if (overlay.subtitle) {
      ctx.font = `500 ${subFontSize}px "JetBrains Mono", monospace`;
      ctx.fillStyle = 'rgba(228,230,235,0.8)';
      ctx.fillText(overlay.subtitle, bx + 18 * scaleFactor, by + fontSize + 18 * scaleFactor);
    }
  } else {
    ctx.font = `${overlay.fontWeight} ${fontSize}px "DM Sans", sans-serif`;
    const metrics = ctx.measureText(overlay.text);
    const padX = 26 * scaleFactor;
    const padY = 16 * scaleFactor;

    if (overlay.backgroundOpacity > 0) {
      ctx.fillStyle = overlay.backgroundColor;
      ctx.globalAlpha = alpha * (overlay.backgroundOpacity / 100);
      ctx.fillRect(
        -metrics.width / 2 - padX,
        -fontSize / 2 - padY,
        metrics.width + padX * 2,
        fontSize + (overlay.subtitle ? subFontSize + 10 * scaleFactor : 0) + padY * 2
      );
      ctx.globalAlpha = alpha;
    }

    ctx.fillStyle = overlay.color;
    ctx.textAlign = overlay.align;
    ctx.textBaseline = 'middle';
    const xPos = overlay.align === 'left' ? -w * 0.35 : overlay.align === 'right' ? w * 0.35 : 0;
    ctx.fillText(overlay.text, xPos, overlay.subtitle ? -subFontSize * 0.45 : 0);

    if (overlay.subtitle) {
      ctx.font = `500 ${subFontSize}px "JetBrains Mono", monospace`;
      ctx.fillStyle = 'rgba(228,230,235,0.78)';
      ctx.fillText(overlay.subtitle, xPos, fontSize * 0.65);
    }
  }

  ctx.restore();
}

export function renderClipToCanvas(
  ctx: CanvasRenderingContext2D,
  clip: TimelineClip,
  asset: MediaAsset | undefined,
  cache: LoadedMediaCache,
  canvasWidth: number,
  canvasHeight: number,
  localTime: number,
  skipColorGrade: boolean = false
) {
  const relTime = Math.max(0, localTime);
  const transDur = Math.min(clip.duration * 0.45, clip.transitionDuration ?? 0.6);
  let fadeAlpha = 1;
  if (clip.fadeIn > 0 && relTime < clip.fadeIn) {
    fadeAlpha = Math.max(0, Math.min(1, relTime / clip.fadeIn));
  }
  const timeFromEnd = clip.duration - relTime;
  if (clip.fadeOut > 0 && timeFromEnd < clip.fadeOut) {
    fadeAlpha = Math.min(fadeAlpha, Math.max(0, timeFromEnd / clip.fadeOut));
  }

  let wipeFraction: number | null = null;
  let wipeDirection: 'left' | 'right' = 'left';

  if (clip.transitionIn && clip.transitionIn !== 'none' && relTime < transDur && transDur > 0.01) {
    const p = Math.max(0, Math.min(1, relTime / transDur));
    if (clip.transitionIn === 'cross-dissolve' || clip.transitionIn === 'dip-black') {
      fadeAlpha = Math.min(fadeAlpha, p);
    } else if (clip.transitionIn === 'wipe-left') {
      wipeFraction = p;
      wipeDirection = 'left';
    } else if (clip.transitionIn === 'wipe-right') {
      wipeFraction = p;
      wipeDirection = 'right';
    }
  }

  if (clip.transitionOut && clip.transitionOut !== 'none' && timeFromEnd < transDur && transDur > 0.01) {
    const p = Math.max(0, Math.min(1, timeFromEnd / transDur));
    if (clip.transitionOut === 'cross-dissolve' || clip.transitionOut === 'dip-black') {
      fadeAlpha = Math.min(fadeAlpha, p);
    }
  }

  const finalAlpha = Math.max(0, Math.min(1, (clip.transform.opacity / 100) * fadeAlpha));
  if (finalAlpha <= 0.001) return;

  if (clip.kind === 'title') {
    drawTitleOverlay(ctx, clip, canvasWidth, canvasHeight, finalAlpha);
    return;
  }

  if (!asset) return;

  let mediaSource: HTMLImageElement | HTMLVideoElement | null = null;
  let naturalW = asset.width || 1280;
  let naturalH = asset.height || 720;

  if (asset.kind === 'image') {
    const img = cache.images.get(asset.id);
    if (img && img.complete && img.naturalWidth > 0) {
      mediaSource = img;
      naturalW = img.naturalWidth;
      naturalH = img.naturalHeight;
    }
  } else if (asset.kind === 'video') {
    const vid = cache.videos.get(asset.id);
    if (vid && vid.readyState >= 2) {
      mediaSource = vid;
      naturalW = vid.videoWidth || asset.width || 1280;
      naturalH = vid.videoHeight || asset.height || 720;
    }
  }

  if (!mediaSource) {
    ctx.save();
    ctx.fillStyle = '#181A1F';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#6B7280';
    ctx.font = '500 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`DECODING FRAME · ${asset.name}`, canvasWidth / 2, canvasHeight / 2);
    ctx.restore();
    return;
  }

  const aspectMedia = naturalW / naturalH;
  const aspectCanvas = canvasWidth / canvasHeight;
  let drawW = canvasWidth;
  let drawH = canvasHeight;
  if (aspectMedia > aspectCanvas) {
    drawW = canvasWidth;
    drawH = canvasWidth / aspectMedia;
  } else {
    drawH = canvasHeight;
    drawW = canvasHeight * aspectMedia;
  }

  const progress = clip.duration > 0 ? relTime / clip.duration : 0;
  const kbMultiplier = 1 + (clip.transform.kenBurnsZoom / 100) * progress;

  const sCtx = getScratchContext(canvasWidth, canvasHeight);
  if (!sCtx) return;

  sCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  sCtx.save();

  const cTop = (clip.transform.cropTop / 100) * drawH;
  const cBottom = (clip.transform.cropBottom / 100) * drawH;
  const cLeft = (clip.transform.cropLeft / 100) * drawW;
  const cRight = (clip.transform.cropRight / 100) * drawW;

  const scaleFactor = canvasWidth / 1280;
  sCtx.translate(
    canvasWidth / 2 + clip.transform.x * scaleFactor,
    canvasHeight / 2 + clip.transform.y * scaleFactor
  );
  sCtx.rotate((clip.transform.rotation * Math.PI) / 180);
  const totalScale = (clip.transform.scale / 100) * kbMultiplier;
  sCtx.scale(
    totalScale * (clip.transform.flipH ? -1 : 1),
    totalScale * (clip.transform.flipV ? -1 : 1)
  );

  sCtx.beginPath();
  sCtx.rect(
    -drawW / 2 + cLeft,
    -drawH / 2 + cTop,
    Math.max(1, drawW - cLeft - cRight),
    Math.max(1, drawH - cTop - cBottom)
  );
  sCtx.clip();

  sCtx.drawImage(mediaSource, -drawW / 2, -drawH / 2, drawW, drawH);
  sCtx.restore();

  if (!skipColorGrade && !isColorGradeIdentity(clip.color)) {
    const imgData = sCtx.getImageData(0, 0, canvasWidth, canvasHeight);
    applyColorGradeToImageData(imgData.data, clip.color);
    sCtx.putImageData(imgData, 0, 0);
  }

  if (!skipColorGrade) {
    drawVignetteAndGrain(
      sCtx,
      canvasWidth,
      canvasHeight,
      clip.color.vignette,
      clip.color.grain,
      localTime
    );
  }

  ctx.save();
  ctx.globalAlpha = finalAlpha;
  ctx.globalCompositeOperation = clip.transform.blendMode;
  if (wipeFraction !== null) {
    const ww = Math.round(canvasWidth * wipeFraction);
    ctx.beginPath();
    if (wipeDirection === 'left') {
      ctx.rect(0, 0, ww, canvasHeight);
    } else {
      ctx.rect(canvasWidth - ww, 0, ww, canvasHeight);
    }
    ctx.clip();
  }
  ctx.drawImage(sCtx.canvas, 0, 0);
  ctx.restore();
}

export function drawGuidesOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  showSafeGuides: boolean,
  showGrid: boolean
) {
  ctx.save();
  if (showGrid) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 3, 0);
    ctx.lineTo(w / 3, h);
    ctx.moveTo((w * 2) / 3, 0);
    ctx.lineTo((w * 2) / 3, h);
    ctx.moveTo(0, h / 3);
    ctx.lineTo(w, h / 3);
    ctx.moveTo(0, (h * 2) / 3);
    ctx.lineTo(w, (h * 2) / 3);
    ctx.stroke();
  }

  if (showSafeGuides) {
    // Action Safe (93%) & Title Safe (90%)
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const ax = w * 0.035;
    const ay = h * 0.035;
    ctx.strokeRect(ax, ay, w - ax * 2, h - ay * 2);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    const tx = w * 0.05;
    const ty = h * 0.05;
    ctx.strokeRect(tx, ty, w - tx * 2, h - ty * 2);

    // Center crosshair
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(w / 2 - 10, h / 2);
    ctx.lineTo(w / 2 + 10, h / 2);
    ctx.moveTo(w / 2, h / 2 - 10);
    ctx.lineTo(w / 2, h / 2 + 10);
    ctx.stroke();
  }
  ctx.restore();
}

export function renderCompositeFrame(
  canvas: HTMLCanvasElement,
  sequence: SequenceSettings,
  tracks: Track[],
  clips: TimelineClip[],
  assets: MediaAsset[],
  cache: LoadedMediaCache,
  currentTime: number,
  options: RenderOptions = {}
): ScopeData | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const w = canvas.width;
  const h = canvas.height;
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  ctx.fillStyle = '#08090B';
  ctx.fillRect(0, 0, w, h);

  const { videoClips } = getActiveClipsAtTime(clips, tracks, currentTime);

  if (options.beforeAfterSplit !== null && options.beforeAfterSplit !== undefined) {
    const splitX = Math.max(0, Math.min(w, Math.round(w * options.beforeAfterSplit)));
    // Left half: Original ungraded
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, splitX, h);
    ctx.clip();
    for (const clip of videoClips) {
      renderClipToCanvas(
        ctx,
        clip,
        assetMap.get(clip.assetId),
        cache,
        w,
        h,
        currentTime - clip.startTime,
        true
      );
    }
    ctx.restore();

    // Right half: Graded
    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, w - splitX, h);
    ctx.clip();
    for (const clip of videoClips) {
      renderClipToCanvas(
        ctx,
        clip,
        assetMap.get(clip.assetId),
        cache,
        w,
        h,
        currentTime - clip.startTime,
        false
      );
    }
    ctx.restore();

    // Split divider line & labels
    ctx.save();
    ctx.strokeStyle = '#E4E6EB';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(splitX, 0);
    ctx.lineTo(splitX, h);
    ctx.stroke();

    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(17, 18, 20, 0.78)';
    ctx.fillRect(12, 12, 68, 22);
    ctx.fillRect(w - 72, 12, 60, 22);
    ctx.fillStyle = '#E4E6EB';
    ctx.textAlign = 'left';
    ctx.fillText('BEFORE', 20, 27);
    ctx.textAlign = 'right';
    ctx.fillText('AFTER', w - 20, 27);
    ctx.restore();
  } else {
    for (const clip of videoClips) {
      renderClipToCanvas(
        ctx,
        clip,
        assetMap.get(clip.assetId),
        cache,
        w,
        h,
        currentTime - clip.startTime,
        false
      );
    }
  }

  let scopes: ScopeData | null = null;
  if (options.computeScopes) {
    const frameData = ctx.getImageData(0, 0, w, h);
    scopes = computeScopesFromImageData(frameData.data, w, h);
  }

  if (options.showSafeGuides || options.showGrid) {
    drawGuidesOverlay(ctx, w, h, Boolean(options.showSafeGuides), Boolean(options.showGrid));
  }

  return scopes;
}
