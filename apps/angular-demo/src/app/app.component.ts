import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DockManagerCoreComponent,
  serialize,
  deserialize,
  saveToLocalStorage,
  loadFromLocalStorage,
  clearLocalStorage,
  exportToFile,
  importFromFile,
} from '@widgetstools/angular-dock-manager';
import type {
  DockManagerState,
  PanelConfig,
  PreventableDockEvent,
  IDisposable,
  DockTheme,
  DockviewApi,
} from '@widgetstools/dock-manager-core';
import { themes } from '@widgetstools/dock-manager-core';
import { defaultState } from './config/default-layout';
import { ClockWidgetComponent } from './widgets/clock-widget.component';
import { EditorWidgetComponent } from './widgets/editor-widget.component';
import { TerminalWidgetComponent } from './widgets/terminal-widget.component';
import { FileTreeWidgetComponent } from './widgets/file-tree-widget.component';
import { ProblemsWidgetComponent } from './widgets/problems-widget.component';
import { PlaceholderWidgetComponent } from './widgets/placeholder-widget.component';

// Lucide Angular
import { LucideAngularModule, LucideIconProvider, LUCIDE_ICONS } from 'lucide-angular';
import type { LucideIconData } from 'lucide-angular/icons/types';
import {
  Undo2, Redo2, Save, FolderOpen, RotateCcw,
  Download, Upload, Copy, ClipboardPaste,
  Bookmark, BookmarkCheck, Link, Unlink,
  Plus, ChevronLeft, ChevronRight,
  Anchor, Ban, Bug, PanelRight,
  Keyboard, Sun, Moon, X, Play, FileText,
  FolderTree, Terminal, AlertTriangle, ScrollText,
  List, Search, Info,
} from 'lucide-angular';

/** All icons used in toolbar — registered via LUCIDE_ICONS provider */
const ALL_ICONS = {
  Undo2, Redo2, Save, FolderOpen, RotateCcw,
  Download, Upload, Copy, ClipboardPaste,
  Bookmark, BookmarkCheck, Link, Unlink,
  Plus, ChevronLeft, ChevronRight,
  Anchor, Ban, Bug, PanelRight,
  Keyboard, Sun, Moon, X, Play, FileText,
};

/** Convert LucideIconData to SVG string for DOM manipulation (e.g. createTabContent) */
function lucideSvg(icon: LucideIconData, size = 12): string {
  const children = icon.map(([tag, attrs]) => {
    const a = Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<${tag} ${a}/>`;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
}

/** Icon registry for tab rendering (panel.icon → LucideIconData) */
const TAB_ICONS: Record<string, LucideIconData> = {
  file: FileText, folder: FolderTree, terminal: Terminal,
  alert: AlertTriangle, scroll: ScrollText, list: List,
  search: Search, clock: Info,
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

const UNSAVED_PANELS = new Set(['doc1', 'doc2']);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    FormsModule,
    DockManagerCoreComponent,
    LucideAngularModule,
  ],
  providers: [
    { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider(ALL_ICONS) },
  ],
  template: `
    <div class="demo-root">
      <!-- Toolbar -->
      <div class="demo-toolbar">
        <div class="demo-toolbar-left">
          <span class="demo-title">Dock Manager Demo</span>

          <!-- Undo / Redo -->
          <div class="demo-btn-group">
            <button class="tb" title="Undo (Ctrl+Z)" (click)="api?.undo(); showToast('Undo')"><lucide-icon name="undo-2" [size]="14" /></button>
            <button class="tb" title="Redo (Ctrl+Shift+Z)" (click)="api?.redo(); showToast('Redo')"><lucide-icon name="redo-2" [size]="14" /></button>
          </div>

          <!-- Serialization -->
          <div class="demo-btn-group">
            <div class="sep"></div>
            <button class="tb" title="Save layout" (click)="handleSave()"><lucide-icon name="save" [size]="14" /></button>
            <button class="tb" title="Load layout" (click)="handleLoad()"><lucide-icon name="folder-open" [size]="14" /></button>
            <button class="tb" title="Reset layout" (click)="handleReset()"><lucide-icon name="rotate-ccw" [size]="14" /></button>
            <div class="sep"></div>
            <button class="tb" title="Export to file" (click)="handleExport()"><lucide-icon name="download" [size]="14" /></button>
            <button class="tb" title="Import from file" (click)="handleImport()"><lucide-icon name="upload" [size]="14" /></button>
            <div class="sep"></div>
            <button class="tb" title="Copy to clipboard" (click)="handleCopy()"><lucide-icon name="copy" [size]="14" /></button>
            <button class="tb" title="Paste from clipboard" (click)="handlePaste()"><lucide-icon name="clipboard-paste" [size]="14" /></button>
          </div>

          <!-- Presets -->
          <div class="demo-btn-group">
            <div class="sep"></div>
            <button class="tb" title="Save preset" (click)="savePreset()"><lucide-icon name="bookmark" [size]="14" /></button>
            <button class="tb" title="Load last preset" (click)="loadPreset()"><lucide-icon name="bookmark-check" [size]="14" /></button>
          </div>

          <!-- URL export/import -->
          <div class="demo-btn-group">
            <div class="sep"></div>
            <button class="tb" title="Copy layout URL" (click)="exportAsUrl()"><lucide-icon name="link" [size]="14" /></button>
            <button class="tb" title="Load from URL" (click)="importFromUrlParam()"><lucide-icon name="unlink" [size]="14" /></button>
          </div>

          <!-- DockviewApi controls -->
          <div class="demo-btn-group">
            <div class="sep"></div>
            <button class="tb" title="Add panel" (click)="addNewPanel()"><lucide-icon name="plus" [size]="14" /></button>
            <button class="tb" title="Navigate prev" (click)="api?.navigatePrevious()"><lucide-icon name="chevron-left" [size]="14" /></button>
            <button class="tb" title="Navigate next" (click)="api?.navigateNext()"><lucide-icon name="chevron-right" [size]="14" /></button>
          </div>

          <!-- Feature toggles -->
          <div class="demo-btn-group">
            <div class="sep"></div>
            <button class="tb" title="Dock all floating" (click)="api?.dockAllFloating(); showToast('Docked all')"><lucide-icon name="anchor" [size]="14" /></button>
            <button class="tb" title="Toggle disabled" (click)="toggleDisabled()"><lucide-icon name="ban" [size]="14" /></button>
            <button class="tb-labelled" [class.tb-active]="debugMode" title="Debug" (click)="toggleDebug()">
              <lucide-icon name="bug" [size]="12" /><span>Debug</span>
            </button>
            <button class="tb-labelled" [class.tb-active]="allowRootDock" title="Edge Dock" (click)="allowRootDock = !allowRootDock">
              <lucide-icon name="panel-right" [size]="12" /><span>Edge Dock</span>
            </button>
          </div>
        </div>

        <div class="demo-toolbar-right">
          <span class="demo-shortcut-hint">Ctrl+P: Panel Finder</span>
          <div class="sep"></div>
          <button class="tb" title="Keyboard shortcuts" (click)="showShortcuts = !showShortcuts"><lucide-icon name="keyboard" [size]="14" /></button>
          <div class="demo-theme-selector">
            @if (selectedTheme.mode === 'light') {
              <lucide-icon name="sun" [size]="12" class="demo-theme-icon" />
            } @else {
              <lucide-icon name="moon" [size]="12" class="demo-theme-icon" />
            }
            <select class="demo-theme-select" [value]="selectedThemeKey" (change)="onThemeSelect($event)" title="Theme">
              <optgroup label="Light Themes">
                @for (t of lightThemes; track t.key) { <option [value]="t.key">{{ t.label }}</option> }
              </optgroup>
              <optgroup label="Dark Themes">
                @for (t of darkThemes; track t.key) { <option [value]="t.key">{{ t.label }}</option> }
              </optgroup>
            </select>
          </div>
        </div>
      </div>

      <!-- Dock Manager -->
      <div class="demo-dock-container">
        <dock-manager-core
          [initialState]="initialState"
          [widgets]="widgets"
          [createTab]="createTabContent"
          [createHeaderActions]="createHeaderActionsContent"
          [theme]="selectedTheme"
          [allowRootDock]="allowRootDock"
          (ready)="onReady($event)"
          (stateChange)="onStateChange($event)"
          (willClose)="onWillClose($event)">
        </dock-manager-core>

        @if (toast) { <div class="demo-toast">{{ toast }}</div> }
      </div>

      <!-- Keyboard shortcuts modal -->
      @if (showShortcuts) {
        <div class="demo-modal-backdrop" (click)="showShortcuts = false">
          <div class="demo-modal" (click)="$event.stopPropagation()">
            <div class="demo-modal-header">
              <h2 class="demo-modal-title">Keyboard Shortcuts</h2>
              <button class="demo-modal-close" (click)="showShortcuts = false"><lucide-icon name="x" [size]="16" /></button>
            </div>
            <div class="demo-shortcuts-list">
              @for (s of shortcuts; track s.key) {
                <div class="demo-shortcut-row">
                  <span class="demo-shortcut-desc">{{ s.desc }}</span>
                  <kbd class="demo-shortcut-key">{{ s.key }}</kbd>
                </div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .demo-root { height: 100vh; width: 100vw; display: flex; flex-direction: column; overflow: hidden; background: hsl(var(--dock-bg)); }
    .demo-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; background: hsl(var(--dock-panel-header)); border-bottom: 1px solid hsl(var(--dock-border)); flex-shrink: 0; }
    .demo-toolbar-left { display: flex; align-items: center; gap: 12px; }
    .demo-toolbar-right { display: flex; align-items: center; gap: 8px; }
    .demo-title { font-size: 12px; font-weight: 600; color: hsl(var(--dock-text)); letter-spacing: 0.025em; }
    .demo-btn-group { display: flex; align-items: center; gap: 2px; }
    .tb { display: flex; align-items: center; justify-content: center; padding: 6px; border: none; background: transparent; color: hsl(var(--dock-text-muted)); border-radius: 4px; cursor: pointer; transition: all 0.15s; }
    .tb:hover { background: hsl(var(--dock-hover)); color: hsl(var(--dock-text)); }
    .tb-labelled { display: flex; align-items: center; gap: 4px; padding: 4px 6px; font-size: 10px; border: none; background: transparent; color: hsl(var(--dock-text-muted)); border-radius: 4px; cursor: pointer; transition: all 0.15s; }
    .tb-labelled:hover { background: hsl(var(--dock-hover)); color: hsl(var(--dock-text)); }
    .tb-active { color: hsl(var(--dock-text)); background: rgba(59, 130, 246, 0.2); }
    .sep { width: 1px; height: 16px; background: hsl(var(--dock-border)); margin: 0 4px; }
    .demo-shortcut-hint { font-size: 10px; color: hsl(var(--dock-text-muted)); white-space: nowrap; }
    .demo-theme-selector { display: flex; align-items: center; gap: 4px; }
    .demo-theme-icon { color: hsl(var(--dock-text-muted)); }
    .demo-theme-select { font-size: 11px; color: hsl(var(--dock-text)); background: hsl(var(--dock-surface-alt)); border: 1px solid hsl(var(--dock-border)); border-radius: 4px; padding: 2px 6px; cursor: pointer; outline: none; }
    .demo-dock-container { flex: 1; overflow: hidden; position: relative; display: flex; min-height: 0; }
    .demo-toast { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); padding: 8px 16px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); background: hsl(var(--dock-surface)); border: 1px solid hsl(var(--dock-border)); font-size: 12px; color: hsl(var(--dock-text)); z-index: 9999; white-space: nowrap; }
    .demo-modal-backdrop { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.4); }
    .demo-modal { background: hsl(var(--dock-surface)); border: 1px solid hsl(var(--dock-border)); border-radius: 8px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); padding: 20px; width: 400px; }
    .demo-modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .demo-modal-title { font-size: 14px; font-weight: 600; color: hsl(var(--dock-text)); margin: 0; }
    .demo-modal-close { display: flex; align-items: center; border: none; background: transparent; color: hsl(var(--dock-text-muted)); cursor: pointer; padding: 0; }
    .demo-modal-close:hover { color: hsl(var(--dock-text)); }
    .demo-shortcuts-list { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
    .demo-shortcut-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid hsl(var(--dock-border)); }
    .demo-shortcut-row:last-child { border-bottom: none; }
    .demo-shortcut-desc { color: hsl(var(--dock-text-muted)); }
    .demo-shortcut-key { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-family: monospace; background: hsl(var(--dock-surface-alt)); border: 1px solid hsl(var(--dock-border)); color: hsl(var(--dock-text)); }
  `]
})
export class AppComponent implements OnDestroy {
  initialState: DockManagerState = structuredClone(defaultState);
  api: DockviewApi | null = null;
  currentState: DockManagerState = this.initialState;
  toast: string | null = null;
  debugMode = false;
  allowRootDock = true;
  showShortcuts = false;
  private toastTimer: any = null;
  private addPanelCounter = 0;

  selectedThemeKey = 'vsCodeLight';
  selectedTheme: DockTheme = themes.vsCodeLight;
  lightThemes = THEME_OPTIONS.filter(t => t.theme.mode === 'light');
  darkThemes = THEME_OPTIONS.filter(t => t.theme.mode === 'dark');

  shortcuts = [
    { key: 'Ctrl+Z', desc: 'Undo' }, { key: 'Ctrl+Shift+Z', desc: 'Redo' },
    { key: 'Ctrl+P', desc: 'Panel finder' }, { key: 'Ctrl+W', desc: 'Close active panel' },
    { key: 'Ctrl+Tab', desc: 'Next pane' }, { key: 'Ctrl+Shift+Tab', desc: 'Prev pane' },
    { key: 'Ctrl+F6', desc: 'Next tab in group' }, { key: 'Ctrl+Shift+F6', desc: 'Prev tab in group' },
    { key: 'Alt+F6', desc: 'Next pane (across groups)' }, { key: 'Alt+Shift+F6', desc: 'Prev pane (across groups)' },
    { key: 'Alt+F7', desc: 'Pane navigator' }, { key: 'F11', desc: 'Maximize/Restore' },
    { key: 'Ctrl+Shift+Arrow', desc: 'Dock to edge' }, { key: 'Escape', desc: 'Restore/Cancel' },
  ];

  widgets: Record<string, any> = {
    'clock': ClockWidgetComponent,
    'editor': EditorWidgetComponent,
    'terminal': TerminalWidgetComponent,
    'file-tree': FileTreeWidgetComponent,
    'problems': ProblemsWidgetComponent,
    'placeholder': PlaceholderWidgetComponent,
  };

  /** Custom tab renderer with Lucide icons and unsaved badges */
  createTabContent = (panelId: string, container: HTMLElement, isActive: boolean): IDisposable => {
    const panel = this.currentState.panels[panelId] || (defaultState.panels as any)[panelId];
    if (!panel) return { dispose: () => {} };

    const span = document.createElement('span');
    span.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;user-select:none';
    span.style.color = isActive ? 'hsl(var(--dock-text))' : 'hsl(var(--dock-text-muted))';

    const iconData = panel.icon ? TAB_ICONS[panel.icon] : null;
    if (iconData) {
      const iconSpan = document.createElement('span');
      iconSpan.style.cssText = 'flex-shrink:0;opacity:0.7;display:flex;align-items:center';
      iconSpan.innerHTML = lucideSvg(iconData, 12);
      span.appendChild(iconSpan);
    }

    const titleSpan = document.createElement('span');
    titleSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    titleSpan.textContent = panel.title;
    span.appendChild(titleSpan);

    if (UNSAVED_PANELS.has(panel.id)) {
      const dot = document.createElement('span');
      dot.style.cssText = 'display:inline-block;width:6px;height:6px;border-radius:50%;background:#fbbf24;flex-shrink:0';
      dot.title = 'Unsaved changes';
      span.appendChild(dot);
    }

    if (panel.badge) {
      const badge = document.createElement('span');
      badge.style.cssText = 'font-size:9px;opacity:0.6;margin-left:2px';
      badge.textContent = panel.badge;
      span.appendChild(badge);
    }

    container.appendChild(span);
    return { dispose: () => { container.innerHTML = ''; } };
  };

  /** Header actions renderer */
  createHeaderActionsContent = (slot: 'left' | 'right' | 'prefix', tabGroupId: string, container: HTMLElement): IDisposable => {
    if (tabGroupId === 'tg_center' && slot === 'right') {
      const btn = document.createElement('button');
      btn.style.cssText = 'display:flex;align-items:center;padding:4px;border:none;background:transparent;color:hsl(var(--dock-text-muted));border-radius:4px;cursor:pointer;transition:all 0.15s';
      btn.title = 'Run file';
      btn.innerHTML = lucideSvg(Play, 14);
      btn.addEventListener('mouseenter', () => { btn.style.color = 'hsl(var(--dock-text))'; btn.style.background = 'hsl(var(--dock-hover))'; });
      btn.addEventListener('mouseleave', () => { btn.style.color = 'hsl(var(--dock-text-muted))'; btn.style.background = 'transparent'; });
      btn.addEventListener('click', () => this.showToast('Running active document...'));
      container.appendChild(btn);
      return { dispose: () => { container.innerHTML = ''; } };
    }
    if (tabGroupId === 'tg_center' && slot === 'prefix') {
      const span = document.createElement('span');
      span.style.cssText = 'display:flex;align-items:center;padding:0 6px;color:hsl(var(--dock-text-muted));opacity:0.6';
      span.title = 'Open editors';
      span.innerHTML = lucideSvg(FileText, 12);
      container.appendChild(span);
      return { dispose: () => { container.innerHTML = ''; } };
    }
    return { dispose: () => {} };
  };

  ngOnDestroy(): void { if (this.toastTimer) clearTimeout(this.toastTimer); }
  onReady(api: DockviewApi): void { this.api = api; }
  onStateChange(state: DockManagerState): void { this.currentState = state; }

  onWillClose(data: { event: PreventableDockEvent; panelId: string }): void {
    if (UNSAVED_PANELS.has(data.panelId)) {
      const panel = this.currentState.panels[data.panelId];
      if (!window.confirm(`"${panel?.title ?? data.panelId}" has unsaved changes. Close anyway?`)) {
        data.event.preventDefault();
      }
    }
  }

  onThemeSelect(event: Event): void {
    const key = (event.target as HTMLSelectElement).value;
    this.selectedThemeKey = key;
    const opt = THEME_OPTIONS.find(o => o.key === key);
    if (opt) this.selectedTheme = opt.theme;
  }

  addNewPanel(): void {
    if (!this.api) return;
    this.addPanelCounter++;
    this.api.addPanel({
      panelId: `new_panel_${this.addPanelCounter}`,
      title: `New Panel ${this.addPanelCounter}`,
      widgetType: this.addPanelCounter % 2 === 0 ? 'clock' : 'editor',
      widgetProps: this.addPanelCounter % 2 === 0 ? {} : { language: 'ts' },
      icon: this.addPanelCounter % 2 === 0 ? 'clock' : 'file',
    });
    this.showToast('Added panel');
  }

  toggleDisabled(): void {
    const p = this.currentState.panels['contentPane2'];
    if (p) { this.api?.updatePanel('contentPane2', { disabled: !p.disabled }); this.showToast(p.disabled ? 'Enabled' : 'Disabled'); }
  }

  toggleDebug(): void {
    this.debugMode = !this.debugMode;
    this.api?.setDebugMode(this.debugMode);
    this.showToast(this.debugMode ? 'Debug ON' : 'Debug OFF');
  }

  handleSave(): void { saveToLocalStorage(this.currentState); this.showToast('Layout saved'); }
  handleLoad(): void {
    const saved = loadFromLocalStorage();
    if (saved && this.api) { this.api.loadState(saved.state); this.showToast('Layout loaded'); }
    else this.showToast('No saved layout found');
  }
  handleReset(): void { clearLocalStorage(); this.api?.loadState(structuredClone(defaultState)); this.showToast('Layout reset'); }
  handleExport(): void { exportToFile(this.currentState); this.showToast('Layout exported'); }
  async handleImport(): Promise<void> {
    try { const r = await importFromFile(); this.api?.loadState(r.state); this.showToast('Layout imported'); }
    catch (e: unknown) { this.showToast(`Import failed: ${e instanceof Error ? e.message : 'Unknown error'}`); }
  }
  async handleCopy(): Promise<void> {
    try { await navigator.clipboard.writeText(serialize(this.currentState)); this.showToast('Copied to clipboard'); }
    catch { this.showToast('Copy failed'); }
  }
  async handlePaste(): Promise<void> {
    try { const r = deserialize(await navigator.clipboard.readText()); this.api?.loadState(r.state); this.showToast('Pasted from clipboard'); }
    catch (e: unknown) { this.showToast(`Paste failed: ${e instanceof Error ? e.message : 'Unknown error'}`); }
  }

  savePreset(): void {
    const name = `Preset ${(this.api?.getPresets().length ?? 0) + 1}`;
    this.api?.savePreset(name); this.showToast(`Saved preset "${name}"`);
  }
  loadPreset(): void {
    const presets = this.api?.getPresets() ?? [];
    if (presets.length === 0) { this.showToast('No presets'); return; }
    this.api?.loadPreset(presets[presets.length - 1]); this.showToast('Loaded preset');
  }

  exportAsUrl(): void {
    const encoded = this.api?.exportAsUrl();
    if (encoded) navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?layout=${encoded}`).then(
      () => this.showToast('URL copied'), () => this.showToast('Copy failed'));
  }
  importFromUrlParam(): void {
    const encoded = new URLSearchParams(window.location.search).get('layout');
    if (!encoded) { this.showToast('No layout in URL'); return; }
    try { this.api?.importFromUrl(encoded); this.showToast('Loaded from URL'); } catch { this.showToast('Invalid URL'); }
  }

  showToast(msg: string): void {
    this.toast = msg;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toast = null; }, 2500);
  }
}
