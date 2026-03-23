// Types (re-export from core for convenience)
export type {
  SplitDirection, DockPosition, DockEdge, PanelConfig, TabGroupNode,
  SplitNode, LayoutNode, FloatingPanel, PopoutPanel, UnpinnedPanel,
  DockManagerState, PreventableDockEvent, HeaderPosition,
} from '@widgetstools/dock-manager-core';

// Core re-exports
export {
  dockReducer, createDefaultState, validateState,
  findTabGroupForPanel, findFirstTabGroup, findTabGroupById, findAllTabGroups,
  serialize, deserialize, saveToLocalStorage, loadFromLocalStorage, clearLocalStorage, exportToFile, importFromFile,
  DockviewComponent, DockviewApi, EventEmitter,
  createTheme, themes, vsCodeLight, githubLight, warmLight, solarizedLight, sepiaLight, mintLight, lavenderLight,
  vsCodeDark, draculaDark, nordDark, solarizedDark, midnightDark, forestDark, slateDark,
  getThemeByName, getThemesByMode,
} from '@widgetstools/dock-manager-core';
export type { DockAction, DockviewComponentOptions, IDisposable, AddPanelOptions, FloatPanelOptions, MovePanelOptions, DockTheme, DockThemeColors, DockResourceStrings } from '@widgetstools/dock-manager-core';

// React wrapper
export { DockManagerCore } from './components/dock/DockManagerCore';
export type { DockManagerCoreProps, DockManagerCoreHandle, WidgetProps } from './components/dock/DockManagerCore';

// React hooks
export { useTheme } from './hooks/useTheme';
