// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KeyboardManager } from '../dom/KeyboardManager';
import type { DockManagerState } from '../types/dock';
import type { DockAction } from '../reducer/dockReducer';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeState(overrides?: Partial<DockManagerState>): DockManagerState {
  return {
    layout: {
      type: 'tabgroup',
      id: 'tg1',
      panels: ['p1', 'p2', 'p3'],
      activePanel: 'p1',
    },
    panels: new Map([
      ['p1', { id: 'p1', title: 'Panel 1', closable: true } as any],
      ['p2', { id: 'p2', title: 'Panel 2', closable: true } as any],
      ['p3', { id: 'p3', title: 'Panel 3', closable: false } as any],
    ]),
    placements: new Map([
      ['p1', { type: 'docked' as const, groupId: 'tg1' }],
      ['p2', { type: 'docked' as const, groupId: 'tg1' }],
      ['p3', { type: 'docked' as const, groupId: 'tg1' }],
    ]),
    nextZIndex: 1000,
    activePaneId: 'p1',
    ...overrides,
  };
}

function makeSplitState(): DockManagerState {
  return {
    layout: {
      type: 'split',
      id: 'split1',
      direction: 'horizontal',
      children: [
        { type: 'tabgroup', id: 'tg1', panels: ['p1', 'p2'], activePanel: 'p1' },
        { type: 'tabgroup', id: 'tg2', panels: ['p3', 'p4'], activePanel: 'p3' },
      ],
      sizes: [50, 50],
    },
    panels: new Map([
      ['p1', { id: 'p1', title: 'Panel 1', closable: true } as any],
      ['p2', { id: 'p2', title: 'Panel 2', closable: true } as any],
      ['p3', { id: 'p3', title: 'Panel 3', closable: true } as any],
      ['p4', { id: 'p4', title: 'Panel 4', closable: true } as any],
    ]),
    placements: new Map([
      ['p1', { type: 'docked' as const, groupId: 'tg1' }],
      ['p2', { type: 'docked' as const, groupId: 'tg1' }],
      ['p3', { type: 'docked' as const, groupId: 'tg2' }],
      ['p4', { type: 'docked' as const, groupId: 'tg2' }],
    ]),
    nextZIndex: 1000,
    activePaneId: 'p1',
  };
}

function fireKey(
  el: HTMLElement,
  key: string,
  opts: Partial<KeyboardEventInit> = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  el.dispatchEvent(event);
  return event;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('KeyboardManager', () => {
  let container: HTMLElement;
  let dispatch: ReturnType<typeof vi.fn>;
  let state: DockManagerState;
  let km: KeyboardManager;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatch = vi.fn();
    state = makeState();
    km = new KeyboardManager({
      containerElement: container,
      dispatch,
      getState: () => state,
    });
  });

  afterEach(() => {
    km.dispose();
    container.remove();
  });

  // ── Ctrl+W / Cmd+W  →  Close active panel ────────────────────

  it('Ctrl+W dispatches CLOSE_PANEL for active panel', () => {
    const e = fireKey(container, 'w', { ctrlKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'CLOSE_PANEL',
      panelId: 'p1',
    });
  });

  it('Ctrl+W does not close a non-closable panel', () => {
    state = makeState({ activePaneId: 'p3' });
    fireKey(container, 'w', { ctrlKey: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('Ctrl+W does nothing when no active pane', () => {
    state = makeState({ activePaneId: '' });
    fireKey(container, 'w', { ctrlKey: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  // ── Ctrl+F6  →  Next tab in group ─────────────────────────────

  it('Ctrl+F6 activates next tab in same group', () => {
    const e = fireKey(container, 'F6', { ctrlKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_ACTIVE_PANEL',
      groupId: 'tg1', panelId: 'p2',
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_ACTIVE_PANE',
      panelId: 'p2',
    });
  });

  it('Ctrl+F6 wraps around to first tab', () => {
    state = makeState({ activePaneId: 'p3' });
    fireKey(container, 'F6', { ctrlKey: true });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_ACTIVE_PANEL',
      groupId: 'tg1', panelId: 'p1',
    });
  });

  // ── Ctrl+Shift+F6  →  Previous tab in group ──────────────────

  it('Ctrl+Shift+F6 activates previous tab in same group', () => {
    state = makeState({ activePaneId: 'p2' });
    const e = fireKey(container, 'F6', { ctrlKey: true, shiftKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_ACTIVE_PANEL',
      groupId: 'tg1', panelId: 'p1',
    });
  });

  it('Ctrl+Shift+F6 wraps around to last tab', () => {
    fireKey(container, 'F6', { ctrlKey: true, shiftKey: true });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_ACTIVE_PANEL',
      groupId: 'tg1', panelId: 'p3',
    });
  });

  // ── Alt+F6  →  Navigate next pane (across groups) ─────────────

  it('Alt+F6 dispatches NAVIGATE next', () => {
    const e = fireKey(container, 'F6', { altKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'NAVIGATE',
      direction: 'next',
    });
  });

  // ── Alt+Shift+F6  →  Navigate previous pane ───────────────────

  it('Alt+Shift+F6 dispatches NAVIGATE previous', () => {
    const e = fireKey(container, 'F6', { altKey: true, shiftKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'NAVIGATE',
      direction: 'previous',
    });
  });

  // ── Ctrl+Shift+Arrow  →  Dock to edge ─────────────────────────

  it('Ctrl+Shift+ArrowLeft docks to left edge', () => {
    const e = fireKey(container, 'ArrowLeft', { ctrlKey: true, shiftKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'DOCK_TO_EDGE',
      panelId: 'p1', edge: 'left',
    });
  });

  it('Ctrl+Shift+ArrowRight docks to right edge', () => {
    const e = fireKey(container, 'ArrowRight', { ctrlKey: true, shiftKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'DOCK_TO_EDGE',
      panelId: 'p1', edge: 'right',
    });
  });

  it('Ctrl+Shift+ArrowUp docks to top edge', () => {
    const e = fireKey(container, 'ArrowUp', { ctrlKey: true, shiftKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'DOCK_TO_EDGE',
      panelId: 'p1', edge: 'top',
    });
  });

  it('Ctrl+Shift+ArrowDown docks to bottom edge', () => {
    const e = fireKey(container, 'ArrowDown', { ctrlKey: true, shiftKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'DOCK_TO_EDGE',
      panelId: 'p1', edge: 'bottom',
    });
  });

  it('Ctrl+Shift+Arrow does nothing without active pane', () => {
    state = makeState({ activePaneId: '' });
    const e = fireKey(container, 'ArrowLeft', { ctrlKey: true, shiftKey: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  // ── Escape  →  Restore maximized / close floating ──────────────

  it('Escape restores a maximized panel', () => {
    state = makeState({ maximizedPanelId: 'p1' });
    const e = fireKey(container, 'Escape');
    expect(e.defaultPrevented).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'RESTORE_PANEL',
      panelId: 'p1',
    });
  });

  it('Escape docks a floating panel back', () => {
    state = makeState({
      placements: new Map([
        ['p1', { type: 'floating' as const, x: 0, y: 0, width: 300, height: 200, zIndex: 1000 }],
        ['p2', { type: 'docked' as const, groupId: 'tg1' }],
        ['p3', { type: 'docked' as const, groupId: 'tg1' }],
      ]),
    });
    const e = fireKey(container, 'Escape');
    expect(e.defaultPrevented).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'DOCK_FLOATING',
      panelId: 'p1', targetGroupId: 'default', position: 'center',
    });
  });

  it('Escape does nothing when nothing is maximized or floating', () => {
    const e = fireKey(container, 'Escape');
    expect(dispatch).not.toHaveBeenCalled();
  });

  // ── F11  →  Toggle maximize ────────────────────────────────────

  it('F11 maximizes the active panel when not maximized', () => {
    const e = fireKey(container, 'F11');
    expect(e.defaultPrevented).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'MAXIMIZE_PANEL',
      panelId: 'p1',
    });
  });

  it('F11 restores when already maximized', () => {
    state = makeState({ maximizedPanelId: 'p2' });
    fireKey(container, 'F11');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'RESTORE_PANEL',
      panelId: 'p2',
    });
  });

  it('F11 does nothing without active pane and not maximized', () => {
    state = makeState({ activePaneId: '' });
    fireKey(container, 'F11');
    expect(dispatch).not.toHaveBeenCalled();
  });

  // ── preventDefault is called ───────────────────────────────────

  it('all shortcut events are prevented from propagating defaults', () => {
    const shortcuts: Array<[string, Partial<KeyboardEventInit>]> = [
      ['w', { ctrlKey: true }],
      ['F6', { ctrlKey: true }],
      ['F6', { ctrlKey: true, shiftKey: true }],
      ['F6', { altKey: true }],
      ['F6', { altKey: true, shiftKey: true }],
      ['ArrowLeft', { ctrlKey: true, shiftKey: true }],
      ['F11', {}],
    ];
    for (const [key, opts] of shortcuts) {
      dispatch.mockClear();
      const e = fireKey(container, key, opts);
      expect(e.defaultPrevented).toBe(true);
    }
  });

  // ── dispose removes listeners ──────────────────────────────────

  it('dispose() stops shortcuts from firing', () => {
    km.dispose();
    fireKey(container, 'w', { ctrlKey: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  // ── Shortcuts do not fire on input/textarea ────────────────────

  it('shortcuts are suppressed when target is an input element', () => {
    const input = document.createElement('input');
    container.appendChild(input);
    fireKey(input, 'w', { ctrlKey: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('shortcuts are suppressed when target is a textarea element', () => {
    const textarea = document.createElement('textarea');
    container.appendChild(textarea);
    fireKey(textarea, 'w', { ctrlKey: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('shortcuts are suppressed when target is contenteditable', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    container.appendChild(div);
    fireKey(div, 'w', { ctrlKey: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  // ── Cross-group navigation with split layout ───────────────────

  it('Alt+F6 navigates across groups in a split layout', () => {
    state = makeSplitState();
    fireKey(container, 'F6', { altKey: true });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'NAVIGATE',
      direction: 'next',
    });
  });

  // ── Ctrl+F6 with single-panel group does not dispatch ──────────

  it('Ctrl+F6 does nothing when group has only one panel', () => {
    state = makeState({
      layout: { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1' },
    });
    fireKey(container, 'F6', { ctrlKey: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  // ── Escape prioritizes maximize over floating ──────────────────

  it('Escape restores maximize even if there is also a floating panel', () => {
    state = makeState({
      maximizedPanelId: 'p1',
      placements: new Map([
        ['p1', { type: 'docked' as const, groupId: 'tg1' }],
        ['p2', { type: 'floating' as const, x: 0, y: 0, width: 300, height: 200, zIndex: 1000 }],
        ['p3', { type: 'docked' as const, groupId: 'tg1' }],
      ]),
    });
    fireKey(container, 'Escape');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'RESTORE_PANEL',
      panelId: 'p1',
    });
    // Should not also dispatch DOCK_FLOATING
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
