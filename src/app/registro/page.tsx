'use client';

import Icon from '@/components/Icon';
import { useState } from 'react';
import Scanner from '@/components/Scanner';
import ConfirmacionForm from '@/components/ConfirmacionForm';
import { VentaOCR } from '@/types/venta';
import Link from 'next/link';
import { enqueueSale, withQueueLock } from '@/lib/offlineQueue';
import { chileDate } from '@/lib/validation';
import type { Venta } from '@/types/venta';

export default function RegistroPage() {
  const [scannedData, setScannedData] = useState<VentaOCR | null>(null);
  const [successData, setSuccessData] = useState<{ comision: number, folio: string, pending?: boolean } | null>(null);

  const handleScanSuccess = (data: VentaOCR) => {
    setScannedData(data);
    setSuccessData(null);
  };

  const handleConfirm = async (data: unknown) => {
    try {
      const res = await fetch('/api/ventas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 409) {
          throw new Error('Esta boleta ya fue ingresada (folio duplicado).');
        }
        if (res.status >= 500) {
          throw new Error('SERVER_ERROR');
        }
        throw new Error(errorData.error || 'Error al guardar la venta');
      }

      const savedData = await res.json();
      setSuccessData({
        comision: savedData.comision_calculada || 0,
        folio: savedData.folio || 'Desconocido'
      });
      setScannedData(null);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error de red';
      // Detectar fallas de red o errores 500 del servidor
      if (error instanceof TypeError || !navigator.onLine || msg === 'SERVER_ERROR' || msg.toLowerCase().includes('network')) {
        try {
          await withQueueLock(() => enqueueSale(localStorage, data as Venta));
          window.dispatchEvent(new Event('trackretail:storage'));
        } catch {
          throw new Error('No se pudo guardar en este dispositivo. Conserva el formulario y vuelve a intentar.');
        }
        
        // Simular éxito para no bloquear al usuario
        setSuccessData({
          comision: 0, 
          folio: (data as VentaOCR).folio || '', pending: true,
        });
        setScannedData(null);
        return;
      }
      throw error; // Lanzar errores normales (como duplicados 409) para que ConfirmacionForm los atrape
    }
  };

  const handleManualEntry = () => {
    setScannedData({
      folio: '',
      fecha_compra: chileDate(),
      precio_producto: null,
      cantidad_unidades: 1,
      valor_garantia: null,
      total_boleta: null,
      canal: 'caja',
      numero_pedido: null,
    });
  };

  const handleCancel = () => setScannedData(null);

  return (
    <div className="max-w-2xl mx-auto w-full">
      {/* Header */}
      <header className="pb-8 border-b border-white/5 mb-8">
        <h2 className="font-display-lg-mobile md:font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface">
          Nueva Boleta
        </h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant mt-2">
          Escanea o sube una boleta para registrar tu comisión.
        </p>
      </header>

      {/* Vistas Principales */}
      {successData ? (
        <div className="glass-panel rounded-2xl p-8 text-center animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-secondary/10 text-secondary rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(78,222,163,0.3)]">
            <Icon className=" text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</Icon>
          </div>
          <h3 className="font-display-md text-display-md text-on-surface mb-2">{successData.pending ? 'Boleta pendiente de sincronización' : '¡Boleta Registrada!'}</h3>
          <p className="font-body-md text-body-md text-on-surface-variant mb-6">
            La boleta folio <strong className="text-on-surface break-all">{successData.folio}</strong> {successData.pending ? 'está guardada únicamente en este dispositivo. Se reintentará al recuperar conexión o abrir la aplicación. No borres los datos del navegador.' : 'fue procesada y guardada exitosamente en tu base de datos.'}
          </p>
          
          <div className="bg-black/20 rounded-xl p-4 inline-block min-w-[200px] mb-8 border border-white/5">
            <p className="font-label-sm text-label-sm text-on-surface-variant mb-1">Comisión Calculada</p>
            <p className="font-headline-lg text-headline-lg text-secondary">{successData.pending ? 'Pendiente' : `$${successData.comision.toLocaleString('es-CL')}`}</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/historial"
              className="flex-1 max-w-[200px] mx-auto sm:mx-0 bg-surface-container border border-white/10 text-on-surface font-label-md text-label-md py-3 px-6 rounded-xl hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
            >
              <Icon className=" text-[20px]">receipt_long</Icon>
              Ver Historial
            </Link>
            <button
              onClick={() => setSuccessData(null)}
              className="flex-1 max-w-[200px] mx-auto sm:mx-0 bg-gradient-to-r from-primary-container to-inverse-primary text-on-primary-container font-label-md text-label-md py-3 px-6 rounded-xl hover:scale-[1.02] transition-transform shadow-[0_0_15px_rgba(77,142,255,0.3)] flex items-center justify-center gap-2"
            >
              <Icon className=" text-[20px]">qr_code_scanner</Icon>
              Registrar Otra
            </button>
          </div>
        </div>
      ) : !scannedData ? (
        <Scanner onScanSuccess={handleScanSuccess} onManualEntry={handleManualEntry} />
      ) : (
        <ConfirmacionForm
          initialData={scannedData}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
