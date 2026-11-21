import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { AudioTonePreset, Track } from '../engine/types';

interface AudioMixerPanelProps {
  tracks: Track[];
  stereoLevels: { leftDb: number; rightDb: number };
  onChangeTrackGain: (trackId: string, gainDb: number) => void;
  onChangeTrackPan: (trackId: string, pan: number) => void;
  onChangeTrackTone: (trackId: string, tone: AudioTonePreset) => void;
  onToggleTrackProp: (trackId: string, prop: 'muted' | 'solo') => void;
}

export const AudioMixerPanel: React.FC<AudioMixerPanelProps> = ({
  tracks,
  stereoLevels,
  onChangeTrackGain,
  onChangeTrackPan,
  onChangeTrackTone,
  onToggleTrackProp,
}) => {
  const audioTracks = tracks.filter((t) => t.type === 'audio');

  return (
    <section
      aria-label="Audio Mixer"
      className="flex flex-col h-full bg-[#15161A] border-r border-[#262930] select-none overflow-hidden"
    >
      <div className="h-9 px-3 bg-[#18191E] border-b border-[#24272E] flex items-center justify-between shrink-0">
        <span className="text-[12px] font-semibold text-[#E5E7EB]">Audio Mixer</span>
        <span className="text-[11px] font-mono-tabular text-[#8E939E]">48 kHz Stereo</span>
      </div>

      <div className="flex-1 p-3 flex items-stretch gap-2.5 overflow-x-auto">
        {audioTracks.map((tr) => {
          const pan = tr.pan ?? 0;
          return (
            <div
              key={tr.id}
              className="w-32 shrink-0 bg-[#1A1C22] border border-[#282B33] rounded p-2.5 flex flex-col items-center justify-between gap-2.5"
            >
              <div className="w-full flex items-center justify-between">
                <span className="text-[11px] font-mono-tabular font-semibold text-[#34D399]">
                  {tr.name}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onToggleTrackProp(tr.id, 'muted')}
                    aria-label={`Mute ${tr.name}`}
                    title="Mute Track"
                    className={`p-1 rounded-xs cursor-pointer ${
                      tr.muted ? 'bg-[#DC2626] text-white' : 'text-[#9CA3AF] hover:text-white'
                    }`}
                  >
                    {tr.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleTrackProp(tr.id, 'solo')}
                    aria-label={`Solo ${tr.name}`}
                    title="Solo Track"
                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded-xs cursor-pointer ${
                      tr.solo ? 'bg-[#D97706] text-black' : 'text-[#9CA3AF] hover:text-white'
                    }`}
                  >
                    S
                  </button>
                </div>
              </div>

              <div className="w-full space-y-1">
                <div className="flex justify-between text-[10px] text-[#8E939E]">
                  <span>Balance</span>
                  <span className="font-mono-tabular text-[#D1D5DB]">
                    {pan === 0 ? 'Center' : pan < 0 ? `L ${Math.abs(Math.round(pan * 100))}%` : `R ${Math.round(pan * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={pan}
                  aria-label={`${tr.name} Stereo Balance`}
                  onChange={(e) => onChangeTrackPan(tr.id, Number(e.target.value))}
                  className="w-full studio-slider"
                />
              </div>

              <div className="flex-1 w-full flex flex-col items-center justify-center gap-1.5">
                <span className="text-[10px] text-[#8E939E]">Volume</span>
                <input
                  type="range"
                  min={-36}
                  max={12}
                  step={0.5}
                  value={tr.gainDb}
                  aria-label={`${tr.name} Volume`}
                  onChange={(e) => onChangeTrackGain(tr.id, Number(e.target.value))}
                  className="w-full studio-slider"
                />
                <span className="text-[11px] font-mono-tabular text-[#D1D5DB]">
                  {tr.gainDb > 0 ? `+${tr.gainDb.toFixed(1)}` : tr.gainDb.toFixed(1)} dB
                </span>
              </div>

              <select
                aria-label={`${tr.name} Sound Tone`}
                value={tr.tonePreset ?? 'normal'}
                onChange={(e) => onChangeTrackTone(tr.id, e.target.value as AudioTonePreset)}
                className="w-full bg-[#111216] border border-[#272B35] rounded px-1.5 py-1 text-[10px] text-[#D1D5DB] cursor-pointer"
              >
                <option value="normal">Tone: Natural</option>
                <option value="voice">Tone: Clear Voice</option>
                <option value="podcast">Tone: Podcast Crisp</option>
                <option value="warm-bass">Tone: Warm Bass</option>
                <option value="radio">Tone: Lo-Fi Radio</option>
                <option value="megaphone">Tone: Megaphone</option>
              </select>
            </div>
          );
        })}

        {/* Master Stereo Out Card */}
        <div className="w-28 shrink-0 bg-[#14161B] border border-[#2D323D] rounded p-2.5 flex flex-col items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-[#E5E7EB]">Master Out</span>
          <div className="flex-1 w-full flex items-end justify-center gap-2 py-2">
            {[stereoLevels.leftDb, stereoLevels.rightDb].map((db, i) => {
              const pct = ((Math.max(-60, Math.min(0, db)) + 60) / 60) * 100;
              return (
                <div
                  key={i}
                  className="w-3.5 h-32 bg-[#0C0D10] border border-[#262930] rounded-xs flex items-end overflow-hidden"
                >
                  <div
                    className="w-full transition-all duration-75"
                    style={{
                      height: `${pct}%`,
                      background: 'linear-gradient(to top, #10B981, #F59E0B, #EF4444)',
                    }}
                  />
                </div>
              );
            })}
          </div>
          <span className="text-[10px] font-mono-tabular text-[#9CA3AF]">
            {stereoLevels.leftDb <= -59 ? '-∞ dB' : `${stereoLevels.leftDb.toFixed(1)} dB`}
          </span>
        </div>
      </div>
    </section>
  );
};
