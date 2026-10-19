'use client';

import { useState, useEffect } from 'react';
import { VentaOCR, Venta } from '@/types/venta';
import { useToast } from '@/components/ToastProvider';
import { Haptics } from '@/lib/haptics';

interface ConfirmacionFormProps {
  initialData: VentaOCR;
  onConfirm: (data: Omit<Venta, 'id' | 'created_at' | 'comision_calculada'>) => Promise<void>;
  onCancel: () => void;
}

const inputClass = 'w-full bg-surface-base border border-surface-border rounded-lg p-2.5 text-on-surface focus:border-primary/60 focus:ring-1 focus:ring-primary/30 outline-none transition-colors font-body-md text-body-md';
const labelClass = 'block font-label-sm text-label-sm text-on-surface-variant mb-1.5';

export default function ConfirmacionForm({ initialData, onConfirm, onCancel }: ConfirmacionFormProps) {
  const sanitizeNumber = (val: any): number => {
    if (typeof val === 'number') return val;
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
          const parsed = JSON.parse(savedDraft);
          if (parsed && typeof parsed === 'object') return parsed;
        }
      } catch (e) {}
    }
    
    // Si es OCR o no hay borrador, sanear los datos de la IA
    return {
      folio: initialData.folio || '',
      fecha_compra: initialData.fecha_compra || new Date().toISOString().split('T')[0],
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

  useEffect(() => {
    sessionStorage.setItem('trackretail_draft_venta', JSON.stringify(formData));
  }, [formData]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    Haptics.medium();

    let savedVendedor = null;
    try {
      savedVendedor = localStorage.getItem('trackretail_vendedor');
    } catch (e) {
      console.warn('LocalStorage inaccesible');
    }
    
    if (!savedVendedor) {
      showToast('Configura tu nombre en la barra superior antes de registrar.', 'error');
      setIsSubmitting(false);
      return;
    }
    try {
      await onConfirm({ ...formData, vendedor_id: savedVendedor });
      sessionStorage.removeItem('trackretail_draft_venta');
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
    setFormData((prev: typeof formData) => ({
      ...prev,
      [name]: numFields.includes(name) ? Number(value) : value,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="bg-surface-elevated border border-surface-border rounded-2xl p-6 shadow-sm">
      <h2 className="font-headline-md text-headline-md text-on-surface mb-1">Confirmar Datos</h2>
      <p className="font-label-md text-label-md text-on-surface-variant mb-6">
        Revisa los datos antes de guardar la venta.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Folio Boleta</label>
          <input required type="text" name="folio" value={formData.folio} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Fecha de Compra</label>
          <input required type="date" name="fecha_compra" value={formData.fecha_compra} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Canal de Venta</label>
          <select name="canal" value={formData.canal} onChange={handleChange} className={inputClass}>
            <option value="caja">Caja (Tienda física)</option>
            <option value="internet">Internet (Venta asistida)</option>
          </select>
        </div>

        {formData.canal === 'internet' && (
          <div>
            <label className={labelClass}>Nº Pedido Online</label>
            <input type="text" name="numero_pedido" value={formData.numero_pedido} onChange={handleChange} className={inputClass} />
          </div>
        )}

        <div>
          <label className={labelClass}>Precio Producto ($)</label>
          <input required type="number" name="precio_producto" value={formData.precio_producto} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Total Boleta ($)</label>
          <input required type="number" name="total_boleta" value={formData.total_boleta} onChange={handleChange} className={inputClass} />
        </div>

        {/* Divider */}
        <div className="col-span-1 md:col-span-2 pt-4 mt-2 border-t border-surface-border">
          <p className="font-label-md text-label-md text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">shield</span>
            Detalle Garantía — Más Protección
          </p>
        </div>

        <div>
          <label className={labelClass}>Valor Garantía ($)</label>
          <input required type="number" name="valor_garantia" value={formData.valor_garantia} onChange={handleChange} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Años Garantía</label>
          <select name="anos_garantia" value={formData.anos_garantia} onChange={handleChange} className={inputClass}>
            <option value={1}>1 Año</option>
            <option value={2}>2 Años</option>
            {formData.tipo_garantia === 'lineas_duras' && <option value={3}>3 Años</option>}
            {formData.tipo_garantia === 'lineas_duras' && <option value={4}>4 Años</option>}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className={labelClass}>Tipo de Producto</label>
          <select name="tipo_garantia" value={formData.tipo_garantia} onChange={handleChange} className={inputClass}>
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
          className="flex-1 bg-gradient-to-r from-secondary-container to-secondary text-on-secondary py-3 rounded-xl font-label-md text-label-md hover:scale-[1.02] transition-all shadow-sm disabled:opacity-50 disabled:scale-100"
        >
          {isSubmitting ? 'Guardando...' : 'Confirmar Venta ✓'}
        </button>
      </div>
    </form>
  );
}
