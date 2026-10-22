import Icon from '@/components/Icon';
import { useState, useRef, useMemo } from 'react';
import { Venta } from '@/types/venta';
import { setMetaMensual } from '@/lib/meta';
import { useStoredString } from '@/hooks/useStoredString';
import { chileDate } from '@/lib/validation';
import { comisionTelefonia } from '@/lib/commissions';

interface DashboardCardsProps {
  ventas: Venta[];
}

export default function DashboardCards({ ventas }: DashboardCardsProps) {
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [draftMeta, setMetaMensualState] = useState<number | null>(null);
  const [simuladorPrecio, setSimuladorPrecio] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  const currentMonth = chileDate().slice(0, 7);
  const storedMeta = useStoredString(`trackretail_meta_${currentMonth}`);
  const metaMensual = draftMeta ?? (Number(storedMeta) > 0 ? Number(storedMeta) : 150000);

  const handleSaveMeta = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (metaMensual < 10000) setMetaMensualState(10000);
    setMetaMensual(currentMonth, Math.max(metaMensual, 10000));
    setIsEditingMeta(false);
  };

  // Memoizar todos los cálculos — solo recalcula cuando cambia el array de ventas
  const stats = useMemo(() => {
    const totalComisiones = ventas.reduce((acc, v) => acc + (v.comision_calculada || 0), 0);
    const garantiasVendidas = ventas.length;
    const internetSales = ventas.filter(v => v.canal === 'internet').length;
    const internetPercent = garantiasVendidas > 0 ? Math.round((internetSales / garantiasVendidas) * 100) : 0;
    const promedioComision = garantiasVendidas > 0 ? Math.round(totalComisiones / garantiasVendidas) : 0;

    const [year, month, currentDay] = chileDate().split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const remainingDays = daysInMonth - currentDay + 1;

    return { totalComisiones, garantiasVendidas, internetSales, internetPercent, promedioComision, remainingDays };
  }, [ventas]);

  // Memoizar métricas dependientes de meta — recalcula cuando cambia meta o ventas
  const metaStats = useMemo(() => {
    const progresoMeta = Math.min(100, Math.round((stats.totalComisiones / metaMensual) * 100));
    const faltaParaMeta = Math.max(0, metaMensual - stats.totalComisiones);
    const metaDiaria = stats.remainingDays > 0 ? Math.ceil(faltaParaMeta / stats.remainingDays) : faltaParaMeta;
    return { progresoMeta, faltaParaMeta, metaDiaria };
  }, [stats, metaMensual]);

  const { totalComisiones, garantiasVendidas, internetSales, internetPercent, promedioComision } = stats;
  const { progresoMeta, faltaParaMeta, metaDiaria } = metaStats;


  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
      {/* Featured Card: Projected Bonus (Spans 2 cols) */}
      <div className="glass-card rounded-xl p-6 md:col-span-2 group hover:scale-[1.01] transition-all duration-300 relative overflow-hidden border-secondary/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-secondary/10 via-transparent to-transparent pointer-events-none"></div>
        <div className="flex flex-col h-full justify-between relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-secondary/20 text-secondary flex items-center justify-center border border-secondary/30 neon-glow-secondary">
                <Icon className="text-[24px]">redeem</Icon>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Bono Proyectado</h3>
            </div>
            <button 
              onClick={() => {
                setIsEditingMeta(true);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              className="text-on-surface-variant hover:text-secondary transition-colors"
              title="Editar meta"
              aria-label="Editar meta mensual"
            >
              <Icon className=" text-[20px]">edit</Icon>
            </button>
          </div>
          <div className="mt-auto">
            <div className="flex items-baseline gap-3 mb-2 flex-wrap">
              <p className="text-[32px] md:text-[40px] font-bold leading-none text-secondary drop-shadow-[0_0_10px_rgba(78,222,163,0.5)] tracking-tight">
                ${totalComisiones.toLocaleString('es-CL')}
              </p>
              <p className="font-body-md text-body-md text-on-surface-variant">estimado</p>
            </div>
            {/* Progress Bar */}
            <div className="w-full bg-surface-base rounded-full h-1.5 mt-4 border border-surface-border overflow-hidden">
              <div 
                className="bg-secondary h-1.5 rounded-full relative"
                style={{ width: progresoMeta + '%' }}
              >
              </div>
            </div>
            <div className="flex flex-wrap gap-3 justify-between items-end mt-2 font-label-sm text-label-sm">
              <span className={progresoMeta >= 100 ? "text-secondary font-bold" : "text-on-surface-variant"}>
                {progresoMeta >= 100 ? '¡Meta superada!' : `Faltan $${faltaParaMeta.toLocaleString('es-CL')}`}
                {progresoMeta < 100 && (
                  <span className="block text-secondary/80 text-[12px] mt-1.5 font-medium">
                    Meta diaria sugerida: ${metaDiaria.toLocaleString('es-CL')} / día
                  </span>
                )}
              </span>
              
              <div className="flex items-center gap-2">
                <span className="text-on-surface-variant">Meta:</span>
                {isEditingMeta ? (
                  <form onSubmit={handleSaveMeta} className="flex items-center gap-1">
                    <span className="text-secondary">$</span>
                    <input
                      ref={inputRef}
                      type="number"
                      aria-label="Meta mensual en pesos"
                      min="10000"
                      step="1"
                      value={metaMensual}
                      onChange={e => setMetaMensualState(Number(e.target.value))}
                      onBlur={() => handleSaveMeta()}
                      className="bg-surface-base border border-surface-border text-secondary rounded px-2 py-0.5 w-24 outline-none focus:border-secondary font-bold text-right"
                    />
                  </form>
                ) : (
                  <span 
                    className="text-on-surface font-bold cursor-pointer hover:text-secondary transition-colors"
                    onClick={() => {
                      setIsEditingMeta(true);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                  >
                    ${metaMensual.toLocaleString('es-CL')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Total Sales (Garantías) */}
      <div className="glass-card rounded-xl p-6 group hover:scale-[1.02] transition-all duration-300 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl -mr-10 -mt-10 transition-all group-hover:bg-primary/20"></div>
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
            <Icon className="text-[24px]">receipt_long</Icon>
          </div>
        </div>
        <div className="relative z-10">
          <h3 className="font-label-md text-label-md text-on-surface-variant mb-1">Garantías Totales</h3>
          <div className="flex items-baseline gap-2">
            <p className="font-headline-md text-headline-md text-on-surface">{garantiasVendidas}</p>
            <p className="font-label-sm text-label-sm text-primary">vendidas</p>
          </div>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-3 border-t border-surface-border pt-3">
            Promedio: <span className="text-on-surface font-medium">${promedioComision.toLocaleString('es-CL')}</span> c/u
          </p>
        </div>
      </div>

      {/* Card 3: Internet vs Physical */}
      <div className="glass-card rounded-xl p-6 group hover:scale-[1.02] transition-all duration-300 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-tertiary/10 rounded-full blur-2xl -mr-10 -mt-10 transition-all group-hover:bg-tertiary/20"></div>
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div className="w-10 h-10 rounded-lg bg-tertiary/10 text-tertiary flex items-center justify-center border border-tertiary/20">
            <Icon className="text-[24px]">shopping_cart</Icon>
          </div>
          <span className="bg-tertiary/10 text-tertiary font-label-sm text-label-sm px-2 py-0.5 rounded-full border border-tertiary/20">
            {internetPercent}%
          </span>
        </div>
        <div className="relative z-10">
          <h3 className="font-label-md text-label-md text-on-surface-variant mb-1">Ventas Web</h3>
          <div className="flex items-baseline gap-2">
            <p className="font-headline-md text-headline-md text-on-surface">
              {internetSales}
            </p>
            <p className="font-label-sm text-label-sm text-tertiary">boletas</p>
          </div>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-3 border-t border-surface-border pt-3">
            Física: <span className="text-on-surface font-medium">{garantiasVendidas - internetSales}</span> boletas
          </p>
        </div>
      </div>

      {/* Card 4: Simulador Rápido */}
      <div className="glass-card rounded-xl p-6 relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
        <div className="absolute top-0 right-0 w-24 h-24 bg-primary-container/10 rounded-full blur-2xl -mr-10 -mt-10 transition-all group-hover:bg-primary-container/20"></div>
        <div className="relative z-10 h-full flex flex-col justify-between">
          <div>
            <h3 className="font-label-md text-label-md text-on-surface mb-3 flex items-center gap-2">
              <Icon className=" text-primary text-[20px]">calculate</Icon>
              Simulador de Comisión
            </h3>
            <div className="flex gap-2 items-center mb-3">
              <span className="text-on-surface-variant font-medium">$</span>
              <input 
                type="number"
                placeholder="Valor garantía"
                aria-label="Valor de garantía para telefonía de un año"
                min="0"
                step="1"
                value={simuladorPrecio}
                onChange={(e) => setSimuladorPrecio(e.target.value)}
                className="w-full bg-surface-base border border-surface-border text-on-surface rounded-lg p-2.5 text-sm outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-surface-border mt-auto">
            <span className="text-label-sm text-on-surface-variant">Telefonía · 1 año:</span>
            <span className="font-bold text-secondary text-[18px]">
              ${simuladorPrecio ? comisionTelefonia(Number(simuladorPrecio), 1).toLocaleString('es-CL') : '0'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
