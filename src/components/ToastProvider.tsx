'use client';

import Icon from '@/components/Icon';
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Haptics } from '@/lib/haptics';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);

    // Disparar haptic feedback según el tipo de toast
    if (type === 'error') {
      Haptics.error();
    } else if (type === 'success') {
      Haptics.success();
    } else {
      Haptics.light();
    }

    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Container - Fijo en la parte inferior sobre la botonera móvil */}
      <div className="fixed bottom-[100px] md:bottom-10 left-0 right-0 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map(toast => (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            className={`
              animate-in slide-in-from-bottom-5 fade-in zoom-in-95 duration-300
              pointer-events-auto px-6 py-3 rounded-full font-label-md shadow-2xl flex items-center gap-2 max-w-sm w-full backdrop-blur-md border
              ${toast.type === 'error' ? 'bg-error/90 text-on-error border-error/50' : ''}
              ${toast.type === 'success' ? 'bg-secondary/90 text-background border-secondary/50' : ''}
              ${toast.type === 'info' ? 'bg-surface-variant/90 text-on-surface border-white/10' : ''}
            `}
          >
            <Icon className=" text-[20px]">
              {toast.type === 'error' ? 'error' : toast.type === 'success' ? 'check_circle' : 'info'}
            </Icon>
            <span className="leading-tight">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
