import test from 'node:test';
import assert from 'node:assert/strict';
import {
  secondsToTimecode,
  timecodeToSeconds,
  stepFrames,
  snapTime,
} from './timecode';
import {
  addTrack,
  changeClipSpeed,
  splitClipAtTime,
  moveClip,
  trimClip,
  deleteClip,
  getActiveClipsAtTime,
} from './timelineOps';
import { createSeedProject } from './seedProject';

test('secondsToTimecode and timecodeToSeconds roundtrip accurately at 24fps', () => {
  assert.equal(secondsToTimecode(0, 24), '00:00:00:00');
  assert.equal(secondsToTimecode(1.5, 24), '00:00:01:12');
  assert.equal(secondsToTimecode(65.25, 24), '00:01:05:06');
  assert.equal(timecodeToSeconds('00:01:05:06', 24), 65.25);
  assert.equal(timecodeToSeconds('invalid', 24), null);
});

test('stepFrames advances and rewinds cleanly by exact frame increments', () => {
  const t1 = stepFrames(1.0, 1, 24);
  assert.ok(Math.abs(t1 - 25 / 24) < 0.0001);
  const t0 = stepFrames(0, -1, 24);
  assert.equal(t0, 0);
});

test('snapTime snaps to nearest target within threshold', () => {
  const snapped = snapTime(5.92, [0, 6.0, 12.0], 0.15, true);
  assert.equal(snapped, 6.0);
  const unsnapped = snapTime(5.92, [0, 6.0, 12.0], 0.15, false);
  assert.equal(unsnapped, 5.92);
});

test('splitClipAtTime splits a clip into two contiguous clips preserving sourceIn', () => {
  const project = createSeedProject();
  const initialCount = project.clips.length;
  const updated = splitClipAtTime(project.clips, 'clip_1', 2.5);
  assert.equal(updated.length, initialCount + 1);

  const left = updated.find((c) => c.id === 'clip_1');
  const right = updated.find((c) => c.id.startsWith('clip_1_cut_'));
  assert.ok(left && right);
  assert.equal(left.startTime, 0);
  assert.equal(left.duration, 2.5);
  assert.equal(left.fadeOut, 0);
  assert.equal(right.startTime, 2.5);
  assert.equal(right.duration, 3.5);
  assert.equal(right.sourceIn, 2.5);
  assert.equal(right.fadeIn, 0);
});

test('moveClip enforces track type compatibility and track lock', () => {
  const project = createSeedProject();
  // Moving video clip to another video track works
  const moved = moveClip(project.clips, 'clip_1', 1.0, 'v2', project.tracks);
  assert.equal(moved.find((c) => c.id === 'clip_1')?.trackId, 'v2');
  assert.equal(moved.find((c) => c.id === 'clip_1')?.startTime, 1.0);

  // Moving video clip onto audio track preserves original video track
  const invalidTrack = moveClip(project.clips, 'clip_1', 2.0, 'a1', project.tracks);
  assert.equal(invalidTrack.find((c) => c.id === 'clip_1')?.trackId, 'v1');
});

test('trimClip updates left and right edges cleanly', () => {
  const project = createSeedProject();
  const trimmedLeft = trimClip(project.clips, 'clip_2', 'left', 7.0);
  const c2 = trimmedLeft.find((c) => c.id === 'clip_2');
  assert.ok(c2);
  assert.equal(c2.startTime, 7.0);
  assert.equal(c2.duration, 4.5);
  assert.equal(c2.sourceIn, 1.0);

  const trimmedRight = trimClip(project.clips, 'clip_2', 'right', 9.0);
  const c2r = trimmedRight.find((c) => c.id === 'clip_2');
  assert.ok(c2r);
  assert.equal(c2r.duration, 3.0);
});

test('deleteClip with ripple shifts subsequent clips on the same track', () => {
  const project = createSeedProject();
  const after = deleteClip(project.clips, 'clip_1', true);
  const c2 = after.find((c) => c.id === 'clip_2');
  const c3 = after.find((c) => c.id === 'clip_3');
  assert.equal(c2?.startTime, 0);
  assert.equal(c3?.startTime, 5.5);
});

test('getActiveClipsAtTime respects track visibility and solo state', () => {
  const project = createSeedProject();
  const at7 = getActiveClipsAtTime(project.clips, project.tracks, 7.0);
  // Both V1 portrait and V3 lower third should be active at 7.0s
  assert.equal(at7.videoClips.length, 2);
  assert.equal(at7.videoClips[0].id, 'clip_2');
  assert.equal(at7.videoClips[1].id, 'clip_title_1');

  const tracksWithHiddenV3 = project.tracks.map((t) =>
    t.id === 'v3' ? { ...t, visible: false } : t
  );
  const hiddenRes = getActiveClipsAtTime(project.clips, tracksWithHiddenV3, 7.0);
  assert.equal(hiddenRes.videoClips.length, 1);
  assert.equal(hiddenRes.videoClips[0].id, 'clip_2');
});

test('changeClipSpeed adjusts clip duration inversely to speed', () => {
  const project = createSeedProject();
  const sped = changeClipSpeed(project.clips, 'clip_1', 2.0);
  const c1 = sped.find((c) => c.id === 'clip_1');
  assert.ok(c1);
  assert.equal(c1.speed, 2);
  assert.equal(c1.duration, 3.0);
});

test('addTrack appends V4 at top or A3 at bottom cleanly', () => {
  const project = createSeedProject();
  const withV4 = addTrack(project.tracks, 'video');
  assert.equal(withV4[0].name, 'V4');
  assert.equal(withV4[0].type, 'video');
  const withA3 = addTrack(withV4, 'audio');
  assert.equal(withA3[withA3.length - 1].name, 'A3');
  assert.equal(withA3[withA3.length - 1].type, 'audio');
});

