'use client';

import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    // Check if user previously saved a preference
    const savedTheme = localStorage.getItem('bryanapp_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'light') {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    } else if (savedTheme === 'dark' || prefersDark) {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    } else {
      // default light if no preference and not preferring dark? 
      // original was dark by default, so keep dark by default
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('bryanapp_theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('bryanapp_theme', 'dark');
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none flex items-center px-1 shrink-0 shadow-inner"
      style={{ backgroundColor: isDark ? 'var(--color-secondary)' : 'var(--color-outline-variant)' }}
      aria-label="Toggle theme"
    >
      <div
        className={`w-4 h-4 rounded-full bg-surface shadow-sm transform transition-transform duration-300 z-10 flex items-center justify-center`}
        style={{ transform: isDark ? 'translateX(24px)' : 'translateX(0)' }}
      />
    </button>
  );
}
