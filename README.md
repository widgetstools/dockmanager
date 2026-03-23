# @widgetstools/dock-manager

Zero-dependency layout manager for React and Angular. Tabbed panels, split panes, floating windows, auto-hide strips, drag-and-drop, theming, undo/redo, and full state serialization -- all in under 30 KB gzipped.

## Features at a Glance

| Category | Highlights |
|----------|-----------|
| **Layout** | Horizontal/vertical splits, tab groups, floating windows, unpinned auto-hide strips, popout windows, document host areas |
| **Drag & Drop** | Tab reorder, cross-group moves, float-by-drop, edge docking indicators, pane dock indicators, touch support (long-press) |
| **Panel Management** | Close, maximize/restore, pin/unpin, disable, hide, documentOnly restriction, size constraints |
| **Theming** | 14 built-in themes (7 light + 7 dark), scoped CSS custom properties, extend or create custom themes |
| **Keyboard Shortcuts** | Undo, redo, panel finder, close, navigate, maximize, dock-to-edge, pane navigator |
| **Context Menus** | Right-click tab operations (close, float, maximize, pin/unpin) |
| **Undo / Redo** | Full state history with Ctrl+Z / Ctrl+Shift+Z |
| **Serialization** | localStorage, JSON file export/import, clipboard, URL-safe base64 encoding |
| **PanelApi** | Per-panel runtime control: title, icon, badge, attention animation, hidden state, widget props |
| **Accessibility** | ARIA roles on tab groups and panels, keyboard navigation, focus indicators |
| **Developer Tools** | Debug overlay showing group IDs, panel IDs, and split ratios |
| **Mobile/Touch** | Long-press drag (300 ms), touch move/end handling |

---

## Quick Start

### React

```bash
npm install @widgetstools/react-dock-manager @widgetstools/dock-manager-core
```

```tsx
import { DockManagerCore } from '@widgetstools/react-dock-manager';
import { themes, createDefaultState } from '@widgetstools/dock-manager-core';

function App() {
  return (
    <DockManagerCore
      initialState={createDefaultState()}
      renderPanel={(panelId, panel, api) => <div>{panel.title}</div>}
      theme={themes.vsCodeLight}
      onStateChange={(state) => console.log('State changed')}
    />
  );
}
```

### Angular

```bash
npm install @widgetstools/angular-dock-manager @widgetstools/dock-manager-core
```

```typescript
import { Component } from '@angular/core';
import { DockManagerCoreComponent } from '@widgetstools/angular-dock-manager';
import type { DockManagerState, IDisposable } from '@widgetstools/dock-manager-core';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DockManagerCoreComponent],
  template: `
    <div style="width:100vw;height:100vh">
      <dock-manager-core
        [initialState]="state"
        [createContent]="createContent"
        [theme]="selectedTheme"
        (stateChange)="onStateChange($event)">
      </dock-manager-core>
    </div>
  `,
})
export class AppComponent {
  state: DockManagerState = { /* your layout state */ };
  selectedTheme = themes.vsCodeLight;

  createContent = (panelId: string, container: HTMLElement, api: any): IDisposable => {
    container.textContent = `Content for ${panelId}`;
    return { dispose: () => { container.innerHTML = ''; } };
  };

  onStateChange(state: DockManagerState) {
    this.state = state;
  }
}
```

---

## Features

### Layout System

The layout is a tree of **split nodes** and **tab group nodes**. Split nodes divide space horizontally or vertically among children. Tab group nodes display one or more panels as tabs.

- **Horizontal/vertical splits** with draggable splitters
- **Tab groups** with configurable header position (`top`, `bottom`, `left`, `right`)
- **Floating windows** -- draggable, resizable overlays with z-index stacking
- **Unpinned panels** -- auto-hide strips along the left, right, or bottom edge
- **Popout windows** -- separate browser windows
- **Document host** -- restrict panels to a specific area with `documentOnly: true`
- **Size constraints** -- `minimumWidth`, `maximumWidth`, `minimumHeight`, `maximumHeight` per panel

### Drag & Drop

All drag interactions use **event delegation** -- mark elements with `data-tab-id` and `data-dock-target` attributes. The core handles the full lifecycle:

- **Click** (< 5 px movement) selects the tab
- **Drag** (>= 5 px) activates ghost preview + dock indicators
- **Tab reorder** within a tab strip (detected automatically)
- **Cross-group docking** via pane indicators (center, left, right, top, bottom)
- **Edge docking** via root-level indicators at container edges
- **Float by dropping** outside any dock target
- **Touch support** via long-press (300 ms hold) to initiate drag
- **Preventable drops** via `onWillDrop` event
- **Escape** cancels any in-progress drag

### Panel Management

| PanelConfig Field | Type | Description |
|-------------------|------|-------------|
| `id` | `string` | Unique panel identifier |
| `title` | `string` | Tab header display text |
| `icon` | `string?` | Icon key or URL beside the title |
| `closable` | `boolean` | Whether the user can close this panel (default: `true`) |
| `floatable` | `boolean` | Whether the panel can be floated (default: `true`) |
| `disabled` | `boolean` | Prevents ALL user interactions (drag, close, resize) |
| `hidden` | `boolean` | Invisible but retains position in layout tree |
| `documentOnly` | `boolean` | Restricts panel to document host groups only |
| `allowDocking` | `boolean` | Whether other panels can dock to this one (default: `true`) |
| `allowMaximize` | `boolean` | Whether maximize button is shown (default: `true`) |
| `allowPinning` | `boolean` | Whether pin/unpin button is shown (default: `true`) |
| `minimumSize` | `number?` | Min size in pixels (both dimensions) |
| `minimumWidth` | `number?` | Min width in pixels |
| `maximumWidth` | `number?` | Max width in pixels |
| `minimumHeight` | `number?` | Min height in pixels |
| `maximumHeight` | `number?` | Max height in pixels |
| `widgetType` | `string?` | Widget registry key for content resolution |
| `widgetProps` | `Record?` | JSON-serializable widget configuration |
| `badge` | `string?` | Badge text shown after the title |
| `tabComponent` | `string?` | Custom tab renderer key |

### Keyboard Shortcuts

All shortcuts are platform-aware (Ctrl on Windows/Linux, Cmd on macOS). Shortcuts are suppressed inside text inputs.

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo last state change |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+P` | Open panel finder |
| `Ctrl+W` | Close active panel |
| `Ctrl+Tab` | Open pane navigator (next) |
| `Ctrl+Shift+Tab` | Pane navigator (previous) |
| `Ctrl+F6` | Next tab in current group |
| `Ctrl+Shift+F6` | Previous tab in current group |
| `Alt+F6` | Next pane (across groups) |
| `Alt+Shift+F6` | Previous pane (across groups) |
| `Alt+F7` | Open pane navigator |
| `Ctrl+Shift+Arrow` | Dock active panel to edge |
| `F11` | Toggle maximize |
| `Escape` | Restore maximized panel / dock floating panel |

### Context Menus

Right-click on any tab to access operations: close, float, maximize, pin/unpin, and more. The context menu is fully styled using CSS custom properties.

### Undo / Redo

The `StateHistoryManager` maintains a stack of state snapshots. Use `DockviewApi.undo()` and `DockviewApi.redo()` or the keyboard shortcuts.

### Layout Presets

Save and restore named layout presets programmatically:

```ts
const api = dockRef.current.getApi();
api.savePreset('my-workspace');
api.loadPreset(api.getPresets()[0]);
api.resetLayout(defaultState);
```

### Serialization

| Function | Description |
|----------|-------------|
| `saveToLocalStorage(state)` | Persist state to `localStorage` |
| `loadFromLocalStorage()` | Restore from `localStorage` |
| `clearLocalStorage()` | Remove saved state |
| `exportToFile(state)` | Download state as a `.json` file |
| `importFromFile()` | Upload and parse a `.json` file |
| `serialize(state)` | Convert state to a JSON string |
| `deserialize(json)` | Parse a JSON string back to state |
| `exportAsUrl(state)` | Encode state as base64 URL-safe string |
| `importFromUrl(encoded)` | Decode base64 string to state |

### Developer Tools

Enable debug mode to show an overlay with group IDs, panel IDs, and split ratios:

```ts
api.setDebugMode(true);
```

---

## API Reference

### DockviewApi

High-level programmatic API. Wraps the reducer with validated, documented methods.

#### State Queries

| Property / Method | Return Type | Description |
|-------------------|-------------|-------------|
| `state` | `DockManagerState` | Current state snapshot (read-only) |
| `activePanelId` | `string` | Currently focused panel ID |
| `maximizedPanelId` | `string?` | Currently maximized panel ID |
| `panelCount` | `number` | Total number of panels |
| `layout` | `LayoutNode` | The layout tree root |
| `getPanel(id)` | `PanelConfig?` | Get panel config by ID |
| `hasPanel(id)` | `boolean` | Check if a panel exists |
| `isPanelPlaced(id)` | `boolean` | Check if a panel is visible in the UI |
| `isFloating(id)` | `boolean` | Check if a panel is floating |
| `isActive(id)` | `boolean` | Check if a panel is the active pane |
| `isMaximized(id)` | `boolean` | Check if a panel is maximized |
| `getAllPanelIds()` | `string[]` | All registered panel IDs |
| `getLayoutPanelIds()` | `string[]` | Panel IDs in the docked layout (depth-first) |
| `getGroupForPanel(id)` | `string?` | Tab group containing the panel |
| `getGroup(id)` | `TabGroupNode?` | Get a tab group by ID |
| `getAllGroups()` | `TabGroupNode[]` | All tab groups |
| `getFloatingPanels()` | `FloatingPanel[]` | All floating panels |

#### Panel Operations

| Method | Description |
|--------|-------------|
| `addPanel(options)` | Add a new panel to the layout |
| `closePanel(panelId)` | Remove a panel entirely |
| `movePanel(options)` | Move a panel to a different group/position |
| `updatePanel(id, updates)` | Merge partial config updates |
| `setActivePanel(groupId, panelId)` | Switch the visible tab in a group |
| `setActivePane(panelId)` | Set the globally focused pane |
| `closeAllPanels()` | Remove all panels |

#### Floating Operations

| Method | Description |
|--------|-------------|
| `floatPanel(options)` | Detach a panel into a floating window |
| `dockFloatingPanel(id, targetGroupId?, position?)` | Dock a floating panel back |
| `updateFloatingPanel(id, updates)` | Update floating position/size |
| `bringToFront(id)` | Assign highest z-index |
| `dockAllFloating()` | Dock all floating panels back |

#### Maximize / Restore

| Method | Description |
|--------|-------------|
| `maximizePanel(id)` | Fill container with a panel |
| `restorePanel()` | Restore the maximized panel |
| `toggleMaximize(id)` | Toggle maximize state |

#### Pin / Unpin

| Method | Description |
|--------|-------------|
| `unpinPanel(id)` | Collapse panel to auto-hide strip |
| `pinPanel(id)` | Restore unpinned panel to layout |

#### Navigation

| Method | Description |
|--------|-------------|
| `navigateNext()` | Move focus to the next panel |
| `navigatePrevious()` | Move focus to the previous panel |

#### Layout

| Method | Description |
|--------|-------------|
| `resizeSplit(splitId, sizes)` | Resize split children (sizes must sum to 100) |
| `setHeaderPosition(groupId, position)` | Set tab bar position (`top`/`bottom`/`left`/`right`) |

#### State Management

| Method | Description |
|--------|-------------|
| `loadState(state)` | Replace the entire state |
| `resetLayout(defaultState)` | Reset to a default state |
| `savePreset(name)` | Save current state as a named preset |
| `loadPreset(preset)` | Restore a saved preset |
| `getPresets()` | Get all saved presets |
| `undo()` | Undo last state change |
| `redo()` | Redo previously undone change |
| `exportAsUrl()` | Encode state as base64 string |
| `importFromUrl(encoded)` | Decode and load base64 state |

#### Developer Experience

| Method | Description |
|--------|-------------|
| `setDebugMode(enabled)` | Toggle debug overlay |
| `debugMode` | Whether debug mode is on |

### PanelApi

Per-panel API passed to every widget. Allows widgets to control their own tab header at runtime.

| Property / Method | Description |
|-------------------|-------------|
| `panelId` | Panel identity (read-only) |
| `widgetType` | Widget type string |
| `widgetProps` | Widget props object |
| `getTitle()` | Get current title |
| `setTitle(title)` | Update tab header text |
| `setIcon(icon)` | Set tab icon (prefix before title) |
| `setBadge(badge)` | Set badge text (e.g. `"3"`, `"!"`) or `null` to clear |
| `setAttention(attention)` | Trigger/clear CSS pulse animation on tab |
| `setHidden(hidden)` | Hide panel without removing from layout |
| `isHidden` | Whether the panel is hidden |
| `updateProps(props)` | Merge partial widget props into state |
| `isVisible` | Whether panel content is currently visible |
| `onDidDispose(callback)` | Register cleanup callback for panel close |
| `onDidChangeVisibility(callback)` | Listen for visibility changes |

---

## Theming

### Built-in Themes

#### Light Themes

| Key | Name | Accent |
|-----|------|--------|
| `vsCodeLight` | VS Code Light | Blue |
| `githubLight` | GitHub Light | Blue |
| `warmLight` | Warm Light | Amber |
| `solarizedLight` | Solarized Light | Teal |
| `sepiaLight` | Sepia | Brown |
| `mintLight` | Mint | Green |
| `lavenderLight` | Lavender | Purple |

#### Dark Themes

| Key | Name | Accent |
|-----|------|--------|
| `vsCodeDark` | VS Code Dark | Blue |
| `draculaDark` | Dracula Dark | Purple |
| `nordDark` | Nord Dark | Cyan |
| `solarizedDark` | Solarized Dark | Teal |
| `midnightDark` | Midnight Blue | Blue |
| `forestDark` | Forest Dark | Emerald |
| `slateDark` | Slate Dark | Steel blue |

### Custom Themes

```ts
import { themes, type DockTheme } from '@widgetstools/dock-manager-core';

// Extend a built-in theme
const myTheme: DockTheme = {
  ...themes.vsCodeDark,
  name: 'My Custom Dark',
  colors: { ...themes.vsCodeDark.colors, primary: '340 80% 55%' },
};

// Or create from scratch
const brandTheme: DockTheme = {
  name: 'Brand',
  mode: 'light',
  colors: {
    bg: '0 0% 98%',
    surface: '0 0% 100%',
    surfaceAlt: '0 0% 96%',
    panelHeader: '0 0% 94%',
    tabBar: '0 0% 95%',
    tabActive: '0 0% 100%',
    tabText: '0 0% 40%',
    tabTextActive: '210 100% 50%',
    text: '0 0% 10%',
    textSecondary: '0 0% 35%',
    textMuted: '0 0% 55%',
    border: '0 0% 85%',
    splitter: '0 0% 88%',
    splitterHover: '210 100% 60%',
    hover: '0 0% 94%',
    primary: '210 100% 50%',
    floatShadow: '0 0% 0%',
  },
};
```

Theme color values use HSL components (`hue saturation% lightness%`) without the `hsl()` wrapper. The CSS applies them as `hsl(var(--dock-primary))`.

### Helper Functions

| Function | Description |
|----------|-------------|
| `applyTheme(container, theme)` | Apply theme as CSS custom properties on an element |
| `getThemeByName(name)` | Look up a built-in theme by display name |
| `getThemesByMode(mode)` | Get all themes for `'light'` or `'dark'` |

---

## CSS Custom Properties

All visual properties are controlled via CSS custom properties scoped to the dock container. Override these for fine-grained control.

| Variable | Description |
|----------|-------------|
| `--dock-bg` | Main background |
| `--dock-surface` | Panel content surface |
| `--dock-surface-alt` | Alternate surface (sidebars) |
| `--dock-panel-header` | Panel header / tab bar background |
| `--dock-tab-bar` | Tab bar background |
| `--dock-tab-active` | Active/selected tab background |
| `--dock-tab-text` | Unselected tab text color |
| `--dock-tab-text-active` | Active tab text color |
| `--dock-text` | Primary content text |
| `--dock-text-secondary` | Secondary text (labels) |
| `--dock-text-muted` | Muted text (placeholders) |
| `--dock-border` | Border color for panels, tabs, splitters |
| `--dock-splitter` | Splitter bar color |
| `--dock-splitter-hover` | Splitter bar hover color |
| `--dock-hover` | Hover state background |
| `--dock-primary` | Primary accent color |
| `--dock-float-shadow` | Floating window shadow color |
| `--dock-unpinned-bg` | Unpinned strip background |
| `--dock-maximize-overlay-bg` | Maximize overlay background |
| `--dock-tab-overflow-bg` | Tab overflow dropdown background |
| `--dock-tab-overflow-hover` | Tab overflow item hover |
| `--dock-scrollbar-thumb` | Scrollbar thumb color |
| `--dock-scrollbar-track` | Scrollbar track color |
| `--dock-scrollbar-width` | Scrollbar width |

---

## Configuration

### DockManagerState

The single source of truth for the entire dock layout. Fully JSON-serializable.

| Field | Type | Description |
|-------|------|-------------|
| `layout` | `LayoutNode` | Root of the layout tree (split or tab group) |
| `panels` | `Record<string, PanelConfig>` | All panel configurations keyed by ID |
| `floatingPanels` | `FloatingPanel[]` | Panels rendered as floating windows |
| `popoutPanels` | `PopoutPanel[]` | Panels in separate browser windows |
| `unpinnedPanels` | `UnpinnedPanel[]` | Panels collapsed to auto-hide strips |
| `nextZIndex` | `number` | Counter for floating panel z-index |
| `activePaneId` | `string` | Currently focused panel ID |
| `maximizedPanelId` | `string?` | Maximized panel ID, if any |

### Layout Tree Nodes

**TabGroupNode** (leaf):
| Field | Type | Description |
|-------|------|-------------|
| `type` | `'tabgroup'` | Node discriminator |
| `id` | `string` | Unique group ID |
| `panels` | `string[]` | Ordered panel IDs |
| `activePanel` | `string` | Currently visible tab |
| `headerPosition` | `HeaderPosition?` | Tab bar position (`top`/`bottom`/`left`/`right`) |

**SplitNode** (branch):
| Field | Type | Description |
|-------|------|-------------|
| `type` | `'split'` | Node discriminator |
| `id` | `string` | Unique split ID |
| `direction` | `SplitDirection` | `'horizontal'` or `'vertical'` |
| `children` | `LayoutNode[]` | Child nodes (min 2) |
| `sizes` | `number[]` | Percentage sizes (must sum to 100) |

---

## Reducer Actions

All state mutations go through the reducer. Use `DockviewApi` for a typed wrapper, or dispatch raw actions.

| Action Type | Description |
|-------------|-------------|
| `ADD_PANEL` | Register a new panel and add to first tab group |
| `CLOSE_PANEL` | Remove a panel from layout and registry |
| `MOVE_PANEL` | Move a panel to a target group/position |
| `UPDATE_PANEL_CONFIG` | Merge partial updates into panel config |
| `FLOAT_PANEL` | Detach a panel into a floating window |
| `DOCK_FLOATING` | Dock a floating panel back into layout |
| `UPDATE_FLOATING` | Update floating panel position/size |
| `BRING_TO_FRONT` | Assign highest z-index to a floating panel |
| `UNPIN_PANEL` | Collapse a panel to an auto-hide strip |
| `PIN_PANEL` | Restore an unpinned panel to the layout |
| `POPOUT_PANEL` | Move a panel to a separate browser window |
| `DOCK_POPOUT` | Return a popout panel to the layout |
| `UPDATE_POPOUT` | Update popout window position/size |
| `SET_ACTIVE_PANEL` | Switch the visible tab in a group |
| `SET_ACTIVE_PANE` | Set the globally focused pane |
| `MAXIMIZE_PANEL` | Expand a panel to fill the container |
| `RESTORE_PANEL` | Restore the maximized panel |
| `RESIZE_SPLIT` | Resize split node children |
| `SET_HEADER_POSITION` | Change tab bar position for a group |
| `NAVIGATE` | Move focus to next/previous panel |
| `DOCK_TO_EDGE` | Dock a panel to a root-level edge |
| `REORDER_TABS` | Reorder tabs within a group |
| `ACTIVATE_OVERFLOW_TAB` | Activate a tab from the overflow menu |
| `LOAD_STATE` | Replace the entire state |

---

## Architecture

```
@widgetstools/dock-manager-core    (zero dependencies, owns the DOM)
    |
    +-- @widgetstools/react-dock-manager      (thin React wrapper)
    +-- @widgetstools/angular-dock-manager    (thin Angular wrapper)
```

The **core package** contains:
- Pure reducer for immutable state management
- Layout tree operations (insert, remove, move, split)
- DOM renderer (`DockviewComponent`) that owns the entire DOM tree
- Drag manager with event delegation and dock indicators
- Keyboard manager with comprehensive shortcut handling
- Theme system with scoped CSS custom properties
- Context menu, pane navigator, panel finder, and debug overlay
- Serialization utilities for persistence

**Framework packages** are thin wrappers that:
- Mount the core `DockviewComponent` in a framework-managed element
- Bridge framework lifecycle to core lifecycle (mount, update, dispose)
- Provide framework-idiomatic APIs (React hooks, Angular inputs/outputs)
- Delegate all rendering to the core via callbacks (`renderPanel` / `createContent`)

---

## Browser Support

- Chrome / Edge 90+
- Firefox 90+
- Safari 15+
- Touch devices (iOS Safari, Android Chrome)

---

## Contributing

1. Clone the repository
2. `npm install` (or `yarn`)
3. `npm run build` to build all packages
4. `npm test` to run the test suite

---

## License

MIT
