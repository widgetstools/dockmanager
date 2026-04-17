// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextMenuManager } from '../dom/ContextMenuManager';
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

function fireContextMenu(el: HTMLElement, clientX = 100, clientY = 100): MouseEvent {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  el.dispatchEvent(event);
  return event;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ContextMenuManager', () => {
  let container: HTMLDivElement;
  let dispatch: ReturnType<typeof vi.fn>;
  let state: DockManagerState;
  let manager: ContextMenuManager;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    // Build a simple tab group inside the container
    const tabStrip = document.createElement('div');
    tabStrip.setAttribute('role', 'tablist');

    for (const id of ['p1', 'p2', 'p3']) {
      const tab = document.createElement('div');
      tab.setAttribute('data-tab-id', id);
      tab.textContent = `Tab ${id}`;
      tabStrip.appendChild(tab);
    }
    container.appendChild(tabStrip);

    dispatch = vi.fn();
    state = makeState();

    manager = new ContextMenuManager({
      containerElement: container,
      dispatch,
      getState: () => state,
    });
  });

  afterEach(() => {
    manager.dispose();
    document.body.removeChild(container);
    // Clean up any leftover menus
    document.querySelectorAll('.dock-context-menu').forEach((el) => el.remove());
  });

  it('shows a context menu when right-clicking a tab', () => {
    const tab = container.querySelector('[data-tab-id="p1"]')!;
    fireContextMenu(tab as HTMLElement);

    const menu = document.querySelector('.dock-context-menu');
    expect(menu).not.toBeNull();
    expect(menu!.querySelectorAll('.dock-context-menu-item').length).toBeGreaterThan(0);
  });

  it('menu items dispatch correct actions - Close', () => {
    const tab = container.querySelector('[data-tab-id="p1"]')!;
    fireContextMenu(tab as HTMLElement);

    const items = document.querySelectorAll('.dock-context-menu-item');
    const closeItem = Array.from(items).find((el) => el.textContent === 'Close');
    expect(closeItem).toBeDefined();

    closeItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'CLOSE_PANEL',
      panelId: 'p1',
    });
  });

  it('disabled items do not dispatch actions', () => {
    // p3 has closable: false
    const tab = container.querySelector('[data-tab-id="p3"]')!;
    fireContextMenu(tab as HTMLElement);

    const items = document.querySelectorAll('.dock-context-menu-item');
    const closeItem = Array.from(items).find((el) => el.textContent === 'Close');
    expect(closeItem).toBeDefined();
    expect(closeItem!.classList.contains('disabled')).toBe(true);

    closeItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('menu closes on click outside', async () => {
    const tab = container.querySelector('[data-tab-id="p1"]')!;
    fireContextMenu(tab as HTMLElement);

    expect(document.querySelector('.dock-context-menu')).not.toBeNull();

    // Wait for the setTimeout(0) that registers the outside click handler
    await new Promise((r) => setTimeout(r, 10));

    // Click outside
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(document.querySelector('.dock-context-menu')).toBeNull();
  });

  it('menu closes on Escape', () => {
    const tab = container.querySelector('[data-tab-id="p1"]')!;
    fireContextMenu(tab as HTMLElement);

    expect(document.querySelector('.dock-context-menu')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.querySelector('.dock-context-menu')).toBeNull();
  });

  it('menu closes on item click', () => {
    const tab = container.querySelector('[data-tab-id="p1"]')!;
    fireContextMenu(tab as HTMLElement);

    const items = document.querySelectorAll('.dock-context-menu-item');
    const closeItem = Array.from(items).find((el) => el.textContent === 'Close');
    closeItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.querySelector('.dock-context-menu')).toBeNull();
  });

  it('"Close Others" closes all but the clicked panel', () => {
    const tab = container.querySelector('[data-tab-id="p1"]')!;
    fireContextMenu(tab as HTMLElement);

    const items = document.querySelectorAll('.dock-context-menu-item');
    const closeOthers = Array.from(items).find((el) => el.textContent === 'Close Others');
    expect(closeOthers).toBeDefined();

    closeOthers!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Should close p2 (closable) but not p3 (closable: false) and not p1 (the clicked panel)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'CLOSE_PANEL',
      panelId: 'p2',
    });
    // p3 is not closable, so only one CLOSE_PANEL call
    const closeCalls = dispatch.mock.calls.filter(
      (c: any[]) => c[0].type === 'CLOSE_PANEL',
    );
    expect(closeCalls.length).toBe(1);
  });

  it('"Close All" closes all panels in the group', () => {
    const tab = container.querySelector('[data-tab-id="p1"]')!;
    fireContextMenu(tab as HTMLElement);

    const items = document.querySelectorAll('.dock-context-menu-item');
    const closeAll = Array.from(items).find((el) => el.textContent === 'Close All');
    expect(closeAll).toBeDefined();

    closeAll!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Should close p1 and p2 (closable), but not p3 (closable: false)
    const closeCalls = dispatch.mock.calls.filter(
      (c: any[]) => c[0].type === 'CLOSE_PANEL',
    );
    expect(closeCalls.length).toBe(2);
  });

  it('does not show menu for non-tab elements', () => {
    // Right-click on the container itself (no data-tab-id)
    fireContextMenu(container);

    expect(document.querySelector('.dock-context-menu')).toBeNull();
  });

  it('dispose() removes listener', () => {
    manager.dispose();

    const tab = container.querySelector('[data-tab-id="p1"]')!;
    fireContextMenu(tab as HTMLElement);

    expect(document.querySelector('.dock-context-menu')).toBeNull();
  });

  it('Float menu item dispatches FLOAT_PANEL', () => {
    const tab = container.querySelector('[data-tab-id="p1"]')!;
    fireContextMenu(tab as HTMLElement);

    const items = document.querySelectorAll('.dock-context-menu-item');
    const floatItem = Array.from(items).find((el) => el.textContent === 'Float');
    expect(floatItem).toBeDefined();
    expect(floatItem!.classList.contains('disabled')).toBe(false);

    floatItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FLOAT_PANEL' }),
    );
  });

  it('Maximize menu item dispatches MAXIMIZE_PANEL', () => {
    const tab = container.querySelector('[data-tab-id="p1"]')!;
    fireContextMenu(tab as HTMLElement);

    const items = document.querySelectorAll('.dock-context-menu-item');
    const maxItem = Array.from(items).find((el) => el.textContent === 'Maximize');
    expect(maxItem).toBeDefined();

    maxItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'MAXIMIZE_PANEL',
      panelId: 'p1',
    });
  });
});
