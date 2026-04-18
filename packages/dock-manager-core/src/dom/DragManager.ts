import type { DockPosition, PreventableDockEvent, PanelConfig } from '../types/dock';
import { createPreventableEvent } from '../types/dock';

// ─── Theme color palettes ──────────────────────────────────────────

export const THEME_COLORS = {
  light: {
    bg: 'rgba(255,255,255,0.92)', border: 'rgba(0,0,0,0.2)', accent: 'rgba(41,121,255,0.8)',
    text: '#555', previewBg: 'rgba(41,121,255,0.12)', previewBorder: 'rgba(41,121,255,0.5)',
    ghost: 'rgba(255,255,255,0.95)', ghostBorder: 'rgba(0,0,0,0.25)',
    indicatorBg: 'rgba(255,255,255,0.92)', indicatorBorder: 'rgba(0,0,0,0.25)',
    indicatorActiveBg: 'rgba(41,121,255,0.2)', indicatorActiveBorder: 'rgba(41,121,255,0.7)',
  },
  dark: {
    bg: 'rgba(45,45,48,0.95)', border: 'rgba(255,255,255,0.2)', accent: 'rgba(0,122,204,0.8)',
    text: '#aaa', previewBg: 'rgba(0,122,204,0.15)', previewBorder: 'rgba(0,122,204,0.5)',
    ghost: 'rgba(45,45,48,0.95)', ghostBorder: 'rgba(255,255,255,0.25)',
    indicatorBg: 'rgba(50,50,55,0.92)', indicatorBorder: 'rgba(255,255,255,0.25)',
    indicatorActiveBg: 'rgba(0,122,204,0.3)', indicatorActiveBorder: 'rgba(0,122,204,0.8)',
  },
};

// ─── Options ────────────────────────────────────────────────────────

export interface DockDragManagerOptions {
  containerElement: HTMLElement;
  onDrop: (sourceId: string, targetId: string, position: DockPosition) => void;
  onFloat: (sourceId: string, x: number, y: number) => void;
  onSelect?: (sourceId: string) => void;
  onWillDrop?: (event: PreventableDockEvent, sourceId: string, targetId: string, position: DockPosition) => void;
  onReorderTab?: (tabGroupId: string, panelId: string, newIndex: number) => void;
  getPanelConfig?: (panelId: string) => PanelConfig | undefined;
  allowRootDock?: boolean;
  theme: 'light' | 'dark';
}

// ─── SVG helpers (shared by pane + edge indicators) ────────────────

const caretSVG = (color: string, rotation: number, size = 14) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="transform:rotate(${rotation}deg)">` +
  `<polyline points="6,18 12,12 18,18" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

const centerSVG = (color: string) =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none">` +
  `<rect x="5" y="5" width="14" height="14" rx="1.5" stroke="${color}" stroke-width="2" fill="none"/></svg>`;

// ─── DragManager ───────────────────────────────────────────────────

export class DragManager {
  private container: HTMLElement;
  private options: DockDragManagerOptions;
  private theme: 'light' | 'dark';

  // Drag state
  private isPending = false;
  private isDragging = false;
  private isReordering = false;
  private skipGhost = false;
  private sourceId = '';
  private sourceTitle = '';
  private startX = 0;
  private startY = 0;
  private sourcePaneRect: DOMRect | null = null;
  private sourcePaneElement: HTMLElement | null = null;
  private currentTargetId: string | null = null;
  private currentPosition: DockPosition | null = null;
  private moveRafId: number | null = null;

  // Touch state
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private touchStartX = 0;
  private touchStartY = 0;

  // Tab reorder delegate
  private tabReorder = new TabReorderManager();

  // Indicator DOM
  private ghostEl: HTMLDivElement | null = null;
  private previewEl: HTMLDivElement | null = null;
  private paneIndicators = new Map<string, { container: HTMLDivElement; rect: DOMRect }>();
  private edgeIndicators: HTMLDivElement[] = [];

  constructor(options: DockDragManagerOptions) {
    this.container = options.containerElement;
    this.options = options;
    this.theme = options.theme;
    this.container.addEventListener('mousedown', this.onContainerMouseDown);
    this.container.addEventListener('touchstart', this.onContainerTouchStart, { passive: false });
  }

  // ── Public API ─────────────────────────────────────────────────

  startDrag(sourceId: string, sourceTitle: string, event: PointerEvent | MouseEvent, skipGhost = false): void {
    this.skipGhost = skipGhost;
    this.beginTracking(sourceId, sourceTitle, event.clientX, event.clientY);
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.options.theme = theme;
    this.theme = theme;
  }

  setOnSelect(onSelect: DockDragManagerOptions['onSelect']): void {
    this.options.onSelect = onSelect;
  }

  setOnWillDrop(onWillDrop: DockDragManagerOptions['onWillDrop']): void {
    this.options.onWillDrop = onWillDrop;
  }

  dispose(): void {
    this.container.removeEventListener('mousedown', this.onContainerMouseDown);
    this.container.removeEventListener('touchstart', this.onContainerTouchStart);
    if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
    this.cancelDrag();
  }

  // ── Touch ─────────────────────────────────────────────────────

  private onContainerTouchStart = (e: TouchEvent): void => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const target = touch.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button')) return;
    const draggable = target.closest<HTMLElement>('[data-tab-id]');
    if (!draggable) return;
    const panelId = draggable.getAttribute('data-tab-id');
    if (!panelId) return;
    if (this.options.getPanelConfig?.( panelId)?.disabled) return;

    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    const title = draggable.getAttribute('data-drag-title') || draggable.textContent?.trim() || panelId;
    const dockTarget = draggable.closest<HTMLElement>('[data-dock-target]');
    this.sourcePaneRect = dockTarget?.getBoundingClientRect() || null;

    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      e.preventDefault();
      this.beginTracking(panelId, title, this.touchStartX, this.touchStartY);
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

    const onEarlyMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      const t = ev.touches[0];
      if (Math.hypot(t.clientX - this.touchStartX, t.clientY - this.touchStartY) > 10) {
        if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
        document.removeEventListener('touchmove', onEarlyMove);
      }
    };
    const onEarlyEnd = () => {
      if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
      document.removeEventListener('touchmove', onEarlyMove);
      document.removeEventListener('touchend', onEarlyEnd);
    };
    document.addEventListener('touchmove', onEarlyMove, { passive: true });
    document.addEventListener('touchend', onEarlyEnd);
  };

  // ── Event delegation ──────────────────────────────────────────

  private onContainerMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button')) return;
    const draggable = target.closest<HTMLElement>('[data-tab-id]');
    if (!draggable) return;
    const panelId = draggable.getAttribute('data-tab-id');
    if (!panelId) return;

    if (this.options.getPanelConfig) {
      const config = this.options.getPanelConfig(panelId);
      if (config?.disabled) { this.options.onSelect?.(panelId); return; }
    }

    const title = draggable.getAttribute('data-drag-title') || draggable.textContent?.trim() || panelId;
    const dockTarget = draggable.closest<HTMLElement>('[data-dock-target]');
    this.sourcePaneRect = dockTarget?.getBoundingClientRect() || null;

    const tabContainer = draggable.closest<HTMLElement>('[role="tablist"]');
    if (tabContainer && tabContainer.querySelectorAll('[data-tab-id]').length > 1) {
      this.tabReorder.sourceTabEl = draggable;
      this.tabReorder.tabStripEl = tabContainer;
      this.tabReorder.tabGroupId = dockTarget?.getAttribute('data-dock-target') || null;
    } else {
      this.tabReorder.reset();
    }
    this.beginTracking(panelId, title, e.clientX, e.clientY);
  };

  // ── Drag tracking ─────────────────────────────────────────────

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

  // ── Mouse move ────────────────────────────────────────────────

  private onMouseMove = (e: MouseEvent): void => {
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;

    if (this.isPending && !this.isDragging) {
      if (Math.hypot(dx, dy) < 5) return;
      this.activateDrag(e);
      if (this.tabReorder.sourceTabEl && this.tabReorder.tabStripEl) {
        const stripRect = this.tabReorder.tabStripEl.getBoundingClientRect();
        if (e.clientY >= stripRect.top - 30 && e.clientY <= stripRect.bottom + 30) {
          this.isReordering = true;
          this.tabReorder.cacheTabsArray();
          this.tabReorder.addReorderClasses();
          this.setGhostVisible(false);
          this.setDockIndicatorsVisible(false);
          if (this.sourcePaneElement) this.sourcePaneElement.style.opacity = '';
          return;
        }
      }
    }

    if (!this.isDragging) return;

    if (this.isReordering && this.tabReorder.sourceTabEl && this.tabReorder.tabStripEl) {
      const stripRect = this.tabReorder.tabStripEl.getBoundingClientRect();
      if (e.clientY < stripRect.top - 30 || e.clientY > stripRect.bottom + 30) {
        this.isReordering = false;
        this.tabReorder.endReorder(false, this.sourceId, this.options.onReorderTab);
        this.tabReorder.reset();
        this.setGhostVisible(true);
        this.setDockIndicatorsVisible(true);
        if (this.sourcePaneElement) this.sourcePaneElement.style.opacity = '0.5';
      } else {
        this.tabReorder.handleReorderMove(e.clientX);
        return;
      }
    }

    this.scheduleDragFrame(e.clientX, e.clientY);
  };

  private scheduleDragFrame(cx: number, cy: number): void {
    if (this.moveRafId !== null) return;
    this.moveRafId = requestAnimationFrame(() => {
      this.moveRafId = null;
      this.moveGhost(cx, cy);

      const edgePos = this.getEdgeUnderCursor(cx, cy);
      if (edgePos) {
        this.currentTargetId = '__root__';
        this.currentPosition = edgePos;
        this.hidePreview(); // hide before showing at new position
        this.showPreview(this.container.getBoundingClientRect(), edgePos);
        this.updateEdgeActive(edgePos);
        return;
      }
      this.updateEdgeActive(null);

      const paneHit = this.getPaneUnderCursor(cx, cy);
      if (paneHit) {
        this.currentTargetId = paneHit.targetId;
        this.currentPosition = paneHit.position;
        this.updatePaneActive(paneHit.targetId, paneHit.position);
        const el = this.container.querySelector(`[data-dock-target="${paneHit.targetId}"]`);
        if (el) this.showPreview(el.getBoundingClientRect(), paneHit.position);
      } else {
        this.currentTargetId = null;
        this.currentPosition = null;
        this.updatePaneActive(null, null);
        this.hidePreview();
      }
    });
  }

  // ── Mouse up ──────────────────────────────────────────────────

  private onMouseUp = (e: MouseEvent): void => {
    this.removeListeners();

    if (this.isDragging && this.sourceId) {
      if (this.moveRafId !== null) { cancelAnimationFrame(this.moveRafId); this.moveRafId = null; }

      // Final synchronous hit test
      const edgePos = this.getEdgeUnderCursor(e.clientX, e.clientY);
      if (edgePos) { this.currentTargetId = '__root__'; this.currentPosition = edgePos; }
      else {
        const paneHit = this.getPaneUnderCursor(e.clientX, e.clientY);
        if (paneHit) { this.currentTargetId = paneHit.targetId; this.currentPosition = paneHit.position; }
      }

      if (this.isReordering && !this.currentTargetId) {
        this.tabReorder.endReorder(true, this.sourceId, this.options.onReorderTab);
        this.tabReorder.reset();
        this.cleanup();
        return;
      }
      if (this.isReordering && this.currentTargetId) {
        this.isReordering = false;
        this.tabReorder.endReorder(false, this.sourceId, this.options.onReorderTab);
        this.tabReorder.reset();
      }

      if (this.currentTargetId && this.currentPosition) {
        if (this.options.onWillDrop) {
          const event = createPreventableEvent('willDrop', this.sourceId);
          this.options.onWillDrop(event, this.sourceId, this.currentTargetId, this.currentPosition);
          if (event.defaultPrevented) { this.cleanup(); return; }
        }
        this.options.onDrop(this.sourceId, this.currentTargetId, this.currentPosition);
      } else if (!this.skipGhost) {
        this.options.onFloat(this.sourceId, e.clientX - 50, e.clientY - 20);
      }
    } else if (this.isPending && this.sourceId) {
      this.options.onSelect?.(this.sourceId);
    }
    this.cleanup();
  };

  private onKeyDown = (e: KeyboardEvent): void => { if (e.key === 'Escape') this.cancelDrag(); };

  // ── Drag lifecycle ────────────────────────────────────────────

  private activateDrag(e: MouseEvent): void {
    this.isPending = false;
    this.isDragging = true;
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    const srcEl = this.container.querySelector<HTMLElement>(`[data-dock-target] [data-tab-id="${this.sourceId}"]`);
    const dockTarget = srcEl?.closest<HTMLElement>('[data-dock-target]');
    if (dockTarget) { this.sourcePaneElement = dockTarget; dockTarget.style.opacity = '0.5'; }

    if (!this.skipGhost) this.createGhost(e.clientX, e.clientY);
    this.createAllPaneIndicators();
    if (this.options.allowRootDock !== false) this.createEdgeIndicators();
  }

  private cancelDrag(): void { this.removeListeners(); this.cleanup(); }

  private removeListeners(): void {
    if (this.moveRafId !== null) { cancelAnimationFrame(this.moveRafId); this.moveRafId = null; }
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('keydown', this.onKeyDown);
  }

  private cleanup(): void {
    if (this.moveRafId !== null) { cancelAnimationFrame(this.moveRafId); this.moveRafId = null; }
    this.isPending = false;
    this.isDragging = false;
    this.isReordering = false;
    this.skipGhost = false;
    this.currentTargetId = null;
    this.currentPosition = null;
    this.sourcePaneRect = null;
    this.tabReorder.reset();
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    this.removeAllDOM();
    if (this.sourcePaneElement) { this.sourcePaneElement.style.opacity = '1'; this.sourcePaneElement = null; }
  }

  // ── Ghost ─────────────────────────────────────────────────────

  private createGhost(x: number, y: number): void {
    const c = THEME_COLORS[this.theme];
    const el = document.createElement('div');
    const gW = this.sourcePaneRect ? Math.round(this.sourcePaneRect.width) : 280;
    const gH = this.sourcePaneRect ? Math.round(this.sourcePaneRect.height) : 180;
    Object.assign(el.style, {
      position: 'fixed', left: `${x - Math.round(gW / 2)}px`, top: `${y - 14}px`, zIndex: '10001',
      pointerEvents: 'none', width: `${gW}px`, height: `${gH}px`,
      backgroundColor: c.ghost, border: `1px solid ${c.ghostBorder}`,
      borderRadius: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      overflow: 'hidden', opacity: '0.75',
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif',
    });
    const titlebar = document.createElement('div');
    Object.assign(titlebar.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 12px', fontSize: '12px', fontWeight: '500',
      borderBottom: `1px solid ${c.ghostBorder}`, color: c.text, minHeight: '32px',
    });
    titlebar.textContent = this.sourceTitle;
    el.appendChild(titlebar);
    const content = document.createElement('div');
    Object.assign(content.style, { flex: '1', background: c.ghost });
    el.appendChild(content);
    document.body.appendChild(el);
    this.ghostEl = el;
  }

  private moveGhost(x: number, y: number): void {
    if (!this.ghostEl) return;
    const gW = this.sourcePaneRect ? Math.round(this.sourcePaneRect.width) : 280;
    this.ghostEl.style.left = `${x - Math.round(gW / 2)}px`;
    this.ghostEl.style.top = `${y - 14}px`;
  }

  private setGhostVisible(visible: boolean): void {
    if (this.ghostEl) this.ghostEl.style.display = visible ? '' : 'none';
  }

  // ── Preview rectangle ─────────────────────────────────────────

  private showPreview(rect: DOMRect, position: DockPosition): void {
    const c = THEME_COLORS[this.theme];
    if (!this.previewEl) {
      const el = document.createElement('div');
      Object.assign(el.style, {
        position: 'fixed', zIndex: '10000', pointerEvents: 'none',
        backgroundColor: c.previewBg, border: `1px solid ${c.previewBorder}`,
        borderRadius: '2px', transition: 'left 0.08s, top 0.08s, width 0.08s, height 0.08s',
      });
      document.body.appendChild(el);
      this.previewEl = el;
    }
    let l = rect.left, t = rect.top, w = rect.width, h = rect.height;
    if (position === 'left')   w = rect.width / 2;
    if (position === 'right')  { l = rect.left + rect.width / 2; w = rect.width / 2; }
    if (position === 'top')    h = rect.height / 2;
    if (position === 'bottom') { t = rect.top + rect.height / 2; h = rect.height / 2; }
    Object.assign(this.previewEl.style, { left: `${l}px`, top: `${t}px`, width: `${w}px`, height: `${h}px`, opacity: '1' });
  }

  private hidePreview(): void { if (this.previewEl) this.previewEl.style.opacity = '0'; }

  // ── Per-pane indicators ───────────────────────────────────────

  private createAllPaneIndicators(): void {
    this.removeAllPaneIndicators();
    const targets = this.container.querySelectorAll<HTMLElement>('[data-dock-target]');
    const c = THEME_COLORS[this.theme];
    const S = 28, G = 4, half = S / 2;

    for (const target of targets) {
      const targetId = target.getAttribute('data-dock-target');
      if (!targetId || targetId === this.sourceId) continue;
      if (target.hasAttribute('data-header-collapsed')) continue;
      const rect = target.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 80) continue;

      const cont = document.createElement('div');
      cont.setAttribute('data-indicator-target', targetId);
      cont.style.cssText = `position:fixed;left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height / 2}px;z-index:10002;pointer-events:none;transform:translate(-50%,-50%);transition:opacity 0.12s;`;

      const mkInd = (pos: string, left: number, top: number, svg: string) => {
        const el = document.createElement('div');
        el.setAttribute('data-pos', pos);
        el.setAttribute('data-target-id', targetId);
        el.style.cssText = `position:absolute;width:${S}px;height:${S}px;left:${left}px;top:${top}px;background:${c.indicatorBg};border:1.5px solid ${c.indicatorBorder};border-radius:5px;display:flex;align-items:center;justify-content:center;transition:background-color 0.12s,border-color 0.12s,box-shadow 0.12s;pointer-events:auto;box-shadow:0 1px 4px rgba(0,0,0,0.12);`;
        el.innerHTML = svg;
        cont.appendChild(el);
      };

      mkInd('top',    -half,        -S - half - G, caretSVG(c.text, 0));
      mkInd('left',   -S - half - G, -half,        caretSVG(c.text, -90));
      mkInd('center', -half,         -half,        centerSVG(c.text));
      mkInd('right',  half + G,      -half,        caretSVG(c.text, 90));
      mkInd('bottom', -half,         half + G,     caretSVG(c.text, 180));

      document.body.appendChild(cont);
      this.paneIndicators.set(targetId, { container: cont, rect });
    }
  }

  private removeAllPaneIndicators(): void {
    for (const [, entry] of this.paneIndicators) entry.container.remove();
    this.paneIndicators.clear();
  }

  private getPaneUnderCursor(cx: number, cy: number): { targetId: string; position: DockPosition } | null {
    for (const [targetId, entry] of this.paneIndicators) {
      const indicators = entry.container.querySelectorAll('[data-pos]');
      for (const el of indicators) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom)
          return { targetId, position: el.getAttribute('data-pos') as DockPosition };
      }
    }
    return null;
  }

  private updatePaneActive(activeTargetId: string | null, activePos: DockPosition | null): void {
    const c = THEME_COLORS[this.theme];
    for (const [targetId, entry] of this.paneIndicators) {
      for (const el of entry.container.querySelectorAll('[data-pos]')) {
        const isActive = targetId === activeTargetId && el.getAttribute('data-pos') === activePos;
        const h = el as HTMLElement;
        h.style.backgroundColor = isActive ? c.indicatorActiveBg : 'transparent';
        h.style.borderColor = isActive ? c.indicatorActiveBorder : c.indicatorBorder;
        const svg = el.querySelector('svg');
        if (svg) {
          const color = isActive ? c.indicatorActiveBorder : c.text;
          svg.querySelectorAll('path,polyline,rect,line').forEach((s) => {
            if (s.getAttribute('stroke')) (s as SVGElement).setAttribute('stroke', color);
            if (s.getAttribute('fill') && s.getAttribute('fill') !== 'none') (s as SVGElement).setAttribute('fill', color);
          });
        }
      }
    }
  }

  // ── Edge indicators ───────────────────────────────────────────

  private createEdgeIndicators(): void {
    this.removeEdgeIndicators();
    const cr = this.container.getBoundingClientRect();
    const c = THEME_COLORS[this.theme];
    const S = 24;

    const positions: Array<{ pos: DockPosition; x: number; y: number; rotation: number }> = [
      { pos: 'top',    x: cr.left + cr.width / 2 - S / 2, y: cr.top + 8,                    rotation: 0 },
      { pos: 'bottom', x: cr.left + cr.width / 2 - S / 2, y: cr.bottom - S - 8,             rotation: 180 },
      { pos: 'left',   x: cr.left + 8,                     y: cr.top + cr.height / 2 - S / 2, rotation: -90 },
      { pos: 'right',  x: cr.right - S - 8,                y: cr.top + cr.height / 2 - S / 2, rotation: 90 },
    ];

    for (const { pos, x, y, rotation } of positions) {
      const el = document.createElement('div');
      el.setAttribute('data-edge-pos', pos);
      el.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:10003;width:${S}px;height:${S}px;display:flex;align-items:center;justify-content:center;background:${c.indicatorBg};border:1.5px solid ${c.indicatorBorder};border-radius:5px;pointer-events:auto;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.15);transition:background-color 0.12s,border-color 0.12s,transform 0.12s,box-shadow 0.12s;`;
      el.innerHTML = caretSVG(c.text, rotation, 12);
      document.body.appendChild(el);
      this.edgeIndicators.push(el);
    }
  }

  private removeEdgeIndicators(): void {
    for (const el of this.edgeIndicators) el.remove();
    this.edgeIndicators = [];
  }

  private getEdgeUnderCursor(cx: number, cy: number): DockPosition | null {
    for (const el of this.edgeIndicators) {
      const r = el.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom)
        return el.getAttribute('data-edge-pos') as DockPosition;
    }
    return null;
  }

  private updateEdgeActive(activePos: DockPosition | null): void {
    const c = THEME_COLORS[this.theme];
    for (const el of this.edgeIndicators) {
      const isActive = el.getAttribute('data-edge-pos') === activePos;
      el.style.backgroundColor = isActive ? c.indicatorActiveBg : c.indicatorBg;
      el.style.borderColor = isActive ? c.indicatorActiveBorder : c.indicatorBorder;
      el.style.transform = isActive ? 'scale(1.15)' : 'scale(1)';
      const svg = el.querySelector('svg');
      if (svg) svg.querySelectorAll('polyline').forEach((s) => s.setAttribute('stroke', isActive ? c.indicatorActiveBorder : c.text));
    }
  }

  private setDockIndicatorsVisible(visible: boolean): void {
    const d = visible ? '' : 'none';
    for (const [, entry] of this.paneIndicators) entry.container.style.display = d;
    for (const el of this.edgeIndicators) el.style.display = d;
  }

  // ── DOM cleanup ───────────────────────────────────────────────

  private removeAllDOM(): void {
    if (this.ghostEl) { this.ghostEl.remove(); this.ghostEl = null; }
    if (this.previewEl) { this.previewEl.remove(); this.previewEl = null; }
    this.removeAllPaneIndicators();
    this.removeEdgeIndicators();
  }

}

// ─── TabReorderManager (exported for unit tests) ───────────────────

export class TabReorderManager {
  sourceTabEl: HTMLElement | null = null;
  tabStripEl: HTMLElement | null = null;
  tabGroupId: string | null = null;
  private cachedTabs: HTMLElement[] | null = null;

  cacheTabsArray(): void {
    if (this.tabStripEl)
      this.cachedTabs = Array.from(this.tabStripEl.querySelectorAll<HTMLElement>('[data-tab-id]'));
  }

  addReorderClasses(): void {
    if (!this.tabStripEl || !this.sourceTabEl) return;
    for (const tab of this.tabStripEl.querySelectorAll<HTMLElement>('[data-tab-id]')) {
      if (tab !== this.sourceTabEl) tab.classList.add('dock-tab-reordering');
    }
    this.sourceTabEl.classList.add('dock-tab-drag-source');
  }

  removeReorderClasses(): void {
    if (!this.tabStripEl) return;
    for (const tab of this.tabStripEl.querySelectorAll<HTMLElement>('[data-tab-id]')) {
      tab.classList.remove('dock-tab-reordering', 'dock-tab-drag-source');
      tab.style.transform = '';
    }
  }

  handleReorderMove(cursorX: number): void {
    if (!this.sourceTabEl || !this.tabStripEl) return;
    const tabs = this.cachedTabs || Array.from(this.tabStripEl.querySelectorAll<HTMLElement>('[data-tab-id]'));
    const sourceIdx = tabs.indexOf(this.sourceTabEl);
    if (sourceIdx === -1) return;

    for (let i = 0; i < tabs.length; i++) {
      if (i === sourceIdx) continue;
      const tab = tabs[i];
      const rect = tab.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const shouldSwap = (i > sourceIdx && cursorX > midX) || (i < sourceIdx && cursorX < midX);
      if (!shouldSwap) continue;

      const parent = tab.parentNode;
      if (!parent) return;

      const firstRects = new Map<HTMLElement, number>();
      for (const t of tabs) firstRects.set(t, t.getBoundingClientRect().left);

      if (i > sourceIdx) parent.insertBefore(this.sourceTabEl, tab.nextSibling);
      else parent.insertBefore(this.sourceTabEl, tab);

      for (const t of tabs) {
        if (t === this.sourceTabEl) continue;
        const firstLeft = firstRects.get(t);
        if (firstLeft === undefined) continue;
        const delta = firstLeft - t.getBoundingClientRect().left;
        if (Math.abs(delta) > 0.5) {
          t.style.transition = 'none';
          t.style.transform = `translateX(${delta}px)`;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      this.tabStripEl.offsetHeight;
      for (const t of tabs) {
        if (t === this.sourceTabEl) continue;
        if (t.style.transform) { t.style.transition = ''; t.style.transform = ''; }
      }

      this.cacheTabsArray();
      return;
    }
  }

  endReorder(
    commit: boolean,
    sourceId: string,
    onReorderTab?: (tabGroupId: string, panelId: string, newIndex: number) => void,
  ): void {
    this.removeReorderClasses();
    if (this.sourceTabEl) this.sourceTabEl.style.opacity = '';
    if (commit && this.sourceTabEl && this.tabStripEl && this.tabGroupId) {
      const tabs = Array.from(this.tabStripEl.querySelectorAll<HTMLElement>('[data-tab-id]'));
      const newIndex = tabs.indexOf(this.sourceTabEl);
      if (newIndex !== -1 && onReorderTab) onReorderTab(this.tabGroupId, sourceId, newIndex);
    }
    this.cachedTabs = null;
  }

  reset(): void {
    this.sourceTabEl = null;
    this.tabStripEl = null;
    this.tabGroupId = null;
    this.cachedTabs = null;
  }
}
