export function secondsToTimecode(seconds: number, fps: number = 24): string {
  const safeSec = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const safeFps = Math.max(1, Math.round(fps));
  const totalFrames = Math.round(safeSec * safeFps);
  const frames = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const secs = totalSeconds % 60;
  const mins = Math.floor(totalSeconds / 60) % 60;
  const hrs = Math.floor(totalSeconds / 3600);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
}

export function timecodeToSeconds(tc: string, fps: number = 24): number | null {
  const parts = tc.trim().split(':').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    return null;
  }
  const [hrs, mins, secs, frames] = parts;
  const safeFps = Math.max(1, Math.round(fps));
  return hrs * 3600 + mins * 60 + secs + frames / safeFps;
}

export function stepFrames(seconds: number, deltaFrames: number, fps: number = 24): number {
  const safeFps = Math.max(1, Math.round(fps));
  const currentFrame = Math.round(Math.max(0, seconds) * safeFps);
  const nextFrame = Math.max(0, currentFrame + deltaFrames);
  return nextFrame / safeFps;
}

export function snapTime(
  targetTime: number,
  snapPoints: number[],
  thresholdSeconds: number,
  enabled: boolean
): number {
  const clamped = Math.max(0, targetTime);
  if (!enabled || snapPoints.length === 0) return clamped;

  let closest = clamped;
  let bestDist = thresholdSeconds;
  for (const point of snapPoints) {
    const dist = Math.abs(clamped - point);
    if (dist <= bestDist) {
      bestDist = dist;
      closest = point;
    }
  }
  return Math.max(0, closest);
}

export interface RulerTick {
  time: number;
  major: boolean;
  label?: string;
}

export function generateRulerTicks(
  durationSeconds: number,
  pixelsPerSecond: number,
  fps: number = 24
): RulerTick[] {
  const ticks: RulerTick[] = [];
  // Pick clean major step based on zoom density
  let majorStep = 1;
  let minorDivisions = 4;
  if (pixelsPerSecond < 16) {
    majorStep = 10;
    minorDivisions = 5;
  } else if (pixelsPerSecond < 36) {
    majorStep = 5;
    minorDivisions = 5;
  } else if (pixelsPerSecond < 75) {
    majorStep = 2;
    minorDivisions = 4;
  } else if (pixelsPerSecond >= 160) {
    majorStep = 1;
    minorDivisions = 6;
  }

  const minorStep = majorStep / minorDivisions;
  const maxTime = Math.max(10, Math.ceil(durationSeconds));
  const steps = Math.ceil(maxTime / minorStep);

  for (let i = 0; i <= steps; i++) {
    const time = Number((i * minorStep).toFixed(4));
    const isMajor = i % minorDivisions === 0;
    ticks.push({
      time,
      major: isMajor,
      label: isMajor ? secondsToTimecode(time, fps) : undefined,
    });
  }
  return ticks;
}
