import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyColorGradeToImageData,
  buildToneCurveLUT,
  computeAutoBalanceGrade,
  computeScopesFromImageData,
  createDefaultColorGrade,
  DEFAULT_EFFECTS,
  isColorGradeIdentity,
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
  assert.ok(PHOTO_STYLE_PRESETS.length >= 6);
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
