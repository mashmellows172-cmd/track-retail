'use client';
import { useMemo, useRef, useState } from 'react';
import { CreditCard, Download } from 'lucide-react';
import { useStoredString, storeString } from '@/hooks/useStoredString';
import { cardCommission, cardMonthlyTotal, type CardCommissionRecord } from '@/lib/cardCommissions';
import { chileDate } from '@/lib/validation';

const money=(n:number)=>n.toLocaleString('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
const input='mt-2 min-h-12 w-full rounded-xl border border-surface-border bg-surface-base px-3';
const button='min-h-12 rounded-xl border border-surface-border px-4 py-2 inline-flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-surface-base';
export default function CardCommissionsPanel({ vendedor }: { vendedor: string }) {
  const key=`trackretail_cards_${vendedor}`;
  const stored=useStoredString(key);
  const [baseOverride,setBase]=useState<string | null>(null);
  const [activatedOverride,setActivatedTotal]=useState<string | null>(null);
  const [date,setDate]=useState(chileDate());
  const [month,setMonth]=useState(chileDate().slice(0,7));
  const [activated,setActivated]=useState(false);
  const [message,setMessage]=useState('');
  const [saving,setSaving]=useState(false);
  const savingRef=useRef(false);
  const {records,corrupt}=useMemo(()=>{
    try {
      const data=stored ? JSON.parse(stored) : [];
      if(!Array.isArray(data)) throw new Error();
      const ids=new Set<string>();
      for(const r of data) { if(!r || typeof r.id!=='string' || ids.has(r.id)) throw new Error(); cardCommission(r); ids.add(r.id); }
      return {records:data as CardCommissionRecord[],corrupt:false};
    } catch {return {records:[] as CardCommissionRecord[],corrupt:true};}
  },[stored]);
  const base=baseOverride ?? records.at(-1)?.base.toString() ?? '';
  const activatedTotal=activatedOverride ?? records.at(-1)?.activatedTotal.toString() ?? '';
  const monthly=records.filter(r=>r.openedOn.slice(0,7)===month);
  const total=cardMonthlyTotal(records,month);
  async function addRecord(e:React.FormEvent) {
    e.preventDefault();
    if(corrupt || savingRef.current) return;
    savingRef.current=true; setSaving(true);
    try {
      if(base==='' || activatedTotal==='') throw new Error('Configura ambos importes antes de registrar.');
      if(date>chileDate()) throw new Error('La fecha no puede estar en el futuro.');
      const record:CardCommissionRecord={id:crypto.randomUUID(),openedOn:date,activatedOn:activated ? date : null,base:Number(base),activatedTotal:Number(activatedTotal)};
      cardCommission(record);
      if(!navigator.locks) throw new Error('Este navegador no permite guardar tarjetas de forma segura entre ventanas. Usa una versión actual de Chrome, Safari o Edge.');
      await navigator.locks.request(key,()=>{
        if(localStorage.getItem(key)!==stored) throw new Error('Los registros cambiaron en otra ventana. Revisa el resumen antes de registrar.');
        storeString(key,JSON.stringify([...records,record]));
      });
      setMonth(date.slice(0,7)); setMessage('Tarjeta registrada en este dispositivo.');
    } catch(e) {setMessage(e instanceof Error ? e.message : 'No se pudo guardar. Los registros anteriores se conservan.');}
    finally {savingRef.current=false; setSaving(false);}
  }
  async function exportRecords() {
    const XLSX=await import('xlsx');
    const wb=XLSX.utils.book_new();
    const rows=monthly.map(r=>({'ID local':r.id,'Fecha':r.openedOn,'Estado':r.activatedOn ? 'Apertura y activación' : 'Solo apertura','Tarifa apertura':r.base,'Tarifa total activada':r.activatedTotal,'Comisión':cardCommission(r)}));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Tarjetas');
    XLSX.writeFile(wb,`Comisiones_Tarjetas_${month}.xlsx`);
  }
  return <section aria-labelledby="cards-title" className="my-6 rounded-2xl border border-surface-border bg-surface-elevated p-5 space-y-5">
    <div className="flex flex-wrap justify-between items-start gap-3"><div><h2 id="cards-title" className="text-xl font-semibold flex gap-2 items-center"><CreditCard aria-hidden="true" />Comisiones por tarjetas</h2><p className="text-sm text-on-surface-variant mt-2">Apertura con monto base. Activación el mismo día con monto total mayor. Cada tarjeta se registra una sola vez.</p></div><button type="button" disabled={!monthly.length || corrupt} onClick={()=>void exportRecords().catch(()=>setMessage('No se pudo exportar. Intenta nuevamente.'))} className={button}><Download size={18} aria-hidden="true" />Exportar tarjetas</button></div>
    {corrupt && <p role="alert" className="text-error">Los registros locales tienen un formato inválido. No se sobrescribirán; revisa su recuperación.</p>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><label className="text-sm">Mes del resumen<input type="month" className={input} value={month} onChange={e=>{if(e.target.value) setMonth(e.target.value);}} /></label><div className="rounded-xl bg-surface-base p-3"><p className="text-sm text-on-surface-variant">Solo apertura</p><p className="text-xl font-semibold mt-2">{monthly.filter(r=>!r.activatedOn).length}</p></div><div className="rounded-xl bg-surface-base p-3"><p className="text-sm text-on-surface-variant">Apertura y activación</p><p className="text-xl font-semibold mt-2">{monthly.filter(r=>r.activatedOn).length}</p></div><div className="rounded-xl bg-secondary/10 p-3"><p className="text-sm text-on-surface-variant">Comisión registrada de tarjetas</p><p className="text-xl font-semibold mt-2 text-secondary">{money(total)}</p></div></div>
    <form onSubmit={addRecord} className="space-y-4"><fieldset disabled={corrupt} className="grid grid-cols-1 sm:grid-cols-3 gap-4"><legend className="font-semibold mb-3">Registrar una tarjeta</legend><label className="text-sm">Fecha de apertura<input type="date" required max={chileDate()} value={date} onChange={e=>setDate(e.target.value)} className={input} /></label><label className="text-sm">Monto por apertura ($)<input required type="number" min="0" step="1" value={base} onChange={e=>setBase(e.target.value)} className={input} placeholder="Configura tu tarifa" /></label><label className="text-sm">Total por apertura y activación ($)<input required type="number" min={base || 0} step="1" value={activatedTotal} onChange={e=>setActivatedTotal(e.target.value)} className={input} placeholder="Incluye el monto de apertura" /></label></fieldset><label className="min-h-12 flex gap-3 items-center"><input type="checkbox" checked={activated} onChange={e=>setActivated(e.target.checked)} className="w-5 h-5 accent-secondary" />Se abrió y activó el mismo día</label><p className="text-sm text-on-surface-variant">Cambiar las tarifas solo afecta registros nuevos. No guardes nombres, números ni datos de clientes.</p><button disabled={corrupt || saving} className={`${button} bg-secondary/10 text-secondary`} type="submit">{saving ? "Guardando…" : "Registrar tarjeta"}</button></form>
    {message && <p role="status" className="text-sm">{message}</p>}
    {monthly.length>0 && <details><summary className="cursor-pointer min-h-12 flex items-center font-semibold">Ver últimos registros del mes ({monthly.length})</summary><ul className="divide-y divide-surface-border">{monthly.slice(-10).reverse().map(r=><li key={r.id} className="py-3 flex flex-wrap justify-between gap-2"><span>{r.openedOn} · {r.activatedOn ? 'Apertura y activación' : 'Solo apertura'}</span><strong>{money(cardCommission(r))}</strong></li>)}</ul></details>}
    <p className="text-xs text-on-surface-variant">Registro local por vendedor y navegador. Exporta tus datos como respaldo. Total estimado, separado de garantías.</p>
  </section>;
}
