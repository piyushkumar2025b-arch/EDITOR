import {
  applyColorGradeToImageData,
  computeScopesFromImageData,
  hashGradeAndEffects,
  isColorGradeIdentity,
  isEffectsIdentity,
} from './colorEngine';
import { getActiveClipsAtTime } from './timelineOps';
import {
  MaskShape,
  MediaAsset,
  MirrorEffectMode,
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

export function drawMaskShapePath(
  ctx: CanvasRenderingContext2D,
  maskShape: MaskShape | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  cornerRadius: number
) {
  const shape = maskShape ?? 'rect';
  if (shape === 'circle') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rad = Math.max(1, Math.min(w, h) / 2);
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }
  if (shape === 'pill') {
    drawRoundedRectPath(ctx, x, y, w, h, Math.min(w, h) / 2);
    return;
  }
  if (shape === 'diamond') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(x + w, cy);
    ctx.lineTo(cx, y + h);
    ctx.lineTo(x, cy);
    ctx.closePath();
    return;
  }
  drawRoundedRectPath(ctx, x, y, w, h, cornerRadius);
}

export function applyMirrorModeToCanvas(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  mirrorMode: MirrorEffectMode | undefined
) {
  if (!mirrorMode || mirrorMode === 'none') return;
  const w = source.width;
  const h = source.height;
  const copy = document.createElement('canvas');
  copy.width = w;
  copy.height = h;
  const cCtx = copy.getContext('2d');
  if (!cCtx) return;
  cCtx.drawImage(source, 0, 0);

  const halfW = Math.ceil(w / 2);
  const halfH = Math.ceil(h / 2);

  if (mirrorMode === 'mirror-h') {
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(copy, 0, 0, halfW, h, 0, 0, halfW, h);
    ctx.restore();
  } else if (mirrorMode === 'mirror-v') {
    ctx.save();
    ctx.translate(0, h);
    ctx.scale(1, -1);
    ctx.drawImage(copy, 0, 0, w, halfH, 0, 0, w, halfH);
    ctx.restore();
  } else if (mirrorMode === 'kaleidoscope') {
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(copy, 0, 0, halfW, halfH, 0, 0, halfW, halfH);
    ctx.restore();

    ctx.save();
    ctx.translate(0, h);
    ctx.scale(1, -1);
    ctx.drawImage(copy, 0, 0, halfW, halfH, 0, 0, halfW, halfH);
    ctx.restore();

    ctx.save();
    ctx.translate(w, h);
    ctx.scale(-1, -1);
    ctx.drawImage(copy, 0, 0, halfW, halfH, 0, 0, halfW, halfH);
    ctx.restore();
  }
}

export function drawCreativeEffectsOverlays(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  effects: TimelineClip['effects']
) {
  if (!effects) return;

  // Sunset Light Leak (warm amber + magenta flare from corner)
  const leak = effects.lightLeak ?? 0;
  if (leak > 0) {
    const strength = Math.min(0.85, (leak / 100) * 0.78);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g1 = ctx.createRadialGradient(w * 0.1, h * 0.15, 0, w * 0.12, h * 0.18, Math.max(w, h) * 0.7);
    g1.addColorStop(0, `rgba(255, 165, 64, ${strength})`);
    g1.addColorStop(0.4, `rgba(244, 63, 94, ${strength * 0.55})`);
    g1.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, w, h);

    const g2 = ctx.createRadialGradient(w * 0.92, h * 0.85, 0, w * 0.9, h * 0.85, Math.max(w, h) * 0.45);
    g2.addColorStop(0, `rgba(251, 191, 36, ${strength * 0.5})`);
    g2.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Retro CRT / VHS Scanlines
  const scan = effects.scanlines ?? 0;
  if (scan > 0) {
    const lineAlpha = Math.min(0.65, (scan / 100) * 0.58);
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${lineAlpha})`;
    const step = Math.max(3, Math.round(h / 140));
    for (let y = 0; y < h; y += step) {
      ctx.fillRect(0, y, w, Math.max(1, Math.floor(step * 0.42)));
    }
    ctx.restore();
  }

  // Tilt-Shift Miniature Soft Focus (top & bottom soft gradient veil)
  const tilt = effects.tiltShift ?? 0;
  if (tilt > 0) {
    const bandAlpha = Math.min(0.75, (tilt / 100) * 0.65);
    ctx.save();
    const topGrad = ctx.createLinearGradient(0, 0, 0, h * 0.34);
    topGrad.addColorStop(0, `rgba(12, 14, 18, ${bandAlpha})`);
    topGrad.addColorStop(1, 'rgba(12, 14, 18, 0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, h * 0.34);

    const botGrad = ctx.createLinearGradient(0, h * 0.66, 0, h);
    botGrad.addColorStop(0, 'rgba(12, 14, 18, 0)');
    botGrad.addColorStop(1, `rgba(12, 14, 18, ${bandAlpha})`);
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, h * 0.66, w, h * 0.34);
    ctx.restore();
  }
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

  applyMirrorModeToCanvas(offCtx, off, clip.effects?.mirrorMode);

  if (!isColorGradeIdentity(clip.color) || !isEffectsIdentity(clip.effects)) {
    const imgData = offCtx.getImageData(0, 0, rw, rh);
    applyColorGradeToImageData(imgData.data, clip.color, clip.effects, rw);
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

  drawCreativeEffectsOverlays(offCtx, rw, rh, clip.effects);

  setGradedCacheEntry(key, off);
  return off;
}

type ClipMaskMode =
  | { kind: 'wipe'; dir: 'left' | 'right' | 'up' | 'down'; fraction: number }
  | { kind: 'iris'; fraction: number }
  | { kind: 'split-open'; fraction: number }
  | null;

function applyTransitionClipMask(
  ctx: CanvasRenderingContext2D,
  mask: ClipMaskMode,
  w: number,
  h: number
) {
  if (!mask) return;
  if (mask.kind === 'wipe') {
    const f = Math.max(0, Math.min(1, mask.fraction));
    ctx.beginPath();
    if (mask.dir === 'left') ctx.rect(0, 0, Math.round(w * f), h);
    else if (mask.dir === 'right') ctx.rect(Math.round(w * (1 - f)), 0, Math.round(w * f), h);
    else if (mask.dir === 'up') ctx.rect(0, 0, w, Math.round(h * f));
    else ctx.rect(0, Math.round(h * (1 - f)), w, Math.round(h * f));
    ctx.clip();
  } else if (mask.kind === 'iris') {
    const f = Math.max(0.01, Math.min(1, mask.fraction));
    const maxRad = Math.hypot(w / 2, h / 2) * 1.05;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, maxRad * f, 0, Math.PI * 2);
    ctx.clip();
  } else if (mask.kind === 'split-open') {
    const f = Math.max(0.01, Math.min(1, mask.fraction));
    const openW = Math.round(w * f);
    ctx.beginPath();
    ctx.rect((w - openW) / 2, 0, openW, h);
    ctx.clip();
  }
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

  let transMask: ClipMaskMode = null;
  let slideOffsetX = 0;
  let slideOffsetY = 0;
  let transitionScaleBoost = 1;
  let transitionRotDeg = 0;
  let whiteFlashAlpha = 0;

  if (clip.transitionIn && clip.transitionIn !== 'none' && relTime < transDur && transDur > 0.01) {
    const p = Math.max(0, Math.min(1, relTime / transDur));
    const ease = 1 - Math.pow(1 - p, 2);
    const tIn = clip.transitionIn;
    if (tIn === 'cross-dissolve' || tIn === 'dip-black') {
      fadeAlpha = Math.min(fadeAlpha, p);
    } else if (tIn === 'fade-white') {
      whiteFlashAlpha = Math.max(whiteFlashAlpha, 1 - ease);
    } else if (tIn === 'wipe-left') {
      transMask = { kind: 'wipe', dir: 'left', fraction: ease };
    } else if (tIn === 'wipe-right') {
      transMask = { kind: 'wipe', dir: 'right', fraction: ease };
    } else if (tIn === 'wipe-up') {
      transMask = { kind: 'wipe', dir: 'up', fraction: ease };
    } else if (tIn === 'wipe-down') {
      transMask = { kind: 'wipe', dir: 'down', fraction: ease };
    } else if (tIn === 'slide-left') {
      slideOffsetX = (1 - ease) * canvasWidth;
    } else if (tIn === 'slide-right') {
      slideOffsetX = -(1 - ease) * canvasWidth;
    } else if (tIn === 'slide-up') {
      slideOffsetY = (1 - ease) * canvasHeight;
    } else if (tIn === 'slide-down') {
      slideOffsetY = -(1 - ease) * canvasHeight;
    } else if (tIn === 'zoom-in') {
      transitionScaleBoost = 0.7 + 0.3 * ease;
      fadeAlpha = Math.min(fadeAlpha, ease);
    } else if (tIn === 'zoom-out') {
      transitionScaleBoost = 1.45 - 0.45 * ease;
      fadeAlpha = Math.min(fadeAlpha, ease);
    } else if (tIn === 'spin-in') {
      transitionScaleBoost = 0.3 + 0.7 * ease;
      transitionRotDeg = (1 - ease) * 180;
      fadeAlpha = Math.min(fadeAlpha, ease);
    } else if (tIn === 'iris-circle') {
      transMask = { kind: 'iris', fraction: ease };
    } else if (tIn === 'split-open') {
      transMask = { kind: 'split-open', fraction: ease };
    } else if (tIn === 'flash-blur') {
      transitionScaleBoost = 1.18 - 0.18 * ease;
      whiteFlashAlpha = Math.max(whiteFlashAlpha, (1 - ease) * 0.85);
    }
  }

  if (clip.transitionOut && clip.transitionOut !== 'none' && timeFromEnd < transDur && transDur > 0.01) {
    const p = Math.max(0, Math.min(1, timeFromEnd / transDur));
    const ease = 1 - Math.pow(1 - p, 2);
    const tOut = clip.transitionOut;
    if (tOut === 'cross-dissolve' || tOut === 'dip-black') {
      fadeAlpha = Math.min(fadeAlpha, p);
    } else if (tOut === 'fade-white') {
      whiteFlashAlpha = Math.max(whiteFlashAlpha, 1 - ease);
    } else if (tOut === 'wipe-left' || tOut === 'wipe-right' || tOut === 'wipe-up' || tOut === 'wipe-down') {
      transMask = { kind: 'wipe', dir: tOut.replace('wipe-', '') as 'left' | 'right' | 'up' | 'down', fraction: ease };
    } else if (tOut === 'slide-left') {
      slideOffsetX = -(1 - ease) * canvasWidth;
    } else if (tOut === 'slide-right') {
      slideOffsetX = (1 - ease) * canvasWidth;
    } else if (tOut === 'slide-up') {
      slideOffsetY = -(1 - ease) * canvasHeight;
    } else if (tOut === 'slide-down') {
      slideOffsetY = (1 - ease) * canvasHeight;
    } else if (tOut === 'zoom-in') {
      transitionScaleBoost = 0.7 + 0.3 * ease;
      fadeAlpha = Math.min(fadeAlpha, ease);
    } else if (tOut === 'zoom-out') {
      transitionScaleBoost = 1.45 - 0.45 * ease;
      fadeAlpha = Math.min(fadeAlpha, ease);
    } else if (tOut === 'spin-in') {
      transitionScaleBoost = 0.3 + 0.7 * ease;
      transitionRotDeg = -(1 - ease) * 180;
      fadeAlpha = Math.min(fadeAlpha, ease);
    } else if (tOut === 'iris-circle') {
      transMask = { kind: 'iris', fraction: ease };
    } else if (tOut === 'split-open') {
      transMask = { kind: 'split-open', fraction: ease };
    } else if (tOut === 'flash-blur') {
      whiteFlashAlpha = Math.max(whiteFlashAlpha, (1 - ease) * 0.85);
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
  const maskShape = clip.effects?.maskShape;

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
      canvasHeight / 2 + clip.transform.y * scaleYFactor + motionPanY + slideOffsetY
    );
    sCtx.rotate(((clip.transform.rotation + motionRotDeg + transitionRotDeg) * Math.PI) / 180);
    sCtx.scale(
      totalScale * (clip.transform.flipH ? -1 : 1),
      totalScale * (clip.transform.flipV ? -1 : 1)
    );
    drawMaskShapePath(sCtx, maskShape, cropX, cropY, croppedW, croppedH, cornerRad);
    sCtx.clip();
    const blurPx = clip.effects?.blur ?? 0;
    if (blurPx > 0) sCtx.filter = `blur(${blurPx}px)`;
    sCtx.drawImage(mediaSource, -drawW / 2, -drawH / 2, drawW, drawH);
    sCtx.filter = 'none';
    sCtx.restore();

    applyMirrorModeToCanvas(sCtx, sCtx.canvas, clip.effects?.mirrorMode);

    const imgData = sCtx.getImageData(0, 0, canvasWidth, canvasHeight);
    applyColorGradeToImageData(imgData.data, clip.color, clip.effects, canvasWidth);
    sCtx.putImageData(imgData, 0, 0);
    drawCreativeEffectsOverlays(sCtx, canvasWidth, canvasHeight, clip.effects);
    sourceToDraw = sCtx.canvas;

    ctx.save();
    ctx.globalAlpha = finalAlpha;
    ctx.globalCompositeOperation = clip.transform.blendMode;
    applyTransitionClipMask(ctx, transMask, canvasWidth, canvasHeight);
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
  applyTransitionClipMask(ctx, transMask, canvasWidth, canvasHeight);

  ctx.save();
  ctx.translate(
    canvasWidth / 2 + clip.transform.x * scaleXFactor + motionPanX + slideOffsetX,
    canvasHeight / 2 + clip.transform.y * scaleYFactor + motionPanY + slideOffsetY
  );
  ctx.rotate(((clip.transform.rotation + motionRotDeg + transitionRotDeg) * Math.PI) / 180);
  ctx.scale(
    totalScale * (clip.transform.flipH ? -1 : 1),
    totalScale * (clip.transform.flipV ? -1 : 1)
  );

  if (dropShadowPx > 0.5) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = dropShadowPx;
    ctx.shadowOffsetY = dropShadowPx * 0.25;
    drawMaskShapePath(ctx, maskShape, cropX, cropY, croppedW, croppedH, cornerRad);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  drawMaskShapePath(ctx, maskShape, cropX, cropY, croppedW, croppedH, cornerRad);
  ctx.clip();
  ctx.drawImage(sourceToDraw, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  if (borderW > 0.25) {
    drawMaskShapePath(ctx, maskShape, cropX, cropY, croppedW, croppedH, cornerRad);
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
