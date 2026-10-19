'use client';

import { useState, useEffect, useRef } from 'react';

export default function VendedorSelector() {
  const [vendedor, setVendedor] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('trackretail_vendedor');
      if (saved && saved.trim()) {
        setVendedor(saved.trim());
      }
    } catch {
      // localStorage not available
    }
  }, []);

  const handleSave = () => {
    const name = vendedor.trim();
    if (name.length === 0) return;
    try {
      localStorage.setItem('trackretail_vendedor', name);
    } catch {
      // localStorage not available
    }
    setVendedor(name);
    setIsEditing(false);
    // Force page reload so dashboard picks up new vendedor
    window.location.reload();
  };

  const handleEdit = () => {
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // First-time setup (no vendedor saved yet)
  if (!vendedor && !isEditing) {
    return (
      <button
        onClick={handleEdit}
        className="flex items-center gap-2 bg-primary/10 border border-primary/30 text-primary px-3 py-2 rounded-xl text-sm font-medium hover:bg-primary/20 transition-colors w-full"
      >
        <span className="material-symbols-outlined text-[18px]">person_add</span>
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
          placeholder="Escribe tu nombre..."
          value={vendedor}
          onChange={e => setVendedor(e.target.value)}
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
      className="flex items-center gap-2 w-full text-left group"
    >
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
        <span
          className="material-symbols-outlined text-[15px] text-background"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          person
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-on-surface-variant leading-tight">Activo como</p>
        <p className="text-sm font-semibold text-on-surface group-hover:text-secondary transition-colors truncate">
          {vendedor}
        </p>
      </div>
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant group-hover:text-secondary transition-colors shrink-0">
        edit
      </span>
    </button>
  );
}
