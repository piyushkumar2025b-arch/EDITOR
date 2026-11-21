import React, { useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { DEFAULT_CURVE } from '../engine/colorEngine';
import { ColorWheelOffset, CurvePoint } from '../engine/types';

interface WheelProps {
  label: string;
  value: ColorWheelOffset;
  onChange: (next: ColorWheelOffset) => void;
}

const SingleColorWheel: React.FC<WheelProps> = ({ label, value, onChange }) => {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const updateFromPointer = (clientX: number, clientY: number) => {
    const el = wheelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = rect.width / 2 - 4;
    let dx = (clientX - cx) / radius;
    let dy = (clientY - cy) / radius;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      dx /= dist;
      dy /= dist;
    }
    onChange({
      ...value,
      x: Number(dx.toFixed(3)),
      y: Number(dy.toFixed(3)),
    });
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center justify-between w-full px-1">
        <span className="text-[10px] font-medium text-[#9CA3AF]">{label}</span>
        <button
          type="button"
          onClick={() => onChange({ x: 0, y: 0, luma: 0 })}
          title={`Reset ${label}`}
          aria-label={`Reset ${label} Wheel`}
          className="text-[#6B7280] hover:text-white cursor-pointer"
        >
          <RotateCcw className="w-2.5 h-2.5" />
        </button>
      </div>

      <div
        ref={wheelRef}
        role="slider"
        tabIndex={0}
        aria-label={`${label} Color Wheel`}
        aria-valuetext={`X ${value.x.toFixed(2)}, Y ${value.y.toFixed(2)}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          updateFromPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (dragging) updateFromPointer(e.clientX, e.clientY);
        }}
        onPointerUp={() => setDragging(false)}
        onDoubleClick={() => onChange({ ...value, x: 0, y: 0 })}
        className="relative w-[78px] h-[78px] rounded-full border border-[#2D313B] cursor-crosshair select-none touch-none"
        style={{
          background:
            'radial-gradient(circle at center, rgba(28,30,36,0.92) 0%, rgba(28,30,36,0.35) 55%, rgba(0,0,0,0) 100%), conic-gradient(from 90deg, #ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)',
        }}
      >
        {/* Crosshair */}
        <span className="absolute left-1/2 top-1 bottom-1 w-px bg-white/15 pointer-events-none" />
        <span className="absolute top-1/2 left-1 right-1 h-px bg-white/15 pointer-events-none" />
        {/* Puck */}
        <span
          className="absolute w-2.5 h-2.5 rounded-full border-2 border-white bg-[#111214] shadow -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            left: `${50 + value.x * 44}%`,
            top: `${50 + value.y * 44}%`,
          }}
        />
      </div>

      <input
        type="range"
        min={-1}
        max={1}
        step={0.02}
        value={value.luma}
        aria-label={`${label} Luminance`}
        onChange={(e) => onChange({ ...value, luma: Number(e.target.value) })}
        className="w-full studio-slider"
      />
    </div>
  );
};

interface ColorWheelsProps {
  lift: ColorWheelOffset;
  gamma: ColorWheelOffset;
  gain: ColorWheelOffset;
  onChange: (which: 'lift' | 'gamma' | 'gain', next: ColorWheelOffset) => void;
}

export const ColorWheels: React.FC<ColorWheelsProps> = ({
  lift,
  gamma,
  gain,
  onChange,
}) => {
  return (
    <div className="grid grid-cols-3 gap-2 py-1">
      <SingleColorWheel label="Shadows" value={lift} onChange={(v) => onChange('lift', v)} />
      <SingleColorWheel label="Midtones" value={gamma} onChange={(v) => onChange('gamma', v)} />
      <SingleColorWheel label="Highlights" value={gain} onChange={(v) => onChange('gain', v)} />
    </div>
  );
};

interface ToneCurveEditorProps {
  curves: {
    master: CurvePoint[];
    red: CurvePoint[];
    green: CurvePoint[];
    blue: CurvePoint[];
  };
  onChange: (channel: 'master' | 'red' | 'green' | 'blue', points: CurvePoint[]) => void;
}

export const ToneCurveEditor: React.FC<ToneCurveEditorProps> = ({ curves, onChange }) => {
  const [channel, setChannel] = useState<'master' | 'red' | 'green' | 'blue'>('master');
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const points = curves[channel];
  const sorted = [...points].sort((a, b) => a.x - b.x);

  const strokeMap = {
    master: '#E5E7EB',
    red: '#F87171',
    green: '#4ADE80',
    blue: '#60A5FA',
  };

  const toSvgCoords = (pt: CurvePoint) => ({
    cx: pt.x * 200,
    cy: (1 - pt.y) * 140,
  });

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activeIdx === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));

    const updated = points.map((p, idx) => {
      if (idx !== activeIdx) return p;
      // Keep first and last x locked to 0 and 1 if endpoint
      if (idx === 0) return { x: 0, y: Number(ny.toFixed(3)) };
      if (idx === points.length - 1) return { x: 1, y: Number(ny.toFixed(3)) };
      return {
        x: Number(Math.max(0.05, Math.min(0.95, nx)).toFixed(3)),
        y: Number(ny.toFixed(3)),
      };
    });
    onChange(channel, updated);
  };

  const pathD = sorted
    .map((p, i) => {
      const { cx, cy } = toSvgCoords(p);
      return `${i === 0 ? 'M' : 'L'} ${cx.toFixed(1)} ${cy.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-[#111215] p-0.5 rounded border border-[#24272F]">
          {(['master', 'red', 'green', 'blue'] as const).map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setChannel(ch)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-xs capitalize cursor-pointer ${
                channel === ch
                  ? 'bg-[#262B35] text-white'
                  : 'text-[#8E939E] hover:text-white'
              }`}
            >
              {ch === 'master' ? 'RGB' : ch}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange(channel, DEFAULT_CURVE.map((p) => ({ ...p })))}
          className="text-[10px] text-[#8E939E] hover:text-white cursor-pointer"
        >
          Reset Curve
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox="0 0 200 140"
        onPointerMove={handlePointerMove}
        onPointerUp={() => setActiveIdx(null)}
        onPointerLeave={() => setActiveIdx(null)}
        className="w-full h-36 bg-[#0D0E11] border border-[#262930] rounded touch-none select-none cursor-crosshair"
      >
        {/* Quadrant grid */}
        <line x1="50" y1="0" x2="50" y2="140" stroke="rgba(255,255,255,0.06)" />
        <line x1="100" y1="0" x2="100" y2="140" stroke="rgba(255,255,255,0.08)" />
        <line x1="150" y1="0" x2="150" y2="140" stroke="rgba(255,255,255,0.06)" />
        <line x1="0" y1="35" x2="200" y2="35" stroke="rgba(255,255,255,0.06)" />
        <line x1="0" y1="70" x2="200" y2="70" stroke="rgba(255,255,255,0.08)" />
        <line x1="0" y1="105" x2="200" y2="105" stroke="rgba(255,255,255,0.06)" />
        {/* Baseline diagonal */}
        <line x1="0" y1="140" x2="200" y2="0" stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />

        <path d={pathD} fill="none" stroke={strokeMap[channel]} strokeWidth="2" />

        {points.map((pt, idx) => {
          const { cx, cy } = toSvgCoords(pt);
          return (
            <circle
              key={idx}
              cx={cx}
              cy={cy}
              r={5}
              fill="#111214"
              stroke={strokeMap[channel]}
              strokeWidth="2"
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                setActiveIdx(idx);
              }}
            />
          );
        })}
      </svg>
    </div>
  );
};
