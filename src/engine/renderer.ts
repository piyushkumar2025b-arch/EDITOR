import {
  applyColorGradeToImageData,
  computeScopesFromImageData,
  hashGradeAndEffects,
  isColorGradeIdentity,
  isEffectsIdentity,
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
  beforeAfterSplit?: number | null;
  computeScopes?: boolean;
}

// Reusable scratch canvases
let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;
let scopeCanvas: HTMLCanvasElement | null = null;
let scopeCtx: CanvasRenderingContext2D | null = null;

// LRU cache of pre-graded static image frames so playback, scrubbing, and motion stay 60fps
const GRADED_CACHE_MAX = 24;
const gradedImageCache = new Map<string, HTMLCanvasElement>();

function getGradedCacheEntry(key: string): HTMLCanvasElement | undefined {
  const hit = gradedImageCache.get(key);
  if (hit) {
    gradedImageCache.delete(key);
    gradedImageCache.set(key, hit);
  }
  return hit;
}

function setGradedCacheEntry(key: string, canvas: HTMLCanvasElement) {
  if (gradedImageCache.size >= GRADED_CACHE_MAX) {
    const oldest = gradedImageCache.keys().next().value;
    if (oldest) gradedImageCache.delete(oldest);
  }
  gradedImageCache.set(key, canvas);
}

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

function getScopeContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!scopeCanvas) {
    scopeCanvas = document.createElement('canvas');
    scopeCanvas.width = 160;
    scopeCanvas.height = 90;
    scopeCtx = scopeCanvas.getContext('2d', { willReadFrequently: true });
  }
  return scopeCtx;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (radius <= 0.5) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
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
    const count = Math.min(900, Math.round((grain / 100) * 700));
    const alpha = Math.min(0.18, (grain / 100) * 0.16);
    ctx.save();
    let s = Math.floor(seed * 1000) + 17;
    for (let i = 0; i < count; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const gx = ((s % 10000) / 10000) * w;
      s = (s * 1664525 + 1013904223) >>> 0;
      const gy = ((s % 10000) / 10000) * h;
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
  alpha: number,
  relTime: number
) {
  const overlay = clip.textOverlay;
  if (!overlay) return;

  const anim = overlay.animation ?? 'none';
  const enterT = Math.min(1, Math.max(0, relTime / 0.55));
  const ease = 1 - Math.pow(1 - enterT, 3);
  let animAlpha = alpha;
  let animY = 0;
  let animScale = 1;
  let displayText = overlay.text;

  if (anim === 'fade-up') {
    animAlpha *= 0.25 + 0.75 * ease;
    animY = (1 - ease) * 24 * (h / 720);
  } else if (anim === 'pop-in') {
    animAlpha *= 0.25 + 0.75 * ease;
    animScale = 0.76 + 0.24 * ease;
  } else if (anim === 'typewriter') {
    const typeProgress = Math.min(1, Math.max(0.15, relTime / Math.min(clip.duration * 0.7, 1.8)));
    const charCount = Math.max(1, Math.ceil(overlay.text.length * typeProgress));
    displayText = overlay.text.slice(0, charCount);
  }

  ctx.save();
  ctx.globalAlpha = animAlpha;
  const scaleFactor = Math.min(w, h) / 720;
  const fontSize = Math.max(14, Math.round(overlay.fontSize * scaleFactor));
  const subFontSize = Math.max(11, Math.round(fontSize * 0.48));
  const fontStack =
    overlay.fontFamily === 'serif'
      ? 'Georgia, "Times New Roman", serif'
      : overlay.fontFamily === 'mono'
      ? '"JetBrains Mono", monospace'
      : '"DM Sans", sans-serif';

  ctx.translate(
    w / 2 + clip.transform.x * (w / 1280),
    h / 2 + clip.transform.y * (h / 720) + animY
  );
  ctx.rotate((clip.transform.rotation * Math.PI) / 180);
  const s = (clip.transform.scale / 100) * animScale;
  ctx.scale(s, s);

  if (typeof (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing === 'string') {
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${(overlay.letterSpacing ?? 0).toFixed(2)}em`;
  }

  if (overlay.textShadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 10 * scaleFactor;
    ctx.shadowOffsetY = 2 * scaleFactor;
  }

  const outlineW = (overlay.outlineWidth ?? 0) * scaleFactor;
  const drawStyledText = (txt: string, x: number, y: number) => {
    if (outlineW > 0.2) {
      ctx.save();
      ctx.lineWidth = outlineW * 2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = overlay.outlineColor || '#000000';
      ctx.strokeText(txt, x, y);
      ctx.restore();
    }
    ctx.fillText(txt, x, y);
  };

  if (overlay.stylePreset === 'caption') {
    ctx.font = `600 ${Math.max(14, Math.round(fontSize * 0.72))}px ${fontStack}`;
    const textW = ctx.measureText(displayText).width;
    const padX = 18 * scaleFactor;
    const padY = 10 * scaleFactor;
    const cy = h * 0.36;
    if (overlay.backgroundOpacity > 0) {
      ctx.fillStyle = overlay.backgroundColor;
      ctx.globalAlpha = animAlpha * (overlay.backgroundOpacity / 100);
      drawRoundedRectPath(
        ctx,
        -textW / 2 - padX,
        cy - fontSize * 0.42 - padY,
        textW + padX * 2,
        fontSize * 0.84 + padY * 2,
        6 * scaleFactor
      );
      ctx.fill();
      ctx.globalAlpha = animAlpha;
    }
    ctx.fillStyle = overlay.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawStyledText(displayText, 0, cy);
  } else if (overlay.lowerThird) {
    const boxW = w * 0.48;
    const boxH = fontSize * 2.1;
    const bx = -w * 0.42;
    const by = h * 0.24;

    if (overlay.backgroundOpacity > 0) {
      ctx.fillStyle = overlay.backgroundColor;
      ctx.globalAlpha = animAlpha * (overlay.backgroundOpacity / 100);
      ctx.fillRect(bx, by, boxW, boxH);
      ctx.globalAlpha = animAlpha;
    }

    ctx.fillStyle = '#3B82F6';
    ctx.fillRect(bx, by, 4 * scaleFactor, boxH);

    ctx.font = `${overlay.fontWeight} ${fontSize}px ${fontStack}`;
    ctx.fillStyle = overlay.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    drawStyledText(displayText, bx + 18 * scaleFactor, by + 12 * scaleFactor);

    if (overlay.subtitle) {
      ctx.font = `500 ${subFontSize}px "JetBrains Mono", monospace`;
      ctx.fillStyle = 'rgba(228,230,235,0.8)';
      ctx.fillText(overlay.subtitle, bx + 18 * scaleFactor, by + fontSize + 18 * scaleFactor);
    }
  } else {
    ctx.font = `${overlay.fontWeight} ${fontSize}px ${fontStack}`;
    const metrics = ctx.measureText(displayText);
    const padX = 26 * scaleFactor;
    const padY = 16 * scaleFactor;

    if (overlay.backgroundOpacity > 0) {
      ctx.fillStyle = overlay.backgroundColor;
      ctx.globalAlpha = animAlpha * (overlay.backgroundOpacity / 100);
      drawRoundedRectPath(
        ctx,
        -metrics.width / 2 - padX,
        -fontSize / 2 - padY,
        metrics.width + padX * 2,
        fontSize + (overlay.subtitle ? subFontSize + 10 * scaleFactor : 0) + padY * 2,
        overlay.stylePreset === 'tag' ? 6 * scaleFactor : 0
      );
      ctx.fill();
      ctx.globalAlpha = animAlpha;
    }

    ctx.fillStyle = overlay.color;
    ctx.textAlign = overlay.align;
    ctx.textBaseline = 'middle';
    const xPos = overlay.align === 'left' ? -w * 0.35 : overlay.align === 'right' ? w * 0.35 : 0;
    drawStyledText(displayText, xPos, overlay.subtitle ? -subFontSize * 0.45 : 0);

    if (overlay.subtitle) {
      ctx.font = `500 ${subFontSize}px "JetBrains Mono", monospace`;
      ctx.fillStyle = 'rgba(228,230,235,0.78)';
      ctx.fillText(overlay.subtitle, xPos, fontSize * 0.65);
    }
  }

  ctx.restore();
}

function getOrBuildGradedImageCanvas(
  img: HTMLImageElement,
  assetId: string,
  drawW: number,
  drawH: number,
  clip: TimelineClip
): HTMLCanvasElement | null {
  const rw = Math.max(2, Math.round(drawW));
  const rh = Math.max(2, Math.round(drawH));
  const key = `${assetId}|${rw}x${rh}|${hashGradeAndEffects(clip.color, clip.effects)}`;
  const cached = getGradedCacheEntry(key);
  if (cached) return cached;

  const off = document.createElement('canvas');
  off.width = rw;
  off.height = rh;
  const offCtx = off.getContext('2d', { willReadFrequently: true });
  if (!offCtx) return null;

  const pixBlock = clip.effects?.pixelate ?? 0;
  const blurPx = clip.effects?.blur ?? 0;

  if (pixBlock > 1) {
    const pw = Math.max(4, Math.round(rw / pixBlock));
    const ph = Math.max(4, Math.round(rh / pixBlock));
    const mini = document.createElement('canvas');
    mini.width = pw;
    mini.height = ph;
    const mCtx = mini.getContext('2d');
    if (mCtx) {
      mCtx.drawImage(img, 0, 0, pw, ph);
      offCtx.imageSmoothingEnabled = false;
      offCtx.drawImage(mini, 0, 0, rw, rh);
      offCtx.imageSmoothingEnabled = true;
    } else {
      offCtx.drawImage(img, 0, 0, rw, rh);
    }
  } else {
    if (blurPx > 0) {
      offCtx.filter = `blur(${blurPx}px)`;
    }
    offCtx.drawImage(img, 0, 0, rw, rh);
    offCtx.filter = 'none';
  }

  if (!isColorGradeIdentity(clip.color) || !isEffectsIdentity(clip.effects)) {
    const imgData = offCtx.getImageData(0, 0, rw, rh);
    applyColorGradeToImageData(imgData.data, clip.color, clip.effects);
    offCtx.putImageData(imgData, 0, 0);
  }

  const glowAmt = clip.effects?.glow ?? 0;
  if (glowAmt > 0) {
    offCtx.save();
    offCtx.globalCompositeOperation = 'screen';
    offCtx.globalAlpha = Math.min(0.45, (glowAmt / 100) * 0.4);
    offCtx.filter = `blur(${Math.round(8 + glowAmt * 0.14)}px)`;
    offCtx.drawImage(off, 0, 0);
    offCtx.restore();
  }

  setGradedCacheEntry(key, off);
  return off;
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
  let slideOffsetX = 0;
  let transitionScaleBoost = 1;
  let whiteFlashAlpha = 0;

  if (clip.transitionIn && clip.transitionIn !== 'none' && relTime < transDur && transDur > 0.01) {
    const p = Math.max(0, Math.min(1, relTime / transDur));
    const ease = 1 - Math.pow(1 - p, 2);
    if (clip.transitionIn === 'cross-dissolve' || clip.transitionIn === 'dip-black') {
      fadeAlpha = Math.min(fadeAlpha, p);
    } else if (clip.transitionIn === 'fade-white') {
      whiteFlashAlpha = Math.max(whiteFlashAlpha, 1 - ease);
    } else if (clip.transitionIn === 'wipe-left') {
      wipeFraction = p;
      wipeDirection = 'left';
    } else if (clip.transitionIn === 'wipe-right') {
      wipeFraction = p;
      wipeDirection = 'right';
    } else if (clip.transitionIn === 'slide-left') {
      slideOffsetX = (1 - ease) * canvasWidth;
    } else if (clip.transitionIn === 'slide-right') {
      slideOffsetX = -(1 - ease) * canvasWidth;
    } else if (clip.transitionIn === 'zoom-in') {
      transitionScaleBoost = 0.72 + 0.28 * ease;
      fadeAlpha = Math.min(fadeAlpha, ease);
    }
  }

  if (clip.transitionOut && clip.transitionOut !== 'none' && timeFromEnd < transDur && transDur > 0.01) {
    const p = Math.max(0, Math.min(1, timeFromEnd / transDur));
    const ease = 1 - Math.pow(1 - p, 2);
    if (clip.transitionOut === 'cross-dissolve' || clip.transitionOut === 'dip-black') {
      fadeAlpha = Math.min(fadeAlpha, p);
    } else if (clip.transitionOut === 'fade-white') {
      whiteFlashAlpha = Math.max(whiteFlashAlpha, 1 - ease);
    } else if (clip.transitionOut === 'slide-left') {
      slideOffsetX = -(1 - ease) * canvasWidth;
    } else if (clip.transitionOut === 'slide-right') {
      slideOffsetX = (1 - ease) * canvasWidth;
    }
  }

  const finalAlpha = Math.max(0, Math.min(1, (clip.transform.opacity / 100) * fadeAlpha));
  if (finalAlpha <= 0.001) return;

  if (clip.kind === 'title') {
    drawTitleOverlay(ctx, clip, canvasWidth, canvasHeight, finalAlpha, relTime);
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
    ctx.fillText(`LOADING · ${asset.name}`, canvasWidth / 2, canvasHeight / 2);
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

  const rawProgress = clip.duration > 0 ? Math.max(0, Math.min(1, relTime / clip.duration)) : 0;
  const progress = clip.reversed ? 1 - rawProgress : rawProgress;

  // Apply Camera Motion Preset + Ken Burns Zoom
  let motionScale = 1 + (clip.transform.kenBurnsZoom / 100) * progress;
  let motionPanX = 0;
  let motionPanY = 0;
  let motionRotDeg = 0;
  const motion = clip.transform.motionPreset ?? 'none';
  if (motion === 'zoom-in') {
    motionScale *= 1 + 0.14 * progress;
  } else if (motion === 'zoom-out') {
    motionScale *= 1.14 - 0.14 * progress;
  } else if (motion === 'pan-left') {
    motionScale *= 1.12;
    motionPanX = (0.5 - progress) * drawW * 0.09;
  } else if (motion === 'pan-right') {
    motionScale *= 1.12;
    motionPanX = (progress - 0.5) * drawW * 0.09;
  } else if (motion === 'slide-up') {
    const enterEase = 1 - Math.pow(1 - Math.min(1, relTime / 0.7), 3);
    motionPanY = (1 - enterEase) * canvasHeight * 0.28;
  } else if (motion === 'tilt-drift') {
    motionScale *= 1.08 + 0.05 * progress;
    motionRotDeg = (progress - 0.5) * 4;
  } else if (motion === 'pulse') {
    motionScale *= 1 + 0.04 * Math.sin(relTime * Math.PI * 2.2);
  }

  const cTop = (clip.transform.cropTop / 100) * drawH;
  const cBottom = (clip.transform.cropBottom / 100) * drawH;
  const cLeft = (clip.transform.cropLeft / 100) * drawW;
  const cRight = (clip.transform.cropRight / 100) * drawW;

  const scaleXFactor = canvasWidth / 1280;
  const scaleYFactor = canvasHeight / 720;
  const minScaleFactor = Math.min(scaleXFactor, scaleYFactor);
  const totalScale = (clip.transform.scale / 100) * motionScale * transitionScaleBoost;
  const cornerRad = (clip.effects?.cornerRadius ?? 0) * minScaleFactor;
  const borderW = (clip.effects?.borderWidth ?? 0) * minScaleFactor;
  const borderColor = clip.effects?.borderColor ?? '#FFFFFF';
  const dropShadowPx = (clip.effects?.dropShadow ?? 0) * minScaleFactor;

  let sourceToDraw: CanvasImageSource = mediaSource;
  let videoNeedsScratchGrade = false;

  if (!skipColorGrade && asset.kind === 'image' && mediaSource instanceof HTMLImageElement) {
    const cachedGraded = getOrBuildGradedImageCanvas(mediaSource, asset.id, drawW, drawH, clip);
    if (cachedGraded) {
      sourceToDraw = cachedGraded;
    }
  } else if (!skipColorGrade && asset.kind === 'video') {
    if (!isColorGradeIdentity(clip.color) || !isEffectsIdentity(clip.effects)) {
      videoNeedsScratchGrade = true;
    }
  }

  const croppedW = Math.max(1, drawW - cLeft - cRight);
  const croppedH = Math.max(1, drawH - cTop - cBottom);
  const cropX = -drawW / 2 + cLeft;
  const cropY = -drawH / 2 + cTop;

  if (videoNeedsScratchGrade) {
    const sCtx = getScratchContext(canvasWidth, canvasHeight);
    if (!sCtx) return;
    sCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    sCtx.save();
    sCtx.translate(
      canvasWidth / 2 + clip.transform.x * scaleXFactor + motionPanX + slideOffsetX,
      canvasHeight / 2 + clip.transform.y * scaleYFactor + motionPanY
    );
    sCtx.rotate(((clip.transform.rotation + motionRotDeg) * Math.PI) / 180);
    sCtx.scale(
      totalScale * (clip.transform.flipH ? -1 : 1),
      totalScale * (clip.transform.flipV ? -1 : 1)
    );
    drawRoundedRectPath(sCtx, cropX, cropY, croppedW, croppedH, cornerRad);
    sCtx.clip();
    const blurPx = clip.effects?.blur ?? 0;
    if (blurPx > 0) sCtx.filter = `blur(${blurPx}px)`;
    sCtx.drawImage(mediaSource, -drawW / 2, -drawH / 2, drawW, drawH);
    sCtx.filter = 'none';
    sCtx.restore();

    const imgData = sCtx.getImageData(0, 0, canvasWidth, canvasHeight);
    applyColorGradeToImageData(imgData.data, clip.color, clip.effects);
    sCtx.putImageData(imgData, 0, 0);
    sourceToDraw = sCtx.canvas;

    ctx.save();
    ctx.globalAlpha = finalAlpha;
    ctx.globalCompositeOperation = clip.transform.blendMode;
    if (wipeFraction !== null) {
      const ww = Math.round(canvasWidth * wipeFraction);
      ctx.beginPath();
      if (wipeDirection === 'left') ctx.rect(0, 0, ww, canvasHeight);
      else ctx.rect(canvasWidth - ww, 0, ww, canvasHeight);
      ctx.clip();
    }
    ctx.drawImage(sourceToDraw, 0, 0);
    if (!skipColorGrade && (clip.color.vignette !== 0 || clip.color.grain > 0)) {
      drawVignetteAndGrain(ctx, canvasWidth, canvasHeight, clip.color.vignette, clip.color.grain, localTime);
    }
    if (whiteFlashAlpha > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${whiteFlashAlpha})`;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }
    ctx.restore();
    return;
  }

  // Fast GPU draw path (zero per-frame pixel loop!)
  ctx.save();
  ctx.globalAlpha = finalAlpha;
  ctx.globalCompositeOperation = clip.transform.blendMode;

  if (wipeFraction !== null) {
    const ww = Math.round(canvasWidth * wipeFraction);
    ctx.beginPath();
    if (wipeDirection === 'left') ctx.rect(0, 0, ww, canvasHeight);
    else ctx.rect(canvasWidth - ww, 0, ww, canvasHeight);
    ctx.clip();
  }

  ctx.save();
  ctx.translate(
    canvasWidth / 2 + clip.transform.x * scaleXFactor + motionPanX + slideOffsetX,
    canvasHeight / 2 + clip.transform.y * scaleYFactor + motionPanY
  );
  ctx.rotate(((clip.transform.rotation + motionRotDeg) * Math.PI) / 180);
  ctx.scale(
    totalScale * (clip.transform.flipH ? -1 : 1),
    totalScale * (clip.transform.flipV ? -1 : 1)
  );

  if (dropShadowPx > 0.5) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = dropShadowPx;
    ctx.shadowOffsetY = dropShadowPx * 0.25;
    drawRoundedRectPath(ctx, cropX, cropY, croppedW, croppedH, cornerRad);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  drawRoundedRectPath(ctx, cropX, cropY, croppedW, croppedH, cornerRad);
  ctx.clip();
  ctx.drawImage(sourceToDraw, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  if (borderW > 0.25) {
    drawRoundedRectPath(ctx, cropX, cropY, croppedW, croppedH, cornerRad);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderW;
    ctx.stroke();
  }
  ctx.restore();

  if (!skipColorGrade && (clip.color.vignette !== 0 || clip.color.grain > 0)) {
    drawVignetteAndGrain(ctx, canvasWidth, canvasHeight, clip.color.vignette, clip.color.grain, localTime);
  }
  if (whiteFlashAlpha > 0.01) {
    ctx.fillStyle = `rgba(255,255,255,${whiteFlashAlpha})`;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }
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

export function computeScopesFromCanvas(canvas: HTMLCanvasElement): ScopeData | null {
  const sCtx = getScopeContext();
  if (!sCtx) return null;
  sCtx.drawImage(canvas, 0, 0, 160, 90);
  const frameData = sCtx.getImageData(0, 0, 160, 90);
  return computeScopesFromImageData(frameData.data, 160, 90);
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
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const w = canvas.width;
  const h = canvas.height;
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  const { videoClips } = getActiveClipsAtTime(clips, tracks, currentTime);

  if (options.beforeAfterSplit !== null && options.beforeAfterSplit !== undefined) {
    const splitX = Math.max(0, Math.min(w, Math.round(w * options.beforeAfterSplit)));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, splitX, h);
    ctx.clip();
    for (const clip of videoClips) {
      renderClipToCanvas(ctx, clip, assetMap.get(clip.assetId), cache, w, h, currentTime - clip.startTime, true);
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, w - splitX, h);
    ctx.clip();
    for (const clip of videoClips) {
      renderClipToCanvas(ctx, clip, assetMap.get(clip.assetId), cache, w, h, currentTime - clip.startTime, false);
    }
    ctx.restore();

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
      renderClipToCanvas(ctx, clip, assetMap.get(clip.assetId), cache, w, h, currentTime - clip.startTime, false);
    }
  }

  // Cinema 2.39:1 Letterbox Matte Bars
  if (sequence.cinemaBars) {
    const barH = Math.round(h * 0.115);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, barH);
    ctx.fillRect(0, h - barH, w, barH);
  }

  let scopes: ScopeData | null = null;
  if (options.computeScopes) {
    scopes = computeScopesFromCanvas(canvas);
  }

  if (options.showSafeGuides || options.showGrid) {
    drawGuidesOverlay(ctx, w, h, Boolean(options.showSafeGuides), Boolean(options.showGrid));
  }

  return scopes;
}
