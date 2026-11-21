import { TimelineClip, Track } from './types';

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

  // Keep video/image/title on video tracks and audio on audio tracks
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
    // Prevent sourceIn from becoming negative
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
      return ta - tb; // V1 bottom -> V2 -> V3 top
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
  };

  if (type === 'video') {
    // Video tracks stack top-down (V4, V3, V2, V1)
    return [newTrack, ...tracks];
  }
  return [...tracks, newTrack];
}

