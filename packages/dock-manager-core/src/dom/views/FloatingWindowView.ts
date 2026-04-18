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

export type { IDisposable };
export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_WIDTH = 200;
const MIN_HEIGHT = 120;
const CURSOR_MAP: Record<ResizeDirection, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize', sw: 'nesw-resize',
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

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, style: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (style) e.style.cssText = style;
  return e;
};

const makeTitleBtn = (cls: string, action: string, panelId: string, title: string, html: string): HTMLButtonElement => {
  const btn = el('button', cls, '');
  btn.setAttribute('data-action', action);
  btn.setAttribute('data-panel-id', panelId);
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.innerHTML = html;
  return btn;
};

export class FloatingWindowView {
  readonly element: HTMLDivElement;
  private floating: FloatingPanel;
  private panel: PanelConfig;
  private activePaneId: string;
  private callbacks: FloatingWindowViewCallbacks;
  private titleBarEl!: HTMLDivElement;
  private titleTextEl!: HTMLSpanElement;
  private contentAreaEl!: HTMLDivElement;
  private readonly contentSlot = new MutableDisposable();
  private readonly disposables = new CompositeDisposable();
  private isDragging = false;
  private disposed = false;
  private dragStart = { x: 0, y: 0, panelX: 0, panelY: 0 };
  private resizeDir: ResizeDirection | null = null;
  private resizeStart = { x: 0, y: 0, w: 0, h: 0, panelX: 0, panelY: 0 };
  private boundDragMove: ((e: MouseEvent) => void) | null = null;
  private boundDragUp: (() => void) | null = null;
  private boundResizeMove: ((e: MouseEvent) => void) | null = null;
  private boundResizeUp: (() => void) | null = null;
  private dragRafId: number | null = null;
  private resizeRafId: number | null = null;
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
    const { panelId } = floating;

    // Root element
    this.element = el('div', this.getRootClassName(), this.getRootStyle());
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-label', panel.title);
    this.element.addEventListener('mousedown', () => {
      callbacks.onBringToFront(panelId);
      callbacks.onSetActivePane(panelId);
    });

    // Title bar
    this.titleBarEl = el('div', 'dock-floating-titlebar',
      'display:flex;align-items:center;justify-content:space-between;padding:0 12px;height:32px;cursor:move;user-select:none;flex-shrink:0;background:hsl(var(--dock-panel-header));');
    this.element.appendChild(this.titleBarEl);

    this.titleTextEl = el('span', 'dock-floating-title', 'font-size:12px;font-weight:500;');
    this.titleTextEl.textContent = panel.title;
    this.titleBarEl.appendChild(this.titleTextEl);

    // Title bar buttons
    const btnContainer = el('div', '', 'display:flex;align-items:center;gap:0;');
    if (panel.dockable !== false)
      btnContainer.appendChild(makeTitleBtn('dock-floating-titlebar-btn', 'dock-back', panelId, this.resourceStrings.dock, iconDockBack()));
    btnContainer.appendChild(makeTitleBtn('dock-floating-titlebar-btn', 'close', panelId, this.resourceStrings.close, iconClose(14)));
    this.titleBarEl.appendChild(btnContainer);

    // Title bar drag (left button only, not on buttons)
    this.titleBarEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      this.startDrag(e);
    });
    if (panel.dockable !== false) {
      this.titleBarEl.addEventListener('dblclick', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        callbacks.onDockBack(panelId);
      });
    }
    this.titleBarEl.addEventListener('touchstart', (e) => {
      if ((e.target as HTMLElement).closest('button') || e.touches.length !== 1) return;
      e.preventDefault();
      this.startDrag({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY } as MouseEvent);
    }, { passive: false });

    // Content area
    this.contentAreaEl = el('div', '', 'flex:1;overflow:hidden;');
    this.element.appendChild(this.contentAreaEl);
    this.contentSlot.value = callbacks.createContent(panelId, this.contentAreaEl);
    this.disposables.add(this.contentSlot);

    if (panel.floatingResizable !== false) this.createResizeHandles();
  }

  update(floating: FloatingPanel, panel: PanelConfig, activePaneId: string): void {
    this.floating = floating;
    this.panel = panel;
    this.activePaneId = activePaneId;
    this.element.style.left = `${floating.x}px`;
    this.element.style.top = `${floating.y}px`;
    this.element.style.width = `${floating.width}px`;
    this.element.style.height = `${floating.height}px`;
    this.element.style.zIndex = `${floating.zIndex + 1000}`;
    this.element.className = this.getRootClassName();
    this.titleTextEl.textContent = panel.title;
    this.element.setAttribute('aria-label', panel.title);
  }

  dispose(): void {
    this.disposed = true;
    if (this.dragRafId !== null) { cancelAnimationFrame(this.dragRafId); this.dragRafId = null; }
    if (this.resizeRafId !== null) { cancelAnimationFrame(this.resizeRafId); this.resizeRafId = null; }
    this.removeDragListeners();
    this.removeResizeListeners();
    this.element.removeEventListener('mousedown', this.onResizeHandleMouseDown);
    this.disposables.dispose();
    this.element.parentNode?.removeChild(this.element);
  }

  private getRootClassName(): string {
    return `dock-floating-window${this.activePaneId === this.floating.panelId ? ' dock-pane-active' : ''}`;
  }

  private getRootStyle(): string {
    const { x, y, width, height, zIndex } = this.floating;
    return `position:absolute;display:flex;flex-direction:column;overflow:visible;border:1px solid hsl(var(--dock-border));border-radius:2px;background:hsl(var(--dock-surface));box-shadow:0 8px 32px hsl(var(--dock-float-shadow) / 0.18), 0 2px 8px hsl(var(--dock-float-shadow) / 0.1);left:${x}px;top:${y}px;width:${width}px;height:${height}px;z-index:${zIndex + 1000};`;
  }

  private addTouchHandlers(onMove: (e: MouseEvent) => void, onUp: () => void): void {
    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      ev.preventDefault();
      onMove({ clientX: ev.touches[0].clientX, clientY: ev.touches[0].clientY } as MouseEvent);
    };
    const onTouchEnd = () => {
      onUp();
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }

  private startDrag(e: MouseEvent): void {
    this.isDragging = true;
    this.callbacks.onBringToFront(this.floating.panelId);
    this.dragStart = { x: e.clientX, y: e.clientY, panelX: this.floating.x, panelY: this.floating.y };

    let latestX = this.floating.x, latestY = this.floating.y;
    let indicatorsShown = false;
    const dragManager = this.callbacks.getDragManager?.();

    this.boundDragMove = (ev: MouseEvent) => {
      let newX = this.dragStart.panelX + ev.clientX - this.dragStart.x;
      let newY = this.dragStart.panelY + ev.clientY - this.dragStart.y;

      // Snap to viewport edges within 10px (skip while dock indicators are active)
      if (!indicatorsShown) {
        const cr = this.element.parentElement?.getBoundingClientRect();
        if (cr) {
          const snap = 10;
          if (newX < snap) newX = 0;
          if (newY < snap) newY = 0;
          if (cr.width - (newX + this.floating.width) < snap) newX = cr.width - this.floating.width;
          if (cr.height - (newY + this.floating.height) < snap) newY = cr.height - this.floating.height;
        }
      }
      latestX = newX;
      latestY = newY;

      // Show dock indicators after 5px of movement
      if (!indicatorsShown && dragManager && this.panel.dockable !== false) {
        const dx = ev.clientX - this.dragStart.x, dy = ev.clientY - this.dragStart.y;
        if (Math.sqrt(dx * dx + dy * dy) >= 5) {
          indicatorsShown = true;
          dragManager.startDrag(this.floating.panelId, this.panel.title, ev, true);
        }
      }

      if (this.dragRafId === null) {
        this.dragRafId = requestAnimationFrame(() => {
          this.dragRafId = null;
          this.callbacks.onUpdateFloating(this.floating.panelId, { x: latestX, y: latestY });
        });
      }
    };

    this.boundDragUp = () => {
      try {
        if (this.dragRafId !== null) { cancelAnimationFrame(this.dragRafId); this.dragRafId = null; }
        if (indicatorsShown && dragManager) {
          queueMicrotask(() => {
            if (!this.disposed) this.callbacks.onUpdateFloating(this.floating.panelId, { x: latestX, y: latestY });
          });
        } else {
          this.callbacks.onUpdateFloating(this.floating.panelId, { x: latestX, y: latestY });
        }
        this.isDragging = false;
        this.removeDragListeners();
      } finally {
        document.body.style.userSelect = '';
      }
    };

    this.addTouchHandlers(this.boundDragMove, this.boundDragUp);
    document.addEventListener('mousemove', this.boundDragMove);
    document.addEventListener('mouseup', this.boundDragUp);
    document.body.style.userSelect = 'none';
  }

  private removeDragListeners(): void {
    if (this.boundDragMove) { document.removeEventListener('mousemove', this.boundDragMove); this.boundDragMove = null; }
    if (this.boundDragUp) { document.removeEventListener('mouseup', this.boundDragUp); this.boundDragUp = null; }
  }

  private onResizeHandleMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    const dir = (e.target as HTMLElement).getAttribute('data-resize') as ResizeDirection | null;
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    this.startResize(dir, e);
  };

  private createResizeHandles(): void {
    const edge = 4, corner = 10, cs = corner + edge;
    const makeHandle = (dir: ResizeDirection, style: string) => {
      const h = document.createElement('div');
      h.setAttribute('data-resize', dir);
      h.style.cssText = `position:absolute;${style}cursor:${CURSOR_MAP[dir]};`;
      this.element.appendChild(h);
    };
    makeHandle('n', `top:${-edge}px;left:${corner}px;right:${corner}px;height:${edge * 2}px;`);
    makeHandle('s', `bottom:${-edge}px;left:${corner}px;right:${corner}px;height:${edge * 2}px;`);
    makeHandle('w', `left:${-edge}px;top:${corner}px;bottom:${corner}px;width:${edge * 2}px;`);
    makeHandle('e', `right:${-edge}px;top:${corner}px;bottom:${corner}px;width:${edge * 2}px;`);
    makeHandle('nw', `top:${-edge}px;left:${-edge}px;width:${cs}px;height:${cs}px;`);
    makeHandle('ne', `top:${-edge}px;right:${-edge}px;width:${cs}px;height:${cs}px;`);
    makeHandle('sw', `bottom:${-edge}px;left:${-edge}px;width:${cs}px;height:${cs}px;`);
    makeHandle('se', `bottom:${-edge}px;right:${-edge}px;width:${cs}px;height:${cs}px;`);
    this.element.addEventListener('mousedown', this.onResizeHandleMouseDown);
  }

  private startResize(dir: ResizeDirection, e: MouseEvent): void {
    this.resizeDir = dir;
    this.callbacks.onBringToFront(this.floating.panelId);
    this.resizeStart = { x: e.clientX, y: e.clientY, w: this.floating.width, h: this.floating.height, panelX: this.floating.x, panelY: this.floating.y };

    let latestUpdates: Record<string, number> = {};

    this.boundResizeMove = (ev: MouseEvent) => {
      if (!this.resizeDir) return;
      const s = this.resizeStart;
      const dx = ev.clientX - s.x, dy = ev.clientY - s.y;
      const updates: Record<string, number> = {};
      if (this.resizeDir.includes('e')) { updates.width = Math.max(MIN_WIDTH, s.w + dx); }
      else if (this.resizeDir.includes('w')) { const nw = Math.max(MIN_WIDTH, s.w - dx); updates.width = nw; updates.x = s.panelX + (s.w - nw); }
      if (this.resizeDir.includes('s')) { updates.height = Math.max(MIN_HEIGHT, s.h + dy); }
      else if (this.resizeDir.includes('n')) { const nh = Math.max(MIN_HEIGHT, s.h - dy); updates.height = nh; updates.y = s.panelY + (s.h - nh); }
      latestUpdates = updates;
      if (this.resizeRafId === null) {
        this.resizeRafId = requestAnimationFrame(() => {
          this.resizeRafId = null;
          this.callbacks.onUpdateFloating(this.floating.panelId, latestUpdates);
        });
      }
    };

    this.boundResizeUp = () => {
      try {
        if (this.resizeRafId !== null) { cancelAnimationFrame(this.resizeRafId); this.resizeRafId = null; }
        if (Object.keys(latestUpdates).length > 0) this.callbacks.onUpdateFloating(this.floating.panelId, latestUpdates);
        this.resizeDir = null;
        this.removeResizeListeners();
      } finally {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    this.addTouchHandlers(this.boundResizeMove, this.boundResizeUp);
    document.addEventListener('mousemove', this.boundResizeMove);
    document.addEventListener('mouseup', this.boundResizeUp);
    document.body.style.cursor = CURSOR_MAP[dir];
    document.body.style.userSelect = 'none';
  }

  private removeResizeListeners(): void {
    if (this.boundResizeMove) { document.removeEventListener('mousemove', this.boundResizeMove); this.boundResizeMove = null; }
    if (this.boundResizeUp) { document.removeEventListener('mouseup', this.boundResizeUp); this.boundResizeUp = null; }
  }
}
