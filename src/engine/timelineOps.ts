import {
  ClipTransform,
  PiPLayoutPreset,
  SequenceAspectPreset,
  TimelineClip,
  Track,
} from './types';

export function getSequenceDuration(clips: TimelineClip[], minDuration: number = 20): number {
  let maxEnd = minDuration;
  for (const clip of clips) {
    const end = clip.startTime + clip.duration;
    if (end > maxEnd) maxEnd = end;
  }
  return maxEnd;
}

export function getClipSnapPoints(
  clips: TimelineClip[],
  playheadTime: number,
  excludeClipId?: string
): number[] {
  const points = [0, playheadTime];
  for (const clip of clips) {
    if (clip.id === excludeClipId) continue;
    points.push(clip.startTime, clip.startTime + clip.duration);
  }
  return points;
}

export function splitClipAtTime(
  clips: TimelineClip[],
  clipId: string,
  splitTime: number,
  minPieceDuration: number = 0.2
): TimelineClip[] {
  const target = clips.find((c) => c.id === clipId);
  if (!target) return clips;

  const offset = splitTime - target.startTime;
  if (offset < minPieceDuration || target.duration - offset < minPieceDuration) {
    return clips;
  }

  const exactSplit = Number(splitTime.toFixed(4));
  const exactOffset = Number((exactSplit - target.startTime).toFixed(4));

  const leftClip: TimelineClip = {
    ...target,
    duration: exactOffset,
    fadeOut: 0,
  };

  const rightClip: TimelineClip = {
    ...structuredClone(target),
    id: `${target.id}_cut_${Math.random().toString(36).slice(2, 7)}`,
    startTime: exactSplit,
    duration: Number((target.startTime + target.duration - exactSplit).toFixed(4)),
    sourceIn: Number((target.sourceIn + exactOffset * target.speed).toFixed(4)),
    fadeIn: 0,
  };

  return clips.flatMap((c) => (c.id === clipId ? [leftClip, rightClip] : [c]));
}

export function splitAllAtTime(
  clips: TimelineClip[],
  tracks: Track[],
  splitTime: number,
  minPieceDuration: number = 0.2
): TimelineClip[] {
  const lockedIds = new Set(tracks.filter((t) => t.locked).map((t) => t.id));
  let updated = clips;
  for (const clip of clips) {
    if (lockedIds.has(clip.trackId)) continue;
    const offset = splitTime - clip.startTime;
    if (offset >= minPieceDuration && clip.duration - offset >= minPieceDuration) {
      updated = splitClipAtTime(updated, clip.id, splitTime, minPieceDuration);
    }
  }
  return updated;
}

export function moveClip(
  clips: TimelineClip[],
  clipId: string,
  newStartTime: number,
  newTrackId: string,
  tracks: Track[]
): TimelineClip[] {
  const target = clips.find((c) => c.id === clipId);
  if (!target) return clips;

  const sourceTrack = tracks.find((t) => t.id === target.trackId);
  const destTrack = tracks.find((t) => t.id === newTrackId);
  if (sourceTrack?.locked || destTrack?.locked) return clips;

  const resolvedTrackId =
    destTrack &&
    ((target.kind === 'audio' && destTrack.type === 'audio') ||
      (target.kind !== 'audio' && destTrack.type === 'video'))
      ? destTrack.id
      : target.trackId;

  const clampedStart = Math.max(0, Number(newStartTime.toFixed(4)));

  return clips.map((c) =>
    c.id === clipId
      ? {
          ...c,
          startTime: clampedStart,
          trackId: resolvedTrackId,
        }
      : c
  );
}

export function nudgeClip(
  clips: TimelineClip[],
  clipId: string,
  deltaSeconds: number,
  tracks: Track[]
): TimelineClip[] {
  const target = clips.find((c) => c.id === clipId);
  if (!target) return clips;
  const track = tracks.find((t) => t.id === target.trackId);
  if (track?.locked) return clips;
  const nextStart = Math.max(0, Number((target.startTime + deltaSeconds).toFixed(4)));
  return clips.map((c) => (c.id === clipId ? { ...c, startTime: nextStart } : c));
}

export function trimClip(
  clips: TimelineClip[],
  clipId: string,
  edge: 'left' | 'right',
  newTime: number,
  minDuration: number = 0.25
): TimelineClip[] {
  const target = clips.find((c) => c.id === clipId);
  if (!target) return clips;

  if (edge === 'left') {
    const maxStart = target.startTime + target.duration - minDuration;
    const clampedStart = Math.max(0, Math.min(maxStart, newTime));
    const delta = clampedStart - target.startTime;
    const actualDelta = Math.max(-target.sourceIn / target.speed, delta);
    const resolvedStart = Number((target.startTime + actualDelta).toFixed(4));
    const resolvedDuration = Number((target.duration - actualDelta).toFixed(4));
    const resolvedSourceIn = Math.max(0, Number((target.sourceIn + actualDelta * target.speed).toFixed(4)));

    return clips.map((c) =>
      c.id === clipId
        ? {
            ...c,
            startTime: resolvedStart,
            duration: resolvedDuration,
            sourceIn: resolvedSourceIn,
          }
        : c
    );
  } else {
    const newDuration = Math.max(minDuration, newTime - target.startTime);
    return clips.map((c) =>
      c.id === clipId
        ? {
            ...c,
            duration: Number(newDuration.toFixed(4)),
          }
        : c
    );
  }
}

export function trimClipToPlayhead(
  clips: TimelineClip[],
  clipId: string,
  edge: 'left' | 'right',
  playheadTime: number
): TimelineClip[] {
  const target = clips.find((c) => c.id === clipId);
  if (!target) return clips;
  if (playheadTime <= target.startTime || playheadTime >= target.startTime + target.duration) {
    return clips;
  }
  return trimClip(clips, clipId, edge, playheadTime);
}

export function deleteClip(
  clips: TimelineClip[],
  clipId: string,
  ripple: boolean = false
): TimelineClip[] {
  const target = clips.find((c) => c.id === clipId);
  if (!target) return clips;

  const remaining = clips.filter((c) => c.id !== clipId);
  if (!ripple) return remaining;

  const shift = target.duration;
  const cutoff = target.startTime + target.duration;
  return remaining.map((c) => {
    if (c.trackId === target.trackId && c.startTime >= cutoff - 0.001) {
      return {
        ...c,
        startTime: Math.max(0, Number((c.startTime - shift).toFixed(4))),
      };
    }
    return c;
  });
}

export function closeTrackGaps(clips: TimelineClip[], trackId: string): TimelineClip[] {
  const trackClips = clips
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.startTime - b.startTime);
  if (trackClips.length === 0) return clips;

  let cursor = 0;
  const packedMap = new Map<string, number>();
  for (const clip of trackClips) {
    packedMap.set(clip.id, Number(cursor.toFixed(4)));
    cursor += clip.duration;
  }

  return clips.map((c) =>
    packedMap.has(c.id) ? { ...c, startTime: packedMap.get(c.id)! } : c
  );
}

export function duplicateClip(clips: TimelineClip[], clipId: string): TimelineClip[] {
  const target = clips.find((c) => c.id === clipId);
  if (!target) return clips;

  const clone: TimelineClip = {
    ...structuredClone(target),
    id: `${target.id}_dup_${Math.random().toString(36).slice(2, 6)}`,
    startTime: Number((target.startTime + target.duration).toFixed(4)),
  };
  return [...clips, clone];
}

export function getActiveClipsAtTime(
  clips: TimelineClip[],
  tracks: Track[],
  time: number
): { videoClips: TimelineClip[]; audioClips: TimelineClip[] } {
  const trackMap = new Map(tracks.map((t) => [t.id, t]));
  const hasSoloVideo = tracks.some((t) => t.type === 'video' && t.solo);
  const hasSoloAudio = tracks.some((t) => t.type === 'audio' && t.solo);

  const active = clips.filter(
    (c) => time >= c.startTime && time < c.startTime + c.duration
  );

  const videoClips = active
    .filter((c) => {
      const tr = trackMap.get(c.trackId);
      if (!tr || tr.type !== 'video' || !tr.visible) return false;
      if (hasSoloVideo && !tr.solo) return false;
      return true;
    })
    .sort((a, b) => {
      const ta = trackMap.get(a.trackId)?.index ?? 0;
      const tb = trackMap.get(b.trackId)?.index ?? 0;
      return ta - tb;
    });

  const audioClips = active.filter((c) => {
    const tr = trackMap.get(c.trackId);
    if (!tr || tr.type !== 'audio' || tr.muted) return false;
    if (hasSoloAudio && !tr.solo) return false;
    return true;
  });

  return { videoClips, audioClips };
}

export function changeClipSpeed(
  clips: TimelineClip[],
  clipId: string,
  newSpeed: number
): TimelineClip[] {
  const clampedSpeed = Math.max(0.25, Math.min(4, Number(newSpeed.toFixed(2))));
  return clips.map((c) => {
    if (c.id !== clipId) return c;
    const oldSpeed = Math.max(0.25, c.speed || 1);
    const sourceSpan = c.duration * oldSpeed;
    const nextDuration = Math.max(0.25, Number((sourceSpan / clampedSpeed).toFixed(4)));
    return {
      ...c,
      speed: clampedSpeed,
      duration: nextDuration,
    };
  });
}

export function addTrack(tracks: Track[], type: 'video' | 'audio'): Track[] {
  const existingOfType = tracks.filter((t) => t.type === type);
  const nextIndex = existingOfType.length;
  const prefix = type === 'video' ? 'V' : 'A';
  const id = `${prefix.toLowerCase()}${nextIndex + 1}`;
  const newTrack: Track = {
    id,
    name: `${prefix}${nextIndex + 1}`,
    type,
    index: nextIndex,
    muted: false,
    solo: false,
    locked: false,
    visible: true,
    gainDb: 0,
    pan: 0,
    tonePreset: 'normal',
  };

  if (type === 'video') {
    return [newTrack, ...tracks];
  }
  return [...tracks, newTrack];
}

export function getPiPLayoutTransform(
  preset: PiPLayoutPreset,
  current: ClipTransform
): ClipTransform {
  switch (preset) {
    case 'full':
      return {
        ...current,
        x: 0,
        y: 0,
        scale: 100,
        cropLeft: 0,
        cropRight: 0,
        cropTop: 0,
        cropBottom: 0,
      };
    case 'pip-tr':
      return {
        ...current,
        x: 340,
        y: -185,
        scale: 34,
        cropLeft: 0,
        cropRight: 0,
        cropTop: 0,
        cropBottom: 0,
      };
    case 'pip-tl':
      return {
        ...current,
        x: -340,
        y: -185,
        scale: 34,
        cropLeft: 0,
        cropRight: 0,
        cropTop: 0,
        cropBottom: 0,
      };
    case 'split-left':
      return {
        ...current,
        x: -320,
        y: 0,
        scale: 100,
        cropLeft: 25,
        cropRight: 25,
        cropTop: 0,
        cropBottom: 0,
      };
    case 'split-right':
      return {
        ...current,
        x: 320,
        y: 0,
        scale: 100,
        cropLeft: 25,
        cropRight: 25,
        cropTop: 0,
        cropBottom: 0,
      };
  }
}

export function getSequenceDimensionsForRatio(ratio: SequenceAspectPreset): {
  width: number;
  height: number;
} {
  switch (ratio) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:5':
      return { width: 1080, height: 1350 };
    default:
      return { width: 1920, height: 1080 };
  }
}

export function applyColorGradeToAllClips(
  clips: TimelineClip[],
  grade: TimelineClip['color']
): TimelineClip[] {
  return clips.map((c) =>
    c.kind === 'image' || c.kind === 'video'
      ? { ...c, color: structuredClone(grade) }
      : c
  );
}

export function slipClipSource(
  clips: TimelineClip[],
  clipId: string,
  nextSourceIn: number
): TimelineClip[] {
  const clamped = Math.max(0, Number(nextSourceIn.toFixed(3)));
  return clips.map((c) => (c.id === clipId ? { ...c, sourceIn: clamped } : c));
}
