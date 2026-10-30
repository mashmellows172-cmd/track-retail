'use client';
import { useEffect, useState } from 'react';
import type { ProductHistoryEntry } from '@/lib/stockStorage';
import { loadProductHistory } from '@/lib/stockStorage';

const money = (n: number) => n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
type HistoryResult = { plu: string; history: ProductHistoryEntry[]; error: string };

export default function ProductHistoryList({ plu }: { plu: string }) {
  const [result, setResult] = useState<HistoryResult | null>(null);
  useEffect(() => {
    let active = true;
    void loadProductHistory(plu).then(history => {
      if (active) setResult({ plu, history, error: '' });
    }).catch((error: unknown) => {
      if (active) setResult({ plu, history: [], error: error instanceof Error ? error.message : 'No se pudo cargar el historial.' });
    });
    return () => { active = false; };
  }, [plu]);
  if (!result || result.plu !== plu) return <p role="status" className="text-sm text-on-surface-variant">Cargando historial...</p>;
  if (result.error) return <p role="alert" className="text-sm text-error">{result.error}</p>;
  if (!result.history.length) return <p className="text-sm text-on-surface-variant">Sin historial registrado.</p>;
  return <div className="space-y-2">
    <h3 className="font-semibold">Historial (por fecha de informe)</h3>
    <ul className="divide-y divide-surface-border rounded-xl border border-surface-border overflow-hidden">
      {result.history.slice().reverse().map(entry => <li key={`${entry.store}-${entry.date}`} className="p-3 flex items-center justify-between gap-3 bg-surface-base">
        <div><p className="font-medium">{entry.date}</p><p className="text-xs text-on-surface-variant">{entry.store}</p></div>
        <div className="text-right"><p className="tabular-nums">{entry.price ? money(entry.price) : 'Sin precio'}</p><p className="text-xs text-on-surface-variant">{entry.available} disp. / {entry.existence ?? 'N/D'}</p></div>
      </li>)}
    </ul>
  </div>;
}
