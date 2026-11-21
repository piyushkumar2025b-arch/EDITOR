import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Track } from '../engine/types';

interface AudioMixerPanelProps {
  tracks: Track[];
  stereoLevels: { leftDb: number; rightDb: number };
  onChangeTrackGain: (trackId: string, gainDb: number) => void;
  onToggleTrackProp: (trackId: string, prop: 'muted' | 'solo') => void;
}

export const AudioMixerPanel: React.FC<AudioMixerPanelProps> = ({
  tracks,
  stereoLevels,
  onChangeTrackGain,
  onToggleTrackProp,
}) => {
  const audioTracks = tracks.filter((t) => t.type === 'audio');

  return (
    <section
      aria-label="Audio Track Mixer"
      className="flex flex-col h-full bg-[#15161A] border-r border-[#262930] select-none overflow-hidden"
    >
      <div className="h-9 px-3 bg-[#18191E] border-b border-[#24272E] flex items-center justify-between shrink-0">
        <span className="text-[12px] font-semibold text-[#E5E7EB]">Audio Track Mixer</span>
        <span className="text-[11px] font-mono-tabular text-[#8E939E]">48 kHz · 24-bit</span>
      </div>

      <div className="flex-1 p-3 flex items-stretch gap-3 overflow-x-auto">
        {audioTracks.map((tr) => (
          <div
            key={tr.id}
            className="w-28 shrink-0 bg-[#1A1C22] border border-[#282B33] rounded p-2.5 flex flex-col items-center justify-between gap-3"
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
                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded-xs cursor-pointer ${
                    tr.solo ? 'bg-[#D97706] text-black' : 'text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  S
                </button>
              </div>
            </div>

            <div className="flex-1 w-full flex flex-col items-center justify-center gap-2">
              <input
                type="range"
                min={-36}
                max={12}
                step={0.5}
                value={tr.gainDb}
                aria-label={`${tr.name} Fader Gain`}
                onChange={(e) => onChangeTrackGain(tr.id, Number(e.target.value))}
                className="w-full studio-slider"
              />
              <span className="text-[11px] font-mono-tabular text-[#D1D5DB]">
                {tr.gainDb > 0 ? `+${tr.gainDb.toFixed(1)}` : tr.gainDb.toFixed(1)} dB
              </span>
            </div>

            <div className="w-full text-center pt-1.5 border-t border-[#252830] text-[10px] text-[#7D838F]">
              Stereo Bus
            </div>
          </div>
        ))}

        {/* Master Stereo Out Card */}
        <div className="w-32 shrink-0 bg-[#14161B] border border-[#2D323D] rounded p-2.5 flex flex-col items-center justify-between gap-2">
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
            {stereoLevels.leftDb <= -59 ? '-∞ dBFS' : `${stereoLevels.leftDb.toFixed(1)} dBFS`}
          </span>
        </div>
      </div>
    </section>
  );
};
