import type { DockPosition, PreventableDockEvent, PanelConfig } from '../types/dock';
import { createPreventableEvent } from '../types/dock';
import { DockIndicatorRenderer } from './DockIndicatorRenderer';
import { TabReorderManager } from './TabReorderManager';

// ─── Options ────────────────────────────────────────────────────────

export interface DockDragManagerOptions {
  containerElement: HTMLElement;
  onDrop: (sourceId: string, targetId: string, position: DockPosition) => void;
  onFloat: (sourceId: string, x: number, y: number) => void;
  /** Called when the user clicks a draggable element without dragging (< 5px movement). */
  onSelect?: (sourceId: string) => void;
  /** Called before a drop is executed. Return event.defaultPrevented to cancel the drop. */
  onWillDrop?: (event: PreventableDockEvent, sourceId: string, targetId: string, position: DockPosition) => void;
  /** Called when a tab is reordered within its tab strip by dragging. */
  onReorderTab?: (tabGroupId: string, panelId: string, newIndex: number) => void;
  /** Returns panel config by id. Used for disabled/documentOnly checks. */
  getPanelConfig?: (panelId: string) => PanelConfig | undefined;
  /** Whether to show edge dock indicators. Defaults to true. */
  allowRootDock?: boolean;
  theme: 'light' | 'dark';
}

// ─── DockDragManager ───────────────────────────────────────────────

/**
 * Framework-agnostic drag & interaction manager for dock layouts.
 *
 * Uses **event delegation** on the container element — frameworks do NOT
 * need to wire up individual mousedown handlers. Instead, mark elements
 * with data attributes:
 *
 *   `data-tab-id="panelId"`   — on any draggable element (tabs, title bars)
 *   `data-dock-target="id"`   — on drop-target containers (tab groups)
 *
 * The core listens for mousedown on [data-tab-id] elements and handles
 * the full interaction lifecycle:
 *   click (< 5px) → onSelect callback
 *   drag  (≥ 5px) → onDrop / onFloat callback
 *
 * Visual indicator rendering is delegated to {@link DockIndicatorRenderer}.
 * Tab reordering is delegated to {@link TabReorderManager}.
 */
export class DockDragManager {
  private container: HTMLElement;
  private options: DockDragManagerOptions;

  // Composed sub-managers
  private indicators: DockIndicatorRenderer;
  private reorder: TabReorderManager;

  // Drag state
  private isPending = false;
  private isDragging = false;
  private isReordering = false;
  private _skipGhost = false;
  private sourceId = '';
  private sourceTitle = '';
  private startX = 0;
  private startY = 0;

  // Source pane dimensions for ghost sizing
  private sourcePaneRect: DOMRect | null = null;

  // Current target
  private currentTargetId: string | null = null;
  private currentPosition: DockPosition | null = null;

  // rAF throttle for mousemove hitTest
  private moveRafId: number | null = null;

  // Touch drag state
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private touchStartX = 0;
  private touchStartY = 0;

  constructor(options: DockDragManagerOptions) {
    this.container = options.containerElement;
    this.options = options;
    this.indicators = new DockIndicatorRenderer(options.theme);
    this.reorder = new TabReorderManager();

    // Event delegation: single listener on container handles all tab/title interactions
    this.container.addEventListener('mousedown', this.onContainerMouseDown);

    // Touch support: long-press (300ms) to start drag
    this.container.addEventListener('touchstart', this.onContainerTouchStart, { passive: false });
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Manually start a drag for a given source. Normally you don't need this —
   * the core auto-detects mousedown on [data-tab-id] elements via event
   * delegation. Use this only for custom drag sources not in the DOM tree.
   *
   * @param skipGhost - If true, don't create a ghost element (useful for floating windows
   *   that are already visible — the window itself serves as the drag preview).
   */
  startDrag(sourceId: string, sourceTitle: string, event: PointerEvent | MouseEvent, skipGhost = false): void {
    this._skipGhost = skipGhost;
    this.beginTracking(sourceId, sourceTitle, event.clientX, event.clientY);
  }

  /** Update theme at runtime */
  setTheme(theme: 'light' | 'dark'): void {
    this.options.theme = theme;
    this.indicators.setTheme(theme);
  }

  /** Update the onSelect callback */
  setOnSelect(onSelect: DockDragManagerOptions['onSelect']): void {
    this.options.onSelect = onSelect;
  }

  /** Update the onWillDrop callback */
  setOnWillDrop(onWillDrop: DockDragManagerOptions['onWillDrop']): void {
    this.options.onWillDrop = onWillDrop;
  }

  /** Clean up all listeners and DOM elements */
  dispose(): void {
    this.container.removeEventListener('mousedown', this.onContainerMouseDown);
    this.container.removeEventListener('touchstart', this.onContainerTouchStart);
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.cancelDrag();
  }

  // ── Touch event handlers ────────────────────────────────────────

  private onContainerTouchStart = (e: TouchEvent): void => {
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const target = touch.target as HTMLElement;

    if (target.tagName === 'BUTTON' || target.closest('button')) return;

    const draggable = target.closest<HTMLElement>('[data-tab-id]');
    if (!draggable) return;

    const panelId = draggable.getAttribute('data-tab-id');
    if (!panelId) return;

    if (this.options.getPanelConfig) {
      const config = this.options.getPanelConfig(panelId);
      if (config?.disabled) return;
    }

    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;

    const title = draggable.getAttribute('data-drag-title')
      || draggable.textContent?.trim()
      || panelId;

    const dockTarget = draggable.closest<HTMLElement>('[data-dock-target]');
    this.sourcePaneRect = dockTarget?.getBoundingClientRect() || null;

    // Long-press: start drag after 300ms
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      e.preventDefault();
      this.beginTracking(panelId, title, this.touchStartX, this.touchStartY);

      // Set up touch move/end handlers
      const onTouchMove = (ev: TouchEvent) => {
        if (ev.touches.length !== 1) return;
        ev.preventDefault();
        const t = ev.touches[0];
        this.onMouseMove({ clientX: t.clientX, clientY: t.clientY } as MouseEvent);
      };
      const onTouchEnd = (ev: TouchEvent) => {
        const t = ev.changedTouches[0];
        this.onMouseUp({ clientX: t.clientX, clientY: t.clientY, button: 0 } as MouseEvent);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
      };
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    }, 300);

    // Cancel long-press if finger moves too much
    const onEarlyMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      const t = ev.touches[0];
      const dx = t.clientX - this.touchStartX;
      const dy = t.clientY - this.touchStartY;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        if (this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
        document.removeEventListener('touchmove', onEarlyMove);
      }
    };
    const onEarlyEnd = () => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      document.removeEventListener('touchmove', onEarlyMove);
      document.removeEventListener('touchend', onEarlyEnd);
    };
    document.addEventListener('touchmove', onEarlyMove, { passive: true });
    document.addEventListener('touchend', onEarlyEnd);
  };

  // ── Event delegation ───────────────────────────────────────────

  /**
   * Container-level mousedown handler. Detects clicks on [data-tab-id]
   * elements and starts drag tracking.
   */
  private onContainerMouseDown = (e: MouseEvent): void => {
    // Only handle primary button
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;

    // Skip clicks on buttons (close, maximize, etc.)
    if (target.tagName === 'BUTTON' || target.closest('button')) return;

    // Find the closest draggable element with data-tab-id
    const draggable = target.closest<HTMLElement>('[data-tab-id]');
    if (!draggable) return;

    const panelId = draggable.getAttribute('data-tab-id');
    if (!panelId) return;

    // Check if the panel is disabled — fire onSelect but don't start drag tracking
    if (this.options.getPanelConfig) {
      const config = this.options.getPanelConfig(panelId);
      if (config?.disabled) {
        this.options.onSelect?.(panelId);
        return;
      }
    }

    // Get title from the element text or a data attribute
    const title = draggable.getAttribute('data-drag-title')
      || draggable.textContent?.trim()
      || panelId;

    // Capture source pane dimensions for ghost sizing
    const dockTarget = draggable.closest<HTMLElement>('[data-dock-target]');
    this.sourcePaneRect = dockTarget?.getBoundingClientRect() || null;

    // Check if this tab is inside a tab strip with siblings (reorderable)
    const tabContainer = draggable.closest<HTMLElement>('[role="tablist"]');
    if (tabContainer && tabContainer.querySelectorAll('[data-tab-id]').length > 1) {
      this.reorder.sourceTabEl = draggable;
      this.reorder.tabStripEl = tabContainer;
      this.reorder.tabGroupId = dockTarget?.getAttribute('data-dock-target') || null;
    } else {
      this.reorder.reset();
    }

    this.beginTracking(panelId, title, e.clientX, e.clientY);
  };

  // ── Drag tracking ──────────────────────────────────────────────

  private beginTracking(sourceId: string, sourceTitle: string, x: number, y: number): void {
    this.sourceId = sourceId;
    this.sourceTitle = sourceTitle;
    this.startX = x;
    this.startY = y;
    this.isPending = true;
    this.isDragging = false;

    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('keydown', this.onKeyDown);
  }

  // ── Mouse handlers ────────────────────────────────────────────

  private onMouseMove = (e: MouseEvent): void => {
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Phase 1: pending — wait for 5px threshold, then ALWAYS activate drag
    if (this.isPending && !this.isDragging) {
      if (dist < 5) return;
      // Always activate full drag mode (creates ghost + indicators)
      this.activateDrag(e);

      // If source is a tab in a multi-tab strip AND cursor is within strip,
      // enter reorder sub-mode (visual-only, within the active drag)
      if (this.reorder.sourceTabEl && this.reorder.tabStripEl) {
        const stripRect = this.reorder.tabStripEl.getBoundingClientRect();
        const verticalMargin = 30;
        if (e.clientY >= stripRect.top - verticalMargin && e.clientY <= stripRect.bottom + verticalMargin) {
          this.isReordering = true;
          this.reorder.cacheTabsArray();
          this.reorder.addReorderClasses();
          // Hide ghost, dock indicators, and restore pane opacity during reorder
          this.indicators.hideGhost();
          this.indicators.hideDockIndicators();
          if (this.sourcePaneElement) this.sourcePaneElement.style.opacity = '';
          return;
        }
      }
    }

    if (!this.isDragging) return;

    // Tab reorder sub-mode (within active drag — indicators still exist)
    if (this.isReordering && this.reorder.sourceTabEl && this.reorder.tabStripEl) {
      const stripRect = this.reorder.tabStripEl.getBoundingClientRect();
      const verticalMargin = 30;

      // If cursor moves too far vertically, exit reorder sub-mode
      if (e.clientY < stripRect.top - verticalMargin || e.clientY > stripRect.bottom + verticalMargin) {
        this.isReordering = false;
        this.reorder.endReorder(false, this.sourceId);
        // Show ghost, dock indicators, and re-dim pane for dock mode
        this.indicators.showGhost();
        this.indicators.showDockIndicators();
        if (this.sourcePaneElement) this.sourcePaneElement.style.opacity = '0.5';
        // Fall through to normal drag handling below
      } else {
        // Still within tab strip — handle reorder
        this.reorder.handleReorderMove(e.clientX);
        return;
      }
    }

    // Batch ALL visual updates (ghost + hitTest + indicators) inside a single rAF
    // to prevent layout thrashing from interleaved reads/writes
    const cx = e.clientX;
    const cy = e.clientY;
    if (this.moveRafId === null) {
      this.moveRafId = requestAnimationFrame(() => {
        this.moveRafId = null;

        // Move ghost (write-only, no layout read)
        this.indicators.moveGhost(cx, cy, this.sourcePaneRect);

        // 1. Check if cursor is over an EDGE indicator (root-level dock)
        const edgePos = this.indicators.getEdgeIndicatorUnderCursor(cx, cy);
        if (edgePos) {
          const containerRect = this.container.getBoundingClientRect();
          this.currentTargetId = '__root__';
          this.currentPosition = edgePos;
          this.indicators.hideIndicators();
          this.indicators.showPreview(containerRect, edgePos);
          this.indicators.updateEdgeIndicatorActive(edgePos);
          return;
        }
        this.indicators.updateEdgeIndicatorActive(null);

        // 2. Check if cursor is over any pane dock indicator
        const paneHit = this.indicators.getPaneIndicatorUnderCursor(cx, cy);

        if (paneHit) {
          // Hovering over a specific pane's indicator → dock to that pane
          this.currentTargetId = paneHit.targetId;
          this.currentPosition = paneHit.position;
          this.indicators.updateAllPaneIndicatorActive(paneHit.targetId, paneHit.position);
          const el = this.container.querySelector(`[data-dock-target="${paneHit.targetId}"]`);
          if (el) {
            this.indicators.showPreview(el.getBoundingClientRect(), paneHit.position);
          }
        } else {
          // Not over any indicator → will float on drop (no docking)
          this.currentTargetId = null;
          this.currentPosition = null;
          this.indicators.updateAllPaneIndicatorActive(null, null);
          this.indicators.hidePreview();
        }
      });
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.removeListeners();

    if (this.isDragging && this.sourceId) {
      // Cancel pending rAF and do a final synchronous hit test
      if (this.moveRafId !== null) {
        cancelAnimationFrame(this.moveRafId);
        this.moveRafId = null;
      }

      // Final synchronous hit test at drop position
      const edgePos = this.indicators.getEdgeIndicatorUnderCursor(e.clientX, e.clientY);
      if (edgePos) {
        this.currentTargetId = '__root__';
        this.currentPosition = edgePos;
      } else {
        const paneHit = this.indicators.getPaneIndicatorUnderCursor(e.clientX, e.clientY);
        if (paneHit) {
          this.currentTargetId = paneHit.targetId;
          this.currentPosition = paneHit.position;
        }
      }

      // If in reorder sub-mode and no indicator was hit, commit the reorder
      if (this.isReordering && !this.currentTargetId) {
        this.reorder.endReorder(true, this.sourceId, this.options.onReorderTab);
        this.cleanup();
        return;
      }

      // If in reorder sub-mode but an indicator WAS hit, cancel reorder and dock
      if (this.isReordering && this.currentTargetId) {
        this.isReordering = false;
        this.reorder.endReorder(false, this.sourceId); // cancel reorder
        // Fall through to normal drop handling below
      }

      if (this.currentTargetId && this.currentPosition) {
        // Fire onWillDrop preventable event
        if (this.options.onWillDrop) {
          const event = createPreventableEvent('willDrop', this.sourceId);
          this.options.onWillDrop(event, this.sourceId, this.currentTargetId, this.currentPosition);
          if (event.defaultPrevented) {
            this.cleanup();
            return;
          }
        }
        this.options.onDrop(this.sourceId, this.currentTargetId, this.currentPosition);
      } else if (!this._skipGhost) {
        // Only call onFloat for docked panels being floated.
        // When _skipGhost is true, the source is already a floating window
        // whose own drag handler manages positioning via onUpdateFloating.
        this.options.onFloat(this.sourceId, e.clientX - 50, e.clientY - 20);
      }
    } else if (this.isPending && this.sourceId) {
      // Click without drag (< 5px movement) — select the tab
      this.options.onSelect?.(this.sourceId);
    }

    this.cleanup();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.cancelDrag();
    }
  };

  // ── Drag lifecycle ────────────────────────────────────────────

  private sourcePaneElement: HTMLElement | null = null;

  private activateDrag(e: MouseEvent): void {
    this.isPending = false;
    this.isDragging = true;
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    // Dim the source pane to show it's being moved
    const sourcePaneEl = this.container.querySelector<HTMLElement>(`[data-dock-target] [data-tab-id="${this.sourceId}"]`);
    const dockTarget = sourcePaneEl?.closest<HTMLElement>('[data-dock-target]');
    if (dockTarget) {
      this.sourcePaneElement = dockTarget;
      dockTarget.style.opacity = '0.5';
    }

    if (!this._skipGhost) {
      this.indicators.createGhost(e.clientX, e.clientY, this.sourceTitle, this.sourcePaneRect);
    }
    this.indicators.createAllPaneIndicators(this.container, this.sourceId);
    if (this.options.allowRootDock !== false) {
      this.indicators.createEdgeIndicators(this.container);
    }
  }

  private cancelDrag(): void {
    this.removeListeners();
    this.cleanup();
  }

  private removeListeners(): void {
    if (this.moveRafId !== null) {
      cancelAnimationFrame(this.moveRafId);
      this.moveRafId = null;
    }
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('keydown', this.onKeyDown);
  }

  private cleanup(): void {
    if (this.moveRafId !== null) {
      cancelAnimationFrame(this.moveRafId);
      this.moveRafId = null;
    }
    this.isPending = false;
    this.isDragging = false;
    this.isReordering = false;
    this._skipGhost = false;
    this.currentTargetId = null;
    this.currentPosition = null;
    this.sourcePaneRect = null;
    this.reorder.reset();
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    this.indicators.removeAll();

    // Restore source pane opacity
    if (this.sourcePaneElement) {
      this.sourcePaneElement.style.opacity = '1';
      this.sourcePaneElement = null;
    }
  }

  // ── Hit testing ───────────────────────────────────────────────

  private hitTest(cx: number, cy: number): { targetId: string | null; targetRect: DOMRect | null } {
    const elements = document.elementsFromPoint(cx, cy);
    for (const el of elements) {
      const htmlEl = el as HTMLElement;
      const attr = htmlEl.getAttribute?.('data-dock-target');
      if (!attr) continue;
      // Header-collapsed panes refuse drops
      if (htmlEl.hasAttribute('data-header-collapsed')) continue;

      // Document host enforcement: if source panel is documentOnly,
      // only allow drops on document host tab groups
      if (this.options.getPanelConfig && this.sourceId) {
        const sourceConfig = this.options.getPanelConfig(this.sourceId);
        if (sourceConfig?.documentOnly) {
          if (!this.isDocumentHost(htmlEl)) {
            continue;
          }
        }
      }

      return { targetId: attr, targetRect: el.getBoundingClientRect() };
    }
    return { targetId: null, targetRect: null };
  }

  /** Check if a tab group element is a document host area */
  private isDocumentHost(el: HTMLElement): boolean {
    // Explicit attribute check
    if (el.getAttribute('data-document-host') === 'true') return true;

    // Check if any panel in the group has documentOnly: true
    if (this.options.getPanelConfig) {
      const tabEls = el.querySelectorAll('[data-tab-id]');
      for (const tabEl of tabEls) {
        const pid = tabEl.getAttribute('data-tab-id');
        if (pid) {
          const config = this.options.getPanelConfig(pid);
          if (config?.documentOnly) return true;
        }
      }
      // Also check the data-panel-id attribute (single-panel groups)
      const singlePanelId = el.getAttribute('data-panel-id');
      if (singlePanelId) {
        const config = this.options.getPanelConfig(singlePanelId);
        if (config?.documentOnly) return true;
      }
    }
    return false;
  }

  /** Closest-edge zone detection with center dead zone */
  private calcZone(cx: number, cy: number, rect: DOMRect): DockPosition {
    const rx = (cx - rect.left) / rect.width;   // 0..1
    const ry = (cy - rect.top) / rect.height;

    const edgeThreshold = 0.25;

    if (rx < edgeThreshold) return 'left';
    if (rx > 1 - edgeThreshold) return 'right';
    if (ry < edgeThreshold) return 'top';
    if (ry > 1 - edgeThreshold) return 'bottom';

    return 'center';
  }
}
