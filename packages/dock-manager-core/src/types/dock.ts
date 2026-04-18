export type SplitDirection = 'horizontal' | 'vertical';
export type DockPosition = 'left' | 'right' | 'top' | 'bottom' | 'center';
export type DockEdge = 'left' | 'right' | 'top' | 'bottom';
export type HeaderPosition = 'top' | 'bottom' | 'left' | 'right';

export interface PanelConfig {
  id: string;
  title: string;
  icon?: string;
  /** Prevents ALL user interactions (drag, close, resize, etc.) */
  disabled?: boolean;
  closable?: boolean;
  floatable?: boolean;
  allowDocking?: boolean;
  allowMaximize?: boolean;
  allowPinning?: boolean;
  /** Panel restricted to document host area only */
  documentOnly?: boolean;
  /** @deprecated Use `DockManagerState.maximizedPanelId` instead. */
  isMaximized?: boolean;
  minimumSize?: number;
  minimumWidth?: number;
  maximumWidth?: number;
  minimumHeight?: number;
  maximumHeight?: number;
  content?: string;
  tabComponent?: string;
  floatingResizable?: boolean;
  dockable?: boolean;
  /** Widget type for the consuming app's widget registry */
  widgetType?: string;
  /** Widget-specific props (must be JSON-serializable) */
  widgetProps?: Record<string, unknown>;
  badge?: string | null;
  /** Hidden panels don't render but retain position in the tree */
  hidden?: boolean;
}

export interface TabGroupNode {
  type: 'tabgroup';
  id: string;
  panels: string[];
  activePanel: string;
  headerPosition?: HeaderPosition;
  headerCollapsed?: boolean;
  /** Panels cannot be dragged out or dropped in; close buttons hidden */
  locked?: boolean;
}

export interface SplitNode {
  type: 'split';
  id: string;
  direction: SplitDirection;
  children: LayoutNode[];
  /** Size of each child as percentage (must sum to 100) */
  sizes: number[];
}

export type LayoutNode = TabGroupNode | SplitNode;

export type Placement =
  | { type: 'docked'; groupId: string }
  | { type: 'floating'; x: number; y: number; width: number; height: number; zIndex: number; sourceGroupId?: string }
  | { type: 'unpinned'; edge: DockEdge; size: number; sourceGroupId?: string }
  | { type: 'popout'; windowName: string; x: number; y: number; width: number; height: number };

export interface FloatingPanel {
  panelId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  sourceTabGroupId?: string;
}

export interface PopoutPanel {
  panelId: string;
  windowName: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UnpinnedPanel {
  panelId: string;
  edge: DockEdge;
  size: number;
  sourceTabGroupId?: string;
}

export interface DockManagerState {
  layout: LayoutNode;
  panels: Map<string, PanelConfig>;
  /** Every panel in `panels` must have a corresponding entry here */
  placements: Map<string, Placement>;
  activePaneId: string;
  nextZIndex: number;
  maximizedPanelId?: string;
}

export interface DragItem {
  panelId: string;
  sourceTabGroupId: string;
}

export interface DropZone {
  targetTabGroupId: string;
  position: DockPosition;
  rect: DOMRect;
}

export interface ActivePaneInfo {
  panelId: string;
  tabGroupId: string;
}

export type DockEventType =
  | 'paneClose' | 'paneDragStart' | 'paneDragOver' | 'paneDragEnd'
  | 'activePaneChanged' | 'splitterResizeStart' | 'splitterResizeEnd'
  | 'layoutChanged' | 'paneMaximized' | 'paneRestored'
  | 'willDrop' | 'willFocus' | 'willClose' | 'willMaximize';

export interface DockEvent {
  type: DockEventType;
  panelId?: string;
  cancelled?: boolean;
}

export interface PreventableDockEvent extends DockEvent {
  defaultPrevented: boolean;
  preventDefault(): void;
}

export function createPreventableEvent(type: DockEventType, panelId?: string): PreventableDockEvent {
  const event: PreventableDockEvent = {
    type, panelId, defaultPrevented: false,
    preventDefault() { event.defaultPrevented = true; },
  };
  return event;
}

export interface LayoutConstraints {
  minimumWidth?: number;
  maximumWidth?: number;
  minimumHeight?: number;
  maximumHeight?: number;
}
