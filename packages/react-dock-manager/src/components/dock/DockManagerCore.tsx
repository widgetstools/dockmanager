/**
 * Thin React wrapper around the core DockviewComponent.
 *
 * This component:
 * 1. Creates a container div ref
 * 2. Instantiates DockviewComponent from core in useEffect
 * 3. Bridges React content rendering via portals into core-created DOM slots
 * 4. Forwards state changes back to React
 *
 * All DOM rendering, event handling, and layout logic lives in core.
 * React only provides panel content via portals.
 */
import React, {
  useRef,
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { createPortal } from 'react-dom';
import type {
  DockManagerState,
  PanelConfig,
  PreventableDockEvent,
  DockPosition,
  DockTheme,
  DockResourceStrings,
  DockviewApi,
} from '@widgetstools/dock-manager-core';
import {
  DockviewComponent,
} from '@widgetstools/dock-manager-core';
import type {
  DockviewComponentOptions,
  IDisposable,
} from '@widgetstools/dock-manager-core';
import type { DockAction } from '@widgetstools/dock-manager-core';
import { PanelApi } from '@widgetstools/dock-manager-core';

// ── Types ────────────────────────────────────────────────────────────

/** Props passed to widget components registered via the `widgets` prop */
export interface WidgetProps {
  panelId: string;
  panel: PanelConfig;
  api: PanelApi;
}

export interface DockManagerCoreProps {
  /** Initial state for the dock manager */
  initialState: DockManagerState;
  /**
   * Widget registry: maps `panel.widgetType` strings to React components.
   * This is the simplest way to render panel content.
   *
   * Example: `widgets={{ clock: ClockWidget, editor: EditorWidget }}`
   */
  widgets?: Record<string, React.ComponentType<WidgetProps>>;
  /**
   * Render panel content. Called when a panel needs content mounted.
   * If both `widgets` and `renderPanel` are provided, the registry is tried
   * first and `renderPanel` is used as a fallback.
   */
  renderPanel?: (panelId: string, panel: PanelConfig, api: PanelApi) => React.ReactNode;
  /** Optional custom tab renderer */
  renderTab?: (panelId: string, panel: PanelConfig, isActive: boolean) => React.ReactNode;
  /** Optional header action slots */
  renderHeaderActions?: (slot: 'left' | 'right' | 'prefix', tabGroupId: string) => React.ReactNode;
  /** Called with the DockviewApi when the component is ready. Simplest way to access the API. */
  onReady?: (api: DockviewApi) => void;
  /** Called when state changes */
  onStateChange?: (state: DockManagerState) => void;
  /** Called before a panel is closed (preventable) */
  onWillClose?: (event: PreventableDockEvent, panelId: string) => void;
  /** Called before a drop (preventable) */
  onWillDrop?: (event: PreventableDockEvent, sourceId: string, targetId: string, position: DockPosition) => void;
  /** Theme: 'light', 'dark', or a DockTheme object */
  theme?: 'light' | 'dark' | DockTheme;
  /** Whether to show edge dock indicators. Defaults to true. */
  allowRootDock?: boolean;
  /** Custom strings for UI elements (tooltips, context menu, etc.) */
  resourceStrings?: Partial<DockResourceStrings>;
  /** Additional className for the root container */
  className?: string;
}

export interface DockManagerCoreHandle {
  /** Dispatch an action to the dock manager */
  dispatch: (action: DockAction) => void;
  /** Get current state */
  getState: () => DockManagerState;
  /** Get the underlying DockviewComponent instance */
  getInstance: () => DockviewComponent | null;
  /** Get the DockviewApi for high-level programmatic control */
  getApi: () => DockviewApi | null;
}

// ── Portal tracking ──────────────────────────────────────────────────

interface PortalEntry {
  container: HTMLElement;
  panelId: string;
  type: 'content' | 'tab' | 'headerAction';
  api?: PanelApi;
  isActive?: boolean;
  slot?: 'left' | 'right' | 'prefix';
  tabGroupId?: string;
}

// ── Component ────────────────────────────────────────────────────────

export const DockManagerCore = forwardRef<DockManagerCoreHandle, DockManagerCoreProps>(
  function DockManagerCore(props, ref) {
    const {
      initialState,
      widgets,
      renderPanel,
      renderTab,
      renderHeaderActions,
      onReady,
      onStateChange,
      onWillClose,
      onWillDrop,
      theme = 'light',
      allowRootDock,
      resourceStrings,
      className,
    } = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const dockRef = useRef<DockviewComponent | null>(null);
    const [portals, setPortals] = useState<Map<string, PortalEntry>>(new Map());
    const [, forceUpdate] = useState(0);

    // Keep refs to latest callbacks so core doesn't need to be re-created
    const callbackRefs = useRef({ renderPanel, renderTab, renderHeaderActions, onStateChange, onWillClose, onWillDrop, onReady, widgets });
    callbackRefs.current = { renderPanel, renderTab, renderHeaderActions, onStateChange, onWillClose, onWillDrop, onReady, widgets };

    // Initialize DockviewComponent
    useEffect(() => {
      if (!containerRef.current) return;

      const addPortal = (key: string, entry: PortalEntry) => {
        setPortals((prev) => new Map(prev).set(key, entry));
      };

      const removePortal = (key: string) => {
        setPortals((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      };

      let portalCounter = 0;

      const options: DockviewComponentOptions = {
        initialState,
        theme,
        allowRootDock,
        resourceStrings,

        createContent: (panelId: string, container: HTMLElement, api: PanelApi): IDisposable => {
          const key = `content:${panelId}:${++portalCounter}`;
          addPortal(key, { container, panelId, type: 'content', api });
          return { dispose: () => removePortal(key) };
        },

        createTab: renderTab
          ? (panelId: string, container: HTMLElement, isActive: boolean): IDisposable => {
              const key = `tab:${panelId}:${++portalCounter}`;
              addPortal(key, { container, panelId, type: 'tab', isActive });
              return { dispose: () => removePortal(key) };
            }
          : undefined,

        createHeaderActions: renderHeaderActions
          ? (slot, tabGroupId, container): IDisposable => {
              const key = `header:${slot}:${tabGroupId}:${++portalCounter}`;
              addPortal(key, { container, panelId: '', type: 'headerAction', slot, tabGroupId });
              return { dispose: () => removePortal(key) };
            }
          : undefined,

        onStateChange: (state: DockManagerState) => {
          callbackRefs.current.onStateChange?.(state);
          forceUpdate((n) => n + 1);
        },

        onWillClose: (event, panelId) => {
          callbackRefs.current.onWillClose?.(event, panelId);
        },

        onWillDrop: (event, sourceId, targetId, position) => {
          callbackRefs.current.onWillDrop?.(event, sourceId, targetId, position);
        },
      };

      const dock = new DockviewComponent(containerRef.current, options);
      dockRef.current = dock;

      // Fire onReady with the API
      callbackRefs.current.onReady?.(dock.api);

      return () => {
        dock.dispose();
        dockRef.current = null;
        setPortals(new Map());
      };
    }, []); // Only run once on mount

    // Sync options when props change
    const themeKey = typeof theme === 'object' ? theme.name : theme;
    useEffect(() => {
      if (!dockRef.current) return;
      dockRef.current.updateOptions({
        ...(theme !== undefined && { theme }),
        ...(allowRootDock !== undefined && { allowRootDock }),
        ...(resourceStrings !== undefined && { resourceStrings }),
      });
    }, [themeKey, allowRootDock, resourceStrings]); // eslint-disable-line react-hooks/exhaustive-deps

    // Imperative handle for parent components
    useImperativeHandle(ref, () => ({
      dispatch: (action: DockAction) => dockRef.current?.dispatch(action),
      getState: () => dockRef.current?.getState() ?? initialState,
      getInstance: () => dockRef.current,
      getApi: () => dockRef.current?.api ?? null,
    }));

    // Render portals into core-created DOM slots
    const portalElements: React.ReactNode[] = [];
    const state = dockRef.current?.getState();
    const cbs = callbackRefs.current;

    portals.forEach((entry, key) => {
      let content: React.ReactNode = null;

      switch (entry.type) {
        case 'content': {
          const panel = state?.panels[entry.panelId];
          if (panel && entry.api) {
            // Try widget registry first, then fall back to renderPanel
            const widgetType = panel.widgetType || '';
            const Widget = cbs.widgets?.[widgetType];
            if (Widget) {
              content = <Widget panelId={entry.panelId} panel={panel} api={entry.api} />;
            } else if (cbs.renderPanel) {
              content = cbs.renderPanel(entry.panelId, panel, entry.api);
            }
          }
          break;
        }
        case 'tab': {
          const panel = state?.panels[entry.panelId];
          if (panel && cbs.renderTab) {
            content = cbs.renderTab(entry.panelId, panel, entry.isActive ?? false);
          }
          break;
        }
        case 'headerAction': {
          if (cbs.renderHeaderActions && entry.slot && entry.tabGroupId) {
            content = cbs.renderHeaderActions(entry.slot, entry.tabGroupId);
          }
          break;
        }
      }

      if (content !== null && entry.container.isConnected) {
        portalElements.push(createPortal(content, entry.container, key));
      }
    });

    return (
      <>
        <div
          ref={containerRef}
          className={className}
          style={{ width: '100%', height: '100%' }}
        />
        {portalElements}
      </>
    );
  }
);
