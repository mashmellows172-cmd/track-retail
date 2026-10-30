export type CameraTrialDevice = 'Android' | 'iPhone';
export type CameraTrialBrowser = 'Chrome' | 'Safari' | 'Edge' | 'Firefox' | 'Other';
export type CameraTrialKind = 'barcode' | 'receipt';
export type CameraTrialStatus = 'readable' | 'failed';

export interface CameraTrialRecord {
  device: CameraTrialDevice;
  browser: CameraTrialBrowser;
  kind: CameraTrialKind;
  status: CameraTrialStatus;
  elapsedMs: number;
  timestamp: string; // ISO
}

export interface CameraTrialTimerState {
  kind: CameraTrialKind;
  device?: CameraTrialDevice;
  browser?: CameraTrialBrowser;
  startedAt: number; // epoch ms
  startIso: string; // ISO
}

const TRIALS_KEY = 'trackretail_camera_trials_v1';
const TIMER_KEY = 'trackretail_camera_trial_timer_v1';
const MAX_TRIALS = 100;
const MAX_ELAPSED_MS = 600000;

const ALLOWED_DEVICES: CameraTrialDevice[] = ['Android', 'iPhone'];
const ALLOWED_BROWSERS: CameraTrialBrowser[] = ['Chrome', 'Safari', 'Edge', 'Firefox', 'Other'];
const ALLOWED_KINDS: CameraTrialKind[] = ['barcode', 'receipt'];
const ALLOWED_STATUSES: CameraTrialStatus[] = ['readable', 'failed'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v;
}

function isCanonicalIsoTimestamp(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return false;
    // Strict canonical: toISOString() must equal the string
    return d.toISOString() === v;
  } catch {
    return false;
  }
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      return localStorage as Storage;
    }
  } catch {
    // ignore
  }
  try {
    if (typeof globalThis !== 'undefined') {
      const g = globalThis as unknown as { localStorage?: Storage };
      if (g.localStorage) return g.localStorage;
    }
  } catch {
    // ignore
  }
  try {
    if (typeof window !== 'undefined') {
      const w = window as unknown as { localStorage?: Storage };
      if (w.localStorage) return w.localStorage;
    }
  } catch {
    // ignore
  }
  return null;
}

function getSessionStorage(): Storage | null {
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage) {
      return sessionStorage as Storage;
    }
  } catch {
    // ignore
  }
  try {
    if (typeof globalThis !== 'undefined') {
      const g = globalThis as unknown as { sessionStorage?: Storage };
      if (g.sessionStorage) return g.sessionStorage;
    }
  } catch {
    // ignore
  }
  try {
    if (typeof window !== 'undefined') {
      const w = window as unknown as { sessionStorage?: Storage };
      if (w.sessionStorage) return w.sessionStorage;
    }
  } catch {
    // ignore
  }
  return null;
}

function coerceStringEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== 'string') return null;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  return null;
}

function validateTrialRecord(record: unknown): CameraTrialRecord | null {
  if (!isRecord(record)) return null;
  const device = coerceStringEnum(record.device, ALLOWED_DEVICES);
  const browser = coerceStringEnum(record.browser, ALLOWED_BROWSERS);
  const kind = coerceStringEnum(record.kind, ALLOWED_KINDS);
  const status = coerceStringEnum(record.status, ALLOWED_STATUSES);
  if (!device || !browser || !kind || !status) return null;

  const elapsedMs = record.elapsedMs;
  if (!isFiniteInteger(elapsedMs)) return null;
  if (elapsedMs < 0 || elapsedMs > MAX_ELAPSED_MS) return null;

  const timestamp = record.timestamp;
  if (!isCanonicalIsoTimestamp(timestamp)) return null;
  // Also ensure it's a string that parses
  const tsDate = new Date(timestamp as string);
  if (isNaN(tsDate.getTime())) return null;

  return {
    device,
    browser,
    kind,
    status,
    elapsedMs: elapsedMs as number,
    timestamp: timestamp as string,
  };
}

export function loadCameraTrials(): CameraTrialRecord[] {
  const storage = getLocalStorage();
  if (!storage) return [];
  const parsed = safeParseJson<unknown>(storage.getItem(TRIALS_KEY));
  if (!Array.isArray(parsed)) return [];
  const results: CameraTrialRecord[] = [];
  for (const item of parsed) {
    const validated = validateTrialRecord(item);
    if (validated) {
      results.push(validated);
      if (results.length >= MAX_TRIALS) break;
    }
  }
  // Enforce cap of 100
  if (results.length > MAX_TRIALS) {
    results.splice(MAX_TRIALS);
  }
  return results.slice(0, MAX_TRIALS);
}

export function saveCameraTrials(trials: CameraTrialRecord[]): CameraTrialRecord[] {
  const storage = getLocalStorage();
  const validated: CameraTrialRecord[] = [];
  for (const trial of trials) {
    const v = validateTrialRecord(trial);
    if (v) {
      validated.push(v);
      if (validated.length >= MAX_TRIALS) break;
    }
  }
  if (storage) {
    try {
      storage.setItem(TRIALS_KEY, JSON.stringify(validated.slice(0, MAX_TRIALS)));
    } catch {
      // ignore write failures
    }
  }
  return validated.slice(0, MAX_TRIALS);
}

export function addCameraTrial(trial: CameraTrialRecord): CameraTrialRecord[] {
  const current = loadCameraTrials();
  const v = validateTrialRecord(trial);
  if (!v) return current;
  const next = [...current, v];
  if (next.length > MAX_TRIALS) {
    next.splice(0, next.length - MAX_TRIALS); // keep most recent? cap100 means total cap 100; spec says "versioned localStorage record cap100" - store up to 100 records total
  }
  return saveCameraTrials(next.slice(-MAX_TRIALS));
}

export function clearCameraTrials(): CameraTrialRecord[] {
  const storage = getLocalStorage();
  if (storage) {
    try {
      storage.removeItem(TRIALS_KEY);
    } catch {
      // ignore
    }
  }
  return [];
}

export function startCameraTrialTimer(
  kind: CameraTrialKind,
  options?: { device?: CameraTrialDevice; browser?: CameraTrialBrowser },
): CameraTrialTimerState {
  const now = Date.now();
  const device = options?.device ? coerceStringEnum(options.device, ALLOWED_DEVICES) : undefined;
  const browser = options?.browser ? coerceStringEnum(options.browser, ALLOWED_BROWSERS) : undefined;
  const state: CameraTrialTimerState = {
    kind,
    device: device || undefined,
    browser: browser || undefined,
    startedAt: now,
    startIso: new Date(now).toISOString(),
  };
  const storage = getSessionStorage();
  if (storage) {
    try {
      storage.setItem(TIMER_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }
  return state;
}

function validateTimerState(raw: unknown): CameraTrialTimerState | null {
  if (!isRecord(raw)) return null;
  const kind = coerceStringEnum(raw.kind, ALLOWED_KINDS);
  if (!kind) return null;
  const startedAt = raw.startedAt;
  if (!isFiniteInteger(startedAt)) return null;
  const startIso = raw.startIso;
  if (typeof startIso !== 'string') return null;
  let d: Date;
  try {
    d = new Date(startIso);
  } catch {
    return null;
  }
  if (isNaN(d.getTime())) return null;
  // canonical and match startedAt
  if (d.toISOString() !== startIso) return null;
  // startedAt should correspond to same time
  if (Math.abs(d.getTime() - (startedAt as number)) > 1000) {
    return null;
  }
  if (raw.device !== undefined) {
    const dev = coerceStringEnum(raw.device, ALLOWED_DEVICES);
    if (dev === null) return null;
  }
  if (raw.browser !== undefined) {
    const br = coerceStringEnum(raw.browser, ALLOWED_BROWSERS);
    if (br === null) return null;
  }
  const device = raw.device !== undefined ? coerceStringEnum(raw.device, ALLOWED_DEVICES) : undefined;
  const browser = raw.browser !== undefined ? coerceStringEnum(raw.browser, ALLOWED_BROWSERS) : undefined;
  return {
    kind,
    device: device || undefined,
    browser: browser || undefined,
    startedAt: startedAt as number,
    startIso: startIso as string,
  };
}

export type CameraTrialTimerValidationResult =
  | {
      ok: true;
      elapsedMs: number;
      kind: CameraTrialKind;
      device?: CameraTrialDevice;
      browser?: CameraTrialBrowser;
      startedAt: number;
    }
  | { ok: false; error: string };

export function validateAndConsumeCameraTrialTimer(nowMs?: number): CameraTrialTimerValidationResult {
  const storage = getSessionStorage();
  if (!storage) {
    return { ok: false, error: 'No active trial timer found.' };
  }
  const raw = safeParseJson<unknown>(storage.getItem(TIMER_KEY));
  if (!raw) {
    return { ok: false, error: 'No active trial timer found.' };
  }
  const timer = validateTimerState(raw);
  if (!timer) {
    // clear malformed timer
    try {
      storage.removeItem(TIMER_KEY);
    } catch {
      // ignore
    }
    return { ok: false, error: 'Malformed trial timer.' };
  }
  const now = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
  // reject future timers - if started in the future relative to now, or if validation time indicates future context
  if (timer.startedAt > now + 1000 || nowMs !== undefined && typeof nowMs === 'number' && nowMs > Date.now() + 5000) {
    try {
      storage.removeItem(TIMER_KEY);
    } catch {
      // ignore
    }
    return { ok: false, error: 'Timer is in the future.' };
  }
  // reject stale timers? "reject malformed/stale/future timers with helpful error" - define stale as too old?
  const elapsedMs = now - timer.startedAt;
  if (elapsedMs < 0) {
    try {
      storage.removeItem(TIMER_KEY);
    } catch {
      // ignore
    }
    return { ok: false, error: 'Timer is invalid.' };
  }
  if (elapsedMs > MAX_ELAPSED_MS) {
    try {
      storage.removeItem(TIMER_KEY);
    } catch {
      // ignore
    }
    return { ok: false, error: 'Trial timer expired (stale).' };
  }
  // consume timer
  try {
    storage.removeItem(TIMER_KEY);
  } catch {
    // ignore
  }
  return {
    ok: true,
    elapsedMs,
    kind: timer.kind,
    device: timer.device,
    browser: timer.browser,
    startedAt: timer.startedAt,
  };
}

export function getActiveCameraTrialTimer(): CameraTrialTimerState | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  const raw = safeParseJson<unknown>(storage.getItem(TIMER_KEY));
  if (!raw) return null;
  return validateTimerState(raw);
}

export function clearCameraTrialTimer(): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(TIMER_KEY);
  } catch {
    // ignore
  }
}
