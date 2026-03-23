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

export interface DockManagerCoreProps {
  /** Initial state for the dock manager */
  initialState: DockManagerState;
  /** Render panel content. Called when a panel needs content mounted. */
  renderPanel: (panelId: string, panel: PanelConfig, api: PanelApi) => React.ReactNode;
  /** Optional custom tab renderer */
  renderTab?: (panelId: string, panel: PanelConfig, isActive: boolean) => React.ReactNode;
  /** Optional header action slots */
  renderHeaderActions?: (slot: 'left' | 'right' | 'prefix', tabGroupId: string) => React.ReactNode;
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
  getApi: () => import('@widgetstools/dock-manager-core').DockviewApi | null;
}

// ── Portal tracking ──────────────────────────────────────────────────

interface PortalEntry {
  container: HTMLElement;
  panelId: string;
  type: 'content' | 'tab' | 'headerAction';
  // Extra context for content panels
  api?: PanelApi;
  // Extra context for tabs
  isActive?: boolean;
  // Extra context for header actions
  slot?: 'left' | 'right' | 'prefix';
  tabGroupId?: string;
}

// ── Component ────────────────────────────────────────────────────────

export const DockManagerCore = forwardRef<DockManagerCoreHandle, DockManagerCoreProps>(
  function DockManagerCore(props, ref) {
    const {
      initialState,
      renderPanel,
      renderTab,
      renderHeaderActions,
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
    const renderPanelRef = useRef(renderPanel);
    renderPanelRef.current = renderPanel;
    const renderTabRef = useRef(renderTab);
    renderTabRef.current = renderTab;
    const renderHeaderActionsRef = useRef(renderHeaderActions);
    renderHeaderActionsRef.current = renderHeaderActions;
    const onStateChangeRef = useRef(onStateChange);
    onStateChangeRef.current = onStateChange;
    const onWillCloseRef = useRef(onWillClose);
    onWillCloseRef.current = onWillClose;
    const onWillDropRef = useRef(onWillDrop);
    onWillDropRef.current = onWillDrop;

    // Initialize DockviewComponent
    useEffect(() => {
      if (!containerRef.current) return;

      const addPortal = (key: string, entry: PortalEntry) => {
        setPortals((prev) => {
          const next = new Map(prev);
          next.set(key, entry);
          return next;
        });
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
          // Use a unique key with counter to ensure React treats re-mounting
          // (e.g. float → dock-back) as a genuinely new portal, not a reuse
          const key = `content:${panelId}:${++portalCounter}`;
          addPortal(key, { container, panelId, type: 'content', api });
          return {
            dispose: () => removePortal(key),
          };
        },

        createTab: renderTab
          ? (panelId: string, container: HTMLElement, isActive: boolean): IDisposable => {
              const key = `tab:${panelId}:${++portalCounter}`;
              addPortal(key, { container, panelId, type: 'tab', isActive });
              return {
                dispose: () => removePortal(key),
              };
            }
          : undefined,

        createHeaderActions: renderHeaderActions
          ? (slot, tabGroupId, container): IDisposable => {
              const key = `header:${slot}:${tabGroupId}:${++portalCounter}`;
              addPortal(key, { container, panelId: '', type: 'headerAction', slot, tabGroupId });
              return {
                dispose: () => removePortal(key),
              };
            }
          : undefined,

        onStateChange: (state: DockManagerState) => {
          onStateChangeRef.current?.(state);
          // Force portal re-render to pick up state changes
          forceUpdate((n) => n + 1);
        },

        onWillClose: (event, panelId) => {
          onWillCloseRef.current?.(event, panelId);
        },

        onWillDrop: (event, sourceId, targetId, position) => {
          onWillDropRef.current?.(event, sourceId, targetId, position);
        },
      };

      const dock = new DockviewComponent(containerRef.current, options);
      dockRef.current = dock;

      return () => {
        dock.dispose();
        dockRef.current = null;
        setPortals(new Map());
      };
    }, []); // Only run once on mount

    // Update theme when it changes
    const themeKey = typeof theme === 'object' ? theme.name : theme;
    useEffect(() => {
      dockRef.current?.updateOptions({ theme });
    }, [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Update allowRootDock when it changes
    useEffect(() => {
      if (allowRootDock !== undefined) {
        dockRef.current?.updateOptions({ allowRootDock });
      }
    }, [allowRootDock]);

    // Update resourceStrings when they change
    useEffect(() => {
      if (resourceStrings !== undefined) {
        dockRef.current?.updateOptions({ resourceStrings });
      }
    }, [resourceStrings]);

    // Imperative handle for parent components
    useImperativeHandle(ref, () => ({
      dispatch: (action: DockAction) => dockRef.current?.dispatch(action),
      getState: () => dockRef.current?.getState() ?? initialState,
      getInstance: () => dockRef.current,
      getApi: () => dockRef.current?.api ?? null,
    }));

    // Render portals into core-created DOM slots.
    // Computed inline (no useMemo) because forceUpdate triggers re-renders
    // when state changes even though the portal map itself hasn't changed —
    // the content rendered INTO the portals needs to update.
    const portalElements: React.ReactNode[] = [];
    const state = dockRef.current?.getState();

    portals.forEach((entry, key) => {
      let content: React.ReactNode = null;

      switch (entry.type) {
        case 'content': {
          const panel = state?.panels[entry.panelId];
          if (panel && entry.api) {
            content = renderPanelRef.current(entry.panelId, panel, entry.api);
          }
          break;
        }
        case 'tab': {
          const panel = state?.panels[entry.panelId];
          if (panel && renderTabRef.current) {
            content = renderTabRef.current(entry.panelId, panel, entry.isActive ?? false);
          }
          break;
        }
        case 'headerAction': {
          if (renderHeaderActionsRef.current && entry.slot && entry.tabGroupId) {
            content = renderHeaderActionsRef.current(entry.slot, entry.tabGroupId);
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
