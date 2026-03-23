// Core-owned DOM architecture
export * from './lib/components/dock-manager-core/dock-manager-core.component';

// Services
export * from './lib/services/dock-theme.service';

// Re-export core types and utilities for convenience
export {
  DockviewComponent, DockviewApi, EventEmitter,
  dockReducer, createDefaultState, validateState,
  findTabGroupForPanel, findFirstTabGroup, findTabGroupById, findAllTabGroups,
  serialize, deserialize, saveToLocalStorage, loadFromLocalStorage, clearLocalStorage, exportToFile, importFromFile,
  themes, vsCodeLight, githubLight, warmLight, solarizedLight, sepiaLight, mintLight, lavenderLight,
  vsCodeDark, draculaDark, nordDark, solarizedDark, midnightDark, forestDark, slateDark,
  getThemeByName, getThemesByMode,
} from '@widgetstools/dock-manager-core';
export type {
  DockviewComponentOptions, IDisposable, DockAction,
  AddPanelOptions, FloatPanelOptions, MovePanelOptions,
  SplitDirection, DockPosition, DockEdge, PanelConfig, TabGroupNode,
  SplitNode, LayoutNode, FloatingPanel, PopoutPanel, UnpinnedPanel,
  DockManagerState, PreventableDockEvent, HeaderPosition,
  DockTheme, DockThemeColors,
} from '@widgetstools/dock-manager-core';
