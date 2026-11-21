import React, { useEffect, useRef, useState } from 'react';
import { ScopeData } from '../engine/types';

interface ScopesPanelProps {
  scopes: ScopeData | null;
  compact?: boolean;
}

type ScopeMode = 'waveform' | 'histogram' | 'parade';

export const ScopesPanel: React.FC<ScopesPanelProps> = ({ scopes, compact = false }) => {
  const [mode, setMode] = useState<ScopeMode>('waveform');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#0D0E11';
    ctx.fillRect(0, 0, w, h);

    // Draw graticule IRE lines (0, 25, 50, 75, 100)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(156, 163, 175, 0.55)';
    const ireLevels = [0, 0.25, 0.5, 0.75, 1];
    ireLevels.forEach((lvl) => {
      const y = Math.round((1 - lvl) * (h - 14)) + 7;
      ctx.beginPath();
      ctx.moveTo(26, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillText(String(Math.round(lvl * 100)), 3, y + 3);
    });

    if (!scopes) return;

    const plotX = 28;
    const plotW = w - plotX - 4;
    const plotH = h - 14;

    if (mode === 'histogram') {
      const drawChannel = (bins: Uint32Array, stroke: string, fill: string) => {
        ctx.beginPath();
        ctx.moveTo(plotX, h - 7);
        for (let i = 0; i < 256; i++) {
          const x = plotX + (i / 255) * plotW;
          const norm = Math.min(1, bins[i] / Math.max(1, scopes.maxHist * 0.75));
          const y = h - 7 - norm * plotH;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(plotX + plotW, h - 7);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      };

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      drawChannel(scopes.histR, 'rgba(239, 68, 68, 0.85)', 'rgba(239, 68, 68, 0.22)');
      drawChannel(scopes.histG, 'rgba(34, 197, 94, 0.85)', 'rgba(34, 197, 94, 0.22)');
      drawChannel(scopes.histB, 'rgba(59, 130, 246, 0.85)', 'rgba(59, 130, 246, 0.22)');
      ctx.restore();
    } else if (mode === 'waveform') {
      const cols = 128;
      const rows = 64;
      const cellW = plotW / cols;
      const cellH = plotH / rows;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const val = scopes.waveform[r * cols + c];
          if (val === 0) continue;
          const alpha = Math.min(0.95, 0.14 + (val / 18) * 0.8);
          ctx.fillStyle = `rgba(96, 165, 250, ${alpha})`;
          ctx.fillRect(plotX + c * cellW, 7 + r * cellH, Math.max(1.5, cellW), Math.max(1.5, cellH));
        }
      }
    } else if (mode === 'parade') {
      const cols = 64;
      const rows = 64;
      const thirdW = (plotW - 8) / 3;
      const cellW = thirdW / cols;
      const cellH = plotH / rows;

      const channels: { data: Uint16Array; offset: number; rgb: string }[] = [
        { data: scopes.paradeR, offset: 0, rgb: '248, 113, 113' },
        { data: scopes.paradeG, offset: thirdW + 4, rgb: '74, 222, 128' },
        { data: scopes.paradeB, offset: (thirdW + 4) * 2, rgb: '96, 165, 250' },
      ];

      for (const ch of channels) {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const val = ch.data[r * cols + c];
            if (val === 0) continue;
            const alpha = Math.min(0.95, 0.18 + (val / 14) * 0.8);
            ctx.fillStyle = `rgba(${ch.rgb}, ${alpha})`;
            ctx.fillRect(
              plotX + ch.offset + c * cellW,
              7 + r * cellH,
              Math.max(1.2, cellW),
              Math.max(1.4, cellH)
            );
          }
        }
      }
    }
  }, [scopes, mode]);

  return (
    <div className="flex flex-col bg-[#131418] border border-[#262930] rounded overflow-hidden">
      <div className="h-8 px-2.5 border-b border-[#23262E] flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-[#C7CBD4] whitespace-nowrap shrink-0">
          Scopes
        </span>
        <div className="flex items-center gap-0.5 bg-[#0E0F12] p-0.5 rounded border border-[#24272F] shrink-0">
          {(
            [
              { id: 'waveform', label: 'Waveform' },
              { id: 'parade', label: 'Parade' },
              { id: 'histogram', label: 'Histogram' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-xs cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                mode === m.id
                  ? 'bg-[#262B35] text-white'
                  : 'text-[#8E939E] hover:text-[#D1D5DB]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-2 bg-[#0D0E11]">
        <canvas
          ref={canvasRef}
          width={320}
          height={compact ? 128 : 176}
          data-testid="scopes-canvas"
          className="w-full h-auto block rounded-xs"
        />
      </div>
    </div>
  );
};
