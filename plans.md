# Dock Manager — Widget Dashboard Implementation Plan

## Goal

Enable users to add widgets (React/Angular components or route URLs) to the dock manager at runtime, serialize the workspace layout + widget configuration, and restore it on next load.

## Requirements

### 1. Widget Registry Pattern

- A widget registry maps a `widgetType` string (e.g. `"chart"`, `"table"`, `"user-profile"`) to an actual React/Angular component or a route URL
- The registry is provided by the consuming application, not baked into the dock manager
- Framework-agnostic: core only knows about `widgetType` strings, frameworks resolve them to components

### 2. Extended PanelConfig

- Add `widgetType: string` to `PanelConfig` — identifies which component to render
- Add `widgetProps?: Record<string, unknown>` — component-specific data (chart symbol, filter settings, date range, etc.)
- These fields are serializable (JSON-safe) so they persist across sessions

### 3. Content Rendering via createContent Callback

- The existing `createContent(panelId, container)` callback already receives the panel ID and a DOM container
- The consuming app looks up `widgetType` from `state.panels[panelId]` and renders the correct component into the container
- React: use `createRoot(container).render(<WidgetComponent {...widgetProps} />)`
- Angular: use `ViewContainerRef.createComponent()` or a dynamic component loader

### 4. Route URL Support

- A special `widgetType: "route"` renders the URL specified in `widgetProps.url`
- Implementation options:
  - **iframe**: simplest, full isolation, works cross-origin
  - **Dynamic import + router outlet**: for same-app routes, better integration but more complex
  - **Micro-frontend**: for independent deployable widgets

### 5. Serialization / Deserialization

- Serialization already saves/restores `PanelConfig` objects including all fields
- On serialize: save `widgetType` + `widgetProps` + layout tree + floating/unpinned positions
- On deserialize: restore layout, then `createContent` fires for each panel → registry resolves component
- Widget props must be JSON-serializable (no functions, no DOM refs, no component instances)

### 6. Runtime Widget Management

- User can add a widget at runtime via `api.addPanel({ widgetType: "chart", widgetProps: { symbol: "AAPL" } })`
- User can update widget props via `api.updatePanelConfig(panelId, { widgetProps: { symbol: "MSFT" } })`
- User can remove a widget by closing the panel
- User can duplicate a widget (clone panel config into a new panel)

### 7. Demo App Updates

- React demo: show widget registry with 3-4 widget types (chart, table, properties, editor)
- Angular demo: same widget types using Angular components
- Both demos: "Add Widget" dropdown that lists available widget types
- Both demos: save/load layout button that persists widget configs

## Implementation Steps

1. Extend `PanelConfig` type with `widgetType` and `widgetProps` fields
2. Add `UPDATE_PANEL_CONFIG` action to reducer (if not already present) for updating widget props
3. Update `DockviewApi.addPanel()` to accept `widgetType` and `widgetProps`
4. Update demo apps with widget registry pattern and example components
5. Add route URL rendering support (iframe-based initially)
6. Add "Add Widget" UI to demo toolbar
7. Verify serialization round-trips widget configs correctly
8. Write tests for widget config serialization

## 8. Panel API — Widget-to-Header Communication

Widgets hosted in panes need to manipulate their own pane header at runtime (change title, add icons, show notifications). The dock manager provides a **PanelApi** object to each widget via the `createContent` callback.

### PanelApi Interface

```typescript
interface PanelApi {
  // Header text
  setTitle(title: string): void;
  getTitle(): string;

  // Icon (prefix before title text)
  setIcon(icon: string | null): void;  // emoji, SVG string, or CSS class

  // Badge (suffix after title — notification count, unsaved dot, etc.)
  setBadge(badge: string | null): void;  // e.g. "3", "!", "●"

  // Attention / blink (triggers CSS animation on the tab header)
  setAttention(attention: boolean): void;

  // Custom CSS class on the tab element
  setTabClass(className: string | null): void;

  // Panel identity (read-only)
  readonly panelId: string;
  readonly widgetType: string;
  readonly widgetProps: Record<string, unknown>;

  // Update widget props (triggers re-serialization)
  updateProps(props: Partial<Record<string, unknown>>): void;

  // Lifecycle
  onDidDispose(callback: () => void): void;  // cleanup when panel is closed
  onDidChangeVisibility(callback: (visible: boolean) => void): void;
}
```

### How createContent Changes

```typescript
// Before:
createContent(panelId: string, container: HTMLElement): void;

// After:
createContent(panelId: string, container: HTMLElement, api: PanelApi): void;
```

### Usage Example (React)

```tsx
function ChartWidget({ api }: { api: PanelApi }) {
  useEffect(() => {
    api.setTitle("AAPL — $182.52");
    api.setIcon("📈");

    const ws = new WebSocket("wss://...");
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      api.setTitle(`AAPL — $${data.price}`);
      if (data.alert) {
        api.setAttention(true);
        api.setBadge("!");
      }
    };

    api.onDidDispose(() => ws.close());
  }, []);

  return <canvas ref={chartRef} />;
}
```

### Implementation Notes

- Core owns the header DOM — PanelApi methods update the DOM directly via `TabGroupView`
- `setTitle` updates both the tab label and the `data-drag-title` attribute
- `setIcon` prepends an icon element before the tab label
- `setBadge` appends a badge element after the tab label
- `setAttention` toggles a `.dock-tab-attention` CSS class with a blink/pulse animation
- All changes are reflected in serialization (title, icon, badge are saved in PanelConfig)
- `onDidDispose` callbacks are called when the panel is closed, ensuring widget cleanup

## Implementation Layers

Each feature is implemented at the appropriate level to keep the core framework-agnostic and the wrappers thin.

### Core Level (dock-manager-core)

Everything that is framework-agnostic and owns DOM/state:

| Feature | Why Core |
|---------|----------|
| `PanelConfig` extensions (`widgetType`, `widgetProps`) | Type definitions — no framework dependency |
| `PanelApi` class implementation | Core owns the header DOM (TabGroupView) — setTitle/setIcon/setBadge directly update DOM elements |
| `createContent` signature change (add `api: PanelApi` param) | `DockviewComponent` calls `createContent` — it creates and passes the `PanelApi` |
| `UPDATE_PANEL_CONFIG` reducer action | Immutable state mutation — already framework-agnostic |
| `DockviewApi.addPanel()` with `widgetType`/`widgetProps` | API layer wraps reducer dispatch |
| Serialization of `widgetType`/`widgetProps` | Already works — `PanelConfig` is serialized as-is since these are plain JSON fields |
| `onDidDispose` / `onDidChangeVisibility` lifecycle | Core tracks panel lifecycle — knows when panels are closed or hidden |
| `.dock-tab-attention` CSS animation | Core owns all CSS |

### Wrapper Level (react-dock-manager / angular-dock-manager)

Optional convenience helpers — apps can do everything without these, but helpers reduce boilerplate:

| Feature | Why Wrapper |
|---------|-------------|
| `useWidgetRegistry(registry)` React hook | Convenience — auto-generates `createContent` from a `{ [type]: Component }` map |
| `WidgetRegistryService` Angular service | Same pattern for Angular — `provide` a registry, the service wires up `createContent` |
| `DockManagerCore` prop: `widgetRegistry` | Shorthand — pass a registry object instead of writing `createContent` manually |

### App Level (demo / angular-demo)

Application-specific code that the dock manager library should never contain:

| Feature | Why App |
|---------|---------|
| Widget registry definition (`{ chart: ChartWidget, table: TableWidget }`) | Each app has different widgets |
| `createContent` callback implementation | App resolves `widgetType` to component and renders into container |
| Route URL rendering (iframe or router outlet) | App decides how to handle URLs — iframe, micro-frontend, or same-app route |
| "Add Widget" dropdown UI | App-specific toolbar — not part of dock manager |
| Widget component implementations | The actual chart, table, editor components |
| Save/Load layout buttons | App-specific persistence strategy (localStorage, server, file) |

### What Each Layer Knows

```
┌─────────────────────────────────────────────────────┐
│  App Layer                                          │
│  - Knows widget types and their React/Angular       │
│    component implementations                        │
│  - Provides createContent callback                  │
│  - Manages persistence (when to save/load)          │
├─────────────────────────────────────────────────────┤
│  Wrapper Layer (thin, optional helpers)             │
│  - Provides useWidgetRegistry / WidgetRegistryService│
│  - Bridges core PanelApi → React props / Angular DI │
│  - Handles framework-specific rendering into DOM    │
├─────────────────────────────────────────────────────┤
│  Core Layer                                         │
│  - Owns all DOM (headers, tabs, splitters, floating)│
│  - Creates PanelApi per panel                       │
│  - Stores widgetType + widgetProps in state          │
│  - Serializes/deserializes everything               │
│  - Knows nothing about React, Angular, or widgets   │
└─────────────────────────────────────────────────────┘
```

## Architecture Notes

- The dock manager core remains framework-agnostic — it only stores `widgetType` (a string) and `widgetProps` (a plain object)
- The framework wrapper (React/Angular) is responsible for resolving `widgetType` to an actual component
- This separation means the same serialized layout can theoretically be loaded by either framework (if both register the same widget types)
- Widget props should follow a convention: each widget type defines its own props interface
