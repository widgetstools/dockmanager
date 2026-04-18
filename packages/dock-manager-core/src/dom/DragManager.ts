import type { DockPosition, PreventableDockEvent, PanelConfig } from '../types/dock';
import { createPreventableEvent } from '../types/dock';

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

const caretSVG = (color: string, rot: number, s = 14) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" style="transform:rotate(${rot}deg)"><polyline points="6,18 12,12 18,18" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
const centerSVG = (color: string) =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="5" y="5" width="14" height="14" rx="1.5" stroke="${color}" stroke-width="2" fill="none"/></svg>`;
const isBtn = (el: HTMLElement) => el.tagName === 'BUTTON' || el.closest('button');
const hitTest = (cx: number, cy: number, r: DOMRect) => cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
const clearRaf = (id: number | null) => { if (id !== null) cancelAnimationFrame(id); return null; };
const resolveDraggable = (target: HTMLElement) => {
  const d = target.closest<HTMLElement>('[data-tab-id]');
  return d ? { el: d, id: d.getAttribute('data-tab-id'), title: d.getAttribute('data-drag-title') || d.textContent?.trim() || d.getAttribute('data-tab-id') || '' } : null;
};

export class DragManager {
  private container: HTMLElement;
  private options: DockDragManagerOptions;
  private theme: 'light' | 'dark';
  private isPending = false; private isDragging = false; private isReordering = false; private skipGhost = false;
  private sourceId = ''; private sourceTitle = ''; private startX = 0; private startY = 0;
  private sourcePaneRect: DOMRect | null = null; private sourcePaneElement: HTMLElement | null = null;
  private currentTargetId: string | null = null; private currentPosition: DockPosition | null = null;
  private moveRafId: number | null = null; private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private touchStartX = 0; private touchStartY = 0; private tabReorder = new TabReorderManager();
  private ghostEl: HTMLDivElement | null = null; private previewEl: HTMLDivElement | null = null;
  private paneIndicators = new Map<string, { container: HTMLDivElement; rect: DOMRect }>(); private edgeIndicators: HTMLDivElement[] = [];
  constructor(options: DockDragManagerOptions) {
    this.container = options.containerElement; this.options = options; this.theme = options.theme;
    this.container.addEventListener('mousedown', this.onContainerMouseDown);
    this.container.addEventListener('touchstart', this.onContainerTouchStart, { passive: false });
  }
  startDrag(sourceId: string, sourceTitle: string, event: PointerEvent | MouseEvent, skipGhost = false): void {
    this.skipGhost = skipGhost;
    this.beginTracking(sourceId, sourceTitle, event.clientX, event.clientY);
  }
  setTheme(theme: 'light' | 'dark'): void { this.options.theme = theme; this.theme = theme; }
  setOnSelect(onSelect: DockDragManagerOptions['onSelect']): void { this.options.onSelect = onSelect; }
  setOnWillDrop(onWillDrop: DockDragManagerOptions['onWillDrop']): void { this.options.onWillDrop = onWillDrop; }
  dispose(): void {
    this.container.removeEventListener('mousedown', this.onContainerMouseDown);
    this.container.removeEventListener('touchstart', this.onContainerTouchStart);
    this.clearLongPress(); this.cancelDrag();
  }
  private clearLongPress(): void { if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; } }
  private onContainerTouchStart = (e: TouchEvent): void => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0], target = touch.target as HTMLElement;
    if (isBtn(target)) return;
    const info = resolveDraggable(target);
    if (!info?.id || this.options.getPanelConfig?.(info.id)?.disabled) return;
    this.touchStartX = touch.clientX; this.touchStartY = touch.clientY;
    this.sourcePaneRect = info.el.closest<HTMLElement>('[data-dock-target]')?.getBoundingClientRect() || null;
    const { id: panelId, title } = info;
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null; e.preventDefault();
      this.beginTracking(panelId, title, this.touchStartX, this.touchStartY);
      const onMove = (ev: TouchEvent) => { if (ev.touches.length !== 1) return; ev.preventDefault(); const t = ev.touches[0]; this.onMouseMove({ clientX: t.clientX, clientY: t.clientY } as MouseEvent); };
      const onEnd = (ev: TouchEvent) => { const t = ev.changedTouches[0]; this.onMouseUp({ clientX: t.clientX, clientY: t.clientY, button: 0 } as MouseEvent); document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd); };
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
    }, 300);
    const onEarlyMove = (ev: TouchEvent) => {
      if (ev.touches.length === 1 && Math.hypot(ev.touches[0].clientX - this.touchStartX, ev.touches[0].clientY - this.touchStartY) > 10) { this.clearLongPress(); document.removeEventListener('touchmove', onEarlyMove); }
    };
    const onEarlyEnd = () => { this.clearLongPress(); document.removeEventListener('touchmove', onEarlyMove); document.removeEventListener('touchend', onEarlyEnd); };
    document.addEventListener('touchmove', onEarlyMove, { passive: true });
    document.addEventListener('touchend', onEarlyEnd);
  };
  private onContainerMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    if (isBtn(e.target as HTMLElement)) return;
    const info = resolveDraggable(e.target as HTMLElement);
    if (!info?.id) return;
    if (this.options.getPanelConfig?.(info.id)?.disabled) { this.options.onSelect?.(info.id); return; }
    const dockTarget = info.el.closest<HTMLElement>('[data-dock-target]');
    this.sourcePaneRect = dockTarget?.getBoundingClientRect() || null;
    const tabContainer = info.el.closest<HTMLElement>('[role="tablist"]');
    if (tabContainer && tabContainer.querySelectorAll('[data-tab-id]').length > 1) {
      this.tabReorder.sourceTabEl = info.el; this.tabReorder.tabStripEl = tabContainer;
      this.tabReorder.tabGroupId = dockTarget?.getAttribute('data-dock-target') || null;
    } else this.tabReorder.reset();
    this.beginTracking(info.id, info.title, e.clientX, e.clientY);
  };
  private beginTracking(sourceId: string, sourceTitle: string, x: number, y: number): void {
    this.sourceId = sourceId; this.sourceTitle = sourceTitle;
    this.startX = x; this.startY = y; this.isPending = true; this.isDragging = false;
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('keydown', this.onKeyDown);
  }
  private onMouseMove = (e: MouseEvent): void => {
    if (this.isPending && !this.isDragging) {
      if (Math.hypot(e.clientX - this.startX, e.clientY - this.startY) < 5) return;
      this.activateDrag(e);
      if (this.tabReorder.sourceTabEl && this.tabReorder.tabStripEl) {
        const sr = this.tabReorder.tabStripEl.getBoundingClientRect();
        if (e.clientY >= sr.top - 30 && e.clientY <= sr.bottom + 30) {
          this.isReordering = true;
          this.tabReorder.cacheTabsArray(); this.tabReorder.addReorderClasses();
          this.setGhostVisible(false); this.setDockIndicatorsVisible(false);
          if (this.sourcePaneElement) this.sourcePaneElement.style.opacity = '';
          return;
        }
      }
    }
    if (!this.isDragging) return;
    if (this.isReordering && this.tabReorder.sourceTabEl && this.tabReorder.tabStripEl) {
      const sr = this.tabReorder.tabStripEl.getBoundingClientRect();
      if (e.clientY < sr.top - 30 || e.clientY > sr.bottom + 30) {
        this.isReordering = false;
        this.tabReorder.endReorder(false, this.sourceId, this.options.onReorderTab); this.tabReorder.reset();
        this.setGhostVisible(true); this.setDockIndicatorsVisible(true);
        if (this.sourcePaneElement) this.sourcePaneElement.style.opacity = '0.5';
      } else { this.tabReorder.handleReorderMove(e.clientX); return; }
    }
    this.scheduleDragFrame(e.clientX, e.clientY);
  };
  private scheduleDragFrame(cx: number, cy: number): void {
    if (this.moveRafId !== null) return;
    this.moveRafId = requestAnimationFrame(() => {
      this.moveRafId = null; this.moveGhost(cx, cy);
      const ep = this.getEdgeUnderCursor(cx, cy);
      if (ep) {
        this.currentTargetId = '__root__'; this.currentPosition = ep;
        this.hidePreview(); this.showPreview(this.container.getBoundingClientRect(), ep); this.updateEdgeActive(ep);
        return;
      }
      this.updateEdgeActive(null);
      const ph = this.getPaneUnderCursor(cx, cy);
      if (ph) {
        this.currentTargetId = ph.targetId; this.currentPosition = ph.position;
        this.updatePaneActive(ph.targetId, ph.position);
        const el = this.container.querySelector(`[data-dock-target="${ph.targetId}"]`);
        if (el) this.showPreview(el.getBoundingClientRect(), ph.position);
      } else { this.currentTargetId = null; this.currentPosition = null; this.updatePaneActive(null, null); this.hidePreview(); }
    });
  }
  private onMouseUp = (e: MouseEvent): void => {
    this.removeListeners();
    if (this.isDragging && this.sourceId) {
      this.moveRafId = clearRaf(this.moveRafId);
      const ep = this.getEdgeUnderCursor(e.clientX, e.clientY);
      if (ep) { this.currentTargetId = '__root__'; this.currentPosition = ep; }
      else { const ph = this.getPaneUnderCursor(e.clientX, e.clientY); if (ph) { this.currentTargetId = ph.targetId; this.currentPosition = ph.position; } }
      if (this.isReordering && !this.currentTargetId) {
        this.tabReorder.endReorder(true, this.sourceId, this.options.onReorderTab); this.tabReorder.reset(); this.cleanup(); return;
      }
      if (this.isReordering && this.currentTargetId) {
        this.isReordering = false; this.tabReorder.endReorder(false, this.sourceId, this.options.onReorderTab); this.tabReorder.reset();
      }
      if (this.currentTargetId && this.currentPosition) {
        if (this.options.onWillDrop) {
          const evt = createPreventableEvent('willDrop', this.sourceId);
          this.options.onWillDrop(evt, this.sourceId, this.currentTargetId, this.currentPosition);
          if (evt.defaultPrevented) { this.cleanup(); return; }
        }
        this.options.onDrop(this.sourceId, this.currentTargetId, this.currentPosition);
      } else if (!this.skipGhost) this.options.onFloat(this.sourceId, e.clientX - 50, e.clientY - 20);
    } else if (this.isPending && this.sourceId) this.options.onSelect?.(this.sourceId);
    this.cleanup();
  };
  private onKeyDown = (e: KeyboardEvent): void => { if (e.key === 'Escape') this.cancelDrag(); };
  private activateDrag(e: MouseEvent): void {
    this.isPending = false; this.isDragging = true;
    document.body.style.cursor = 'grabbing'; document.body.style.userSelect = 'none';
    const srcEl = this.container.querySelector<HTMLElement>(`[data-dock-target] [data-tab-id="${this.sourceId}"]`);
    const dt = srcEl?.closest<HTMLElement>('[data-dock-target]');
    if (dt) { this.sourcePaneElement = dt; dt.style.opacity = '0.5'; }
    if (!this.skipGhost) this.createGhost(e.clientX, e.clientY);
    this.createAllPaneIndicators();
    if (this.options.allowRootDock !== false) this.createEdgeIndicators();
  }
  private cancelDrag(): void { this.removeListeners(); this.cleanup(); }
  private removeListeners(): void {
    this.moveRafId = clearRaf(this.moveRafId);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('keydown', this.onKeyDown);
  }
  private cleanup(): void {
    this.moveRafId = clearRaf(this.moveRafId);
    this.isPending = this.isDragging = this.isReordering = this.skipGhost = false;
    this.currentTargetId = null; this.currentPosition = null; this.sourcePaneRect = null;
    this.tabReorder.reset();
    document.body.style.cursor = ''; document.body.style.userSelect = '';
    this.removeAllDOM();
    if (this.sourcePaneElement) { this.sourcePaneElement.style.opacity = '1'; this.sourcePaneElement = null; }
  }
  private ghostDims() { return { w: this.sourcePaneRect ? Math.round(this.sourcePaneRect.width) : 280, h: this.sourcePaneRect ? Math.round(this.sourcePaneRect.height) : 180 }; }
  private createGhost(x: number, y: number): void {
    const c = THEME_COLORS[this.theme], { w: gW, h: gH } = this.ghostDims(), el = document.createElement('div');
    el.style.cssText = `position:fixed;left:${x - Math.round(gW / 2)}px;top:${y - 14}px;z-index:10001;pointer-events:none;width:${gW}px;height:${gH}px;background-color:${c.ghost};border:1px solid ${c.ghostBorder};border-radius:4px;box-shadow:0 8px 24px rgba(0,0,0,0.25);overflow:hidden;opacity:0.75;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif;`;
    const tb = document.createElement('div');
    tb.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:6px 12px;font-size:12px;font-weight:500;border-bottom:1px solid ${c.ghostBorder};color:${c.text};min-height:32px;`;
    tb.textContent = this.sourceTitle; el.appendChild(tb);
    const ct = document.createElement('div'); ct.style.cssText = `flex:1;background:${c.ghost};`; el.appendChild(ct);
    document.body.appendChild(el); this.ghostEl = el;
  }
  private moveGhost(x: number, y: number): void {
    if (!this.ghostEl) return;
    this.ghostEl.style.left = `${x - Math.round(this.ghostDims().w / 2)}px`; this.ghostEl.style.top = `${y - 14}px`;
  }
  private setGhostVisible(v: boolean): void { if (this.ghostEl) this.ghostEl.style.display = v ? '' : 'none'; }
  private showPreview(rect: DOMRect, pos: DockPosition): void {
    if (!this.previewEl) {
      const c = THEME_COLORS[this.theme], el = document.createElement('div');
      el.style.cssText = `position:fixed;z-index:10000;pointer-events:none;background-color:${c.previewBg};border:1px solid ${c.previewBorder};border-radius:2px;transition:left 0.08s,top 0.08s,width 0.08s,height 0.08s;`;
      document.body.appendChild(el); this.previewEl = el;
    }
    let { left: l, top: t, width: w, height: h } = rect;
    if (pos === 'left') w /= 2; else if (pos === 'right') { l += w / 2; w /= 2; }
    else if (pos === 'top') h /= 2; else if (pos === 'bottom') { t += h / 2; h /= 2; }
    Object.assign(this.previewEl.style, { left: `${l}px`, top: `${t}px`, width: `${w}px`, height: `${h}px`, opacity: '1' });
  }
  private hidePreview(): void { if (this.previewEl) this.previewEl.style.opacity = '0'; }
  private createAllPaneIndicators(): void {
    this.removeAllPaneIndicators();
    const c = THEME_COLORS[this.theme], S = 28, G = 4, half = S / 2;
    const base = `position:absolute;width:${S}px;height:${S}px;background:${c.indicatorBg};border:1.5px solid ${c.indicatorBorder};border-radius:5px;display:flex;align-items:center;justify-content:center;transition:background-color 0.12s,border-color 0.12s,box-shadow 0.12s;pointer-events:auto;box-shadow:0 1px 4px rgba(0,0,0,0.12);`;
    const defs: [string, number, number, string][] = [
      ['top', -half, -S - half - G, caretSVG(c.text, 0)], ['left', -S - half - G, -half, caretSVG(c.text, -90)],
      ['center', -half, -half, centerSVG(c.text)], ['right', half + G, -half, caretSVG(c.text, 90)],
      ['bottom', -half, half + G, caretSVG(c.text, 180)],
    ];
    for (const target of this.container.querySelectorAll<HTMLElement>('[data-dock-target]')) {
      const tid = target.getAttribute('data-dock-target');
      if (!tid || tid === this.sourceId || target.hasAttribute('data-header-collapsed')) continue;
      const rect = target.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 80) continue;
      const cont = document.createElement('div');
      cont.setAttribute('data-indicator-target', tid);
      cont.style.cssText = `position:fixed;left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height / 2}px;z-index:10002;pointer-events:none;transform:translate(-50%,-50%);transition:opacity 0.12s;`;
      for (const [pos, l, t, svg] of defs) {
        const el = document.createElement('div');
        el.setAttribute('data-pos', pos); el.setAttribute('data-target-id', tid);
        el.style.cssText = `${base}left:${l}px;top:${t}px;`; el.innerHTML = svg; cont.appendChild(el);
      }
      document.body.appendChild(cont); this.paneIndicators.set(tid, { container: cont, rect });
    }
  }
  private removeAllPaneIndicators(): void { for (const [, e] of this.paneIndicators) e.container.remove(); this.paneIndicators.clear(); }
  private getPaneUnderCursor(cx: number, cy: number): { targetId: string; position: DockPosition } | null {
    for (const [tid, entry] of this.paneIndicators)
      for (const el of entry.container.querySelectorAll('[data-pos]'))
        if (hitTest(cx, cy, (el as HTMLElement).getBoundingClientRect()))
          return { targetId: tid, position: el.getAttribute('data-pos') as DockPosition };
    return null;
  }
  private updatePaneActive(activeTid: string | null, activePos: DockPosition | null): void {
    const c = THEME_COLORS[this.theme];
    for (const [tid, entry] of this.paneIndicators)
      for (const el of entry.container.querySelectorAll('[data-pos]')) {
        const on = tid === activeTid && el.getAttribute('data-pos') === activePos, h = el as HTMLElement;
        h.style.backgroundColor = on ? c.indicatorActiveBg : 'transparent';
        h.style.borderColor = on ? c.indicatorActiveBorder : c.indicatorBorder;
        const svg = el.querySelector('svg');
        if (svg) { const clr = on ? c.indicatorActiveBorder : c.text; svg.querySelectorAll('path,polyline,rect,line').forEach(s => { if (s.getAttribute('stroke')) (s as SVGElement).setAttribute('stroke', clr); if (s.getAttribute('fill') && s.getAttribute('fill') !== 'none') (s as SVGElement).setAttribute('fill', clr); }); }
      }
  }
  private createEdgeIndicators(): void {
    this.removeEdgeIndicators();
    const cr = this.container.getBoundingClientRect(), c = THEME_COLORS[this.theme], S = 24;
    for (const [pos, x, y, rot] of [['top', cr.left + cr.width / 2 - S / 2, cr.top + 8, 0], ['bottom', cr.left + cr.width / 2 - S / 2, cr.bottom - S - 8, 180], ['left', cr.left + 8, cr.top + cr.height / 2 - S / 2, -90], ['right', cr.right - S - 8, cr.top + cr.height / 2 - S / 2, 90]] as [DockPosition, number, number, number][]) {
      const el = document.createElement('div'); el.setAttribute('data-edge-pos', pos);
      el.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:10003;width:${S}px;height:${S}px;display:flex;align-items:center;justify-content:center;background:${c.indicatorBg};border:1.5px solid ${c.indicatorBorder};border-radius:5px;pointer-events:auto;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.15);transition:background-color 0.12s,border-color 0.12s,transform 0.12s,box-shadow 0.12s;`;
      el.innerHTML = caretSVG(c.text, rot, 12); document.body.appendChild(el); this.edgeIndicators.push(el);
    }
  }
  private removeEdgeIndicators(): void { for (const el of this.edgeIndicators) el.remove(); this.edgeIndicators = []; }
  private getEdgeUnderCursor(cx: number, cy: number): DockPosition | null {
    for (const el of this.edgeIndicators) if (hitTest(cx, cy, el.getBoundingClientRect())) return el.getAttribute('data-edge-pos') as DockPosition;
    return null;
  }
  private updateEdgeActive(activePos: DockPosition | null): void {
    const c = THEME_COLORS[this.theme];
    for (const el of this.edgeIndicators) {
      const on = el.getAttribute('data-edge-pos') === activePos;
      el.style.backgroundColor = on ? c.indicatorActiveBg : c.indicatorBg;
      el.style.borderColor = on ? c.indicatorActiveBorder : c.indicatorBorder;
      el.style.transform = on ? 'scale(1.15)' : 'scale(1)';
      el.querySelector('svg')?.querySelectorAll('polyline').forEach(s => s.setAttribute('stroke', on ? c.indicatorActiveBorder : c.text));
    }
  }
  private setDockIndicatorsVisible(v: boolean): void {
    const d = v ? '' : 'none';
    for (const [, e] of this.paneIndicators) e.container.style.display = d;
    for (const el of this.edgeIndicators) el.style.display = d;
  }
  private removeAllDOM(): void {
    if (this.ghostEl) { this.ghostEl.remove(); this.ghostEl = null; }
    if (this.previewEl) { this.previewEl.remove(); this.previewEl = null; }
    this.removeAllPaneIndicators(); this.removeEdgeIndicators();
  }
}

export class TabReorderManager {
  sourceTabEl: HTMLElement | null = null;
  tabStripEl: HTMLElement | null = null;
  tabGroupId: string | null = null;
  private cachedTabs: HTMLElement[] | null = null;
  cacheTabsArray(): void { if (this.tabStripEl) this.cachedTabs = Array.from(this.tabStripEl.querySelectorAll<HTMLElement>('[data-tab-id]')); }
  addReorderClasses(): void {
    if (!this.tabStripEl || !this.sourceTabEl) return;
    for (const tab of this.tabStripEl.querySelectorAll<HTMLElement>('[data-tab-id]'))
      tab.classList.add(tab === this.sourceTabEl ? 'dock-tab-drag-source' : 'dock-tab-reordering');
  }
  removeReorderClasses(): void {
    if (!this.tabStripEl) return;
    for (const tab of this.tabStripEl.querySelectorAll<HTMLElement>('[data-tab-id]')) { tab.classList.remove('dock-tab-reordering', 'dock-tab-drag-source'); tab.style.transform = ''; }
  }
  handleReorderMove(cursorX: number): void {
    if (!this.sourceTabEl || !this.tabStripEl) return;
    const tabs = this.cachedTabs || Array.from(this.tabStripEl.querySelectorAll<HTMLElement>('[data-tab-id]'));
    const si = tabs.indexOf(this.sourceTabEl);
    if (si === -1) return;
    for (let i = 0; i < tabs.length; i++) {
      if (i === si) continue;
      const tab = tabs[i], r = tab.getBoundingClientRect(), midX = r.left + r.width / 2;
      if (!((i > si && cursorX > midX) || (i < si && cursorX < midX))) continue;
      const parent = tab.parentNode; if (!parent) return;
      const firstRects = new Map<HTMLElement, number>();
      for (const t of tabs) firstRects.set(t, t.getBoundingClientRect().left);
      parent.insertBefore(this.sourceTabEl, i > si ? tab.nextSibling : tab);
      for (const t of tabs) {
        if (t === this.sourceTabEl) continue;
        const fl = firstRects.get(t); if (fl === undefined) continue;
        const delta = fl - t.getBoundingClientRect().left;
        if (Math.abs(delta) > 0.5) { t.style.transition = 'none'; t.style.transform = `translateX(${delta}px)`; }
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      this.tabStripEl.offsetHeight;
      for (const t of tabs) { if (t !== this.sourceTabEl && t.style.transform) { t.style.transition = ''; t.style.transform = ''; } }
      this.cacheTabsArray(); return;
    }
  }
  endReorder(commit: boolean, sourceId: string, onReorderTab?: (tabGroupId: string, panelId: string, newIndex: number) => void): void {
    this.removeReorderClasses();
    if (this.sourceTabEl) this.sourceTabEl.style.opacity = '';
    if (commit && this.sourceTabEl && this.tabStripEl && this.tabGroupId) {
      const idx = Array.from(this.tabStripEl.querySelectorAll<HTMLElement>('[data-tab-id]')).indexOf(this.sourceTabEl);
      if (idx !== -1 && onReorderTab) onReorderTab(this.tabGroupId, sourceId, idx);
    }
    this.cachedTabs = null;
  }
  reset(): void { this.sourceTabEl = null; this.tabStripEl = null; this.tabGroupId = null; this.cachedTabs = null; }
}
