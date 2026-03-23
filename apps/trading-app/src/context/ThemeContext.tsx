import { createContext, useContext } from 'react';
import type { DockTheme } from '@widgetstools/dock-manager-core';

export interface TradingTheme {
  /** The dock manager theme object */
  dockTheme: DockTheme;
  /** Whether the current theme is dark mode */
  isDark: boolean;
  /** CSS color values derived from the dock theme */
  colors: {
    bg: string;
    surface: string;
    text: string;
    textMuted: string;
    textSecondary: string;
    border: string;
    positive: string;
    negative: string;
    warning: string;
    accent: string;
    cardBg: string;
    inputBg: string;
    hoverBg: string;
  };
}

function hslToColor(hslValues: string, alpha?: number): string {
  if (alpha !== undefined) {
    return `hsla(${hslValues}, ${alpha})`;
  }
  return `hsl(${hslValues})`;
}

export function buildTradingTheme(dockTheme: DockTheme): TradingTheme {
  const isDark = dockTheme.mode === 'dark';
  const c = dockTheme.colors;

  return {
    dockTheme,
    isDark,
    colors: {
      bg: hslToColor(c.bg),
      surface: hslToColor(c.surface),
      text: hslToColor(c.text),
      textMuted: hslToColor(c.textMuted),
      textSecondary: hslToColor(c.textSecondary),
      border: hslToColor(c.border),
      positive: isDark ? '#4caf50' : '#2e7d32',
      negative: isDark ? '#ef5350' : '#c62828',
      warning: isDark ? '#ffc107' : '#f57f17',
      accent: hslToColor(c.primary),
      cardBg: isDark
        ? `hsla(${c.surface}, 0.6)`
        : `hsla(${c.surface}, 0.8)`,
      inputBg: isDark
        ? `hsla(${c.bg}, 0.8)`
        : hslToColor(c.surfaceAlt || c.bg),
      hoverBg: hslToColor(c.hover),
    },
  };
}

const ThemeContext = createContext<TradingTheme | null>(null);

export const ThemeProvider = ThemeContext.Provider;

export function useTradingTheme(): TradingTheme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTradingTheme must be used within a ThemeProvider');
  }
  return theme;
}
