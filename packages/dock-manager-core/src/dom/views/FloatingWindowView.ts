import type { FloatingPanel, PanelConfig, DockPosition } from '../../types/dock';
import type { DockResourceStrings } from '../../types/resourceStrings';
import { defaultResourceStrings } from '../../types/resourceStrings';
import { iconClose, iconDockBack } from '../icons';
import type { DragManager as DockDragManager } from '../DragManager';
import {
  CompositeDisposable,
  MutableDisposable,
  type IDisposable,
} from '../../utils/lifecycle';

// ─── Interfaces ──────────────────────────────────────────────────────

export type { IDisposable };

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_WIDTH = 200;
const MIN_HEIGHT = 120;

const CURSOR_MAP: Record<ResizeDirection, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  sw: 'nesw-resize',
};

export interface FloatingWindowViewCallbacks {
  onUpdateFloating: (panelId: string, updates: Partial<Pick<FloatingPanel, 'x' | 'y' | 'width' | 'height'>>) => void;
  onBringToFront: (panelId: string) => void;
  onDockBack: (panelId: string) => void;
  onClosePanel: (panelId: string) => void;
  onSetActivePane: (panelId: string) => void;
  onDockToTarget: (panelId: string, targetId: string, position: DockPosition) => void;
  createContent: (panelId: string, container: HTMLElement) => IDisposable;
  /** Reference to the DockDragManager for showing indicators during floating window drag */
  getDragManager?: () => DockDragManager | null;
}

// ─── FloatingWindowView ──────────────────────────────────────────────

export class FloatingWindowView {
  readonly element: HTMLDivElement;

  private floating: FloatingPanel;
  private panel: PanelConfig;
  private activePaneId: string;
  private callbacks: FloatingWindowViewCallbacks;

  // DOM references
  private titleBarEl: HTMLDivElement;
  private titleTextEl: HTMLSpanElement;
  private contentAreaEl: HTMLDivElement;

  // Content management — held in a slot so it's auto-disposed and replaceable.
  private readonly contentSlot = new MutableDisposable();
  // Bag for any owned resources we want torn down on dispose().
  private readonly disposables = new CompositeDisposable();

  // Drag state
  private isDragging = false;
  private disposed = false;
  private dragStart = { x: 0, y: 0, panelX: 0, panelY: 0 };

  // Resize state
  private resizeDir: ResizeDirection | null = null;
  private resizeStart = { x: 0, y: 0, w: 0, h: 0, panelX: 0, panelY: 0 };

  // Bound handlers
  private boundDragMove: ((e: MouseEvent) => void) | null = null;
  private boundDragUp: (() => void) | null = null;
  private boundResizeMove: ((e: MouseEvent) => void) | null = null;
  private boundResizeUp: (() => void) | null = null;

  // rAF throttle IDs
  private dragRafId: number | null = null;
  private resizeRafId: number | null = null;

  // Resource strings for localization
  private resourceStrings: DockResourceStrings;

  constructor(
    floating: FloatingPanel,
    panel: PanelConfig,
    activePaneId: string,
    callbacks: FloatingWindowViewCallbacks,
    resourceStrings?: Partial<DockResourceStrings>,
  ) {
    this.floating = floating;
    this.panel = panel;
    this.activePaneId = activePaneId;
    this.callbacks = callbacks;
    this.resourceStrings = { ...defaultResourceStrings, ...resourceStrings };

    // Create root element
    this.element = document.createElement('div');
    this.element.className = this.getRootClassName();
    this.element.style.cssText = this.getRootStyle();
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-label', panel.title);

    // Click to bring to front and set active
    this.element.addEventListener('mousedown', () => {
      this.callbacks.onBringToFront(this.floating.panelId);
      this.callbacks.onSetActivePane(this.floating.panelId);
    });

    // Title bar
    this.titleBarEl = document.createElement('div');
    this.titleBarEl.className = 'dock-floating-titlebar';
    this.titleBarEl.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;padding:0 12px;height:32px;cursor:move;user-select:none;flex-shrink:0;background:hsl(var(--dock-panel-header));';
    this.element.appendChild(this.titleBarEl);

    // Title text — no inline color, CSS handles active/inactive via .dock-floating-title
    this.titleTextEl = document.createElement('span');
    this.titleTextEl.className = 'dock-floating-title';
    this.titleTextEl.style.cssText = 'font-size:12px;font-weight:500;';
    this.titleTextEl.textContent = panel.title;
    // Do NOT add data-tab-id here — the floating window is inside the
    // DockDragManager's container, so a data-tab-id attribute would cause
    // the drag manager to hijack the mousedown and interfere with the
    // floating window's own drag handling. Active pane tracking is handled
    // by the mousedown listener on this.element (root) instead.
    this.titleBarEl.appendChild(this.titleTextEl);

    // Title bar buttons
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display:flex;align-items:center;gap:0;';

    // Dock back button — hover handled by CSS: .dock-floating-titlebar-btn:hover
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

    // Close button — hover handled by CSS: .dock-floating-titlebar-btn:hover
    const closeBtn = document.createElement('button');
    closeBtn.className = 'dock-floating-titlebar-btn';
    closeBtn.setAttribute('data-action', 'close');
    closeBtn.setAttribute('data-panel-id', floating.panelId);
    closeBtn.title = this.resourceStrings.close;
    closeBtn.setAttribute('aria-label', this.resourceStrings.close);
    closeBtn.innerHTML = iconClose(14);
    btnContainer.appendChild(closeBtn);

    this.titleBarEl.appendChild(btnContainer);

    // Title bar drag
    this.titleBarEl.addEventListener('mousedown', (e) => {
      // Only start drag on primary (left) button. Right/middle clicks must not
      // capture the cursor — otherwise a right-click on the title bar would
      // silently begin a drag that follows the mouse until the next click.
      if (e.button !== 0) return;
      // Don't drag on button clicks
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      this.startDrag(e);
    });

    // Double-click titlebar → dock back
    if (panel.dockable !== false) {
      this.titleBarEl.addEventListener('dblclick', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        this.callbacks.onDockBack(this.floating.panelId);
      });
    }

    // Touch support for title bar drag
    this.titleBarEl.addEventListener('touchstart', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      this.startDrag({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
    }, { passive: false });

    // Content area
    this.contentAreaEl = document.createElement('div');
    this.contentAreaEl.style.cssText = 'flex:1;overflow:hidden;';
    this.element.appendChild(this.contentAreaEl);

    // Mount content
    this.contentSlot.value = this.callbacks.createContent(floating.panelId, this.contentAreaEl);
    this.disposables.add(this.contentSlot);

    // Resize handles (skip if floatingResizable is explicitly false)
    if (panel.floatingResizable !== false) {
      this.createResizeHandles();
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  update(floating: FloatingPanel, panel: PanelConfig, activePaneId: string): void {
    this.floating = floating;
    this.panel = panel;
    this.activePaneId = activePaneId;

    // Update position/size
    this.element.style.left = `${floating.x}px`;
    this.element.style.top = `${floating.y}px`;
    this.element.style.width = `${floating.width}px`;
    this.element.style.height = `${floating.height}px`;
    this.element.style.zIndex = `${floating.zIndex + 1000}`;

    // Update active state
    this.element.className = this.getRootClassName();

    // Update title
    this.titleTextEl.textContent = panel.title;
    this.element.setAttribute('aria-label', panel.title);
  }

  dispose(): void {
    this.disposed = true;
    // Cancel any pending rAFs
    if (this.dragRafId !== null) {
      cancelAnimationFrame(this.dragRafId);
      this.dragRafId = null;
    }
    if (this.resizeRafId !== null) {
      cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = null;
    }

    // Remove listeners in case dispose happens during active drag/resize
    this.removeDragListeners();
    this.removeResizeListeners();

    // Remove delegated resize handle listener
    this.element.removeEventListener('mousedown', this.onResizeHandleMouseDown);

    this.disposables.dispose();

    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }

  // ── Private: Styles ─────────────────────────────────────────────

  private getRootClassName(): string {
    const isActive = this.activePaneId === this.floating.panelId;
    return `dock-floating-window${isActive ? ' dock-pane-active' : ''}`;
  }

  private getRootStyle(): string {
    return `position:absolute;display:flex;flex-direction:column;overflow:visible;border:1px solid hsl(var(--dock-border));border-radius:2px;background:hsl(var(--dock-surface));box-shadow:0 8px 32px hsl(var(--dock-float-shadow) / 0.18), 0 2px 8px hsl(var(--dock-float-shadow) / 0.1);left:${this.floating.x}px;top:${this.floating.y}px;width:${this.floating.width}px;height:${this.floating.height}px;z-index:${this.floating.zIndex + 1000};`;
  }

  // ── Private: Title bar drag ─────────────────────────────────────

  private startDrag(e: MouseEvent): void {
    this.isDragging = true;
    this.callbacks.onBringToFront(this.floating.panelId);
    this.dragStart = {
      x: e.clientX,
      y: e.clientY,
      panelX: this.floating.x,
      panelY: this.floating.y,
    };

    // Track latest position for batched dispatch
    let latestX = this.floating.x;
    let latestY = this.floating.y;
    let indicatorsShown = false;
    const dragManager = this.callbacks.getDragManager?.();

    this.boundDragMove = (ev: MouseEvent) => {
      let newX = this.dragStart.panelX + ev.clientX - this.dragStart.x;
      let newY = this.dragStart.panelY + ev.clientY - this.dragStart.y;

      // Snap to viewport edges within 10px (skip while dock indicators are active
      // so large panels can still be dragged to edge dock targets)
      if (!indicatorsShown) {
        const containerRect = this.element.parentElement?.getBoundingClientRect();
        if (containerRect) {
          const snapDist = 10;
          const relX = newX;
          const relY = newY;
          const relRight = relX + this.floating.width;
          const relBottom = relY + this.floating.height;
          const containerW = containerRect.width;
          const containerH = containerRect.height;

          if (relX < snapDist) newX = 0;
          if (relY < snapDist) newY = 0;
          if (containerW - relRight < snapDist) newX = containerW - this.floating.width;
          if (containerH - relBottom < snapDist) newY = containerH - this.floating.height;
        }
      }

      latestX = newX;
      latestY = newY;

      // Show dock indicators after 5px of movement (use DockDragManager for this)
      if (!indicatorsShown && dragManager && this.panel.dockable !== false) {
        const dx = ev.clientX - this.dragStart.x;
        const dy = ev.clientY - this.dragStart.y;
        if (Math.sqrt(dx * dx + dy * dy) >= 5) {
          indicatorsShown = true;
          // Use DockDragManager to show indicators for docking the floating panel
          dragManager.startDrag(this.floating.panelId, this.panel.title, ev, true /* skipGhost */);
        }
      }

      // Batch dispatch inside rAF
      if (this.dragRafId === null) {
        this.dragRafId = requestAnimationFrame(() => {
          this.dragRafId = null;
          this.callbacks.onUpdateFloating(this.floating.panelId, { x: latestX, y: latestY });
        });
      }
    };

    this.boundDragUp = () => {
      try {
        // Cancel pending rAF
        if (this.dragRafId !== null) {
          cancelAnimationFrame(this.dragRafId);
          this.dragRafId = null;
        }

        if (indicatorsShown && dragManager) {
          // DockDragManager's onMouseUp fires on the same event.
          // It handles docking (if on indicator) or floating (if not).
          // We only update position if the panel is still floating
          // (i.e., DockDragManager didn't dock it).
          // Use a microtask to run AFTER DockDragManager's onMouseUp.
          queueMicrotask(() => {
            // Check if the panel is still floating (wasn't docked by DockDragManager)
            const stillFloating = !this.disposed;
            if (stillFloating) {
              this.callbacks.onUpdateFloating(this.floating.panelId, { x: latestX, y: latestY });
            }
          });
        } else {
          // No indicators — simple position update
          this.callbacks.onUpdateFloating(this.floating.panelId, { x: latestX, y: latestY });
        }

        this.isDragging = false;
        this.removeDragListeners();
      } finally {
        document.body.style.userSelect = '';
      }
    };

    // Touch handlers for drag
    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      ev.preventDefault();
      this.boundDragMove?.({ clientX: ev.touches[0].clientX, clientY: ev.touches[0].clientY } as MouseEvent);
    };
    const onTouchEnd = () => {
      this.boundDragUp?.();
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };

    document.addEventListener('mousemove', this.boundDragMove);
    document.addEventListener('mouseup', this.boundDragUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.body.style.userSelect = 'none';
  }

  private removeDragListeners(): void {
    if (this.boundDragMove) {
      document.removeEventListener('mousemove', this.boundDragMove);
      this.boundDragMove = null;
    }
    if (this.boundDragUp) {
      document.removeEventListener('mouseup', this.boundDragUp);
      this.boundDragUp = null;
    }
  }

  // ── Private: Resize handles ─────────────────────────────────────

  /** Event delegation handler for resize handle mousedown */
  private onResizeHandleMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const dir = target.getAttribute('data-resize') as ResizeDirection | null;
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    this.startResize(dir, e);
  };

  private createResizeHandles(): void {
    const edgeSize = 4;
    const cornerSize = 10;

    const makeHandle = (dir: ResizeDirection, style: string) => {
      const handle = document.createElement('div');
      handle.setAttribute('data-resize', dir);
      handle.style.cssText = `position:absolute;${style}cursor:${CURSOR_MAP[dir]};`;
      this.element.appendChild(handle);
    };

    // Edge handles
    makeHandle('n', `top:${-edgeSize}px;left:${cornerSize}px;right:${cornerSize}px;height:${edgeSize * 2}px;`);
    makeHandle('s', `bottom:${-edgeSize}px;left:${cornerSize}px;right:${cornerSize}px;height:${edgeSize * 2}px;`);
    makeHandle('w', `left:${-edgeSize}px;top:${cornerSize}px;bottom:${cornerSize}px;width:${edgeSize * 2}px;`);
    makeHandle('e', `right:${-edgeSize}px;top:${cornerSize}px;bottom:${cornerSize}px;width:${edgeSize * 2}px;`);

    // Corner handles
    const cs = cornerSize + edgeSize;
    makeHandle('nw', `top:${-edgeSize}px;left:${-edgeSize}px;width:${cs}px;height:${cs}px;`);
    makeHandle('ne', `top:${-edgeSize}px;right:${-edgeSize}px;width:${cs}px;height:${cs}px;`);
    makeHandle('sw', `bottom:${-edgeSize}px;left:${-edgeSize}px;width:${cs}px;height:${cs}px;`);
    makeHandle('se', `bottom:${-edgeSize}px;right:${-edgeSize}px;width:${cs}px;height:${cs}px;`);

    // Single delegated listener on the root element for all resize handles
    this.element.addEventListener('mousedown', this.onResizeHandleMouseDown);
  }

  private startResize(dir: ResizeDirection, e: MouseEvent): void {
    this.resizeDir = dir;
    this.callbacks.onBringToFront(this.floating.panelId);
    this.resizeStart = {
      x: e.clientX,
      y: e.clientY,
      w: this.floating.width,
      h: this.floating.height,
      panelX: this.floating.x,
      panelY: this.floating.y,
    };

    // Track latest updates for batched dispatch
    let latestUpdates: Record<string, number> = {};

    this.boundResizeMove = (ev: MouseEvent) => {
      if (!this.resizeDir) return;
      const s = this.resizeStart;
      const dx = ev.clientX - s.x;
      const dy = ev.clientY - s.y;
      const updates: Record<string, number> = {};

      // Horizontal
      if (this.resizeDir.includes('e')) {
        updates.width = Math.max(MIN_WIDTH, s.w + dx);
      } else if (this.resizeDir.includes('w')) {
        const newWidth = Math.max(MIN_WIDTH, s.w - dx);
        updates.width = newWidth;
        updates.x = s.panelX + (s.w - newWidth);
      }

      // Vertical
      if (this.resizeDir.includes('s')) {
        updates.height = Math.max(MIN_HEIGHT, s.h + dy);
      } else if (this.resizeDir.includes('n')) {
        const newHeight = Math.max(MIN_HEIGHT, s.h - dy);
        updates.height = newHeight;
        updates.y = s.panelY + (s.h - newHeight);
      }

      latestUpdates = updates;

      // Batch dispatch inside rAF
      if (this.resizeRafId === null) {
        this.resizeRafId = requestAnimationFrame(() => {
          this.resizeRafId = null;
          this.callbacks.onUpdateFloating(this.floating.panelId, latestUpdates);
        });
      }
    };

    this.boundResizeUp = () => {
      try {
        // Cancel pending rAF and do final dispatch
        if (this.resizeRafId !== null) {
          cancelAnimationFrame(this.resizeRafId);
          this.resizeRafId = null;
        }
        if (Object.keys(latestUpdates).length > 0) {
          this.callbacks.onUpdateFloating(this.floating.panelId, latestUpdates);
        }
        this.resizeDir = null;
        this.removeResizeListeners();
      } finally {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    // Touch handlers for resize
    const onResizeTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      ev.preventDefault();
      this.boundResizeMove?.({ clientX: ev.touches[0].clientX, clientY: ev.touches[0].clientY } as MouseEvent);
    };
    const onResizeTouchEnd = () => {
      this.boundResizeUp?.();
      document.removeEventListener('touchmove', onResizeTouchMove);
      document.removeEventListener('touchend', onResizeTouchEnd);
    };

    document.addEventListener('mousemove', this.boundResizeMove);
    document.addEventListener('mouseup', this.boundResizeUp);
    document.addEventListener('touchmove', onResizeTouchMove, { passive: false });
    document.addEventListener('touchend', onResizeTouchEnd);
    document.body.style.cursor = CURSOR_MAP[dir];
    document.body.style.userSelect = 'none';
  }

  private removeResizeListeners(): void {
    if (this.boundResizeMove) {
      document.removeEventListener('mousemove', this.boundResizeMove);
      this.boundResizeMove = null;
    }
    if (this.boundResizeUp) {
      document.removeEventListener('mouseup', this.boundResizeUp);
      this.boundResizeUp = null;
    }
  }
}
