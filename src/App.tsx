import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioMixerPanel } from './components/AudioMixerPanel';
import { ExportModal } from './components/ExportModal';
import { InspectorPanel } from './components/InspectorPanel';
import { MediaBin } from './components/MediaBin';
import { MonitorPanel } from './components/MonitorPanel';
import { PhotoStudio } from './components/PhotoStudio';
import { ScopesPanel } from './components/ScopesPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { TopBar } from './components/TopBar';
import { AudioPreviewEngine } from './engine/audioPlayer';
import {
  computeLiveStereoLevels,
  extractAudioPeaksFromBuffer,
  generateSynthWaveform,
} from './engine/audioSynth';
import {
  computeAutoBalanceGrade,
  createDefaultColorGrade,
  DEFAULT_EFFECTS,
  DEFAULT_TRANSFORM,
} from './engine/colorEngine';
import {
  computeScopesFromCanvas,
  LoadedMediaCache,
  renderCompositeFrame,
} from './engine/renderer';
import { createSeedProject } from './engine/seedProject';
import { stepFrames } from './engine/timecode';
import {
  addTrack,
  applyColorGradeToAllClips,
  changeClipSpeed,
  closeTrackGaps,
  deleteClip,
  duplicateClip,
  getSequenceDimensionsForRatio,
  getSequenceDuration,
  moveClip,
  nudgeClip,
  splitAllAtTime,
  splitClipAtTime,
  trimClip,
  trimClipToPlayhead,
} from './engine/timelineOps';
import {
  AudioTonePreset,
  ClipTransform,
  ColorGrade,
  MediaAsset,
  ProjectState,
  ScopeData,
  SequenceAspectPreset,
  TimelineClip,
  ToolMode,
  WorkspaceMode,
} from './engine/types';

export default function App() {
  const [project, setProject] = useState<ProjectState>(() => createSeedProject());
  const [past, setPast] = useState<ProjectState[]>([]);
  const [future, setFuture] = useState<ProjectState[]>([]);

  const [workspace, setWorkspace] = useState<WorkspaceMode>('editing');
  const [inspectorTab, setInspectorTab] = useState<'effects' | 'color' | 'text' | 'scopes'>('color');
  const [activeTool, setActiveTool] = useState<ToolMode>('select');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showSafeGuides, setShowSafeGuides] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showDualMonitor, setShowDualMonitor] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const [currentTime, setCurrentTime] = useState(0.5);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const [selectedClipId, setSelectedClipId] = useState<string | null>('clip_1');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>('asset_street');
  const [copiedGrade, setCopiedGrade] = useState<ColorGrade | null>(null);
  const [scopes, setScopes] = useState<ScopeData | null>(null);
  const [mediaRevision, setMediaRevision] = useState(0);

  const programCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioEngineRef = useRef<AudioPreviewEngine | null>(null);
  const mediaCacheRef = useRef<LoadedMediaCache>({
    images: new Map(),
    videos: new Map(),
  });

  const sequenceDuration = useMemo(
    () => getSequenceDuration(project.clips, 18),
    [project.clips]
  );

  const selectedClip = useMemo(
    () => project.clips.find((c) => c.id === selectedClipId) ?? null,
    [project.clips, selectedClipId]
  );

  const sourceAsset = useMemo(
    () => project.assets.find((a) => a.id === selectedAssetId) ?? null,
    [project.assets, selectedAssetId]
  );

  const commitProject = useCallback((updater: (prev: ProjectState) => ProjectState) => {
    setProject((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      setPast((p) => [...p.slice(-29), prev]);
      setFuture([]);
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setProject((cur) => {
        setFuture((f) => [cur, ...f]);
        return previous;
      });
      return p.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const nextState = f[0];
      setProject((cur) => {
        setPast((p) => [...p, cur]);
        return nextState;
      });
      return f.slice(1);
    });
  }, []);

  const handleResetProject = useCallback(() => {
    setIsPlaying(false);
    setPast([]);
    setFuture([]);
    const seed = createSeedProject();
    setProject(seed);
    setCurrentTime(0.5);
    setSelectedClipId('clip_1');
    setSelectedAssetId('asset_street');
  }, []);

  // Preload images and videos into cache
  useEffect(() => {
    const cache = mediaCacheRef.current;
    for (const asset of project.assets) {
      if (asset.kind === 'image' && asset.src && !cache.images.has(asset.id)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => setMediaRevision((r) => r + 1);
        img.src = asset.src;
        cache.images.set(asset.id, img);
      } else if (asset.kind === 'video' && asset.src && !cache.videos.has(asset.id)) {
        const vid = document.createElement('video');
        vid.muted = true;
        vid.playsInline = true;
        vid.preload = 'auto';
        vid.onloadeddata = () => setMediaRevision((r) => r + 1);
        vid.src = asset.src;
        cache.videos.set(asset.id, vid);
      }
    }
  }, [project.assets]);

  // Sync video element time when playhead seeks
  useEffect(() => {
    const cache = mediaCacheRef.current;
    for (const clip of project.clips) {
      if (clip.kind !== 'video') continue;
      if (currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration) {
        const vid = cache.videos.get(clip.assetId);
        if (vid && vid.readyState >= 1) {
          const rawRel = (currentTime - clip.startTime) * clip.speed;
          const targetVidTime = clip.reversed
            ? Math.max(0, clip.sourceIn + clip.duration * clip.speed - rawRel)
            : clip.sourceIn + rawRel;
          if (Math.abs(vid.currentTime - targetVidTime) > 0.08) {
            vid.currentTime = Math.max(0, targetVidTime);
          }
        }
      }
    }
  }, [currentTime, project.clips]);

  // Only compute live scopes when Color Lab or Scopes tab is active (eliminates wasted GPU readback)
  const needsLiveScopes = workspace === 'color' || inspectorTab === 'scopes';

  // Render composite frame
  useEffect(() => {
    const canvas = programCanvasRef.current;
    if (!canvas) return;
    const computed = renderCompositeFrame(
      canvas,
      project.sequence,
      project.tracks,
      project.clips,
      project.assets,
      mediaCacheRef.current,
      currentTime,
      {
        showSafeGuides,
        showGrid,
        computeScopes: needsLiveScopes,
      }
    );
    if (computed) setScopes(computed);
  }, [
    project,
    currentTime,
    showSafeGuides,
    showGrid,
    mediaRevision,
    workspace,
    showDualMonitor,
    needsLiveScopes,
  ]);

  // Playback loop via requestAnimationFrame (~30fps React state sync for smooth timeline + 60fps canvas)
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let lastTimestamp = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTimestamp) / 1000);
      lastTimestamp = now;

      setCurrentTime((prev) => {
        const next = prev + dt * playbackRate;
        if (next >= sequenceDuration) {
          if (isLooping) return 0;
          setIsPlaying(false);
          return sequenceDuration;
        }
        if (next < 0) return 0;
        return next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, isLooping, playbackRate, sequenceDuration]);

  const stereoLevels = useMemo(
    () =>
      computeLiveStereoLevels(
        project.clips,
        project.tracks,
        project.assets,
        currentTime,
        isPlaying
      ),
    [project.clips, project.tracks, project.assets, currentTime, isPlaying]
  );

  // Sync Web Audio preview playback engine
  useEffect(() => {
    if (!audioEngineRef.current) {
      audioEngineRef.current = new AudioPreviewEngine();
    }
    audioEngineRef.current.setMuted(isMuted);
    audioEngineRef.current.sync(
      isPlaying,
      currentTime,
      playbackRate,
      project.clips,
      project.tracks,
      project.assets
    );
  }, [isPlaying, isMuted, currentTime, playbackRate, project.clips, project.tracks, project.assets]);

  useEffect(() => {
    return () => {
      audioEngineRef.current?.stopAll();
    };
  }, []);

  // Clip actions
  const handleUpdateClip = useCallback(
    (clipId: string, updater: (clip: TimelineClip) => TimelineClip) => {
      setProject((prev) => ({
        ...prev,
        clips: prev.clips.map((c) => (c.id === clipId ? updater(c) : c)),
      }));
    },
    []
  );

  const handleAutoBalanceClip = useCallback(
    (clipId: string) => {
      const freshScopes =
        scopes ??
        (programCanvasRef.current ? computeScopesFromCanvas(programCanvasRef.current) : null);
      if (freshScopes) setScopes(freshScopes);
      commitProject((prev) => ({
        ...prev,
        clips: prev.clips.map((c) =>
          c.id === clipId
            ? { ...c, color: computeAutoBalanceGrade(freshScopes, c.color) }
            : c
        ),
      }));
    },
    [commitProject, scopes]
  );

  const handleMoveClip = useCallback(
    (clipId: string, newStartTime: number, newTrackId: string) => {
      setProject((prev) => ({
        ...prev,
        clips: moveClip(prev.clips, clipId, newStartTime, newTrackId, prev.tracks),
      }));
    },
    []
  );

  const handleTrimClip = useCallback(
    (clipId: string, edge: 'left' | 'right', newTime: number) => {
      setProject((prev) => ({
        ...prev,
        clips: trimClip(prev.clips, clipId, edge, newTime),
      }));
    },
    []
  );

  const handleTrimClipToPlayhead = useCallback(
    (clipId: string, edge: 'left' | 'right') => {
      commitProject((prev) => ({
        ...prev,
        clips: trimClipToPlayhead(prev.clips, clipId, edge, currentTime),
      }));
    },
    [commitProject, currentTime]
  );

  const handleSplitClip = useCallback(
    (clipId: string, splitTime: number) => {
      commitProject((prev) => ({
        ...prev,
        clips: splitClipAtTime(prev.clips, clipId, splitTime),
      }));
    },
    [commitProject]
  );

  const handleSplitAllAtPlayhead = useCallback(() => {
    commitProject((prev) => ({
      ...prev,
      clips: splitAllAtTime(prev.clips, prev.tracks, currentTime),
    }));
  }, [commitProject, currentTime]);

  const handleDeleteClip = useCallback(
    (clipId: string, ripple: boolean) => {
      commitProject((prev) => ({
        ...prev,
        clips: deleteClip(prev.clips, clipId, ripple),
      }));
      if (selectedClipId === clipId) setSelectedClipId(null);
    },
    [commitProject, selectedClipId]
  );

  const handleCloseTrackGaps = useCallback(
    (trackId: string) => {
      commitProject((prev) => ({
        ...prev,
        clips: closeTrackGaps(prev.clips, trackId),
      }));
    },
    [commitProject]
  );

  const handleDuplicateClip = useCallback(
    (clipId: string) => {
      commitProject((prev) => ({
        ...prev,
        clips: duplicateClip(prev.clips, clipId),
      }));
    },
    [commitProject]
  );

  const handleFreezeClip = useCallback(
    (clipId: string) => {
      commitProject((prev) => {
        const target = prev.clips.find((c) => c.id === clipId);
        if (!target) return prev;
        const freezeClip: TimelineClip = {
          ...structuredClone(target),
          id: `${target.id}_freeze_${Math.random().toString(36).slice(2, 6)}`,
          name: `${target.name} (Freeze)`,
          startTime: Number((target.startTime + target.duration).toFixed(3)),
          duration: 3.0,
          speed: 1,
          transform: {
            ...target.transform,
            kenBurnsZoom: 0,
            motionPreset: 'none',
          },
        };
        return { ...prev, clips: [...prev.clips, freezeClip] };
      });
    },
    [commitProject]
  );

  const handleInsertAssetToTimeline = useCallback(
    (asset: MediaAsset) => {
      const targetTrackId = asset.kind === 'audio' ? 'a1' : 'v1';
      const newClip: TimelineClip = {
        id: `clip_${Date.now().toString(36)}`,
        assetId: asset.id,
        trackId: targetTrackId,
        name: asset.name.replace(/\.[^/.]+$/, ''),
        kind: asset.kind,
        startTime: Number(currentTime.toFixed(3)),
        duration: Math.max(1, Math.min(12, asset.duration || 5)),
        sourceIn: 0,
        speed: 1,
        fadeIn: asset.kind === 'audio' ? 0.25 : 0,
        fadeOut: asset.kind === 'audio' ? 0.25 : 0,
        gainDb: 0,
        transform: { ...DEFAULT_TRANSFORM },
        effects: { ...DEFAULT_EFFECTS },
        color: createDefaultColorGrade(),
      };
      commitProject((prev) => ({
        ...prev,
        clips: [...prev.clips, newClip],
      }));
      setSelectedClipId(newClip.id);
    },
    [commitProject, currentTime]
  );

  const handleAddTitleClip = useCallback(
    (preset: 'hero' | 'lower-third' | 'caption' = 'hero') => {
      const isCaption = preset === 'caption';
      const isLower = preset === 'lower-third';
      const newClip: TimelineClip = {
        id: `title_${Date.now().toString(36)}`,
        assetId: 'title_gen',
        trackId: 'v3',
        name: isCaption ? 'Subtitle Caption' : isLower ? 'Lower Third' : 'Heading Title',
        kind: 'title',
        startTime: Number(currentTime.toFixed(3)),
        duration: 4.0,
        sourceIn: 0,
        speed: 1,
        fadeIn: 0,
        fadeOut: 0,
        gainDb: 0,
        transform: { ...DEFAULT_TRANSFORM },
        effects: { ...DEFAULT_EFFECTS },
        color: createDefaultColorGrade(),
        textOverlay: {
          text: isCaption ? 'Tap to edit caption line here' : 'CHAPTER ONE',
          subtitle: isCaption ? '' : 'CREATIVE STUDIO · 2026',
          fontSize: isCaption ? 28 : 38,
          fontWeight: 700,
          fontFamily: 'sans',
          color: '#F3F4F6',
          backgroundColor: '#111214',
          backgroundOpacity: 78,
          align: 'center',
          letterSpacing: 0.05,
          lowerThird: isLower,
          textShadow: true,
          stylePreset: preset,
        },
      };
      commitProject((prev) => ({
        ...prev,
        clips: [...prev.clips, newClip],
      }));
      setSelectedClipId(newClip.id);
      setInspectorTab('text');
      setActiveTool('select');
    },
    [commitProject, currentTime]
  );

  const handleAddSynthAudioClip = useCallback(() => {
    const newClip: TimelineClip = {
      id: `audio_${Date.now().toString(36)}`,
      assetId: 'asset_score',
      trackId: 'a2',
      name: 'Ambient Music Bed',
      kind: 'audio',
      startTime: Number(currentTime.toFixed(3)),
      duration: 6.0,
      sourceIn: 0,
      speed: 1,
      fadeIn: 0.4,
      fadeOut: 0.6,
      gainDb: -4,
      audioTone: 'normal',
      transform: { ...DEFAULT_TRANSFORM },
      effects: { ...DEFAULT_EFFECTS },
      color: createDefaultColorGrade(),
    };
    commitProject((prev) => ({
      ...prev,
      clips: [...prev.clips, newClip],
    }));
    setSelectedClipId(newClip.id);
  }, [commitProject, currentTime]);

  const handleImportFiles = useCallback(async (files: FileList) => {
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file);
      const id = `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;

      if (file.type.startsWith('image/')) {
        const img = new Image();
        img.onload = () => {
          const asset: MediaAsset = {
            id,
            name: file.name,
            kind: 'image',
            src: url,
            duration: 5.0,
            width: img.naturalWidth || 1920,
            height: img.naturalHeight || 1080,
            fps: 24,
            codec: file.type.split('/')[1]?.toUpperCase() || 'IMAGE',
            createdAt: new Date().toISOString().slice(0, 10),
          };
          setProject((prev) => ({ ...prev, assets: [asset, ...prev.assets] }));
          setSelectedAssetId(id);
        };
        img.src = url;
      } else if (file.type.startsWith('video/')) {
        const vid = document.createElement('video');
        vid.preload = 'metadata';
        vid.onloadedmetadata = () => {
          const asset: MediaAsset = {
            id,
            name: file.name,
            kind: 'video',
            src: url,
            duration: Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 8.0,
            width: vid.videoWidth || 1920,
            height: vid.videoHeight || 1080,
            fps: 24,
            codec: 'Video',
            createdAt: new Date().toISOString().slice(0, 10),
          };
          setProject((prev) => ({ ...prev, assets: [asset, ...prev.assets] }));
          setSelectedAssetId(id);
        };
        vid.src = url;
      } else if (file.type.startsWith('audio/')) {
        let duration = 10.0;
        let sampleRate = 48000;
        let peaks = generateSynthWaveform('cinema-pad', 96);
        try {
          const buf = await file.arrayBuffer();
          const parsed = await extractAudioPeaksFromBuffer(buf, 96);
          duration = parsed.duration;
          sampleRate = parsed.sampleRate;
          peaks = parsed.peaks;
        } catch {
          // Fallback to synthesized peaks if browser codec decode fails
        }
        const asset: MediaAsset = {
          id,
          name: file.name,
          kind: 'audio',
          src: url,
          duration,
          width: 0,
          height: 0,
          fps: 24,
          codec: 'Audio',
          sampleRate,
          waveformPeaks: peaks,
          createdAt: new Date().toISOString().slice(0, 10),
        };
        setProject((prev) => ({ ...prev, assets: [asset, ...prev.assets] }));
        setSelectedAssetId(id);
      }
    }
  }, []);

  const handleToggleTrackProp = useCallback(
    (trackId: string, prop: 'muted' | 'solo' | 'locked' | 'visible') => {
      commitProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) =>
          t.id === trackId ? { ...t, [prop]: !t[prop] } : t
        ),
      }));
    },
    [commitProject]
  );

  const handleAddMarker = useCallback(() => {
    commitProject((prev) => ({
      ...prev,
      markers: [
        ...prev.markers,
        {
          id: `mk_${Date.now()}`,
          time: Number(currentTime.toFixed(3)),
          label: `Bookmark ${prev.markers.length + 1}`,
          color: 'emerald',
        },
      ],
    }));
  }, [commitProject, currentTime]);

  const handleChangeAspectRatio = useCallback(
    (ratio: SequenceAspectPreset) => {
      const dims = getSequenceDimensionsForRatio(ratio);
      commitProject((prev) => ({
        ...prev,
        sequence: { ...prev.sequence, width: dims.width, height: dims.height },
      }));
    },
    [commitProject]
  );

  // Global NLE Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setPlaybackRate(1);
        setIsPlaying((p) => !p);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.altKey && selectedClipId) {
          commitProject((prev) => ({
            ...prev,
            clips: nudgeClip(prev.clips, selectedClipId, -0.25, prev.tracks),
          }));
        } else {
          setIsPlaying(false);
          setCurrentTime((t) => stepFrames(t, -1, project.sequence.fps));
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.altKey && selectedClipId) {
          commitProject((prev) => ({
            ...prev,
            clips: nudgeClip(prev.clips, selectedClipId, 0.25, prev.tracks),
          }));
        } else {
          setIsPlaying(false);
          setCurrentTime((t) => stepFrames(t, 1, project.sequence.fps));
        }
      } else if (e.key.toLowerCase() === 'j') {
        setPlaybackRate(-2);
        setIsPlaying(true);
      } else if (e.key.toLowerCase() === 'k') {
        setIsPlaying(false);
        setPlaybackRate(1);
      } else if (e.key.toLowerCase() === 'l') {
        setPlaybackRate(2);
        setIsPlaying(true);
      } else if (e.key.toLowerCase() === 'v') {
        setActiveTool('select');
      } else if (e.key.toLowerCase() === 'c') {
        setActiveTool('razor');
      } else if (e.key.toLowerCase() === 'b') {
        setActiveTool('trim');
      } else if (e.key.toLowerCase() === 'h') {
        setActiveTool('hand');
      } else if (e.key.toLowerCase() === 's') {
        setSnapEnabled((s) => !s);
      } else if (e.key.toLowerCase() === 'm') {
        handleAddMarker();
      } else if (e.key.toLowerCase() === 'i') {
        setProject((p) => ({
          ...p,
          sequence: { ...p.sequence, inPoint: currentTime },
        }));
      } else if (e.key.toLowerCase() === 'o') {
        setProject((p) => ({
          ...p,
          sequence: { ...p.sequence, outPoint: currentTime },
        }));
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipId) {
        e.preventDefault();
        handleDeleteClip(selectedClipId, e.shiftKey);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    currentTime,
    handleAddMarker,
    handleDeleteClip,
    handleRedo,
    handleUndo,
    project.sequence.fps,
    selectedClipId,
  ]);

  return (
    <div
      data-workspace={workspace}
      data-playing={isPlaying ? 'true' : 'false'}
      className="h-screen w-screen flex flex-col overflow-hidden bg-[#111214] text-[#E4E6EB]"
    >
      <TopBar
        workspace={workspace}
        onWorkspaceChange={(ws) => {
          setWorkspace(ws);
          if (ws === 'color' || ws === 'photo') setInspectorTab('color');
          if (ws === 'photo' && (!selectedClip || (selectedClip.kind !== 'image' && selectedClip.kind !== 'video'))) {
            const firstPhoto = project.clips.find((c) => c.kind === 'image' || c.kind === 'video');
            if (firstPhoto) setSelectedClipId(firstPhoto.id);
          }
        }}
        sequence={project.sequence}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        showSafeGuides={showSafeGuides}
        onToggleSafeGuides={() => setShowSafeGuides((v) => !v)}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((v) => !v)}
        onResetProject={handleResetProject}
        onSaveProjectFile={() => {
          const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${project.sequence.name.replace(/\s+/g, '_').toLowerCase()}.auteur.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        }}
        onLoadProjectFile={async (file) => {
          try {
            const raw = await file.text();
            const parsed = JSON.parse(raw) as ProjectState;
            if (parsed && parsed.sequence && Array.isArray(parsed.tracks) && Array.isArray(parsed.clips)) {
              setIsPlaying(false);
              setPast([]);
              setFuture([]);
              setProject(parsed);
              setCurrentTime(0);
              setSelectedClipId(parsed.clips[0]?.id ?? null);
            }
          } catch {
            // Ignore malformed project file
          }
        }}
        onOpenExport={() => setIsExportOpen(true)}
      />

      {/* Main Studio Workspace Split */}
      <main className="flex-1 min-h-0 flex overflow-hidden">
        {workspace === 'editing' && (
          <div className="w-[268px] shrink-0 h-full overflow-hidden">
            <MediaBin
              assets={project.assets}
              selectedAssetId={selectedAssetId}
              fps={project.sequence.fps}
              onSelectAsset={(id) => {
                setSelectedAssetId(id);
                setShowDualMonitor(true);
              }}
              onInsertAssetToTimeline={handleInsertAssetToTimeline}
              onAddTitleClip={handleAddTitleClip}
              onAddSynthAudioClip={handleAddSynthAudioClip}
              onImportFiles={handleImportFiles}
            />
          </div>
        )}

        {workspace === 'color' && (
          <div className="w-[316px] shrink-0 h-full bg-[#15161A] border-r border-[#262930] p-2.5 space-y-2.5 overflow-y-auto">
            <ScopesPanel scopes={scopes} />
            <div className="p-2.5 bg-[#121317] border border-[#24272E] rounded space-y-1.5">
              <div className="text-[11px] font-semibold text-[#D1D5DB]">Project Clips</div>
              <div className="space-y-1">
                {project.clips
                  .filter((c) => c.kind === 'image' || c.kind === 'video')
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedClipId(c.id);
                        setCurrentTime(c.startTime + 0.25);
                      }}
                      className={`w-full px-2 py-1.5 rounded text-left text-[11px] flex items-center justify-between cursor-pointer ${
                        selectedClipId === c.id
                          ? 'bg-[#262D3B] text-white'
                          : 'text-[#9CA3AF] hover:bg-[#1B1D24] hover:text-white'
                      }`}
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="font-mono-tabular text-[10px] opacity-70">
                        {c.color.lut === 'none' ? 'Original' : c.color.lut}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}

        {workspace === 'audio' && (
          <div className="w-[410px] shrink-0 h-full overflow-hidden">
            <AudioMixerPanel
              tracks={project.tracks}
              stereoLevels={stereoLevels}
              onChangeTrackGain={(trackId, gainDb) =>
                setProject((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) =>
                    t.id === trackId ? { ...t, gainDb } : t
                  ),
                }))
              }
              onChangeTrackPan={(trackId, pan) =>
                setProject((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) =>
                    t.id === trackId ? { ...t, pan } : t
                  ),
                }))
              }
              onChangeTrackTone={(trackId, tonePreset: AudioTonePreset) =>
                setProject((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) =>
                    t.id === trackId ? { ...t, tonePreset } : t
                  ),
                }))
              }
              onToggleTrackProp={(trackId, prop) => handleToggleTrackProp(trackId, prop)}
            />
          </div>
        )}

        {/* Center Stage: Either Photo Editor OR Video Preview */}
        <div className="flex-1 min-w-0 h-full overflow-hidden">
          {workspace === 'photo' ? (
            <PhotoStudio
              clips={project.clips}
              assets={project.assets}
              selectedClip={selectedClip}
              cache={mediaCacheRef.current}
              mediaRevision={mediaRevision}
              onSelectClip={(id) => setSelectedClipId(id)}
              onUpdateClip={handleUpdateClip}
              onImportFiles={handleImportFiles}
              onOpenExport={() => setIsExportOpen(true)}
            />
          ) : (
            <MonitorPanel
              programCanvasRef={programCanvasRef}
              sequence={project.sequence}
              currentTime={currentTime}
              duration={sequenceDuration}
              isPlaying={isPlaying}
              isLooping={isLooping}
              isMuted={isMuted}
              playbackRate={playbackRate}
              sourceAsset={sourceAsset}
              selectedClip={selectedClip}
              allowDualMonitor={workspace === 'editing'}
              showDualMonitor={showDualMonitor && workspace === 'editing'}
              onToggleDualMonitor={() => setShowDualMonitor((d) => !d)}
              onTogglePlay={() => setIsPlaying((p) => !p)}
              onToggleMute={() => setIsMuted((m) => !m)}
              onChangePlaybackRate={(rate) => setPlaybackRate(rate)}
              onStepFrame={(delta) => {
                setIsPlaying(false);
                setCurrentTime((t) => stepFrames(t, delta, project.sequence.fps));
              }}
              onSeek={(t) => {
                setIsPlaying(false);
                setCurrentTime(Math.max(0, Math.min(sequenceDuration, t)));
              }}
              onToggleLoop={() => setIsLooping((l) => !l)}
              onSetInPoint={() =>
                setProject((p) => ({
                  ...p,
                  sequence: { ...p.sequence, inPoint: currentTime },
                }))
              }
              onSetOutPoint={() =>
                setProject((p) => ({
                  ...p,
                  sequence: { ...p.sequence, outPoint: currentTime },
                }))
              }
              onInsertSourceAtPlayhead={() => {
                if (sourceAsset) handleInsertAssetToTimeline(sourceAsset);
              }}
              onChangeAspectRatio={handleChangeAspectRatio}
              onToggleCinemaBars={() =>
                commitProject((prev) => ({
                  ...prev,
                  sequence: { ...prev.sequence, cinemaBars: !prev.sequence.cinemaBars },
                }))
              }
              onUpdateClipTransform={(clipId, patch: Partial<ClipTransform>) =>
                handleUpdateClip(clipId, (c) => ({
                  ...c,
                  transform: { ...c.transform, ...patch },
                }))
              }
            />
          )}
        </div>

        {/* Right Dock: Inspector */}
        <div className="w-[330px] shrink-0 h-full overflow-hidden">
          <InspectorPanel
            selectedClip={selectedClip}
            scopes={scopes}
            copiedGrade={copiedGrade}
            activeTab={inspectorTab}
            onTabChange={setInspectorTab}
            onUpdateClip={handleUpdateClip}
            onAutoBalanceClip={handleAutoBalanceClip}
            onChangeClipSpeed={(clipId, speed) =>
              commitProject((prev) => ({
                ...prev,
                clips: changeClipSpeed(prev.clips, clipId, speed),
              }))
            }
            onFreezeClip={handleFreezeClip}
            onCopyGrade={(grade) => setCopiedGrade(structuredClone(grade))}
            onPasteGrade={(clipId) => {
              if (!copiedGrade) return;
              commitProject((prev) => ({
                ...prev,
                clips: prev.clips.map((c) =>
                  c.id === clipId ? { ...c, color: structuredClone(copiedGrade) } : c
                ),
              }));
            }}
            onApplyGradeToAll={(grade) => {
              commitProject((prev) => ({
                ...prev,
                clips: applyColorGradeToAllClips(prev.clips, grade),
              }));
            }}
          />
        </div>
      </main>

      {/* Bottom Dock: Multi-Track Timeline */}
      {workspace !== 'photo' && (
        <div className="h-[292px] shrink-0 overflow-hidden">
          <TimelinePanel
            sequence={project.sequence}
            tracks={project.tracks}
            clips={project.clips}
            assets={project.assets}
            markers={project.markers}
            currentTime={currentTime}
            duration={sequenceDuration}
            selectedClipId={selectedClipId}
            activeTool={activeTool}
            snapEnabled={snapEnabled}
            stereoLevels={stereoLevels}
            onSelectTool={setActiveTool}
            onToggleSnap={() => setSnapEnabled((s) => !s)}
            onSelectClip={(id) => {
              setSelectedClipId(id);
              if (id) {
                const clip = project.clips.find((c) => c.id === id);
                if (clip && (currentTime < clip.startTime || currentTime >= clip.startTime + clip.duration)) {
                  setCurrentTime(clip.startTime + 0.1);
                }
              }
            }}
            onSeek={(t) => {
              setIsPlaying(false);
              setCurrentTime(Math.max(0, Math.min(sequenceDuration, t)));
            }}
            onMoveClip={handleMoveClip}
            onTrimClip={handleTrimClip}
            onTrimClipToPlayhead={handleTrimClipToPlayhead}
            onSplitClip={handleSplitClip}
            onSplitAllAtPlayhead={handleSplitAllAtPlayhead}
            onDeleteClip={handleDeleteClip}
            onCloseTrackGaps={handleCloseTrackGaps}
            onDuplicateClip={handleDuplicateClip}
            onAddMarker={handleAddMarker}
            onAddTextAtPlayhead={() => handleAddTitleClip('hero')}
            onToggleTrackProp={handleToggleTrackProp}
            onAddTrack={(type) =>
              commitProject((prev) => ({
                ...prev,
                tracks: addTrack(prev.tracks, type),
              }))
            }
            onDropAssetAtTime={(assetId, trackId, dropTime) => {
              const asset = project.assets.find((a) => a.id === assetId);
              if (!asset) return;
              const targetTrack = project.tracks.find((t) => t.id === trackId);
              const resolvedTrackId =
                targetTrack &&
                ((asset.kind === 'audio' && targetTrack.type === 'audio') ||
                  (asset.kind !== 'audio' && targetTrack.type === 'video'))
                  ? targetTrack.id
                  : asset.kind === 'audio'
                  ? 'a1'
                  : 'v1';
              const newClip: TimelineClip = {
                id: `clip_${Date.now().toString(36)}`,
                assetId: asset.id,
                trackId: resolvedTrackId,
                name: asset.name.replace(/\.[^/.]+$/, ''),
                kind: asset.kind,
                startTime: Number(Math.max(0, dropTime).toFixed(3)),
                duration: Math.max(1, Math.min(12, asset.duration || 5)),
                sourceIn: 0,
                speed: 1,
                fadeIn: 0.2,
                fadeOut: 0.2,
                gainDb: 0,
                transform: { ...DEFAULT_TRANSFORM },
                effects: { ...DEFAULT_EFFECTS },
                color: createDefaultColorGrade(),
              };
              commitProject((prev) => ({
                ...prev,
                clips: [...prev.clips, newClip],
              }));
              setSelectedClipId(newClip.id);
            }}
            onApplyQuickDissolve={(clipId) =>
              commitProject((prev) => ({
                ...prev,
                clips: prev.clips.map((c) => {
                  if (c.id !== clipId) return c;
                  const active = c.transitionIn === 'cross-dissolve';
                  return {
                    ...c,
                    transitionIn: active ? 'none' : 'cross-dissolve',
                    transitionOut: active ? 'none' : 'cross-dissolve',
                    transitionDuration: 0.6,
                  };
                }),
              }))
            }
          />
        </div>
      )}

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        sequence={project.sequence}
        tracks={project.tracks}
        clips={project.clips}
        assets={project.assets}
        cache={mediaCacheRef.current}
        currentTime={currentTime}
        duration={sequenceDuration}
        defaultTarget={workspace === 'photo' ? 'still' : 'video'}
      />
    </div>
  );
}
