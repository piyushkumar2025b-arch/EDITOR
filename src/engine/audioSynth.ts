import { getActiveClipsAtTime } from './timelineOps';
import { MediaAsset, TimelineClip, Track } from './types';

export function generateSynthWaveform(preset: 'cinema-pad' | 'foley-pulse', length: number = 96): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < length; i++) {
    const t = i / length;
    if (preset === 'cinema-pad') {
      const swell = 0.25 + 0.55 * Math.sin(t * Math.PI);
      const ripple = 0.14 * Math.sin(t * 28) + 0.08 * Math.cos(t * 53);
      peaks.push(Math.max(0.08, Math.min(0.95, swell + ripple)));
    } else {
      const beat = i % 8 === 0 ? 0.88 : i % 4 === 0 ? 0.54 : 0.16;
      const jitter = 0.1 * Math.abs(Math.sin(i * 1.7));
      peaks.push(Math.min(0.96, beat + jitter));
    }
  }
  return peaks;
}

export async function extractAudioPeaksFromBuffer(
  arrayBuffer: ArrayBuffer,
  samples: number = 96
): Promise<{ duration: number; sampleRate: number; peaks: number[] }> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channel = decoded.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / samples));
    const peaks: number[] = [];
    for (let i = 0; i < samples; i++) {
      const start = i * blockSize;
      let peak = 0;
      for (let j = 0; j < blockSize && start + j < channel.length; j += Math.max(1, Math.floor(blockSize / 32))) {
        const val = Math.abs(channel[start + j]);
        if (val > peak) peak = val;
      }
      peaks.push(Math.max(0.05, Math.min(1, peak)));
    }
    return {
      duration: decoded.duration,
      sampleRate: decoded.sampleRate,
      peaks,
    };
  } finally {
    await ctx.close();
  }
}

export function computeLiveStereoLevels(
  clips: TimelineClip[],
  tracks: Track[],
  assets: MediaAsset[],
  currentTime: number,
  isPlaying: boolean
): { leftDb: number; rightDb: number } {
  if (!isPlaying) return { leftDb: -60, rightDb: -60 };

  const { audioClips } = getActiveClipsAtTime(clips, tracks, currentTime);
  if (audioClips.length === 0) return { leftDb: -60, rightDb: -60 };

  const trackMap = new Map(tracks.map((t) => [t.id, t]));
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  let energyL = 0;
  let energyR = 0;

  for (const clip of audioClips) {
    const tr = trackMap.get(clip.trackId);
    const asset = assetMap.get(clip.assetId);
    if (!tr || !asset) continue;

    const progress = Math.max(0, Math.min(0.999, (currentTime - clip.startTime) / Math.max(0.1, clip.duration)));
    const peaks = asset.waveformPeaks;
    let amp = 0.35;
    if (peaks && peaks.length > 0) {
      const idx = Math.floor(progress * peaks.length);
      amp = peaks[idx] ?? 0.35;
    }

    // Apply fade envelopes
    const rel = currentTime - clip.startTime;
    if (clip.fadeIn > 0 && rel < clip.fadeIn) amp *= rel / clip.fadeIn;
    const rem = clip.duration - rel;
    if (clip.fadeOut > 0 && rem < clip.fadeOut) amp *= Math.max(0, rem / clip.fadeOut);

    const totalDb = clip.gainDb + tr.gainDb;
    const linearGain = Math.pow(10, totalDb / 20);
    const modL = 0.92 + 0.08 * Math.sin(currentTime * 19.3);
    const modR = 0.92 + 0.08 * Math.cos(currentTime * 17.1);

    energyL += amp * linearGain * modL;
    energyR += amp * linearGain * modR;
  }

  const toDb = (val: number) => (val <= 0.001 ? -60 : Math.max(-60, Math.min(0, 20 * Math.log10(val))));
  return {
    leftDb: toDb(energyL),
    rightDb: toDb(energyR),
  };
}
