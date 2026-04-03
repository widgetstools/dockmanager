/**
 * Core types for the dock manager layout system.
 *
 * These types define the shape of the layout tree, panel configuration,
 * floating/popout/unpinned panel state, and dock events.
 *
 * @module dock
 */

/**
 * Direction of a split divider.
 * - `'horizontal'` splits children left-to-right.
 * - `'vertical'` splits children top-to-bottom.
 */
export type SplitDirection = 'horizontal' | 'vertical';

/**
 * Position for docking a panel relative to a target tab group.
 * - `'center'` adds the panel as a new tab in the group.
 * - `'left' | 'right' | 'top' | 'bottom'` creates a new split beside the target.
 */
export type DockPosition = 'left' | 'right' | 'top' | 'bottom' | 'center';

/**
 * Edge of the dock container where an unpinned panel strip can appear.
 * Bottom, left, and right are supported; top is not.
 */
export type DockEdge = 'left' | 'right' | 'top' | 'bottom';

/**
 * Position of the tab header bar within a tab group.
 */
export type HeaderPosition = 'top' | 'bottom' | 'left' | 'right';

/**
 * Configuration for a single panel in the dock manager.
 *
 * Panels are the atomic content units displayed inside tab groups,
 * floating windows, or unpinned strips.
 */
export interface PanelConfig {
  /** Unique identifier for this panel. */
  id: string;
  /** Display title shown in the tab header. */
  title: string;
  /** Optional icon key or URL rendered beside the title. */
  icon?: string;
  /** If true, prevents ALL user interactions with this pane (drag, close, resize, etc.) */
  disabled?: boolean;
  /** Whether the user can close this panel. Defaults to `true`. */
  closable?: boolean;
  /** Whether the user can float this panel into a separate window. Defaults to `true`. */
  floatable?: boolean;
  /** Whether other panels can be docked to this one. Defaults to `true`. */
  allowDocking?: boolean;
  /** Whether to show the maximize button in the tab group header. Defaults to `true`. */
  allowMaximize?: boolean;
  /** Whether to show the pin/unpin button. Defaults to `true`. */
  allowPinning?: boolean;
  /** If `true`, the panel is restricted to the document host area only. Defaults to `false`. */
  documentOnly?: boolean;
  /**
   * Whether this panel is currently maximized.
   * @deprecated Use `DockManagerState.maximizedPanelId` instead.
   */
  isMaximized?: boolean;
  /** Minimum size in pixels (applies to both width and height). */
  minimumSize?: number;
  /** Minimum width in pixels. */
  minimumWidth?: number;
  /** Maximum width in pixels. */
  maximumWidth?: number;
  /** Minimum height in pixels. */
  minimumHeight?: number;
  /** Maximum height in pixels. */
  maximumHeight?: number;
  /** Component key used to resolve the panel's content renderer. */
  content?: string;
  /** Component key used to resolve a custom tab renderer. */
  tabComponent?: string;
  /** Whether this floating panel can be resized. Defaults to true. */
  floatingResizable?: boolean;
  /** Whether this floating panel can be docked back into the layout. Defaults to `true`. */
  dockable?: boolean;

  // ── Widget dashboard fields ──────────────────────────────────────

  /**
   * Widget type identifier. Used by the consuming app's widget registry
   * to resolve which component to render in this panel.
   * @example `"chart"`, `"table"`, `"editor"`, `"route"`
   */
  widgetType?: string;

  /**
   * Widget-specific props/configuration. Passed to the component via PanelApi.
   * Must be JSON-serializable (no functions, no DOM refs).
   * @example `{ symbol: "AAPL", timeframe: "1D" }`
   */
  widgetProps?: Record<string, unknown>;

  /**
   * Badge text displayed after the panel title (e.g. notification count, unsaved dot).
   * Set via PanelApi.setBadge(). Persists across serialization.
   */
  badge?: string | null;

  /**
   * Whether this panel is hidden (invisible but not removed from layout).
   * Hidden panels don't render content but retain their position in the tree.
   */
  hidden?: boolean;
}

/**
 * A leaf node in the layout tree representing a tab group.
 *
 * A tab group displays one or more panels as tabs. Exactly one panel
 * is visible (the `activePanel`) at any time.
 */
export interface TabGroupNode {
  /** Discriminator for the layout node union. Always `'tabgroup'`. */
  type: 'tabgroup';
  /** Unique identifier for this tab group (e.g. `'tg_abc123'`). */
  id: string;
  /** Ordered list of panel IDs contained in this group. */
  panels: string[];
  /** The panel ID of the currently visible tab. */
  activePanel: string;
  /** Where to render the tab header bar. Defaults to `'top'` if omitted. */
  headerPosition?: HeaderPosition;
}

/**
 * A branch node in the layout tree representing a split container.
 *
 * A split node divides its space among two or more child nodes
 * (tab groups or nested splits) separated by draggable dividers.
 */
export interface SplitNode {
  /** Discriminator for the layout node union. Always `'split'`. */
  type: 'split';
  /** Unique identifier for this split (e.g. `'split_abc123'`). */
  id: string;
  /** Whether children are arranged horizontally or vertically. */
  direction: SplitDirection;
  /** Child layout nodes. Must have at least two entries. */
  children: LayoutNode[];
  /** Size of each child as a percentage. Must sum to 100. */
  sizes: number[];
}

/**
 * A node in the layout tree. Either a leaf {@link TabGroupNode} or
 * a branch {@link SplitNode}.
 */
export type LayoutNode = TabGroupNode | SplitNode;

/**
 * Describes a panel that has been detached from the layout tree
 * and is rendered as a draggable, resizable floating window.
 */
export interface FloatingPanel {
  /** The ID of the panel being floated. */
  panelId: string;
  /** Horizontal offset in pixels from the dock container's left edge. */
  x: number;
  /** Vertical offset in pixels from the dock container's top edge. */
  y: number;
  /** Width of the floating window in pixels. */
  width: number;
  /** Height of the floating window in pixels. */
  height: number;
  /** CSS z-index controlling stacking order among floating panels. */
  zIndex: number;
  /** The tab group ID this panel was in before being floated. Used to dock back to original location. */
  sourceTabGroupId?: string;
}

/**
 * Describes a panel rendered in a separate browser window (popout).
 */
export interface PopoutPanel {
  /** The ID of the panel shown in the popout window. */
  panelId: string;
  /** The `window.name` of the popout browser window. */
  windowName: string;
  /** Horizontal screen position of the popout window in pixels. */
  x: number;
  /** Vertical screen position of the popout window in pixels. */
  y: number;
  /** Width of the popout window in pixels. */
  width: number;
  /** Height of the popout window in pixels. */
  height: number;
}

/**
 * Describes a panel that has been unpinned from the layout and is
 * rendered as an auto-hide strip along a container edge.
 */
export interface UnpinnedPanel {
  /** The ID of the unpinned panel. */
  panelId: string;
  /** The edge of the dock container where the strip is rendered. */
  edge: DockEdge;
  /** Width (for left/right edges) or height (for bottom) in pixels when expanded. */
  size: number;
  /** The tab group ID the panel was removed from (used to restore on pin-back). */
  sourceTabGroupId?: string;
}

/**
 * Complete state of the dock manager.
 *
 * This is the single source of truth for layout, panel configuration,
 * floating windows, popouts, and unpinned strips. It is fully serializable
 * and can be persisted/restored via `LOAD_STATE`.
 *
 * @example
 * ```ts
 * const state: DockManagerState = createDefaultState();
 * ```
 */
export interface DockManagerState {
  /** The root of the layout tree describing docked panels. */
  layout: LayoutNode;
  /** Map of panel ID to its configuration. */
  panels: Record<string, PanelConfig>;
  /** Panels currently rendered as floating windows. */
  floatingPanels: FloatingPanel[];
  /** Panels currently rendered in separate browser windows. */
  popoutPanels: PopoutPanel[];
  /** Panels removed from the layout and shown as auto-hide strips. */
  unpinnedPanels: UnpinnedPanel[];
  /** Counter used to assign z-index values to floating panels. */
  nextZIndex: number;
  /** The panel ID that is currently focused (shown with an active indicator). */
  activePaneId: string;
  /** The panel ID currently displayed in maximized (full-container) mode, if any. */
  maximizedPanelId?: string;
}

/**
 * Data carried during a drag operation for a panel tab.
 */
export interface DragItem {
  /** The ID of the panel being dragged. */
  panelId: string;
  /** The tab group the panel originated from. */
  sourceTabGroupId: string;
}

/**
 * Describes a drop target region displayed during a drag operation.
 */
export interface DropZone {
  /** The tab group that would receive the dropped panel. */
  targetTabGroupId: string;
  /** Where the panel would be placed relative to the target group. */
  position: DockPosition;
  /** Bounding rectangle of the drop zone in viewport coordinates. */
  rect: DOMRect;
}

/**
 * Information about the currently active (focused) pane.
 */
export interface ActivePaneInfo {
  /** The active panel's ID. */
  panelId: string;
  /** The tab group containing the active panel. */
  tabGroupId: string;
}

/** Discriminated event type identifiers emitted by the dock manager. */
export type DockEventType =
  | 'paneClose'
  | 'paneDragStart'
  | 'paneDragOver'
  | 'paneDragEnd'
  | 'activePaneChanged'
  | 'splitterResizeStart'
  | 'splitterResizeEnd'
  | 'layoutChanged'
  | 'paneMaximized'
  | 'paneRestored'
  | 'willDrop'
  | 'willFocus'
  | 'willClose'
  | 'willMaximize';

/** Base dock manager event. */
export interface DockEvent {
  /** The event type identifier. */
  type: DockEventType;
  /** The panel associated with this event, if any. */
  panelId?: string;
  /** Whether the event was cancelled by a listener. */
  cancelled?: boolean;
}

/** An event that can be prevented from executing its default behavior */
export interface PreventableDockEvent extends DockEvent {
  defaultPrevented: boolean;
  preventDefault(): void;
}

/**
 * Create a {@link PreventableDockEvent} that listeners can cancel
 * by calling `event.preventDefault()`.
 *
 * @param type - The event type identifier.
 * @param panelId - Optional panel ID associated with the event.
 * @returns A new preventable event instance.
 */
export function createPreventableEvent(
  type: DockEventType,
  panelId?: string,
): PreventableDockEvent {
  const event: PreventableDockEvent = {
    type,
    panelId,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };
  return event;
}

/** Aggregated size constraints for a layout node, derived from its children. */
export interface LayoutConstraints {
  /** Minimum width in pixels. */
  minimumWidth?: number;
  /** Maximum width in pixels. */
  maximumWidth?: number;
  /** Minimum height in pixels. */
  minimumHeight?: number;
  /** Maximum height in pixels. */
  maximumHeight?: number;
}
