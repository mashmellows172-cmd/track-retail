'use client';

import Icon from '@/components/Icon';
import { useState } from 'react';
import { VentaOCR, Venta } from '@/types/venta';
import { useToast } from '@/components/ToastProvider';
import { Haptics } from '@/lib/haptics';
import { chileDate, saleError } from '@/lib/validation';
import { parseSaleDraft } from '@/lib/draft';

interface ConfirmacionFormProps {
  initialData: VentaOCR;
  onConfirm: (data: Omit<Venta, 'id' | 'created_at' | 'comision_calculada'>) => Promise<void>;
  onCancel: () => void;
}

const inputClass = 'w-full bg-surface-base border border-surface-border rounded-lg p-2.5 text-on-surface focus:border-primary/60 focus:ring-1 focus:ring-primary/30 outline-none transition-colors font-body-md text-body-md';
const labelClass = 'block font-label-sm text-label-sm text-on-surface-variant mb-1.5';

export default function ConfirmacionForm({ initialData, onConfirm, onCancel }: ConfirmacionFormProps) {
  const sanitizeNumber = (val: unknown): number => {
    if (typeof val === 'number') return Number.isSafeInteger(val) && val >= 0 ? val : 0;
    if (!val) return 0;
    const str = String(val).replace(/[^0-9]/g, '');
    return Number(str);
  };

  const [formData, setFormData] = useState(() => {
    // Si es ingreso manual (folio vacío), intentar recuperar borrador
    if (!initialData.folio) {
      try {
        const savedDraft = sessionStorage.getItem('trackretail_draft_venta');
        if (savedDraft) {
          const parsed = parseSaleDraft(JSON.parse(savedDraft));
          if (parsed) return parsed;
        }
      } catch { /* Continue with the receipt when storage is unavailable. */ }
    }
    
    // Si es OCR o no hay borrador, sanear los datos de la IA
    return {
      folio: initialData.folio || '',
      fecha_compra: initialData.fecha_compra || chileDate(),
      canal: (initialData.canal || 'caja') as 'caja' | 'internet',
      precio_producto: sanitizeNumber(initialData.precio_producto),
      cantidad_unidades: sanitizeNumber(initialData.cantidad_unidades) || 1,
      valor_garantia: sanitizeNumber(initialData.valor_garantia),
      total_boleta: sanitizeNumber(initialData.total_boleta),
      numero_pedido: initialData.numero_pedido || '',
      anos_garantia: (sanitizeNumber(initialData.anos_garantia) || 1) as 1 | 2 | 3 | 4,
      tipo_garantia: 'telefonia' as 'telefonia' | 'lineas_duras',
      vendedor_id: '',
    };
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    Haptics.medium();

    let savedVendedor = null;
    try {
      savedVendedor = localStorage.getItem('trackretail_vendedor');
    } catch {
      console.warn('LocalStorage inaccesible');
    }
    
    if (!savedVendedor) {
      showToast('Configura tu nombre en la barra superior antes de registrar.', 'error');
      setIsSubmitting(false);
      return;
    }
    const validationError = saleError({ ...formData, vendedor_id: savedVendedor });
    if (validationError) { showToast(validationError, 'error'); setIsSubmitting(false); return; }
    try {
      await onConfirm({ ...formData, vendedor_id: savedVendedor });
      try { sessionStorage.removeItem('trackretail_draft_venta'); } catch { /* Sale already saved. */ }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido al guardar';
      showToast(errorMsg, 'error');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const numFields = ['precio_producto', 'cantidad_unidades', 'valor_garantia', 'total_boleta', 'anos_garantia'];
    const next = {
      ...formData,
      [name]: numFields.includes(name) ? Number(value) : value,
      ...(name === 'tipo_garantia' && value === 'telefonia' && formData.anos_garantia > 2 ? { anos_garantia: 2 as const } : {}),
    };
    setFormData(next);
    try { sessionStorage.setItem('trackretail_draft_venta', JSON.stringify(next)); }
    catch { /* Manual submission still works without draft storage. */ }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-surface-elevated border border-surface-border rounded-2xl p-4 sm:p-6 shadow-sm">
      <h2 className="font-headline-md text-headline-md text-on-surface mb-1">Confirmar Datos</h2>
      <p className="font-label-md text-label-md text-on-surface-variant mb-6">
        Revisa los datos antes de guardar la venta.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="venta-folio" className={labelClass}>Folio Boleta</label>
          <input required type="text" id="venta-folio" name="folio" value={formData.folio} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label htmlFor="venta-fecha_compra" className={labelClass}>Fecha de Compra</label>
          <input required type="date" id="venta-fecha_compra" name="fecha_compra" value={formData.fecha_compra} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label htmlFor="venta-canal" className={labelClass}>Canal de Venta</label>
          <select id="venta-canal" name="canal" value={formData.canal} onChange={handleChange} className={inputClass}>
            <option value="caja">Caja (Tienda física)</option>
            <option value="internet">Internet (Venta asistida)</option>
          </select>
        </div>

        {formData.canal === 'internet' && (
          <div>
            <label htmlFor="venta-numero_pedido" className={labelClass}>Nº Pedido Online</label>
            <input type="text" id="venta-numero_pedido" name="numero_pedido" value={formData.numero_pedido} onChange={handleChange} className={inputClass} />
          </div>
        )}

        <div>
          <label htmlFor="venta-precio_producto" className={labelClass}>Precio Producto ($)</label>
          <input required type="number" min="0" max="999999999999" step="1" inputMode="numeric" id="venta-precio_producto" name="precio_producto" value={formData.precio_producto} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label htmlFor="venta-total_boleta" className={labelClass}>Total Boleta ($)</label>
          <input required type="number" min="0" max="999999999999" step="1" inputMode="numeric" id="venta-total_boleta" name="total_boleta" value={formData.total_boleta} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label htmlFor="venta-cantidad_unidades" className={labelClass}>Cantidad de Unidades</label>
          <input required id="venta-cantidad_unidades" type="number" min="1" max="9999" step="1" inputMode="numeric" name="cantidad_unidades" value={formData.cantidad_unidades} onChange={handleChange} className={inputClass} />
        </div>

        {/* Divider */}
        <div className="col-span-1 md:col-span-2 pt-4 mt-2 border-t border-surface-border">
          <p className="font-label-md text-label-md text-tertiary flex items-center gap-2">
            <Icon className=" text-[18px]">shield</Icon>
            Detalle Garantía — Más Protección
          </p>
        </div>

        <div>
          <label htmlFor="venta-valor_garantia" className={labelClass}>Valor Garantía ($)</label>
          <input required type="number" min="0" max="999999999999" step="1" inputMode="numeric" id="venta-valor_garantia" name="valor_garantia" value={formData.valor_garantia} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label htmlFor="venta-anos_garantia" className={labelClass}>Años Garantía</label>
          <select id="venta-anos_garantia" name="anos_garantia" value={formData.anos_garantia} onChange={handleChange} className={inputClass}>
            <option value={1}>1 Año</option>
            <option value={2}>2 Años</option>
            {formData.tipo_garantia === 'lineas_duras' && <option value={3}>3 Años</option>}
            {formData.tipo_garantia === 'lineas_duras' && <option value={4}>4 Años</option>}
          </select>
        </div>

        <div className="md:col-span-2">
          <label htmlFor="venta-tipo_garantia" className={labelClass}>Tipo de Producto</label>
          <select id="venta-tipo_garantia" name="tipo_garantia" value={formData.tipo_garantia} onChange={handleChange} className={inputClass}>
            <option value="telefonia">Telefonía</option>
            <option value="lineas_duras">Líneas Duras (Electro / Deporte)</option>
          </select>
        </div>
      </div>

      <div className="flex gap-3 mt-8">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 border border-surface-border hover:bg-surface-base text-on-surface-variant py-3 rounded-xl font-label-md text-label-md transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 bg-secondary text-on-secondary py-3 rounded-xl font-label-md text-label-md hover:scale-[1.02] transition-all shadow-sm disabled:opacity-50 disabled:scale-100"
        >
          {isSubmitting ? 'Guardando...' : 'Confirmar Venta ✓'}
        </button>
      </div>
    </form>
  );
}
