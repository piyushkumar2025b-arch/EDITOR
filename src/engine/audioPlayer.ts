import { getActiveClipsAtTime } from './timelineOps';
import { AudioTonePreset, MediaAsset, TimelineClip, Track } from './types';

function applyToneToGainAndFilter(
  filter: BiquadFilterNode,
  preset: AudioTonePreset | undefined
) {
  if (preset === 'voice') {
    filter.type = 'highpass';
    filter.frequency.value = 180;
    filter.Q.value = 0.8;
  } else if (preset === 'podcast') {
    filter.type = 'peaking';
    filter.frequency.value = 2400;
    filter.Q.value = 1.0;
    filter.gain.value = 4.5;
  } else if (preset === 'warm-bass') {
    filter.type = 'lowshelf';
    filter.frequency.value = 240;
    filter.gain.value = 5.5;
  } else if (preset === 'radio') {
    filter.type = 'bandpass';
    filter.frequency.value = 1350;
    filter.Q.value = 1.6;
  } else if (preset === 'megaphone') {
    filter.type = 'bandpass';
    filter.frequency.value = 2100;
    filter.Q.value = 2.4;
  } else {
    filter.type = 'allpass';
    filter.frequency.value = 1000;
  }
}

export class AudioPreviewEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activePads = new Map<
    string,
    {
      osc1: OscillatorNode;
      osc2: OscillatorNode;
      gain: GainNode;
      pan: StereoPannerNode;
      filter: BiquadFilterNode;
    }
  >();
  private activeMediaEls = new Map<string, HTMLAudioElement>();
  private muted = false;

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.65, this.ctx.currentTime, 0.03);
    }
    for (const el of this.activeMediaEls.values()) {
      el.muted = muted;
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.65;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public stopAll() {
    for (const [, pad] of this.activePads) {
      try {
        pad.osc1.stop();
        pad.osc2.stop();
        pad.osc1.disconnect();
        pad.osc2.disconnect();
        pad.gain.disconnect();
      } catch {
        // Ignore already stopped oscillators
      }
    }
    this.activePads.clear();

    for (const [, el] of this.activeMediaEls) {
      el.pause();
    }
  }

  public sync(
    isPlaying: boolean,
    currentTime: number,
    playbackRate: number,
    clips: TimelineClip[],
    tracks: Track[],
    assets: MediaAsset[]
  ) {
    if (!isPlaying || this.muted) {
      this.stopAll();
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const { audioClips } = getActiveClipsAtTime(clips, tracks, currentTime);
    const activeIds = new Set(audioClips.map((c) => c.id));
    const trackMap = new Map(tracks.map((t) => [t.id, t]));
    const assetMap = new Map(assets.map((a) => [a.id, a]));

    // Stop inactive pads
    for (const [id, pad] of this.activePads) {
      if (!activeIds.has(id)) {
        try {
          pad.osc1.stop();
          pad.osc2.stop();
          pad.gain.disconnect();
        } catch {
          // Ignore
        }
        this.activePads.delete(id);
      }
    }

    // Pause inactive media elements
    for (const [id, el] of this.activeMediaEls) {
      if (!activeIds.has(id)) {
        el.pause();
      }
    }

    for (const clip of audioClips) {
      const tr = trackMap.get(clip.trackId);
      const asset = assetMap.get(clip.assetId);
      if (!tr || !asset) continue;

      const rel = Math.max(0, currentTime - clip.startTime);
      let fadeMult = 1;
      if (clip.fadeIn > 0 && rel < clip.fadeIn) fadeMult *= rel / clip.fadeIn;
      const rem = clip.duration - rel;
      if (clip.fadeOut > 0 && rem < clip.fadeOut) fadeMult *= Math.max(0, rem / clip.fadeOut);

      const linearGain = Math.min(1.5, Math.pow(10, (clip.gainDb + tr.gainDb) / 20)) * fadeMult;

      if (asset.src) {
        let el = this.activeMediaEls.get(clip.id);
        if (!el) {
          el = new Audio(asset.src);
          el.preload = 'auto';
          this.activeMediaEls.set(clip.id, el);
        }
        el.muted = this.muted;
        el.volume = Math.max(0, Math.min(1, linearGain * 0.75));
        el.playbackRate = Math.max(0.5, Math.min(2, Math.abs(playbackRate) * clip.speed));
        const targetPos = clip.sourceIn + rel * clip.speed;
        if (Math.abs(el.currentTime - targetPos) > 0.22) {
          el.currentTime = Math.max(0, targetPos);
        }
        if (el.paused) {
          void el.play().catch(() => {});
        }
      } else if (asset.synthPreset) {
        let pad = this.activePads.get(clip.id);
        if (!pad) {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const pan = ctx.createStereoPanner();
          const gain = ctx.createGain();

          if (asset.synthPreset === 'cinema-pad') {
            osc1.type = 'sine';
            osc2.type = 'triangle';
            osc1.frequency.value = 146.83; // D3
            osc2.frequency.value = 220.0; // A3
          } else {
            osc1.type = 'triangle';
            osc2.type = 'sine';
            osc1.frequency.value = 110.0;
            osc2.frequency.value = 164.81;
          }

          gain.gain.value = 0.001;
          osc1.connect(filter);
          osc2.connect(filter);
          filter.connect(pan);
          pan.connect(gain);
          gain.connect(this.masterGain);
          osc1.start();
          osc2.start();
          pad = { osc1, osc2, gain, pan, filter };
          this.activePads.set(clip.id, pad);
        }

        const tone = clip.audioTone && clip.audioTone !== 'normal' ? clip.audioTone : tr.tonePreset;
        applyToneToGainAndFilter(pad.filter, tone);
        pad.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, tr.pan ?? 0)), ctx.currentTime, 0.03);
        const synthVolume = Math.max(0, Math.min(0.14, linearGain * 0.055));
        pad.gain.gain.setTargetAtTime(synthVolume, ctx.currentTime, 0.04);
      }
    }
  }
}
