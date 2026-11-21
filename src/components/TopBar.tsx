import React, { useRef, useState } from 'react';
import {
  Download,
  FolderOpen,
  Grid,
  HelpCircle,
  Redo2,
  RotateCcw,
  Save,
  Scan,
  Undo2,
  X,
} from 'lucide-react';
import { SequenceSettings, WorkspaceMode } from '../engine/types';

interface TopBarProps {
  workspace: WorkspaceMode;
  onWorkspaceChange: (ws: WorkspaceMode) => void;
  sequence: SequenceSettings;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  showSafeGuides: boolean;
  onToggleSafeGuides: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  showShortcuts?: boolean;
  onToggleShortcuts?: () => void;
  onResetProject: () => void;
  onSaveProjectFile?: () => void;
  onLoadProjectFile?: (file: File) => void;
  onUpdateSequenceSettings?: (patch: Partial<SequenceSettings>) => void;
  onOpenExport: () => void;
}

const WORKSPACES: { id: WorkspaceMode; label: string }[] = [
  { id: 'editing', label: 'Video Editor' },
  { id: 'color', label: 'Color Lab' },
  { id: 'photo', label: 'Photo Editor' },
  { id: 'audio', label: 'Audio Mixer' },
];

const SHORTCUT_GROUPS: {
  title: string;
  items: { keys: string; action: string }[];
}[] = [
  {
    title: 'Playback & Navigation',
    items: [
      { keys: 'Space', action: 'Play / Pause' },
      { keys: 'J / K / L', action: 'Rewind / Pause / Fast Forward' },
      { keys: '← / →', action: 'Step 1 Frame Back / Forward' },
      { keys: 'Shift + ← / →', action: 'Jump 1 Second Back / Forward' },
      { keys: '↑ / ↓', action: 'Jump to Prev / Next Cut or Marker' },
      { keys: 'Home / End', action: 'Jump to Start / End of Timeline' },
    ],
  },
  {
    title: 'Timeline & 3-Point Edits',
    items: [
      { keys: 'Ctrl + K / Shift+K', action: 'Split Clip / Cut All Tracks' },
      { keys: 'Q / W', action: 'Ripple Trim Start / End to Playhead' },
      { keys: 'Ctrl + D / C / V', action: 'Duplicate / Copy / Paste Clip' },
      { keys: 'E', action: 'Enable / Disable Selected Clip' },
      { keys: "; / '", action: 'Lift / Extract In-Out Range' },
      { keys: ', / .', action: 'Insert (Push) / Place Source' },
      { keys: 'Del / Shift + Del', action: 'Delete / Ripple Close Gap' },
    ],
  },
  {
    title: 'Premiere Edit Tools',
    items: [
      { keys: 'V / A', action: 'Select Clip / Track Select Ahead' },
      { keys: 'C / B / N', action: 'Razor Cut / Trim / Roll Cut' },
      { keys: 'R / Y', action: 'Rate Stretch Speed / Slip Offset' },
      { keys: 'T / H', action: 'Insert Title / Pan Timeline' },
      { keys: 'S / M', action: 'Magnet Snap / Add Bookmark' },
      { keys: 'I / O / Alt+X', action: 'Set In / Out / Clear Range' },
    ],
  },
  {
    title: 'Audio, Color & View',
    items: [
      { keys: 'Ctrl + M', action: 'Mute / Unmute Sound' },
      { keys: '` (Backtick)', action: 'Toggle Before/After Split Compare' },
      { keys: 'Alt + ← / →', action: 'Nudge Clip ±0.25s' },
      { keys: 'Ctrl + Z / Shift + Z', action: 'Undo / Redo History' },
      { keys: 'Double-Click Label', action: 'Reset Slider to Default' },
      { keys: '? / Esc', action: 'Controls Help / Close Modal' },
    ],
  },
];

export const TopBar: React.FC<TopBarProps> = ({
  workspace,
  onWorkspaceChange,
  sequence,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  showSafeGuides,
  onToggleSafeGuides,
  showGrid,
  onToggleGrid,
  showShortcuts: controlledShortcuts,
  onToggleShortcuts,
  onResetProject,
  onSaveProjectFile,
  onLoadProjectFile,
  onUpdateSequenceSettings,
  onOpenExport,
}) => {
  const [internalShortcuts, setInternalShortcuts] = useState(false);
  const [showSeqSettings, setShowSeqSettings] = useState(false);
  const showShortcuts = controlledShortcuts ?? internalShortcuts;
  const toggleShortcuts = onToggleShortcuts ?? (() => setInternalShortcuts((s) => !s));
  const closeShortcuts = () => {
    if (controlledShortcuts !== undefined) {
      if (controlledShortcuts && onToggleShortcuts) onToggleShortcuts();
    } else {
      setInternalShortcuts(false);
    }
  };
  const projectFileRef = useRef<HTMLInputElement>(null);

  return (
    <header className="h-11 shrink-0 bg-[#141518] border-b border-[#262930] px-4 flex items-center justify-between gap-4 select-none relative z-40">
      {/* Zone 1: Brand & Sequence */}
      <div className="flex items-center gap-3 min-w-0 shrink-0">
        <span className="text-[15px] font-semibold tracking-tight text-[#F3F4F6] whitespace-nowrap shrink-0">
          Auteur Studio
        </span>
        <span className="h-3.5 w-px bg-[#2A2D35]" aria-hidden="true" />
        <button
          type="button"
          onClick={() => setShowSeqSettings((s) => !s)}
          aria-expanded={showSeqSettings}
          aria-label="Sequence Settings"
          title="Edit Sequence Name, Resolution & Frame Rate"
          className="hidden lg:flex items-center gap-2 text-[12px] text-[#8E939E] hover:text-white px-2 py-1 rounded hover:bg-[#1E2027] transition-colors whitespace-nowrap cursor-pointer"
        >
          <span className="text-[#C7CBD4] font-medium truncate max-w-[150px]">
            {sequence.name}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">
            {sequence.width}×{sequence.height} · {sequence.fps} fps
          </span>
        </button>
      </div>

      {/* Zone 2: Workspace Switcher */}
      <nav
        aria-label="Workspaces"
        className="flex items-center gap-0.5 bg-[#1B1D22] p-0.5 rounded border border-[#282B33] shrink-0"
      >
        {WORKSPACES.map((ws) => {
          const active = workspace === ws.id;
          return (
            <button
              key={ws.id}
              type="button"
              onClick={() => onWorkspaceChange(ws.id)}
              aria-pressed={active}
              className={`px-3 py-1 text-[12px] font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#3B82F6] ${
                active
                  ? 'bg-[#2B303A] text-white'
                  : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
              }`}
            >
              {ws.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: History, Guides, Keyboard Controls & Export */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center border border-[#282B33] rounded bg-[#181A1F]">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo (Ctrl+Z)"
            title="Undo (Ctrl+Z)"
            className="p-1.5 text-[#9CA3AF] hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <span className="h-3.5 w-px bg-[#282B33]" aria-hidden="true" />
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo (Ctrl+Shift+Z)"
            title="Redo (Ctrl+Shift+Z)"
            className="p-1.5 text-[#9CA3AF] hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="hidden sm:flex items-center border border-[#282B33] rounded bg-[#181A1F]">
          <button
            type="button"
            onClick={onToggleSafeGuides}
            aria-pressed={showSafeGuides}
            aria-label="Toggle Safe Frame"
            title="Safe Frame Guides"
            className={`p-1.5 transition-colors cursor-pointer ${
              showSafeGuides ? 'text-[#3B82F6] bg-[#3B82F6]/12' : 'text-[#9CA3AF] hover:text-white'
            }`}
          >
            <Scan className="w-3.5 h-3.5" />
          </button>
          <span className="h-3.5 w-px bg-[#282B33]" aria-hidden="true" />
          <button
            type="button"
            onClick={onToggleGrid}
            aria-pressed={showGrid}
            aria-label="Toggle Rule of Thirds Grid"
            title="Grid Lines"
            className={`p-1.5 transition-colors cursor-pointer ${
              showGrid ? 'text-[#3B82F6] bg-[#3B82F6]/12' : 'text-[#9CA3AF] hover:text-white'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={toggleShortcuts}
          aria-expanded={showShortcuts}
          aria-label="Keyboard Shortcuts & Controls Help"
          title="Keyboard Controls & Help (?)"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            showShortcuts
              ? 'bg-[#262A34] border-[#3B82F6]/60 text-white'
              : 'bg-[#181A1F] border-[#282B33] text-[#C7CBD4] hover:text-white'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Controls</span>
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Save / Export</span>
        </button>
      </div>

      {/* Sequence Settings Popover */}
      {showSeqSettings && onUpdateSequenceSettings && (
        <div
          role="dialog"
          aria-label="Sequence Settings Dialog"
          className="absolute left-4 top-12 w-[360px] bg-[#181A20] border border-[#2D313B] rounded-md shadow-2xl p-3.5 z-50 space-y-3"
        >
          <div className="flex items-center justify-between border-b border-[#252830] pb-2">
            <h2 className="text-[13px] font-semibold text-white">Sequence Settings</h2>
            <button
              type="button"
              onClick={() => setShowSeqSettings(false)}
              aria-label="Close Sequence Settings"
              className="p-1 text-[#8E939E] hover:text-white rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] text-[#9CA3AF]">Sequence Name</label>
            <input
              type="text"
              aria-label="Sequence Name"
              value={sequence.name}
              onChange={(e) => onUpdateSequenceSettings({ name: e.target.value })}
              className="w-full bg-[#101114] border border-[#282B33] rounded px-2.5 py-1.5 text-[12px] text-white"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] text-[#9CA3AF]">Frame Rate (FPS)</label>
            <div className="grid grid-cols-4 gap-1">
              {[24, 25, 30, 60].map((fpsVal) => (
                <button
                  key={fpsVal}
                  type="button"
                  onClick={() => onUpdateSequenceSettings({ fps: fpsVal })}
                  aria-pressed={sequence.fps === fpsVal}
                  className={`py-1 text-[11px] font-mono-tabular rounded border cursor-pointer ${
                    sequence.fps === fpsVal
                      ? 'bg-[#252B36] border-[#3B82F6] text-white'
                      : 'bg-[#101114] border-[#262930] text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  {fpsVal} fps
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] text-[#9CA3AF]">Canvas Resolution Preset</label>
            <div className="grid grid-cols-2 gap-1">
              {[
                { label: '16:9 Full HD (1920×1080)', w: 1920, h: 1080 },
                { label: '16:9 4K UHD (3840×2160)', w: 3840, h: 2160 },
                { label: '9:16 Reels (1080×1920)', w: 1080, h: 1920 },
                { label: '1:1 Square (1080×1080)', w: 1080, h: 1080 },
              ].map((res) => (
                <button
                  key={res.label}
                  type="button"
                  onClick={() => onUpdateSequenceSettings({ width: res.w, height: res.h })}
                  aria-pressed={sequence.width === res.w && sequence.height === res.h}
                  className={`px-2 py-1.5 text-[10px] rounded border text-left cursor-pointer truncate ${
                    sequence.width === res.w && sequence.height === res.h
                      ? 'bg-[#252B36] border-[#3B82F6] text-white'
                      : 'bg-[#101114] border-[#262930] text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  {res.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between pt-1 cursor-pointer">
            <span className="text-[11px] text-[#C7CBD4]">Cinematic 2.39:1 Letterbox Bars</span>
            <input
              type="checkbox"
              checked={Boolean(sequence.cinemaBars)}
              onChange={(e) => onUpdateSequenceSettings({ cinemaBars: e.target.checked })}
              className="accent-[#3B82F6] cursor-pointer"
            />
          </label>
        </div>
      )}

      {/* Categorized Keyboard Controls & Project Menu Popover */}
      {showShortcuts && (
        <div
          role="dialog"
          aria-label="Keyboard Shortcuts Reference"
          className="absolute right-4 top-12 w-[680px] max-w-[calc(100vw-2rem)] bg-[#181A20] border border-[#2D313B] rounded-md shadow-2xl p-4 z-50"
        >
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[#252830]">
            <div>
              <h2 className="text-[13px] font-semibold text-white">
                Keyboard Controls &amp; Studio Guide
              </h2>
              <p className="text-[11px] text-[#8E939E]">
                Fast keys for playback, cutting, effects, and timeline navigation
              </p>
            </div>
            <button
              type="button"
              onClick={closeShortcuts}
              aria-label="Close Shortcuts"
              className="p-1 text-[#8E939E] hover:text-white rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.title} className="space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#60A5FA]">
                  {group.title}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <div
                      key={item.keys}
                      className="flex items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="text-[#C7CBD4] truncate">{item.action}</span>
                      <span className="font-mono-tabular text-[10px] text-[#E5E7EB] bg-[#111215] px-1.5 py-0.5 rounded-xs border border-[#262930] shrink-0">
                        {item.keys}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-[#252830] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {onSaveProjectFile && (
                <button
                  type="button"
                  onClick={() => {
                    onSaveProjectFile();
                    closeShortcuts();
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-[#E5E7EB] bg-[#1F222A] hover:bg-[#2A2F3B] border border-[#2C303A] rounded cursor-pointer"
                >
                  <Save className="w-3 h-3" />
                  <span>Save Project File</span>
                </button>
              )}
              {onLoadProjectFile && (
                <>
                  <button
                    type="button"
                    onClick={() => projectFileRef.current?.click()}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-[#E5E7EB] bg-[#1F222A] hover:bg-[#2A2F3B] border border-[#2C303A] rounded cursor-pointer"
                  >
                    <FolderOpen className="w-3 h-3" />
                    <span>Open Project File</span>
                  </button>
                  <input
                    ref={projectFileRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        onLoadProjectFile(f);
                        closeShortcuts();
                        e.target.value = '';
                      }
                    }}
                  />
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                onResetProject();
                closeShortcuts();
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-[#FCA5A5] hover:text-white bg-[#1F222A] hover:bg-[#DC2626]/25 border border-[#2C303A] rounded cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Project</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
