import { useEffect, useMemo, useRef, useState } from 'react';
import { ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import {
  DockManagerCore,
  themes,
  saveToLocalStorage,
  loadFromLocalStorage,
  clearLocalStorage,
  type DockTheme,
  type DockResourceStrings,
  type DockManagerState,
  type DockviewApi,
} from '@widgetstools/react-dock-manager';
import { defaultLayout } from './config/defaultLayout';
import { widgetRegistry } from './widgets';
import { ThemeProvider, buildTradingTheme } from './context/ThemeContext';
import {
  Undo2, Redo2, Save, FolderOpen, RotateCcw,
  Keyboard, X,
} from 'lucide-react';

// Register AG Grid Enterprise modules globally
ModuleRegistry.registerModules([AllEnterpriseModule]);

const allThemes = Object.entries(themes).map(([key, theme]) => ({ key, theme }));

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
  ['Ctrl+Z', 'Undo'],
  ['Ctrl+Shift+Z', 'Redo'],
  ['Ctrl+P', 'Panel finder'],
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
    const check = () => { const h = new Date().getHours(); setOpen(h >= 8 && h < 17); };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: open ? '#00c853' : '#ff5252' }} />
      <span style={{ fontSize: 10, color: open ? '#00c853' : '#ff5252', fontWeight: 600, letterSpacing: '0.04em' }}>
        {open ? 'MARKET OPEN' : 'MARKET CLOSED'}
      </span>
    </div>
  );
}

function PortfolioValue() {
  const [val, setVal] = useState(287465200);
  useEffect(() => {
    const id = setInterval(() => setVal(prev => prev + (Math.random() - 0.48) * 50000), 3000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <span className="font-mono-num" style={{ fontSize: 12, fontWeight: 700, color: '#e1e4ed', lineHeight: 1.1 }}>
          ${(val / 1000000).toFixed(2)}M
        </span>
        <span className="font-mono-num" style={{ fontSize: 10, color: '#00c853', lineHeight: 1.1 }}>+1.24%</span>
      </div>
    </div>
  );
}

const TbBtn = ({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) => (
  <button onClick={onClick} title={title} style={{
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 4, padding: '3px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#6b7280',
  }}>
    {icon}
  </button>
);

const Sep = () => <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.06)' }} />;

export default function App() {
  const [currentTheme, setCurrentTheme] = useState<DockTheme>(themes.nordDark);
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [locale, setLocale] = useState<'en' | 'ja'>('en');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [api, setApi] = useState<DockviewApi | null>(null);
  const latestStateRef = useRef<DockManagerState>(defaultLayout);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const resourceStrings = useMemo(() => (locale === 'ja' ? RESOURCE_STRINGS_JA : undefined), [locale]);
  const tradingTheme = useMemo(() => buildTradingTheme(currentTheme), [currentTheme]);

  useEffect(() => {
    document.body.dataset.agThemeMode = tradingTheme.isDark ? 'trading-dark' : 'trading-light';
  }, [tradingTheme.isDark]);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowThemeDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <ThemeProvider value={tradingTheme}>
    <div className="flex h-screen w-screen flex-col" style={{ background: tradingTheme.colors.bg }}>
      {/* Toolbar */}
      <div className="toolbar" style={{ background: tradingTheme.colors.surface, borderBottom: `1px solid ${tradingTheme.colors.border}`, color: tradingTheme.colors.text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1" fill="#2979ff" opacity="0.8" />
              <rect x="9" y="1" width="6" height="6" rx="1" fill="#00bcd4" opacity="0.6" />
              <rect x="1" y="9" width="6" height="6" rx="1" fill="#00bcd4" opacity="0.6" />
              <rect x="9" y="9" width="6" height="6" rx="1" fill="#2979ff" opacity="0.4" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#e1e4ed', letterSpacing: '0.02em' }}>FixedIncome</span>
            <span style={{ fontSize: 12, fontWeight: 300, color: '#00bcd4' }}>Pro</span>
          </div>
          <Sep />
          <MarketStatus />
          <Sep />
          <PortfolioValue />
          <Sep />

          {/* Undo / Redo */}
          <TbBtn icon={<Undo2 size={12} />} title="Undo (Ctrl+Z)" onClick={() => api?.undo()} />
          <TbBtn icon={<Redo2 size={12} />} title="Redo (Ctrl+Shift+Z)" onClick={() => api?.redo()} />
          <Sep />

          {/* Save / Load / Reset */}
          <TbBtn icon={<Save size={12} />} title="Save layout" onClick={() => saveToLocalStorage(latestStateRef.current)} />
          <TbBtn icon={<FolderOpen size={12} />} title="Load layout" onClick={() => {
            const saved = loadFromLocalStorage();
            if (saved) api?.loadState(saved.state);
          }} />
          <TbBtn icon={<RotateCcw size={12} />} title="Reset layout" onClick={() => {
            clearLocalStorage();
            api?.loadState(defaultLayout);
          }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Theme selector */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowThemeDropdown(!showThemeDropdown)}
              style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 4, padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#6b7280', fontSize: 10,
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
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                background: '#171b2e', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4, padding: 4, zIndex: 1000, minWidth: 140, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}>
                {allThemes.map(t => (
                  <button key={t.key} onClick={() => { setCurrentTheme(t.theme); setShowThemeDropdown(false); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '4px 8px', fontSize: 11,
                      color: t.theme.name === currentTheme.name ? '#2979ff' : '#e1e4ed',
                      background: t.theme.name === currentTheme.name ? 'rgba(41,121,255,0.1)' : 'transparent',
                      border: 'none', borderRadius: 3, cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = t.theme.name === currentTheme.name ? 'rgba(41,121,255,0.1)' : 'transparent')}
                  >{t.theme.name}</button>
                ))}
              </div>
            )}
          </div>

          <Sep />

          {/* Risk Lock toggle */}
          <button onClick={() => {
            const p = latestStateRef.current.panels.get('riskMetrics');
            if (p) api?.updatePanel('riskMetrics', { disabled: !p.disabled });
          }} style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 4, padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#6b7280', fontSize: 10,
          }} title="Toggle disabled on Risk Metrics">
            <span style={{ letterSpacing: '0.03em' }}>RISK LOCK</span>
          </button>

          <Sep />

          {/* Language selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {(['en', 'ja'] as const).map(lang => (
              <button key={lang} onClick={() => setLocale(lang)} style={{
                background: locale === lang ? 'rgba(41,121,255,0.15)' : 'rgba(255,255,255,0.04)',
                border: '1px solid ' + (locale === lang ? 'rgba(41,121,255,0.3)' : 'rgba(255,255,255,0.06)'),
                borderRadius: 3, padding: '2px 6px', cursor: 'pointer',
                color: locale === lang ? '#2979ff' : '#6b7280', fontSize: 10, fontWeight: locale === lang ? 700 : 400, letterSpacing: '0.04em',
              }}>{lang.toUpperCase()}</button>
            ))}
          </div>

          <Sep />

          {/* Keyboard shortcuts */}
          <TbBtn icon={<Keyboard size={12} />} title="Keyboard shortcuts" onClick={() => setShowShortcuts(v => !v)} />

          <Sep />
          <span style={{ fontSize: 9, color: '#6b7280', whiteSpace: 'nowrap' }}>Right-click tabs for menu</span>
          <Sep />
          <Clock />
        </div>
      </div>

      {/* Dock Manager */}
      <div className="flex-1 min-h-0">
        <DockManagerCore
          initialState={defaultLayout}
          widgets={widgetRegistry}
          onReady={setApi}
          onStateChange={state => { latestStateRef.current = state; }}
          theme={currentTheme}
          resourceStrings={resourceStrings}
          className="h-full w-full"
        />
      </div>

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowShortcuts(false)}>
          <div style={{ background: tradingTheme.colors.surface, border: `1px solid ${tradingTheme.colors.border}`, borderRadius: 8, padding: 20, width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: tradingTheme.colors.text }}>Keyboard Shortcuts</span>
              <button onClick={() => setShowShortcuts(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex' }}>
                <X size={16} />
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
