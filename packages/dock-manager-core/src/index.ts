/**
 * @widgetstools/dock-manager-core
 *
 * Zero-dependency layout manager supporting tabs, splits, floating windows,
 * and unpinned panels. Framework-agnostic core with React and Angular wrappers.
 */

// ─── Types ────────────────────────────────────────────────────────────

export type {
  SplitDirection,
  DockPosition,
  DockEdge,
  PanelConfig,
  TabGroupNode,
  SplitNode,
  LayoutNode,
  FloatingPanel,
  PopoutPanel,
  UnpinnedPanel,
  DockManagerState,
  PreventableDockEvent,
  HeaderPosition,
  LayoutConstraints,
} from './types/dock';

export { createPreventableEvent } from './types/dock';

// ─── Resource Strings ──────────────────────────────────────────────────

export type { DockResourceStrings } from './types/resourceStrings';
export { defaultResourceStrings } from './types/resourceStrings';

// ─── Reducer & State ──────────────────────────────────────────────────

export { dockReducer, createDefaultState, validateState } from './reducer/dockReducer';
export type { DockAction } from './reducer/dockReducer';

// ─── API ──────────────────────────────────────────────────────────────

export { DockviewApi } from './api/DockviewApi';
export type { AddPanelOptions, FloatPanelOptions, MovePanelOptions } from './api/DockviewApi';

// ─── Component ────────────────────────────────────────────────────────

export { DockviewComponent } from './dom/DockviewComponent';
export type { DockviewComponentOptions, IDisposable } from './dom/DockviewComponent';

// ─── Panel API ────────────────────────────────────────────────────────

export { PanelApi } from './api/PanelApi';

// ─── Layout helpers (for advanced use) ────────────────────────────────

export {
  findTabGroupForPanel,
  findFirstTabGroup,
  findTabGroupById,
  findAllTabGroups,
  collectAllPanelsOrdered,
  collectLayoutPanelIds,
  isPanelPlaced,
  countPanels,
  removePanel,
  insertInGroup,
  insertBySplit,
  insertAtEdge,
  movePanel,
  detectPanelEdge,
  findTabGroupByEdge,
} from './layout/LayoutTree';

// ─── Serialization ────────────────────────────────────────────────────

export {
  serialize,
  deserialize,
  saveToLocalStorage,
  loadFromLocalStorage,
  clearLocalStorage,
  exportToFile,
  importFromFile,
  exportAsUrl,
  importFromUrl,
} from './serialization/serializer';
export type { SerializedDockLayout } from './serialization/serializer';

// ─── Event emitter (for custom event handling) ────────────────────────

export { EventEmitter } from './dom/EventEmitter';

// ─── Theming ──────────────────────────────────────────────────────────

export type { DockTheme, DockThemeColors } from './theme/DockTheme';
export {
  applyTheme,
  createTheme,
  themes,
  vsCodeLight, githubLight, warmLight, solarizedLight, sepiaLight, mintLight, lavenderLight,
  vsCodeDark, draculaDark, nordDark, solarizedDark, midnightDark, forestDark, slateDark,
  getThemeByName, getThemesByMode,
} from './theme/DockTheme';

// ─── Keyboard shortcuts ──────────────────────────────────────────────

export { KeyboardManager } from './dom/KeyboardManager';
export type { KeyboardManagerOptions } from './dom/KeyboardManager';

// ─── Context menu ────────────────────────────────────────────────────

export { ContextMenuManager } from './dom/ContextMenuManager';
export type { ContextMenuManagerOptions } from './dom/ContextMenuManager';

// ─── Pane Navigator ──────────────────────────────────────────────────

export { PaneNavigator } from './dom/PaneNavigator';
export type { PaneNavigatorOptions } from './dom/PaneNavigator';

// ─── State History Manager ──────────────────────────────────────────

export { StateHistoryManager } from './dom/StateHistoryManager';

// ─── Panel Finder ───────────────────────────────────────────────────

export { PanelFinder } from './dom/PanelFinder';
export type { PanelFinderOptions } from './dom/PanelFinder';

// ─── Internal (exported for testing and advanced customization) ───────
// These are used internally by DockviewComponent and are not part of
// the primary public API. Use DockviewApi for programmatic control.

/** @internal */
export { genId, resetIdCounter } from './layout/LayoutTree';

// ─── Lifecycle utilities ─────────────────────────────────────────────

export {
  CompositeDisposable,
  MutableDisposable,
  toDisposable,
  listenEvent,
} from './utils/lifecycle';

// ─── Debug logging gate ──────────────────────────────────────────────

export {
  setDockManagerDebug,
  isDockManagerDebugEnabled,
} from './utils/debug';

// ─── Layout invariant diagnostics ────────────────────────────────────

export {
  checkLayoutInvariants,
  findLostPanels,
  type InvariantViolation,
} from './layout/layoutInvariants';
