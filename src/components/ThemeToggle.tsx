'use client';

import { useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useStoredString, storeString } from '@/hooks/useStoredString';

export default function ThemeToggle() {
  const savedTheme = useStoredString('bryanapp_theme');
  const isDark = savedTheme === 'dark';
  useEffect(() => {
    // Check if user previously saved a preference
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);
  const toggleTheme = () => {
    try { storeString('bryanapp_theme', isDark ? 'light' : 'dark'); }
    catch { /* Keep the current theme if preferences cannot be saved. */ }
  };

  return (
    <button
      onClick={toggleTheme}
      className="w-11 h-11 rounded-lg border border-surface-border bg-surface-base text-on-surface transition-colors flex items-center justify-center shrink-0"
      aria-label={isDark ? 'Activar tema claro' : 'Activar tema oscuro'}
      aria-pressed={isDark}
    >
      {isDark ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
    </button>
  );
}
