import {
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
  description: string;
  apply: (r: number, g: number, b: number) => [number, number, number];
}

export const LUT_PRESETS: LUTDefinition[] = [
  {
    id: 'none',
    name: 'Rec.709 Neutral',
    description: 'Clean linear camera color profile',
    apply: (r, g, b) => [r, g, b],
  },
  {
    id: 'kodak-2383',
    name: 'Kodak 2383 Print',
    description: 'Rich theatrical print contrast with warm highlights',
    apply: (r, g, b) => {
      const sCurve = (v: number) => v + 0.08 * Math.sin(Math.PI * (v * 2 - 1));
      const nr = sCurve(r) * 1.04 + 0.015;
      const ng = sCurve(g) * 0.99;
      const nb = sCurve(b) * 0.94 + 0.02 * (1 - b);
      return [nr, ng, nb];
    },
  },
  {
    id: 'teal-orange',
    name: 'Blockbuster Teal & Amber',
    description: 'Split-toned cinema shadows with preserved skin warmth',
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
    name: 'Fuji Eterna 250D',
    description: 'Soft shadow roll-off and muted documentary greens',
    apply: (r, g, b) => {
      const lifted = (v: number) => v * 0.9 + 0.04;
      const nr = lifted(r) * 0.98;
      const ng = lifted(g) * 1.02;
      const nb = lifted(b) * 0.97;
      return [nr, ng, nb];
    },
  },
  {
    id: 'monochrome-noir',
    name: 'Silver Halide Noir',
    description: 'High-contrast panchromatic black and white',
    apply: (r, g, b) => {
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const c = (y - 0.5) * 1.28 + 0.5;
      return [c, c, c];
    },
  },
  {
    id: 'bleach-bypass',
    name: 'Silver Retention',
    description: 'Gritty desaturated metallic highlights and crushed blacks',
    apply: (r, g, b) => {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const c = (luma - 0.5) * 1.35 + 0.5;
      const nr = r * 0.52 + c * 0.48;
      const ng = g * 0.52 + c * 0.48;
      const nb = b * 0.52 + c * 0.48;
      return [nr, ng, nb];
    },
  },
  {
    id: 'golden-hour',
    name: 'Warm Tungsten Emulsion',
    description: 'Amber midtones and gentle highlight halation',
    apply: (r, g, b) => [r * 1.08 + 0.02, g * 1.02 + 0.01, b * 0.89],
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

    // Find segment
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

    // Catmull-Rom smooth spline interpolation
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

export function applyColorGradeToImageData(
  data: Uint8ClampedArray,
  grade: ColorGrade
): void {
  if (isColorGradeIdentity(grade)) return;

  const lutDef = LUT_PRESETS.find((l) => l.id === grade.lut) ?? LUT_PRESETS[0];
  const lutMix = grade.lut === 'none' ? 0 : grade.lutIntensity / 100;

  const masterCurve = buildToneCurveLUT(grade.curves.master);
  const redCurve = buildToneCurveLUT(grade.curves.red);
  const greenCurve = buildToneCurveLUT(grade.curves.green);
  const blueCurve = buildToneCurveLUT(grade.curves.blue);

  const expMult = Math.pow(2, grade.exposure);
  const contrastFactor = 1 + grade.contrast / 100;
  const tempOffset = grade.temperature / 280; // warm adds R, reduces B
  const tintOffset = grade.tint / 320; // positive adds magenta (R+B), negative adds green
  const highlightsAdj = grade.highlights / 220;
  const shadowsAdj = grade.shadows / 220;
  const whitesAdj = grade.whites / 300;
  const blacksAdj = grade.blacks / 300;
  const satMult = 1 + grade.saturation / 100;
  const vibAmt = grade.vibrance / 100;

  // Lift / Gamma / Gain wheel shifts
  const liftR = grade.lift.luma * 0.25 + grade.lift.x * 0.22;
  const liftG = grade.lift.luma * 0.25 - grade.lift.x * 0.1 - grade.lift.y * 0.14;
  const liftB = grade.lift.luma * 0.25 + grade.lift.y * 0.22;

  const gammaR = 1 + grade.gamma.luma * 0.35 + grade.gamma.x * 0.25;
  const gammaG = 1 + grade.gamma.luma * 0.35 - grade.gamma.x * 0.12 - grade.gamma.y * 0.15;
  const gammaB = 1 + grade.gamma.luma * 0.35 + grade.gamma.y * 0.25;

  const gainR = 1 + grade.gain.luma * 0.4 + grade.gain.x * 0.3;
  const gainG = 1 + grade.gain.luma * 0.4 - grade.gain.x * 0.15 - grade.gain.y * 0.18;
  const gainB = 1 + grade.gain.luma * 0.4 + grade.gain.y * 0.3;

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    if (data[i + 3] === 0) continue;

    let r = (data[i] / 255) * expMult;
    let g = (data[i + 1] / 255) * expMult;
    let b = (data[i + 2] / 255) * expMult;

    // Temperature & Tint
    r += tempOffset + tintOffset * 0.5;
    g -= tintOffset;
    b -= tempOffset - tintOffset * 0.5;

    // Lift / Gamma / Gain
    r = Math.max(0, r * gainR + liftR * (1 - Math.min(1, r)));
    g = Math.max(0, g * gainG + liftG * (1 - Math.min(1, g)));
    b = Math.max(0, b * gainB + liftB * (1 - Math.min(1, b)));

    if (gammaR !== 1) r = Math.pow(Math.min(1.5, r), 1 / Math.max(0.25, gammaR));
    if (gammaG !== 1) g = Math.pow(Math.min(1.5, g), 1 / Math.max(0.25, gammaG));
    if (gammaB !== 1) b = Math.pow(Math.min(1.5, b), 1 / Math.max(0.25, gammaB));

    // Blacks & Whites
    r = r + blacksAdj * (1 - r) + whitesAdj * r;
    g = g + blacksAdj * (1 - g) + whitesAdj * g;
    b = b + blacksAdj * (1 - b) + whitesAdj * b;

    // Shadows & Highlights recovery
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const shadowMask = Math.max(0, 1 - luma * 2);
    const highMask = Math.max(0, (luma - 0.5) * 2);
    const toneShift = shadowsAdj * shadowMask + highlightsAdj * highMask;
    r += toneShift;
    g += toneShift;
    b += toneShift;

    // Contrast around mid-gray (0.5)
    if (contrastFactor !== 1) {
      r = (r - 0.5) * contrastFactor + 0.5;
      g = (g - 0.5) * contrastFactor + 0.5;
      b = (b - 0.5) * contrastFactor + 0.5;
    }

    // Clamp before curve lookup
    let ri = Math.max(0, Math.min(255, Math.round(r * 255)));
    let gi = Math.max(0, Math.min(255, Math.round(g * 255)));
    let bi = Math.max(0, Math.min(255, Math.round(b * 255)));

    // RGB & Master Tone Curves
    ri = masterCurve[redCurve[ri]];
    gi = masterCurve[greenCurve[gi]];
    bi = masterCurve[blueCurve[bi]];

    r = ri / 255;
    g = gi / 255;
    b = bi / 255;

    // Saturation + Vibrance
    if (satMult !== 1 || vibAmt !== 0) {
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC - minC;
      const vibFactor = 1 + vibAmt * (1 - sat);
      const totalSat = Math.max(0, satMult * vibFactor);
      r = y + (r - y) * totalSat;
      g = y + (g - y) * totalSat;
      b = y + (b - y) * totalSat;
    }

    // LUT Preset blend
    if (lutMix > 0) {
      const [lr, lg, lb] = lutDef.apply(
        Math.max(0, Math.min(1, r)),
        Math.max(0, Math.min(1, g)),
        Math.max(0, Math.min(1, b))
      );
      r = r * (1 - lutMix) + lr * lutMix;
      g = g * (1 - lutMix) + lg * lutMix;
      b = b * (1 - lutMix) + lb * lutMix;
    }

    data[i] = Math.max(0, Math.min(255, Math.round(r * 255)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
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

  // Sample every 2nd pixel horizontally/vertically for 60fps scope responsiveness
  const stepX = Math.max(1, Math.floor(width / 256));
  const stepY = Math.max(1, Math.floor(height / 144));

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

  // Target median ~122, dynamic range spread toward [14..242]
  const evShift = Number(Math.max(-1.2, Math.min(1.2, ((122 - p50) / 110))).toFixed(2));
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

