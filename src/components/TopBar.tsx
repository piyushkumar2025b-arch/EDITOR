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
  onResetProject: () => void;
  onSaveProjectFile?: () => void;
  onLoadProjectFile?: (file: File) => void;
  onOpenExport: () => void;
}

const WORKSPACES: { id: WorkspaceMode; label: string }[] = [
  { id: 'editing', label: 'Video Editor' },
  { id: 'color', label: 'Color Lab' },
  { id: 'photo', label: 'Photo Editor' },
  { id: 'audio', label: 'Audio Mixer' },
];

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Space', action: 'Play / Pause' },
  { keys: 'J / K / L', action: 'Reverse / Stop / Fast Forward' },
  { keys: '← / →', action: 'Step Back / Forward 1 Frame' },
  { keys: 'V / C / B', action: 'Select / Cut / Trim Tool' },
  { keys: 'S', action: 'Toggle Magnet Snap' },
  { keys: 'I / O', action: 'Set Start / End Export Range' },
  { keys: 'M', action: 'Add Timeline Bookmark' },
  { keys: 'Del / Shift+Del', action: 'Delete / Delete & Close Gap' },
  { keys: 'Ctrl+Z / Shift+Z', action: 'Undo / Redo' },
  { keys: 'Double-Click Label', action: 'Reset Slider' },
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
  onResetProject,
  onSaveProjectFile,
  onLoadProjectFile,
  onOpenExport,
}) => {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const projectFileRef = useRef<HTMLInputElement>(null);

  return (
    <header className="h-11 shrink-0 bg-[#141518] border-b border-[#262930] px-4 flex items-center justify-between gap-6 select-none relative z-40">
      {/* Zone 1: Brand & Sequence */}
      <div className="flex items-center gap-4 min-w-0 shrink-0">
        <span className="text-[15px] font-semibold tracking-tight text-[#F3F4F6] whitespace-nowrap shrink-0">
          Auteur Studio
        </span>
        <span className="h-3.5 w-px bg-[#2A2D35]" aria-hidden="true" />
        <div className="hidden lg:flex items-center gap-2 text-[12px] text-[#8E939E] whitespace-nowrap">
          <span className="text-[#C7CBD4] font-medium truncate max-w-[160px]">
            {sequence.name}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">
            {sequence.width}×{sequence.height} · {sequence.fps} fps
          </span>
        </div>
      </div>

      {/* Zone 2: Workspace Switcher */}
      <nav
        aria-label="Workspaces"
        className="flex items-center gap-0.5 bg-[#1B1D22] p-0.5 rounded border border-[#282B33]"
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

      {/* Zone 3: History, Guides, Shortcuts & Export */}
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
          onClick={() => setShowShortcuts((s) => !s)}
          aria-expanded={showShortcuts}
          aria-label="Keyboard Shortcuts"
          title="Keyboard Shortcuts & Project Reset"
          className={`p-1.5 rounded border transition-colors cursor-pointer ${
            showShortcuts
              ? 'bg-[#262A34] border-[#3B82F6]/60 text-white'
              : 'bg-[#181A1F] border-[#282B33] text-[#9CA3AF] hover:text-white'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
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

      {/* Keyboard Shortcuts Reference Popover */}
      {showShortcuts && (
        <div
          role="dialog"
          aria-label="Keyboard Shortcuts Reference"
          className="absolute right-4 top-12 w-80 bg-[#181A20] border border-[#2D313B] rounded-md shadow-2xl p-3 z-50"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#252830]">
            <span className="text-[12px] font-semibold text-white">Studio Shortcuts</span>
            <button
              type="button"
              onClick={() => setShowShortcuts(false)}
              aria-label="Close Shortcuts"
              className="text-[#8E939E] hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            {SHORTCUTS.map((item) => (
              <div
                key={item.keys}
                className="flex items-center justify-between gap-3 text-[11px]"
              >
                <span className="text-[#A8AEB8]">{item.action}</span>
                <span className="font-mono-tabular text-[#E5E7EB] bg-[#111215] px-1.5 py-0.5 rounded-xs border border-[#262930] shrink-0">
                  {item.keys}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#252830] space-y-2">
            {(onSaveProjectFile || onLoadProjectFile) && (
              <div className="flex items-center gap-1.5">
                {onSaveProjectFile && (
                  <button
                    type="button"
                    onClick={() => {
                      onSaveProjectFile();
                      setShowShortcuts(false);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-[#E5E7EB] bg-[#1F222A] hover:bg-[#2A2F3B] border border-[#2C303A] rounded cursor-pointer"
                  >
                    <Save className="w-3 h-3" />
                    <span>Save Project</span>
                  </button>
                )}
                {onLoadProjectFile && (
                  <>
                    <button
                      type="button"
                      onClick={() => projectFileRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-[#E5E7EB] bg-[#1F222A] hover:bg-[#2A2F3B] border border-[#2C303A] rounded cursor-pointer"
                    >
                      <FolderOpen className="w-3 h-3" />
                      <span>Open Project</span>
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
                          setShowShortcuts(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </>
                )}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#8E939E]">Start fresh</span>
              <button
                type="button"
                onClick={() => {
                  onResetProject();
                  setShowShortcuts(false);
                }}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#FCA5A5] hover:text-white bg-[#1F222A] hover:bg-[#DC2626]/25 border border-[#2C303A] rounded cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Project</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
