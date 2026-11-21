import React, { useState } from 'react';
import { Check, Download, Film, Image as ImageIcon, X } from 'lucide-react';
import { LoadedMediaCache, renderCompositeFrame } from '../engine/renderer';
import { secondsToTimecode } from '../engine/timecode';
import { MediaAsset, SequenceSettings, TimelineClip, Track } from '../engine/types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sequence: SequenceSettings;
  tracks: Track[];
  clips: TimelineClip[];
  assets: MediaAsset[];
  cache: LoadedMediaCache;
  currentTime: number;
  duration: number;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  sequence,
  tracks,
  clips,
  assets,
  cache,
  currentTime,
  duration,
}) => {
  const [exportType, setExportType] = useState<'still' | 'video'>('still');
  const [imageFormat, setImageFormat] = useState<'image/png' | 'image/jpeg' | 'image/webp'>('image/png');
  const [resolution, setResolution] = useState<'1080p' | '720p' | '4k'>('1080p');
  const [quality, setQuality] = useState(92);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const dims =
    resolution === '4k'
      ? { w: 3840, h: 2160 }
      : resolution === '1080p'
      ? { w: 1920, h: 1080 }
      : { w: 1280, h: 720 };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleExportStill = () => {
    setIsExporting(true);
    setDoneMessage(null);

    const off = document.createElement('canvas');
    off.width = dims.w;
    off.height = dims.h;

    renderCompositeFrame(off, sequence, tracks, clips, assets, cache, currentTime, {
      computeScopes: false,
      showSafeGuides: false,
      showGrid: false,
    });

    const ext = imageFormat === 'image/png' ? 'png' : imageFormat === 'image/jpeg' ? 'jpg' : 'webp';
    off.toBlob(
      (blob) => {
        if (blob) {
          triggerDownload(blob, `auteur_frame_${secondsToTimecode(currentTime, sequence.fps).replace(/:/g, '-')}.${ext}`);
          setDoneMessage(`Exported ${dims.w}×${dims.h} ${ext.toUpperCase()} frame.`);
        }
        setIsExporting(false);
      },
      imageFormat,
      quality / 100
    );
  };

  const handleExportVideo = async () => {
    setIsExporting(true);
    setProgress(0);
    setDoneMessage(null);

    const off = document.createElement('canvas');
    off.width = resolution === '4k' ? 1920 : dims.w;
    off.height = resolution === '4k' ? 1080 : dims.h;

    const startT = sequence.inPoint ?? 0;
    const endT = Math.min(duration, sequence.outPoint ?? duration);
    const exportDur = Math.max(1, endT - startT);

    try {
      const stream = off.captureStream(24);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 6_000_000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      const finished = new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          triggerDownload(blob, `${sequence.name.replace(/\s+/g, '_').toLowerCase()}.webm`);
          resolve();
        };
      });

      recorder.start(250);

      const fps = 24;
      const totalFrames = Math.ceil(exportDur * fps);
      for (let f = 0; f <= totalFrames; f++) {
        const t = startT + f / fps;
        renderCompositeFrame(off, sequence, tracks, clips, assets, cache, t);
        setProgress(Math.round((f / totalFrames) * 100));
        await new Promise((r) => setTimeout(r, 1000 / fps));
      }

      recorder.stop();
      await finished;
      setDoneMessage(`Rendered ${exportDur.toFixed(1)}s sequence to WebM.`);
    } catch {
      setDoneMessage('WebM capture unsupported in this browser; try PNG/JPEG Frame Export.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Export Media Settings"
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-lg bg-[#17191E] border border-[#2C303A] rounded-md shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#252830] flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-white">Export Media</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Export Dialog"
            className="p-1 text-[#9CA3AF] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Export Target Selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setExportType('still')}
              className={`flex items-center gap-2 p-3 rounded border text-left cursor-pointer transition-colors ${
                exportType === 'still'
                  ? 'bg-[#252B36] border-[#3B82F6] text-white'
                  : 'bg-[#121317] border-[#262930] text-[#9CA3AF] hover:text-white'
              }`}
            >
              <ImageIcon className="w-4 h-4 shrink-0 text-[#60A5FA]" />
              <div>
                <div className="text-[12px] font-semibold">Current Frame / Photo</div>
                <div className="text-[10px] opacity-75">Graded PNG, JPEG, or WebP</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setExportType('video')}
              className={`flex items-center gap-2 p-3 rounded border text-left cursor-pointer transition-colors ${
                exportType === 'video'
                  ? 'bg-[#252B36] border-[#3B82F6] text-white'
                  : 'bg-[#121317] border-[#262930] text-[#9CA3AF] hover:text-white'
              }`}
            >
              <Film className="w-4 h-4 shrink-0 text-[#34D399]" />
              <div>
                <div className="text-[12px] font-semibold">Master Sequence</div>
                <div className="text-[10px] opacity-75">Real-time WebM Render</div>
              </div>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] text-[#9CA3AF]">Output Resolution</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as '1080p' | '720p' | '4k')}
                className="w-full bg-[#101114] border border-[#282B33] rounded px-2.5 py-1.5 text-[12px] text-white"
              >
                <option value="1080p">1920 × 1080 (Full HD)</option>
                <option value="4k">3840 × 2160 (4K UHD)</option>
                <option value="720p">1280 × 720 (HD Proxy)</option>
              </select>
            </div>

            {exportType === 'still' ? (
              <div className="space-y-1">
                <label className="block text-[11px] text-[#9CA3AF]">Format</label>
                <select
                  value={imageFormat}
                  onChange={(e) =>
                    setImageFormat(e.target.value as 'image/png' | 'image/jpeg' | 'image/webp')
                  }
                  className="w-full bg-[#101114] border border-[#282B33] rounded px-2.5 py-1.5 text-[12px] text-white"
                >
                  <option value="image/png">PNG (Lossless)</option>
                  <option value="image/jpeg">JPEG (Editorial)</option>
                  <option value="image/webp">WebP (Web Master)</option>
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="block text-[11px] text-[#9CA3AF]">Range</label>
                <div className="px-2.5 py-1.5 bg-[#101114] border border-[#282B33] rounded text-[12px] font-mono-tabular text-[#D1D5DB]">
                  {secondsToTimecode(sequence.inPoint ?? 0, sequence.fps)} →{' '}
                  {secondsToTimecode(sequence.outPoint ?? duration, sequence.fps)}
                </div>
              </div>
            )}
          </div>

          {exportType === 'still' && imageFormat !== 'image/png' && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-[#9CA3AF]">
                <span>Compression Quality</span>
                <span className="font-mono-tabular text-white">{quality}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full studio-slider"
              />
            </div>
          )}

          {isExporting && exportType === 'video' && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-[#9CA3AF]">
                <span>Encoding sequence frames...</span>
                <span className="font-mono-tabular text-white">{progress}%</span>
              </div>
              <div className="h-1.5 bg-[#101114] rounded overflow-hidden">
                <div
                  className="h-full bg-[#3B82F6] transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {doneMessage && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#10B981]/15 border border-[#10B981]/40 rounded text-[12px] text-[#6EE7B7]">
              <Check className="w-4 h-4 shrink-0" />
              <span>{doneMessage}</span>
            </div>
          )}
        </div>

        <div className="px-4 py-3 bg-[#131418] border-t border-[#252830] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-[12px] font-medium text-[#C7CBD4] hover:text-white bg-[#1E2027] rounded border border-[#2C303A] cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={exportType === 'still' ? handleExportStill : handleExportVideo}
            className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 rounded cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Rendering...' : 'Render & Download'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
