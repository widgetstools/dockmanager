import { Component, OnInit, OnDestroy, ViewChild, ApplicationRef, createComponent, EnvironmentInjector, Type } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DockManagerCoreComponent,
  DockThemeService,
} from '@widgetstools/angular-dock-manager';
import type {
  DockManagerState,
  PanelConfig,
  PreventableDockEvent,
  IDisposable,
  DockTheme,
} from '@widgetstools/dock-manager-core';
import { themes } from '@widgetstools/dock-manager-core';
import { Subject } from 'rxjs';
import { defaultState } from './config/default-layout';
import { ClockWidgetComponent } from './widgets/clock-widget.component';
import { EditorWidgetComponent } from './widgets/editor-widget.component';
import { TerminalWidgetComponent } from './widgets/terminal-widget.component';
import { FileTreeWidgetComponent } from './widgets/file-tree-widget.component';
import { ProblemsWidgetComponent } from './widgets/problems-widget.component';
import { PlaceholderWidgetComponent } from './widgets/placeholder-widget.component';

/** All available themes — same order as React demo */
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

/** Panels that should prompt before closing */
const UNSAVED_PANELS = new Set(['doc1', 'doc2']);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, DockManagerCoreComponent],
  template: `
    <div class="demo-root">
      <!-- Toolbar -->
      <div class="demo-toolbar">
        <div class="demo-toolbar-left">
          <span class="demo-title">Dock Manager Demo</span>

          <!-- Undo / Redo -->
          <div class="demo-btn-group">
            <button class="demo-toolbar-btn" title="Undo (Ctrl+Z)" (click)="undo()">
              <!-- Undo2 -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
              </svg>
            </button>
            <button class="demo-toolbar-btn" title="Redo (Ctrl+Shift+Z)" (click)="redo()">
              <!-- Redo2 -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 7v6h-6"></path><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"></path>
              </svg>
            </button>
          </div>

          <!-- Serialization -->
          <div class="demo-btn-group">
            <div class="demo-toolbar-sep"></div>
            <button class="demo-toolbar-btn" title="Save layout to localStorage" (click)="saveLayout()">
              <!-- Save -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
            </button>
            <button class="demo-toolbar-btn" title="Load layout from localStorage" (click)="loadLayout()">
              <!-- FolderOpen -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
            <button class="demo-toolbar-btn" title="Reset layout to default" (click)="resetLayout()">
              <!-- RotateCcw -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path>
              </svg>
            </button>
            <div class="demo-toolbar-sep"></div>
            <button class="demo-toolbar-btn" title="Export to JSON file" (click)="exportLayout()">
              <!-- Download -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
            <button class="demo-toolbar-btn" title="Import from JSON file" (click)="importLayout()">
              <!-- Upload -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
            </button>
            <div class="demo-toolbar-sep"></div>
            <button class="demo-toolbar-btn" title="Copy layout JSON to clipboard" (click)="copyLayout()">
              <!-- Copy -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <button class="demo-toolbar-btn" title="Paste layout JSON from clipboard" (click)="pasteLayout()">
              <!-- ClipboardPaste -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z"></path>
                <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M16 4h2a2 2 0 0 1 2 2v2"></path>
                <path d="M21 14H11"></path><path d="m15 10-4 4 4 4"></path>
              </svg>
            </button>
          </div>

          <!-- Layout Presets -->
          <div class="demo-btn-group">
            <div class="demo-toolbar-sep"></div>
            <button class="demo-toolbar-btn" title="Save current layout as preset" (click)="savePreset()">
              <!-- Bookmark -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>
              </svg>
            </button>
            <button class="demo-toolbar-btn" title="Load last saved preset" (click)="loadPreset()">
              <!-- BookmarkCheck -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>
                <path d="m9 10 2 2 4-4"></path>
              </svg>
            </button>
          </div>

          <!-- URL export/import -->
          <div class="demo-btn-group">
            <div class="demo-toolbar-sep"></div>
            <button class="demo-toolbar-btn" title="Copy layout as shareable URL" (click)="exportAsUrl()">
              <!-- Link -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
            </button>
            <button class="demo-toolbar-btn" title="Load layout from URL parameter" (click)="importFromUrl()">
              <!-- Unlink -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-7.07-7.07l-3 3a5 5 0 0 0 .54 7.54"></path>
                <path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l3-3a5 5 0 0 0-.54-7.54"></path>
                <line x1="2" y1="2" x2="22" y2="22"></line>
              </svg>
            </button>
          </div>

          <!-- DockviewApi controls -->
          <div class="demo-btn-group">
            <div class="demo-toolbar-sep"></div>
            <button class="demo-toolbar-btn" title="Add new panel (DockviewApi.addPanel)" (click)="addNewPanel()">
              <!-- Plus -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <button class="demo-toolbar-btn" title="Navigate previous" (click)="navigatePrev()">
              <!-- ChevronLeft -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m15 18-6-6 6-6"></path>
              </svg>
            </button>
            <button class="demo-toolbar-btn" title="Navigate next" (click)="navigateNext()">
              <!-- ChevronRight -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6"></path>
              </svg>
            </button>
          </div>

          <!-- Feature toggles -->
          <div class="demo-btn-group">
            <div class="demo-toolbar-sep"></div>
            <button class="demo-toolbar-btn" title="Dock all floating panels" (click)="dockAllFloating()">
              <!-- Anchor -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="5" r="3"></circle>
                <line x1="12" y1="22" x2="12" y2="8"></line>
                <path d="M5 12H2a10 10 0 0 0 20 0h-3"></path>
              </svg>
            </button>
            <button class="demo-toolbar-btn" title="Toggle disabled on Content Pane 2" (click)="toggleDisabled()">
              <!-- Ban -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="m4.9 4.9 14.2 14.2"></path>
              </svg>
            </button>
            <button
              class="demo-toolbar-btn demo-toolbar-btn-labelled"
              [class.demo-toolbar-btn-active]="debugMode"
              title="Toggle debug overlay"
              (click)="toggleDebug()"
            >
              <!-- Bug -->
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m8 2 1.88 1.88"></path><path d="M14.12 3.88 16 2"></path>
                <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"></path>
                <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"></path>
                <path d="M12 20v-9"></path><path d="M6.53 9C4.6 8.8 3 7.1 3 5"></path>
                <path d="M6 13H2"></path><path d="M3 21c0-2.1 1.7-3.9 3.8-4"></path>
                <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"></path><path d="M22 13h-4"></path>
                <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"></path>
              </svg>
              <span>Debug</span>
            </button>
            <button
              class="demo-toolbar-btn demo-toolbar-btn-labelled"
              [class.demo-toolbar-btn-active]="allowRootDock"
              title="Toggle edge docking (allowRootDock)"
              (click)="toggleAllowRootDock()"
            >
              <!-- Dock -->
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                <path d="M15 3v18"></path><path d="M15 15h6"></path>
              </svg>
              <span>Edge Dock</span>
            </button>
          </div>
        </div>

        <div class="demo-toolbar-right">
          <span class="demo-shortcut-hint">Ctrl+P: Panel Finder</span>
          <div class="demo-toolbar-sep"></div>
          <button class="demo-toolbar-btn" title="Keyboard shortcuts" (click)="showShortcuts = !showShortcuts">
            <!-- Keyboard -->
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="20" height="16" x="2" y="4" rx="2" ry="2"></rect>
              <path d="M6 8h.001"></path><path d="M10 8h.001"></path>
              <path d="M14 8h.001"></path><path d="M18 8h.001"></path>
              <path d="M8 12h.001"></path><path d="M12 12h.001"></path>
              <path d="M16 12h.001"></path><path d="M7 16h10"></path>
            </svg>
          </button>
          <!-- Theme selector -->
          <div class="demo-theme-selector">
            <!-- Sun / Moon icon -->
            @if (selectedTheme.mode === 'light') {
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="demo-theme-icon">
                <circle cx="12" cy="12" r="4"></circle>
                <path d="M12 2v2"></path><path d="M12 20v2"></path>
                <path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path>
                <path d="M2 12h2"></path><path d="M20 12h2"></path>
                <path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>
              </svg>
            } @else {
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="demo-theme-icon">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
              </svg>
            }
            <select class="demo-theme-select" [value]="selectedThemeKey" (change)="onThemeSelect($event)" title="Select theme">
              <optgroup label="Light Themes">
                @for (t of lightThemes; track t.key) {
                  <option [value]="t.key">{{ t.label }}</option>
                }
              </optgroup>
              <optgroup label="Dark Themes">
                @for (t of darkThemes; track t.key) {
                  <option [value]="t.key">{{ t.label }}</option>
                }
              </optgroup>
            </select>
          </div>
        </div>
      </div>

      <!-- Dock Manager -->
      <div class="demo-dock-container">
        <dock-manager-core
          [initialState]="currentState"
          [createContent]="createPanelContent"
          [createTab]="createTabContent"
          [createHeaderActions]="createHeaderActionsContent"
          [theme]="selectedTheme"
          (stateChange)="onStateChange($event)"
          (willClose)="onWillClose($event)">
        </dock-manager-core>

        @if (toast) {
          <div class="demo-toast">{{ toast }}</div>
        }
      </div>

      <!-- Keyboard shortcuts modal -->
      @if (showShortcuts) {
        <div class="demo-modal-backdrop" (click)="showShortcuts = false">
          <div class="demo-modal" (click)="$event.stopPropagation()">
            <div class="demo-modal-header">
              <h2 class="demo-modal-title">Keyboard Shortcuts</h2>
              <button class="demo-modal-close" (click)="showShortcuts = false">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>
                </svg>
              </button>
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
    .demo-root {
      height: 100vh;
      width: 100vw;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: hsl(var(--dock-bg));
    }

    /* Toolbar */
    .demo-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      background: hsl(var(--dock-panel-header));
      border-bottom: 1px solid hsl(var(--dock-border));
      flex-shrink: 0;
    }
    .demo-toolbar-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .demo-toolbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .demo-title {
      font-size: 12px;
      font-weight: 600;
      color: hsl(var(--dock-text));
      letter-spacing: 0.025em;
    }
    .demo-btn-group {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .demo-toolbar-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
      border: none;
      background: transparent;
      color: hsl(var(--dock-text-muted));
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .demo-toolbar-btn:hover {
      background: hsl(var(--dock-hover));
      color: hsl(var(--dock-text));
    }
    .demo-toolbar-btn-labelled {
      gap: 4px;
      padding: 4px 6px;
      font-size: 10px;
    }
    .demo-toolbar-btn-active {
      color: hsl(var(--dock-text));
      background: rgba(59, 130, 246, 0.2);
    }
    .demo-toolbar-btn-active:hover {
      background: rgba(59, 130, 246, 0.2);
      opacity: 0.9;
    }
    .demo-toolbar-sep {
      width: 1px;
      height: 16px;
      background: hsl(var(--dock-border));
      margin: 0 4px;
    }
    .demo-shortcut-hint {
      font-size: 10px;
      color: hsl(var(--dock-text-muted));
      white-space: nowrap;
    }

    /* Theme selector */
    .demo-theme-selector {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .demo-theme-icon {
      color: hsl(var(--dock-text-muted));
    }
    .demo-theme-select {
      font-size: 11px;
      color: hsl(var(--dock-text));
      background: hsl(var(--dock-surface-alt));
      border: 1px solid hsl(var(--dock-border));
      border-radius: 4px;
      padding: 2px 6px;
      cursor: pointer;
      outline: none;
    }

    /* Dock container */
    .demo-dock-container {
      flex: 1;
      overflow: hidden;
      position: relative;
      display: flex;
      min-height: 0;
    }

    /* Toast */
    .demo-toast {
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 16px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      background: hsl(var(--dock-surface));
      border: 1px solid hsl(var(--dock-border));
      font-size: 12px;
      color: hsl(var(--dock-text));
      z-index: 9999;
      white-space: nowrap;
    }

    /* Keyboard shortcuts modal */
    .demo-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.4);
    }
    .demo-modal {
      background: hsl(var(--dock-surface));
      border: 1px solid hsl(var(--dock-border));
      border-radius: 8px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      padding: 20px;
      width: 400px;
    }
    .demo-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .demo-modal-title {
      font-size: 14px;
      font-weight: 600;
      color: hsl(var(--dock-text));
      margin: 0;
    }
    .demo-modal-close {
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: hsl(var(--dock-text-muted));
      cursor: pointer;
      padding: 0;
    }
    .demo-modal-close:hover {
      color: hsl(var(--dock-text));
    }
    .demo-shortcuts-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;
    }
    .demo-shortcut-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 0;
      border-bottom: 1px solid hsl(var(--dock-border));
    }
    .demo-shortcut-row:last-child {
      border-bottom: none;
    }
    .demo-shortcut-desc {
      color: hsl(var(--dock-text-muted));
    }
    .demo-shortcut-key {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-family: monospace;
      background: hsl(var(--dock-surface-alt));
      border: 1px solid hsl(var(--dock-border));
      color: hsl(var(--dock-text));
    }
  `]
})
export class AppComponent implements OnInit, OnDestroy {
  currentState: DockManagerState = structuredClone(defaultState);
  toast: string | null = null;
  debugMode = false;
  allowRootDock = true;
  showShortcuts = false;
  @ViewChild(DockManagerCoreComponent) dockCore?: DockManagerCoreComponent;

  /** Theme selection */
  selectedThemeKey = 'vsCodeLight';
  selectedTheme: DockTheme = themes.vsCodeLight;
  lightThemes = THEME_OPTIONS.filter(t => t.theme.mode === 'light');
  darkThemes = THEME_OPTIONS.filter(t => t.theme.mode === 'dark');

  /** Keyboard shortcuts — same as React demo */
  shortcuts = [
    { key: 'Ctrl+Z', desc: 'Undo' },
    { key: 'Ctrl+Shift+Z', desc: 'Redo' },
    { key: 'Ctrl+P', desc: 'Panel finder' },
    { key: 'Ctrl+W', desc: 'Close active panel' },
    { key: 'Ctrl+Tab', desc: 'Pane navigator (next)' },
    { key: 'Ctrl+Shift+Tab', desc: 'Pane navigator (prev)' },
    { key: 'Ctrl+F6', desc: 'Next tab in group' },
    { key: 'Ctrl+Shift+F6', desc: 'Previous tab in group' },
    { key: 'Alt+F6', desc: 'Next pane (across groups)' },
    { key: 'Alt+Shift+F6', desc: 'Previous pane (across groups)' },
    { key: 'Alt+F7', desc: 'Open pane navigator' },
    { key: 'F11', desc: 'Maximize / Restore' },
    { key: 'Ctrl+Shift+Arrow', desc: 'Dock to edge' },
    { key: 'Escape', desc: 'Restore / Cancel drag' },
  ];

  private destroy$ = new Subject<void>();
  private toastTimer: any = null;
  private addPanelCounter = 0;

  /** Widget registry: maps widgetType to Angular component class */
  private widgetRegistry: Record<string, Type<any>> = {
    'clock': ClockWidgetComponent,
    'editor': EditorWidgetComponent,
    'terminal': TerminalWidgetComponent,
    'file-tree': FileTreeWidgetComponent,
    'problems': ProblemsWidgetComponent,
    'placeholder': PlaceholderWidgetComponent,
  };

  /** SVG icon map — matches React demo ICON_MAP */
  private static readonly ICON_SVGS: Record<string, string> = {
    file: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
    folder: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
    terminal: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    alert: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    scroll: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/></svg>',
    list: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    search: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    clock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };

  /** Custom tab renderer — matches React renderTab with icons and unsaved badges */
  createTabContent = (panelId: string, container: HTMLElement, isActive: boolean): IDisposable => {
    // Merge: panelConfigs has widgetType/icon, currentState has live title/badge from PanelApi
    const panel = { ...this.panelConfigs[panelId], ...this.currentState.panels[panelId] };
    if (!panel) return { dispose: () => {} };

    const span = document.createElement('span');
    span.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;user-select:none';
    span.style.color = isActive ? 'hsl(var(--dock-text))' : 'hsl(var(--dock-text-muted))';

    // Icon
    const iconKey = panel.icon;
    if (iconKey && AppComponent.ICON_SVGS[iconKey]) {
      const iconSpan = document.createElement('span');
      iconSpan.style.cssText = 'flex-shrink:0;opacity:0.7;display:flex;align-items:center';
      iconSpan.innerHTML = AppComponent.ICON_SVGS[iconKey];
      span.appendChild(iconSpan);
    }

    // Title
    const titleSpan = document.createElement('span');
    titleSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    titleSpan.textContent = panel.title;
    span.appendChild(titleSpan);

    // Unsaved dot
    if (UNSAVED_PANELS.has(panel.id)) {
      const dot = document.createElement('span');
      dot.style.cssText = 'display:inline-block;width:6px;height:6px;border-radius:50%;background:#fbbf24;flex-shrink:0';
      dot.title = 'Unsaved changes';
      span.appendChild(dot);
    }

    // Badge
    if (panel.badge) {
      const badge = document.createElement('span');
      badge.style.cssText = 'font-size:9px;opacity:0.6;margin-left:2px';
      badge.textContent = panel.badge;
      span.appendChild(badge);
    }

    container.appendChild(span);
    return { dispose: () => { container.innerHTML = ''; } };
  };

  /** Header actions renderer — matches React renderRightHeaderActions/renderPrefixHeaderActions */
  createHeaderActionsContent = (slot: 'left' | 'right' | 'prefix', tabGroupId: string, container: HTMLElement): IDisposable => {
    if (tabGroupId === 'tg_center' && slot === 'right') {
      // Run file button (same as React renderRightHeaderActions)
      const btn = document.createElement('button');
      btn.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:4px;border:none;background:transparent;color:hsl(var(--dock-text-muted));border-radius:4px;cursor:pointer;transition:all 0.15s';
      btn.title = 'Run file';
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
      btn.addEventListener('mouseenter', () => { btn.style.color = 'hsl(var(--dock-text))'; btn.style.background = 'hsl(var(--dock-hover))'; });
      btn.addEventListener('mouseleave', () => { btn.style.color = 'hsl(var(--dock-text-muted))'; btn.style.background = 'transparent'; });
      btn.addEventListener('click', () => this.showToast('Running active document...'));
      container.appendChild(btn);
      return { dispose: () => { container.innerHTML = ''; } };
    }

    if (tabGroupId === 'tg_center' && slot === 'prefix') {
      // Open editors icon (same as React renderPrefixHeaderActions)
      const span = document.createElement('span');
      span.style.cssText = 'display:flex;align-items:center;padding:0 6px;color:hsl(var(--dock-text-muted));opacity:0.6';
      span.title = 'Open editors';
      span.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>';
      container.appendChild(span);
      return { dispose: () => { container.innerHTML = ''; } };
    }

    return { dispose: () => {} };
  };

  /** Panel configs from initial state — used for widget type lookup since runtime state may omit config fields */
  private panelConfigs: Record<string, any> = { ...defaultState.panels };

  /** Content renderer — creates widget components or placeholder content */
  createPanelContent = (panelId: string, container: HTMLElement, api: any): IDisposable => {
    const panel = this.panelConfigs[panelId] || this.currentState.panels[panelId];
    const widgetType = panel?.widgetType || '';
    const WidgetClass = this.widgetRegistry[widgetType];

    if (WidgetClass) {
      const hostEl = document.createElement('div');
      hostEl.style.cssText = 'width:100%;height:100%;color:inherit';
      container.appendChild(hostEl);

      const ref = createComponent(WidgetClass, {
        hostElement: hostEl,
        environmentInjector: this.envInjector,
      });

      ref.setInput('api', api);
      ref.setInput('panel', panel);

      this.appRef.attachView(ref.hostView);
      // Defer detectChanges to avoid re-entrancy (createContent → detectChanges → stateChange → createContent)
      queueMicrotask(() => ref.changeDetectorRef.detectChanges());

      return {
        dispose: () => {
          this.appRef.detachView(ref.hostView);
          ref.destroy();
          container.innerHTML = '';
        },
      };
    }

    // Fallback: use PlaceholderWidgetComponent (same as React PlaceholderWidget)
    const hostEl = document.createElement('div');
    hostEl.style.cssText = 'width:100%;height:100%;color:inherit';
    container.appendChild(hostEl);

    const ref = createComponent(PlaceholderWidgetComponent, {
      hostElement: hostEl,
      environmentInjector: this.envInjector,
    });

    ref.setInput('api', api);
    ref.setInput('panel', panel || { id: panelId, title: panelId });

    this.appRef.attachView(ref.hostView);
    queueMicrotask(() => ref.changeDetectorRef.detectChanges());

    return {
      dispose: () => {
        this.appRef.detachView(ref.hostView);
        ref.destroy();
        container.innerHTML = '';
      },
    };
  };

  constructor(
    private themeService: DockThemeService,
    private appRef: ApplicationRef,
    private envInjector: EnvironmentInjector,
  ) {}

  ngOnInit(): void {
    this.currentState = structuredClone(defaultState);
    this.loadThemePreference();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  private loadThemePreference(): void {
    const saved = localStorage.getItem('dock-manager-theme-key');
    if (saved && (themes as Record<string, DockTheme>)[saved]) {
      this.selectedThemeKey = saved;
      this.selectedTheme = (themes as Record<string, DockTheme>)[saved];
      this.themeService.setThemeMode(this.selectedTheme.mode);
    }
  }

  onStateChange(state: DockManagerState): void {
    this.currentState = state;
  }

  // ── Preventable close (matches React onWillClose) ─────────────────────

  onWillClose(data: { event: PreventableDockEvent; panelId: string }): void {
    if (UNSAVED_PANELS.has(data.panelId)) {
      const panel = this.currentState.panels[data.panelId];
      if (!window.confirm(`"${panel?.title ?? data.panelId}" has unsaved changes. Close anyway?`)) {
        data.event.preventDefault();
      }
    }
  }

  // ── Theme ────────────────────────────────────────────────────────────

  onThemeSelect(event: Event): void {
    const key = (event.target as HTMLSelectElement).value;
    this.selectedThemeKey = key;
    const opt = THEME_OPTIONS.find(o => o.key === key);
    if (opt) {
      this.selectedTheme = opt.theme;
      this.themeService.setThemeMode(opt.theme.mode);
    }
  }

  // ── Undo / Redo ──────────────────────────────────────────────────────

  undo(): void {
    this.dockCore?.getInstance()?.api?.undo();
    this.showToast('Undo');
  }

  redo(): void {
    this.dockCore?.getInstance()?.api?.redo();
    this.showToast('Redo');
  }

  // ── Layout Presets ───────────────────────────────────────────────────

  savePreset(): void {
    const api = this.dockCore?.getInstance()?.api;
    if (!api) return;
    const name = `Preset ${(api.getPresets().length + 1)}`;
    api.savePreset(name);
    this.showToast(`Saved preset "${name}"`);
  }

  loadPreset(): void {
    const api = this.dockCore?.getInstance()?.api;
    if (!api) return;
    const presets = api.getPresets();
    if (presets.length === 0) {
      this.showToast('No presets saved');
      return;
    }
    const preset = presets[presets.length - 1];
    api.loadPreset(preset);
    this.showToast(`Loaded preset "${preset.name}"`);
  }

  // ── URL export/import ────────────────────────────────────────────────

  exportAsUrl(): void {
    const api = this.dockCore?.getInstance()?.api;
    if (!api) return;
    const encoded = api.exportAsUrl();
    const url = `${window.location.origin}${window.location.pathname}?layout=${encoded}`;
    navigator.clipboard.writeText(url).then(
      () => this.showToast('Layout URL copied to clipboard'),
      () => this.showToast('Failed to copy URL'),
    );
  }

  importFromUrl(): void {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('layout');
    if (!encoded) {
      this.showToast('No layout found in URL');
      return;
    }
    const api = this.dockCore?.getInstance()?.api;
    if (!api) return;
    try {
      api.importFromUrl(encoded);
      this.showToast('Layout loaded from URL');
    } catch {
      this.showToast('Failed to decode layout from URL');
    }
  }

  // ── Dock all floating ────────────────────────────────────────────────

  dockAllFloating(): void {
    const api = this.dockCore?.getInstance()?.api;
    if (!api) return;
    const count = api.getFloatingPanels().length;
    if (count === 0) {
      this.showToast('No floating panels');
      return;
    }
    api.dockAllFloating();
    this.showToast(`Docked ${count} floating panel${count > 1 ? 's' : ''}`);
  }

  // ── Toggle disabled ──────────────────────────────────────────────────

  toggleDisabled(): void {
    const api = this.dockCore?.getInstance()?.api;
    if (!api) return;
    const state = this.dockCore?.getState();
    if (!state) return;
    const current = state.panels['contentPane2'];
    if (!current) return;
    api.updatePanel('contentPane2', { disabled: !current.disabled });
    this.showToast(`Output panel ${current.disabled ? 'enabled' : 'disabled'}`);
  }

  // ── Debug mode ───────────────────────────────────────────────────────

  toggleDebug(): void {
    const api = this.dockCore?.getInstance()?.api;
    if (!api) return;
    this.debugMode = !this.debugMode;
    api.setDebugMode(this.debugMode);
    this.showToast(this.debugMode ? 'Debug mode ON' : 'Debug mode OFF');
  }

  // ── Edge dock toggle ─────────────────────────────────────────────────

  toggleAllowRootDock(): void {
    this.allowRootDock = !this.allowRootDock;
    this.dockCore?.getInstance()?.updateOptions({ allowRootDock: this.allowRootDock });
  }

  // ── DockviewApi controls ─────────────────────────────────────────────

  addNewPanel(): void {
    const api = this.dockCore?.getInstance()?.api;
    if (!api) return;
    this.addPanelCounter++;
    const id = `new_panel_${this.addPanelCounter}`;
    const config = {
      id,
      panelId: id,
      title: `New Panel ${this.addPanelCounter}`,
      widgetType: this.addPanelCounter % 2 === 0 ? 'clock' : 'editor',
      widgetProps: this.addPanelCounter % 2 === 0 ? {} : { language: 'ts' },
      icon: this.addPanelCounter % 2 === 0 ? 'clock' : 'file',
    };
    this.panelConfigs[id] = config;
    api.addPanel(config);
    this.showToast(`Added panel "${id}"`);
  }

  navigateNext(): void {
    this.dockCore?.getInstance()?.api?.navigateNext();
  }

  navigatePrev(): void {
    this.dockCore?.getInstance()?.api?.navigatePrevious();
  }

  // ── Layout persistence ───────────────────────────────────────────────

  saveLayout(): void {
    localStorage.setItem('dock-manager-state', JSON.stringify(this.currentState));
    this.showToast('Layout saved');
  }

  loadLayout(): void {
    const saved = localStorage.getItem('dock-manager-state');
    if (saved) {
      try { this.currentState = JSON.parse(saved); this.showToast('Layout loaded'); }
      catch { this.showToast('Failed to load layout'); }
    } else {
      this.showToast('No saved layout found');
    }
  }

  resetLayout(): void {
    localStorage.removeItem('dock-manager-state');
    this.currentState = structuredClone(defaultState);
    this.showToast('Layout reset');
  }

  exportLayout(): void {
    const blob = new Blob([JSON.stringify(this.currentState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dock-layout-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('Layout exported');
  }

  importLayout(): void {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev: any) => {
        try {
          this.currentState = JSON.parse(ev.target.result);
          this.showToast('Layout imported');
        } catch { this.showToast('Failed to import'); }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  async copyLayout(): Promise<void> {
    try {
      await navigator.clipboard.writeText(JSON.stringify(this.currentState));
      this.showToast('Copied to clipboard');
    } catch {
      this.showToast('Copy failed');
    }
  }

  async pasteLayout(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      this.currentState = JSON.parse(text) as DockManagerState;
      this.showToast('Pasted from clipboard');
    } catch (e: unknown) {
      this.showToast(`Paste failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  // ── Toast ────────────────────────────────────────────────────────────

  private showToast(msg: string): void {
    this.toast = msg;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toast = null; }, 2500);
  }
}
