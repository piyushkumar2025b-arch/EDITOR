export type MediaKind = 'video' | 'image' | 'audio' | 'title';

export type WorkspaceMode = 'editing' | 'color' | 'photo' | 'audio';

export type ToolMode = 'select' | 'razor' | 'trim' | 'hand' | 'text';

export type LUTPresetId =
  | 'none'
  | 'kodak-2383'
  | 'teal-orange'
  | 'fuji-eterna'
  | 'monochrome-noir'
  | 'bleach-bypass'
  | 'golden-hour';

export type BlendMode = 'source-over' | 'screen' | 'multiply' | 'overlay' | 'soft-light';

export type TransitionType =
  | 'none'
  | 'cross-dissolve'
  | 'dip-black'
  | 'fade-white'
  | 'wipe-left'
  | 'wipe-right'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-in';

export type MotionPreset = 'none' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';

export type PiPLayoutPreset = 'full' | 'pip-tr' | 'pip-tl' | 'split-left' | 'split-right';

export type CropAspectPreset = 'original' | '16:9' | '4:3' | '1:1' | '4:5' | '9:16';

export type SequenceAspectPreset = '16:9' | '9:16' | '1:1' | '4:5';

export type AudioTonePreset = 'normal' | 'voice' | 'warm-bass' | 'radio';

export type TextFontFamily = 'sans' | 'serif' | 'mono';

export type TextStylePreset = 'hero' | 'lower-third' | 'caption' | 'tag';

export interface CurvePoint {
  x: number; // 0..1
  y: number; // 0..1
}

export interface ColorWheelOffset {
  x: number; // -1..1 (Red-Cyan / Tint axis on wheel)
  y: number; // -1..1 (Blue-Amber axis on wheel)
  luma: number; // -1..1
}

export interface ColorGrade {
  lut: LUTPresetId;
  lutIntensity: number; // 0..100
  temperature: number; // -100..100
  tint: number; // -100..100
  exposure: number; // -3..3 EV
  contrast: number; // -100..100
  highlights: number; // -100..100
  shadows: number; // -100..100
  whites: number; // -100..100
  blacks: number; // -100..100
  saturation: number; // -100..100
  vibrance: number; // -100..100
  sharpness: number; // 0..100
  vignette: number; // -100..100 (negative darkens edges, positive brightens)
  grain: number; // 0..100
  lift: ColorWheelOffset;
  gamma: ColorWheelOffset;
  gain: ColorWheelOffset;
  curves: {
    master: CurvePoint[];
    red: CurvePoint[];
    green: CurvePoint[];
    blue: CurvePoint[];
  };
}

export interface ClipEffects {
  blur: number; // 0..20 px
  sepia: number; // 0..100 %
  vintageFade: number; // 0..100 %
  glow: number; // 0..100 %
  cornerRadius: number; // 0..80 px
}

export interface ClipTransform {
  x: number; // px offset from center
  y: number; // px offset from center
  scale: number; // percentage, 100 = 100%
  rotation: number; // degrees -180..180
  opacity: number; // 0..100
  blendMode: BlendMode;
  cropTop: number; // 0..50 %
  cropRight: number; // 0..50 %
  cropBottom: number; // 0..50 %
  cropLeft: number; // 0..50 %
  kenBurnsZoom: number; // 0..30 % subtle motion for stills on timeline
  motionPreset?: MotionPreset;
  flipH?: boolean;
  flipV?: boolean;
}

export interface TextOverlay {
  text: string;
  subtitle: string;
  fontSize: number;
  fontWeight: 400 | 600 | 700;
  fontFamily?: TextFontFamily;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number; // 0..100
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  lowerThird: boolean;
  textShadow?: boolean;
  stylePreset?: TextStylePreset;
}

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  src: string; // URL or objectURL
  duration: number; // seconds (for images, default 6s on timeline)
  width: number;
  height: number;
  fps: number;
  codec: string;
  sampleRate?: number;
  waveformPeaks?: number[]; // normalized 0..1 peaks for audio rendering
  synthPreset?: 'cinema-pad' | 'foley-pulse';
  createdAt: string;
}

export interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio';
  index: number; // V1=0, V2=1, V3=2
  muted: boolean;
  solo: boolean;
  locked: boolean;
  visible: boolean;
  gainDb: number; // -48..+12 dB for audio tracks
  pan?: number; // -1..1 (Left to Right)
  tonePreset?: AudioTonePreset;
}

export interface TimelineClip {
  id: string;
  assetId: string;
  trackId: string;
  name: string;
  kind: MediaKind;
  startTime: number; // seconds on timeline
  duration: number; // seconds on timeline
  sourceIn: number; // seconds into source asset
  speed: number; // 0.25..4
  reversed?: boolean;
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  transitionIn?: TransitionType;
  transitionOut?: TransitionType;
  transitionDuration?: number;
  gainDb: number; // -48..+12
  audioTone?: AudioTonePreset;
  transform: ClipTransform;
  effects?: ClipEffects;
  color: ColorGrade;
  textOverlay?: TextOverlay;
}

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
  color: 'amber' | 'blue' | 'emerald' | 'rose';
}

export interface SequenceSettings {
  name: string;
  width: number;
  height: number;
  fps: number;
  inPoint: number | null;
  outPoint: number | null;
  cinemaBars?: boolean;
}

export interface ScopeData {
  histR: Uint32Array;
  histG: Uint32Array;
  histB: Uint32Array;
  histLuma: Uint32Array;
  maxHist: number;
  waveform: Uint16Array; // 128 cols x 64 rows density
  paradeR: Uint16Array; // 64 cols x 64 rows
  paradeG: Uint16Array;
  paradeB: Uint16Array;
}

export interface ProjectState {
  sequence: SequenceSettings;
  tracks: Track[];
  clips: TimelineClip[];
  assets: MediaAsset[];
  markers: TimelineMarker[];
}
