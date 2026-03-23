/**
 * KeyboardManager handles comprehensive keyboard shortcuts for the dock manager.
 *
 * All shortcuts are bound to the container element's `keydown` event.
 * Shortcuts are suppressed when the event target is an input, textarea, or
 * contenteditable element so that normal text editing is not interrupted.
 */

import type { DockAction } from '../reducer/dockReducer';
import type { DockManagerState, LayoutNode, TabGroupNode } from '../types/dock';
import { findTabGroupForPanel, findTabGroupById } from '../layout/LayoutTree';

// ─── Types ────────────────────────────────────────────────────────────

export interface KeyboardManagerOptions {
  /** The container element to attach the keydown listener to. */
  containerElement: HTMLElement;
  /** Dispatch a DockAction to the reducer. */
  dispatch: (action: DockAction) => void;
  /** Returns the current dock manager state. */
  getState: () => DockManagerState;
  /** Called when undo is requested (Ctrl+Z). */
  onUndo?: () => void;
  /** Called when redo is requested (Ctrl+Shift+Z). */
  onRedo?: () => void;
  /** Called when panel finder is requested (Ctrl+P). */
  onPanelFinder?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Returns true if the event target is a text-entry element. */
function isTextInput(target: EventTarget | null): boolean {
  if (!target || !(target as HTMLElement).tagName) return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  // Check contenteditable via property and attribute (jsdom compat)
  if (el.isContentEditable) return true;
  if (typeof el.getAttribute === 'function' && el.getAttribute('contenteditable') === 'true') {
    return true;
  }
  return false;
}

/** Platform-agnostic check for Ctrl (Windows/Linux) or Cmd (macOS). */
function isModKey(e: KeyboardEvent): boolean {
  // navigator may not exist in SSR; default to ctrlKey
  const isMac =
    typeof navigator !== 'undefined' &&
    navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  return isMac ? e.metaKey : e.ctrlKey;
}

/**
 * Given the active panel and the layout, find the next/previous tab in the
 * **same** tab group (wrapping around).
 */
function adjacentTabInGroup(
  layout: LayoutNode,
  activePanelId: string,
  direction: 'next' | 'previous',
): { tabGroupId: string; panelId: string } | null {
  const tabGroupId = findTabGroupForPanel(layout, activePanelId);
  if (!tabGroupId) return null;
  const group = findTabGroupById(layout, tabGroupId);
  if (!group || group.panels.length < 2) return null;

  const idx = group.panels.indexOf(activePanelId);
  if (idx === -1) return null;

  let nextIdx: number;
  if (direction === 'next') {
    nextIdx = (idx + 1) % group.panels.length;
  } else {
    nextIdx = (idx - 1 + group.panels.length) % group.panels.length;
  }
  return { tabGroupId, panelId: group.panels[nextIdx] };
}

// ─── KeyboardManager ─────────────────────────────────────────────────

export class KeyboardManager {
  private options: KeyboardManagerOptions;
  private container: HTMLElement;

  constructor(options: KeyboardManagerOptions) {
    this.options = options;
    this.container = options.containerElement;
    this.container.addEventListener('keydown', this.onKeyDown);
  }

  /** Remove the keydown listener. */
  dispose(): void {
    this.container.removeEventListener('keydown', this.onKeyDown);
  }

  // ── Handler ──────────────────────────────────────────────────────

  private onKeyDown = (e: KeyboardEvent): void => {
    // Never intercept shortcuts when the user is typing in an input.
    if (isTextInput(e.target)) return;

    const mod = isModKey(e);
    const state = this.options.getState();

    // ── Ctrl+Z / Cmd+Z  →  Undo ────────────────────────────────
    if (mod && !e.shiftKey && !e.altKey && e.key === 'z') {
      e.preventDefault();
      this.options.onUndo?.();
      return;
    }

    // ── Ctrl+Shift+Z / Cmd+Shift+Z  →  Redo ─────────────────────
    if (mod && e.shiftKey && !e.altKey && e.key === 'Z') {
      e.preventDefault();
      this.options.onRedo?.();
      return;
    }

    // ── Ctrl+P / Cmd+P  →  Panel finder ─────────────────────────
    if (mod && !e.shiftKey && !e.altKey && e.key === 'p') {
      e.preventDefault();
      this.options.onPanelFinder?.();
      return;
    }

    // ── Ctrl+W / Cmd+W  →  Close active panel ────────────────────
    if (mod && !e.shiftKey && !e.altKey && e.key === 'w') {
      e.preventDefault();
      const panelId = state.activePaneId;
      if (panelId && state.panels[panelId]?.closable !== false && !state.panels[panelId]?.disabled) {
        this.options.dispatch({ type: 'CLOSE_PANEL', payload: { panelId } });
      }
      return;
    }

    // ── Ctrl+F6 / Cmd+F6  →  Next tab in group ──────────────────
    if (mod && !e.shiftKey && !e.altKey && e.key === 'F6') {
      e.preventDefault();
      const result = adjacentTabInGroup(state.layout, state.activePaneId, 'next');
      if (result) {
        this.options.dispatch({
          type: 'SET_ACTIVE_PANEL',
          payload: { tabGroupId: result.tabGroupId, panelId: result.panelId },
        });
        this.options.dispatch({ type: 'SET_ACTIVE_PANE', payload: { panelId: result.panelId } });
      }
      return;
    }

    // ── Ctrl+Shift+F6  →  Previous tab in group ─────────────────
    if (mod && e.shiftKey && !e.altKey && e.key === 'F6') {
      e.preventDefault();
      const result = adjacentTabInGroup(state.layout, state.activePaneId, 'previous');
      if (result) {
        this.options.dispatch({
          type: 'SET_ACTIVE_PANEL',
          payload: { tabGroupId: result.tabGroupId, panelId: result.panelId },
        });
        this.options.dispatch({ type: 'SET_ACTIVE_PANE', payload: { panelId: result.panelId } });
      }
      return;
    }

    // ── Alt+F6  →  Next pane (across groups) ─────────────────────
    if (!mod && !e.shiftKey && e.altKey && e.key === 'F6') {
      e.preventDefault();
      this.options.dispatch({ type: 'NAVIGATE', payload: { direction: 'next' } });
      return;
    }

    // ── Alt+Shift+F6  →  Previous pane (across groups) ──────────
    if (!mod && e.shiftKey && e.altKey && e.key === 'F6') {
      e.preventDefault();
      this.options.dispatch({ type: 'NAVIGATE', payload: { direction: 'previous' } });
      return;
    }

    // ── Ctrl+Shift+Arrow  →  Dock to edge ────────────────────────
    if (mod && e.shiftKey && !e.altKey) {
      const edgeMap: Record<string, 'left' | 'right' | 'top' | 'bottom'> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'top',
        ArrowDown: 'bottom',
      };
      const edge = edgeMap[e.key];
      if (edge && state.activePaneId && !state.panels[state.activePaneId]?.disabled) {
        e.preventDefault();
        this.options.dispatch({
          type: 'DOCK_TO_EDGE',
          payload: { panelId: state.activePaneId, edge },
        });
        return;
      }
    }

    // ── Escape  →  Restore maximized / close floating ────────────
    if (e.key === 'Escape' && !mod && !e.shiftKey && !e.altKey) {
      if (state.maximizedPanelId) {
        e.preventDefault();
        this.options.dispatch({
          type: 'RESTORE_PANEL',
          payload: { panelId: state.maximizedPanelId },
        });
        return;
      }
      // Close floating panel if the active pane is floating
      const isFloating = state.floatingPanels.some(
        (fp) => fp.panelId === state.activePaneId,
      );
      if (isFloating && state.activePaneId) {
        e.preventDefault();
        // Dock the floating panel back rather than destroying it
        this.options.dispatch({
          type: 'DOCK_FLOATING',
          payload: {
            panelId: state.activePaneId,
            targetTabGroupId: 'default',
            position: 'center',
          },
        });
        return;
      }
    }

    // ── F11  →  Toggle maximize ──────────────────────────────────
    if (e.key === 'F11' && !mod && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (state.maximizedPanelId) {
        this.options.dispatch({
          type: 'RESTORE_PANEL',
          payload: { panelId: state.maximizedPanelId },
        });
      } else if (state.activePaneId && !state.panels[state.activePaneId]?.disabled) {
        this.options.dispatch({
          type: 'MAXIMIZE_PANEL',
          payload: { panelId: state.activePaneId },
        });
      }
      return;
    }

    // ── Ctrl+Tab  →  Show Pane Navigator (next) ──────────────────
    if (e.ctrlKey && !e.altKey && e.key === 'Tab') {
      e.preventDefault();
      if (this.paneNavigatorHandler) {
        this.paneNavigatorHandler(e.shiftKey ? 'previous' : 'next');
      }
      return;
    }

    // ── Alt+F7  →  Show Pane Navigator ───────────────────────────
    if (!mod && e.altKey && !e.shiftKey && e.key === 'F7') {
      e.preventDefault();
      if (this.paneNavigatorHandler) {
        this.paneNavigatorHandler('next');
      }
      return;
    }
  };

  /** Set a handler for Ctrl+Tab pane navigation events. */
  setPaneNavigatorHandler(handler: ((direction: 'next' | 'previous') => void) | null): void {
    this.paneNavigatorHandler = handler;
  }

  private paneNavigatorHandler: ((direction: 'next' | 'previous') => void) | null = null;
}
