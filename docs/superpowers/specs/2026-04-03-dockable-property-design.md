# Design: `dockable` Property for Floating Panels

**Date:** 2026-04-03
**Status:** Proposed

## Problem

Users need floating panels that act as dialog boxes — displayed on demand, freely movable, but never dockable into the layout. Currently all floating panels can be docked back via the header button, docked via drag-and-drop indicators, and docked via double-clicking the title bar.

## Solution

Add a `dockable` property to `PanelConfig`. When `dockable` is `false`, the floating panel can still be dragged to reposition, but dock indicators are suppressed during drag, the dock-back button is hidden, and double-click-to-dock is disabled. The panel can still be resized, closed, and maximized.

Defaults to `true` for full backward compatibility.

## Property Definition

```typescript
// In PanelConfig (types/dock.ts)
dockable?: boolean; // default: true
```

## Behavior Matrix

| Capability              | `dockable: true` (default) | `dockable: false` |
|------------------------|---------------------------|-------------------|
| Dock-back button       | Shown                     | Hidden            |
| Title bar drag         | Repositions panel         | Repositions panel (same) |
| Dock indicators on drag| Shown                     | Suppressed        |
| Drag-to-dock           | Works                     | Prevented         |
| Double-click title bar | Docks back                | No-op             |
| API `dockFloatingPanel` | Works                    | No-op             |
| Reducer `DOCK_FLOATING` | Works                    | No-op             |
| Close button           | Shown (per `closable`)    | Shown (per `closable`) |
| Resize                 | Works (per `floatingResizable`) | Works        |
| Maximize               | Works (per `allowMaximize`) | Works            |

## Files to Modify

### 1. `packages/dock-manager-core/src/types/dock.ts`
- Add `dockable?: boolean` to `PanelConfig` interface

### 2. `packages/dock-manager-core/src/dom/views/FloatingWindowView.ts`
- Accept panel config (or just `dockable` flag) in constructor/update
- Skip rendering dock-back button when `dockable === false`
- Skip title bar double-click dock handler when `dockable === false`
- Title bar drag still works (panel can be repositioned)

### 3. `packages/dock-manager-core/src/dom/DockDragManager.ts`
- When dragging a non-dockable panel: suppress dock indicators (edge + pane) so no drop targets appear
- On drop: if source panel has `dockable === false`, skip the dock path (panel stays floating at its new position)

### 4. `packages/dock-manager-core/src/dom/DockviewComponent.ts`
- Pass `dockable` info when creating FloatingWindowView
- Guard the `dock-back` action handler to check `dockable`

### 5. `packages/dock-manager-core/src/reducer/dockReducer.ts`
- In `DOCK_FLOATING` case: check `state.panels[panelId]?.dockable !== false` before proceeding

### 6. `packages/dock-manager-core/src/api/DockviewApi.ts`
- In `dockFloatingPanel()`: check panel's `dockable` property, return early if `false`

### 7. `apps/demo/src/App.tsx`
- Add a toolbar button "Show Dialog" that creates a non-dockable floating panel via `api.addPanel()` + `api.floatPanel()`

## Demo Integration

Add a button to the demo toolbar that:
1. Adds a panel with `dockable: false` and a simple info widget
2. Floats it at a centered position
3. The panel appears as a dialog that can be moved and closed, but never docked

## Non-Goals

- No new CSS classes or visual styling changes (the panel looks the same, just without the dock button)
- No changes to the `floatable` property (orthogonal concept: controls docked-to-floating direction)
- No changes to serialization (the `dockable` flag is already part of PanelConfig and will serialize naturally)
