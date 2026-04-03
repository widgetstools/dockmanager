import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React, { createRef } from 'react';
import type { DockManagerState } from '@widgetstools/dock-manager-core';

// ── Mock core ───────────────────────────────────────────────────────────

/** Tracks the most recently created mock instance so tests can inspect it. */
let latestMockInstance: ReturnType<typeof createMockInstance>;

const mockApi = {
  addPanel: vi.fn(),
  removePanel: vi.fn(),
  movePanel: vi.fn(),
  getPanel: vi.fn(),
  onDidStateChange: vi.fn(),
};

function createMockInstance(initialState: DockManagerState) {
  return {
    api: mockApi,
    getState: vi.fn().mockReturnValue(initialState),
    dispatch: vi.fn(),
    updateOptions: vi.fn(),
    dispose: vi.fn(),
  };
}

vi.mock('@widgetstools/dock-manager-core', () => {
  const MockDockviewComponent = vi.fn().mockImplementation((_container: HTMLElement, options: any) => {
    latestMockInstance = createMockInstance(options.initialState);
    return latestMockInstance;
  });
  return {
    DockviewComponent: MockDockviewComponent,
    PanelApi: vi.fn(),
  };
});

// Import after mock is set up
import { DockManagerCore } from '../components/dock/DockManagerCore';
import type { DockManagerCoreHandle } from '../components/dock/DockManagerCore';
import { DockviewComponent } from '@widgetstools/dock-manager-core';

// ── Fixtures ────────────────────────────────────────────────────────────

const minimalState: DockManagerState = {
  panels: {
    p1: {
      id: 'p1',
      title: 'Panel 1',
      closable: true,
      floatable: true,
    },
  },
  layout: {
    type: 'tabgroup',
    id: 'tg1',
    panels: ['p1'],
    activePanel: 'p1',
  },
  floatingPanels: [],
  unpinnedPanels: [],
  nextZIndex: 1,
} as DockManagerState;

// ── Tests ───────────────────────────────────────────────────────────────

describe('DockManagerCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply the constructor implementation after clearAllMocks resets it
    vi.mocked(DockviewComponent).mockImplementation((_container: any, options: any) => {
      latestMockInstance = createMockInstance(options.initialState);
      return latestMockInstance as any;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render a container div', () => {
    const { container } = render(
      <DockManagerCore initialState={minimalState} />,
    );

    const div = container.querySelector('div');
    expect(div).toBeTruthy();
    expect(div?.style.width).toBe('100%');
    expect(div?.style.height).toBe('100%');
  });

  it('should forward className prop to the container div', () => {
    const { container } = render(
      <DockManagerCore initialState={minimalState} className="my-dock" />,
    );

    const div = container.querySelector('div');
    expect(div?.className).toBe('my-dock');
  });

  it('should instantiate DockviewComponent with the container and options', () => {
    render(<DockManagerCore initialState={minimalState} />);

    expect(DockviewComponent).toHaveBeenCalledTimes(1);
    const [container, options] = vi.mocked(DockviewComponent).mock.calls[0];
    expect(container).toBeInstanceOf(HTMLDivElement);
    expect(options.initialState).toBe(minimalState);
  });

  it('should call onReady with the API after mount', () => {
    const onReady = vi.fn();

    render(
      <DockManagerCore initialState={minimalState} onReady={onReady} />,
    );

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith(mockApi);
  });

  it('should expose getState via imperative handle', () => {
    const ref = createRef<DockManagerCoreHandle>();

    render(
      <DockManagerCore ref={ref} initialState={minimalState} />,
    );

    const state = ref.current!.getState();
    expect(state).toBe(minimalState);
    expect(latestMockInstance.getState).toHaveBeenCalled();
  });

  it('should expose getApi via imperative handle', () => {
    const ref = createRef<DockManagerCoreHandle>();

    render(
      <DockManagerCore ref={ref} initialState={minimalState} />,
    );

    const api = ref.current!.getApi();
    expect(api).toBe(mockApi);
  });

  it('should expose getInstance via imperative handle', () => {
    const ref = createRef<DockManagerCoreHandle>();

    render(
      <DockManagerCore ref={ref} initialState={minimalState} />,
    );

    const instance = ref.current!.getInstance();
    expect(instance).toBe(latestMockInstance);
  });

  it('should expose dispatch via imperative handle', () => {
    const ref = createRef<DockManagerCoreHandle>();

    render(
      <DockManagerCore ref={ref} initialState={minimalState} />,
    );

    const action = { type: 'CLOSE_PANEL' as const, panelId: 'p1' };
    ref.current!.dispatch(action as any);
    expect(latestMockInstance.dispatch).toHaveBeenCalledWith(action);
  });

  it('should call dispose on unmount', () => {
    const { unmount } = render(
      <DockManagerCore initialState={minimalState} />,
    );

    expect(latestMockInstance.dispose).not.toHaveBeenCalled();

    unmount();

    expect(latestMockInstance.dispose).toHaveBeenCalledTimes(1);
  });

  it('should call updateOptions when theme changes', () => {
    const { rerender } = render(
      <DockManagerCore initialState={minimalState} theme="light" />,
    );

    latestMockInstance.updateOptions.mockClear();

    rerender(
      <DockManagerCore initialState={minimalState} theme="dark" />,
    );

    expect(latestMockInstance.updateOptions).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'dark' }),
    );
  });

  it('should call updateOptions when allowRootDock changes', () => {
    const { rerender } = render(
      <DockManagerCore initialState={minimalState} allowRootDock={true} />,
    );

    latestMockInstance.updateOptions.mockClear();

    rerender(
      <DockManagerCore initialState={minimalState} allowRootDock={false} />,
    );

    expect(latestMockInstance.updateOptions).toHaveBeenCalledWith(
      expect.objectContaining({ allowRootDock: false }),
    );
  });

  it('should pass theme to DockviewComponent options', () => {
    render(
      <DockManagerCore initialState={minimalState} theme="dark" />,
    );

    const [, options] = vi.mocked(DockviewComponent).mock.calls[0];
    expect(options.theme).toBe('dark');
  });

  it('should default theme to light', () => {
    render(
      <DockManagerCore initialState={minimalState} />,
    );

    const [, options] = vi.mocked(DockviewComponent).mock.calls[0];
    expect(options.theme).toBe('light');
  });

  it('should return initialState from getState when core returns undefined', () => {
    const ref = createRef<DockManagerCoreHandle>();

    render(
      <DockManagerCore ref={ref} initialState={minimalState} />,
    );

    // Override getState to return undefined to trigger the fallback
    latestMockInstance.getState.mockReturnValue(undefined);

    const state = ref.current!.getState();
    // dockRef.current?.getState() ?? initialState => falls back to initialState
    expect(state).toBe(minimalState);
  });

  it('should provide createContent callback to DockviewComponent', () => {
    const renderPanel = vi.fn().mockReturnValue(<div>Panel Content</div>);

    render(
      <DockManagerCore
        initialState={minimalState}
        renderPanel={renderPanel}
      />,
    );

    const [, options] = vi.mocked(DockviewComponent).mock.calls[0];
    expect(options.createContent).toBeDefined();
    expect(typeof options.createContent).toBe('function');
  });

  it('should provide createTab callback when renderTab is given', () => {
    const renderTab = vi.fn().mockReturnValue(<span>Tab</span>);

    render(
      <DockManagerCore
        initialState={minimalState}
        renderTab={renderTab}
      />,
    );

    const [, options] = vi.mocked(DockviewComponent).mock.calls[0];
    expect(options.createTab).toBeDefined();
    expect(typeof options.createTab).toBe('function');
  });

  it('should not provide createTab callback when renderTab is not given', () => {
    render(
      <DockManagerCore initialState={minimalState} />,
    );

    const [, options] = vi.mocked(DockviewComponent).mock.calls[0];
    expect(options.createTab).toBeUndefined();
  });

  it('should provide createHeaderActions callback when renderHeaderActions is given', () => {
    const renderHeaderActions = vi.fn().mockReturnValue(<div>Actions</div>);

    render(
      <DockManagerCore
        initialState={minimalState}
        renderHeaderActions={renderHeaderActions}
      />,
    );

    const [, options] = vi.mocked(DockviewComponent).mock.calls[0];
    expect(options.createHeaderActions).toBeDefined();
    expect(typeof options.createHeaderActions).toBe('function');
  });

  it('should not provide createHeaderActions callback when renderHeaderActions is not given', () => {
    render(
      <DockManagerCore initialState={minimalState} />,
    );

    const [, options] = vi.mocked(DockviewComponent).mock.calls[0];
    expect(options.createHeaderActions).toBeUndefined();
  });

  it('should forward onStateChange callback to core options', () => {
    const onStateChange = vi.fn();

    render(
      <DockManagerCore
        initialState={minimalState}
        onStateChange={onStateChange}
      />,
    );

    const [, options] = vi.mocked(DockviewComponent).mock.calls[0];
    expect(options.onStateChange).toBeDefined();

    // Simulate core calling onStateChange
    act(() => {
      options.onStateChange!(minimalState);
    });

    expect(onStateChange).toHaveBeenCalledWith(minimalState);
  });

  it('should forward onWillClose callback to core options', () => {
    const onWillClose = vi.fn();

    render(
      <DockManagerCore
        initialState={minimalState}
        onWillClose={onWillClose}
      />,
    );

    const [, options] = vi.mocked(DockviewComponent).mock.calls[0];
    expect(options.onWillClose).toBeDefined();

    const mockEvent = { prevented: false, preventDefault: vi.fn() };
    options.onWillClose!(mockEvent as any, 'p1');

    expect(onWillClose).toHaveBeenCalledWith(mockEvent, 'p1');
  });

  it('should forward onWillDrop callback to core options', () => {
    const onWillDrop = vi.fn();

    render(
      <DockManagerCore
        initialState={minimalState}
        onWillDrop={onWillDrop}
      />,
    );

    const [, options] = vi.mocked(DockviewComponent).mock.calls[0];
    expect(options.onWillDrop).toBeDefined();

    const mockEvent = { prevented: false, preventDefault: vi.fn() };
    options.onWillDrop!(mockEvent as any, 'p1', 'p2', 'center' as any);

    expect(onWillDrop).toHaveBeenCalledWith(mockEvent, 'p1', 'p2', 'center');
  });

  it('should pass resourceStrings to DockviewComponent options', () => {
    const strings = { close: 'Fermer', pin: 'Epingler' };

    render(
      <DockManagerCore
        initialState={minimalState}
        resourceStrings={strings as any}
      />,
    );

    const [, options] = vi.mocked(DockviewComponent).mock.calls[0];
    expect(options.resourceStrings).toBe(strings);
  });

  it('should pass allowRootDock to DockviewComponent options', () => {
    render(
      <DockManagerCore
        initialState={minimalState}
        allowRootDock={false}
      />,
    );

    const [, options] = vi.mocked(DockviewComponent).mock.calls[0];
    expect(options.allowRootDock).toBe(false);
  });
});
