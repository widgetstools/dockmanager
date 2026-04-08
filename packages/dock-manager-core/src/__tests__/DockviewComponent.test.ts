// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DockviewComponent } from '../dom/DockviewComponent';
import type { DockManagerState } from '../types/dock';
import { resetIdCounter } from '../layout/LayoutTree';

// ─── Polyfills for jsdom ────────────────────────────────────────────
// jsdom doesn't provide ResizeObserver, so we stub it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(_cb: ResizeObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function createTestContainer(): HTMLElement {
  const el = document.createElement('div');
  el.style.width = '1000px';
  el.style.height = '600px';
  document.body.appendChild(el);
  return el;
}

function createSimpleState(): DockManagerState {
  return {
    layout: {
      type: 'tabgroup',
      id: 'tg1',
      panels: ['panel1', 'panel2'],
      activePanel: 'panel1',
    },
    panels: {
      panel1: { id: 'panel1', title: 'Panel 1' },
      panel2: { id: 'panel2', title: 'Panel 2' },
    },
    floatingPanels: [],
    popoutPanels: [],
    unpinnedPanels: [],
    nextZIndex: 1000,
    activePaneId: 'panel1',
  };
}

function createSinglePanelState(): DockManagerState {
  return {
    layout: {
      type: 'tabgroup',
      id: 'tg1',
      panels: ['panel1'],
      activePanel: 'panel1',
    },
    panels: {
      panel1: { id: 'panel1', title: 'Panel 1' },
    },
    floatingPanels: [],
    popoutPanels: [],
    unpinnedPanels: [],
    nextZIndex: 1000,
    activePaneId: 'panel1',
  };
}

function createSplitState(): DockManagerState {
  return {
    layout: {
      type: 'split',
      id: 'split1',
      direction: 'horizontal',
      children: [
        {
          type: 'tabgroup',
          id: 'tg_left',
          panels: ['panelA'],
          activePanel: 'panelA',
        },
        {
          type: 'tabgroup',
          id: 'tg_right',
          panels: ['panelB', 'panelC'],
          activePanel: 'panelB',
        },
      ],
      sizes: [50, 50],
    },
    panels: {
      panelA: { id: 'panelA', title: 'Panel A' },
      panelB: { id: 'panelB', title: 'Panel B' },
      panelC: { id: 'panelC', title: 'Panel C' },
    },
    floatingPanels: [],
    popoutPanels: [],
    unpinnedPanels: [],
    nextZIndex: 1000,
    activePaneId: 'panelA',
  };
}

function createContentFactory() {
  const disposals: string[] = [];
  const factory = (panelId: string, container: HTMLElement) => {
    const el = document.createElement('div');
    el.className = 'test-content';
    el.setAttribute('data-content-panel', panelId);
    el.textContent = `Content for ${panelId}`;
    container.appendChild(el);
    return {
      dispose: () => {
        disposals.push(panelId);
        el.remove();
      },
    };
  };
  return { factory, disposals };
}

// ─── Test suite ─────────────────────────────────────────────────────

describe('DockviewComponent', () => {
  let container: HTMLElement;
  let component: DockviewComponent;

  beforeEach(() => {
    resetIdCounter();
    container = createTestContainer();
  });

  afterEach(() => {
    if (component) {
      component.dispose();
    }
    container.remove();
    document.body.innerHTML = '';
  });

  // ══════════════════════════════════════════════════════════════════
  // 1. Initialization
  // ══════════════════════════════════════════════════════════════════

  describe('Initialization', () => {
    it('creates root element with .dock-manager-root class', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      const root = container.querySelector('.dock-manager-root');
      expect(root).not.toBeNull();
      expect(root).toBeInstanceOf(HTMLDivElement);
    });

    it('appends root element to the provided container', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      expect(container.children.length).toBe(1);
      expect(container.firstElementChild?.classList.contains('dock-manager-root')).toBe(true);
    });

    it('renders a tab group from initial state', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      const tabGroup = container.querySelector('.dock-tab-group');
      expect(tabGroup).not.toBeNull();
    });

    it('renders tab elements for panels with multiple tabs', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      const tabs = container.querySelectorAll('[data-tab-id]');
      // At least 2 tab elements (for panel1 and panel2)
      const tabIds = Array.from(tabs).map((t) => t.getAttribute('data-tab-id'));
      expect(tabIds).toContain('panel1');
      expect(tabIds).toContain('panel2');
    });

    it('renders panel headers with correct titles', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      const labels = container.querySelectorAll('.dock-tab-label');
      const labelTexts = Array.from(labels).map((l) => l.textContent);
      expect(labelTexts).toContain('Panel 1');
      expect(labelTexts).toContain('Panel 2');
    });

    it('renders a tab even when only one panel', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSinglePanelState(),
        createContent: factory,
      });

      const tabs = container.querySelectorAll('.dock-tab');
      expect(tabs.length).toBe(1);
      const label = tabs[0].querySelector('.dock-tab-label');
      expect(label?.textContent).toBe('Panel 1');
    });

    it('renders content slot for the active panel', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      const content = container.querySelector('[data-content-panel="panel1"]');
      expect(content).not.toBeNull();
      expect(content?.textContent).toBe('Content for panel1');
    });

    it('does not render content for inactive panel initially', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      const content = container.querySelector('[data-content-panel="panel2"]');
      expect(content).toBeNull();
    });

    it('applies dark theme class when theme is dark', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
        theme: 'dark',
      });

      const root = container.querySelector('.dock-manager-root');
      expect(root?.classList.contains('dark')).toBe(true);
    });

    it('does not apply dark class for default (light) theme', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      const root = container.querySelector('.dock-manager-root');
      expect(root?.classList.contains('dark')).toBe(false);
    });

    it('renders split layout with multiple tab groups', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSplitState(),
        createContent: factory,
      });

      const tabGroups = container.querySelectorAll('.dock-tab-group');
      expect(tabGroups.length).toBe(2);
    });

    it('sets data-dock-target attribute on tab group elements', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      const tabGroup = container.querySelector('[data-dock-target="tg1"]');
      expect(tabGroup).not.toBeNull();
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 2. Tab selection
  // ══════════════════════════════════════════════════════════════════

  describe('Tab selection', () => {
    it('marks the active tab with dock-tab-selected class', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      const selectedTab = container.querySelector('[data-tab-id="panel1"].dock-tab-selected');
      expect(selectedTab).not.toBeNull();
    });

    it('dispatching SET_ACTIVE_PANEL updates the selected tab', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({
        type: 'SET_ACTIVE_PANEL',
        payload: { tabGroupId: 'tg1', panelId: 'panel2' },
      });

      const selectedTab = container.querySelector('.dock-tab-selected');
      expect(selectedTab?.getAttribute('data-tab-id')).toBe('panel2');
    });

    it('updates state when SET_ACTIVE_PANEL is dispatched', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({
        type: 'SET_ACTIVE_PANEL',
        payload: { tabGroupId: 'tg1', panelId: 'panel2' },
      });

      const state = component.getState();
      expect((state.layout as any).activePanel).toBe('panel2');
    });

    it('SET_ACTIVE_PANE updates the dock-pane-active class', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSplitState(),
        createContent: factory,
      });

      // Initially panelA is active
      let activePanes = container.querySelectorAll('.dock-pane-active');
      expect(activePanes.length).toBe(1);

      // Set panelB as active pane
      component.dispatch({
        type: 'SET_ACTIVE_PANE',
        payload: { panelId: 'panelB' },
      });

      const activeGroup = container.querySelector('.dock-pane-active');
      expect(activeGroup?.getAttribute('data-dock-target')).toBe('tg_right');
    });

    it('shows content for newly selected panel', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({
        type: 'SET_ACTIVE_PANEL',
        payload: { tabGroupId: 'tg1', panelId: 'panel2' },
      });

      const content = container.querySelector('[data-content-panel="panel2"]');
      expect(content).not.toBeNull();
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 3. State changes
  // ══════════════════════════════════════════════════════════════════

  describe('State changes', () => {
    it('CLOSE_PANEL removes tab DOM elements', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({ type: 'CLOSE_PANEL', payload: { panelId: 'panel2' } });

      const tabs = container.querySelectorAll('.dock-tab');
      expect(tabs.length).toBe(1); // Single panel still rendered as a tab

      const label = tabs[0].querySelector('.dock-tab-label');
      expect(label?.textContent).toBe('Panel 1');
    });

    it('CLOSE_PANEL removes panel from state', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({ type: 'CLOSE_PANEL', payload: { panelId: 'panel2' } });

      const state = component.getState();
      expect(state.panels['panel2']).toBeUndefined();
      expect((state.layout as any).panels).not.toContain('panel2');
    });

    it('ADD_PANEL adds new tab to DOM', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({
        type: 'ADD_PANEL',
        payload: { panelId: 'panel3', title: 'Panel 3' },
      });

      const tabs = container.querySelectorAll('[data-tab-id]');
      const tabIds = Array.from(tabs).map((t) => t.getAttribute('data-tab-id'));
      expect(tabIds).toContain('panel3');
    });

    it('ADD_PANEL creates content for the new active panel', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({
        type: 'ADD_PANEL',
        payload: { panelId: 'panel3', title: 'Panel 3' },
      });

      // ADD_PANEL sets the new panel as active
      const content = container.querySelector('[data-content-panel="panel3"]');
      expect(content).not.toBeNull();
    });

    it('FLOAT_PANEL creates floating window DOM', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({
        type: 'FLOAT_PANEL',
        payload: { panelId: 'panel1', x: 100, y: 100, width: 400, height: 300 },
      });

      const floatingWindow = container.querySelector('.dock-floating-window');
      expect(floatingWindow).not.toBeNull();
    });

    it('FLOAT_PANEL sets position and size on floating window', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({
        type: 'FLOAT_PANEL',
        payload: { panelId: 'panel1', x: 100, y: 150, width: 400, height: 300 },
      });

      const floatingWindow = container.querySelector('.dock-floating-window') as HTMLElement;
      expect(floatingWindow.style.left).toBe('100px');
      expect(floatingWindow.style.top).toBe('150px');
      expect(floatingWindow.style.width).toBe('400px');
      expect(floatingWindow.style.height).toBe('300px');
    });

    it('FLOAT_PANEL renders title in floating window', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({
        type: 'FLOAT_PANEL',
        payload: { panelId: 'panel1', x: 100, y: 100, width: 400, height: 300 },
      });

      const title = container.querySelector('.dock-floating-title');
      expect(title?.textContent).toBe('Panel 1');
    });

    it('DOCK_FLOATING removes floating window and adds panel back to layout', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      // Float panel1
      component.dispatch({
        type: 'FLOAT_PANEL',
        payload: { panelId: 'panel1', x: 100, y: 100, width: 400, height: 300 },
      });
      expect(container.querySelector('.dock-floating-window')).not.toBeNull();

      // Dock it back - use tg1 which should still have panel2
      component.dispatch({
        type: 'DOCK_FLOATING',
        payload: { panelId: 'panel1', targetTabGroupId: 'tg1', position: 'center' },
      });

      expect(container.querySelector('.dock-floating-window')).toBeNull();
      const state = component.getState();
      expect(state.floatingPanels.length).toBe(0);
      expect((state.layout as any).panels).toContain('panel1');
    });

    it('MOVE_PANEL center merges tabs into one group', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSplitState(),
        createContent: factory,
      });

      // Move panelA into the right tab group
      component.dispatch({
        type: 'MOVE_PANEL',
        payload: { panelId: 'panelA', targetTabGroupId: 'tg_right', position: 'center' },
      });

      const state = component.getState();
      // After merging, the split collapses to a single tab group
      expect(state.layout.type).toBe('tabgroup');
      const tg = state.layout as any;
      expect(tg.panels).toContain('panelA');
      expect(tg.panels).toContain('panelB');
      expect(tg.panels).toContain('panelC');
    });

    it('MOVE_PANEL edge creates a split', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSinglePanelState(),
        createContent: factory,
      });

      // Add a second panel first
      component.dispatch({
        type: 'ADD_PANEL',
        payload: { panelId: 'panel2', title: 'Panel 2' },
      });

      // Move panel2 to the right edge
      component.dispatch({
        type: 'MOVE_PANEL',
        payload: { panelId: 'panel2', targetTabGroupId: 'tg1', position: 'right' },
      });

      const state = component.getState();
      expect(state.layout.type).toBe('split');
      const tabGroups = container.querySelectorAll('.dock-tab-group');
      expect(tabGroups.length).toBe(2);
    });

    it('onStateChange callback is called after dispatch', () => {
      const { factory } = createContentFactory();
      const onStateChange = vi.fn();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
        onStateChange,
      });

      component.dispatch({
        type: 'SET_ACTIVE_PANEL',
        payload: { tabGroupId: 'tg1', panelId: 'panel2' },
      });

      expect(onStateChange).toHaveBeenCalledTimes(1);
      expect(onStateChange.mock.calls[0][0].layout.activePanel).toBe('panel2');
    });

    it('onStateChange not called when state does not change', () => {
      const { factory } = createContentFactory();
      const onStateChange = vi.fn();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
        onStateChange,
      });

      // MOVE_PANEL center on a panel already in the target group is a no-op
      component.dispatch({
        type: 'MOVE_PANEL',
        payload: { panelId: 'panel1', targetTabGroupId: 'tg1', position: 'center' },
      });

      expect(onStateChange).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 4. Active pane indicator
  // ══════════════════════════════════════════════════════════════════

  describe('Active pane indicator', () => {
    it('only one dock-pane-active class exists at a time', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSplitState(),
        createContent: factory,
      });

      const activePanes = container.querySelectorAll('.dock-pane-active');
      expect(activePanes.length).toBe(1);
    });

    it('switching active pane moves the dock-pane-active class', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSplitState(),
        createContent: factory,
      });

      // Initially panelA is active (tg_left)
      let active = container.querySelector('.dock-pane-active');
      expect(active?.getAttribute('data-dock-target')).toBe('tg_left');

      // Switch to panelB (tg_right)
      component.dispatch({ type: 'SET_ACTIVE_PANE', payload: { panelId: 'panelB' } });

      active = container.querySelector('.dock-pane-active');
      expect(active?.getAttribute('data-dock-target')).toBe('tg_right');

      // Still only one active
      expect(container.querySelectorAll('.dock-pane-active').length).toBe(1);
    });

    it('floating window gets dock-pane-active when active', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({
        type: 'FLOAT_PANEL',
        payload: { panelId: 'panel1', x: 100, y: 100, width: 400, height: 300 },
      });

      // FLOAT_PANEL sets the floated panel as activePaneId
      const floating = container.querySelector('.dock-floating-window');
      expect(floating?.classList.contains('dock-pane-active')).toBe(true);
    });

    it('floating window loses dock-pane-active when a docked panel becomes active', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({
        type: 'FLOAT_PANEL',
        payload: { panelId: 'panel1', x: 100, y: 100, width: 400, height: 300 },
      });

      // Switch active to panel2 (still docked)
      component.dispatch({ type: 'SET_ACTIVE_PANE', payload: { panelId: 'panel2' } });

      const floating = container.querySelector('.dock-floating-window');
      expect(floating?.classList.contains('dock-pane-active')).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 5. Error recovery
  // ══════════════════════════════════════════════════════════════════

  describe('Error recovery', () => {
    it('dispatch with unknown action type does not crash', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      // The reducer returns state unchanged for unknown actions
      expect(() => {
        component.dispatch({ type: 'UNKNOWN_ACTION' as any, payload: {} } as any);
      }).not.toThrow();
    });

    it('component remains functional after dispatch with unknown action', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({ type: 'UNKNOWN_ACTION' as any, payload: {} } as any);

      // Should still be able to dispatch valid actions
      component.dispatch({
        type: 'SET_ACTIVE_PANEL',
        payload: { tabGroupId: 'tg1', panelId: 'panel2' },
      });

      const state = component.getState();
      expect((state.layout as any).activePanel).toBe('panel2');
    });

    it('dispatch with invalid panel reference does not crash', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      // SET_ACTIVE_PANE with non-existent panel is a no-op (panel doesn't exist in state.panels)
      expect(() => {
        component.dispatch({ type: 'SET_ACTIVE_PANE', payload: { panelId: 'nonexistent' } });
      }).not.toThrow();

      // State unchanged
      expect(component.getState().activePaneId).toBe('panel1');
    });

    it('component continues to render after error in previous dispatch', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      // Try an action that won't change state (no-op)
      component.dispatch({ type: 'CLOSE_PANEL', payload: { panelId: 'nonexistent' } });

      // Component should still work
      component.dispatch({
        type: 'ADD_PANEL',
        payload: { panelId: 'panel3', title: 'Panel 3' },
      });

      const state = component.getState();
      expect(state.panels['panel3']).toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 6. Cleanup
  // ══════════════════════════════════════════════════════════════════

  describe('Cleanup', () => {
    it('dispose() removes root DOM element from container', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      expect(container.querySelector('.dock-manager-root')).not.toBeNull();
      component.dispose();
      expect(container.querySelector('.dock-manager-root')).toBeNull();
      // Prevent double-dispose in afterEach
      component = null as any;
    });

    it('dispose() removes all child DOM elements', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispose();
      expect(container.children.length).toBe(0);
      component = null as any;
    });

    it('dispose() calls dispose on content disposables', () => {
      const { factory, disposals } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispose();
      expect(disposals).toContain('panel1');
      component = null as any;
    });

    it('dispose() removes event listeners (no errors on subsequent clicks)', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispose();

      // After dispose, clicking on the (now removed) container should not throw
      expect(() => {
        container.click();
      }).not.toThrow();
      component = null as any;
    });

    it('dispose() cleans up floating window views', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({
        type: 'FLOAT_PANEL',
        payload: { panelId: 'panel1', x: 100, y: 100, width: 400, height: 300 },
      });

      expect(container.querySelector('.dock-floating-window')).not.toBeNull();
      component.dispose();
      expect(container.querySelector('.dock-floating-window')).toBeNull();
      component = null as any;
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 7. getState
  // ══════════════════════════════════════════════════════════════════

  describe('getState', () => {
    it('returns the current state', () => {
      const { factory } = createContentFactory();
      const initialState = createSimpleState();
      component = new DockviewComponent(container, {
        initialState,
        createContent: factory,
      });

      const state = component.getState();
      expect(state.panels['panel1']).toBeDefined();
      expect(state.panels['panel2']).toBeDefined();
      expect(state.activePaneId).toBe('panel1');
    });

    it('getState reflects dispatched changes', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({ type: 'CLOSE_PANEL', payload: { panelId: 'panel2' } });
      const state = component.getState();
      expect(state.panels['panel2']).toBeUndefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 8. updateOptions
  // ══════════════════════════════════════════════════════════════════

  describe('updateOptions', () => {
    it('switches to dark theme', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      const root = container.querySelector('.dock-manager-root')!;
      expect(root.classList.contains('dark')).toBe(false);

      component.updateOptions({ theme: 'dark' });
      expect(root.classList.contains('dark')).toBe(true);
    });

    it('switches from dark to light theme', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
        theme: 'dark',
      });

      const root = container.querySelector('.dock-manager-root')!;
      expect(root.classList.contains('dark')).toBe(true);

      component.updateOptions({ theme: 'light' });
      expect(root.classList.contains('dark')).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 9. Event callbacks
  // ══════════════════════════════════════════════════════════════════

  describe('Event callbacks', () => {
    it('onWillClose can prevent panel close', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
        onWillClose: (event) => {
          event.preventDefault();
        },
      });

      // Mousedown a close button via action delegation
      const closeBtn = container.querySelector('button[data-action="close"][data-panel-id="panel1"]');
      expect(closeBtn).not.toBeNull();
      closeBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));

      // Panel should not be closed
      const state = component.getState();
      expect(state.panels['panel1']).toBeDefined();
    });

    it('onWillClose fires with correct panelId', () => {
      const { factory } = createContentFactory();
      const onWillClose = vi.fn();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
        onWillClose,
      });

      const closeBtn = container.querySelector('button[data-action="close"][data-panel-id="panel1"]');
      closeBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));

      expect(onWillClose).toHaveBeenCalledTimes(1);
      expect(onWillClose.mock.calls[0][1]).toBe('panel1');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 10. DOM structure details
  // ══════════════════════════════════════════════════════════════════

  describe('DOM structure', () => {
    it('root has tabIndex=-1 for keyboard focus', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      const root = container.querySelector('.dock-manager-root') as HTMLElement;
      expect(root.tabIndex).toBe(-1);
    });

    it('panel header is rendered above content area', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      const tabGroup = container.querySelector('.dock-tab-group') as HTMLElement;
      const header = tabGroup.querySelector('.dock-panel-header');
      const children = Array.from(tabGroup.children);
      // Header should come before content area
      const headerIdx = children.indexOf(header as Element);
      expect(headerIdx).toBe(0);
    });

    it('multiple floating panels each get their own floating window', () => {
      const { factory } = createContentFactory();
      const state = createSplitState();
      component = new DockviewComponent(container, {
        initialState: state,
        createContent: factory,
      });

      component.dispatch({
        type: 'FLOAT_PANEL',
        payload: { panelId: 'panelA', x: 50, y: 50, width: 300, height: 200 },
      });
      component.dispatch({
        type: 'FLOAT_PANEL',
        payload: { panelId: 'panelB', x: 200, y: 200, width: 300, height: 200 },
      });

      const floatingWindows = container.querySelectorAll('.dock-floating-window');
      expect(floatingWindows.length).toBe(2);
    });

    it('data-has-tabs attribute is set when multiple panels exist', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      const tabGroup = container.querySelector('.dock-tab-group') as HTMLElement;
      expect(tabGroup.hasAttribute('data-has-tabs')).toBe(true);
    });

    it('data-has-tabs attribute is absent for single panel', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSinglePanelState(),
        createContent: factory,
      });

      const tabGroup = container.querySelector('.dock-tab-group') as HTMLElement;
      expect(tabGroup.hasAttribute('data-has-tabs')).toBe(false);
    });

    it('MAXIMIZE_PANEL creates a maximize overlay', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({ type: 'MAXIMIZE_PANEL', payload: { panelId: 'panel1' } });

      const state = component.getState();
      expect(state.maximizedPanelId).toBe('panel1');
    });

    it('RESTORE_PANEL clears maximized state', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(),
        createContent: factory,
      });

      component.dispatch({ type: 'MAXIMIZE_PANEL', payload: { panelId: 'panel1' } });
      component.dispatch({ type: 'RESTORE_PANEL', payload: { panelId: 'panel1' } });

      const state = component.getState();
      expect(state.maximizedPanelId).toBeUndefined();
    });

    it('RESTORE_PANEL preserves content visibility after maximize', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSinglePanelState(),
        createContent: factory,
      });

      // Verify content is visible initially inside the tab group
      const root = container.querySelector('.dock-manager-root')!;
      const initialContent = root.querySelector('.test-content[data-content-panel="panel1"]');
      expect(initialContent).not.toBeNull();
      expect(initialContent?.textContent).toBe('Content for panel1');

      // Maximize the panel — overlay should exist
      component.dispatch({ type: 'MAXIMIZE_PANEL', payload: { panelId: 'panel1' } });
      expect(component.getState().maximizedPanelId).toBe('panel1');

      // Restore the panel — overlay should be gone
      component.dispatch({ type: 'RESTORE_PANEL', payload: { panelId: 'panel1' } });
      expect(component.getState().maximizedPanelId).toBeUndefined();

      // Key assertion: content element is still present and visible
      // inside the dock-manager-root (back in the tab group content area)
      const restoredContent = root.querySelector('.test-content[data-content-panel="panel1"]');
      expect(restoredContent).not.toBeNull();
      expect(restoredContent?.textContent).toBe('Content for panel1');

      // Verify a tab group exists (its content area is the placeholder for
      // the persistent container in the render root) and the maximize
      // overlay is gone.
      const tabGroup = root.querySelector('.dock-tab-group');
      expect(tabGroup).not.toBeNull();
      // Under stable render containers the persistent container is
      // reparented into the tab group's placeholder when bound. Verify it
      // exists somewhere in the root and holds the content.
      const persistentContainer = root.querySelector(
        '[data-panel-container-id="panel1"]',
      );
      expect(persistentContainer).not.toBeNull();
      expect(persistentContainer!.querySelector('.test-content[data-content-panel="panel1"]')).not.toBeNull();
    });

    it('DOCK_FLOATING preserves content visibility after float from multi-tab group', () => {
      const { factory } = createContentFactory();
      component = new DockviewComponent(container, {
        initialState: createSimpleState(), // panel1 + panel2 in one tab group
        createContent: factory,
      });

      const root = container.querySelector('.dock-manager-root')!;

      // Verify panel1 content exists initially
      const initialContent = root.querySelector('.test-content[data-content-panel="panel1"]');
      expect(initialContent).not.toBeNull();

      // Float panel1 out of the multi-tab group
      component.dispatch({
        type: 'FLOAT_PANEL',
        payload: { panelId: 'panel1', x: 100, y: 100, width: 400, height: 300 },
      });
      expect(component.getState().floatingPanels.length).toBe(1);

      // Dock panel1 back
      const targetId = component.getState().layout.type === 'tabgroup'
        ? component.getState().layout.id
        : (component.getState().layout as any).children[0].id;
      component.dispatch({
        type: 'DOCK_FLOATING',
        payload: { panelId: 'panel1', targetTabGroupId: targetId, position: 'center' },
      });
      expect(component.getState().floatingPanels.length).toBe(0);

      // Key assertion: content is back in a tab group, not lost
      const restoredContent = root.querySelector('.test-content[data-content-panel="panel1"]');
      expect(restoredContent).not.toBeNull();
      expect(restoredContent?.textContent).toBe('Content for panel1');
    });
  });
});
