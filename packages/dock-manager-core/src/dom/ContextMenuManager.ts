import type { DockAction } from '../reducer/dockReducer';
import type { DockManagerState, PanelConfig } from '../types/dock';
import type { DockResourceStrings } from '../types/resourceStrings';
import { defaultResourceStrings } from '../types/resourceStrings';
import { findTabGroupForPanel } from '../layout/LayoutTree';

export interface ContextMenuManagerOptions {
  containerElement: HTMLElement;
  dispatch: (action: DockAction) => void;
  getState: () => DockManagerState;
  theme?: 'light' | 'dark';
  resourceStrings?: Partial<DockResourceStrings>;
  onSaveLayout?: (state: DockManagerState) => void;
}

interface MenuItem { label: string; action: () => void; disabled: boolean; }
interface MenuSeparator { separator: true; }
type MenuEntry = MenuItem | MenuSeparator;
function isSeparator(entry: MenuEntry): entry is MenuSeparator { return 'separator' in entry; }

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

  dispose(): void {
    this.container.removeEventListener('contextmenu', this.onContextMenu);
    this.closeMenu();
  }

  private onContextMenu = (e: MouseEvent): void => {
    const tabEl = (e.target as HTMLElement).closest<HTMLElement>('[data-tab-id]');
    if (!tabEl) return;
    e.preventDefault();
    e.stopPropagation();
    const panelId = tabEl.getAttribute('data-tab-id');
    if (!panelId) return;
    const state = this.options.getState();
    const panel = state.panels.get(panelId);
    if (!panel || panel.disabled) return;
    const tabGroupId = findTabGroupForPanel(state.layout, panelId);
    this.showMenu(panelId, panel, tabGroupId, e.clientX, e.clientY);
  };

  private closePanels(tabGroupId: string, filter: (pid: string, idx: number, panels: string[]) => boolean): void {
    const state = this.options.getState();
    const group = this.findTabGroup(state.layout, tabGroupId);
    if (!group) return;
    group.panels.forEach((pid, i, arr) => {
      if (filter(pid, i, arr) && state.panels.get(pid)?.closable !== false) {
        this.options.dispatch({ type: 'CLOSE_PANEL', panelId: pid });
      }
    });
  }

  private buildMenuEntries(panelId: string, panel: PanelConfig, tabGroupId: string | null): MenuEntry[] {
    const state = this.options.getState();
    const rs = this.resourceStrings;
    const entries: MenuEntry[] = [
      { label: rs.close, action: () => this.options.dispatch({ type: 'CLOSE_PANEL', panelId }), disabled: panel.closable === false },
    ];

    if (tabGroupId) {
      const group = this.findTabGroup(state.layout, tabGroupId);
      if (group && group.panels.length > 1) {
        entries.push(
          { label: rs.closeOthers, action: () => this.closePanels(tabGroupId, pid => pid !== panelId), disabled: false },
          { label: rs.closeAll, action: () => this.closePanels(tabGroupId, () => true), disabled: false },
        );
        const panelIndex = group.panels.indexOf(panelId);
        if (panelIndex < group.panels.length - 1) {
          entries.push({
            label: 'Close to the Right',
            action: () => this.closePanels(tabGroupId, (_pid, i) => i > group.panels.indexOf(panelId)),
            disabled: false,
          });
        }
      }
    }

    entries.push({ separator: true });
    entries.push({
      label: rs.float, disabled: panel.floatable === false,
      action: () => this.options.dispatch({ type: 'FLOAT_PANEL', panelId, x: 200, y: 200, width: 400, height: 300 }),
    });

    if (panel.allowPinning !== false) {
      const isUnpinned = state.placements.get(panelId)?.type === 'unpinned';
      entries.push({
        label: isUnpinned ? rs.pin : rs.unpin, disabled: false,
        action: () => this.options.dispatch({ type: isUnpinned ? 'PIN_PANEL' : 'UNPIN_PANEL', panelId }),
      });
    }

    entries.push({ separator: true });
    entries.push({ label: rs.maximize, action: () => this.options.dispatch({ type: 'MAXIMIZE_PANEL', panelId }), disabled: false });

    if (this.options.onSaveLayout) {
      entries.push({ separator: true });
      entries.push({ label: rs.saveLayout, action: () => this.options.onSaveLayout!(this.options.getState()), disabled: false });
    }
    return entries;
  }

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
          item.addEventListener('click', (e) => { e.stopPropagation(); this.closeMenu(); entry.action(); });
        }
        menu.appendChild(item);
      }
    }

    document.body.appendChild(menu);
    this.menuEl = menu;

    const rect = menu.getBoundingClientRect();
    let fx = x, fy = y;
    if (x + rect.width > window.innerWidth) fx = window.innerWidth - rect.width - 4;
    if (y + rect.height > window.innerHeight) fy = window.innerHeight - rect.height - 4;
    if (fx < 0) fx = 4;
    if (fy < 0) fy = 4;
    menu.style.left = `${fx}px`;
    menu.style.top = `${fy}px`;

    this.outsideClickHandler = (e: MouseEvent) => { if (!menu.contains(e.target as Node)) this.closeMenu(); };
    setTimeout(() => { if (this.outsideClickHandler) document.addEventListener('mousedown', this.outsideClickHandler); }, 0);
    this.escapeHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.closeMenu(); };
    document.addEventListener('keydown', this.escapeHandler);
  }

  closeMenu(): void {
    if (this.menuEl) { this.menuEl.parentNode?.removeChild(this.menuEl); this.menuEl = null; }
    if (this.outsideClickHandler) { document.removeEventListener('mousedown', this.outsideClickHandler); this.outsideClickHandler = null; }
    if (this.escapeHandler) { document.removeEventListener('keydown', this.escapeHandler); this.escapeHandler = null; }
  }

  private findTabGroup(
    layout: import('../types/dock').LayoutNode, tabGroupId: string,
  ): import('../types/dock').TabGroupNode | null {
    if (layout.type === 'tabgroup') return layout.id === tabGroupId ? layout : null;
    for (const child of layout.children) {
      const found = this.findTabGroup(child, tabGroupId);
      if (found) return found;
    }
    return null;
  }
}
