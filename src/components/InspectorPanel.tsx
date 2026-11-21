import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
  Diamond,
  Eye,
  EyeOff,
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
  EFFECT_PRESETS,
  LUT_PRESETS,
} from '../engine/colorEngine';
import {
  evaluateKeyframeValue,
  getPiPLayoutTransform,
  setClipKeyframeValue,
  toggleClipKeyframe,
} from '../engine/timelineOps';
import {
  AudioTonePreset,
  BlendMode,
  ClipEffects,
  ClipLabelColor,
  ClipTransform,
  ColorGrade,
  KeyframeProperty,
  LUTPresetId,
  MaskShape,
  MirrorEffectMode,
  MotionPreset,
  PiPLayoutPreset,
  ScopeData,
  TextAnimationPreset,
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
  currentTime?: number;
  scopes: ScopeData | null;
  copiedGrade: ColorGrade | null;
  copiedEffects?: ClipEffects | null;
  activeTab: 'effects' | 'color' | 'text' | 'scopes';
  onTabChange: (tab: 'effects' | 'color' | 'text' | 'scopes') => void;
  onSeek?: (time: number) => void;
  onUpdateClip: (clipId: string, updater: (clip: TimelineClip) => TimelineClip) => void;
  onToggleClipDisabled?: (clipId: string) => void;
  onAutoBalanceClip: (clipId: string) => void;
  onChangeClipSpeed: (clipId: string, speed: number) => void;
  onFreezeClip?: (clipId: string) => void;
  onCopyGrade: (grade: ColorGrade) => void;
  onPasteGrade: (clipId: string) => void;
  onCopyEffects?: (effects: ClipEffects) => void;
  onPasteEffects?: (clipId: string) => void;
  onApplyGradeToAll?: (grade: ColorGrade) => void;
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
  keyframeCount?: number;
  hasKeyframeHere?: boolean;
  onToggleKeyframe?: () => void;
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
  keyframeCount = 0,
  hasKeyframeHere = false,
  onToggleKeyframe,
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-[11px] gap-1">
      <div className="flex items-center gap-1 min-w-0">
        {onToggleKeyframe && (
          <button
            type="button"
            onClick={onToggleKeyframe}
            title={
              hasKeyframeHere
                ? `Remove Keyframe on ${label}`
                : keyframeCount > 0
                ? `Add Keyframe on ${label} (${keyframeCount} active)`
                : `Animate ${label} (Add Keyframe)`
            }
            aria-label={`Keyframe ${label}`}
            aria-pressed={hasKeyframeHere || keyframeCount > 0}
            className={`p-0.5 rounded-xs cursor-pointer transition-colors shrink-0 ${
              hasKeyframeHere
                ? 'text-[#F59E0B] bg-[#F59E0B]/15'
                : keyframeCount > 0
                ? 'text-[#60A5FA]'
                : 'text-[#6B7280] hover:text-white'
            }`}
          >
            <Diamond className="w-2.5 h-2.5 fill-current" />
          </button>
        )}
        <button
          type="button"
          onDoubleClick={() => onChange(defaultValue)}
          title="Double-click label to reset"
          className="text-[#A8AEB8] hover:text-white text-left cursor-pointer truncate"
        >
          {label}
        </button>
      </div>
      <span className="font-mono-tabular text-[#D1D5DB] shrink-0">
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
  'cyberpunk-neon': 'linear-gradient(135deg, #ec4899, #06b6d4)',
  'pastel-dream': 'linear-gradient(135deg, #fbcfe8, #93c5fd)',
  'vintage-polaroid': 'linear-gradient(135deg, #fde68a, #047857)',
  'emerald-forest': 'linear-gradient(135deg, #10b981, #064e3b)',
};

const PIP_PRESETS: { id: PiPLayoutPreset; label: string }[] = [
  { id: 'full', label: 'Full Screen' },
  { id: 'pip-tr', label: 'Corner Right' },
  { id: 'pip-tl', label: 'Corner Left' },
  { id: 'pip-circle', label: 'Circle Facecam' },
  { id: 'split-left', label: 'Split Left' },
  { id: 'split-right', label: 'Split Right' },
];

const QUICK_TRANSITIONS: { id: TransitionType; label: string }[] = [
  { id: 'cross-dissolve', label: 'Fade' },
  { id: 'dip-black', label: 'Black' },
  { id: 'iris-circle', label: 'Circle' },
  { id: 'split-open', label: 'Curtain' },
  { id: 'spin-in', label: 'Spin' },
  { id: 'zoom-in', label: 'Zoom' },
  { id: 'flash-blur', label: 'Flash' },
];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  selectedClip,
  currentTime = 0,
  scopes,
  copiedGrade,
  copiedEffects,
  activeTab,
  onTabChange,
  onSeek,
  onUpdateClip,
  onToggleClipDisabled,
  onAutoBalanceClip,
  onChangeClipSpeed,
  onFreezeClip,
  onCopyGrade,
  onPasteGrade,
  onCopyEffects,
  onPasteEffects,
  onApplyGradeToAll,
}) => {
  const effectiveTab =
    selectedClip?.kind === 'title' && activeTab === 'color' ? 'text' : activeTab;

  const clipLocalTime = selectedClip
    ? Math.max(0, Math.min(selectedClip.duration, Number((currentTime - selectedClip.startTime).toFixed(3))))
    : 0;

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

  const updateAnimatedTransformProp = (prop: KeyframeProperty, value: number) => {
    if (!selectedClip) return;
    onUpdateClip(selectedClip.id, (c) => {
      const existingList = c.keyframes?.[prop] ?? [];
      const nextKfs =
        existingList.length > 0
          ? setClipKeyframeValue(c.keyframes, prop, clipLocalTime, value, 'ease')
          : c.keyframes;
      return {
        ...c,
        transform: { ...c.transform, [prop]: value },
        keyframes: nextKfs,
      };
    });
  };

  const handleToggleKf = (prop: KeyframeProperty) => {
    if (!selectedClip) return;
    const currentVal = evaluateKeyframeValue(
      selectedClip.keyframes?.[prop],
      clipLocalTime,
      selectedClip.transform[prop]
    );
    onUpdateClip(selectedClip.id, (c) => ({
      ...c,
      keyframes: toggleClipKeyframe(c.keyframes, prop, clipLocalTime, currentVal, 'ease'),
    }));
  };

  const getKfCount = (prop: KeyframeProperty) => selectedClip?.keyframes?.[prop]?.length ?? 0;
  const hasKfHere = (prop: KeyframeProperty) =>
    Boolean(selectedClip?.keyframes?.[prop]?.some((k) => Math.abs(k.time - clipLocalTime) < 0.06));
  const getAnimatedValue = (prop: KeyframeProperty) =>
    selectedClip
      ? evaluateKeyframeValue(selectedClip.keyframes?.[prop], clipLocalTime, selectedClip.transform[prop])
      : 0;

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
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center gap-1 pr-1" role="group" aria-label="Clip Color Label">
                {(
                  [
                    { id: 'default', bg: '#4B5563', label: 'Default Label' },
                    { id: 'cerulean', bg: '#3B82F6', label: 'Blue Label' },
                    { id: 'violet', bg: '#8B5CF6', label: 'Purple Label' },
                    { id: 'emerald', bg: '#10B981', label: 'Green Label' },
                    { id: 'amber', bg: '#F59E0B', label: 'Amber Label' },
                    { id: 'rose', bg: '#F43F5E', label: 'Rose Label' },
                  ] as { id: ClipLabelColor; bg: string; label: string }[]
                ).map((lbl) => (
                  <button
                    key={lbl.id}
                    type="button"
                    aria-label={lbl.label}
                    title={lbl.label}
                    onClick={() =>
                      onUpdateClip(selectedClip.id, (c) => ({ ...c, labelColor: lbl.id }))
                    }
                    className={`w-2.5 h-2.5 rounded-full cursor-pointer transition-transform ${
                      (selectedClip.labelColor ?? 'default') === lbl.id
                        ? 'ring-1.5 ring-white scale-115'
                        : 'opacity-65 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: lbl.bg }}
                  />
                ))}
              </div>
              {onToggleClipDisabled && (
                <button
                  type="button"
                  onClick={() => onToggleClipDisabled(selectedClip.id)}
                  title={selectedClip.disabled ? 'Enable Clip (E)' : 'Disable Clip (E)'}
                  aria-label={selectedClip.disabled ? 'Enable Selected Clip' : 'Disable Selected Clip'}
                  className={`p-1 rounded-xs cursor-pointer ${
                    selectedClip.disabled ? 'text-[#F59E0B]' : 'text-[#8E939E] hover:text-white'
                  }`}
                >
                  {selectedClip.disabled ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              )}
              <span className="text-[10px] font-mono-tabular text-[#7D838F] uppercase shrink-0">
                {selectedClip.kind}
              </span>
            </div>
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
            {/* Quick Color Action Strip: Auto Fix + Copy/Paste/Apply All */}
            <div className="px-3 py-2 border-b border-[#23262E] bg-[#14151A] flex items-center gap-1">
              <button
                type="button"
                onClick={() => onAutoBalanceClip(selectedClip.id)}
                title="Automatically fix brightness and contrast"
                className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded cursor-pointer whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>Auto Fix</span>
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
              {onApplyGradeToAll && (
                <button
                  type="button"
                  onClick={() => onApplyGradeToAll(selectedClip.color)}
                  title="Apply This Color Look to All Video & Photo Clips"
                  aria-label="Apply Look to All Clips"
                  className="px-2 py-1.5 text-[11px] font-medium text-[#93C5FD] hover:text-white bg-[#1E2128] border border-[#2C303A] rounded cursor-pointer whitespace-nowrap"
                >
                  Apply All
                </button>
              )}
            </div>

            <CollapsibleSection
              title="Color Looks (Presets)"
              defaultOpen
              onReset={() => updateColor({ lut: 'none', lutIntensity: 100 })}
            >
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-1.5">
                  {LUT_PRESETS.slice(0, 8).map((lut) => {
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
                  hueShift: 0,
                  dehaze: 0,
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
              <SliderRow
                label="Dehaze / Depth"
                value={selectedClip.color.dehaze ?? 0}
                min={-50}
                max={100}
                onChange={(v) => updateColor({ dehaze: v })}
              />
              <SliderRow
                label="Hue Shift"
                value={selectedClip.color.hueShift ?? 0}
                min={-180}
                max={180}
                unit="°"
                onChange={(v) => updateColor({ hueShift: v })}
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
              title="Split Toning (Shadow / Highlight Tint)"
              defaultOpen={false}
              onReset={() =>
                updateColor({
                  splitShadowHue: 210,
                  splitShadowSat: 0,
                  splitHighlightHue: 38,
                  splitHighlightSat: 0,
                })
              }
            >
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() =>
                    updateColor({
                      splitShadowHue: 195,
                      splitShadowSat: 45,
                      splitHighlightHue: 34,
                      splitHighlightSat: 48,
                    })
                  }
                  className="py-1 text-[10px] text-[#D1D5DB] hover:text-white bg-[#101114] border border-[#262930] rounded cursor-pointer"
                >
                  Teal &amp; Warm
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateColor({
                      splitShadowHue: 245,
                      splitShadowSat: 42,
                      splitHighlightHue: 46,
                      splitHighlightSat: 52,
                    })
                  }
                  className="py-1 text-[10px] text-[#D1D5DB] hover:text-white bg-[#101114] border border-[#262930] rounded cursor-pointer"
                >
                  Indigo &amp; Gold
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateColor({
                      splitShadowSat: 0,
                      splitHighlightSat: 0,
                    })
                  }
                  className="py-1 text-[10px] text-[#9CA3AF] hover:text-white bg-[#101114] border border-[#262930] rounded cursor-pointer"
                >
                  Clear Tint
                </button>
              </div>
              <SliderRow
                label="Shadow Tint Hue"
                value={selectedClip.color.splitShadowHue ?? 210}
                min={0}
                max={360}
                unit="°"
                defaultValue={210}
                onChange={(v) => updateColor({ splitShadowHue: v })}
              />
              <SliderRow
                label="Shadow Tint Amount"
                value={selectedClip.color.splitShadowSat ?? 0}
                min={0}
                max={100}
                unit="%"
                defaultValue={0}
                onChange={(v) => updateColor({ splitShadowSat: v })}
              />
              <SliderRow
                label="Highlight Tint Hue"
                value={selectedClip.color.splitHighlightHue ?? 38}
                min={0}
                max={360}
                unit="°"
                defaultValue={38}
                onChange={(v) => updateColor({ splitHighlightHue: v })}
              />
              <SliderRow
                label="Highlight Tint Amount"
                value={selectedClip.color.splitHighlightSat ?? 0}
                min={0}
                max={100}
                unit="%"
                defaultValue={0}
                onChange={(v) => updateColor({ splitHighlightSat: v })}
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
            {/* Quick Copy / Paste / Reset FX Strip */}
            <div className="px-3 py-2 border-b border-[#23262E] bg-[#14151A] flex items-center gap-1">
              {onCopyEffects && (
                <button
                  type="button"
                  onClick={() => onCopyEffects(clipEffects)}
                  title="Copy Effects & Filter Settings"
                  aria-label="Copy Effects"
                  className="flex-1 px-2 py-1.5 text-[11px] font-medium text-[#C7CBD4] hover:text-white bg-[#1E2128] border border-[#2C303A] rounded cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap"
                >
                  <ClipboardCopy className="w-3 h-3" />
                  <span>Copy FX</span>
                </button>
              )}
              {onPasteEffects && (
                <button
                  type="button"
                  disabled={!copiedEffects}
                  onClick={() => onPasteEffects(selectedClip.id)}
                  title="Paste Copied Effects to This Clip"
                  aria-label="Paste Effects"
                  className="flex-1 px-2 py-1.5 text-[11px] font-medium text-[#C7CBD4] hover:text-white disabled:opacity-35 disabled:pointer-events-none bg-[#1E2128] border border-[#2C303A] rounded cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap"
                >
                  <ClipboardPaste className="w-3 h-3" />
                  <span>Paste FX</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => updateEffects({ ...DEFAULT_EFFECTS })}
                title="Reset All Filters & Shape Masks"
                aria-label="Reset All Effects"
                className="px-2.5 py-1.5 text-[11px] font-medium text-[#9CA3AF] hover:text-white bg-[#1E2128] border border-[#2C303A] rounded cursor-pointer whitespace-nowrap"
              >
                Reset
              </button>
            </div>

            {/* One-Click Effect Looks */}
            <CollapsibleSection
              title="One-Click Effect Styles"
              defaultOpen
              onReset={() => updateEffects({ ...DEFAULT_EFFECTS })}
            >
              <div className="grid grid-cols-4 gap-1">
                {EFFECT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => updateEffects({ ...DEFAULT_EFFECTS, ...preset.patch })}
                    className="py-1.5 px-1 text-[10px] font-medium text-[#D1D5DB] hover:text-white bg-[#101114] hover:bg-[#262D3B] border border-[#262930] rounded cursor-pointer truncate"
                    title={`Apply ${preset.label} style`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </CollapsibleSection>

            {/* Quick Split Screen & PiP Layouts */}
            <CollapsibleSection
              title="Screen Layout & Shape Mask"
              defaultOpen
              onReset={() => {
                updateTransform({ ...DEFAULT_TRANSFORM });
                updateEffects({ maskShape: 'rect' });
              }}
            >
              <div className="grid grid-cols-3 gap-1">
                {PIP_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, (c) => {
                        const baseEffects = c.effects ?? DEFAULT_EFFECTS;
                        const nextEffects =
                          p.id === 'pip-circle'
                            ? {
                                ...baseEffects,
                                maskShape: 'circle' as MaskShape,
                                borderWidth: Math.max(baseEffects.borderWidth ?? 0, 4),
                              }
                            : p.id === 'full' && baseEffects.maskShape === 'circle'
                            ? { ...baseEffects, maskShape: 'rect' as MaskShape }
                            : baseEffects;
                        return {
                          ...c,
                          transform: getPiPLayoutTransform(p.id, c.transform),
                          effects: nextEffects,
                        };
                      })
                    }
                    className="py-1 text-[10px] font-medium text-[#D1D5DB] hover:text-white bg-[#101114] hover:bg-[#262D3B] border border-[#262930] rounded cursor-pointer whitespace-nowrap"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="space-y-1 pt-0.5">
                <span className="block text-[11px] text-[#A8AEB8]">Frame Shape (Mask)</span>
                <div className="grid grid-cols-4 gap-1">
                  {(
                    [
                      { id: 'rect', label: 'Box' },
                      { id: 'circle', label: 'Circle' },
                      { id: 'pill', label: 'Pill' },
                      { id: 'diamond', label: 'Diamond' },
                    ] as const
                  ).map((sh) => (
                    <button
                      key={sh.id}
                      type="button"
                      onClick={() => updateEffects({ maskShape: sh.id })}
                      aria-pressed={(clipEffects.maskShape ?? 'rect') === sh.id}
                      className={`py-1 text-[10px] font-medium rounded border cursor-pointer ${
                        (clipEffects.maskShape ?? 'rect') === sh.id
                          ? 'bg-[#252B36] border-[#3B82F6] text-white'
                          : 'bg-[#101114] border-[#262930] text-[#9CA3AF] hover:text-white'
                      }`}
                    >
                      {sh.label}
                    </button>
                  ))}
                </div>
                <div className="pt-1 space-y-1.5">
                  <SliderRow
                    label="Mask Feather (Soft Edge)"
                    value={clipEffects.maskFeather ?? 0}
                    min={0}
                    max={40}
                    unit=" px"
                    onChange={(v) => updateEffects({ maskFeather: v })}
                  />
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-[11px] text-[#A8AEB8]">Invert Mask Cutout</span>
                    <input
                      type="checkbox"
                      aria-label="Invert Mask Cutout"
                      checked={Boolean(clipEffects.maskInvert)}
                      onChange={(e) => updateEffects({ maskInvert: e.target.checked })}
                      className="accent-[#3B82F6] cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {selectedClip.kind === 'adjustment' && (
                <div className="px-2.5 py-2 bg-[#231D33] border border-[#5B3E9E]/50 rounded text-[11px] text-[#DDD6FE]">
                  Adjustment Layer active: all Color Looks and Visual Filters applied to this clip affect every track below it.
                </div>
              )}

              {selectedClip.kind === 'matte' && (
                <div className="p-2 bg-[#101115] border border-[#262930] rounded space-y-2">
                  <span className="block text-[11px] font-medium text-[#D1D5DB]">
                    Background Matte Colors
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center justify-between bg-[#0B0C0F] border border-[#262930] rounded px-2 py-1 text-[10px] text-[#A8AEB8]">
                      <span>Start</span>
                      <input
                        type="color"
                        aria-label="Matte Start Color"
                        value={selectedClip.matteColor ?? '#1e3a8a'}
                        onChange={(e) =>
                          onUpdateClip(selectedClip.id, (c) => ({ ...c, matteColor: e.target.value }))
                        }
                        className="w-5 h-5 bg-transparent border-0 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between bg-[#0B0C0F] border border-[#262930] rounded px-2 py-1 text-[10px] text-[#A8AEB8]">
                      <span>Gradient End</span>
                      <input
                        type="color"
                        aria-label="Matte End Color"
                        value={selectedClip.matteSecondaryColor ?? selectedClip.matteColor ?? '#0f172a'}
                        onChange={(e) =>
                          onUpdateClip(selectedClip.id, (c) => ({
                            ...c,
                            matteSecondaryColor: e.target.value,
                          }))
                        }
                        className="w-5 h-5 bg-transparent border-0 cursor-pointer"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { label: 'Midnight', c1: '#1e3a8a', c2: '#0f172a' },
                      { label: 'Sunset', c1: '#ea580c', c2: '#7c2d12' },
                      { label: 'Slate', c1: '#374151', c2: '#111827' },
                      { label: 'Chroma', c1: '#00b140', c2: '#00b140' },
                    ].map((swatch) => (
                      <button
                        key={swatch.label}
                        type="button"
                        onClick={() =>
                          onUpdateClip(selectedClip.id, (c) => ({
                            ...c,
                            matteColor: swatch.c1,
                            matteSecondaryColor: swatch.c2,
                          }))
                        }
                        className="py-1 text-[9px] text-[#D1D5DB] bg-[#181A20] hover:bg-[#252A34] border border-[#282B33] rounded cursor-pointer"
                      >
                        {swatch.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Motion Keyframe Timeline Header */}
              <div className="flex items-center justify-between px-2 py-1.5 bg-[#101115] border border-[#252830] rounded text-[10px]">
                <span className="text-[#9CA3AF]">
                  Keyframes @ <span className="font-mono-tabular text-white">{clipLocalTime.toFixed(2)}s</span>
                </span>
                <div className="flex items-center gap-1">
                  {onSeek && (
                    <>
                      <button
                        type="button"
                        title="Previous Keyframe"
                        aria-label="Jump to Previous Keyframe"
                        onClick={() => {
                          const allTimes = Array.from(
                            new Set(
                              Object.values(selectedClip.keyframes ?? {})
                                .flatMap((arr) => arr ?? [])
                                .map((k) => k.time)
                            )
                          ).sort((a, b) => a - b);
                          const prev = [...allTimes].reverse().find((t) => t < clipLocalTime - 0.05);
                          if (prev !== undefined) onSeek(selectedClip.startTime + prev);
                        }}
                        className="p-0.5 text-[#9CA3AF] hover:text-white cursor-pointer"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        title="Next Keyframe"
                        aria-label="Jump to Next Keyframe"
                        onClick={() => {
                          const allTimes = Array.from(
                            new Set(
                              Object.values(selectedClip.keyframes ?? {})
                                .flatMap((arr) => arr ?? [])
                                .map((k) => k.time)
                            )
                          ).sort((a, b) => a - b);
                          const next = allTimes.find((t) => t > clipLocalTime + 0.05);
                          if (next !== undefined) onSeek(selectedClip.startTime + next);
                        }}
                        className="p-0.5 text-[#9CA3AF] hover:text-white cursor-pointer"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, (c) => ({ ...c, keyframes: undefined }))
                    }
                    title="Clear All Motion Keyframes"
                    className="px-1.5 py-0.5 text-[9px] text-[#9CA3AF] hover:text-white bg-[#181A20] border border-[#282B33] rounded-xs cursor-pointer"
                  >
                    Clear KFs
                  </button>
                </div>
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
                value={getAnimatedValue('x')}
                min={-640}
                max={640}
                unit=" px"
                keyframeCount={getKfCount('x')}
                hasKeyframeHere={hasKfHere('x')}
                onToggleKeyframe={() => handleToggleKf('x')}
                onChange={(v) => updateAnimatedTransformProp('x', v)}
              />
              <SliderRow
                label="Move Up / Down"
                value={getAnimatedValue('y')}
                min={-360}
                max={360}
                unit=" px"
                keyframeCount={getKfCount('y')}
                hasKeyframeHere={hasKfHere('y')}
                onToggleKeyframe={() => handleToggleKf('y')}
                onChange={(v) => updateAnimatedTransformProp('y', v)}
              />
              <SliderRow
                label="Zoom Size"
                value={getAnimatedValue('scale')}
                min={10}
                max={250}
                unit="%"
                defaultValue={100}
                keyframeCount={getKfCount('scale')}
                hasKeyframeHere={hasKfHere('scale')}
                onToggleKeyframe={() => handleToggleKf('scale')}
                onChange={(v) => updateAnimatedTransformProp('scale', v)}
              />
              <SliderRow
                label="Rotate"
                value={getAnimatedValue('rotation')}
                min={-180}
                max={180}
                unit="°"
                keyframeCount={getKfCount('rotation')}
                hasKeyframeHere={hasKfHere('rotation')}
                onToggleKeyframe={() => handleToggleKf('rotation')}
                onChange={(v) => updateAnimatedTransformProp('rotation', v)}
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
                  <option value="slide-up">Slide Up Reveal</option>
                  <option value="tilt-drift">Gentle Tilt Drift</option>
                  <option value="pulse">Subtle Beat Pulse</option>
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
              title="Chroma Key (Green / Blue Screen)"
              defaultOpen={false}
              onReset={() =>
                updateEffects({
                  chromaKey: { enabled: false, color: '#00b140', similarity: 34, smoothness: 14 },
                })
              }
            >
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[11px] text-[#D1D5DB] font-medium">Enable Chroma Key</span>
                <input
                  type="checkbox"
                  checked={Boolean(clipEffects.chromaKey?.enabled)}
                  onChange={(e) =>
                    updateEffects({
                      chromaKey: {
                        color: clipEffects.chromaKey?.color ?? '#00b140',
                        similarity: clipEffects.chromaKey?.similarity ?? 34,
                        smoothness: clipEffects.chromaKey?.smoothness ?? 14,
                        enabled: e.target.checked,
                      },
                    })
                  }
                  className="accent-[#10B981] cursor-pointer"
                />
              </label>

              <div className="flex items-center justify-between gap-1.5 pt-1">
                <div className="flex items-center gap-1">
                  {[
                    { label: 'Green', color: '#00b140' },
                    { label: 'Blue', color: '#0047bb' },
                    { label: 'Black', color: '#000000' },
                  ].map((kc) => (
                    <button
                      key={kc.label}
                      type="button"
                      onClick={() =>
                        updateEffects({
                          chromaKey: {
                            enabled: true,
                            color: kc.color,
                            similarity: clipEffects.chromaKey?.similarity ?? 34,
                            smoothness: clipEffects.chromaKey?.smoothness ?? 14,
                          },
                        })
                      }
                      className="px-2 py-1 text-[10px] text-[#D1D5DB] hover:text-white bg-[#101114] border border-[#262930] rounded cursor-pointer"
                    >
                      {kc.label}
                    </button>
                  ))}
                </div>
                <input
                  type="color"
                  aria-label="Key Screen Color"
                  value={clipEffects.chromaKey?.color ?? '#00b140'}
                  onChange={(e) =>
                    updateEffects({
                      chromaKey: {
                        enabled: true,
                        color: e.target.value,
                        similarity: clipEffects.chromaKey?.similarity ?? 34,
                        smoothness: clipEffects.chromaKey?.smoothness ?? 14,
                      },
                    })
                  }
                  className="w-6 h-6 bg-transparent border border-[#2B2F3A] rounded cursor-pointer shrink-0"
                />
              </div>

              <SliderRow
                label="Color Match Tolerance"
                value={clipEffects.chromaKey?.similarity ?? 34}
                min={5}
                max={85}
                unit="%"
                defaultValue={34}
                onChange={(v) =>
                  updateEffects({
                    chromaKey: {
                      enabled: clipEffects.chromaKey?.enabled ?? true,
                      color: clipEffects.chromaKey?.color ?? '#00b140',
                      similarity: v,
                      smoothness: clipEffects.chromaKey?.smoothness ?? 14,
                    },
                  })
                }
              />
              <SliderRow
                label="Edge Softness"
                value={clipEffects.chromaKey?.smoothness ?? 14}
                min={0}
                max={45}
                unit="%"
                defaultValue={14}
                onChange={(v) =>
                  updateEffects({
                    chromaKey: {
                      enabled: clipEffects.chromaKey?.enabled ?? true,
                      color: clipEffects.chromaKey?.color ?? '#00b140',
                      similarity: clipEffects.chromaKey?.similarity ?? 34,
                      smoothness: v,
                    },
                  })
                }
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Visual Filters & Frames"
              defaultOpen
              onReset={() => updateEffects({ ...DEFAULT_EFFECTS })}
            >
              <div className="space-y-1">
                <span className="block text-[11px] text-[#A8AEB8]">Mirror &amp; Kaleidoscope</span>
                <div className="grid grid-cols-4 gap-1">
                  {(
                    [
                      { id: 'none', label: 'Off' },
                      { id: 'mirror-h', label: 'Left/Right' },
                      { id: 'mirror-v', label: 'Top/Bot' },
                      { id: 'kaleidoscope', label: '4-Way' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => updateEffects({ mirrorMode: m.id as MirrorEffectMode })}
                      aria-pressed={(clipEffects.mirrorMode ?? 'none') === m.id}
                      className={`py-1 text-[10px] font-medium rounded border cursor-pointer ${
                        (clipEffects.mirrorMode ?? 'none') === m.id
                          ? 'bg-[#252B36] border-[#3B82F6] text-white'
                          : 'bg-[#101114] border-[#262930] text-[#9CA3AF] hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <SliderRow
                label="RGB Glitch Split"
                value={clipEffects.chromatic ?? 0}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => updateEffects({ chromatic: v })}
              />
              <SliderRow
                label="Sunset Light Leak"
                value={clipEffects.lightLeak ?? 0}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => updateEffects({ lightLeak: v })}
              />
              <SliderRow
                label="Retro VHS Scanlines"
                value={clipEffects.scanlines ?? 0}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => updateEffects({ scanlines: v })}
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
                label="Background Blur"
                value={clipEffects.blur}
                min={0}
                max={20}
                step={0.5}
                unit=" px"
                onChange={(v) => updateEffects({ blur: v })}
              />
              <SliderRow
                label="Tilt-Shift Edge Veil"
                value={clipEffects.tiltShift ?? 0}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => updateEffects({ tiltShift: v })}
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
                label="Posterize Art Levels"
                value={clipEffects.posterize ?? 0}
                min={0}
                max={12}
                step={1}
                onChange={(v) => updateEffects({ posterize: v === 1 ? 2 : v })}
              />
              <SliderRow
                label="Ink Stencil Cutoff"
                value={clipEffects.threshold ?? 0}
                min={0}
                max={95}
                unit="%"
                onChange={(v) => updateEffects({ threshold: v })}
              />
              <SliderRow
                label="Mosaic / Pixelate"
                value={clipEffects.pixelate ?? 0}
                min={0}
                max={32}
                unit=" px"
                onChange={(v) => updateEffects({ pixelate: v })}
              />
              <SliderRow
                label="Rounded Corners"
                value={clipEffects.cornerRadius}
                min={0}
                max={80}
                unit=" px"
                onChange={(v) => updateEffects({ cornerRadius: v })}
              />
              <div className="flex items-center gap-2 pt-0.5">
                <div className="flex-1">
                  <SliderRow
                    label="Frame Border"
                    value={clipEffects.borderWidth ?? 0}
                    min={0}
                    max={24}
                    unit=" px"
                    onChange={(v) => updateEffects({ borderWidth: v })}
                  />
                </div>
                <input
                  type="color"
                  aria-label="Frame Border Color"
                  value={clipEffects.borderColor ?? '#FFFFFF'}
                  onChange={(e) => updateEffects({ borderColor: e.target.value })}
                  className="w-6 h-6 mt-3 bg-transparent border border-[#2B2F3A] rounded cursor-pointer shrink-0"
                />
              </div>
              <SliderRow
                label="Drop Shadow"
                value={clipEffects.dropShadow ?? 0}
                min={0}
                max={40}
                unit=" px"
                onChange={(v) => updateEffects({ dropShadow: v })}
              />
              <label className="flex items-center justify-between pt-1 cursor-pointer">
                <span className="text-[11px] text-[#A8AEB8]">Invert Colors (Negative)</span>
                <input
                  type="checkbox"
                  checked={Boolean(clipEffects.invert)}
                  onChange={(e) => updateEffects({ invert: e.target.checked })}
                  className="accent-[#3B82F6] cursor-pointer"
                />
              </label>
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

              {/* 1-Click Quick Enter Transition Pills */}
              <div className="space-y-1 pt-1">
                <span className="block text-[11px] text-[#A8AEB8]">Quick Enter FX</span>
                <div className="flex flex-wrap gap-1">
                  {QUICK_TRANSITIONS.map((qt) => {
                    const active = selectedClip.transitionIn === qt.id;
                    return (
                      <button
                        key={qt.id}
                        type="button"
                        onClick={() =>
                          onUpdateClip(selectedClip.id, (c) => ({
                            ...c,
                            transitionIn: active ? 'none' : qt.id,
                          }))
                        }
                        className={`px-2 py-0.5 text-[10px] rounded border cursor-pointer ${
                          active
                            ? 'bg-[#262D3B] border-[#3B82F6] text-white'
                            : 'bg-[#101114] border-[#262930] text-[#9CA3AF] hover:text-white'
                        }`}
                      >
                        {qt.label}
                      </button>
                    );
                  })}
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
                    <option value="fade-white">Flash White</option>
                    <option value="flash-blur">Flash &amp; Zoom</option>
                    <option value="iris-circle">Circle Open</option>
                    <option value="split-open">Curtain Split</option>
                    <option value="spin-in">Spin Reveal</option>
                    <option value="zoom-in">Zoom In</option>
                    <option value="zoom-out">Zoom Out</option>
                    <option value="wipe-left">Wipe Left</option>
                    <option value="wipe-right">Wipe Right</option>
                    <option value="wipe-up">Wipe Up</option>
                    <option value="wipe-down">Wipe Down</option>
                    <option value="slide-left">Slide Left</option>
                    <option value="slide-right">Slide Right</option>
                    <option value="slide-up">Slide Up</option>
                    <option value="slide-down">Slide Down</option>
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
                    <option value="iris-circle">Circle Close</option>
                    <option value="split-open">Curtain Close</option>
                    <option value="spin-in">Spin Out</option>
                    <option value="zoom-in">Zoom Out</option>
                    <option value="wipe-left">Wipe Left</option>
                    <option value="wipe-right">Wipe Right</option>
                    <option value="wipe-up">Wipe Up</option>
                    <option value="wipe-down">Wipe Down</option>
                    <option value="slide-left">Slide Out Left</option>
                    <option value="slide-right">Slide Out Right</option>
                    <option value="slide-up">Slide Out Up</option>
                    <option value="slide-down">Slide Out Down</option>
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
              <SliderRow
                label="Start Point Offset (Slip)"
                value={selectedClip.sourceIn}
                min={0}
                max={30}
                step={0.25}
                unit="s"
                defaultValue={0}
                onChange={(v) =>
                  onUpdateClip(selectedClip.id, (c) => ({ ...c, sourceIn: v }))
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
                value={getAnimatedValue('opacity')}
                min={0}
                max={100}
                unit="%"
                defaultValue={100}
                keyframeCount={getKfCount('opacity')}
                hasKeyframeHere={hasKfHere('opacity')}
                onToggleKeyframe={() => handleToggleKf('opacity')}
                onChange={(v) => updateAnimatedTransformProp('opacity', v)}
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
              <div className="grid grid-cols-4 gap-1">
                {[
                  { label: 'Mute', db: -36 },
                  { label: 'Duck -12', db: -12 },
                  { label: 'Normalize', db: 0 },
                  { label: 'Boost +4', db: 4 },
                ].map((vol) => (
                  <button
                    key={vol.label}
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, (c) => ({ ...c, gainDb: vol.db }))
                    }
                    className="py-1 text-[10px] text-[#C7CBD4] hover:text-white bg-[#101114] border border-[#262930] rounded cursor-pointer"
                  >
                    {vol.label}
                  </button>
                ))}
              </div>
              {selectedClip.kind === 'audio' && (
                <div className="space-y-1 pt-1">
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
                    <option value="podcast">Podcast Crisp</option>
                    <option value="warm-bass">Warm Bass</option>
                    <option value="radio">Lo-Fi Radio</option>
                    <option value="megaphone">Megaphone</option>
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
                <div className="space-y-1">
                  <label className="block text-[11px] text-[#A8AEB8]">Text Animation</label>
                  <select
                    aria-label="Text Animation"
                    value={selectedClip.textOverlay.animation ?? 'none'}
                    onChange={(e) =>
                      updateText({ animation: e.target.value as TextAnimationPreset })
                    }
                    className="w-full bg-[#0E0F12] border border-[#282B33] rounded px-2 py-1 text-[11px] text-white"
                  >
                    <option value="none">Static (None)</option>
                    <option value="fade-up">Slide &amp; Fade Up</option>
                    <option value="typewriter">Typewriter Reveal</option>
                    <option value="pop-in">Smooth Pop In</option>
                  </select>
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
                  label="Letter Spacing"
                  value={selectedClip.textOverlay.letterSpacing}
                  min={-0.05}
                  max={0.35}
                  step={0.01}
                  unit=" em"
                  defaultValue={0}
                  onChange={(v) => updateText({ letterSpacing: v })}
                />
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <SliderRow
                      label="Text Outline"
                      value={selectedClip.textOverlay.outlineWidth ?? 0}
                      min={0}
                      max={8}
                      step={0.5}
                      unit=" px"
                      onChange={(v) => updateText({ outlineWidth: v })}
                    />
                  </div>
                  <input
                    type="color"
                    aria-label="Outline Color"
                    value={selectedClip.textOverlay.outlineColor ?? '#000000'}
                    onChange={(e) => updateText({ outlineColor: e.target.value })}
                    className="w-6 h-6 mt-3 bg-transparent border border-[#2B2F3A] rounded cursor-pointer shrink-0"
                  />
                </div>
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
