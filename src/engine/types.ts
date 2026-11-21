export type MediaKind = 'video' | 'image' | 'audio' | 'title' | 'adjustment' | 'matte';

export type WorkspaceMode = 'editing' | 'color' | 'photo' | 'audio';

export type ClipLabelColor = 'default' | 'cerulean' | 'violet' | 'emerald' | 'amber' | 'rose';

export type ToolMode =
  | 'select'
  | 'track-select'
  | 'razor'
  | 'trim'
  | 'roll'
  | 'rate-stretch'
  | 'slip'
  | 'hand'
  | 'text';

export type KeyframeProperty = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';

export interface ClipKeyframe {
  time: number; // relative seconds from clip start (0..duration)
  value: number;
  easing?: 'linear' | 'ease';
}

export type ClipKeyframes = Partial<Record<KeyframeProperty, ClipKeyframe[]>>;

export interface ChromaKeySettings {
  enabled: boolean;
  color: string; // Hex key color e.g. '#00b140'
  similarity: number; // 5..85 color distance tolerance
  smoothness: number; // 0..45 edge feather
}

export type LUTPresetId =
  | 'none'
  | 'kodak-2383'
  | 'teal-orange'
  | 'fuji-eterna'
  | 'monochrome-noir'
  | 'bleach-bypass'
  | 'golden-hour'
  | 'cyberpunk-neon'
  | 'pastel-dream'
  | 'vintage-polaroid'
  | 'emerald-forest';

export type BlendMode = 'source-over' | 'screen' | 'multiply' | 'overlay' | 'soft-light';

export type TransitionType =
  | 'none'
  | 'cross-dissolve'
  | 'dip-black'
  | 'fade-white'
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'spin-in'
  | 'iris-circle'
  | 'split-open'
  | 'flash-blur';

export type MotionPreset =
  | 'none'
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'slide-up'
  | 'tilt-drift'
  | 'pulse';

export type PiPLayoutPreset =
  | 'full'
  | 'pip-tr'
  | 'pip-tl'
  | 'split-left'
  | 'split-right'
  | 'pip-circle';

export type MaskShape = 'rect' | 'circle' | 'pill' | 'diamond';

export type MirrorEffectMode = 'none' | 'mirror-h' | 'mirror-v' | 'kaleidoscope';

export type CropAspectPreset = 'original' | '16:9' | '4:3' | '1:1' | '4:5' | '9:16';

export type SequenceAspectPreset = '16:9' | '9:16' | '1:1' | '4:5';

export type AudioTonePreset = 'normal' | 'voice' | 'podcast' | 'warm-bass' | 'radio' | 'megaphone';

export type TextFontFamily = 'sans' | 'serif' | 'mono';

export type TextStylePreset = 'hero' | 'lower-third' | 'caption' | 'tag';

export type TextAnimationPreset = 'none' | 'fade-up' | 'typewriter' | 'pop-in';

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
  hueShift?: number; // -180..180 degrees
  dehaze?: number; // -50..100
  splitShadowHue?: number; // 0..360 deg
  splitShadowSat?: number; // 0..100 %
  splitHighlightHue?: number; // 0..360 deg
  splitHighlightSat?: number; // 0..100 %
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
  pixelate?: number; // 0..32 px block size
  invert?: boolean;
  borderWidth?: number; // 0..24 px
  borderColor?: string;
  dropShadow?: number; // 0..40 px blur
  chromatic?: number; // 0..100 % RGB split
  posterize?: number; // 0 = off, 2..12 color levels
  threshold?: number; // 0 = off, 1..100 ink cutoff
  lightLeak?: number; // 0..100 % warm film flare
  scanlines?: number; // 0..100 % retro VHS lines
  tiltShift?: number; // 0..100 % soft top/bottom blur focus
  mirrorMode?: MirrorEffectMode;
  maskShape?: MaskShape;
  maskFeather?: number; // 0..40 px
  maskInvert?: boolean;
  chromaKey?: ChromaKeySettings;
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
  animation?: TextAnimationPreset;
  outlineWidth?: number;
  outlineColor?: string;
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
  labelColor?: ClipLabelColor;
  disabled?: boolean;
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
  keyframes?: ClipKeyframes;
  effects?: ClipEffects;
  color: ColorGrade;
  textOverlay?: TextOverlay;
  matteColor?: string;
  matteSecondaryColor?: string;
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
