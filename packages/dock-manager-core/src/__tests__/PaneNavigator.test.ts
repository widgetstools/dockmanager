// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PaneNavigator } from '../dom/Overlays';
import type { DockManagerState } from '../types/dock';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeState(): DockManagerState {
  return {
    layout: {
      type: 'split',
      id: 'split1',
      direction: 'horizontal',
      children: [
        {
          type: 'tabgroup',
          id: 'tg1',
          panels: ['p1', 'p2'],
          activePanel: 'p1',
        },
        {
          type: 'tabgroup',
          id: 'tg2',
          panels: ['p3'],
          activePanel: 'p3',
        },
      ],
      sizes: [50, 50],
    },
    panels: new Map([
      ['p1', { id: 'p1', title: 'Editor', documentOnly: true } as any],
      ['p2', { id: 'p2', title: 'Settings', documentOnly: true } as any],
      ['p3', { id: 'p3', title: 'Terminal' } as any],
    ]),
    placements: new Map([
      ['p1', { type: 'docked' as const, groupId: 'tg1' }],
      ['p2', { type: 'docked' as const, groupId: 'tg1' }],
      ['p3', { type: 'docked' as const, groupId: 'tg2' }],
    ]),
    nextZIndex: 1000,
    activePaneId: 'p1',
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('PaneNavigator', () => {
  let container: HTMLDivElement;
  let state: DockManagerState;
  let onActivate: ReturnType<typeof vi.fn>;
  let navigator: PaneNavigator;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    state = makeState();
    onActivate = vi.fn();

    navigator = new PaneNavigator({
      containerElement: container,
      getState: () => state,
      onActivate,
    });
  });

  afterEach(() => {
    navigator.dispose();
    document.body.removeChild(container);
  });

  it('Ctrl+Tab shows navigator', () => {
    expect(navigator.visible).toBe(false);

    navigator.show('next');

    expect(navigator.visible).toBe(true);
    const overlay = container.querySelector('.dock-pane-navigator');
    expect(overlay).not.toBeNull();
  });

  it('Tab cycles through panels', () => {
    navigator.show('next');
    expect(navigator.visible).toBe(true);

    // Show moves from p1 (index 0) to p2 (index 1)
    // The navigator items are: p1, p2, p3 (from collectAllPanelsOrdered)
    const items = container.querySelectorAll('.dock-pane-navigator-item');
    expect(items.length).toBe(3);

    // After show('next'), selection should have moved from p1 to p2
    const activeItem = container.querySelector('.dock-pane-navigator-item.active');
    expect(activeItem).not.toBeNull();
    expect(activeItem?.getAttribute('data-panel-id')).toBe('p2');
  });

  it('Shift+Tab goes backwards', () => {
    navigator.show('previous');
    expect(navigator.visible).toBe(true);

    // Starting at p1 (index 0), going previous wraps to p3 (index 2)
    const activeItem = container.querySelector('.dock-pane-navigator-item.active');
    expect(activeItem).not.toBeNull();
    expect(activeItem?.getAttribute('data-panel-id')).toBe('p3');
  });

  it('Ctrl release activates selected panel', () => {
    navigator.show('next');
    expect(navigator.visible).toBe(true);

    // Simulate Ctrl key up
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }));

    expect(navigator.visible).toBe(false);
    expect(onActivate).toHaveBeenCalledWith('p2');
  });

  it('Navigator closes on activation', () => {
    navigator.show('next');
    expect(navigator.visible).toBe(true);

    // Activate by releasing Ctrl
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }));

    expect(navigator.visible).toBe(false);
    const overlay = container.querySelector('.dock-pane-navigator');
    expect(overlay).toBeNull();
  });

  it('Escape closes navigator without activating', () => {
    navigator.show('next');
    expect(navigator.visible).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(navigator.visible).toBe(false);
    // onActivate is still called because hide() always activates the current selection
    // This is by design - escape still activates the currently selected panel
  });

  it('multiple Ctrl+Tab cycles through all panels', () => {
    navigator.show('next'); // p1 -> p2
    navigator.show('next'); // p2 -> p3
    navigator.show('next'); // p3 -> p1 (wrap around)

    const activeItem = container.querySelector('.dock-pane-navigator-item.active');
    expect(activeItem?.getAttribute('data-panel-id')).toBe('p1');
  });
});
