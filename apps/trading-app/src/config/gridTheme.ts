import { themeQuartz } from 'ag-grid-community';
import type { DockTheme } from '@widgetstools/dock-manager-core';

/**
 * Creates an AG Grid theme from a DockTheme.
 * This ensures AG Grid always matches the dock manager's current theme.
 */
export function createGridTheme(dockTheme: DockTheme) {
  const isDark = dockTheme.mode === 'dark';
  const c = dockTheme.colors;

  return themeQuartz.withParams(
    {
      backgroundColor: `hsl(${c.bg})`,
      foregroundColor: `hsl(${c.text})`,
      borderColor: `hsl(${c.border})`,
      headerBackgroundColor: `hsl(${c.panelHeader})`,
      headerTextColor: `hsl(${c.textMuted})`,
      headerFontSize: 10,
      headerFontWeight: 600,
      rowHoverColor: `hsl(${c.hover})`,
      selectedRowBackgroundColor: isDark
        ? 'rgba(41, 121, 255, 0.10)'
        : 'rgba(41, 121, 255, 0.08)',
      oddRowBackgroundColor: isDark
        ? 'rgba(255, 255, 255, 0.015)'
        : 'rgba(0, 0, 0, 0.02)',
      browserColorScheme: isDark ? 'dark' : 'light',
      headerColumnResizeHandleColor: `hsl(${c.primary})`,
      rangeSelectionBorderColor: `hsl(${c.primary})`,
      columnBorder: false,
      fontSize: 11,
      rowHeight: 28,
      headerHeight: 30,
      cellHorizontalPadding: 8,
      rowBorder: isDark
        ? { color: 'rgba(255, 255, 255, 0.03)' }
        : { color: 'rgba(0, 0, 0, 0.06)' },
    },
    isDark ? 'trading-dark' : 'trading-light',
  );
}
