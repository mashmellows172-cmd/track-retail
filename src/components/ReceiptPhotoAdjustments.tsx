'use client';

import Icon from '@/components/Icon';
import { Loader2 } from 'lucide-react';
import {
  MIN_CROP_PERCENT,
  type CropEdge,
  type CropEdges,
  type Rotation,
} from '@/lib/receiptAdjustments';

export type PhotoEnhancement = 'original' | 'optimized';

export interface PreparedPreview {
  url: string;
  width: number;
  height: number;
}

interface ReceiptPhotoAdjustmentsProps {
  edges: CropEdges;
  rotation: Rotation;
  enhancement: PhotoEnhancement;
  disabled: boolean;
  applying: boolean;
  preview: PreparedPreview | null;
  previewError: string | null;
  onEdgeChange: (edge: CropEdge, value: number) => void;
  onRotate: () => void;
  onEnhancementChange: (mode: PhotoEnhancement) => void;
  onRestore: () => void;
  onApply: () => void;
}

const EDGE_LABELS: Record<CropEdge, { label: string; hint: string }> = {
  left: { label: 'Borde izquierdo', hint: 'Recorta desde la izquierda de la foto original.' },
  top: { label: 'Borde superior', hint: 'Recorta desde arriba de la foto original.' },
  right: { label: 'Borde derecho', hint: 'Recorta desde la derecha de la foto original.' },
  bottom: { label: 'Borde inferior', hint: 'Recorta desde abajo de la foto original.' },
};

const buttonStyle = 'min-h-11 rounded-xl px-3 py-2 font-label-sm text-sm flex items-center justify-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50';

function CropEdgeControl({
  edge,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  edge: CropEdge;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const { label, hint } = EDGE_LABELS[edge];
  const id = `receipt-crop-${edge}`;
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-on-surface">{label}</label>
        <output htmlFor={id} className="tabular-nums text-sm text-on-surface-variant">{value} %</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-describedby={`${id}-hint`}
        className="mt-1 h-11 w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
      />
      <p id={`${id}-hint`} className="text-xs text-on-surface-variant">{hint}</p>
    </div>
  );
}

export default function ReceiptPhotoAdjustments({
  edges,
  rotation,
  enhancement,
  disabled,
  applying,
  preview,
  previewError,
  onEdgeChange,
  onRotate,
  onEnhancementChange,
  onRestore,
  onApply,
}: ReceiptPhotoAdjustmentsProps) {
  const leftMax = Math.max(0, edges.right - MIN_CROP_PERCENT);
  const rightMin = Math.min(100, edges.left + MIN_CROP_PERCENT);
  const topMax = Math.max(0, edges.bottom - MIN_CROP_PERCENT);
  const bottomMin = Math.min(100, edges.top + MIN_CROP_PERCENT);

  return (
    <details className="mb-4 rounded-xl border border-surface-border bg-surface-base">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        <Icon className="text-[22px] text-primary">tune</Icon>
        <span className="min-w-0">
          <span className="block font-label-md">Ajustar foto</span>
          <span className="block text-xs text-on-surface-variant">Recorte, giro y contraste (opcional)</span>
        </span>
        <Icon className="ml-auto shrink-0 text-[22px] text-on-surface-variant">expand_more</Icon>
      </summary>

      <div className="space-y-4 border-t border-surface-border p-3 sm:p-4">
        <p className="text-sm text-on-surface-variant">
          Los porcentajes de recorte se aplican a la foto original, antes de girarla. El archivo original no se modifica.
        </p>

        <fieldset disabled={disabled} className={`min-w-0 ${disabled ? 'opacity-60' : ''}`}>
          <legend className="mb-2 font-label-md text-on-surface">Recorte por bordes</legend>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <CropEdgeControl edge="left" value={edges.left} min={0} max={leftMax} disabled={disabled} onChange={(value) => onEdgeChange('left', value)} />
            <CropEdgeControl edge="top" value={edges.top} min={0} max={topMax} disabled={disabled} onChange={(value) => onEdgeChange('top', value)} />
            <CropEdgeControl edge="right" value={edges.right} min={rightMin} max={100} disabled={disabled} onChange={(value) => onEdgeChange('right', value)} />
            <CropEdgeControl edge="bottom" value={edges.bottom} min={bottomMin} max={100} disabled={disabled} onChange={(value) => onEdgeChange('bottom', value)} />
          </div>
          <p className="mt-2 text-xs text-on-surface-variant">Cada borde conserva al menos {MIN_CROP_PERCENT} % de ancho o alto útil.</p>
        </fieldset>

        <fieldset disabled={disabled} className={`min-w-0 ${disabled ? 'opacity-60' : ''}`}>
          <legend className="mb-2 font-label-md text-on-surface">Giro y contraste</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={onRotate} disabled={disabled} className={`${buttonStyle} border border-surface-border text-on-surface hover:bg-surface-elevated`}>
              <Icon className="text-[20px]">rotate_90_degrees_cw</Icon>
              Girar 90° (actual: {rotation}°)
            </button>
            <button type="button" onClick={onRestore} disabled={disabled} className={`${buttonStyle} border border-surface-border text-on-surface hover:bg-surface-elevated`}>
              <Icon className="text-[20px]">restart_alt</Icon>
              Restaurar original
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${enhancement === 'original' ? 'border-primary bg-primary/10 text-on-surface' : 'border-surface-border text-on-surface'}`}>
              <input
                type="radio"
                name="receipt-enhancement"
                value="original"
                checked={enhancement === 'original'}
                onChange={() => onEnhancementChange('original')}
                disabled={disabled}
                className="accent-primary"
              />
              Original (sin contraste)
            </label>
            <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${enhancement === 'optimized' ? 'border-primary bg-primary/10 text-on-surface' : 'border-surface-border text-on-surface'}`}>
              <input
                type="radio"
                name="receipt-enhancement"
                value="optimized"
                checked={enhancement === 'optimized'}
                onChange={() => onEnhancementChange('optimized')}
                disabled={disabled}
                className="accent-primary"
              />
              Mejorar contraste
            </label>
          </div>
        </fieldset>

        <button type="button" onClick={onApply} disabled={disabled} className={`${buttonStyle} w-full bg-primary text-on-primary hover:bg-primary/90`}>
          {applying ? <Loader2 aria-hidden="true" size={20} className="animate-spin motion-reduce:animate-none" /> : <Icon className="text-[20px]">preview</Icon>}
          {applying ? 'Preparando vista previa…' : 'Aplicar ajustes y ver vista previa'}
        </button>
        <p className="text-xs text-on-surface-variant">
          La vista previa y el análisis usan exactamente la misma imagen preparada. No se prepara nada mientras mueves los controles.
        </p>

        {previewError && (
          <p role="alert" className="rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">{previewError}</p>
        )}

        {preview && !previewError && (
          <figure className="min-w-0 rounded-xl border border-surface-border bg-surface-elevated p-2">
            {/* The preview is the real prepared blob, not a CSS approximation of the crop/rotation. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt="Vista previa de la imagen preparada con los ajustes aplicados"
              className="mx-auto block h-auto max-h-80 w-full rounded-lg bg-white object-contain"
            />
            <figcaption className="mt-2 break-words text-xs text-on-surface-variant">
              Vista previa real · {preview.width} × {preview.height} px. Esta imagen preparada es la que se analizará.
            </figcaption>
          </figure>
        )}
      </div>
    </details>
  );
}
