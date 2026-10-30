'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import {
  addCameraTrial,
  clearCameraTrials,
  getActiveCameraTrialTimer,
  loadCameraTrials,
  startCameraTrialTimer,
  validateAndConsumeCameraTrialTimer,
  type CameraTrialBrowser,
  type CameraTrialDevice,
  type CameraTrialKind,
  type CameraTrialRecord,
  type CameraTrialStatus,
} from '@/lib/cameraTrials';

const DEVICES: CameraTrialDevice[] = ['Android', 'iPhone'];
const BROWSERS: CameraTrialBrowser[] = ['Chrome', 'Safari', 'Edge', 'Firefox', 'Other'];
const KINDS: CameraTrialKind[] = ['barcode', 'receipt'];

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function CameraTrialsPanel() {
  const [mounted, setMounted] = useState(false);
  const [trials, setTrials] = useState<CameraTrialRecord[]>([]);
  const [device, setDevice] = useState<CameraTrialDevice>('Android');
  const [browser, setBrowser] = useState<CameraTrialBrowser>('Chrome');
  const [kind, setKind] = useState<CameraTrialKind>('barcode');
  const [activeTimer, setActiveTimer] = useState<ReturnType<typeof getActiveCameraTrialTimer>>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = requestAnimationFrame(() => {
      const timer = getActiveCameraTrialTimer();
      if (timer?.device && (timer.device === 'Android' || timer.device === 'iPhone')) {
        setDevice(timer.device);
      }
      if (timer?.browser && ['Chrome', 'Safari', 'Edge', 'Firefox', 'Other'].includes(timer.browser)) {
        setBrowser(timer.browser);
      }
      if (timer?.kind) {
        setKind(timer.kind);
      }
      setMounted(true);
      setTrials(loadCameraTrials());
      setActiveTimer(timer);
    });
    return () => {
      cancelAnimationFrame(id);
    };
  }, []);

  const handleStart = useCallback(() => {
    setError(null);
    setMessage(null);
    try {
      const timer = startCameraTrialTimer(kind, { device, browser });
      setActiveTimer(timer);
      setMessage('Prueba iniciada. Siga el enlace y al volver registre el resultado.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar la prueba');
    }
  }, [kind, device, browser]);

  const handleResult = useCallback((status: CameraTrialStatus) => {
    setError(null);
    setMessage(null);
    const res = validateAndConsumeCameraTrialTimer(Date.now());
    if (!res.ok) {
      setError(res.error);
      setActiveTimer(getActiveCameraTrialTimer());
      return;
    }
    const trialDevice = res.device || device;
    const trialBrowser = res.browser || browser;
    const record: CameraTrialRecord = {
      device: trialDevice,
      browser: trialBrowser,
      kind: res.kind,
      status,
      elapsedMs: Math.max(0, Math.min(600000, Math.round(res.elapsedMs))),
      timestamp: new Date().toISOString(),
    };
    const next = addCameraTrial(record);
    setTrials(next);
    setActiveTimer(null);
    setMessage(status === 'readable' ? 'Resultado registrado como legible (autoinformado).' : 'Resultado registrado como fallido (autoinformado).');
  }, [device, browser]);

  const handleClear = useCallback(() => {
    setError(null);
    setMessage(null);
    const next = clearCameraTrials();
    setTrials(next);
    setActiveTimer(getActiveCameraTrialTimer());
    setMessage('Pruebas borradas.');
  }, []);

  const aggregates = useMemo(() => {
    const safeTrials = mounted ? trials : [];
    const total = safeTrials.length;
    const readable = safeTrials.filter((t) => t.status === 'readable').length;
    const failed = safeTrials.filter((t) => t.status === 'failed').length;
    const byDevice = safeTrials.reduce<Record<string, { total: number; readable: number; failed: number }>>((acc, t) => {
      if (!acc[t.device]) acc[t.device] = { total: 0, readable: 0, failed: 0 };
      acc[t.device].total += 1;
      if (t.status === 'readable') acc[t.device].readable += 1;
      else acc[t.device].failed += 1;
      return acc;
    }, {});
    const byBrowser = safeTrials.reduce<Record<string, { total: number; readable: number; failed: number }>>((acc, t) => {
      if (!acc[t.browser]) acc[t.browser] = { total: 0, readable: 0, failed: 0 };
      acc[t.browser].total += 1;
      if (t.status === 'readable') acc[t.browser].readable += 1;
      else acc[t.browser].failed += 1;
      return acc;
    }, {});
    const byKind = safeTrials.reduce<Record<string, { total: number; readable: number; failed: number }>>((acc, t) => {
      if (!acc[t.kind]) acc[t.kind] = { total: 0, readable: 0, failed: 0 };
      acc[t.kind].total += 1;
      if (t.status === 'readable') acc[t.kind].readable += 1;
      else acc[t.kind].failed += 1;
      return acc;
    }, {});
    return { total, readable, failed, byDevice, byBrowser, byKind };
  }, [trials, mounted]);

  const handleExport = useCallback(() => {
    try {
      const sanitized = (mounted ? trials : []).map((t) => ({
        device: t.device,
        browser: t.browser,
        kind: t.kind,
        status: t.status,
        elapsedMs: t.elapsedMs,
        timestamp: t.timestamp,
      }));
      const exportData = {
        aggregates,
        trials: sanitized,
      };
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `camera-trials-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, [trials, mounted, aggregates]);

  return (
    <section aria-labelledby="camera-trials-title" className="bg-surface-elevated border border-surface-border rounded-2xl p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 id="camera-trials-title" className="font-headline-md text-headline-md text-on-surface mb-1 flex items-center gap-2">
            <Icon className="text-[22px] text-primary">camera_alt</Icon>
            Pruebas de cámara
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Inicie la prueba manualmente, siga el enlace a catálogo o registro y vuelva para marcar el resultado.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-error bg-error/10 p-3 rounded-xl border border-error/30 text-sm" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 text-on-surface bg-surface-base p-3 rounded-xl border border-surface-border text-sm">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <label className="flex flex-col gap-2">
          <span className="font-label-md text-on-surface">Dispositivo</span>
          <select
            value={device}
            onChange={(e) => setDevice(e.target.value as CameraTrialDevice)}
            className="min-h-11 rounded-xl border border-surface-border bg-surface-base px-3 text-on-surface"
            aria-label="Dispositivo"
          >
            {DEVICES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-label-md text-on-surface">Navegador</span>
          <select
            value={browser}
            onChange={(e) => setBrowser(e.target.value as CameraTrialBrowser)}
            className="min-h-11 rounded-xl border border-surface-border bg-surface-base px-3 text-on-surface"
            aria-label="Navegador"
          >
            {BROWSERS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-label-md text-on-surface">Tipo</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as CameraTrialKind)}
            className="min-h-11 rounded-xl border border-surface-border bg-surface-base px-3 text-on-surface"
            aria-label="Tipo"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>{k === 'barcode' ? 'Código de barras' : 'Boleta'}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row flex-wrap gap-2">
        <button
          type="button"
          onClick={handleStart}
          className="min-h-11 min-w-[44px] rounded-xl px-4 py-2 bg-primary text-on-primary flex items-center justify-center gap-2"
          aria-label="Iniciar prueba"
        >
          <Icon className="text-[18px]">play_arrow</Icon>
          Iniciar prueba
        </button>
        <Link
          href="/catalogo"
          className="min-h-11 min-w-[44px] rounded-xl px-4 py-2 border border-surface-border text-on-surface flex items-center justify-center gap-2 hover:bg-surface-base"
        >
          Ir a /catalogo
        </Link>
        <Link
          href="/registro"
          className="min-h-11 min-w-[44px] rounded-xl px-4 py-2 border border-surface-border text-on-surface flex items-center justify-center gap-2 hover:bg-surface-base"
        >
          Ir a /registro
        </Link>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleResult('readable')}
          disabled={!(mounted && activeTimer)}
          className="min-h-11 min-w-[44px] rounded-xl px-4 py-2 border border-surface-border text-on-surface disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:bg-surface-base"
          aria-label="Marcar legible"
        >
          <Icon className="text-[18px]">check_circle</Icon>
          Legible
        </button>
        <button
          type="button"
          onClick={() => handleResult('failed')}
          disabled={!(mounted && activeTimer)}
          className="min-h-11 min-w-[44px] rounded-xl px-4 py-2 border border-surface-border text-on-surface disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:bg-surface-base"
          aria-label="Marcar fallido"
        >
          <Icon className="text-[18px]">cancel</Icon>
          Fallido
        </button>
        {mounted && activeTimer && (
          <span className="min-h-11 flex items-center px-3 text-sm text-on-surface-variant">
            Temporizador activo ({activeTimer.kind}) · tiempo medido de ida/vuelta + revisión (autoinformado)
          </span>
        )}
      </div>

      <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-surface-border bg-surface-base p-3">
          <p className="text-xs text-on-surface-variant">Total</p>
          <p className="text-lg font-semibold text-on-surface">{aggregates.total}</p>
        </div>
        <div className="rounded-xl border border-surface-border bg-surface-base p-3">
          <p className="text-xs text-on-surface-variant">Legibles</p>
          <p className="text-lg font-semibold text-on-surface">{aggregates.readable}</p>
        </div>
        <div className="rounded-xl border border-surface-border bg-surface-base p-3">
          <p className="text-xs text-on-surface-variant">Fallidos</p>
          <p className="text-lg font-semibold text-on-surface">{aggregates.failed}</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-surface-border bg-surface-base overflow-x-auto">
          <div className="p-2 text-xs text-on-surface-variant">Por dispositivo</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left p-2 font-label-sm text-on-surface-variant">Dispositivo</th>
                <th className="text-right p-2 font-label-sm text-on-surface-variant">Total</th>
                <th className="text-right p-2 font-label-sm text-on-surface-variant">Leg.</th>
                <th className="text-right p-2 font-label-sm text-on-surface-variant">Fall.</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(aggregates.byDevice).map(([key, v]) => (
                <tr key={key} className="border-b border-surface-border/60 last:border-0">
                  <td className="p-2 text-on-surface">{key}</td>
                  <td className="p-2 text-right text-on-surface tabular-nums">{v.total}</td>
                  <td className="p-2 text-right text-on-surface tabular-nums">{v.readable}</td>
                  <td className="p-2 text-right text-on-surface tabular-nums">{v.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border border-surface-border bg-surface-base overflow-x-auto">
          <div className="p-2 text-xs text-on-surface-variant">Por navegador</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left p-2 font-label-sm text-on-surface-variant">Navegador</th>
                <th className="text-right p-2 font-label-sm text-on-surface-variant">Total</th>
                <th className="text-right p-2 font-label-sm text-on-surface-variant">Leg.</th>
                <th className="text-right p-2 font-label-sm text-on-surface-variant">Fall.</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(aggregates.byBrowser).map(([key, v]) => (
                <tr key={key} className="border-b border-surface-border/60 last:border-0">
                  <td className="p-2 text-on-surface">{key}</td>
                  <td className="p-2 text-right text-on-surface tabular-nums">{v.total}</td>
                  <td className="p-2 text-right text-on-surface tabular-nums">{v.readable}</td>
                  <td className="p-2 text-right text-on-surface tabular-nums">{v.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border border-surface-border bg-surface-base overflow-x-auto">
          <div className="p-2 text-xs text-on-surface-variant">Por tipo</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left p-2 font-label-sm text-on-surface-variant">Tipo</th>
                <th className="text-right p-2 font-label-sm text-on-surface-variant">Total</th>
                <th className="text-right p-2 font-label-sm text-on-surface-variant">Leg.</th>
                <th className="text-right p-2 font-label-sm text-on-surface-variant">Fall.</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(aggregates.byKind).map(([key, v]) => (
                <tr key={key} className="border-b border-surface-border/60 last:border-0">
                  <td className="p-2 text-on-surface">{key === 'barcode' ? 'Código de barras' : 'Boleta'}</td>
                  <td className="p-2 text-right text-on-surface tabular-nums">{v.total}</td>
                  <td className="p-2 text-right text-on-surface tabular-nums">{v.readable}</td>
                  <td className="p-2 text-right text-on-surface tabular-nums">{v.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={handleExport}
          className="min-h-11 flex-1 border border-surface-border rounded-xl px-4 py-2 text-on-surface hover:bg-surface-base flex items-center justify-center gap-2"
        >
          <Icon className="text-[18px]">download</Icon>
          Descargar JSON
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="min-h-11 flex-1 border border-error/40 text-error rounded-xl px-4 py-2 hover:bg-error/10 flex items-center justify-center gap-2"
        >
          <Icon className="text-[18px]">delete</Icon>
          Borrar solo pruebas
        </button>
      </div>

      {mounted && trials.length > 0 && (
        <div className="rounded-xl border border-surface-border bg-surface-base overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left p-3 font-label-sm text-on-surface-variant">Fecha/hora</th>
                <th className="text-left p-3 font-label-sm text-on-surface-variant">Dispositivo</th>
                <th className="text-left p-3 font-label-sm text-on-surface-variant">Navegador</th>
                <th className="text-left p-3 font-label-sm text-on-surface-variant">Tipo</th>
                <th className="text-left p-3 font-label-sm text-on-surface-variant">Resultado</th>
                <th className="text-right p-3 font-label-sm text-on-surface-variant">Tiempo (ms)</th>
              </tr>
            </thead>
            <tbody>
              {trials.slice().reverse().map((t, idx) => (
                <tr key={idx} className="border-b border-surface-border/60 last:border-0">
                  <td className="p-3 text-on-surface">{formatDate(t.timestamp)}</td>
                  <td className="p-3 text-on-surface">{t.device}</td>
                  <td className="p-3 text-on-surface">{t.browser}</td>
                  <td className="p-3 text-on-surface">{t.kind === 'barcode' ? 'Código de barras' : 'Boleta'}</td>
                  <td className="p-3 text-on-surface">{t.status === 'readable' ? 'Legible' : 'Fallido'}</td>
                  <td className="p-3 text-right text-on-surface tabular-nums">{t.elapsedMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
