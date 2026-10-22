'use client';

import Icon from '@/components/Icon';
import { useState, useRef } from 'react';
import { useStoredString, storeString } from '@/hooks/useStoredString';

export default function VendedorSelector() {
  const savedVendedor = useStoredString('trackretail_vendedor') || '';
  const [draft, setDraft] = useState('');
  const vendedor = savedVendedor;
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    const name = draft.trim();
    if (name.length === 0) return;
    try {
      storeString('trackretail_vendedor', name);
    } catch {
      return;
    }
    setDraft(name);
    setIsEditing(false);

  };

  const handleEdit = () => {
    setDraft(savedVendedor);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // First-time setup (no vendedor saved yet)
  if (!vendedor && !isEditing) {
    return (
      <button
        onClick={handleEdit}
        className="flex items-center gap-2 bg-primary/10 border border-primary/30 text-primary px-3 py-2 rounded-xl text-sm font-medium hover:bg-primary/20 transition-colors w-full min-w-0"
      >
        <Icon className=" text-[18px]">person_add</Icon>
        <span className="truncate">Configurar nombre</span>
      </button>
    );
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-2 w-full">
        <input
          ref={inputRef}
          type="text"
          aria-label="Nombre del vendedor"
          maxLength={120}
          placeholder="Escribe tu nombre..."
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setIsEditing(false); }}
          className="w-full bg-surface-base border border-primary/50 text-on-surface rounded-lg px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
          autoComplete="off"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 bg-primary text-on-primary py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Guardar
          </button>
          {vendedor && (
            <button
              onClick={() => { setIsEditing(false); }}
              className="px-3 py-2 rounded-lg border border-surface-border text-on-surface-variant text-sm hover:bg-surface-base transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleEdit}
      className="flex items-center gap-2 w-full min-w-0 text-left group"
    >
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
        <Icon
          className=" text-[15px] text-background"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          person
        </Icon>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-on-surface-variant leading-tight">Activo como</p>
        <p className="text-sm font-semibold text-on-surface group-hover:text-secondary transition-colors truncate">
          {vendedor}
        </p>
      </div>
      <Icon className=" text-[16px] text-on-surface-variant group-hover:text-secondary transition-colors shrink-0">
        edit
      </Icon>
    </button>
  );
}
