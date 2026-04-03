# Dockable Property Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `dockable` property to `PanelConfig` that, when `false`, prevents a floating panel from being docked — hides the dock-back button, suppresses dock indicators during drag, blocks double-click-to-dock, and guards the API/reducer.

**Architecture:** The `dockable` flag is read from `PanelConfig` at each decision point — the FloatingWindowView constructor (button/dblclick/drag), the DockDragManager (indicators), the reducer (DOCK_FLOATING), and the API (dockFloatingPanel). No new state shape; `dockable` is just another optional boolean on the existing PanelConfig.

**Tech Stack:** TypeScript, Vitest (tests), React (demo app)

---

### Task 1: Add `dockable` to PanelConfig type

**Files:**
- Modify: `packages/dock-manager-core/src/types/dock.ts:41-111`

- [ ] **Step 1: Add the property**

In `packages/dock-manager-core/src/types/dock.ts`, add after the `floatingResizable` property (line 82):

```typescript
  /** Whether this floating panel can be docked back into the layout. Defaults to `true`. */
  dockable?: boolean;
```

- [ ] **Step 2: Verify build**

Run: `cd packages/dock-manager-core && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/dock-manager-core/src/types/dock.ts
git commit -m "feat: add dockable property to PanelConfig type"
```

---

### Task 2: Add `dockable` to ADD_PANEL action and reducer

**Files:**
- Modify: `packages/dock-manager-core/src/reducer/dockReducer.ts:39,105-114`
- Modify: `packages/dock-manager-core/src/api/DockviewApi.ts:28-51,253-265`

- [ ] **Step 1: Write the failing test**

In `packages/dock-manager-core/src/__tests__/dockReducer.test.ts`, add at the end:

```typescript
describe('dockable property', () => {
  it('ADD_PANEL preserves dockable: false in panel config', () => {
    const state = createDefaultState();
    const result = dockReducer(state, {
      type: 'ADD_PANEL',
      payload: { panelId: 'dialog1', title: 'Dialog', dockable: false },
    });
    expect(result.panels['dialog1'].dockable).toBe(false);
  });

  it('DOCK_FLOATING is a no-op when panel has dockable: false', () => {
    let state = createDefaultState();
    state = dockReducer(state, {
      type: 'ADD_PANEL',
      payload: { panelId: 'dialog1', title: 'Dialog', dockable: false },
    });
    state = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'dialog1', x: 100, y: 100, width: 400, height: 300 },
    });
    const before = state;
    const after = dockReducer(state, {
      type: 'DOCK_FLOATING',
      payload: { panelId: 'dialog1', targetTabGroupId: 'default', position: 'center' },
    });
    // State should be unchanged — panel stays floating
    expect(after.floatingPanels).toEqual(before.floatingPanels);
  });

  it('DOCK_FLOATING works normally when dockable is true (default)', () => {
    let state = createDefaultState();
    state = dockReducer(state, {
      type: 'ADD_PANEL',
      payload: { panelId: 'normal1', title: 'Normal' },
    });
    state = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'normal1', x: 100, y: 100, width: 400, height: 300 },
    });
    expect(state.floatingPanels.some(fp => fp.panelId === 'normal1')).toBe(true);
    const after = dockReducer(state, {
      type: 'DOCK_FLOATING',
      payload: { panelId: 'normal1', targetTabGroupId: 'default', position: 'center' },
    });
    expect(after.floatingPanels.some(fp => fp.panelId === 'normal1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/dock-manager-core && npx vitest run src/__tests__/dockReducer.test.ts -t "dockable property"`
Expected: FAIL — `dockable` not in payload type, ADD_PANEL doesn't set it

- [ ] **Step 3: Update the ADD_PANEL action type**

In `packages/dock-manager-core/src/reducer/dockReducer.ts`, line 39, add `dockable?: boolean` to the ADD_PANEL payload:

```typescript
  | { type: 'ADD_PANEL'; payload: { panelId: string; title: string; icon?: string; closable?: boolean; floatable?: boolean; dockable?: boolean; tabComponent?: string; widgetType?: string; widgetProps?: Record<string, unknown> } }
```

- [ ] **Step 4: Update the ADD_PANEL reducer case**

In `packages/dock-manager-core/src/reducer/dockReducer.ts`, in the `case 'ADD_PANEL'` block (around line 105), add `dockable` to the panel config construction:

```typescript
      const panel: PanelConfig = {
        id: panelId,
        title: action.payload.title,
        icon: action.payload.icon,
        closable: action.payload.closable !== false,
        floatable: action.payload.floatable !== false,
        dockable: action.payload.dockable,
        tabComponent: action.payload.tabComponent,
        widgetType: action.payload.widgetType,
        widgetProps: action.payload.widgetProps,
      };
```

- [ ] **Step 5: Guard the DOCK_FLOATING case**

In `packages/dock-manager-core/src/reducer/dockReducer.ts`, at the start of `case 'DOCK_FLOATING'` (line 204), add the guard after extracting payload:

```typescript
    case 'DOCK_FLOATING': {
      const { panelId, targetTabGroupId, position } = action.payload;
      // Guard: non-dockable panels cannot be docked
      if (state.panels[panelId]?.dockable === false) return state;
      const floatingEntry = state.floatingPanels.find(p => p.panelId === panelId);
```

- [ ] **Step 6: Update AddPanelOptions in DockviewApi**

In `packages/dock-manager-core/src/api/DockviewApi.ts`, add `dockable` to `AddPanelOptions` (after `floatable` around line 40):

```typescript
  /** Whether the floating panel can be docked back. Defaults to `true`. */
  dockable?: boolean;
```

- [ ] **Step 7: Forward dockable in addPanel method**

In `packages/dock-manager-core/src/api/DockviewApi.ts`, update the `addPanel` method (around line 260) to destructure and forward `dockable`:

```typescript
    const { title, icon, closable, floatable, dockable, tabComponent, widgetType, widgetProps, targetGroupId, position } = options;

    // Add the panel config first
    this.dispatch({
      type: 'ADD_PANEL',
      payload: { panelId, title, icon, closable, floatable, dockable, tabComponent, widgetType, widgetProps },
    });
```

- [ ] **Step 8: Guard dockFloatingPanel in API**

In `packages/dock-manager-core/src/api/DockviewApi.ts`, add a guard at the top of `dockFloatingPanel` (line 364):

```typescript
  dockFloatingPanel(panelId: string, targetGroupId?: string, position: DockPosition = 'center'): void {
    const panel = this.getState().panels[panelId];
    if (panel?.dockable === false) return;
    this.dispatch({
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd packages/dock-manager-core && npx vitest run src/__tests__/dockReducer.test.ts -t "dockable property"`
Expected: PASS (3 tests)

- [ ] **Step 10: Commit**

```bash
git add packages/dock-manager-core/src/reducer/dockReducer.ts packages/dock-manager-core/src/api/DockviewApi.ts packages/dock-manager-core/src/__tests__/dockReducer.test.ts
git commit -m "feat: guard DOCK_FLOATING and API for dockable property"
```

---

### Task 3: Update FloatingWindowView to respect `dockable`

**Files:**
- Modify: `packages/dock-manager-core/src/dom/views/FloatingWindowView.ts:126-165,294-303`

- [ ] **Step 1: Conditionally skip dock-back button**

In `packages/dock-manager-core/src/dom/views/FloatingWindowView.ts`, wrap the dock-back button creation (lines 131-138) in a conditional:

```typescript
    // Dock back button — only show if panel is dockable (default: true)
    if (panel.dockable !== false) {
      const dockBackBtn = document.createElement('button');
      dockBackBtn.className = 'dock-floating-titlebar-btn';
      dockBackBtn.setAttribute('data-action', 'dock-back');
      dockBackBtn.setAttribute('data-panel-id', floating.panelId);
      dockBackBtn.title = this.resourceStrings.dock;
      dockBackBtn.setAttribute('aria-label', this.resourceStrings.dock);
      dockBackBtn.innerHTML = iconDockBack();
      btnContainer.appendChild(dockBackBtn);
    }
```

- [ ] **Step 2: Conditionally skip double-click dock**

In the same file, wrap the dblclick handler (lines 161-165) in a conditional:

```typescript
    // Double-click titlebar → dock back (only if dockable)
    if (panel.dockable !== false) {
      this.titleBarEl.addEventListener('dblclick', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        this.callbacks.onDockBack(this.floating.panelId);
      });
    }
```

- [ ] **Step 3: Suppress dock indicators during drag for non-dockable panels**

In the `startDrag` method, around lines 294-303, wrap the indicator logic in a `dockable` check:

```typescript
      // Show dock indicators after 5px of movement (use DockDragManager for this)
      // Only show indicators if the panel is dockable
      if (!indicatorsShown && dragManager && this.panel.dockable !== false) {
        const dx = ev.clientX - this.dragStart.x;
        const dy = ev.clientY - this.dragStart.y;
        if (Math.sqrt(dx * dx + dy * dy) >= 5) {
          indicatorsShown = true;
          dragManager.startDrag(this.floating.panelId, this.panel.title, ev, true /* skipGhost */);
        }
      }
```

- [ ] **Step 4: Verify build**

Run: `cd packages/dock-manager-core && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run all tests**

Run: `cd packages/dock-manager-core && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/dock-manager-core/src/dom/views/FloatingWindowView.ts
git commit -m "feat: hide dock-back button and suppress indicators for non-dockable panels"
```

---

### Task 4: Guard dock-back action in DockviewComponent

**Files:**
- Modify: `packages/dock-manager-core/src/dom/DockviewComponent.ts:673-680`

- [ ] **Step 1: Add dockable guard to dock-back action handler**

In `packages/dock-manager-core/src/dom/DockviewComponent.ts`, in the `case 'dock-back'` block (line 673), add a guard:

```typescript
      case 'dock-back': {
        const panelConfig = this.state.panels[panelId];
        if (panelConfig?.dockable === false) break;
        // Pass 'default' as targetTabGroupId so the reducer uses the saved
        // sourceTabGroupId from when the panel was originally floated
        this.dispatch({
          type: 'DOCK_FLOATING',
          payload: { panelId, targetTabGroupId: 'default', position: 'center' },
        });
        break;
      }
```

- [ ] **Step 2: Run all tests**

Run: `cd packages/dock-manager-core && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/dock-manager-core/src/dom/DockviewComponent.ts
git commit -m "feat: guard dock-back action for non-dockable panels"
```

---

### Task 5: Add "Show Dialog" button to demo app

**Files:**
- Modify: `apps/demo/src/App.tsx`

- [ ] **Step 1: Add a dialog counter and handler**

In `apps/demo/src/App.tsx`, near the existing `addPanelCounter` (line 78), the counter already exists. Add a dialog counter and handler function inside the `App` component, after the existing `handleAddPanel`:

```typescript
  const handleShowDialog = useCallback(() => {
    if (!api) return;
    const id = `dialog_${++addPanelCounter}`;
    api.addPanel({
      id,
      title: 'Info Dialog',
      widgetType: 'placeholder',
      closable: true,
      dockable: false,
    });
    api.floatPanel({ panelId: id, x: 200, y: 150, width: 360, height: 240 });
    showToast('Opened dialog');
  }, [api]);
```

- [ ] **Step 2: Add the button to the toolbar**

In the toolbar section, after the "Add panel" button area (around line 237), add a dialog button. Find the `<Btn icon={<Plus` line and add after it:

```tsx
            <Btn icon={<Info className="w-3.5 h-3.5" />} title="Show dialog (non-dockable)" onClick={handleShowDialog} />
```

The `Info` icon is already imported (line 22).

- [ ] **Step 3: Build and verify the demo**

Run: `cd /Users/develop/projects/starprojects/dockmanager && npm run build:core && npm run build && npm run build --workspace=demo`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add apps/demo/src/App.tsx
git commit -m "feat: add Show Dialog button to demo for non-dockable floating panel"
```

---

### Task 6: Run full test suite and verify

- [ ] **Step 1: Run core tests**

Run: `cd packages/dock-manager-core && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run React tests**

Run: `cd packages/react-dock-manager && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Build all packages**

Run: `cd /Users/develop/projects/starprojects/dockmanager && npm run build:all`
Expected: All builds succeed
