import './App.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DockManagerCore,
  saveToLocalStorage,
  loadFromLocalStorage,
  clearLocalStorage,
  exportToFile,
  importFromFile,
  serialize,
  deserialize,
} from '@widgetstools/react-dock-manager';
import type { DockManagerState, PanelConfig, PreventableDockEvent, DockviewApi } from '@widgetstools/dock-manager-core';
import { themes, applyTheme, type DockTheme } from '@widgetstools/dock-manager-core';
import { defaultState } from './config/defaultLayout';
import {
  Sun, Moon, Save, FolderOpen, RotateCcw,
  Download, Upload, Copy, ClipboardPaste,
  Plus, X, ChevronRight, ChevronLeft,
  Play, FileText, FolderTree, Search,
  Terminal, AlertTriangle, ScrollText, List,
  Info, Keyboard, Ban, Dock,
  Undo2, Redo2, Bookmark, BookmarkCheck,
  Anchor, Bug, Link, Unlink,
} from 'lucide-react';

// Widget components
import { ClockWidget } from './widgets/ClockWidget';
import { EditorWidget } from './widgets/EditorWidget';
import { TerminalWidget } from './widgets/TerminalWidget';
import { FileTreeWidget } from './widgets/FileTreeWidget';
import { ProblemsWidget } from './widgets/ProblemsWidget';
import { PlaceholderWidget } from './widgets/PlaceholderWidget';
import { ChartWidget } from './widgets/ChartWidget';
import { DataGridWidget } from './widgets/DataGridWidget';

/** Map panel icon strings to lucide components */
const ICON_MAP: Record<string, React.ReactNode> = {
  file: <FileText className="w-3 h-3" />,
  folder: <FolderTree className="w-3 h-3" />,
  terminal: <Terminal className="w-3 h-3" />,
  alert: <AlertTriangle className="w-3 h-3" />,
  scroll: <ScrollText className="w-3 h-3" />,
  list: <List className="w-3 h-3" />,
  search: <Search className="w-3 h-3" />,
  clock: <Info className="w-3 h-3" />,
};

/** All available themes */
const THEME_OPTIONS: { label: string; key: string; theme: DockTheme }[] = [
  { label: 'VS Code Light', key: 'vsCodeLight', theme: themes.vsCodeLight },
  { label: 'GitHub Light', key: 'githubLight', theme: themes.githubLight },
  { label: 'Warm Light', key: 'warmLight', theme: themes.warmLight },
  { label: 'Solarized Light', key: 'solarizedLight', theme: themes.solarizedLight },
  { label: 'Sepia', key: 'sepiaLight', theme: themes.sepiaLight },
  { label: 'Mint', key: 'mintLight', theme: themes.mintLight },
  { label: 'Lavender', key: 'lavenderLight', theme: themes.lavenderLight },
  { label: 'VS Code Dark', key: 'vsCodeDark', theme: themes.vsCodeDark },
  { label: 'Dracula Dark', key: 'draculaDark', theme: themes.draculaDark },
  { label: 'Nord Dark', key: 'nordDark', theme: themes.nordDark },
  { label: 'Solarized Dark', key: 'solarizedDark', theme: themes.solarizedDark },
  { label: 'Midnight Blue', key: 'midnightDark', theme: themes.midnightDark },
  { label: 'Forest Dark', key: 'forestDark', theme: themes.forestDark },
  { label: 'Slate Dark', key: 'slateDark', theme: themes.slateDark },
];

/** Widget registry — maps widgetType strings to React components */
const WIDGETS = {
  clock: ClockWidget,
  editor: EditorWidget,
  terminal: TerminalWidget,
  'file-tree': FileTreeWidget,
  problems: ProblemsWidget,
  placeholder: PlaceholderWidget,
  chart: ChartWidget,
  datagrid: DataGridWidget,
};

/** Panels that should prompt before closing */
const UNSAVED_PANELS = new Set(['doc1', 'doc2']);

let addPanelCounter = 0;

function App() {
  const [selectedThemeKey, setSelectedThemeKey] = useState('slateDark');
  const selectedTheme = THEME_OPTIONS.find(t => t.key === selectedThemeKey)?.theme || themes.slateDark;
  const appContainerRef = useRef<HTMLDivElement>(null);

  // Apply theme to the app container so toolbar inherits dock CSS variables
  useEffect(() => {
    if (!appContainerRef.current) return;
    const el = appContainerRef.current;
    applyTheme(el, selectedTheme);
    if (selectedTheme.mode === 'dark') {
      el.classList.add('dark');
    } else {
      el.classList.remove('dark');
    }
  }, [selectedTheme]);

  // API via onReady — no ref needed for most operations
  const [api, setApi] = useState<DockviewApi | null>(null);
  const latestStateRef = useRef<DockManagerState>(defaultState);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const [allowRootDock, setAllowRootDock] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [presetName, setPresetName] = useState('');

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  // ── Custom tab renderer with icons and unsaved badges ──────────────

  const renderTab = useCallback((_panelId: string, panel: PanelConfig, _isActive: boolean) => {
    const icon = panel.icon ? ICON_MAP[panel.icon] : null;
    const isUnsaved = UNSAVED_PANELS.has(panel.id);
    return (
      <span className="flex items-center gap-1.5 text-xs select-none">
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span className="truncate">{panel.title}</span>
        {isUnsaved && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" />}
        {panel.badge && <span className="text-[9px] opacity-80 ml-0.5">{panel.badge}</span>}
        {panel.closable !== false && (
          <button className="dock-tab-close" data-action="close" data-panel-id={panel.id} aria-label={`Close ${panel.title}`}>
            <X className="w-3 h-3" />
          </button>
        )}
      </span>
    );
  }, []);

  // ── Header actions ──────────────────────────────────────────────────

  const renderHeaderActions = useCallback((slot: 'left' | 'right' | 'prefix', tabGroupId: string) => {
    if (tabGroupId === 'tg_center' && slot === 'right') {
      return (
        <button className="p-1 rounded transition-colors dock-text-muted hover:dock-text dock-hover" title="Run file" onClick={() => showToast('Running active document...')}>
          <Play className="w-3.5 h-3.5" />
        </button>
      );
    }
    if (tabGroupId === 'tg_center' && slot === 'prefix') {
      return <span className="px-1.5 flex items-center dock-text-muted opacity-60" title="Open editors"><FileText className="w-3 h-3" /></span>;
    }
    return null;
  }, [showToast]);

  // ── Preventable close ──────────────────────────────────────────────

  const onWillClose = useCallback((event: PreventableDockEvent) => {
    if (event.panelId && UNSAVED_PANELS.has(event.panelId)) {
      const panel = latestStateRef.current.panels[event.panelId];
      if (!window.confirm(`"${panel?.title ?? event.panelId}" has unsaved changes. Close anyway?`)) {
        event.preventDefault();
      }
    }
  }, []);

  // ── Toolbar actions (using api directly) ───────────────────────────

  const handleAddPanel = useCallback(() => {
    if (!api) return;
    addPanelCounter++;
    api.addPanel({
      panelId: `new_panel_${addPanelCounter}`,
      title: `New Panel ${addPanelCounter}`,
      widgetType: addPanelCounter % 2 === 0 ? 'clock' : 'editor',
      widgetProps: addPanelCounter % 2 === 0 ? {} : { language: 'ts' },
      icon: addPanelCounter % 2 === 0 ? 'clock' : 'file',
    });
    showToast(`Added panel`);
  }, [api, showToast]);

  const handleShowDialog = useCallback(() => {
    if (!api) return;
    addPanelCounter++;
    const id = `dialog_${addPanelCounter}`;
    api.addPanel({
      id,
      title: 'Info Dialog',
      widgetType: 'placeholder',
      closable: true,
      dockable: false,
    });
    api.floatPanel({ panelId: id, x: 200, y: 150, width: 360, height: 240 });
    showToast('Opened dialog');
  }, [api, showToast]);

  const handleSave = useCallback(() => { saveToLocalStorage(latestStateRef.current); showToast('Layout saved'); }, [showToast]);
  const handleLoad = useCallback(() => {
    const saved = loadFromLocalStorage();
    if (saved && api) { api.loadState(saved.state); showToast('Layout loaded'); }
    else showToast('No saved layout found');
  }, [api, showToast]);
  const handleReset = useCallback(() => { clearLocalStorage(); api?.loadState(defaultState); showToast('Layout reset'); }, [api, showToast]);
  const handleExport = useCallback(() => { exportToFile(latestStateRef.current); showToast('Layout exported'); }, [showToast]);
  const handleImport = useCallback(async () => {
    try { const r = await importFromFile(); api?.loadState(r.state); showToast('Layout imported'); }
    catch (e: unknown) { showToast(`Import failed: ${e instanceof Error ? e.message : 'Unknown error'}`); }
  }, [api, showToast]);
  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(serialize(latestStateRef.current)); showToast('Copied to clipboard'); }
    catch { showToast('Copy failed'); }
  }, [showToast]);
  const handlePaste = useCallback(async () => {
    try { const r = deserialize(await navigator.clipboard.readText()); api?.loadState(r.state); showToast('Pasted from clipboard'); }
    catch (e: unknown) { showToast(`Paste failed: ${e instanceof Error ? e.message : 'Unknown error'}`); }
  }, [api, showToast]);

  return (
    <div ref={appContainerRef} className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: 'hsl(var(--dock-bg))', color: 'hsl(var(--dock-text))' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b dock-border flex-shrink-0" style={{ background: 'hsl(var(--dock-panel-header))' }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold dock-text tracking-wide">Dock Manager Demo</span>

          <div className="flex items-center gap-0.5">
            <Btn icon={<Undo2 className="w-3.5 h-3.5" />} title="Undo (Ctrl+Z)" onClick={() => { api?.undo(); showToast('Undo'); }} />
            <Btn icon={<Redo2 className="w-3.5 h-3.5" />} title="Redo (Ctrl+Shift+Z)" onClick={() => { api?.redo(); showToast('Redo'); }} />
          </div>

          <div className="flex items-center gap-0.5">
            <Sep />
            <Btn icon={<Save className="w-3.5 h-3.5" />} title="Save layout" onClick={handleSave} />
            <Btn icon={<FolderOpen className="w-3.5 h-3.5" />} title="Load layout" onClick={handleLoad} />
            <Btn icon={<RotateCcw className="w-3.5 h-3.5" />} title="Reset layout" onClick={handleReset} />
            <Sep />
            <Btn icon={<Download className="w-3.5 h-3.5" />} title="Export to file" onClick={handleExport} />
            <Btn icon={<Upload className="w-3.5 h-3.5" />} title="Import from file" onClick={handleImport} />
            <Sep />
            <Btn icon={<Copy className="w-3.5 h-3.5" />} title="Copy to clipboard" onClick={handleCopy} />
            <Btn icon={<ClipboardPaste className="w-3.5 h-3.5" />} title="Paste from clipboard" onClick={handlePaste} />
          </div>

          <div className="flex items-center gap-0.5">
            <Sep />
            <Btn icon={<Bookmark className="w-3.5 h-3.5" />} title="Save preset" onClick={() => {
              const name = presetName.trim() || `Preset ${(api?.getPresets().length ?? 0) + 1}`;
              api?.savePreset(name); showToast(`Saved preset "${name}"`); setPresetName('');
            }} />
            <Btn icon={<BookmarkCheck className="w-3.5 h-3.5" />} title="Load last preset" onClick={() => {
              const presets = api?.getPresets() ?? [];
              if (presets.length === 0) { showToast('No presets'); return; }
              api?.loadPreset(presets[presets.length - 1]); showToast(`Loaded preset`);
            }} />
          </div>

          <div className="flex items-center gap-0.5">
            <Sep />
            <Btn icon={<Link className="w-3.5 h-3.5" />} title="Copy layout URL" onClick={() => {
              const encoded = api?.exportAsUrl();
              if (encoded) navigator.clipboard.writeText(`${location.origin}${location.pathname}?layout=${encoded}`).then(() => showToast('URL copied'));
            }} />
            <Btn icon={<Unlink className="w-3.5 h-3.5" />} title="Load from URL" onClick={() => {
              const encoded = new URLSearchParams(location.search).get('layout');
              if (encoded) { try { api?.importFromUrl(encoded); showToast('Loaded from URL'); } catch { showToast('Invalid URL'); } }
              else showToast('No layout in URL');
            }} />
          </div>

          <div className="flex items-center gap-0.5">
            <Sep />
            <Btn icon={<Plus className="w-3.5 h-3.5" />} title="Add panel" onClick={handleAddPanel} />
            <Btn icon={<Info className="w-3.5 h-3.5" />} title="Show dialog (non-dockable)" onClick={handleShowDialog} />
            <Btn icon={<ChevronLeft className="w-3.5 h-3.5" />} title="Navigate prev" onClick={() => api?.navigatePrevious()} />
            <Btn icon={<ChevronRight className="w-3.5 h-3.5" />} title="Navigate next" onClick={() => api?.navigateNext()} />
          </div>

          <div className="flex items-center gap-0.5">
            <Sep />
            <Btn icon={<Anchor className="w-3.5 h-3.5" />} title="Dock all floating" onClick={() => { api?.dockAllFloating(); showToast('Docked all'); }} />
            <Btn icon={<Ban className="w-3.5 h-3.5" />} title="Toggle disabled" onClick={() => {
              const p = latestStateRef.current.panels['contentPane2'];
              if (p) { api?.updatePanel('contentPane2', { disabled: !p.disabled }); showToast(p.disabled ? 'Enabled' : 'Disabled'); }
            }} />
            <button onClick={() => { const v = !debugMode; api?.setDebugMode(v); setDebugMode(v); showToast(v ? 'Debug ON' : 'Debug OFF'); }}
              className={`flex items-center gap-1 px-1.5 py-1 rounded text-[10px] transition-colors ${debugMode ? 'dock-text bg-blue-500/20' : 'dock-text-muted dock-hover'}`} title="Debug">
              <Bug className="w-3 h-3" /><span>Debug</span>
            </button>
            <button onClick={() => setAllowRootDock(v => !v)}
              className={`flex items-center gap-1 px-1.5 py-1 rounded text-[10px] transition-colors ${allowRootDock ? 'dock-text bg-blue-500/20' : 'dock-text-muted dock-hover'}`} title="Edge Dock">
              <Dock className="w-3 h-3" /><span>Edge Dock</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] dock-text-muted">Ctrl+P: Panel Finder</span>
          <Sep />
          <Btn icon={<Keyboard className="w-3.5 h-3.5" />} title="Keyboard shortcuts" onClick={() => setShowShortcuts(v => !v)} />
          <div className="flex items-center gap-1">
            {selectedTheme.mode === 'light' ? <Sun className="w-3 h-3 dock-text-muted" /> : <Moon className="w-3 h-3 dock-text-muted" />}
            <select value={selectedThemeKey} onChange={e => setSelectedThemeKey(e.target.value)}
              className="text-[11px] dock-text dock-surface-alt border dock-border rounded px-1.5 py-0.5 cursor-pointer outline-none" title="Theme">
              <optgroup label="Light Themes">
                {THEME_OPTIONS.filter(t => t.theme.mode === 'light').map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </optgroup>
              <optgroup label="Dark Themes">
                {THEME_OPTIONS.filter(t => t.theme.mode === 'dark').map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </optgroup>
            </select>
          </div>
        </div>
      </div>

      {/* Dock Manager */}
      <div className="flex-1 overflow-hidden relative">
        <DockManagerCore
          initialState={defaultState}
          widgets={WIDGETS}
          onReady={setApi}
          onStateChange={state => { latestStateRef.current = state; }}
          renderTab={renderTab}
          renderHeaderActions={renderHeaderActions}
          renderWatermark={() => (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.7 }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
              <div style={{ fontSize: 13, fontWeight: 500 }}>No panels</div>
              <div style={{ fontSize: 11 }}>Drag a panel here to dock it</div>
            </div>
          )}
          onWillClose={onWillClose}
          theme={selectedTheme}
          allowRootDock={allowRootDock}
        />

        {toast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-md shadow-lg dock-surface border dock-border text-xs dock-text z-[9999] animate-fade-in">
            {toast}
          </div>
        )}
      </div>

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40" onClick={() => setShowShortcuts(false)}>
          <div className="dock-surface border dock-border rounded-lg shadow-2xl p-5 w-[400px]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold dock-text">Keyboard Shortcuts</h2>
              <button onClick={() => setShowShortcuts(false)} className="dock-text-muted hover:dock-text"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-1.5 text-xs">
              {([
                ['Ctrl+Z', 'Undo'], ['Ctrl+Shift+Z', 'Redo'], ['Ctrl+P', 'Panel finder'],
                ['Ctrl+W', 'Close active panel'], ['Ctrl+Tab', 'Next pane'], ['Ctrl+Shift+Tab', 'Prev pane'],
                ['Ctrl+F6', 'Next tab'], ['Ctrl+Shift+F6', 'Prev tab'], ['Alt+F6', 'Next group'],
                ['Alt+Shift+F6', 'Prev group'], ['Alt+F7', 'Pane navigator'], ['F11', 'Maximize/Restore'],
                ['Ctrl+Shift+Arrow', 'Dock to edge'], ['Escape', 'Restore/Cancel'],
              ] as const).map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between py-1 border-b dock-border last:border-0">
                  <span className="dock-text-muted">{desc}</span>
                  <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono dock-surface-alt border dock-border dock-text">{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const Btn = React.memo(({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) => (
  <button onClick={onClick} className="p-1.5 rounded transition-colors dock-text-muted hover:dock-text dock-hover" title={title}>
    {icon}
  </button>
));

const Sep = () => <div className="w-px h-4 mx-1" style={{ background: 'hsl(var(--dock-border))' }} />;

export default App;
