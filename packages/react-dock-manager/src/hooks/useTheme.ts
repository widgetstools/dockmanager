import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme(defaultTheme: Theme = 'dark') {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    const stored = window.localStorage?.getItem?.('dock-theme') as Theme | null;
    return stored || defaultTheme;
  });

  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
    try {
      window.localStorage?.setItem?.('dock-theme', theme);
    } catch {}
  }, [theme, resolvedTheme]);

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(getSystemTheme());
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const resolved = prev === 'system' ? getSystemTheme() : prev;
      return resolved === 'dark' ? 'light' : 'dark';
    });
  }, []);

  return { theme, resolvedTheme, setTheme, toggleTheme };
}
