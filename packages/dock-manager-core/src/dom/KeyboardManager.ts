import type { DockAction } from '../reducer/dockReducer';
import type { DockManagerState, LayoutNode, TabGroupNode } from '../types/dock';
import { findTabGroupForPanel, findTabGroupById } from '../layout/LayoutTree';

export interface KeyboardManagerOptions {
  containerElement: HTMLElement;
  dispatch: (action: DockAction) => void;
  getState: () => DockManagerState;
  onUndo?: () => void;
  onRedo?: () => void;
  onPanelFinder?: () => void;
}

function isTextInput(target: EventTarget | null): boolean {
  if (!target || !(target as HTMLElement).tagName) return false;
  const el = target as HTMLElement;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
  if (el.isContentEditable) return true;
  if (typeof el.getAttribute === 'function' && el.getAttribute('contenteditable') === 'true') return true;
  return false;
}

function isModKey(e: KeyboardEvent): boolean {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  return isMac ? e.metaKey : e.ctrlKey;
}

function adjacentTabInGroup(
  layout: LayoutNode, activePanelId: string, direction: 'next' | 'previous',
): { tabGroupId: string; panelId: string } | null {
  const tabGroupId = findTabGroupForPanel(layout, activePanelId);
  if (!tabGroupId) return null;
  const group = findTabGroupById(layout, tabGroupId);
  if (!group || group.panels.length < 2) return null;
  const idx = group.panels.indexOf(activePanelId);
  if (idx === -1) return null;
  const nextIdx = direction === 'next'
    ? (idx + 1) % group.panels.length
    : (idx - 1 + group.panels.length) % group.panels.length;
  return { tabGroupId, panelId: group.panels[nextIdx] };
}

export class KeyboardManager {
  private options: KeyboardManagerOptions;
  private container: HTMLElement;
  private paneNavigatorHandler: ((direction: 'next' | 'previous') => void) | null = null;

  constructor(options: KeyboardManagerOptions) {
    this.options = options;
    this.container = options.containerElement;
    this.container.addEventListener('keydown', this.onKeyDown);
  }

  dispose(): void { this.container.removeEventListener('keydown', this.onKeyDown); }

  setPaneNavigatorHandler(handler: ((direction: 'next' | 'previous') => void) | null): void {
    this.paneNavigatorHandler = handler;
  }

  private activateTab(result: { tabGroupId: string; panelId: string }): void {
    this.options.dispatch({ type: 'SET_ACTIVE_PANEL', groupId: result.tabGroupId, panelId: result.panelId });
    this.options.dispatch({ type: 'SET_ACTIVE_PANE', panelId: result.panelId });
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isTextInput(e.target)) return;
    const mod = isModKey(e);
    const state = this.options.getState();

    if (mod && !e.shiftKey && !e.altKey && e.key === 'z') {
      e.preventDefault(); this.options.onUndo?.(); return;
    }
    if (mod && e.shiftKey && !e.altKey && e.key === 'Z') {
      e.preventDefault(); this.options.onRedo?.(); return;
    }
    if (mod && !e.shiftKey && !e.altKey && e.key === 'p') {
      e.preventDefault(); this.options.onPanelFinder?.(); return;
    }
    if (mod && !e.shiftKey && !e.altKey && e.key === 'w') {
      e.preventDefault();
      const p = state.activePaneId;
      if (p && state.panels.get(p)?.closable !== false && !state.panels.get(p)?.disabled)
        this.options.dispatch({ type: 'CLOSE_PANEL', panelId: p });
      return;
    }
    if (mod && !e.altKey && e.key === 'F6') {
      e.preventDefault();
      const result = adjacentTabInGroup(state.layout, state.activePaneId, e.shiftKey ? 'previous' : 'next');
      if (result) this.activateTab(result);
      return;
    }
    if (!mod && e.altKey && e.key === 'F6') {
      e.preventDefault();
      this.options.dispatch({ type: 'NAVIGATE', direction: e.shiftKey ? 'previous' : 'next' });
      return;
    }
    if (mod && e.shiftKey && !e.altKey) {
      const edgeMap: Record<string, 'left' | 'right' | 'top' | 'bottom'> = {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom',
      };
      const edge = edgeMap[e.key];
      if (edge && state.activePaneId && !state.panels.get(state.activePaneId)?.disabled) {
        e.preventDefault();
        this.options.dispatch({ type: 'DOCK_TO_EDGE', panelId: state.activePaneId, edge });
        return;
      }
    }
    if (e.key === 'Escape' && !mod && !e.shiftKey && !e.altKey) {
      if (state.maximizedPanelId) {
        e.preventDefault();
        this.options.dispatch({ type: 'RESTORE_PANEL', panelId: state.maximizedPanelId });
        return;
      }
      if (state.placements.get(state.activePaneId)?.type === 'floating' && state.activePaneId) {
        e.preventDefault();
        this.options.dispatch({ type: 'DOCK_FLOATING', panelId: state.activePaneId, targetGroupId: 'default', position: 'center' });
        return;
      }
    }
    if (e.key === 'F11' && !mod && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (state.maximizedPanelId) {
        this.options.dispatch({ type: 'RESTORE_PANEL', panelId: state.maximizedPanelId });
      } else if (state.activePaneId && !state.panels.get(state.activePaneId)?.disabled) {
        this.options.dispatch({ type: 'MAXIMIZE_PANEL', panelId: state.activePaneId });
      }
      return;
    }
    if (e.ctrlKey && !e.altKey && e.key === 'Tab') {
      e.preventDefault();
      this.paneNavigatorHandler?.(e.shiftKey ? 'previous' : 'next');
      return;
    }
    if (!mod && e.altKey && !e.shiftKey && e.key === 'F7') {
      e.preventDefault();
      this.paneNavigatorHandler?.('next');
      return;
    }
  };
}
