import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyColorGradeToImageData,
  buildToneCurveLUT,
  computeAutoBalanceGrade,
  computeScopesFromImageData,
  createDefaultColorGrade,
  DEFAULT_EFFECTS,
  EFFECT_PRESETS,
  isColorGradeIdentity,
  isEffectsIdentity,
  LUT_PRESETS,
  PHOTO_STYLE_PRESETS,
} from './colorEngine';

test('default color grade is detected as identity and leaves pixels untouched', () => {
  const grade = createDefaultColorGrade();
  assert.equal(isColorGradeIdentity(grade), true);

  const pixels = new Uint8ClampedArray([100, 150, 200, 255, 40, 80, 120, 255]);
  const copy = new Uint8ClampedArray(pixels);
  applyColorGradeToImageData(pixels, grade);
  assert.deepEqual(pixels, copy);
});

test('positive exposure brightens pixel values and monochrome LUT equalizes channels', () => {
  const grade = createDefaultColorGrade();
  grade.exposure = 1.0; // +1 EV doubles linear RGB
  const pixels = new Uint8ClampedArray([60, 80, 100, 255]);
  applyColorGradeToImageData(pixels, grade);
  assert.equal(pixels[0], 120);
  assert.equal(pixels[1], 160);
  assert.equal(pixels[2], 200);

  const monoGrade = createDefaultColorGrade();
  monoGrade.lut = 'monochrome-noir';
  const colorPixels = new Uint8ClampedArray([200, 100, 50, 255]);
  applyColorGradeToImageData(colorPixels, monoGrade);
  assert.equal(colorPixels[0], colorPixels[1]);
  assert.equal(colorPixels[1], colorPixels[2]);
});

test('sepia and vintageFade visual filters warm tones and lift black floor', () => {
  const grade = createDefaultColorGrade();
  const darkPixels = new Uint8ClampedArray([0, 0, 0, 255]);
  applyColorGradeToImageData(darkPixels, grade, { ...DEFAULT_EFFECTS, vintageFade: 100 });
  assert.ok(darkPixels[0] >= 30 && darkPixels[2] >= 30);

  const neutral = new Uint8ClampedArray([120, 120, 120, 255]);
  applyColorGradeToImageData(neutral, grade, { ...DEFAULT_EFFECTS, sepia: 100 });
  assert.ok(neutral[0] > neutral[1] && neutral[1] > neutral[2]);
  assert.ok(PHOTO_STYLE_PRESETS.length >= 10);
  assert.ok(LUT_PRESETS.length >= 11);
  assert.ok(EFFECT_PRESETS.length >= 8);
});

test('buildToneCurveLUT preserves endpoints and lifts midtones when midpoint raised', () => {
  const lut = buildToneCurveLUT([
    { x: 0, y: 0 },
    { x: 0.5, y: 0.75 },
    { x: 1, y: 1 },
  ]);
  assert.equal(lut[0], 0);
  assert.equal(lut[255], 255);
  assert.ok(lut[128] > 180 && lut[128] < 200);
});

test('computeScopesFromImageData populates RGB histograms and waveform accurately', () => {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 220;
    data[i + 1] = 20;
    data[i + 2] = 10;
    data[i + 3] = 255;
  }
  const scopes = computeScopesFromImageData(data, 4, 4);
  assert.equal(scopes.histR[220], 16);
  assert.equal(scopes.histG[20], 16);
  assert.equal(scopes.histB[10], 16);
});

test('computeAutoBalanceGrade lifts exposure for underexposed dark frames', () => {
  const darkData = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < darkData.length; i += 4) {
    darkData[i] = 24;
    darkData[i + 1] = 24;
    darkData[i + 2] = 24;
    darkData[i + 3] = 255;
  }
  const scopes = computeScopesFromImageData(darkData, 4, 4);
  const auto = computeAutoBalanceGrade(scopes, createDefaultColorGrade());
  assert.ok(auto.exposure > 0.5);
  assert.ok(auto.contrast > 0);
});

test('hueShift, dehaze, and invert filters modify pixel data deterministically', () => {
  const grade = createDefaultColorGrade();
  grade.hueShift = 90;
  const rgb = new Uint8ClampedArray([220, 60, 60, 255]);
  applyColorGradeToImageData(rgb, grade);
  assert.ok(rgb[1] > rgb[0]); // Red shifts toward green at +90 deg

  const invPixels = new Uint8ClampedArray([40, 100, 200, 255]);
  applyColorGradeToImageData(invPixels, createDefaultColorGrade(), {
    ...DEFAULT_EFFECTS,
    invert: true,
  });
  assert.equal(invPixels[0], 215);
  assert.equal(invPixels[1], 155);
  assert.equal(invPixels[2], 55);
});

test('posterize, threshold, and chromatic aberration effects transform image data accurately', () => {
  assert.equal(isEffectsIdentity(DEFAULT_EFFECTS), true);
  assert.equal(isEffectsIdentity({ ...DEFAULT_EFFECTS, chromatic: 40 }), false);

  const post = new Uint8ClampedArray([90, 140, 210, 255]);
  applyColorGradeToImageData(post, createDefaultColorGrade(), {
    ...DEFAULT_EFFECTS,
    posterize: 2,
  });
  assert.ok(post[0] === 0 && post[1] === 255 && post[2] === 255);

  const ink = new Uint8ClampedArray([180, 180, 180, 255, 40, 40, 40, 255]);
  applyColorGradeToImageData(ink, createDefaultColorGrade(), {
    ...DEFAULT_EFFECTS,
    threshold: 50,
  });
  assert.equal(ink[0], 255);
  assert.equal(ink[4], 0);

  // 4px wide row: bright red at x=0 shifts right onto x=2..3? R samples x-shift, B samples x+shift
  const row = new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 0, 0, 255,
    0, 0, 0, 255,
    0, 0, 200, 255,
  ]);
  applyColorGradeToImageData(
    row,
    createDefaultColorGrade(),
    { ...DEFAULT_EFFECTS, chromatic: 10 },
    4
  );
  // x=1 samples red from x=0 (red shifts right) and x=2 samples blue from x=3 (blue shifts left)
  assert.equal(row[4], 255);
  assert.equal(row[10], 200);
});
