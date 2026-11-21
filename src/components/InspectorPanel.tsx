import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
  FlipHorizontal2,
  FlipVertical2,
  PauseCircle,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  createDefaultColorGrade,
  DEFAULT_EFFECTS,
  DEFAULT_TRANSFORM,
  LUT_PRESETS,
} from '../engine/colorEngine';
import { getPiPLayoutTransform } from '../engine/timelineOps';
import {
  AudioTonePreset,
  BlendMode,
  ClipEffects,
  ClipTransform,
  ColorGrade,
  LUTPresetId,
  MotionPreset,
  PiPLayoutPreset,
  ScopeData,
  TextFontFamily,
  TextOverlay,
  TextStylePreset,
  TimelineClip,
  TransitionType,
} from '../engine/types';
import { ColorWheels, ToneCurveEditor } from './ColorWheels';
import { ScopesPanel } from './ScopesPanel';

interface InspectorPanelProps {
  selectedClip: TimelineClip | null;
  scopes: ScopeData | null;
  copiedGrade: ColorGrade | null;
  activeTab: 'effects' | 'color' | 'text' | 'scopes';
  onTabChange: (tab: 'effects' | 'color' | 'text' | 'scopes') => void;
  onUpdateClip: (clipId: string, updater: (clip: TimelineClip) => TimelineClip) => void;
  onAutoBalanceClip: (clipId: string) => void;
  onChangeClipSpeed: (clipId: string, speed: number) => void;
  onFreezeClip?: (clipId: string) => void;
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

const PIP_PRESETS: { id: PiPLayoutPreset; label: string }[] = [
  { id: 'full', label: 'Full' },
  { id: 'pip-tr', label: 'PiP R' },
  { id: 'pip-tl', label: 'PiP L' },
  { id: 'split-left', label: 'Split L' },
  { id: 'split-right', label: 'Split R' },
];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  selectedClip,
  scopes,
  copiedGrade,
  activeTab,
  onTabChange,
  onUpdateClip,
  onAutoBalanceClip,
  onChangeClipSpeed,
  onFreezeClip,
  onCopyGrade,
  onPasteGrade,
}) => {
  const effectiveTab =
    selectedClip?.kind === 'title' && activeTab === 'color' ? 'text' : activeTab;

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

  const updateEffects = (patch: Partial<ClipEffects>) => {
    if (!selectedClip) return;
    onUpdateClip(selectedClip.id, (c) => ({
      ...c,
      effects: { ...(c.effects ?? DEFAULT_EFFECTS), ...patch },
    }));
  };

  const updateText = (patch: Partial<TextOverlay>) => {
    if (!selectedClip || !selectedClip.textOverlay) return;
    onUpdateClip(selectedClip.id, (c) => ({
      ...c,
      textOverlay: c.textOverlay ? { ...c.textOverlay, ...patch } : undefined,
    }));
  };

  const applyTextPreset = (preset: TextStylePreset) => {
    if (preset === 'hero') {
      updateText({
        stylePreset: 'hero',
        lowerThird: false,
        fontSize: 44,
        fontWeight: 700,
        align: 'center',
        backgroundOpacity: 65,
        textShadow: true,
      });
    } else if (preset === 'lower-third') {
      updateText({
        stylePreset: 'lower-third',
        lowerThird: true,
        fontSize: 30,
        fontWeight: 700,
        align: 'left',
        backgroundOpacity: 82,
        textShadow: false,
      });
    } else if (preset === 'caption') {
      updateText({
        stylePreset: 'caption',
        lowerThird: false,
        fontSize: 28,
        fontWeight: 600,
        align: 'center',
        backgroundOpacity: 78,
        textShadow: true,
      });
    } else {
      updateText({
        stylePreset: 'tag',
        lowerThird: false,
        fontSize: 24,
        fontWeight: 600,
        align: 'center',
        backgroundOpacity: 90,
        textShadow: false,
      });
    }
  };

  const clipEffects = selectedClip?.effects ?? DEFAULT_EFFECTS;

  return (
    <aside
      aria-label="Clip Inspector"
      className="flex flex-col h-full bg-[#16171B] border-l border-[#262930] select-none overflow-hidden"
    >
      {/* Inspector Tabs */}
      <div className="h-9 px-2 bg-[#18191E] border-b border-[#24272E] grid grid-cols-4 gap-1 items-center shrink-0">
        {(
          [
            { id: 'color', label: 'Color' },
            { id: 'effects', label: 'Effects' },
            { id: 'text', label: 'Text' },
            { id: 'scopes', label: 'Scopes' },
          ] as const
        ).map((t) => {
          const active = effectiveTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={`py-1 text-[11px] font-medium rounded-xs transition-colors whitespace-nowrap cursor-pointer text-center ${
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
            Click a clip on the timeline to edit it
          </span>
        )}
      </div>

      {/* Inspector Body */}
      <div className="flex-1 overflow-y-auto">
        {effectiveTab === 'scopes' && (
          <div className="p-3 space-y-3">
            <ScopesPanel scopes={scopes} />
            <div className="text-[11px] text-[#8E939E] leading-relaxed">
              Live brightness and RGB color levels sampled from your current video preview.
            </div>
          </div>
        )}

        {!selectedClip && effectiveTab !== 'scopes' && (
          <div className="p-6 text-center text-[12px] text-[#6B7280]">
            Select any video, photo, audio, or text clip on the timeline to edit its settings.
          </div>
        )}

        {selectedClip && effectiveTab === 'color' && (
          <div>
            {/* Quick Color Action Strip: Auto Fix + Copy/Paste Grade */}
            <div className="px-3 py-2 border-b border-[#23262E] bg-[#14151A] flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onAutoBalanceClip(selectedClip.id)}
                title="Automatically fix brightness and contrast"
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded cursor-pointer whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>Auto Fix Color</span>
              </button>
              <button
                type="button"
                onClick={() => onCopyGrade(selectedClip.color)}
                title="Copy Color Settings"
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
                title="Paste Copied Color Settings"
                aria-label="Paste Grade"
                className="px-2 py-1.5 text-[11px] font-medium text-[#C7CBD4] hover:text-white disabled:opacity-35 disabled:pointer-events-none bg-[#1E2128] border border-[#2C303A] rounded cursor-pointer flex items-center gap-1 whitespace-nowrap"
              >
                <ClipboardPaste className="w-3 h-3" />
                <span>Paste</span>
              </button>
            </div>

            <CollapsibleSection
              title="Color Looks (Presets)"
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
                          {lut.shortName}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <select
                  aria-label="Color Look Preset"
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
                  label="Look Strength"
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
              title="Light & Color"
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
                  sharpness: 0,
                })
              }
            >
              <SliderRow
                label="Warmth"
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
                label="Brightness (Exposure)"
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
              <SliderRow
                label="Clarity / Sharpness"
                value={selectedClip.color.sharpness}
                min={0}
                max={100}
                onChange={(v) => updateColor({ sharpness: v })}
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

            <CollapsibleSection title="Tone Curves" defaultOpen={false}>
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
              title="Dark Edges & Grain"
              defaultOpen={false}
              onReset={() => updateColor({ vignette: 0, grain: 0 })}
            >
              <SliderRow
                label="Dark Edges (Vignette)"
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
                Reset All Color
              </button>
            </div>
          </div>
        )}

        {selectedClip && effectiveTab === 'effects' && (
          <div>
            {/* Quick Split Screen & PiP Layouts */}
            <CollapsibleSection
              title="Screen Layout & Split Screen"
              defaultOpen
              onReset={() => updateTransform({ ...DEFAULT_TRANSFORM })}
            >
              <div className="grid grid-cols-5 gap-1">
                {PIP_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, (c) => ({
                        ...c,
                        transform: getPiPLayoutTransform(p.id, c.transform),
                      }))
                    }
                    className="py-1 text-[10px] font-medium text-[#D1D5DB] hover:text-white bg-[#101114] hover:bg-[#262D3B] border border-[#262930] rounded cursor-pointer whitespace-nowrap"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => updateTransform({ flipH: !selectedClip.transform.flipH })}
                  aria-pressed={Boolean(selectedClip.transform.flipH)}
                  className={`flex-1 flex items-center justify-center gap-1 py-1 text-[11px] rounded border cursor-pointer ${
                    selectedClip.transform.flipH
                      ? 'bg-[#252B36] border-[#3B82F6] text-white'
                      : 'bg-[#111215] border-[#262930] text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  <FlipHorizontal2 className="w-3 h-3" />
                  <span>Flip L/R</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateTransform({ flipV: !selectedClip.transform.flipV })}
                  aria-pressed={Boolean(selectedClip.transform.flipV)}
                  className={`flex-1 flex items-center justify-center gap-1 py-1 text-[11px] rounded border cursor-pointer ${
                    selectedClip.transform.flipV
                      ? 'bg-[#252B36] border-[#3B82F6] text-white'
                      : 'bg-[#111215] border-[#262930] text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  <FlipVertical2 className="w-3 h-3" />
                  <span>Flip U/D</span>
                </button>
              </div>
              <SliderRow
                label="Move Left / Right"
                value={selectedClip.transform.x}
                min={-640}
                max={640}
                unit=" px"
                onChange={(v) => updateTransform({ x: v })}
              />
              <SliderRow
                label="Move Up / Down"
                value={selectedClip.transform.y}
                min={-360}
                max={360}
                unit=" px"
                onChange={(v) => updateTransform({ y: v })}
              />
              <SliderRow
                label="Zoom Size"
                value={selectedClip.transform.scale}
                min={10}
                max={250}
                unit="%"
                defaultValue={100}
                onChange={(v) => updateTransform({ scale: v })}
              />
              <SliderRow
                label="Rotate"
                value={selectedClip.transform.rotation}
                min={-180}
                max={180}
                unit="°"
                onChange={(v) => updateTransform({ rotation: v })}
              />
              <div className="space-y-1 pt-0.5">
                <label className="block text-[11px] text-[#A8AEB8]">Camera Motion</label>
                <select
                  aria-label="Camera Motion Preset"
                  value={selectedClip.transform.motionPreset ?? 'none'}
                  onChange={(e) =>
                    updateTransform({ motionPreset: e.target.value as MotionPreset })
                  }
                  className="w-full bg-[#0E0F12] border border-[#282B33] rounded px-2 py-1 text-[11px] text-[#E5E7EB] cursor-pointer"
                >
                  <option value="none">Static (None)</option>
                  <option value="zoom-in">Slow Zoom In</option>
                  <option value="zoom-out">Slow Zoom Out</option>
                  <option value="pan-left">Pan Left → Right</option>
                  <option value="pan-right">Pan Right → Left</option>
                </select>
              </div>
              <SliderRow
                label="Extra Smooth Zoom"
                value={selectedClip.transform.kenBurnsZoom}
                min={0}
                max={25}
                unit="%"
                onChange={(v) => updateTransform({ kenBurnsZoom: v })}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Visual Filters & Blur"
              defaultOpen
              onReset={() => updateEffects({ ...DEFAULT_EFFECTS })}
            >
              <SliderRow
                label="Background Blur"
                value={clipEffects.blur}
                min={0}
                max={20}
                step={0.5}
                unit=" px"
                onChange={(v) => updateEffects({ blur: v })}
              />
              <SliderRow
                label="Soft Glow"
                value={clipEffects.glow}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => updateEffects({ glow: v })}
              />
              <SliderRow
                label="Sepia Warmth"
                value={clipEffects.sepia}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => updateEffects({ sepia: v })}
              />
              <SliderRow
                label="Vintage Fade"
                value={clipEffects.vintageFade}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => updateEffects({ vintageFade: v })}
              />
              <SliderRow
                label="Rounded Corners"
                value={clipEffects.cornerRadius}
                min={0}
                max={80}
                unit=" px"
                onChange={(v) => updateEffects({ cornerRadius: v })}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Speed & Transitions"
              defaultOpen
              onReset={() =>
                onUpdateClip(selectedClip.id, (c) => ({
                  ...c,
                  reversed: false,
                  transitionIn: 'none',
                  transitionOut: 'none',
                  transitionDuration: 0.6,
                }))
              }
            >
              <div className="space-y-1.5">
                <span className="block text-[11px] text-[#A8AEB8]">Playback Speed</span>
                <div className="grid grid-cols-5 gap-1">
                  {[0.25, 0.5, 1, 1.5, 2].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => onChangeClipSpeed(selectedClip.id, spd)}
                      className={`py-1 text-[10px] font-mono-tabular rounded border cursor-pointer ${
                        Math.abs((selectedClip.speed || 1) - spd) < 0.05
                          ? 'bg-[#262D3B] border-[#3B82F6] text-white'
                          : 'bg-[#101114] border-[#262930] text-[#9CA3AF] hover:text-white'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, (c) => ({ ...c, reversed: !c.reversed }))
                    }
                    aria-pressed={Boolean(selectedClip.reversed)}
                    className={`flex-1 py-1 text-[11px] rounded border cursor-pointer ${
                      selectedClip.reversed
                        ? 'bg-[#262D3B] border-[#3B82F6] text-white'
                        : 'bg-[#101114] border-[#262930] text-[#9CA3AF] hover:text-white'
                    }`}
                  >
                    Reverse Clip
                  </button>
                  {onFreezeClip && selectedClip.kind !== 'audio' && (
                    <button
                      type="button"
                      onClick={() => onFreezeClip(selectedClip.id)}
                      className="flex-1 flex items-center justify-center gap-1 py-1 text-[11px] rounded border bg-[#101114] border-[#262930] text-[#C7CBD4] hover:text-white cursor-pointer"
                    >
                      <PauseCircle className="w-3 h-3" />
                      <span>Freeze 3s</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <label className="block text-[11px] text-[#A8AEB8]">Enter Transition</label>
                  <select
                    aria-label="Enter Transition"
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
                    <option value="cross-dissolve">Smooth Fade</option>
                    <option value="dip-black">Fade from Black</option>
                    <option value="fade-white">Flash from White</option>
                    <option value="wipe-left">Wipe Left</option>
                    <option value="wipe-right">Wipe Right</option>
                    <option value="slide-left">Slide In Left</option>
                    <option value="slide-right">Slide In Right</option>
                    <option value="zoom-in">Zoom In</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] text-[#A8AEB8]">Exit Transition</label>
                  <select
                    aria-label="Exit Transition"
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
                    <option value="cross-dissolve">Smooth Fade</option>
                    <option value="dip-black">Fade to Black</option>
                    <option value="fade-white">Flash to White</option>
                    <option value="slide-left">Slide Out Left</option>
                    <option value="slide-right">Slide Out Right</option>
                  </select>
                </div>
              </div>

              <SliderRow
                label="Transition Length"
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
              title="Opacity & Blending"
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
                  <option value="screen">Lighten (Screen)</option>
                  <option value="multiply">Darken (Multiply)</option>
                  <option value="overlay">High Contrast (Overlay)</option>
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

            <CollapsibleSection title="Clip Volume" defaultOpen={selectedClip.kind === 'audio'}>
              <SliderRow
                label="Volume Level"
                value={selectedClip.gainDb}
                min={-36}
                max={12}
                step={0.5}
                unit=" dB"
                onChange={(v) =>
                  onUpdateClip(selectedClip.id, (c) => ({ ...c, gainDb: v }))
                }
              />
              {selectedClip.kind === 'audio' && (
                <div className="space-y-1">
                  <label className="block text-[11px] text-[#A8AEB8]">Audio Tone Preset</label>
                  <select
                    aria-label="Audio Tone Preset"
                    value={selectedClip.audioTone ?? 'normal'}
                    onChange={(e) =>
                      onUpdateClip(selectedClip.id, (c) => ({
                        ...c,
                        audioTone: e.target.value as AudioTonePreset,
                      }))
                    }
                    className="w-full bg-[#0E0F12] border border-[#282B33] rounded px-2 py-1 text-[11px] text-[#E5E7EB]"
                  >
                    <option value="normal">Natural</option>
                    <option value="voice">Clear Voice</option>
                    <option value="warm-bass">Warm Bass</option>
                    <option value="radio">Lo-Fi Radio</option>
                  </select>
                </div>
              )}
            </CollapsibleSection>
          </div>
        )}

        {selectedClip && effectiveTab === 'text' && (
          <div className="p-3 space-y-3">
            {selectedClip.textOverlay ? (
              <>
                <div className="space-y-1">
                  <span className="block text-[11px] text-[#A8AEB8]">Text Style Preset</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'hero', label: 'Hero Title' },
                        { id: 'lower-third', label: 'Lower Third' },
                        { id: 'caption', label: 'Subtitles' },
                        { id: 'tag', label: 'Minimal Tag' },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => applyTextPreset(st.id)}
                        className={`py-1 text-[11px] rounded border cursor-pointer ${
                          selectedClip.textOverlay?.stylePreset === st.id
                            ? 'bg-[#262D3B] border-[#3B82F6] text-white'
                            : 'bg-[#101114] border-[#262930] text-[#C7CBD4] hover:text-white'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] text-[#A8AEB8]">Heading Text</label>
                  <input
                    type="text"
                    value={selectedClip.textOverlay.text}
                    onChange={(e) => updateText({ text: e.target.value })}
                    className="w-full bg-[#0E0F12] border border-[#282B33] rounded px-2.5 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#3B82F6]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] text-[#A8AEB8]">Subheading / Role</label>
                  <input
                    type="text"
                    value={selectedClip.textOverlay.subtitle}
                    onChange={(e) => updateText({ subtitle: e.target.value })}
                    className="w-full bg-[#0E0F12] border border-[#282B33] rounded px-2.5 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#3B82F6]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[11px] text-[#A8AEB8]">Font Style</label>
                    <select
                      aria-label="Text Font Style"
                      value={selectedClip.textOverlay.fontFamily ?? 'sans'}
                      onChange={(e) =>
                        updateText({ fontFamily: e.target.value as TextFontFamily })
                      }
                      className="w-full bg-[#0E0F12] border border-[#282B33] rounded px-2 py-1 text-[11px] text-white"
                    >
                      <option value="sans">Modern Sans</option>
                      <option value="serif">Editorial Serif</option>
                      <option value="mono">Typewriter Mono</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] text-[#A8AEB8]">Align</label>
                    <select
                      aria-label="Text Alignment"
                      value={selectedClip.textOverlay.align}
                      onChange={(e) =>
                        updateText({ align: e.target.value as 'left' | 'center' | 'right' })
                      }
                      className="w-full bg-[#0E0F12] border border-[#282B33] rounded px-2 py-1 text-[11px] text-white"
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center justify-between bg-[#0E0F12] border border-[#282B33] rounded px-2 py-1 text-[11px] text-[#A8AEB8]">
                    <span>Text Color</span>
                    <input
                      type="color"
                      value={selectedClip.textOverlay.color}
                      onChange={(e) => updateText({ color: e.target.value })}
                      className="w-5 h-5 bg-transparent border-0 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between bg-[#0E0F12] border border-[#282B33] rounded px-2 py-1 text-[11px] text-[#A8AEB8]">
                    <span>Box Color</span>
                    <input
                      type="color"
                      value={selectedClip.textOverlay.backgroundColor}
                      onChange={(e) => updateText({ backgroundColor: e.target.value })}
                      className="w-5 h-5 bg-transparent border-0 cursor-pointer"
                    />
                  </label>
                </div>
                <SliderRow
                  label="Text Size"
                  value={selectedClip.textOverlay.fontSize}
                  min={18}
                  max={84}
                  unit=" px"
                  defaultValue={36}
                  onChange={(v) => updateText({ fontSize: v })}
                />
                <SliderRow
                  label="Box Opacity"
                  value={selectedClip.textOverlay.backgroundOpacity}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={80}
                  onChange={(v) => updateText({ backgroundOpacity: v })}
                />
                <label className="flex items-center justify-between pt-1 cursor-pointer">
                  <span className="text-[11px] text-[#A8AEB8]">Text Drop Shadow</span>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedClip.textOverlay.textShadow)}
                    onChange={(e) => updateText({ textShadow: e.target.checked })}
                    className="accent-[#3B82F6] cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between pt-1 cursor-pointer">
                  <span className="text-[11px] text-[#A8AEB8]">Lower-Third Side Bar</span>
                  <input
                    type="checkbox"
                    checked={selectedClip.textOverlay.lowerThird}
                    onChange={(e) => updateText({ lowerThird: e.target.checked })}
                    className="accent-[#3B82F6] cursor-pointer"
                  />
                </label>
              </>
            ) : (
              <p className="text-[12px] text-[#6B7280]">
                Select a Text clip on the timeline (or click &quot;+ Title&quot; / &quot;+ Caption&quot; in Media Library) to edit text styles.
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
