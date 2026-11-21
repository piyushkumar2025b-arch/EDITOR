import {
  ClipEffects,
  ClipTransform,
  ColorGrade,
  CurvePoint,
  LUTPresetId,
  ScopeData,
} from './types';

export const DEFAULT_TRANSFORM: ClipTransform = {
  x: 0,
  y: 0,
  scale: 100,
  rotation: 0,
  opacity: 100,
  blendMode: 'source-over',
  cropTop: 0,
  cropRight: 0,
  cropBottom: 0,
  cropLeft: 0,
  kenBurnsZoom: 0,
  motionPreset: 'none',
};

export const DEFAULT_EFFECTS: ClipEffects = {
  blur: 0,
  sepia: 0,
  vintageFade: 0,
  glow: 0,
  cornerRadius: 0,
};

export const DEFAULT_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0.5 },
  { x: 1, y: 1 },
];

export function createDefaultColorGrade(): ColorGrade {
  return {
    lut: 'none',
    lutIntensity: 100,
    temperature: 0,
    tint: 0,
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    saturation: 0,
    vibrance: 0,
    sharpness: 0,
    vignette: 0,
    grain: 0,
    lift: { x: 0, y: 0, luma: 0 },
    gamma: { x: 0, y: 0, luma: 0 },
    gain: { x: 0, y: 0, luma: 0 },
    curves: {
      master: DEFAULT_CURVE.map((p) => ({ ...p })),
      red: DEFAULT_CURVE.map((p) => ({ ...p })),
      green: DEFAULT_CURVE.map((p) => ({ ...p })),
      blue: DEFAULT_CURVE.map((p) => ({ ...p })),
    },
  };
}

export interface LUTDefinition {
  id: LUTPresetId;
  name: string;
  shortName: string;
  description: string;
  apply: (r: number, g: number, b: number) => [number, number, number];
}

// Precomputed 256-entry Kodak S-curve table for zero-lag pixel loops
const KODAK_SCURVE_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  KODAK_SCURVE_LUT[i] = v + 0.08 * Math.sin(Math.PI * (v * 2 - 1));
}

export const LUT_PRESETS: LUTDefinition[] = [
  {
    id: 'none',
    name: 'Natural (Original)',
    shortName: 'Original',
    description: 'Clean ungraded camera profile',
    apply: (r, g, b) => [r, g, b],
  },
  {
    id: 'kodak-2383',
    name: 'Cinema Warm (Kodak)',
    shortName: 'Cinema',
    description: 'Rich theatrical print contrast with warm highlights',
    apply: (r, g, b) => {
      const ri = KODAK_SCURVE_LUT[Math.min(255, Math.max(0, (r * 255 + 0.5) | 0))];
      const gi = KODAK_SCURVE_LUT[Math.min(255, Math.max(0, (g * 255 + 0.5) | 0))];
      const bi = KODAK_SCURVE_LUT[Math.min(255, Math.max(0, (b * 255 + 0.5) | 0))];
      return [ri * 1.04 + 0.015, gi * 0.99, bi * 0.94 + 0.02 * (1 - b)];
    },
  },
  {
    id: 'teal-orange',
    name: 'Teal & Orange',
    shortName: 'Teal/Org',
    description: 'Cool teal shadows with warm skin and sky highlights',
    apply: (r, g, b) => {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const shadowWeight = Math.max(0, 1 - luma * 1.8);
      const highWeight = Math.max(0, (luma - 0.35) * 1.4);
      const nr = r + highWeight * 0.1 - shadowWeight * 0.07;
      const ng = g + shadowWeight * 0.03 + highWeight * 0.02;
      const nb = b + shadowWeight * 0.12 - highWeight * 0.09;
      return [nr, ng, nb];
    },
  },
  {
    id: 'fuji-eterna',
    name: 'Soft Documentary Film',
    shortName: 'Soft Film',
    description: 'Soft shadow roll-off and calm natural greens',
    apply: (r, g, b) => {
      const nr = (r * 0.9 + 0.04) * 0.98;
      const ng = (g * 0.9 + 0.04) * 1.02;
      const nb = (b * 0.9 + 0.04) * 0.97;
      return [nr, ng, nb];
    },
  },
  {
    id: 'monochrome-noir',
    name: 'Black & White Noir',
    shortName: 'B&W Noir',
    description: 'High-contrast panchromatic black and white',
    apply: (r, g, b) => {
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const c = (y - 0.5) * 1.28 + 0.5;
      return [c, c, c];
    },
  },
  {
    id: 'bleach-bypass',
    name: 'Gritty Silver Look',
    shortName: 'Silver',
    description: 'High-contrast desaturated silver film style',
    apply: (r, g, b) => {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const c = (luma - 0.5) * 1.35 + 0.5;
      return [r * 0.52 + c * 0.48, g * 0.52 + c * 0.48, b * 0.52 + c * 0.48];
    },
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour Sunset',
    shortName: 'Sunset',
    description: 'Warm amber midtones and gentle sunlight glow',
    apply: (r, g, b) => [r * 1.08 + 0.02, g * 1.02 + 0.01, b * 0.89],
  },
];

export interface PhotoStylePreset {
  id: string;
  label: string;
  buildGrade: () => ColorGrade;
  effects?: Partial<ClipEffects>;
}

export const PHOTO_STYLE_PRESETS: PhotoStylePreset[] = [
  {
    id: 'natural',
    label: 'Natural',
    buildGrade: () => createDefaultColorGrade(),
    effects: { sepia: 0, vintageFade: 0, glow: 0 },
  },
  {
    id: 'portrait-glow',
    label: 'Portrait Glow',
    buildGrade: () => ({
      ...createDefaultColorGrade(),
      exposure: 0.15,
      highlights: -12,
      shadows: 18,
      temperature: 8,
      vibrance: 14,
      sharpness: 18,
    }),
    effects: { glow: 20, sepia: 0, vintageFade: 0 },
  },
  {
    id: 'crisp-hdr',
    label: 'Crisp HDR',
    buildGrade: () => ({
      ...createDefaultColorGrade(),
      contrast: 22,
      highlights: -26,
      shadows: 28,
      vibrance: 22,
      sharpness: 38,
    }),
    effects: { glow: 0, sepia: 0, vintageFade: 0 },
  },
  {
    id: 'film-street',
    label: 'Cinema Street',
    buildGrade: () => ({
      ...createDefaultColorGrade(),
      lut: 'kodak-2383',
      lutIntensity: 85,
      contrast: 10,
      vignette: -22,
      grain: 18,
    }),
    effects: { glow: 0, sepia: 0, vintageFade: 0 },
  },
  {
    id: 'bw-contrast',
    label: 'B&W Classic',
    buildGrade: () => ({
      ...createDefaultColorGrade(),
      lut: 'monochrome-noir',
      lutIntensity: 100,
      contrast: 16,
      grain: 22,
    }),
    effects: { glow: 0, sepia: 0, vintageFade: 0 },
  },
  {
    id: 'warm-vintage',
    label: 'Warm Vintage',
    buildGrade: () => ({
      ...createDefaultColorGrade(),
      lut: 'golden-hour',
      lutIntensity: 75,
      temperature: 14,
      vignette: -18,
      grain: 15,
    }),
    effects: { sepia: 32, vintageFade: 28, glow: 10 },
  },
];

export function buildToneCurveLUT(points: CurvePoint[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (sorted.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    if (t <= sorted[0].x) {
      lut[i] = Math.round(Math.max(0, Math.min(1, sorted[0].y)) * 255);
      continue;
    }
    if (t >= sorted[sorted.length - 1].x) {
      lut[i] = Math.round(Math.max(0, Math.min(1, sorted[sorted.length - 1].y)) * 255);
      continue;
    }

    let seg = 0;
    for (let j = 0; j < sorted.length - 1; j++) {
      if (t >= sorted[j].x && t <= sorted[j + 1].x) {
        seg = j;
        break;
      }
    }
    const p1 = sorted[seg];
    const p2 = sorted[seg + 1];
    const p0 =
      seg > 0
        ? sorted[seg - 1]
        : { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
    const p3 =
      seg + 2 < sorted.length
        ? sorted[seg + 2]
        : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };

    const span = Math.max(0.0001, p2.x - p1.x);
    const u = (t - p1.x) / span;
    const u2 = u * u;
    const u3 = u2 * u;

    const y =
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * u +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3);

    lut[i] = Math.round(Math.max(0, Math.min(1, y)) * 255);
  }
  return lut;
}

export function isEffectsIdentity(effects?: ClipEffects): boolean {
  if (!effects) return true;
  return (
    effects.blur === 0 &&
    effects.sepia === 0 &&
    effects.vintageFade === 0 &&
    effects.glow === 0 &&
    effects.cornerRadius === 0
  );
}

export function isColorGradeIdentity(grade: ColorGrade): boolean {
  if (grade.lut !== 'none' && grade.lutIntensity > 0) return false;
  if (
    grade.temperature !== 0 ||
    grade.tint !== 0 ||
    grade.exposure !== 0 ||
    grade.contrast !== 0 ||
    grade.highlights !== 0 ||
    grade.shadows !== 0 ||
    grade.whites !== 0 ||
    grade.blacks !== 0 ||
    grade.saturation !== 0 ||
    grade.vibrance !== 0 ||
    grade.sharpness !== 0 ||
    grade.lift.x !== 0 ||
    grade.lift.y !== 0 ||
    grade.lift.luma !== 0 ||
    grade.gamma.x !== 0 ||
    grade.gamma.y !== 0 ||
    grade.gamma.luma !== 0 ||
    grade.gain.x !== 0 ||
    grade.gain.y !== 0 ||
    grade.gain.luma !== 0
  ) {
    return false;
  }
  const isDefaultCurve = (pts: CurvePoint[]) =>
    pts.length === 3 &&
    pts[0].x === 0 &&
    pts[0].y === 0 &&
    pts[1].x === 0.5 &&
    pts[1].y === 0.5 &&
    pts[2].x === 1 &&
    pts[2].y === 1;

  return (
    isDefaultCurve(grade.curves.master) &&
    isDefaultCurve(grade.curves.red) &&
    isDefaultCurve(grade.curves.green) &&
    isDefaultCurve(grade.curves.blue)
  );
}

export function hashGradeAndEffects(grade: ColorGrade, effects?: ClipEffects): string {
  return JSON.stringify({
    g: grade,
    e: effects ?? DEFAULT_EFFECTS,
  });
}

function buildGammaTable(gammaVal: number): Float32Array {
  const table = new Float32Array(384); // covers 0..1.5 linear values quantized
  const invG = 1 / Math.max(0.25, gammaVal);
  for (let i = 0; i < 384; i++) {
    const v = (i / 383) * 1.5;
    table[i] = Math.pow(v, invG);
  }
  return table;
}

export function applyColorGradeToImageData(
  data: Uint8ClampedArray,
  grade: ColorGrade,
  effects?: ClipEffects
): void {
  const gradeId = isColorGradeIdentity(grade);
  const sepiaAmt = effects ? effects.sepia / 100 : 0;
  const fadeAmt = effects ? effects.vintageFade / 100 : 0;
  if (gradeId && sepiaAmt === 0 && fadeAmt === 0) return;

  const lutDef = LUT_PRESETS.find((l) => l.id === grade.lut) ?? LUT_PRESETS[0];
  const lutMix = grade.lut === 'none' ? 0 : grade.lutIntensity / 100;

  const masterCurve = buildToneCurveLUT(grade.curves.master);
  const redCurve = buildToneCurveLUT(grade.curves.red);
  const greenCurve = buildToneCurveLUT(grade.curves.green);
  const blueCurve = buildToneCurveLUT(grade.curves.blue);

  const expMult = Math.pow(2, grade.exposure);
  const contrastFactor = 1 + grade.contrast / 100 + (grade.sharpness || 0) / 420;
  const tempOffset = grade.temperature / 280;
  const tintOffset = grade.tint / 320;
  const highlightsAdj = grade.highlights / 220;
  const shadowsAdj = grade.shadows / 220;
  const whitesAdj = grade.whites / 300;
  const blacksAdj = grade.blacks / 300;
  const satMult = 1 + grade.saturation / 100;
  const vibAmt = grade.vibrance / 100;

  const liftR = grade.lift.luma * 0.25 + grade.lift.x * 0.22;
  const liftG = grade.lift.luma * 0.25 - grade.lift.x * 0.1 - grade.lift.y * 0.14;
  const liftB = grade.lift.luma * 0.25 + grade.lift.y * 0.22;

  const gammaR = 1 + grade.gamma.luma * 0.35 + grade.gamma.x * 0.25;
  const gammaG = 1 + grade.gamma.luma * 0.35 - grade.gamma.x * 0.12 - grade.gamma.y * 0.15;
  const gammaB = 1 + grade.gamma.luma * 0.35 + grade.gamma.y * 0.25;

  const gammaTableR = gammaR !== 1 ? buildGammaTable(gammaR) : null;
  const gammaTableG = gammaG !== 1 ? buildGammaTable(gammaG) : null;
  const gammaTableB = gammaB !== 1 ? buildGammaTable(gammaB) : null;

  const gainR = 1 + grade.gain.luma * 0.4 + grade.gain.x * 0.3;
  const gainG = 1 + grade.gain.luma * 0.4 - grade.gain.x * 0.15 - grade.gain.y * 0.18;
  const gainB = 1 + grade.gain.luma * 0.4 + grade.gain.y * 0.3;

  const hasCurves =
    grade.curves.master.length !== 3 ||
    grade.curves.red.length !== 3 ||
    grade.curves.green.length !== 3 ||
    grade.curves.blue.length !== 3 ||
    grade.curves.master[1].y !== 0.5 ||
    grade.curves.master[0].y !== 0 ||
    grade.curves.master[2].y !== 1 ||
    grade.curves.red[1].y !== 0.5 ||
    grade.curves.green[1].y !== 0.5 ||
    grade.curves.blue[1].y !== 0.5;

  const hasToneMask = shadowsAdj !== 0 || highlightsAdj !== 0;
  const hasSaturation = satMult !== 1 || vibAmt !== 0;
  const hasGainOrLift =
    gainR !== 1 || gainG !== 1 || gainB !== 1 || liftR !== 0 || liftG !== 0 || liftB !== 0;
  const hasWB = tempOffset !== 0 || tintOffset !== 0;
  const hasBlackWhite = blacksAdj !== 0 || whitesAdj !== 0;

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    if (data[i + 3] === 0) continue;

    let r = (data[i] / 255) * expMult;
    let g = (data[i + 1] / 255) * expMult;
    let b = (data[i + 2] / 255) * expMult;

    if (hasWB) {
      r += tempOffset + tintOffset * 0.5;
      g -= tintOffset;
      b -= tempOffset - tintOffset * 0.5;
    }

    if (hasGainOrLift) {
      r = Math.max(0, r * gainR + liftR * (1 - Math.min(1, r)));
      g = Math.max(0, g * gainG + liftG * (1 - Math.min(1, g)));
      b = Math.max(0, b * gainB + liftB * (1 - Math.min(1, b)));
    }

    if (gammaTableR) {
      r = gammaTableR[Math.min(383, Math.max(0, ((r / 1.5) * 383) | 0))];
    }
    if (gammaTableG) {
      g = gammaTableG[Math.min(383, Math.max(0, ((g / 1.5) * 383) | 0))];
    }
    if (gammaTableB) {
      b = gammaTableB[Math.min(383, Math.max(0, ((b / 1.5) * 383) | 0))];
    }

    if (hasBlackWhite) {
      r = r + blacksAdj * (1 - r) + whitesAdj * r;
      g = g + blacksAdj * (1 - g) + whitesAdj * g;
      b = b + blacksAdj * (1 - b) + whitesAdj * b;
    }

    if (hasToneMask) {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const shadowMask = Math.max(0, 1 - luma * 2);
      const highMask = Math.max(0, (luma - 0.5) * 2);
      const toneShift = shadowsAdj * shadowMask + highlightsAdj * highMask;
      r += toneShift;
      g += toneShift;
      b += toneShift;
    }

    if (contrastFactor !== 1) {
      r = (r - 0.5) * contrastFactor + 0.5;
      g = (g - 0.5) * contrastFactor + 0.5;
      b = (b - 0.5) * contrastFactor + 0.5;
    }

    if (hasCurves) {
      let ri = Math.max(0, Math.min(255, (r * 255 + 0.5) | 0));
      let gi = Math.max(0, Math.min(255, (g * 255 + 0.5) | 0));
      let bi = Math.max(0, Math.min(255, (b * 255 + 0.5) | 0));
      ri = masterCurve[redCurve[ri]];
      gi = masterCurve[greenCurve[gi]];
      bi = masterCurve[blueCurve[bi]];
      r = ri / 255;
      g = gi / 255;
      b = bi / 255;
    }

    if (hasSaturation) {
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
      const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
      const sat = maxC - minC;
      const vibFactor = 1 + vibAmt * (1 - sat);
      const totalSat = Math.max(0, satMult * vibFactor);
      r = y + (r - y) * totalSat;
      g = y + (g - y) * totalSat;
      b = y + (b - y) * totalSat;
    }

    if (lutMix > 0) {
      const cr = r < 0 ? 0 : r > 1 ? 1 : r;
      const cg = g < 0 ? 0 : g > 1 ? 1 : g;
      const cb = b < 0 ? 0 : b > 1 ? 1 : b;
      const [lr, lg, lb] = lutDef.apply(cr, cg, cb);
      const inv = 1 - lutMix;
      r = r * inv + lr * lutMix;
      g = g * inv + lg * lutMix;
      b = b * inv + lb * lutMix;
    }

    // Visual filters: Sepia & Vintage Fade
    if (sepiaAmt > 0) {
      const sr = r * 0.393 + g * 0.769 + b * 0.189;
      const sg = r * 0.349 + g * 0.686 + b * 0.168;
      const sb = r * 0.272 + g * 0.534 + b * 0.131;
      const invS = 1 - sepiaAmt;
      r = r * invS + sr * sepiaAmt;
      g = g * invS + sg * sepiaAmt;
      b = b * invS + sb * sepiaAmt;
    }

    if (fadeAmt > 0) {
      const lift = fadeAmt * 0.14;
      const compress = 1 - fadeAmt * 0.18;
      r = r * compress + lift;
      g = g * compress + lift;
      b = b * compress + lift * 1.08;
    }

    const rr = r * 255 + 0.5;
    const gg = g * 255 + 0.5;
    const bb = b * 255 + 0.5;
    data[i] = rr < 0 ? 0 : rr > 255 ? 255 : rr | 0;
    data[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg | 0;
    data[i + 2] = bb < 0 ? 0 : bb > 255 ? 255 : bb | 0;
  }
}

export function computeScopesFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number
): ScopeData {
  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);
  const histLuma = new Uint32Array(256);

  const waveCols = 128;
  const waveRows = 64;
  const waveform = new Uint16Array(waveCols * waveRows);

  const paradeCols = 64;
  const paradeR = new Uint16Array(paradeCols * waveRows);
  const paradeG = new Uint16Array(paradeCols * waveRows);
  const paradeB = new Uint16Array(paradeCols * waveRows);

  const stepX = Math.max(1, Math.floor(width / 160));
  const stepY = Math.max(1, Math.floor(height / 90));

  for (let y = 0; y < height; y += stepY) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += stepX) {
      const idx = rowOffset + x * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const luma = Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b));

      histR[r]++;
      histG[g]++;
      histB[b]++;
      histLuma[luma]++;

      const wx = Math.min(waveCols - 1, Math.floor((x / width) * waveCols));
      const wy = waveRows - 1 - Math.min(waveRows - 1, Math.floor((luma / 255) * (waveRows - 1)));
      waveform[wy * waveCols + wx]++;

      const px = Math.min(paradeCols - 1, Math.floor((x / width) * paradeCols));
      const ry = waveRows - 1 - Math.min(waveRows - 1, Math.floor((r / 255) * (waveRows - 1)));
      const gy = waveRows - 1 - Math.min(waveRows - 1, Math.floor((g / 255) * (waveRows - 1)));
      const by = waveRows - 1 - Math.min(waveRows - 1, Math.floor((b / 255) * (waveRows - 1)));
      paradeR[ry * paradeCols + px]++;
      paradeG[gy * paradeCols + px]++;
      paradeB[by * paradeCols + px]++;
    }
  }

  let maxHist = 1;
  for (let i = 1; i < 255; i++) {
    if (histLuma[i] > maxHist) maxHist = histLuma[i];
    if (histR[i] > maxHist) maxHist = histR[i];
    if (histG[i] > maxHist) maxHist = histG[i];
    if (histB[i] > maxHist) maxHist = histB[i];
  }

  return {
    histR,
    histG,
    histB,
    histLuma,
    maxHist,
    waveform,
    paradeR,
    paradeG,
    paradeB,
  };
}

export function computeAutoBalanceGrade(
  scopes: ScopeData | null,
  current: ColorGrade
): ColorGrade {
  if (!scopes) return current;
  let total = 0;
  for (let i = 0; i < 256; i++) total += scopes.histLuma[i];
  if (total === 0) return current;

  let accum = 0;
  let p5 = 0;
  let p50 = 128;
  let p95 = 255;
  for (let i = 0; i < 256; i++) {
    accum += scopes.histLuma[i];
    const frac = accum / total;
    if (frac <= 0.05) p5 = i;
    if (frac <= 0.5) p50 = i;
    if (frac <= 0.95) p95 = i;
  }

  const evShift = Number(Math.max(-1.2, Math.min(1.2, (122 - p50) / 110)).toFixed(2));
  const spread = Math.max(40, p95 - p5);
  const contrastBoost = Math.round(Math.max(-25, Math.min(35, ((210 - spread) / 210) * 38)));
  const shadowLift = p5 < 16 ? Math.round(Math.min(28, (16 - p5) * 1.4)) : 0;
  const highlightPull = p95 > 240 ? -Math.round(Math.min(30, (p95 - 240) * 1.8)) : 0;

  return {
    ...current,
    exposure: evShift,
    contrast: contrastBoost,
    shadows: shadowLift,
    highlights: highlightPull,
    vibrance: Math.max(current.vibrance, 12),
  };
}
