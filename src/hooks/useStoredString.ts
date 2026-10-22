'use client';
import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('trackretail:storage', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('trackretail:storage', callback);
  };
}
export function useStoredString(key: string) {
  return useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key); } catch { return null; }
  }, () => null);
}
export function storeString(key: string, value: string) {
  localStorage.setItem(key, value);
  window.dispatchEvent(new Event('trackretail:storage'));
}
