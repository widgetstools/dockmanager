# Dock Manager Documentation

A zero-dependency layout manager supporting tabs, splits, floating windows, and auto-hide panels. Works with React 18/19 and Angular 21+.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture](#architecture)
3. [React Guide](#react-guide)
4. [Angular Guide](#angular-guide)
5. [Layout Configuration](#layout-configuration)
6. [Panel Configuration](#panel-configuration)
7. [DockviewApi Reference](#dockviewapi-reference)
8. [PanelApi Reference](#panelapi-reference)
9. [Theming](#theming)
10. [Serialization](#serialization)
11. [Drag & Drop](#drag--drop)
12. [Floating Windows](#floating-windows)
13. [Pin / Unpin (Auto-Hide)](#pin--unpin-auto-hide)
14. [Maximize / Restore](#maximize--restore)
15. [Tab Context Menu](#tab-context-menu)
16. [Keyboard Navigation](#keyboard-navigation)
17. [Widget Registry Pattern](#widget-registry-pattern)
18. [Advanced: Custom Tabs](#advanced-custom-tabs)
19. [Advanced: Header Actions](#advanced-header-actions)
20. [Type Reference](#type-reference)

---

## Quick Start

### Install

```bash
# React
npm install @widgetstools/dock-manager-core @widgetstools/react-dock-manager

# Angular
npm install @widgetstools/dock-manager-core @widgetstools/angular-dock-manager

# Development (clone the monorepo)
git clone https://github.com/widgetstools/dockmanager.git
cd dockmanager
npm run setup    # installs deps + builds all packages and demo apps
npm run dev      # start React demo
npm run dev:angular  # start Angular demo
```

### Import CSS

The dock manager requires its CSS for layout and theming. Import it once in your app entry point:

```tsx
// React (in App.tsx or index.tsx)
import '@widgetstools/dock-manager-core/styles.css';

// Angular (in styles.css or angular.json)
@import '@widgetstools/dock-manager-core/styles.css';
```

### Minimal React Example

```tsx
import { useState } from 'react';
import { DockManagerCore } from '@widgetstools/react-dock-manager';
import type { WidgetProps } from '@widgetstools/react-dock-manager';
import '@widgetstools/dock-manager-core/styles.css';
import type { DockManagerState, DockviewApi } from '@widgetstools/dock-manager-core';

// Widget components receive { panelId, panel, api } via WidgetProps
function HelloWidget({ panelId, panel, api }: WidgetProps) {
  // api.setTitle(), api.setBadge(), api.onDidDispose(), etc.
  return <div>Content for {panel.title}</div>;
}

const initialState: DockManagerState = {
  panels: {
    panel1: { id: 'panel1', title: 'Hello', closable: true, floatable: true, widgetType: 'hello' },
    panel2: { id: 'panel2', title: 'World', closable: true, floatable: true, widgetType: 'hello' },
  },
  layout: {
    type: 'tabgroup',
    id: 'tg1',
    panels: ['panel1', 'panel2'],
    activePanel: 'panel1',
  },
  floatingPanels: [],
  popoutPanels: [],
  unpinnedPanels: [],
  nextZIndex: 1,
  activePaneId: 'panel1',
};

function App() {
  const [api, setApi] = useState<DockviewApi | null>(null);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <DockManagerCore
        initialState={initialState}
        widgets={{ hello: HelloWidget }}
        onReady={setApi}
      />
    </div>
  );
}
```

### Minimal Angular Example

```typescript
// app.component.ts
import { Component } from '@angular/core';
import { DockManagerCoreComponent } from '@widgetstools/angular-dock-manager';
import type { DockManagerState, DockviewApi } from '@widgetstools/dock-manager-core';
// Also add to styles.css or angular.json: @import '@widgetstools/dock-manager-core/styles.css';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DockManagerCoreComponent],
  template: `
    <div style="width:100vw;height:100vh">
      <dock-manager-core
        [initialState]="state"
        [widgets]="widgets"
        (ready)="onReady($event)">
      </dock-manager-core>
    </div>
  `,
})
export class AppComponent {
  api: DockviewApi | null = null;

  // Widget registry — maps widgetType to Angular component classes
  // Each widget component should accept 'api' and 'panel' @Input() properties
  widgets = { hello: HelloWidgetComponent };

  state: DockManagerState = {
    panels: {
      panel1: { id: 'panel1', title: 'Hello', closable: true, floatable: true, widgetType: 'hello' },
      panel2: { id: 'panel2', title: 'World', closable: true, floatable: true, widgetType: 'hello' },
    },
    layout: {
      type: 'tabgroup',
      id: 'tg1',
      panels: ['panel1', 'panel2'],
      activePanel: 'panel1',
    },
    floatingPanels: [],
    popoutPanels: [],
    unpinnedPanels: [],
    nextZIndex: 1,
    activePaneId: 'panel1',
  };

  onReady(api: DockviewApi) { this.api = api; }
}
```

---

## Architecture

```
dock-manager-core (zero dependencies)
  ├── DockviewComponent    → creates ALL DOM, handles ALL events
  ├── DockviewApi          → high-level programmatic control
  ├── PanelApi             → per-panel widget-to-header communication
  ├── dockReducer          → immutable state management
  ├── LayoutTree           → tree operations (insert, remove, split)
  ├── DockDragManager      → drag & drop with dock indicators
  ├── Themes               → 14 built-in themes
  └── Serialization        → save/load/export/import

react-dock-manager (~200 lines)
  └── DockManagerCore      → thin wrapper using React portals

angular-dock-manager (~150 lines)
  └── DockManagerCoreComponent → thin wrapper using createComponent()
```

**Core owns all DOM and events.** React and Angular are thin wrappers that only provide panel content rendering. This ensures both frameworks produce identical behavior.

---

## React Guide

### Props

```tsx
interface DockManagerCoreProps {
  /** Initial layout state */
  initialState: DockManagerState;

  /** Widget registry — maps panel.widgetType to React components.
   *  Each component receives { panelId, panel, api } props (WidgetProps). */
  widgets?: Record<string, React.ComponentType<WidgetProps>>;

  /** Fallback panel renderer. Used when widgets registry doesn't match.
   *  If both widgets and renderPanel are provided, registry is tried first. */
  renderPanel?: (panelId: string, panel: PanelConfig, api: PanelApi) => React.ReactNode;

  /** Optional custom tab renderer */
  renderTab?: (panelId: string, panel: PanelConfig, isActive: boolean) => React.ReactNode;

  /** Optional header action slots */
  renderHeaderActions?: (slot: 'left' | 'right' | 'prefix', tabGroupId: string) => React.ReactNode;

  /** Called with the DockviewApi when the component is ready.
   *  Simplest way to access the API — replaces the ref pattern. */
  onReady?: (api: DockviewApi) => void;

  /** Called when state changes (drag, close, resize, etc.) */
  onStateChange?: (state: DockManagerState) => void;

  /** Called before a panel is closed (preventable) */
  onWillClose?: (event: PreventableDockEvent, panelId: string) => void;

  /** Called before a drop (preventable) */
  onWillDrop?: (event: PreventableDockEvent, sourceId: string, targetId: string, position: DockPosition) => void;

  /** Theme: 'light', 'dark', or a DockTheme object */
  theme?: 'light' | 'dark' | DockTheme;

  /** Whether to show edge dock indicators. Defaults to true. */
  allowRootDock?: boolean;

  /** Additional className for root container */
  className?: string;
}
```

### API Access via onReady (recommended)

```tsx
const [api, setApi] = useState<DockviewApi | null>(null);

<DockManagerCore onReady={setApi} ... />

// Then use api directly:
api?.addPanel({ panelId: 'new', title: 'New Panel', widgetType: 'chart' });
api?.undo();
api?.loadState(newState);
```

### Ref Handle (DockManagerCoreHandle) — alternative

```tsx
const dockRef = useRef<DockManagerCoreHandle>(null);

// Available methods on ref:
dockRef.current.dispatch(action);     // Dispatch a DockAction
dockRef.current.getState();           // Get current state
dockRef.current.getInstance();        // Get DockviewComponent instance
dockRef.current.getApi();             // Get DockviewApi for high-level control
```

### Preventable Close

```tsx
<DockManagerCore
  onWillClose={(event, panelId) => {
    if (hasUnsavedChanges(panelId)) {
      const confirmed = window.confirm('Discard changes?');
      if (!confirmed) event.preventDefault();
    }
  }}
/>
```

---

## Angular Guide

### Inputs & Outputs

```typescript
// Inputs
@Input() initialState: DockManagerState;          // Required
@Input() widgets?: Record<string, Type<any>>;     // Widget registry (maps widgetType → component class)
@Input() createContent?: ContentRenderer;          // Fallback content renderer (optional if widgets is provided)
@Input() createTab?: TabRenderer;                  // Custom tab renderer
@Input() createHeaderActions?: HeaderActionsRenderer;
@Input() theme?: 'light' | 'dark' | DockTheme;
@Input() allowRootDock?: boolean;

// Outputs
@Output() ready = new EventEmitter<DockviewApi>();          // Emits API on init
@Output() stateChange = new EventEmitter<DockManagerState>();
@Output() willClose = new EventEmitter<{ event: PreventableDockEvent; panelId: string }>();
@Output() willDrop = new EventEmitter<{ event: PreventableDockEvent; sourceId: string; targetId: string; position: DockPosition }>();
```

### Widget Registry (recommended)

The simplest way to render panels — pass a widget registry and the wrapper handles `createComponent()` automatically:

```typescript
// Widget components should accept 'api' and 'panel' @Input() properties
widgets = {
  'chart': ChartWidgetComponent,
  'table': TableWidgetComponent,
};

// Template
<dock-manager-core [initialState]="state" [widgets]="widgets" (ready)="onReady($event)">
</dock-manager-core>
```

### API Access via (ready) output (recommended)

```typescript
api: DockviewApi | null = null;

onReady(api: DockviewApi) { this.api = api; }

addPanel() { this.api?.addPanel({ panelId: 'new1', title: 'New Panel', widgetType: 'chart' }); }
```

### ViewChild — alternative

```typescript
@ViewChild(DockManagerCoreComponent) dockCore?: DockManagerCoreComponent;

addPanel(): void {
  this.dockCore?.getApi()?.addPanel({ panelId: 'new1', title: 'New Panel' });
}
```

---

## Layout Configuration

The layout is a tree of `TabGroupNode` (leaves) and `SplitNode` (branches).

### Simple: One Tab Group

```typescript
const state: DockManagerState = {
  panels: {
    p1: { id: 'p1', title: 'Panel 1' },
    p2: { id: 'p2', title: 'Panel 2' },
  },
  layout: {
    type: 'tabgroup',
    id: 'tg1',
    panels: ['p1', 'p2'],
    activePanel: 'p1',
  },
  floatingPanels: [],
  popoutPanels: [],
  unpinnedPanels: [],
  nextZIndex: 1,
  activePaneId: 'p1',
};
```

### IDE-Style Layout (Left + Center + Bottom + Right)

```typescript
layout: {
  type: 'split',
  id: 'root',
  direction: 'horizontal',
  sizes: [20, 60, 20],
  children: [
    // Left sidebar
    { type: 'tabgroup', id: 'tg_left', panels: ['explorer'], activePanel: 'explorer' },
    // Center + Bottom
    {
      type: 'split',
      id: 'center_split',
      direction: 'vertical',
      sizes: [70, 30],
      children: [
        { type: 'tabgroup', id: 'tg_center', panels: ['doc1', 'doc2'], activePanel: 'doc1' },
        {
          type: 'tabgroup', id: 'tg_bottom',
          panels: ['terminal', 'problems'],
          activePanel: 'terminal',
          headerPosition: 'bottom',  // tabs at bottom like VS Code
        },
      ],
    },
    // Right sidebar
    { type: 'tabgroup', id: 'tg_right', panels: ['outline'], activePanel: 'outline' },
  ],
}
```

### Floating Panels

```typescript
floatingPanels: [
  { panelId: 'notes', x: 300, y: 200, width: 280, height: 200, zIndex: 1 },
],
```

### Unpinned (Auto-Hide) Panels

```typescript
unpinnedPanels: [
  { panelId: 'debug', edge: 'bottom', size: 180 },
  { panelId: 'chat', edge: 'right', size: 250 },
],
```

---

## Panel Configuration

```typescript
interface PanelConfig {
  id: string;                    // Unique identifier
  title: string;                 // Tab header text
  icon?: string;                 // Icon key (app-defined)
  closable?: boolean;            // Show close button (default: true)
  floatable?: boolean;           // Allow floating (default: true)
  allowDocking?: boolean;        // Allow drop targets (default: true)
  allowMaximize?: boolean;       // Show maximize button (default: true)
  allowPinning?: boolean;        // Show pin button (default: true)
  widgetType?: string;           // Widget registry key (e.g. 'chart')
  widgetProps?: Record<string, unknown>;  // Widget-specific data
  badge?: string | null;         // Tab badge text (e.g. '3', '!')
  hidden?: boolean;              // Hidden but not removed
  minimumWidth?: number;         // Min width in px
  maximumWidth?: number;         // Max width in px
  minimumHeight?: number;        // Min height in px
  maximumHeight?: number;        // Max height in px
  tabComponent?: string;         // Custom tab renderer key
  content?: string;              // Content renderer key
}
```

---

## DockviewApi Reference

Get the API via `onReady` (React) or `(ready)` output (Angular):

```tsx
// React (recommended)
const [api, setApi] = useState<DockviewApi | null>(null);
<DockManagerCore onReady={setApi} ... />

// Angular (recommended)
api: DockviewApi | null = null;
<dock-manager-core (ready)="api = $event" ...></dock-manager-core>
```

### Panel Operations

```typescript
// Add a panel to the first available tab group
api.addPanel({
  panelId: 'new_panel',
  title: 'New Panel',
  widgetType: 'chart',
  widgetProps: { symbol: 'AAPL' },
  icon: 'chart',
});

// Close a panel
api.closePanel('panel_id');

// Move a panel to a specific tab group
api.movePanel({ panelId: 'p1', targetTabGroupId: 'tg_center', position: 'center' });

// Float a panel
api.floatPanel({ panelId: 'p1', x: 100, y: 100, width: 400, height: 300 });

// Dock a floating panel back
api.dockPanel('floating_panel_id');

// Update panel config at runtime
api.updatePanel('panel_id', { title: 'New Title', badge: '!' });
```

### Query Methods

```typescript
api.getPanel('panel_id')         // Get panel config or undefined
api.hasPanel('panel_id')         // Check existence
api.isPanelPlaced('panel_id')    // Check if visible (docked/floating)
api.isFloating('panel_id')       // Check if floating
api.isActive('panel_id')         // Check if globally active
api.isMaximized('panel_id')      // Check if maximized
api.getGroupForPanel('panel_id') // Get parent tab group ID
api.getGroup('tg_id')            // Get tab group node
api.getAllGroups()                // All tab group IDs
api.getFloatingPanels()          // All floating panels
api.getLayoutPanelIds()          // Panel IDs in docked layout
api.getAllPanelIds()              // All panel IDs everywhere
api.panelCount                   // Total panel count
api.activePanelId                // Currently active panel
api.maximizedPanelId             // Currently maximized panel
api.state                        // Full DockManagerState
api.layout                       // Layout tree
```

### Navigation

```typescript
api.navigateNext()               // Activate next panel (Ctrl+Tab)
api.navigatePrevious()           // Activate previous panel (Ctrl+Shift+Tab)
api.setActivePanel('tg1', 'p1')  // Switch active tab in a group
api.setActivePane('p1')          // Set global focus
```

### Maximize

```typescript
api.maximizePanel('panel_id')    // Maximize
api.restorePanel()               // Restore from maximize
```

---

## PanelApi Reference

Each panel receives a `PanelApi` instance via `renderPanel` (React) or `createContent` (Angular).

### Header Manipulation

```typescript
// React
renderPanel={(panelId, panel, api) => {
  // Dynamic title (updates tab header in real time)
  api.setTitle('Loading...');
  setTimeout(() => api.setTitle('Data loaded'), 2000);

  // Icon
  api.setIcon('chart');

  // Badge (notification count, unsaved indicator)
  api.setBadge('3');
  api.setBadge(null);  // clear

  // Attention (CSS pulse animation on tab)
  api.setAttention(true);
  setTimeout(() => api.setAttention(false), 3000);

  // Hide without removing
  api.setHidden(true);

  // Read current state
  api.getTitle();          // current title
  api.widgetType;          // widget type string
  api.widgetProps;         // widget props object
  api.isVisible;           // is content visible
  api.isHidden;            // is hidden

  return <MyWidget />;
}}
```

### Widget Props

```typescript
// Update widget-specific data (merges with existing)
api.updateProps({ symbol: 'GOOGL', timeframe: '1W' });
```

### Lifecycle

```typescript
// Cleanup when panel is closed
api.onDidDispose(() => {
  clearInterval(timer);
  subscription.unsubscribe();
});

// React to visibility changes (tab switch)
api.onDidChangeVisibility((visible) => {
  if (visible) refreshData();
});
```

---

## Theming

### 14 Built-in Themes

**Light themes:** VS Code Light, GitHub Light, Warm Light, Solarized Light, Sepia, Mint, Lavender

**Dark themes:** VS Code Dark, Dracula Dark, Nord Dark, Solarized Dark, Midnight Blue, Forest Dark, Slate Dark

### Usage

```tsx
import { themes } from '@widgetstools/dock-manager-core';

// React
<DockManagerCore theme={themes.draculaDark} />

// Angular
<dock-manager-core [theme]="selectedTheme"></dock-manager-core>
```

### Theme Selector

```tsx
import { themes, getThemesByMode } from '@widgetstools/dock-manager-core';

const lightThemes = getThemesByMode('light');
const darkThemes = getThemesByMode('dark');

// Or get by name
import { getThemeByName } from '@widgetstools/dock-manager-core';
const theme = getThemeByName('draculaDark');
```

### Custom Theme via createTheme (recommended)

```typescript
import { createTheme } from '@widgetstools/dock-manager-core';

// createTheme(name, mode, base, accent, overrides?)
const myTheme = createTheme(
  'My Custom Theme',
  'dark',
  { hue: 220, sat: 15, light: 10 },    // Base: background hue/sat/lightness
  { hue: 210, sat: 100, light: 65 },    // Accent: primary color hue/sat/lightness
);

// With overrides for specific colors
const branded = createTheme('Branded', 'light',
  { hue: 200, sat: 20 },
  { hue: 340, sat: 80, light: 50 },
  { floatShadow: '0 0% 0%' },          // Optional per-color overrides
);
```

### Custom Theme (manual)

```typescript
import type { DockTheme } from '@widgetstools/dock-manager-core';

const myTheme: DockTheme = {
  name: 'My Custom Theme',
  mode: 'dark',
  colors: {
    bg: '220 15% 10%',           // HSL values (without hsl())
    surface: '220 15% 13%',
    surfaceAlt: '220 15% 16%',
    panelHeader: '220 15% 15%',
    tabBar: '220 15% 12%',
    tabActive: '220 15% 13%',
    tabText: '215 20% 55%',
    tabTextActive: '210 100% 65%',
    text: '210 40% 95%',
    textSecondary: '215 20% 65%',
    textMuted: '215 15% 45%',
    border: '220 20% 22%',
    splitter: '220 20% 22%',
    splitterHover: '210 100% 55%',
    hover: '220 20% 18%',
    primary: '210 100% 65%',
    floatShadow: '0 0% 0%',
  },
};
```

---

## Serialization

### Save / Load (localStorage)

```typescript
import { saveToLocalStorage, loadFromLocalStorage, clearLocalStorage } from '@widgetstools/dock-manager-core';

// Save
saveToLocalStorage(currentState);

// Load
const result = loadFromLocalStorage();
if (result) {
  console.log(result.warnings);  // any migration warnings
  setInitialState(result.state);
}

// Clear
clearLocalStorage();
```

### Export / Import (JSON file)

```typescript
import { exportToFile, importFromFile } from '@widgetstools/dock-manager-core';

// Export to file download
exportToFile(currentState);

// Import from file picker
const result = await importFromFile();
setInitialState(result.state);
```

### Serialize / Deserialize (JSON string)

```typescript
import { serialize, deserialize } from '@widgetstools/dock-manager-core';

// To JSON string
const json = serialize(state);

// From JSON string
const result = deserialize(json);
// result.state: DockManagerState
// result.warnings: string[]
```

---

## Drag & Drop

Drag and drop is handled entirely by the core. No framework code needed.

### How it works:
1. **Mousedown** on any element with `data-tab-id` attribute starts tracking
2. After **5px movement**, drag activates:
   - Ghost element follows cursor
   - Dock indicators appear on ALL panes (caret arrows + hollow center square)
   - Edge indicators appear at container edges
3. **Hovering** over an indicator highlights it and shows a preview rectangle
4. **Dropping** on an indicator executes the dock action:
   - Center: add as tab to that group
   - Left/Right/Top/Bottom: split the group
   - Edge indicators: dock to container edge
5. **Dropping outside** any indicator: float as a window
6. **Escape**: cancel drag

### Preventable Drop

```tsx
<DockManagerCore
  onWillDrop={(event, sourceId, targetId, position) => {
    if (targetId === 'tg_locked') {
      event.preventDefault(); // Block drop
    }
  }}
/>
```

---

## Floating Windows

### Float via Button
Every docked panel has a float button (detach icon) in the header. Click it to detach the panel into a floating window.

### Float via Drag
Drag a tab outside any dock target to float it.

### Dock Back
Click the "Dock back" button on a floating window's titlebar. The panel returns to its **original tab group** (saved when floated).

### Float Programmatically

```typescript
api.floatPanel({
  panelId: 'my_panel',
  x: 100, y: 100,
  width: 400, height: 300,
});
```

### Floating Window Features
- **Draggable** titlebar
- **Resizable** from all 8 edges/corners
- **Active pane indicator** (blue title text + blue underline when active)
- **Close** button
- **Dock back** button (returns to original location)

---

## Pin / Unpin (Auto-Hide)

Unpinned panels collapse to a strip on the edge of the dock manager. Hovering/clicking reveals a flyout.

### Unpin via Button
Click the "Unpin" button (pin icon) in the panel header.

### Unpin Programmatically

```typescript
api.dispatch({ type: 'UNPIN_PANEL', payload: { panelId: 'explorer' } });
```

### Pin Back

```typescript
api.dispatch({ type: 'PIN_PANEL', payload: { panelId: 'explorer' } });
```

### Unpinned Panel Config

```typescript
unpinnedPanels: [
  { panelId: 'debug', edge: 'bottom', size: 180 },
  { panelId: 'chat', edge: 'right', size: 250 },
],
```

### Edges
Panels can be unpinned to: `'left'`, `'right'`, `'top'`, `'bottom'`.

---

## Maximize / Restore

### Maximize via Button
Click the maximize button (expand icon) in the panel header.

### Maximize via Context Menu
Right-click a tab > "Maximize".

### Maximize Programmatically

```typescript
api.maximizePanel('panel_id');
api.restorePanel();
```

### State Query

```typescript
api.isMaximized('panel_id')  // boolean
api.maximizedPanelId         // string | undefined
```

---

## Tab Context Menu

Right-clicking any tab shows a context menu with:

| Option | Action |
|--------|--------|
| **Close** | Closes the panel |
| **Close Others** | Closes all other tabs in the group (when 2+ tabs) |
| **Float** | Detach to floating window |
| **Auto Hide** | Unpin to edge strip |
| **Maximize** | Maximize the panel |

---

## Keyboard Navigation

| Shortcut | Action |
|----------|--------|
| **Ctrl+Tab** | Navigate to next panel |
| **Ctrl+Shift+Tab** | Navigate to previous panel |
| **Escape** (during drag) | Cancel drag operation |

---

## Widget Registry Pattern

Both React and Angular wrappers have a built-in `widgets` prop/input that maps `widgetType` strings to components. The wrapper handles rendering automatically.

### React Widget Registry

```tsx
import type { WidgetProps } from '@widgetstools/react-dock-manager';

// Widget components receive { panelId, panel, api } via WidgetProps
function ChartWidget({ api, panel }: WidgetProps) {
  const symbol = panel.widgetProps?.symbol as string;

  useEffect(() => {
    api.setTitle(`Chart: ${symbol}`);
    api.setIcon('chart');
    const ws = connectWebSocket(symbol);
    api.onDidDispose(() => ws.close());
  }, []);

  return <Chart symbol={symbol} />;
}

// Pass the registry via the widgets prop — no renderPanel callback needed
<DockManagerCore
  initialState={state}
  widgets={{
    chart: ChartWidget,
    table: TableWidget,
    editor: EditorWidget,
  }}
/>

// For advanced cases, use renderPanel as a fallback alongside widgets
<DockManagerCore
  widgets={{ chart: ChartWidget }}
  renderPanel={(panelId, panel, api) => <Fallback panel={panel} />}
/>
```

### Angular Widget Registry

```typescript
// Each widget component should accept 'api' and 'panel' as @Input() properties
widgets = {
  chart: ChartWidgetComponent,
  table: TableWidgetComponent,
};

// Template — the wrapper handles createComponent() automatically
<dock-manager-core [initialState]="state" [widgets]="widgets"></dock-manager-core>
```

### Adding Panels with Widget Type

```typescript
api.addPanel({
  panelId: 'chart_aapl',
  title: 'AAPL Chart',
  widgetType: 'chart',
  widgetProps: { symbol: 'AAPL', timeframe: '1D' },
  icon: 'chart',
});
```

---

## Advanced: Custom Tabs

### React

```tsx
<DockManagerCore
  renderTab={(panel, isActive) => (
    <span className={isActive ? 'active' : ''}>
      <img src={getIcon(panel.icon)} />
      {panel.title}
      {panel.badge && <span className="badge">{panel.badge}</span>}
    </span>
  )}
/>
```

### Angular

```typescript
createTab = (panelId: string, container: HTMLElement, isActive: boolean): IDisposable => {
  const panel = this.state.panels[panelId];
  container.innerHTML = `
    <span class="${isActive ? 'active' : ''}">
      ${panel?.title}
      ${panel?.badge ? `<span class="badge">${panel.badge}</span>` : ''}
    </span>
  `;
  return { dispose: () => { container.innerHTML = ''; } };
};
```

---

## Advanced: Header Actions

Add custom buttons to tab group headers.

### React

```tsx
<DockManagerCore
  renderHeaderActions={(slot, tabGroupId) => {
    if (slot === 'right' && tabGroupId === 'tg_center') {
      return <button onClick={runFile}>Run</button>;
    }
    if (slot === 'prefix' && tabGroupId === 'tg_center') {
      return <FileIcon />;
    }
    return null;
  }}
/>
```

### Slots

| Slot | Position | Use case |
|------|----------|----------|
| `prefix` | Before tabs | Group icon |
| `left` | After prefix, before tabs | Toggle buttons |
| `right` | After tabs, before action buttons | Run/build buttons |

---

## Type Reference

### DockManagerState

```typescript
interface DockManagerState {
  panels: Record<string, PanelConfig>;
  layout: LayoutNode;
  floatingPanels: FloatingPanel[];
  popoutPanels: PopoutPanel[];
  unpinnedPanels: UnpinnedPanel[];
  nextZIndex: number;
  activePaneId: string;
  maximizedPanelId?: string;
}
```

### LayoutNode

```typescript
type LayoutNode = TabGroupNode | SplitNode;

interface TabGroupNode {
  type: 'tabgroup';
  id: string;
  panels: string[];
  activePanel: string;
  headerPosition?: 'top' | 'bottom' | 'left' | 'right';
}

interface SplitNode {
  type: 'split';
  id: string;
  direction: 'horizontal' | 'vertical';
  children: LayoutNode[];
  sizes: number[];  // percentages, must sum to 100
}
```

### FloatingPanel

```typescript
interface FloatingPanel {
  panelId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  sourceTabGroupId?: string;  // saved for dock-back
}
```

### UnpinnedPanel

```typescript
interface UnpinnedPanel {
  panelId: string;
  edge: 'left' | 'right' | 'top' | 'bottom';
  size: number;  // flyout size in pixels
}
```

### DockPosition

```typescript
type DockPosition = 'left' | 'right' | 'top' | 'bottom' | 'center';
```

### DockTheme

```typescript
interface DockTheme {
  name: string;
  mode: 'light' | 'dark';
  colors: DockThemeColors;
}

interface DockThemeColors {
  bg: string;             // HSL values like '220 20% 96%'
  surface: string;
  surfaceAlt: string;
  panelHeader: string;
  tabBar: string;
  tabActive: string;
  tabText: string;
  tabTextActive: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  splitter: string;
  splitterHover: string;
  hover: string;
  primary: string;
  floatShadow: string;
}
```

### DockAction (all 22 action types)

```typescript
type DockAction =
  | { type: 'ADD_PANEL'; payload: { panelId: string; title: string; icon?: string; closable?: boolean; floatable?: boolean; widgetType?: string; widgetProps?: Record<string, unknown> } }
  | { type: 'MOVE_PANEL'; payload: { panelId: string; targetTabGroupId: string; position: DockPosition } }
  | { type: 'CLOSE_PANEL'; payload: { panelId: string } }
  | { type: 'FLOAT_PANEL'; payload: { panelId: string; x: number; y: number; width: number; height: number } }
  | { type: 'DOCK_FLOATING'; payload: { panelId: string; targetTabGroupId: string; position: DockPosition } }
  | { type: 'UPDATE_FLOATING'; payload: { panelId: string; x?: number; y?: number; width?: number; height?: number } }
  | { type: 'SET_ACTIVE_PANEL'; payload: { tabGroupId: string; panelId: string } }
  | { type: 'SET_ACTIVE_PANE'; payload: { panelId: string } }
  | { type: 'RESIZE_SPLIT'; payload: { splitId: string; sizes: number[] } }
  | { type: 'BRING_TO_FRONT'; payload: { panelId: string } }
  | { type: 'UNPIN_PANEL'; payload: { panelId: string } }
  | { type: 'PIN_PANEL'; payload: { panelId: string } }
  | { type: 'LOAD_STATE'; payload: DockManagerState }
  | { type: 'MAXIMIZE_PANEL'; payload: { panelId: string } }
  | { type: 'RESTORE_PANEL' }
  | { type: 'SET_HEADER_POSITION'; payload: { tabGroupId: string; headerPosition: HeaderPosition } }
  | { type: 'NAVIGATE'; payload: { direction: 'next' | 'previous' } }
  | { type: 'POPOUT_PANEL'; payload: { panelId: string; windowName: string; x: number; y: number; width: number; height: number } }
  | { type: 'DOCK_POPOUT'; payload: { panelId: string; targetTabGroupId?: string; position?: DockPosition } }
  | { type: 'UPDATE_POPOUT'; payload: { panelId: string; width?: number; height?: number; x?: number; y?: number } }
  | { type: 'DOCK_TO_EDGE'; payload: { panelId: string; edge: DockEdge; size?: number } }
  | { type: 'ACTIVATE_OVERFLOW_TAB'; payload: { tabGroupId: string; panelId: string } }
```

### PreventableDockEvent

```typescript
interface PreventableDockEvent {
  type: string;
  panelId: string;
  defaultPrevented: boolean;
  preventDefault(): void;
}
```

---

## CSS Custom Properties

All visual aspects are controlled via CSS custom properties. Override them for custom styling:

```css
:root {
  --dock-bg: 220 20% 96%;
  --dock-surface: 0 0% 100%;
  --dock-panel-header: 220 14% 95%;
  --dock-tab-text: 0 0% 30%;
  --dock-tab-text-active: 217 91% 50%;
  --dock-text: 0 0% 15%;
  --dock-border: 220 13% 87%;
  --dock-splitter: 220 13% 87%;
  --dock-splitter-hover: 217 91% 60%;
  --dock-primary: 217 91% 50%;
  /* ... and more */
}
```

---

## Browser Support

- Chrome/Edge 90+
- Firefox 90+
- Safari 15+

## License

MIT
