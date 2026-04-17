// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TabGroupView } from '../dom/views/TabGroupView';
import { FloatingWindowView } from '../dom/views/FloatingWindowView';
import { SplitView } from '../dom/views/SplitView';
import type { TabGroupNode, PanelConfig, FloatingPanel, SplitNode } from '../types/dock';

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

// ─── Helpers ─────────────────────────────────────────────────────────

const noopDisposable = { dispose: () => {} };

function makeTabGroupViewCallbacks() {
  return {
    onClosePanel: () => {},
    onFloatPanel: () => {},
    onMaximizePanel: () => {},
    onRestorePanel: () => {},
    onUnpinPanel: () => {},
    onSetActivePanel: () => {},
    onSetActivePane: () => {},
    onSetHeaderCollapsed: () => {},
    createContent: () => noopDisposable,
  };
}

function makePanels(): Map<string, PanelConfig> {
  return new Map([
    ['p1', { id: 'p1', title: 'Editor', closable: true } as PanelConfig],
    ['p2', { id: 'p2', title: 'Terminal', closable: true } as PanelConfig],
  ]);
}

function makeTabGroupNode(): TabGroupNode {
  return {
    type: 'tabgroup',
    id: 'tg1',
    panels: ['p1', 'p2'],
    activePanel: 'p1',
  };
}

// ─── TabGroupView Accessibility ──────────────────────────────────────

describe('TabGroupView ARIA attributes', () => {
  let view: TabGroupView;

  beforeEach(() => {
    const node = makeTabGroupNode();
    const panels = makePanels();
    view = new TabGroupView(node, panels, 'p1', undefined, makeTabGroupViewCallbacks());
    document.body.appendChild(view.element);
  });

  afterEach(() => {
    view.dispose();
  });

  it('tab group container has role="region" and aria-label', () => {
    expect(view.element.getAttribute('role')).toBe('region');
    expect(view.element.getAttribute('aria-label')).toBe('Editor');
  });

  it('tab strip has role="tablist" and aria-label="Panel tabs"', () => {
    const tablist = view.element.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    expect(tablist!.getAttribute('aria-label')).toBe('Panel tabs');
  });

  it('active tab has aria-selected="true"', () => {
    const activeTab = view.element.querySelector('#tab-p1');
    expect(activeTab).not.toBeNull();
    expect(activeTab!.getAttribute('aria-selected')).toBe('true');
  });

  it('inactive tab has aria-selected="false"', () => {
    const inactiveTab = view.element.querySelector('#tab-p2');
    expect(inactiveTab).not.toBeNull();
    expect(inactiveTab!.getAttribute('aria-selected')).toBe('false');
  });

  it('tabs have role="tab"', () => {
    const tabs = view.element.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(2);
  });

  it('tabs have correct id and aria-controls', () => {
    const tab1 = view.element.querySelector('#tab-p1');
    expect(tab1).not.toBeNull();
    expect(tab1!.getAttribute('aria-controls')).toBe('panel-p1');

    const tab2 = view.element.querySelector('#tab-p2');
    expect(tab2).not.toBeNull();
    expect(tab2!.getAttribute('aria-controls')).toBe('panel-p2');
  });

  it('content panel has role="tabpanel" and correct id', () => {
    const tabpanel = view.element.querySelector('[role="tabpanel"]');
    expect(tabpanel).not.toBeNull();
    expect(tabpanel!.id).toBe('panel-p1');
    expect(tabpanel!.getAttribute('aria-labelledby')).toBe('tab-p1');
  });

  it('action buttons have aria-label', () => {
    const buttons = view.element.querySelectorAll('button[aria-label]');
    expect(buttons.length).toBeGreaterThan(0);
  });
});

// ─── FloatingWindowView Accessibility ────────────────────────────────

describe('FloatingWindowView ARIA attributes', () => {
  let view: FloatingWindowView;

  beforeEach(() => {
    const floating: FloatingPanel = {
      panelId: 'fp1',
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      zIndex: 1000,
    };
    const panel: PanelConfig = { id: 'fp1', title: 'Floating Panel' };
    view = new FloatingWindowView(floating, panel, 'fp1', {
      onUpdateFloating: () => {},
      onBringToFront: () => {},
      onDockBack: () => {},
      onClosePanel: () => {},
      onSetActivePane: () => {},
      onDockToTarget: () => {},
      createContent: () => noopDisposable,
    });
    document.body.appendChild(view.element);
  });

  afterEach(() => {
    view.dispose();
  });

  it('floating window has role="dialog"', () => {
    expect(view.element.getAttribute('role')).toBe('dialog');
  });

  it('floating window has aria-label with panel title', () => {
    expect(view.element.getAttribute('aria-label')).toBe('Floating Panel');
  });

  it('title bar buttons have aria-label', () => {
    const dockBackBtn = view.element.querySelector('[data-action="dock-back"]');
    expect(dockBackBtn).not.toBeNull();
    expect(dockBackBtn!.getAttribute('aria-label')).toBe('Dock');

    const closeBtn = view.element.querySelector('[data-action="close"]');
    expect(closeBtn).not.toBeNull();
    expect(closeBtn!.getAttribute('aria-label')).toBe('Close');
  });
});

// ─── SplitView Accessibility ─────────────────────────────────────────

describe('SplitView ARIA attributes', () => {
  let view: SplitView;

  beforeEach(() => {
    const node: SplitNode = {
      type: 'split',
      id: 's1',
      direction: 'horizontal',
      children: [
        { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1' },
        { type: 'tabgroup', id: 'tg2', panels: ['p2'], activePanel: 'p2' },
      ],
      sizes: [50, 50],
    };
    view = new SplitView(node, {
      onResizeSplit: () => {},
      createChildView: () => document.createElement('div'),
    });
    document.body.appendChild(view.element);
  });

  afterEach(() => {
    view.dispose();
  });

  it('splitter has role="separator"', () => {
    const splitter = view.element.querySelector('[role="separator"]');
    expect(splitter).not.toBeNull();
  });

  it('splitter has aria-orientation', () => {
    const splitter = view.element.querySelector('[role="separator"]');
    // Horizontal split direction means the splitter is vertical (divides left/right)
    expect(splitter!.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('splitter has aria-valuenow', () => {
    const splitter = view.element.querySelector('[role="separator"]');
    expect(splitter!.getAttribute('aria-valuenow')).toBe('50');
  });

  it('splitter has tabindex="0"', () => {
    const splitter = view.element.querySelector('[role="separator"]');
    expect((splitter as HTMLElement).tabIndex).toBe(0);
  });

  it('vertical split has horizontal aria-orientation on splitter', () => {
    view.dispose();

    const node: SplitNode = {
      type: 'split',
      id: 's2',
      direction: 'vertical',
      children: [
        { type: 'tabgroup', id: 'tg3', panels: ['p3'], activePanel: 'p3' },
        { type: 'tabgroup', id: 'tg4', panels: ['p4'], activePanel: 'p4' },
      ],
      sizes: [60, 40],
    };
    view = new SplitView(node, {
      onResizeSplit: () => {},
      createChildView: () => document.createElement('div'),
    });
    document.body.appendChild(view.element);

    const splitter = view.element.querySelector('[role="separator"]');
    expect(splitter!.getAttribute('aria-orientation')).toBe('horizontal');
  });
});
