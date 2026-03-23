import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import {
  DockManagerCore,
  themes,
  type DockTheme,
  type PanelConfig,
  type DockResourceStrings,
} from '@widgetstools/react-dock-manager';
import type { DockManagerCoreHandle } from '@widgetstools/react-dock-manager';
import type { PanelApi } from '@widgetstools/dock-manager-core';
import { defaultLayout } from './config/defaultLayout';
import { widgetRegistry } from './widgets';
import { ThemeProvider, buildTradingTheme } from './context/ThemeContext';

// Register AG Grid Enterprise modules globally
ModuleRegistry.registerModules([AllEnterpriseModule]);

const allThemes = Object.entries(themes).map(([key, theme]) => ({
  key,
  theme,
}));

const RESOURCE_STRINGS_JA: Partial<DockResourceStrings> = {
  close: '\u9589\u3058\u308B',
  closeOthers: '\u4ED6\u3092\u9589\u3058\u308B',
  closeAll: '\u3059\u3079\u3066\u9589\u3058\u308B',
  float: '\u30D5\u30ED\u30FC\u30C8',
  pin: '\u30D4\u30F3\u7559\u3081',
  unpin: '\u30D4\u30F3\u89E3\u9664',
  maximize: '\u6700\u5927\u5316',
  restore: '\u5FA9\u5143',
  dock: '\u30C9\u30C3\u30AF',
};

const KEYBOARD_SHORTCUTS = [
  ['Ctrl+W', 'Close panel'],
  ['Ctrl+Tab', 'Pane navigator'],
  ['Ctrl+F6', 'Next tab'],
  ['Ctrl+Shift+F6', 'Previous tab'],
  ['Alt+F6', 'Next pane'],
  ['F11', 'Maximize / Restore'],
  ['Ctrl+Shift+Arrow', 'Dock to edge'],
  ['Escape', 'Restore / Cancel'],
] as const;

function Clock() {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="font-mono-num" style={{ fontSize: 11, color: '#6b7280' }}>
      {time.toLocaleTimeString('en-US', { hour12: false })}
    </span>
  );
}

function MarketStatus() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const h = now.getHours();
      setOpen(h >= 8 && h < 17);
    };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span
        className="pulse-dot"
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: open ? '#00c853' : '#ff5252',
        }}
      />
      <span style={{ fontSize: 10, color: open ? '#00c853' : '#ff5252', fontWeight: 600, letterSpacing: '0.04em' }}>
        {open ? 'MARKET OPEN' : 'MARKET CLOSED'}
      </span>
    </div>
  );
}

function PortfolioValue() {
  const [val, setVal] = useState(287465200);

  useEffect(() => {
    const id = setInterval(() => {
      setVal(prev => prev + (Math.random() - 0.48) * 50000);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const formatted = `$${(val / 1000000).toFixed(2)}M`;
  const change = '+1.24%';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <span className="font-mono-num" style={{ fontSize: 12, fontWeight: 700, color: '#e1e4ed', lineHeight: 1.1 }}>
          {formatted}
        </span>
        <span className="font-mono-num" style={{ fontSize: 10, color: '#00c853', lineHeight: 1.1 }}>
          {change}
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const [currentTheme, setCurrentTheme] = useState<DockTheme>(themes.nordDark);
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [locale, setLocale] = useState<'en' | 'ja'>('en');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const dockRef = useRef<DockManagerCoreHandle>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const resourceStrings = useMemo(
    () => (locale === 'ja' ? RESOURCE_STRINGS_JA : undefined),
    [locale],
  );

  const handleToggleRiskDisabled = useCallback(() => {
    const api = dockRef.current?.getApi();
    const state = dockRef.current?.getState();
    if (!api || !state) return;
    const current = state.panels['riskMetrics'];
    if (!current) return;
    api.updatePanel('riskMetrics', { disabled: !current.disabled });
  }, []);

  // Build trading theme from dock theme — memoized so widgets don't re-render unnecessarily
  const tradingTheme = useMemo(() => buildTradingTheme(currentTheme), [currentTheme]);

  // Set AG Grid theme mode on body
  useEffect(() => {
    document.body.dataset.agThemeMode = tradingTheme.isDark ? 'trading-dark' : 'trading-light';
  }, [tradingTheme.isDark]);

  const renderPanel = useCallback(
    (_panelId: string, panel: PanelConfig, _api: PanelApi) => {
      const widgetType = panel.widgetType;
      if (!widgetType) return null;
      const Widget = widgetRegistry[widgetType];
      if (!Widget) return null;
      return <Widget />;
    },
    [],
  );

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowThemeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <ThemeProvider value={tradingTheme}>
    <div className="flex h-screen w-screen flex-col" style={{ background: tradingTheme.colors.bg }}>
      {/* Toolbar */}
      <div className="toolbar" style={{ background: tradingTheme.colors.surface, borderBottom: `1px solid ${tradingTheme.colors.border}`, color: tradingTheme.colors.text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Logo icon */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1" fill="#2979ff" opacity="0.8" />
              <rect x="9" y="1" width="6" height="6" rx="1" fill="#00bcd4" opacity="0.6" />
              <rect x="1" y="9" width="6" height="6" rx="1" fill="#00bcd4" opacity="0.6" />
              <rect x="9" y="9" width="6" height="6" rx="1" fill="#2979ff" opacity="0.4" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#e1e4ed', letterSpacing: '0.02em' }}>
              FixedIncome
            </span>
            <span style={{ fontSize: 12, fontWeight: 300, color: '#00bcd4' }}>Pro</span>
          </div>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.06)' }} />
          <MarketStatus />
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.06)' }} />
          <PortfolioValue />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Theme selector (icon button with dropdown) */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowThemeDropdown(!showThemeDropdown)}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 4,
                padding: '3px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: '#6b7280',
                fontSize: 10,
              }}
              title="Change theme"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M6 1C6 1 9.5 3.5 9.5 6C9.5 8.5 6 11 6 11" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <span style={{ letterSpacing: '0.03em' }}>THEME</span>
            </button>
            {showThemeDropdown && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  background: '#171b2e',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 4,
                  padding: 4,
                  zIndex: 1000,
                  minWidth: 140,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                }}
              >
                {allThemes.map(t => (
                  <button
                    key={t.key}
                    onClick={() => {
                      setCurrentTheme(t.theme);
                      setShowThemeDropdown(false);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '4px 8px',
                      fontSize: 11,
                      color: t.theme.name === currentTheme.name ? '#2979ff' : '#e1e4ed',
                      background: t.theme.name === currentTheme.name ? 'rgba(41,121,255,0.1)' : 'transparent',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = t.theme.name === currentTheme.name ? 'rgba(41,121,255,0.1)' : 'transparent')}
                  >
                    {t.theme.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.06)' }} />

          {/* Toggle Risk Metrics disabled */}
          <button
            onClick={handleToggleRiskDisabled}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 4,
              padding: '3px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: '#6b7280',
              fontSize: 10,
            }}
            title="Toggle disabled state on Risk Metrics panel"
          >
            <span style={{ letterSpacing: '0.03em' }}>RISK LOCK</span>
          </button>

          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.06)' }} />

          {/* Language selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {(['en', 'ja'] as const).map(lang => (
              <button
                key={lang}
                onClick={() => setLocale(lang)}
                style={{
                  background: locale === lang ? 'rgba(41,121,255,0.15)' : 'rgba(255,255,255,0.04)',
                  border: '1px solid ' + (locale === lang ? 'rgba(41,121,255,0.3)' : 'rgba(255,255,255,0.06)'),
                  borderRadius: 3,
                  padding: '2px 6px',
                  cursor: 'pointer',
                  color: locale === lang ? '#2979ff' : '#6b7280',
                  fontSize: 10,
                  fontWeight: locale === lang ? 700 : 400,
                  letterSpacing: '0.04em',
                }}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.06)' }} />

          {/* Keyboard shortcuts */}
          <button
            onClick={() => setShowShortcuts(v => !v)}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 4,
              padding: '3px 6px',
              cursor: 'pointer',
              color: '#6b7280',
              fontSize: 10,
              display: 'flex',
              alignItems: 'center',
            }}
            title="Keyboard shortcuts"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="3" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <line x1="3" y1="5.5" x2="4" y2="5.5" stroke="currentColor" strokeWidth="0.8" />
              <line x1="5.5" y1="5.5" x2="6.5" y2="5.5" stroke="currentColor" strokeWidth="0.8" />
              <line x1="8" y1="5.5" x2="9" y2="5.5" stroke="currentColor" strokeWidth="0.8" />
              <line x1="4" y1="7.5" x2="8" y2="7.5" stroke="currentColor" strokeWidth="0.8" />
            </svg>
          </button>

          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.06)' }} />

          <span style={{ fontSize: 9, color: '#6b7280', whiteSpace: 'nowrap' }}>Right-click tabs for menu</span>

          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.06)' }} />
          <Clock />
        </div>
      </div>

      {/* Dock Manager */}
      <div className="flex-1 min-h-0">
        <DockManagerCore
          ref={dockRef}
          initialState={defaultLayout}
          renderPanel={renderPanel}
          theme={currentTheme}
          resourceStrings={resourceStrings}
          className="h-full w-full"
        />
      </div>
      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowShortcuts(false)}
        >
          <div
            style={{ background: tradingTheme.colors.surface, border: `1px solid ${tradingTheme.colors.border}`, borderRadius: 8, padding: 20, width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: tradingTheme.colors.text }}>Keyboard Shortcuts</span>
              <button onClick={() => setShowShortcuts(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16 }}>
                &times;
              </button>
            </div>
            {KEYBOARD_SHORTCUTS.map(([key, desc]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${tradingTheme.colors.border}`, fontSize: 11 }}>
                <span style={{ color: '#9ca3af' }}>{desc}</span>
                <kbd style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, fontFamily: 'monospace', background: 'rgba(255,255,255,0.06)', border: `1px solid ${tradingTheme.colors.border}`, color: tradingTheme.colors.text }}>{key}</kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </ThemeProvider>
  );
}
