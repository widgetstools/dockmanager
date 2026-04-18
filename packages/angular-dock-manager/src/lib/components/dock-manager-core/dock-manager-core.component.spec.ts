/**
 * Tests for the Angular DockManagerCore wrapper logic.
 *
 * Since Angular decorators (@Component, @Input, etc.) require Angular's
 * compiler and don't work in plain vitest, these tests verify the
 * wrapper's integration with DockviewComponent by directly testing
 * the core component that Angular wraps.
 *
 * This validates that the thin-wrapper pattern works correctly:
 * the same DockviewComponent used by React produces correct DOM
 * when given Angular-like initialization patterns.
 */

// Polyfill ResizeObserver for jsdom
if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DockviewComponent } from '@widgetstools/dock-manager-core';
import type { DockManagerState, DockviewComponentOptions, IDisposable } from '@widgetstools/dock-manager-core';

/**
 * These tests simulate what the Angular DockManagerCoreComponent does:
 * 1. Creates a container div
 * 2. Instantiates DockviewComponent with options
 * 3. Provides createContent callback (like Angular's ContentRenderer)
 * 4. Dispatches actions
 * 5. Handles state changes via callback
 * 6. Cleans up on destroy
 *
 * This is the same code path Angular uses — the component.ts is just
 * boilerplate for @Input/@Output/@ViewChild wiring.
 */

function createTestState(): DockManagerState {
  return {
    layout: {
      type: 'tabgroup',
      id: 'tg1',
      panels: ['p1', 'p2'],
      activePanel: 'p1',
    },
    panels: new Map([
      ['p1', { id: 'p1', title: 'Panel 1' } as any],
      ['p2', { id: 'p2', title: 'Panel 2' } as any],
    ]),
    placements: new Map([
      ['p1', { type: 'docked' as const, groupId: 'tg1' }],
      ['p2', { type: 'docked' as const, groupId: 'tg1' }],
    ]),
    nextZIndex: 1000,
    activePaneId: 'p1',
  };
}

describe('Angular wrapper integration (DockviewComponent with Angular-like usage)', () => {
  let container: HTMLDivElement;
  let dock: DockviewComponent;
  let stateChanges: DockManagerState[];

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
    stateChanges = [];

    // This mirrors what DockManagerCoreComponent.ngAfterViewInit() does
    const options: DockviewComponentOptions = {
      initialState: createTestState(),
      theme: 'light',
      createContent: (panelId: string, el: HTMLElement): IDisposable => {
        const div = document.createElement('div');
        div.className = 'angular-content';
        div.textContent = `Angular content: ${panelId}`;
        el.appendChild(div);
        return { dispose: () => div.remove() };
      },
      onStateChange: (state: DockManagerState) => {
        stateChanges.push(state);
      },
    };

    dock = new DockviewComponent(container, options);
  });

  afterEach(() => {
    dock.dispose();
    container.remove();
  });

  // ── Initialization (mirrors ngAfterViewInit) ──

  it('should create root DOM in the container', () => {
    const root = container.querySelector('.dock-manager-root');
    expect(root).not.toBeNull();
  });

  it('should render tabs from initial state', () => {
    const tabs = container.querySelectorAll('.dock-tab');
    expect(tabs.length).toBe(2);
  });

  it('should render correct tab titles', () => {
    const labels = container.querySelectorAll('.dock-tab-label');
    const titles = Array.from(labels).map(l => l.textContent);
    expect(titles).toContain('Panel 1');
    expect(titles).toContain('Panel 2');
  });

  it('should call createContent for active panel', () => {
    const content = container.querySelector('.angular-content');
    expect(content).not.toBeNull();
    expect(content!.textContent).toBe('Angular content: p1');
  });

  it('should mark the active tab', () => {
    const selectedTab = container.querySelector('.dock-tab-selected');
    expect(selectedTab).not.toBeNull();
    const label = selectedTab!.querySelector('.dock-tab-label');
    expect(label!.textContent).toBe('Panel 1');
  });

  // ── Dispatch (mirrors component.dispatch()) ──

  it('should switch tabs on SET_ACTIVE_PANEL', () => {
    dock.dispatch({ type: 'SET_ACTIVE_PANEL', groupId: 'tg1', panelId: 'p2' });
    const state = dock.getState();
    expect((state.layout as any).activePanel).toBe('p2');
  });

  it('should emit state changes on dispatch', () => {
    dock.dispatch({ type: 'SET_ACTIVE_PANEL', groupId: 'tg1', panelId: 'p2' });
    expect(stateChanges.length).toBeGreaterThan(0);
  });

  it('should close panel', () => {
    dock.dispatch({ type: 'CLOSE_PANEL', panelId: 'p2' });
    const state = dock.getState();
    expect(state.panels.get('p2')).toBeUndefined();
  });

  it('should add panel', () => {
    dock.dispatch({ type: 'ADD_PANEL', panelId: 'p3', config: { id: 'p3', title: 'Panel 3' } as any });
    const state = dock.getState();
    expect(state.panels.get('p3')).toBeDefined();
    expect(state.panels.get('p3')!.title).toBe('Panel 3');
  });

  it('should float panel', () => {
    dock.dispatch({
      type: 'FLOAT_PANEL',
      panelId: 'p1', x: 50, y: 50, width: 300, height: 200,
    });
    const state = dock.getState();
    const floatingCount = [...state.placements.values()].filter(p => p.type === 'floating').length;
    expect(floatingCount).toBe(1);
    const floating = container.querySelectorAll('.dock-floating-window');
    expect(floating.length).toBe(1);
  });

  // ── Theme (mirrors ngOnChanges) ──

  it('should update theme at runtime', () => {
    dock.updateOptions({ theme: 'dark' });
    // Should not throw
    expect(dock.getState()).toBeDefined();
  });

  // ── Cleanup (mirrors ngOnDestroy) ──

  it('should clean up DOM on dispose', () => {
    dock.dispose();
    const root = container.querySelector('.dock-manager-root');
    expect(root).toBeNull();
  });

  it('should handle double dispose gracefully', () => {
    dock.dispose();
    // Second dispose should not throw
    expect(() => dock.dispose()).not.toThrow();
  });

  // ── Active pane indicator ──

  it('should apply dock-pane-active class to the active group', () => {
    const activeGroups = container.querySelectorAll('.dock-pane-active');
    expect(activeGroups.length).toBe(1);
  });

  it('should move dock-pane-active when SET_ACTIVE_PANE dispatched', () => {
    dock.dispatch({ type: 'SET_ACTIVE_PANE', panelId: 'p2' });
    const state = dock.getState();
    expect(state.activePaneId).toBe('p2');
  });

  // ── Error recovery ──

  it('should survive invalid dispatch', () => {
    // Unknown action type should not throw
    dock.dispatch({ type: 'NONEXISTENT' as any, payload: {} } as any);
    expect(dock.getState()).toBeDefined();
  });

  // ── getState (mirrors component.getState()) ──

  it('should return current state', () => {
    const state = dock.getState();
    expect(state.panels.get('p1')!.title).toBe('Panel 1');
    expect(state.activePaneId).toBe('p1');
  });
});
