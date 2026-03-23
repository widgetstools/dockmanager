# Angular Dock Manager Demo

A fully-featured Angular demo showcasing the Dock Manager library. This app implements a VS Code-like IDE interface with draggable panels, floating windows, auto-hide sidebars, tabs, keyboard shortcuts, themes, and complete layout persistence.

## Quick Start

```bash
# From the monorepo root
npm install

# Start the dev server
npm run dev --prefix apps/angular-demo
```

Open [http://localhost:4201](http://localhost:4201) in your browser.

## Tech Stack

- **Angular 21** with zoneless change detection (`provideZonelessChangeDetection`)
- **TypeScript 5.9**
- **`@widgetstools/angular-dock-manager`** for the dock manager component
- **`@widgetstools/dock-manager-core`** for themes and types
- No zone.js overhead - uses Angular's modern signal-based reactivity

---

## Architecture

```
src/app/
├── app.component.ts               # Main app: toolbar, dock manager, event handlers
├── app.config.ts                   # Angular config (zoneless change detection)
├── config/
│   └── default-layout.ts           # Initial panel layout state
└── widgets/                        # Panel content components
    ├── clock-widget.component.ts    # Live clock with dynamic title
    ├── editor-widget.component.ts   # Code editor with unsaved state
    ├── terminal-widget.component.ts # Interactive terminal simulator
    ├── file-tree-widget.component.ts# Expandable file explorer
    ├── problems-widget.component.ts # Diagnostic error/warning list
    └── placeholder-widget.component.ts # Generic fallback panel
```

---

## How the Dock Manager Works

### 1. Setting Up the Component

The `dock-manager-core` component is the main entry point. It takes an initial layout state and callback functions via Angular bindings:

```html
<dock-manager-core
  [initialState]="initialState"
  [widgets]="widgets"
  [createTab]="createTabContent"
  [createHeaderActions]="createHeaderActionsContent"
  [theme]="selectedTheme"
  (ready)="onReady($event)"
  (stateChange)="onStateChange($event)"
  (willClose)="onWillClose($event)">
</dock-manager-core>
```

**Inputs:**
| Input | Type | Description |
|-------|------|-------------|
| `initialState` | `DockManagerState` | The layout configuration (panels, splits, tabs) |
| `widgets` | `Record<string, Type<any>>` | Widget registry: maps `widgetType` to Angular component class |
| `createContent` | `ContentRenderer` | Optional fallback content renderer (used when `widgets` doesn't match) |
| `createTab` | `TabRenderer` | Optional custom tab renderer |
| `createHeaderActions` | `HeaderActionsRenderer` | Optional header action buttons |
| `theme` | `'light' \| 'dark' \| DockTheme` | Theme object (light or dark) |
| `allowRootDock` | `boolean` | Enable/disable edge docking |

**Outputs:**
| Output | Type | Description |
|--------|------|-------------|
| `ready` | `DockviewApi` | Emitted when the dock manager initializes, with the API for programmatic control |
| `stateChange` | `DockManagerState` | Emitted whenever the layout changes |
| `willClose` | `{ event, panelId }` | Emitted before a panel closes (call `event.preventDefault()` to cancel) |
| `willDrop` | `{ event, sourceId, targetId, position }` | Emitted before a drop (preventable) |

### 2. Defining the Layout (`default-layout.ts`)

The layout state is a plain TypeScript object with three parts:

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

### 3. Rendering Panel Content (via `widgets` input)

The `widgets` input maps `widgetType` strings to Angular component classes. The dock manager wrapper handles `createComponent()`, `attachView`, and cleanup automatically:

```ts
widgets = {
  'clock': ClockWidgetComponent,
  'editor': EditorWidgetComponent,
  'terminal': TerminalWidgetComponent,
  'file-tree': FileTreeWidgetComponent,
  'problems': ProblemsWidgetComponent,
  'placeholder': PlaceholderWidgetComponent,
};

// Template — no createContent callback needed
<dock-manager-core [initialState]="state" [widgets]="widgets"></dock-manager-core>
```

Each widget component should accept two `@Input()` properties:
- **`panel`** (`PanelConfig`): the panel's configuration (title, icon, widgetProps, etc.)
- **`api`** (`PanelApi`): methods to communicate back to the dock manager

### 4. Custom Tab Rendering (`createTabContent`)

Customizes how each tab label appears. This demo creates DOM elements with SVG icons, the title, and an unsaved changes indicator:

```ts
createTabContent = (panelId: string, container: HTMLElement, isActive: boolean): IDisposable => {
  const panel = this.panelConfigs[panelId];
  const span = document.createElement('span');

  // Add SVG icon
  if (panel.icon && ICON_SVGS[panel.icon]) {
    const iconSpan = document.createElement('span');
    iconSpan.innerHTML = ICON_SVGS[panel.icon];
    span.appendChild(iconSpan);
  }

  // Add title
  const titleSpan = document.createElement('span');
  titleSpan.textContent = panel.title;
  span.appendChild(titleSpan);

  // Add unsaved dot for doc1/doc2
  if (UNSAVED_PANELS.has(panel.id)) {
    const dot = document.createElement('span');
    dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:#fbbf24';
    span.appendChild(dot);
  }

  container.appendChild(span);
  return { dispose: () => { container.innerHTML = ''; } };
};
```

### 5. Header Actions (`createHeaderActionsContent`)

Adds custom buttons to specific tab group headers. This demo adds a "Run" button and an "Open editors" icon to the center editor group:

```ts
createHeaderActionsContent = (slot: string, tabGroupId: string, container: HTMLElement): IDisposable => {
  if (tabGroupId === 'tg_center' && slot === 'right') {
    // Run file button
    const btn = document.createElement('button');
    btn.innerHTML = '<svg>...</svg>';  // Play icon
    btn.addEventListener('click', () => this.showToast('Running...'));
    container.appendChild(btn);
    return { dispose: () => { container.innerHTML = ''; } };
  }
  if (tabGroupId === 'tg_center' && slot === 'prefix') {
    // Open editors icon
    const span = document.createElement('span');
    span.innerHTML = '<svg>...</svg>';  // FileText icon
    container.appendChild(span);
    return { dispose: () => { container.innerHTML = ''; } };
  }
  return { dispose: () => {} };
};
```

Three slots are available: `'prefix'` (before tabs), `'left'` (after tabs), `'right'` (end of header).

### 6. Preventable Close (`onWillClose`)

Intercepts panel close events. This demo prompts the user before closing unsaved documents:

```ts
onWillClose(data: { event: PreventableDockEvent; panelId: string }): void {
  if (UNSAVED_PANELS.has(data.panelId)) {
    const panel = this.currentState.panels[data.panelId];
    if (!window.confirm(`"${panel?.title}" has unsaved changes. Close anyway?`)) {
      data.event.preventDefault();  // Cancel the close
    }
  }
}
```

---

## PanelApi: Widget-to-Header Communication

Every widget receives a `PanelApi` object (`@Input() api`) that lets it control its own tab/header:

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

All widgets are standalone Angular components with `OnPush` change detection and use Angular's built-in `@for`/`@if` control flow (no `CommonModule` needed).

### ClockWidget
Displays the current time, updating every second via `setInterval`. Demonstrates `api.setTitle()` for live tab title updates and `api.setIcon()` for setting the panel icon. Cleans up the timer via `api.onDidDispose()`.

### EditorWidget
A textarea-based code editor with per-panel sample code (TypeScript, CSS, JSX, etc.). Tracks modified state and uses `api.setBadge('●')` to show an unsaved indicator on the tab. The Save button clears the badge.

### TerminalWidget
An interactive terminal simulator using `FormsModule` for input binding. Type commands to see PanelApi features in action:
- **`help`**: Lists available commands
- **`build`**: Simulates a build (1.5s delay), sets badge to "done", triggers `api.setAttention()`
- **`clear`**: Clears terminal output
- **`date`**: Shows current date
- **`badges`**: Demonstrates `api.setBadge('3')`
- **`attention`**: Demonstrates `api.setAttention(true)` with 3-second timeout

### FileTreeWidget
An expandable file tree with folders and files using recursive `<ng-template>` with `*ngTemplateOutlet`. Click folders to expand/collapse. Demonstrates a typical sidebar panel.

### ProblemsWidget
Displays a table of mock compiler diagnostics (errors, warnings, info) using `@for` control flow. Uses `api.setBadge()` to show the error count on its tab. Color-coded severity indicators.

### PlaceholderWidget
A generic fallback that shows the panel's title, ID, and widget type. Used for panels without a specific widget (Properties, Output).

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
Save named snapshots of the current layout and restore them later via the DockviewApi.

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

Themes are applied by passing a `DockTheme` object to the `[theme]` input:

```ts
import { themes } from '@widgetstools/dock-manager-core';

// In the template
<dock-manager-core [theme]="selectedTheme" ...>
```

Theme preference persists in `localStorage` under the key `dock-manager-theme-key`.

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

## Programmatic API Access

Use the `(ready)` output to get the `DockviewApi`:

```ts
// In template:
<dock-manager-core (ready)="onReady($event)" ...></dock-manager-core>

// In component:
api: DockviewApi | null = null;
onReady(api: DockviewApi) { this.api = api; }

// Add a panel programmatically
this.api?.addPanel({ panelId: 'new1', title: 'New Panel', widgetType: 'clock' });

// Undo/redo
this.api?.undo();
this.api?.redo();

// Dock all floating panels
this.api?.dockAllFloating();

// Save/load presets
this.api?.savePreset('My Layout');
this.api?.loadPreset(preset);

// Navigate between panels
this.api?.navigateNext();

// Load a new layout (replaces mountKey pattern)
this.api?.loadState(newState);
```

---

## Angular-Specific Notes

### Zoneless Change Detection
This demo uses `provideZonelessChangeDetection()` in `app.config.ts`. There is no `zone.js` overhead. Widgets use `ChangeDetectorRef.markForCheck()` for manual change detection when needed (e.g., after `setTimeout` in the terminal widget).

### Dynamic Component Creation
Widgets are created using Angular's `createComponent()` API with `EnvironmentInjector`, not through template directives. This allows the core dock manager library (which is framework-agnostic) to control when and where components are mounted.

### Built-in Control Flow
All widgets use Angular's `@for` and `@if` syntax instead of `*ngFor`/`*ngIf` directives. This avoids issues with `CommonModule` when components are dynamically created outside Angular's normal rendering pipeline.
