import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  computeAutoBalanceGrade,
  createDefaultColorGrade,
  DEFAULT_TRANSFORM,
  LUT_PRESETS,
} from '../engine/colorEngine';
import {
  BlendMode,
  ClipTransform,
  ColorGrade,
  LUTPresetId,
  ScopeData,
  TextOverlay,
  TimelineClip,
  TransitionType,
} from '../engine/types';
import { ColorWheels, ToneCurveEditor } from './ColorWheels';
import { ScopesPanel } from './ScopesPanel';

interface InspectorPanelProps {
  selectedClip: TimelineClip | null;
  scopes: ScopeData | null;
  copiedGrade: ColorGrade | null;
  defaultTab?: 'effects' | 'color' | 'text' | 'scopes';
  onUpdateClip: (clipId: string, updater: (clip: TimelineClip) => TimelineClip) => void;
  onChangeClipSpeed: (clipId: string, speed: number) => void;
  onCopyGrade: (grade: ColorGrade) => void;
  onPasteGrade: (clipId: string) => void;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  defaultValue?: number;
  onChange: (val: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  defaultValue = 0,
  onChange,
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-[11px]">
      <button
        type="button"
        onDoubleClick={() => onChange(defaultValue)}
        title="Double-click label to reset"
        className="text-[#A8AEB8] hover:text-white text-left cursor-pointer"
      >
        {label}
      </button>
      <span className="font-mono-tabular text-[#D1D5DB]">
        {step < 1 ? value.toFixed(2) : Math.round(value)}
        {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full studio-slider"
    />
  </div>
);

const CollapsibleSection: React.FC<{
  title: string;
  defaultOpen?: boolean;
  onReset?: () => void;
  children: React.ReactNode;
}> = ({ title, defaultOpen = true, onReset, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#23262E]">
      <div className="flex items-center justify-between px-3 py-2 bg-[#181A1F]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-[#D1D5DB] hover:text-white cursor-pointer"
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <span>{title}</span>
        </button>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            title={`Reset ${title}`}
            aria-label={`Reset ${title}`}
            className="text-[#7D838F] hover:text-white cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>
      {open && <div className="px-3 py-2.5 space-y-2.5 bg-[#141519]">{children}</div>}
    </div>
  );
};

const LUT_SWATCHES: Record<LUTPresetId, string> = {
  none: 'linear-gradient(135deg, #374151, #1f2937)',
  'kodak-2383': 'linear-gradient(135deg, #d97706, #1e3a8a)',
  'teal-orange': 'linear-gradient(135deg, #0d9488, #ea580c)',
  'fuji-eterna': 'linear-gradient(135deg, #4b5563, #065f46)',
  'monochrome-noir': 'linear-gradient(135deg, #e5e7eb, #111827)',
  'bleach-bypass': 'linear-gradient(135deg, #9ca3af, #0f172a)',
  'golden-hour': 'linear-gradient(135deg, #f59e0b, #78350f)',
};

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  selectedClip,
  scopes,
  copiedGrade,
  defaultTab = 'color',
  onUpdateClip,
  onChangeClipSpeed,
  onCopyGrade,
  onPasteGrade,
}) => {
  const [tab, setTab] = useState<'effects' | 'color' | 'text' | 'scopes'>(defaultTab);

  const effectiveTab =
    selectedClip?.kind === 'title' && tab === 'color' ? 'text' : tab;

  const updateColor = (patch: Partial<ColorGrade>) => {
    if (!selectedClip) return;
    onUpdateClip(selectedClip.id, (c) => ({
      ...c,
      color: { ...c.color, ...patch },
    }));
  };

  const updateTransform = (patch: Partial<ClipTransform>) => {
    if (!selectedClip) return;
    onUpdateClip(selectedClip.id, (c) => ({
      ...c,
      transform: { ...c.transform, ...patch },
    }));
  };

  const updateText = (patch: Partial<TextOverlay>) => {
    if (!selectedClip || !selectedClip.textOverlay) return;
    onUpdateClip(selectedClip.id, (c) => ({
      ...c,
      textOverlay: c.textOverlay ? { ...c.textOverlay, ...patch } : undefined,
    }));
  };

  return (
    <aside
      aria-label="Clip Inspector and Lumetri Color"
      className="flex flex-col h-full bg-[#16171B] border-l border-[#262930] select-none overflow-hidden"
    >
      {/* Inspector Tabs */}
      <div className="h-9 px-2 bg-[#18191E] border-b border-[#24272E] flex items-center gap-1 shrink-0 overflow-x-auto">
        {(
          [
            { id: 'color', label: 'Lumetri Color' },
            { id: 'effects', label: 'Effect Controls' },
            { id: 'text', label: 'Graphics' },
            { id: 'scopes', label: 'Scopes' },
          ] as const
        ).map((t) => {
          const active = effectiveTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#282C36] text-white'
                  : 'text-[#8E939E] hover:text-[#D1D5DB]'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Selected Clip Header */}
      <div className="px-3 py-2 border-b border-[#23262E] bg-[#141518] flex items-center justify-between gap-2 shrink-0">
        {selectedClip ? (
          <>
            <span className="text-[11px] font-medium text-[#E5E7EB] truncate">
              {selectedClip.name}
            </span>
            <span className="text-[10px] font-mono-tabular text-[#7D838F] uppercase shrink-0">
              {selectedClip.kind}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-[#6B7280]">
            Select a clip on the timeline to inspect
          </span>
        )}
      </div>

      {/* Inspector Body */}
      <div className="flex-1 overflow-y-auto">
        {effectiveTab === 'scopes' && (
          <div className="p-3 space-y-3">
            <ScopesPanel scopes={scopes} />
            <div className="text-[11px] text-[#8E939E] leading-relaxed">
              Live signal scopes sampled directly from the rendered Program Monitor composite frame.
            </div>
          </div>
        )}

        {!selectedClip && effectiveTab !== 'scopes' && (
          <div className="p-6 text-center text-[12px] text-[#6B7280]">
            Click any video, photo, audio, or title clip in the timeline to adjust its parameters.
          </div>
        )}

        {selectedClip && effectiveTab === 'color' && (
          <div>
            {/* Quick Color Action Strip: Auto Balance + Copy/Paste Grade */}
            <div className="px-3 py-2 border-b border-[#23262E] bg-[#14151A] flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onUpdateClip(selectedClip.id, (c) => ({
                    ...c,
                    color: computeAutoBalanceGrade(scopes, c.color),
                  }))
                }
                title="Automatically balance exposure and contrast from frame histogram"
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded cursor-pointer whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>Auto Balance</span>
              </button>
              <button
                type="button"
                onClick={() => onCopyGrade(selectedClip.color)}
                title="Copy Color Grade"
                aria-label="Copy Grade"
                className="px-2 py-1.5 text-[11px] font-medium text-[#C7CBD4] hover:text-white bg-[#1E2128] border border-[#2C303A] rounded cursor-pointer flex items-center gap-1 whitespace-nowrap"
              >
                <ClipboardCopy className="w-3 h-3" />
                <span>Copy</span>
              </button>
              <button
                type="button"
                disabled={!copiedGrade}
                onClick={() => onPasteGrade(selectedClip.id)}
                title="Paste Copied Grade to Clip"
                aria-label="Paste Grade"
                className="px-2 py-1.5 text-[11px] font-medium text-[#C7CBD4] hover:text-white disabled:opacity-35 disabled:pointer-events-none bg-[#1E2128] border border-[#2C303A] rounded cursor-pointer flex items-center gap-1 whitespace-nowrap"
              >
                <ClipboardPaste className="w-3 h-3" />
                <span>Paste</span>
              </button>
            </div>

            <CollapsibleSection
              title="Creative LUTs"
              defaultOpen
              onReset={() => updateColor({ lut: 'none', lutIntensity: 100 })}
            >
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-1.5">
                  {LUT_PRESETS.slice(0, 4).map((lut) => {
                    const active = selectedClip.color.lut === lut.id;
                    return (
                      <button
                        key={lut.id}
                        type="button"
                        onClick={() => updateColor({ lut: lut.id })}
                        title={lut.name}
                        className={`p-1 rounded border text-left cursor-pointer transition-colors ${
                          active
                            ? 'border-[#3B82F6] bg-[#222834]'
                            : 'border-[#252830] bg-[#111215] hover:border-[#3D424F]'
                        }`}
                      >
                        <div
                          className="h-4 w-full rounded-xs mb-1"
                          style={{ background: LUT_SWATCHES[lut.id] }}
                        />
                        <div className="text-[9px] text-[#D1D5DB] truncate">
                          {lut.id === 'none' ? 'Neutral' : lut.name.split(' ')[0]}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <select
                  aria-label="Color LUT Preset"
                  value={selectedClip.color.lut}
                  onChange={(e) => updateColor({ lut: e.target.value as LUTPresetId })}
                  className="w-full bg-[#0E0F12] border border-[#282B33] rounded px-2.5 py-1.5 text-[12px] text-[#E5E7EB] focus:outline-none focus:border-[#3B82F6] cursor-pointer"
                >
                  {LUT_PRESETS.map((lut) => (
                    <option key={lut.id} value={lut.id}>
                      {lut.name}
                    </option>
                  ))}
                </select>
                <SliderRow
                  label="LUT Intensity"
                  value={selectedClip.color.lutIntensity}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={100}
                  onChange={(v) => updateColor({ lutIntensity: v })}
                />
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Basic Correction"
              defaultOpen
              onReset={() =>
                updateColor({
                  temperature: 0,
                  tint: 0,
                  exposure: 0,
                  contrast: 0,
                  highlights: 0,
                  shadows: 0,
                  whites: 0,
                  blacks: 0,
                  saturation: 0,
                  vibrance: 0,
                })
              }
            >
              <SliderRow
                label="Temperature"
                value={selectedClip.color.temperature}
                min={-100}
                max={100}
                onChange={(v) => updateColor({ temperature: v })}
              />
              <SliderRow
                label="Tint"
                value={selectedClip.color.tint}
                min={-100}
                max={100}
                onChange={(v) => updateColor({ tint: v })}
              />
              <div className="h-px bg-[#22252C] my-1" />
              <SliderRow
                label="Exposure"
                value={selectedClip.color.exposure}
                min={-2.5}
                max={2.5}
                step={0.05}
                unit=" EV"
                onChange={(v) => updateColor({ exposure: v })}
              />
              <SliderRow
                label="Contrast"
                value={selectedClip.color.contrast}
                min={-100}
                max={100}
                onChange={(v) => updateColor({ contrast: v })}
              />
              <SliderRow
                label="Highlights"
                value={selectedClip.color.highlights}
                min={-100}
                max={100}
                onChange={(v) => updateColor({ highlights: v })}
              />
              <SliderRow
                label="Shadows"
                value={selectedClip.color.shadows}
                min={-100}
                max={100}
                onChange={(v) => updateColor({ shadows: v })}
              />
              <SliderRow
                label="Whites"
                value={selectedClip.color.whites}
                min={-100}
                max={100}
                onChange={(v) => updateColor({ whites: v })}
              />
              <SliderRow
                label="Blacks"
                value={selectedClip.color.blacks}
                min={-100}
                max={100}
                onChange={(v) => updateColor({ blacks: v })}
              />
              <div className="h-px bg-[#22252C] my-1" />
              <SliderRow
                label="Vibrance"
                value={selectedClip.color.vibrance}
                min={-100}
                max={100}
                onChange={(v) => updateColor({ vibrance: v })}
              />
              <SliderRow
                label="Saturation"
                value={selectedClip.color.saturation}
                min={-100}
                max={100}
                onChange={(v) => updateColor({ saturation: v })}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Color Wheels"
              defaultOpen={false}
              onReset={() =>
                updateColor({
                  lift: { x: 0, y: 0, luma: 0 },
                  gamma: { x: 0, y: 0, luma: 0 },
                  gain: { x: 0, y: 0, luma: 0 },
                })
              }
            >
              <ColorWheels
                lift={selectedClip.color.lift}
                gamma={selectedClip.color.gamma}
                gain={selectedClip.color.gain}
                onChange={(which, next) => updateColor({ [which]: next })}
              />
            </CollapsibleSection>

            <CollapsibleSection title="RGB Tone Curves" defaultOpen={false}>
              <ToneCurveEditor
                curves={selectedClip.color.curves}
                onChange={(ch, pts) =>
                  updateColor({
                    curves: { ...selectedClip.color.curves, [ch]: pts },
                  })
                }
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Vignette & Film Grain"
              defaultOpen={false}
              onReset={() => updateColor({ vignette: 0, grain: 0 })}
            >
              <SliderRow
                label="Vignette"
                value={selectedClip.color.vignette}
                min={-100}
                max={100}
                onChange={(v) => updateColor({ vignette: v })}
              />
              <SliderRow
                label="Film Grain"
                value={selectedClip.color.grain}
                min={0}
                max={100}
                onChange={(v) => updateColor({ grain: v })}
              />
            </CollapsibleSection>

            <div className="p-3">
              <button
                type="button"
                onClick={() =>
                  onUpdateClip(selectedClip.id, (c) => ({
                    ...c,
                    color: createDefaultColorGrade(),
                  }))
                }
                className="w-full py-1.5 text-[11px] font-medium text-[#C7CBD4] hover:text-white bg-[#1F222A] hover:bg-[#292D37] border border-[#2D313B] rounded cursor-pointer transition-colors"
              >
                Reset All Color Grading
              </button>
            </div>
          </div>
        )}

        {selectedClip && effectiveTab === 'effects' && (
          <div>
            <CollapsibleSection
              title="Motion & Transform"
              defaultOpen
              onReset={() => updateTransform({ ...DEFAULT_TRANSFORM })}
            >
              <div className="flex items-center gap-2 pb-1">
                <button
                  type="button"
                  onClick={() => updateTransform({ flipH: !selectedClip.transform.flipH })}
                  aria-pressed={Boolean(selectedClip.transform.flipH)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-[11px] rounded border cursor-pointer ${
                    selectedClip.transform.flipH
                      ? 'bg-[#252B36] border-[#3B82F6] text-white'
                      : 'bg-[#111215] border-[#262930] text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  <FlipHorizontal2 className="w-3 h-3" />
                  <span>Flip H</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateTransform({ flipV: !selectedClip.transform.flipV })}
                  aria-pressed={Boolean(selectedClip.transform.flipV)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-[11px] rounded border cursor-pointer ${
                    selectedClip.transform.flipV
                      ? 'bg-[#252B36] border-[#3B82F6] text-white'
                      : 'bg-[#111215] border-[#262930] text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  <FlipVertical2 className="w-3 h-3" />
                  <span>Flip V</span>
                </button>
              </div>
              <SliderRow
                label="Position X"
                value={selectedClip.transform.x}
                min={-640}
                max={640}
                unit=" px"
                onChange={(v) => updateTransform({ x: v })}
              />
              <SliderRow
                label="Position Y"
                value={selectedClip.transform.y}
                min={-360}
                max={360}
                unit=" px"
                onChange={(v) => updateTransform({ y: v })}
              />
              <SliderRow
                label="Scale"
                value={selectedClip.transform.scale}
                min={10}
                max={250}
                unit="%"
                defaultValue={100}
                onChange={(v) => updateTransform({ scale: v })}
              />
              <SliderRow
                label="Rotation"
                value={selectedClip.transform.rotation}
                min={-180}
                max={180}
                unit="°"
                onChange={(v) => updateTransform({ rotation: v })}
              />
              <SliderRow
                label="Ken Burns Push"
                value={selectedClip.transform.kenBurnsZoom}
                min={0}
                max={25}
                unit="%"
                onChange={(v) => updateTransform({ kenBurnsZoom: v })}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Transitions & Speed"
              defaultOpen
              onReset={() =>
                onUpdateClip(selectedClip.id, (c) => ({
                  ...c,
                  transitionIn: 'none',
                  transitionOut: 'none',
                  transitionDuration: 0.6,
                }))
              }
            >
              <div className="space-y-1">
                <span className="block text-[11px] text-[#A8AEB8]">Clip Speed</span>
                <div className="grid grid-cols-4 gap-1">
                  {[0.5, 1, 1.5, 2].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => onChangeClipSpeed(selectedClip.id, spd)}
                      className={`py-1 text-[11px] font-mono-tabular rounded border cursor-pointer ${
                        Math.abs((selectedClip.speed || 1) - spd) < 0.05
                          ? 'bg-[#262D3B] border-[#3B82F6] text-white'
                          : 'bg-[#101114] border-[#262930] text-[#9CA3AF] hover:text-white'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <label className="block text-[11px] text-[#A8AEB8]">In Transition</label>
                  <select
                    aria-label="In Transition"
                    value={selectedClip.transitionIn ?? 'none'}
                    onChange={(e) =>
                      onUpdateClip(selectedClip.id, (c) => ({
                        ...c,
                        transitionIn: e.target.value as TransitionType,
                      }))
                    }
                    className="w-full bg-[#0E0F12] border border-[#282B33] rounded px-2 py-1 text-[11px] text-[#E5E7EB]"
                  >
                    <option value="none">None</option>
                    <option value="cross-dissolve">Cross Dissolve</option>
                    <option value="dip-black">Dip to Black</option>
                    <option value="wipe-left">Wipe Left</option>
                    <option value="wipe-right">Wipe Right</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] text-[#A8AEB8]">Out Transition</label>
                  <select
                    aria-label="Out Transition"
                    value={selectedClip.transitionOut ?? 'none'}
                    onChange={(e) =>
                      onUpdateClip(selectedClip.id, (c) => ({
                        ...c,
                        transitionOut: e.target.value as TransitionType,
                      }))
                    }
                    className="w-full bg-[#0E0F12] border border-[#282B33] rounded px-2 py-1 text-[11px] text-[#E5E7EB]"
                  >
                    <option value="none">None</option>
                    <option value="cross-dissolve">Cross Dissolve</option>
                    <option value="dip-black">Dip to Black</option>
                  </select>
                </div>
              </div>

              <SliderRow
                label="Transition Duration"
                value={selectedClip.transitionDuration ?? 0.6}
                min={0.2}
                max={2.0}
                step={0.1}
                unit="s"
                defaultValue={0.6}
                onChange={(v) =>
                  onUpdateClip(selectedClip.id, (c) => ({ ...c, transitionDuration: v }))
                }
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Opacity & Blend"
              defaultOpen={false}
              onReset={() => updateTransform({ opacity: 100, blendMode: 'source-over' })}
            >
              <SliderRow
                label="Opacity"
                value={selectedClip.transform.opacity}
                min={0}
                max={100}
                unit="%"
                defaultValue={100}
                onChange={(v) => updateTransform({ opacity: v })}
              />
              <div className="space-y-1">
                <label className="block text-[11px] text-[#A8AEB8]">Blend Mode</label>
                <select
                  aria-label="Blend Mode"
                  value={selectedClip.transform.blendMode}
                  onChange={(e) => updateTransform({ blendMode: e.target.value as BlendMode })}
                  className="w-full bg-[#0E0F12] border border-[#282B33] rounded px-2.5 py-1.5 text-[12px] text-[#E5E7EB] cursor-pointer"
                >
                  <option value="source-over">Normal</option>
                  <option value="screen">Screen</option>
                  <option value="multiply">Multiply</option>
                  <option value="overlay">Overlay</option>
                  <option value="soft-light">Soft Light</option>
                </select>
              </div>
              <SliderRow
                label="Fade In"
                value={selectedClip.fadeIn}
                min={0}
                max={3}
                step={0.1}
                unit="s"
                onChange={(v) =>
                  onUpdateClip(selectedClip.id, (c) => ({ ...c, fadeIn: v }))
                }
              />
              <SliderRow
                label="Fade Out"
                value={selectedClip.fadeOut}
                min={0}
                max={3}
                step={0.1}
                unit="s"
                onChange={(v) =>
                  onUpdateClip(selectedClip.id, (c) => ({ ...c, fadeOut: v }))
                }
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Crop Edges"
              defaultOpen={false}
              onReset={() =>
                updateTransform({ cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 })
              }
            >
              <SliderRow
                label="Left"
                value={selectedClip.transform.cropLeft}
                min={0}
                max={45}
                unit="%"
                onChange={(v) => updateTransform({ cropLeft: v })}
              />
              <SliderRow
                label="Right"
                value={selectedClip.transform.cropRight}
                min={0}
                max={45}
                unit="%"
                onChange={(v) => updateTransform({ cropRight: v })}
              />
              <SliderRow
                label="Top"
                value={selectedClip.transform.cropTop}
                min={0}
                max={45}
                unit="%"
                onChange={(v) => updateTransform({ cropTop: v })}
              />
              <SliderRow
                label="Bottom"
                value={selectedClip.transform.cropBottom}
                min={0}
                max={45}
                unit="%"
                onChange={(v) => updateTransform({ cropBottom: v })}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Audio Gain" defaultOpen={selectedClip.kind === 'audio'}>
              <SliderRow
                label="Clip Gain"
                value={selectedClip.gainDb}
                min={-36}
                max={12}
                step={0.5}
                unit=" dB"
                onChange={(v) =>
                  onUpdateClip(selectedClip.id, (c) => ({ ...c, gainDb: v }))
                }
              />
            </CollapsibleSection>
          </div>
        )}

        {selectedClip && effectiveTab === 'text' && (
          <div className="p-3 space-y-3">
            {selectedClip.textOverlay ? (
              <>
                <div className="space-y-1">
                  <label className="block text-[11px] text-[#A8AEB8]">Primary Title</label>
                  <input
                    type="text"
                    value={selectedClip.textOverlay.text}
                    onChange={(e) => updateText({ text: e.target.value })}
                    className="w-full bg-[#0E0F12] border border-[#282B33] rounded px-2.5 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#3B82F6]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] text-[#A8AEB8]">Subtitle / Role</label>
                  <input
                    type="text"
                    value={selectedClip.textOverlay.subtitle}
                    onChange={(e) => updateText({ subtitle: e.target.value })}
                    className="w-full bg-[#0E0F12] border border-[#282B33] rounded px-2.5 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#3B82F6]"
                  />
                </div>
                <SliderRow
                  label="Font Size"
                  value={selectedClip.textOverlay.fontSize}
                  min={18}
                  max={84}
                  unit=" px"
                  defaultValue={36}
                  onChange={(v) => updateText({ fontSize: v })}
                />
                <SliderRow
                  label="Backdrop Opacity"
                  value={selectedClip.textOverlay.backgroundOpacity}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={80}
                  onChange={(v) => updateText({ backgroundOpacity: v })}
                />
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-[#A8AEB8]">Lower-Third Bar Layout</span>
                  <input
                    type="checkbox"
                    checked={selectedClip.textOverlay.lowerThird}
                    onChange={(e) => updateText({ lowerThird: e.target.checked })}
                    className="accent-[#3B82F6] cursor-pointer"
                  />
                </div>
              </>
            ) : (
              <p className="text-[12px] text-[#6B7280]">
                Select a Title clip on track V3 (or click &quot;Title&quot; in the Project Bin) to edit typography and lower-third graphics.
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
