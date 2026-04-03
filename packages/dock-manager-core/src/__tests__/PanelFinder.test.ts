// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PanelFinder } from '../dom/PanelFinder';
import type { DockManagerState } from '../types/dock';

// ─── Helpers ─────────────────────────────────────────────────────────

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function makeMockState(): DockManagerState {
  return {
    layout: {
      type: 'tabgroup',
      id: 'tg1',
      panels: ['p1', 'p2', 'p3'],
      activePanel: 'p1',
    },
    panels: {
      p1: { id: 'p1', title: 'Explorer' },
      p2: { id: 'p2', title: 'Terminal' },
      p3: { id: 'p3', title: 'Output' },
    },
    floatingPanels: [{ panelId: 'p2', x: 0, y: 0, width: 100, height: 100 }],
    popoutPanels: [],
    unpinnedPanels: [{ panelId: 'p3', side: 'left' }],
    nextZIndex: 1000,
    activePaneId: 'p1',
  } as DockManagerState;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('PanelFinder', () => {
  let container: HTMLElement;
  let getState: ReturnType<typeof vi.fn>;
  let onActivatePanel: ReturnType<typeof vi.fn>;
  let pf: PanelFinder;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = createContainer();
    getState = vi.fn(() => makeMockState());
    onActivatePanel = vi.fn();
    pf = new PanelFinder({
      containerElement: container,
      getState,
      onActivatePanel,
    });
  });

  // ─── Constructor ─────────────────────────────────────────────────

  it('constructor creates instance without opening', () => {
    expect(container.querySelector('.dock-panel-finder-overlay')).toBeNull();
  });

  // ─── open() ──────────────────────────────────────────────────────

  it('open() creates overlay DOM in container', () => {
    pf.open();
    expect(container.querySelector('.dock-panel-finder-overlay')).not.toBeNull();
  });

  it('open() lists all panels from state', () => {
    pf.open();
    const items = container.querySelectorAll('.dock-panel-finder-item');
    expect(items.length).toBe(3);

    const titles = Array.from(items).map((el) => el.getAttribute('data-panel-id'));
    expect(titles).toContain('p1');
    expect(titles).toContain('p2');
    expect(titles).toContain('p3');
  });

  it('open() when already open is a no-op', () => {
    pf.open();
    pf.open();
    const overlays = container.querySelectorAll('.dock-panel-finder-overlay');
    expect(overlays.length).toBe(1);
  });

  // ─── close() ─────────────────────────────────────────────────────

  it('close() removes overlay', () => {
    pf.open();
    pf.close();
    expect(container.querySelector('.dock-panel-finder-overlay')).toBeNull();
  });

  it('close() when not open is a no-op', () => {
    // Should not throw
    pf.close();
    expect(container.querySelector('.dock-panel-finder-overlay')).toBeNull();
  });

  // ─── toggle() ────────────────────────────────────────────────────

  it('toggle() opens when closed, closes when open', () => {
    pf.toggle();
    expect(container.querySelector('.dock-panel-finder-overlay')).not.toBeNull();

    pf.toggle();
    expect(container.querySelector('.dock-panel-finder-overlay')).toBeNull();
  });

  // ─── Item click ──────────────────────────────────────────────────

  it('clicking a panel item calls onActivatePanel with correct ID', () => {
    pf.open();
    const item = container.querySelector('[data-panel-id="p1"]') as HTMLElement;
    item.click();

    expect(onActivatePanel).toHaveBeenCalledWith('p1');
    // Should also close
    expect(container.querySelector('.dock-panel-finder-overlay')).toBeNull();
  });

  // ─── Escape key ──────────────────────────────────────────────────

  it('Escape key closes the finder', () => {
    pf.open();
    const overlay = container.querySelector('.dock-panel-finder-overlay') as HTMLElement;
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    overlay.dispatchEvent(event);

    expect(container.querySelector('.dock-panel-finder-overlay')).toBeNull();
  });

  // ─── Overlay background click ────────────────────────────────────

  it('click on overlay background closes', () => {
    pf.open();
    const overlay = container.querySelector('.dock-panel-finder-overlay') as HTMLElement;
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    // Ensure event.target is the overlay itself (background)
    overlay.dispatchEvent(event);

    expect(container.querySelector('.dock-panel-finder-overlay')).toBeNull();
  });

  // ─── Filter input ────────────────────────────────────────────────

  it('filter input narrows panel list', () => {
    pf.open();
    const input = container.querySelector('input') as HTMLInputElement;

    // Type 'term' to match 'Terminal'
    input.value = 'term';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const items = container.querySelectorAll('.dock-panel-finder-item');
    expect(items.length).toBe(1);
    expect(items[0].getAttribute('data-panel-id')).toBe('p2');
  });

  // ─── Badges ──────────────────────────────────────────────────────

  it('floating panels show "(floating)" badge', () => {
    pf.open();
    const item = container.querySelector('[data-panel-id="p2"]') as HTMLElement;
    const badge = item.querySelector('span');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('(floating)');
  });

  it('unpinned panels show "(unpinned)" badge', () => {
    pf.open();
    const item = container.querySelector('[data-panel-id="p3"]') as HTMLElement;
    const badge = item.querySelector('span');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('(unpinned)');
  });

  // ─── dispose() ───────────────────────────────────────────────────

  it('dispose() closes if open', () => {
    pf.open();
    pf.dispose();
    expect(container.querySelector('.dock-panel-finder-overlay')).toBeNull();
  });
});
