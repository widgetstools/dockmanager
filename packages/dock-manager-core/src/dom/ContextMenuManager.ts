/**
 * ContextMenuManager handles right-click context menus on tab elements.
 *
 * It uses event delegation on the container element to listen for
 * `contextmenu` events on `[data-tab-id]` elements, and shows a
 * floating context menu with relevant panel actions.
 */

import type { DockAction } from '../reducer/dockReducer';
import type { DockManagerState, PanelConfig } from '../types/dock';
import type { DockResourceStrings } from '../types/resourceStrings';
import { defaultResourceStrings } from '../types/resourceStrings';
import { findTabGroupForPanel } from '../layout/LayoutTree';

// ─── Types ────────────────────────────────────────────────────────────

export interface ContextMenuManagerOptions {
  /** The container element to attach the contextmenu listener to. */
  containerElement: HTMLElement;
  /** Dispatch a DockAction to the reducer. */
  dispatch: (action: DockAction) => void;
  /** Returns the current dock manager state. */
  getState: () => DockManagerState;
  /** Current theme mode for styling. */
  theme?: 'light' | 'dark';
  /** Custom resource strings for localization. */
  resourceStrings?: Partial<DockResourceStrings>;
  /** Called when the user requests an explicit layout save via context menu. */
  onSaveLayout?: (state: DockManagerState) => void;
}

interface MenuItem {
  label: string;
  action: () => void;
  disabled: boolean;
}

interface MenuSeparator {
  separator: true;
}

type MenuEntry = MenuItem | MenuSeparator;

function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return 'separator' in entry;
}

// ─── ContextMenuManager ─────────────────────────────────────────────

export class ContextMenuManager {
  private options: ContextMenuManagerOptions;
  private container: HTMLElement;
  private menuEl: HTMLDivElement | null = null;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;
  private escapeHandler: ((e: KeyboardEvent) => void) | null = null;
  private resourceStrings: DockResourceStrings;

  constructor(options: ContextMenuManagerOptions) {
    this.options = options;
    this.container = options.containerElement;
    this.resourceStrings = { ...defaultResourceStrings, ...options.resourceStrings };
    this.container.addEventListener('contextmenu', this.onContextMenu);
  }

  /** Remove the contextmenu listener and close any open menu. */
  dispose(): void {
    this.container.removeEventListener('contextmenu', this.onContextMenu);
    this.closeMenu();
  }

  // ── Handler ──────────────────────────────────────────────────────

  private onContextMenu = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    const tabEl = target.closest<HTMLElement>('[data-tab-id]');
    if (!tabEl) return;

    e.preventDefault();
    e.stopPropagation();

    const panelId = tabEl.getAttribute('data-tab-id');
    if (!panelId) return;

    const state = this.options.getState();
    const panel = state.panels.get(panelId);
    if (!panel) return;

    // Don't show context menu for disabled panels
    if (panel.disabled) return;

    const tabGroupId = findTabGroupForPanel(state.layout, panelId);
    this.showMenu(panelId, panel, tabGroupId, e.clientX, e.clientY);
  };

  // ── Menu construction ────────────────────────────────────────────

  private buildMenuEntries(panelId: string, panel: PanelConfig, tabGroupId: string | null): MenuEntry[] {
    const state = this.options.getState();
    const entries: MenuEntry[] = [];

    // Close
    entries.push({
      label: this.resourceStrings.close,
      action: () => {
        this.options.dispatch({ type: 'CLOSE_PANEL', panelId });
      },
      disabled: panel.closable === false,
    });

    // Close Others — find sibling panels in the same tab group
    if (tabGroupId) {
      const group = this.findTabGroup(state.layout, tabGroupId);
      if (group && group.panels.length > 1) {
        entries.push({
          label: this.resourceStrings.closeOthers,
          action: () => {
            const currentState = this.options.getState();
            const currentGroup = this.findTabGroup(currentState.layout, tabGroupId);
            if (currentGroup) {
              for (const pid of currentGroup.panels) {
                if (pid !== panelId && currentState.panels.get(pid)?.closable !== false) {
                  this.options.dispatch({ type: 'CLOSE_PANEL', panelId: pid });
                }
              }
            }
          },
          disabled: false,
        });

        // Close All
        entries.push({
          label: this.resourceStrings.closeAll,
          action: () => {
            const currentState = this.options.getState();
            const currentGroup = this.findTabGroup(currentState.layout, tabGroupId);
            if (currentGroup) {
              for (const pid of currentGroup.panels) {
                if (currentState.panels.get(pid)?.closable !== false) {
                  this.options.dispatch({ type: 'CLOSE_PANEL', panelId: pid });
                }
              }
            }
          },
          disabled: false,
        });

        // Close to the Right
        const panelIndex = group.panels.indexOf(panelId);
        if (panelIndex < group.panels.length - 1) {
          entries.push({
            label: 'Close to the Right',
            action: () => {
              const currentState = this.options.getState();
              const currentGroup = this.findTabGroup(currentState.layout, tabGroupId);
              if (currentGroup) {
                const idx = currentGroup.panels.indexOf(panelId);
                for (let i = idx + 1; i < currentGroup.panels.length; i++) {
                  const pid = currentGroup.panels[i];
                  if (currentState.panels.get(pid)?.closable !== false) {
                    this.options.dispatch({ type: 'CLOSE_PANEL', panelId: pid });
                  }
                }
              }
            },
            disabled: false,
          });
        }
      }
    }

    // Separator
    entries.push({ separator: true });

    // Float
    entries.push({
      label: this.resourceStrings.float,
      action: () => {
        this.options.dispatch({
          type: 'FLOAT_PANEL',
          panelId, x: 200, y: 200, width: 400, height: 300,
        });
      },
      disabled: panel.floatable === false,
    });

    // Pin/Unpin — check if panel is unpinned
    if (panel.allowPinning !== false) {
      const isUnpinned = state.placements.get(panelId)?.type === 'unpinned';
      if (isUnpinned) {
        entries.push({
          label: this.resourceStrings.pin,
          action: () => {
            this.options.dispatch({ type: 'PIN_PANEL', panelId });
          },
          disabled: false,
        });
      } else {
        entries.push({
          label: this.resourceStrings.unpin,
          action: () => {
            this.options.dispatch({ type: 'UNPIN_PANEL', panelId });
          },
          disabled: false,
        });
      }
    }

    // Separator
    entries.push({ separator: true });

    // Maximize
    entries.push({
      label: this.resourceStrings.maximize,
      action: () => {
        this.options.dispatch({ type: 'MAXIMIZE_PANEL', panelId });
      },
      disabled: false,
    });

    // Save Layout — always enabled
    if (this.options.onSaveLayout) {
      entries.push({ separator: true });
      entries.push({
        label: this.resourceStrings.saveLayout,
        action: () => {
          this.options.onSaveLayout!(this.options.getState());
        },
        disabled: false,
      });
    }

    return entries;
  }

  // ── Menu display ─────────────────────────────────────────────────

  private showMenu(panelId: string, panel: PanelConfig, tabGroupId: string | null, x: number, y: number): void {
    this.closeMenu();

    const entries = this.buildMenuEntries(panelId, panel, tabGroupId);

    const menu = document.createElement('div');
    menu.className = 'dock-context-menu';
    menu.style.cssText = `position:fixed;z-index:10010;`;

    for (const entry of entries) {
      if (isSeparator(entry)) {
        const sep = document.createElement('div');
        sep.className = 'dock-context-menu-separator';
        menu.appendChild(sep);
      } else {
        const item = document.createElement('div');
        item.className = 'dock-context-menu-item' + (entry.disabled ? ' disabled' : '');
        item.textContent = entry.label;

        if (!entry.disabled) {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeMenu();
            entry.action();
          });
        }

        menu.appendChild(item);
      }
    }

    document.body.appendChild(menu);
    this.menuEl = menu;

    // Position: adjust if near screen edges
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let finalX = x;
    let finalY = y;

    if (x + menuRect.width > viewportWidth) {
      finalX = viewportWidth - menuRect.width - 4;
    }
    if (y + menuRect.height > viewportHeight) {
      finalY = viewportHeight - menuRect.height - 4;
    }
    if (finalX < 0) finalX = 4;
    if (finalY < 0) finalY = 4;

    menu.style.left = `${finalX}px`;
    menu.style.top = `${finalY}px`;

    // Close on click outside
    this.outsideClickHandler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        this.closeMenu();
      }
    };
    setTimeout(() => {
      if (this.outsideClickHandler) {
        document.addEventListener('mousedown', this.outsideClickHandler);
      }
    }, 0);

    // Close on Escape
    this.escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeMenu();
      }
    };
    document.addEventListener('keydown', this.escapeHandler);
  }

  closeMenu(): void {
    if (this.menuEl) {
      if (this.menuEl.parentNode) {
        this.menuEl.parentNode.removeChild(this.menuEl);
      }
      this.menuEl = null;
    }
    if (this.outsideClickHandler) {
      document.removeEventListener('mousedown', this.outsideClickHandler);
      this.outsideClickHandler = null;
    }
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler);
      this.escapeHandler = null;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private findTabGroup(
    layout: import('../types/dock').LayoutNode,
    tabGroupId: string,
  ): import('../types/dock').TabGroupNode | null {
    if (layout.type === 'tabgroup') {
      return layout.id === tabGroupId ? layout : null;
    }
    for (const child of layout.children) {
      const found = this.findTabGroup(child, tabGroupId);
      if (found) return found;
    }
    return null;
  }
}
