export type {
  SplitDirection, DockPosition, DockEdge, PanelConfig, TabGroupNode, SplitNode,
  LayoutNode, FloatingPanel, PopoutPanel, UnpinnedPanel, DockManagerState,
  PreventableDockEvent, HeaderPosition, LayoutConstraints, Placement,
} from './types/dock';
export { createPreventableEvent } from './types/dock';
export type { DockResourceStrings } from './types/resourceStrings';
export { defaultResourceStrings } from './types/resourceStrings';
export { dockReducer, createDefaultState, validateState } from './reducer/dockReducer';
export type { DockAction } from './reducer/dockReducer';
export { DockviewApi } from './api/DockviewApi';
export type { AddPanelOptions, FloatPanelOptions, MovePanelOptions } from './api/DockviewApi';
export { DockviewComponent } from './dom/DockviewComponent';
export type { DockviewComponentOptions, IDisposable } from './dom/DockviewComponent';
export { PanelApi } from './api/PanelApi';
export {
  findTabGroupForPanel, findFirstTabGroup, findTabGroupById, findAllTabGroups,
  collectAllPanelsOrdered, collectLayoutPanelIds, isPanelPlaced, countPanels,
  removePanel, insertInGroup, insertBySplit, insertAtEdge, movePanel,
  detectPanelEdge, findTabGroupByEdge,
} from './layout/LayoutTree';
export {
  serialize, serializeToObject, deserialize, saveToLocalStorage,
  loadFromLocalStorage, clearLocalStorage, exportToFile, importFromFile,
  exportAsUrl, importFromUrl, validateIntegrity,
} from './serialization/serializer';
export type { SerializedDockLayout } from './serialization/serializer';
export { EventEmitter } from './dom/EventEmitter';
export type { DockTheme, DockThemeColors } from './theme/DockTheme';
export {
  applyTheme, createTheme, themes,
  vsCodeLight, githubLight, warmLight, solarizedLight, sepiaLight, mintLight, lavenderLight,
  vsCodeDark, draculaDark, nordDark, solarizedDark, midnightDark, forestDark, slateDark,
  getThemeByName, getThemesByMode,
} from './theme/DockTheme';
export { KeyboardManager } from './dom/KeyboardManager';
export type { KeyboardManagerOptions } from './dom/KeyboardManager';
export { ContextMenuManager } from './dom/ContextMenuManager';
export type { ContextMenuManagerOptions } from './dom/ContextMenuManager';
export { PaneNavigator } from './dom/Overlays';
export type { PaneNavigatorOptions } from './dom/Overlays';
export { StateHistoryManager } from './dom/StateHistoryManager';
export { PanelFinder } from './dom/Overlays';
export type { PanelFinderOptions } from './dom/Overlays';
/** @internal */
export { LayoutTree, genId, resetIdCounter, syncIdCounter } from './layout/LayoutTree';
export { CompositeDisposable, MutableDisposable, toDisposable, listenEvent } from './utils/lifecycle';
export { setDockManagerDebug, isDockManagerDebugEnabled } from './utils/debug';
export { checkLayoutInvariants, findLostPanels, type InvariantViolation } from './layout/layoutInvariants';
