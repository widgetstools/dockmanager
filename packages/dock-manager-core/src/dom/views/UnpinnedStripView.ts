import type { DockEdge, UnpinnedPanel, PanelConfig } from '../../types/dock';
import { iconClose, iconPin } from '../icons';
import { MutableDisposable, type IDisposable } from '../../utils/lifecycle';

export type { IDisposable };

export interface UnpinnedStripViewCallbacks {
  onPinPanel: (panelId: string) => void;
  onClosePanel: (panelId: string) => void;
  onResizeUnpinned: (panelId: string, size: number) => void;
  createContent: (panelId: string, container: HTMLElement) => IDisposable;
}

export class UnpinnedStripView {
  readonly element: HTMLDivElement;
  private edge: DockEdge;
  private unpinnedPanels: UnpinnedPanel[];
  private panels: Map<string, PanelConfig>;
  private callbacks: UnpinnedStripViewCallbacks;
  readonly stripEl: HTMLDivElement;
  private flyoutEl: HTMLDivElement | null = null;
  private expandedPanelId: string | null = null;
  private readonly flyoutContentSlot = new MutableDisposable();
  private closeTimeout: ReturnType<typeof setTimeout> | null = null;
  private boundStripMouseOver: ((e: MouseEvent) => void) | null = null;
  private boundStripMouseOut: ((e: MouseEvent) => void) | null = null;
  private boundStripClick: ((e: MouseEvent) => void) | null = null;
  private resizeMove: ((e: MouseEvent) => void) | null = null;
  private resizeUp: ((e: MouseEvent) => void) | null = null;

  constructor(edge: DockEdge, unpinnedPanels: UnpinnedPanel[], panels: Map<string, PanelConfig>, callbacks: UnpinnedStripViewCallbacks) {
    this.edge = edge;
    this.unpinnedPanels = unpinnedPanels;
    this.panels = panels;
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.style.cssText = 'display:contents;';
    this.stripEl = document.createElement('div');
    const isV = edge === 'left' || edge === 'right';
    this.stripEl.style.cssText = `flex-shrink:0;display:flex;align-items:stretch;z-index:30;background:hsl(var(--dock-unpinned-bg));${
      isV ? `flex-direction:column;width:28px;border-right:1px solid hsl(var(--dock-border));${
        edge === 'right' ? 'border-left:1px solid hsl(var(--dock-border));border-right:none;' : ''}`
      : `flex-direction:row;height:28px;${
        edge === 'top' ? 'border-bottom:1px solid hsl(var(--dock-border));' : 'border-top:1px solid hsl(var(--dock-border));'}`
    }`;
    this.element.appendChild(this.stripEl);
    this.setupStripDelegation();
    this.buildTabs();
  }

  update(unpinnedPanels: UnpinnedPanel[], panels: Map<string, PanelConfig>): void {
    this.unpinnedPanels = unpinnedPanels;
    this.panels = panels;
    if (this.expandedPanelId && !unpinnedPanels.some((p) => p.panelId === this.expandedPanelId))
      this.closeFlyout();
    this.stripEl.innerHTML = '';
    this.buildTabs();
  }

  dispose(): void {
    this.closeFlyout();
    if (this.closeTimeout) { clearTimeout(this.closeTimeout); this.closeTimeout = null; }
    if (this.boundStripMouseOver) { this.stripEl.removeEventListener('mouseover', this.boundStripMouseOver); this.boundStripMouseOver = null; }
    if (this.boundStripMouseOut) { this.stripEl.removeEventListener('mouseout', this.boundStripMouseOut); this.boundStripMouseOut = null; }
    if (this.boundStripClick) { this.stripEl.removeEventListener('click', this.boundStripClick); this.boundStripClick = null; }
    this.stripEl.remove();
    this.element.remove();
  }

  private setupStripDelegation(): void {
    const getPanel = (e: MouseEvent) => (e.target as HTMLElement).closest<HTMLElement>('[data-unpinned-id]')?.getAttribute('data-unpinned-id');
    this.boundStripMouseOver = (e) => { const id = getPanel(e); if (id) { this.cancelClose(); this.openFlyout(id); } };
    this.boundStripMouseOut = (e) => { if (getPanel(e)) this.scheduleClose(); };
    this.boundStripClick = (e) => {
      const id = getPanel(e);
      if (id) this.expandedPanelId === id ? this.closeFlyout() : this.openFlyout(id);
    };
    this.stripEl.addEventListener('mouseover', this.boundStripMouseOver);
    this.stripEl.addEventListener('mouseout', this.boundStripMouseOut);
    this.stripEl.addEventListener('click', this.boundStripClick);
  }

  private buildTabs(): void {
    const isV = this.edge === 'left' || this.edge === 'right';
    for (const unpinned of this.unpinnedPanels) {
      const panel = this.panels.get(unpinned.panelId);
      if (!panel) continue;
      const btn = document.createElement('button');
      btn.className = 'dock-unpinned-tab';
      btn.setAttribute('data-unpinned-id', unpinned.panelId);
      btn.style.cssText = isV ? 'width:100%;padding:12px 0;' : 'height:100%;padding:0 12px;';
      btn.title = panel.title;
      const span = document.createElement('span');
      span.style.cssText = `font-size:11px;font-weight:500;white-space:nowrap;${isV ? 'writing-mode:vertical-lr;text-orientation:mixed;' : ''}`;
      span.textContent = panel.title;
      btn.appendChild(span);
      this.stripEl.appendChild(btn);
    }
  }

  private openFlyout(panelId: string): void {
    if (this.expandedPanelId === panelId) return;
    this.closeFlyout();
    this.expandedPanelId = panelId;
    const unpinned = this.unpinnedPanels.find((p) => p.panelId === panelId);
    const panel = this.panels.get(panelId);
    if (!unpinned || !panel) return;
    const isV = this.edge === 'left' || this.edge === 'right';
    this.flyoutEl = document.createElement('div');
    this.flyoutEl.style.cssText = `position:absolute;display:flex;flex-direction:column;overflow:hidden;z-index:40;background:hsl(var(--dock-surface));box-shadow:0 4px 16px rgba(0,0,0,0.15);${
      this.edge === 'left' ? `left:28px;top:0;bottom:0;border-right:1px solid hsl(var(--dock-border));width:${unpinned.size}px;`
      : this.edge === 'right' ? `right:28px;top:0;bottom:0;border-left:1px solid hsl(var(--dock-border));width:${unpinned.size}px;`
      : this.edge === 'top' ? `top:28px;left:0;right:0;border-bottom:1px solid hsl(var(--dock-border));height:${unpinned.size}px;`
      : `bottom:28px;left:0;right:0;border-top:1px solid hsl(var(--dock-border));height:${unpinned.size}px;`
    }`;
    this.flyoutEl.addEventListener('mouseenter', () => this.cancelClose());
    this.flyoutEl.addEventListener('mouseleave', () => this.scheduleClose());

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:0 12px;height:36px;flex-shrink:0;border-bottom:1px solid hsl(var(--dock-border));background:hsl(var(--dock-panel-header));';
    const title = document.createElement('span');
    title.style.cssText = 'font-size:12px;font-weight:500;color:hsl(var(--dock-text));';
    title.textContent = panel.title;
    header.appendChild(title);
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;align-items:center;gap:0;';
    const btnCss = 'padding:4px;color:hsl(var(--dock-text));cursor:pointer;background:none;border:none;display:flex;align-items:center;';
    const pinBtn = document.createElement('button');
    pinBtn.style.cssText = btnCss;
    pinBtn.title = 'Pin panel (dock back)';
    pinBtn.innerHTML = iconPin();
    pinBtn.addEventListener('click', () => { this.closeFlyout(); this.callbacks.onPinPanel(panelId); });
    btnGroup.appendChild(pinBtn);
    const closeBtn = document.createElement('button');
    closeBtn.setAttribute('data-action', 'close');
    closeBtn.setAttribute('data-panel-id', panelId);
    closeBtn.style.cssText = btnCss;
    closeBtn.title = 'Close panel';
    closeBtn.innerHTML = iconClose(14);
    closeBtn.addEventListener('click', () => { this.closeFlyout(); this.callbacks.onClosePanel(panelId); });
    btnGroup.appendChild(closeBtn);
    header.appendChild(btnGroup);
    this.flyoutEl.appendChild(header);

    // Content
    const content = document.createElement('div');
    content.style.cssText = 'flex:1;overflow:hidden;min-height:0;position:relative;';
    this.flyoutEl.appendChild(content);
    this.stripEl.parentElement?.appendChild(this.flyoutEl);
    this.flyoutContentSlot.value = this.callbacks.createContent(panelId, content);

    // Resize handle
    const rh = document.createElement('div');
    rh.className = 'dock-flyout-resize';
    rh.style.cssText = `position:absolute;z-index:1;transition:background-color 0.15s;${
      this.edge === 'left' ? 'right:0;top:0;bottom:0;width:4px;cursor:col-resize;'
      : this.edge === 'right' ? 'left:0;top:0;bottom:0;width:4px;cursor:col-resize;'
      : this.edge === 'top' ? 'bottom:0;left:0;right:0;height:4px;cursor:row-resize;'
      : 'top:0;left:0;right:0;height:4px;cursor:row-resize;'}`;
    rh.addEventListener('mousedown', (startEv) => {
      startEv.preventDefault();
      startEv.stopPropagation();
      const startPos = isV ? startEv.clientX : startEv.clientY;
      const startSize = unpinned.size;
      const sign = this.edge === 'left' || this.edge === 'top' ? 1 : -1;
      this.cancelClose();
      this.resizeMove = (ev) => {
        const delta = (isV ? ev.clientX : ev.clientY) - startPos;
        const newSize = Math.min(800, Math.max(100, startSize + delta * sign));
        if (this.flyoutEl) this.flyoutEl.style[isV ? 'width' : 'height'] = `${newSize}px`;
      };
      this.resizeUp = () => {
        if (this.resizeMove) document.removeEventListener('mousemove', this.resizeMove);
        if (this.resizeUp) document.removeEventListener('mouseup', this.resizeUp);
        if (this.flyoutEl) {
          const r = this.flyoutEl.getBoundingClientRect();
          this.callbacks.onResizeUnpinned(panelId, Math.round(isV ? r.width : r.height));
        }
        this.resizeMove = null;
        this.resizeUp = null;
      };
      document.addEventListener('mousemove', this.resizeMove);
      document.addEventListener('mouseup', this.resizeUp);
    });
    this.flyoutEl.appendChild(rh);
  }

  private closeFlyout(): void {
    if (this.resizeMove) document.removeEventListener('mousemove', this.resizeMove);
    if (this.resizeUp) document.removeEventListener('mouseup', this.resizeUp);
    this.resizeMove = null;
    this.resizeUp = null;
    this.flyoutContentSlot.clear();
    if (this.flyoutEl) { this.flyoutEl.remove(); this.flyoutEl = null; }
    this.expandedPanelId = null;
  }

  private scheduleClose(): void {
    this.closeTimeout = setTimeout(() => this.closeFlyout(), 300);
  }

  private cancelClose(): void {
    if (this.closeTimeout) { clearTimeout(this.closeTimeout); this.closeTimeout = null; }
  }
}
