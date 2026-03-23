# React Dock Manager Demo

A fully-featured React demo showcasing the Dock Manager library. This app implements a VS Code-like IDE interface with draggable panels, floating windows, auto-hide sidebars, tabs, keyboard shortcuts, themes, and complete layout persistence.

## Quick Start

```bash
# From the monorepo root
npm install

# Start the dev server
npm run dev --prefix apps/demo
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast builds and HMR
- **Tailwind CSS** for toolbar styling
- **Lucide React** for SVG icons
- **`@widgetstools/react-dock-manager`** for the dock manager component

---

## Architecture

```
src/
├── App.tsx                    # Main app: toolbar, dock manager, event handlers
├── config/
│   └── defaultLayout.ts       # Initial panel layout state
└── widgets/                   # Panel content components
    ├── ClockWidget.tsx         # Live clock with dynamic title
    ├── EditorWidget.tsx        # Code editor with unsaved state
    ├── TerminalWidget.tsx      # Interactive terminal simulator
    ├── FileTreeWidget.tsx      # Expandable file explorer
    ├── ProblemsWidget.tsx      # Diagnostic error/warning list
    └── PlaceholderWidget.tsx   # Generic fallback panel
```

---

## How the Dock Manager Works

### 1. Setting Up the Component

The `DockManagerCore` component is the main entry point. It takes an initial layout state and callback functions:

```tsx
import { DockManagerCore } from '@widgetstools/react-dock-manager';
import type { DockviewApi } from '@widgetstools/dock-manager-core';

const [api, setApi] = useState<DockviewApi | null>(null);

<DockManagerCore
  initialState={defaultState}       // Layout configuration (panels, splits, tabs)
  widgets={WIDGETS}                 // Widget registry: maps widgetType → React component
  onReady={setApi}                  // Called with DockviewApi for programmatic control
  renderTab={renderTab}             // Called to render each tab label
  renderHeaderActions={renderHeaderActions}  // Called to render header buttons
  onStateChange={state => { ... }}  // Called whenever the layout changes
  onWillClose={onWillClose}         // Called before a panel closes (preventable)
  theme={selectedTheme}             // Theme object (light or dark)
  allowRootDock={allowRootDock}     // Enable/disable edge docking
/>
```

### 2. Defining the Layout (`defaultLayout.ts`)

The layout state is a plain JSON object with three parts:

**Panels** define what exists:
```ts
panels: {
  doc1: {
    id: 'doc1',
    title: 'Document 1',
    icon: 'file',               // Icon key (mapped to SVG in the app)
    closable: true,
    floatable: true,
    allowMaximize: true,
    widgetType: 'editor',       // Which widget component to render
    widgetProps: { language: 'ts' },  // Props passed to the widget
  },
  // ...more panels
}
```

**Layout** defines how panels are arranged:
```ts
layout: {
  type: 'split',
  direction: 'horizontal',
  sizes: [25, 45, 30],              // Percentage widths
  children: [
    { type: 'tabgroup', panels: ['explorer'], activePanel: 'explorer' },
    { type: 'tabgroup', panels: ['doc1', 'doc2'], activePanel: 'doc1' },
    {
      type: 'split',
      direction: 'vertical',
      sizes: [60, 40],
      children: [
        { type: 'tabgroup', panels: ['clock', 'properties'], headerPosition: 'bottom' },
        { type: 'tabgroup', panels: ['problems'] },
      ],
    },
  ],
}
```

**Floating, unpinned, and popout panels** are defined separately:
```ts
floatingPanels: [
  { panelId: 'floatingClock', x: 300, y: 200, width: 300, height: 200 },
],
unpinnedPanels: [
  { panelId: 'terminal', edge: 'left', size: 200 },
  { panelId: 'output', edge: 'bottom', size: 180 },
],
```

### 3. Rendering Panel Content (via `widgets` prop)

The `widgets` prop maps `widgetType` strings to React components. The dock manager automatically resolves and renders the correct widget for each panel:

```tsx
const WIDGETS = {
  clock: ClockWidget,
  editor: EditorWidget,
  terminal: TerminalWidget,
  'file-tree': FileTreeWidget,
  problems: ProblemsWidget,
  placeholder: PlaceholderWidget,
};

<DockManagerCore widgets={WIDGETS} ... />
```

Each widget component receives `WidgetProps`:
- **`panelId`** (`string`): the panel's unique identifier
- **`panel`** (`PanelConfig`): the panel's configuration (title, icon, widgetProps, etc.)
- **`api`** (`PanelApi`): methods to communicate back to the dock manager

### 4. Custom Tab Rendering (`renderTab`)

Customizes how each tab label appears. This demo shows SVG icons, the title, and an unsaved changes indicator:

```tsx
const renderTab = (panelId, panel, isActive) => (
  <span className={isActive ? 'dock-text' : 'dock-text-muted'}>
    {icon && <span>{icon}</span>}
    <span>{panel.title}</span>
    {isUnsaved && <span className="bg-amber-400 rounded-full" />}
  </span>
);
```

### 5. Header Actions (`renderHeaderActions`)

Adds custom buttons to specific tab group headers. This demo adds a "Run" button and an "Open editors" icon to the center editor group:

```tsx
const renderHeaderActions = (slot, tabGroupId) => {
  if (tabGroupId === 'tg_center' && slot === 'right') {
    return <button onClick={() => toast('Running...')}><PlayIcon /></button>;
  }
  if (tabGroupId === 'tg_center' && slot === 'prefix') {
    return <span><FileIcon /></span>;
  }
  return null;
};
```

Three slots are available: `'prefix'` (before tabs), `'left'` (after tabs), `'right'` (end of header).

### 6. Preventable Close (`onWillClose`)

Intercepts panel close events. This demo prompts the user before closing unsaved documents:

```tsx
const onWillClose = (event) => {
  if (UNSAVED_PANELS.has(event.panelId)) {
    if (!window.confirm('Unsaved changes. Close anyway?')) {
      event.preventDefault();  // Cancel the close
    }
  }
};
```

---

## PanelApi: Widget-to-Header Communication

Every widget receives a `PanelApi` object that lets it control its own tab/header:

| Method | What It Does | Used By |
|--------|-------------|---------|
| `api.setTitle(text)` | Updates the tab label text | ClockWidget (updates every second) |
| `api.setBadge(text)` | Shows a badge on the tab (e.g., error count) | EditorWidget, TerminalWidget, ProblemsWidget |
| `api.setIcon(name)` | Changes the tab icon | ClockWidget |
| `api.setAttention(true)` | Triggers a pulse animation on the tab | TerminalWidget (`build` command) |
| `api.onDidDispose(fn)` | Registers a cleanup callback | ClockWidget (clears interval) |
| `api.updateProps(obj)` | Merges new props into widgetProps | (Available for dynamic config) |
| `api.setHidden(bool)` | Hides/shows the panel | (Available for toggling) |

---

## Widgets

### ClockWidget
Displays the current time, updating every second. Demonstrates `api.setTitle()` for live tab title updates.

### EditorWidget
A textarea-based code editor with per-panel sample code (TypeScript, CSS, JSX, etc.). Tracks modified state and uses `api.setBadge('●')` to show an unsaved indicator on the tab.

### TerminalWidget
An interactive terminal simulator. Type commands (`help`, `build`, `clear`, `date`, `badges`, `attention`) to see PanelApi features in action. The `build` command demonstrates `api.setAttention()` and `api.setBadge()`.

### FileTreeWidget
An expandable file tree with folders and files. Click folders to expand/collapse. Demonstrates a typical sidebar panel pattern.

### ProblemsWidget
Displays a table of mock compiler diagnostics (errors, warnings, info). Uses `api.setBadge()` to show the error count on its tab.

### PlaceholderWidget
A generic fallback that shows the panel's title, ID, and widget type. Used for panels without a specific widget implementation.

---

## Toolbar Features

### Undo / Redo
Reverts or replays layout changes (panel moves, resizes, tab reorders).

### Layout Persistence
- **Save / Load**: Stores the current layout in `localStorage`
- **Reset**: Reverts to the default layout
- **Export / Import**: Downloads or uploads the layout as a JSON file
- **Copy / Paste**: Copies the layout JSON to/from the clipboard

### Layout Presets
Save named snapshots of the current layout and restore them later.

### URL Sharing
Encodes the entire layout into a URL query parameter (`?layout=...`). Share the URL to let someone open the exact same layout.

### API Controls
- **Add Panel**: Creates a new panel (alternates between clock and editor)
- **Navigate Previous / Next**: Moves focus between panels in tab order

### Feature Toggles
- **Dock All Floating**: Docks all floating windows back into the layout
- **Toggle Disabled**: Enables/disables the Problems panel
- **Debug Mode**: Shows a debug overlay with layout visualization
- **Edge Dock**: Enables/disables docking to the window edges

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+P` | Open panel finder |
| `Ctrl+W` | Close active panel |
| `Ctrl+Tab` | Pane navigator (next) |
| `Ctrl+Shift+Tab` | Pane navigator (previous) |
| `Ctrl+F6` | Next tab in group |
| `Ctrl+Shift+F6` | Previous tab in group |
| `Alt+F6` | Next pane (across groups) |
| `Alt+Shift+F6` | Previous pane (across groups) |
| `Alt+F7` | Open pane navigator |
| `F11` | Maximize / Restore |
| `Ctrl+Shift+Arrow` | Dock panel to edge |
| `Escape` | Restore maximized / Cancel drag |

---

## Themes

14 built-in themes are available from the dropdown in the toolbar:

**Light**: VS Code Light, GitHub Light, Warm Light, Solarized Light, Sepia, Mint, Lavender

**Dark**: VS Code Dark, Dracula Dark, Nord Dark, Solarized Dark, Midnight Blue, Forest Dark, Slate Dark

Themes are applied by passing a `DockTheme` object to the `theme` prop:

```tsx
import { themes } from '@widgetstools/dock-manager-core';

<DockManagerCore theme={themes.vsCodeDark} />
```

---

## Default Layout

The demo starts with this VS Code-like layout:

```
 ┌────────────┬──────────────────┬────────────────┐
 │            │                  │ Properties     │
 │  Explorer  │  Document 1 ×   │ (placeholder)  │
 │ (file-tree)│  Document 2     │                │
 │            │                  │ Clock | Props  │
 │            │  [Floating       ├────────────────┤
 │            │   Clock]         │ Problems       │
 │            │                  │ (error list)   │
 ├─ Terminal ─┴──────────────────┴────────────────┤
 │                    Output                       │
 └─────────────────────────────────────────────────┘
```

- **Left**: Explorer (file tree, pinnable to auto-hide)
- **Center**: Two editor tabs (Document 1 active)
- **Right top**: Clock + Properties (tabs at bottom)
- **Right bottom**: Problems panel
- **Floating**: Clock widget at (300, 200)
- **Auto-hide left**: Terminal
- **Auto-hide bottom**: Output

---

## Imperative API Access

Access the `DockviewApi` via a ref for programmatic control:

```tsx
const dockRef = useRef<DockManagerCoreHandle>(null);

// Add a panel programmatically
dockRef.current?.getApi()?.addPanel({
  panelId: 'new1',
  title: 'New Panel',
  widgetType: 'clock',
});

// Undo/redo
dockRef.current?.getApi()?.undo();
dockRef.current?.getApi()?.redo();

// Dock all floating panels
dockRef.current?.getApi()?.dockAllFloating();

// Save/load presets
dockRef.current?.getApi()?.savePreset('My Layout');
dockRef.current?.getApi()?.loadPreset(preset);

// Navigate between panels
dockRef.current?.getApi()?.navigateNext();
```
