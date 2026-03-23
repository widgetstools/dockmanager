import './App.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DockManagerCore,
  useTheme,
  saveToLocalStorage,
  loadFromLocalStorage,
  clearLocalStorage,
  exportToFile,
  importFromFile,
  serialize,
  deserialize,
} from '@widgetstools/react-dock-manager';
import type { DockManagerCoreHandle } from '@widgetstools/react-dock-manager';
import type {
  DockManagerState,
  PanelConfig,
  PreventableDockEvent,
} from '@widgetstools/dock-manager-core';
import { themes, type DockTheme, type PanelApi } from '@widgetstools/dock-manager-core';
import { defaultState } from './config/defaultLayout';
import {
  Sun, Moon,
  Save, FolderOpen, RotateCcw,
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
const WIDGET_REGISTRY: Record<string, React.FC<{ api: PanelApi; panel: PanelConfig }>> = {
  clock: ClockWidget,
  editor: EditorWidget,
  terminal: TerminalWidget,
  'file-tree': FileTreeWidget,
  problems: ProblemsWidget,
  placeholder: PlaceholderWidget,
};

/** Panels that should prompt before closing */
const UNSAVED_PANELS = new Set(['doc1', 'doc2']);

let addPanelCounter = 0;

function App() {
  const { setTheme: setThemeMode } = useTheme('light');
  const [selectedThemeKey, setSelectedThemeKey] = useState('vsCodeLight');
  const selectedTheme = THEME_OPTIONS.find(t => t.key === selectedThemeKey)?.theme || themes.vsCodeLight;
  const dockRef = useRef<DockManagerCoreHandle>(null);

  const handleThemeSelect = useCallback((key: string) => {
    setSelectedThemeKey(key);
    const t = THEME_OPTIONS.find(o => o.key === key);
    if (t) setThemeMode(t.theme.mode);
  }, [setThemeMode]);

  // Always start with default state — no auto-loading
  const [initialState] = useState<DockManagerState>(() => defaultState);
  const latestStateRef = useRef<DockManagerState>(initialState);

  const handleStateChange = useCallback((state: DockManagerState) => {
    latestStateRef.current = state;
  }, []);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const [mountKey, setMountKey] = useState(0);
  const [currentInitialState, setCurrentInitialState] = useState(initialState);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [allowRootDock, setAllowRootDock] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [presetName, setPresetName] = useState('');

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  // ── Widget-type panel renderer (uses widget registry) ──────────────

  const renderPanel = useCallback((_panelId: string, panel: PanelConfig, api: PanelApi) => {
    const widgetType = panel.widgetType || '';
    const Widget = WIDGET_REGISTRY[widgetType];

    if (Widget) {
      return <Widget api={api} panel={panel} />;
    }

    // Fallback for unknown widget types
    return <PlaceholderWidget api={api} panel={panel} />;
  }, []);

  // ── Custom tab renderer with icons and unsaved badges ──────────────

  const renderTab = useCallback((_panelId: string, panel: PanelConfig, isActive: boolean) => {
    const icon = panel.icon ? ICON_MAP[panel.icon] : null;
    const isUnsaved = UNSAVED_PANELS.has(panel.id);
    return (
      <span className={`flex items-center gap-1.5 text-xs select-none ${isActive ? 'dock-text' : 'dock-text-muted'}`}>
        {icon && <span className="flex-shrink-0 opacity-70">{icon}</span>}
        <span className="truncate">{panel.title}</span>
        {isUnsaved && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" />}
        {panel.badge && <span className="text-[9px] opacity-60 ml-0.5">{panel.badge}</span>}
      </span>
    );
  }, []);

  // ── Header actions ──────────────────────────────────────────────────

  const renderHeaderActions = useCallback((slot: 'left' | 'right' | 'prefix', tabGroupId: string) => {
    if (tabGroupId === 'tg_center' && slot === 'right') {
      return (
        <button
          className="p-1 rounded transition-colors dock-text-muted hover:dock-text dock-hover"
          title="Run file"
          onClick={() => showToast('Running active document...')}
        >
          <Play className="w-3.5 h-3.5" />
        </button>
      );
    }
    if (tabGroupId === 'tg_center' && slot === 'prefix') {
      return (
        <span className="px-1.5 flex items-center dock-text-muted opacity-60" title="Open editors">
          <FileText className="w-3 h-3" />
        </span>
      );
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

  // ── DockviewApi: Add panel ──────────────────────────────────────────

  const handleAddPanel = useCallback(() => {
    const api = dockRef.current?.getApi();
    if (!api) return;
    addPanelCounter++;
    const id = `new_panel_${addPanelCounter}`;
    api.addPanel({
      panelId: id,
      title: `New Panel ${addPanelCounter}`,
      widgetType: addPanelCounter % 2 === 0 ? 'clock' : 'editor',
      widgetProps: addPanelCounter % 2 === 0 ? {} : { language: 'ts' },
      icon: addPanelCounter % 2 === 0 ? 'clock' : 'file',
    });
    showToast(`Added panel "${id}"`);
  }, [showToast]);

  // ── DockviewApi: Toggle disabled ─────────────────────────────────────

  const handleToggleDisabled = useCallback(() => {
    const api = dockRef.current?.getApi();
    if (!api) return;
    const state = dockRef.current?.getState();
    if (!state) return;
    const current = state.panels['contentPane2'];
    if (!current) return;
    api.updatePanel('contentPane2', { disabled: !current.disabled });
    showToast(`Output panel ${current.disabled ? 'enabled' : 'disabled'}`);
  }, [showToast]);

  // ── DockviewApi: Navigate ───────────────────────────────────────────

  const handleNavigateNext = useCallback(() => {
    dockRef.current?.getApi()?.navigateNext();
  }, []);

  const handleNavigatePrev = useCallback(() => {
    dockRef.current?.getApi()?.navigatePrevious();
  }, []);

  // ── Undo / Redo ────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    const api = dockRef.current?.getApi();
    if (!api) return;
    api.undo();
    showToast('Undo');
  }, [showToast]);

  const handleRedo = useCallback(() => {
    const api = dockRef.current?.getApi();
    if (!api) return;
    api.redo();
    showToast('Redo');
  }, [showToast]);

  // ── Layout Presets ─────────────────────────────────────────────────

  const handleSavePreset = useCallback(() => {
    const api = dockRef.current?.getApi();
    if (!api) return;
    const name = presetName.trim() || `Preset ${(api.getPresets().length + 1)}`;
    api.savePreset(name);
    showToast(`Saved preset "${name}"`);
    setPresetName('');
  }, [showToast, presetName]);

  const handleLoadPreset = useCallback(() => {
    const api = dockRef.current?.getApi();
    if (!api) return;
    const presets = api.getPresets();
    if (presets.length === 0) {
      showToast('No presets saved');
      return;
    }
    // Load the most recently saved preset
    const preset = presets[presets.length - 1];
    api.loadPreset(preset);
    showToast(`Loaded preset "${preset.name}"`);
  }, [showToast]);

  // ── Dock all floating ──────────────────────────────────────────────

  const handleDockAllFloating = useCallback(() => {
    const api = dockRef.current?.getApi();
    if (!api) return;
    const count = api.getFloatingPanels().length;
    if (count === 0) {
      showToast('No floating panels');
      return;
    }
    api.dockAllFloating();
    showToast(`Docked ${count} floating panel${count > 1 ? 's' : ''}`);
  }, [showToast]);

  // ── Debug mode ─────────────────────────────────────────────────────

  const handleToggleDebug = useCallback(() => {
    const api = dockRef.current?.getApi();
    if (!api) return;
    const newValue = !debugMode;
    api.setDebugMode(newValue);
    setDebugMode(newValue);
    showToast(newValue ? 'Debug mode ON' : 'Debug mode OFF');
  }, [debugMode, showToast]);

  // ── Export/Import URL ──────────────────────────────────────────────

  const handleExportUrl = useCallback(() => {
    const api = dockRef.current?.getApi();
    if (!api) return;
    const encoded = api.exportAsUrl();
    const url = `${window.location.origin}${window.location.pathname}?layout=${encoded}`;
    navigator.clipboard.writeText(url).then(
      () => showToast('Layout URL copied to clipboard'),
      () => showToast('Failed to copy URL'),
    );
  }, [showToast]);

  const handleImportUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('layout');
    if (!encoded) {
      showToast('No layout found in URL');
      return;
    }
    const api = dockRef.current?.getApi();
    if (!api) return;
    try {
      api.importFromUrl(encoded);
      showToast('Layout loaded from URL');
    } catch {
      showToast('Failed to decode layout from URL');
    }
  }, [showToast]);

  // ── Serialization handlers ──────────────────────────────────────────

  const handleSave = useCallback(() => { saveToLocalStorage(latestStateRef.current); showToast('Layout saved'); }, [showToast]);
  const handleLoad = useCallback(() => {
    const saved = loadFromLocalStorage();
    if (saved) { setCurrentInitialState(saved.state); setMountKey(k => k + 1); showToast('Layout loaded'); }
    else showToast('No saved layout found');
  }, [showToast]);
  const handleReset = useCallback(() => { clearLocalStorage(); setCurrentInitialState(defaultState); setMountKey(k => k + 1); showToast('Layout reset'); }, [showToast]);
  const handleExport = useCallback(() => { exportToFile(latestStateRef.current); showToast('Layout exported'); }, [showToast]);
  const handleImport = useCallback(async () => {
    try { const r = await importFromFile(); setCurrentInitialState(r.state); setMountKey(k => k + 1); showToast('Layout imported'); }
    catch (e: unknown) { showToast(`Import failed: ${e instanceof Error ? e.message : 'Unknown error'}`); }
  }, [showToast]);
  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(serialize(latestStateRef.current)); showToast('Copied to clipboard'); }
    catch { showToast('Copy failed'); }
  }, [showToast]);
  const handlePaste = useCallback(async () => {
    try { const r = deserialize(await navigator.clipboard.readText()); setCurrentInitialState(r.state); setMountKey(k => k + 1); showToast('Pasted from clipboard'); }
    catch (e: unknown) { showToast(`Paste failed: ${e instanceof Error ? e.message : 'Unknown error'}`); }
  }, [showToast]);

  return (
    <div className="h-screen w-screen dock-bg flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 dock-panel-header border-b dock-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold dock-text tracking-wide">Dock Manager Demo</span>

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5">
            <Btn icon={<Undo2 className="w-3.5 h-3.5" />} title="Undo (Ctrl+Z)" onClick={handleUndo} />
            <Btn icon={<Redo2 className="w-3.5 h-3.5" />} title="Redo (Ctrl+Shift+Z)" onClick={handleRedo} />
          </div>

          {/* Serialization */}
          <div className="flex items-center gap-0.5">
            <Sep />
            <Btn icon={<Save className="w-3.5 h-3.5" />} title="Save layout to localStorage" onClick={handleSave} />
            <Btn icon={<FolderOpen className="w-3.5 h-3.5" />} title="Load layout from localStorage" onClick={handleLoad} />
            <Btn icon={<RotateCcw className="w-3.5 h-3.5" />} title="Reset layout to default" onClick={handleReset} />
            <Sep />
            <Btn icon={<Download className="w-3.5 h-3.5" />} title="Export to JSON file" onClick={handleExport} />
            <Btn icon={<Upload className="w-3.5 h-3.5" />} title="Import from JSON file" onClick={handleImport} />
            <Sep />
            <Btn icon={<Copy className="w-3.5 h-3.5" />} title="Copy layout JSON to clipboard" onClick={handleCopy} />
            <Btn icon={<ClipboardPaste className="w-3.5 h-3.5" />} title="Paste layout JSON from clipboard" onClick={handlePaste} />
          </div>

          {/* Layout Presets */}
          <div className="flex items-center gap-0.5">
            <Sep />
            <Btn icon={<Bookmark className="w-3.5 h-3.5" />} title="Save current layout as preset" onClick={handleSavePreset} />
            <Btn icon={<BookmarkCheck className="w-3.5 h-3.5" />} title="Load last saved preset" onClick={handleLoadPreset} />
          </div>

          {/* URL export/import */}
          <div className="flex items-center gap-0.5">
            <Sep />
            <Btn icon={<Link className="w-3.5 h-3.5" />} title="Copy layout as shareable URL" onClick={handleExportUrl} />
            <Btn icon={<Unlink className="w-3.5 h-3.5" />} title="Load layout from URL parameter" onClick={handleImportUrl} />
          </div>

          {/* DockviewApi controls */}
          <div className="flex items-center gap-0.5">
            <Sep />
            <Btn icon={<Plus className="w-3.5 h-3.5" />} title="Add new panel (DockviewApi.addPanel)" onClick={handleAddPanel} />
            <Btn icon={<ChevronLeft className="w-3.5 h-3.5" />} title="Navigate previous" onClick={handleNavigatePrev} />
            <Btn icon={<ChevronRight className="w-3.5 h-3.5" />} title="Navigate next" onClick={handleNavigateNext} />
          </div>

          {/* Feature toggles */}
          <div className="flex items-center gap-0.5">
            <Sep />
            <Btn icon={<Anchor className="w-3.5 h-3.5" />} title="Dock all floating panels" onClick={handleDockAllFloating} />
            <Btn icon={<Ban className="w-3.5 h-3.5" />} title="Toggle disabled on Content Pane 2" onClick={handleToggleDisabled} />
            <button
              onClick={handleToggleDebug}
              className={`flex items-center gap-1 px-1.5 py-1 rounded text-[10px] transition-colors ${debugMode ? 'dock-text bg-blue-500/20' : 'dock-text-muted dock-hover'}`}
              title="Toggle debug overlay"
            >
              <Bug className="w-3 h-3" />
              <span>Debug</span>
            </button>
            <button
              onClick={() => setAllowRootDock(v => !v)}
              className={`flex items-center gap-1 px-1.5 py-1 rounded text-[10px] transition-colors ${allowRootDock ? 'dock-text bg-blue-500/20' : 'dock-text-muted dock-hover'}`}
              title="Toggle edge docking (allowRootDock)"
            >
              <Dock className="w-3 h-3" />
              <span>Edge Dock</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] dock-text-muted">Ctrl+P: Panel Finder</span>
          <Sep />
          <Btn icon={<Keyboard className="w-3.5 h-3.5" />} title="Keyboard shortcuts" onClick={() => setShowShortcuts(v => !v)} />
          {/* Theme selector */}
          <div className="flex items-center gap-1">
            {selectedTheme.mode === 'light' ? <Sun className="w-3 h-3 dock-text-muted" /> : <Moon className="w-3 h-3 dock-text-muted" />}
            <select
              value={selectedThemeKey}
              onChange={e => handleThemeSelect(e.target.value)}
              className="text-[11px] dock-text dock-surface-alt border dock-border rounded px-1.5 py-0.5 cursor-pointer outline-none"
              title="Select theme"
            >
              <optgroup label="Light Themes">
                {THEME_OPTIONS.filter(t => t.theme.mode === 'light').map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </optgroup>
              <optgroup label="Dark Themes">
                {THEME_OPTIONS.filter(t => t.theme.mode === 'dark').map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>
      </div>

      {/* Dock Manager */}
      <div className="flex-1 overflow-hidden relative">
        <DockManagerCore
          key={mountKey}
          ref={dockRef}
          initialState={currentInitialState}
          onStateChange={handleStateChange}
          renderPanel={renderPanel}
          renderTab={renderTab}
          renderHeaderActions={renderHeaderActions}
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
                ['Ctrl+Z', 'Undo'],
                ['Ctrl+Shift+Z', 'Redo'],
                ['Ctrl+P', 'Panel finder'],
                ['Ctrl+W', 'Close active panel'],
                ['Ctrl+Tab', 'Pane navigator (next)'],
                ['Ctrl+Shift+Tab', 'Pane navigator (prev)'],
                ['Ctrl+F6', 'Next tab in group'],
                ['Ctrl+Shift+F6', 'Previous tab in group'],
                ['Alt+F6', 'Next pane (across groups)'],
                ['Alt+Shift+F6', 'Previous pane (across groups)'],
                ['Alt+F7', 'Open pane navigator'],
                ['F11', 'Maximize / Restore'],
                ['Ctrl+Shift+Arrow', 'Dock to edge'],
                ['Escape', 'Restore / Cancel drag'],
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

const Sep = () => <div className="w-px h-4 bg-border mx-1" />;

export default App;
