import type { DockEdge, UnpinnedPanel, PanelConfig } from '../../types/dock';
import { iconClose, iconPin } from '../icons';

// ─── Interfaces ──────────────────────────────────────────────────────

export interface IDisposable {
  dispose(): void;
}

export interface UnpinnedStripViewCallbacks {
  onPinPanel: (panelId: string) => void;
  onClosePanel: (panelId: string) => void;
  onResizeUnpinned: (panelId: string, size: number) => void;
  createContent: (panelId: string, container: HTMLElement) => IDisposable;
}

// ─── UnpinnedStripView ───────────────────────────────────────────────

/**
 * Side strip for unpinned panels on a given edge (left, right, bottom).
 * Shows rotated labels; hover/click reveals a flyout content panel.
 */
export class UnpinnedStripView {
  readonly element: HTMLDivElement;

  private edge: DockEdge;
  private unpinnedPanels: UnpinnedPanel[];
  private panels: Record<string, PanelConfig>;
  private callbacks: UnpinnedStripViewCallbacks;

  // DOM references
  readonly stripEl: HTMLDivElement;
  private flyoutEl: HTMLDivElement | null = null;

  // Flyout state
  private expandedPanelId: string | null = null;
  private flyoutContentDisposable: IDisposable | null = null;
  private closeTimeout: ReturnType<typeof setTimeout> | null = null;

  // Bound handlers for cleanup
  private boundStripMouseOver: ((e: MouseEvent) => void) | null = null;
  private boundStripMouseOut: ((e: MouseEvent) => void) | null = null;
  private boundStripClick: ((e: MouseEvent) => void) | null = null;

  // Resize state
  private resizeMove: ((e: MouseEvent) => void) | null = null;
  private resizeUp: ((e: MouseEvent) => void) | null = null;

  constructor(
    edge: DockEdge,
    unpinnedPanels: UnpinnedPanel[],
    panels: Record<string, PanelConfig>,
    callbacks: UnpinnedStripViewCallbacks,
  ) {
    this.edge = edge;
    this.unpinnedPanels = unpinnedPanels;
    this.panels = panels;
    this.callbacks = callbacks;

    // Root element wraps strip + flyout
    this.element = document.createElement('div');
    this.element.style.cssText = 'display:contents;';

    // Strip bar
    this.stripEl = document.createElement('div');
    const isVertical = edge === 'left' || edge === 'right';
    this.stripEl.style.cssText = `flex-shrink:0;display:flex;align-items:stretch;z-index:30;background:hsl(var(--dock-unpinned-bg));${
      isVertical
        ? `flex-direction:column;width:28px;border-right:1px solid hsl(var(--dock-border));${
            edge === 'right' ? 'border-left:1px solid hsl(var(--dock-border));border-right:none;' : ''
          }`
        : `flex-direction:row;height:28px;${
            edge === 'top'
              ? 'border-bottom:1px solid hsl(var(--dock-border));'
              : 'border-top:1px solid hsl(var(--dock-border));'
          }`
    }`;

    this.element.appendChild(this.stripEl);
    this.setupStripDelegation();
    this.buildTabs();
  }

  // ── Public API ──────────────────────────────────────────────────

  update(unpinnedPanels: UnpinnedPanel[], panels: Record<string, PanelConfig>): void {
    this.unpinnedPanels = unpinnedPanels;
    this.panels = panels;

    // If expanded panel was removed, close flyout
    if (this.expandedPanelId && !unpinnedPanels.some((p) => p.panelId === this.expandedPanelId)) {
      this.closeFlyout();
    }

    this.stripEl.innerHTML = '';
    this.buildTabs();
  }

  dispose(): void {
    this.closeFlyout();
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout);
      this.closeTimeout = null;
    }

    // Remove delegated event listeners from strip
    if (this.boundStripMouseOver) {
      this.stripEl.removeEventListener('mouseover', this.boundStripMouseOver);
      this.boundStripMouseOver = null;
    }
    if (this.boundStripMouseOut) {
      this.stripEl.removeEventListener('mouseout', this.boundStripMouseOut);
      this.boundStripMouseOut = null;
    }
    if (this.boundStripClick) {
      this.stripEl.removeEventListener('click', this.boundStripClick);
      this.boundStripClick = null;
    }

    this.stripEl.remove();
    this.element.remove();
  }

  // ── Private: Event delegation ──────────────────────────────────

  /** Set up event delegation on stripEl for all tab interactions */
  private setupStripDelegation(): void {
    this.boundStripMouseOver = (e: MouseEvent) => {
      const tabBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-unpinned-id]');
      if (!tabBtn) return;
      const panelId = tabBtn.getAttribute('data-unpinned-id');
      if (!panelId) return;
      this.cancelClose();
      this.openFlyout(panelId);
    };

    this.boundStripMouseOut = (e: MouseEvent) => {
      const tabBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-unpinned-id]');
      if (!tabBtn) return;
      this.scheduleClose();
    };

    this.boundStripClick = (e: MouseEvent) => {
      const tabBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-unpinned-id]');
      if (!tabBtn) return;
      const panelId = tabBtn.getAttribute('data-unpinned-id');
      if (!panelId) return;
      if (this.expandedPanelId === panelId) {
        this.closeFlyout();
      } else {
        this.openFlyout(panelId);
      }
    };

    this.stripEl.addEventListener('mouseover', this.boundStripMouseOver);
    this.stripEl.addEventListener('mouseout', this.boundStripMouseOut);
    this.stripEl.addEventListener('click', this.boundStripClick);
  }

  // ── Private: Build ──────────────────────────────────────────────

  private buildTabs(): void {
    const isVertical = this.edge === 'left' || this.edge === 'right';

    for (const unpinned of this.unpinnedPanels) {
      const panel = this.panels[unpinned.panelId];
      if (!panel) continue;

      const tabBtn = document.createElement('button');
      tabBtn.className = 'dock-unpinned-tab';
      tabBtn.setAttribute('data-unpinned-id', unpinned.panelId);
      tabBtn.style.cssText = isVertical ? 'width:100%;padding:12px 0;' : 'height:100%;padding:0 12px;';
      tabBtn.title = panel.title;

      const labelSpan = document.createElement('span');
      labelSpan.style.cssText = `font-size:11px;font-weight:500;white-space:nowrap;${
        isVertical ? 'writing-mode:vertical-lr;text-orientation:mixed;' : ''
      }`;
      labelSpan.textContent = panel.title;
      tabBtn.appendChild(labelSpan);

      // No per-tab event listeners — handled by delegation on stripEl
      this.stripEl.appendChild(tabBtn);
    }
  }

  // ── Private: Flyout ─────────────────────────────────────────────

  private openFlyout(panelId: string): void {
    if (this.expandedPanelId === panelId) return;

    this.closeFlyout();
    this.expandedPanelId = panelId;

    const unpinned = this.unpinnedPanels.find((p) => p.panelId === panelId);
    const panel = this.panels[panelId];
    if (!unpinned || !panel) return;

    const isVertical = this.edge === 'left' || this.edge === 'right';

    this.flyoutEl = document.createElement('div');
    this.flyoutEl.style.cssText = `position:absolute;display:flex;flex-direction:column;overflow:hidden;z-index:40;background:hsl(var(--dock-surface));box-shadow:0 4px 16px rgba(0,0,0,0.15);${
      this.edge === 'left'
        ? `left:28px;top:0;bottom:0;border-right:1px solid hsl(var(--dock-border));width:${unpinned.size}px;`
        : this.edge === 'right'
        ? `right:28px;top:0;bottom:0;border-left:1px solid hsl(var(--dock-border));width:${unpinned.size}px;`
        : this.edge === 'top'
        ? `top:28px;left:0;right:0;border-bottom:1px solid hsl(var(--dock-border));height:${unpinned.size}px;`
        : `bottom:28px;left:0;right:0;border-top:1px solid hsl(var(--dock-border));height:${unpinned.size}px;`
    }`;

    this.flyoutEl.addEventListener('mouseenter', () => this.cancelClose());
    this.flyoutEl.addEventListener('mouseleave', () => this.scheduleClose());

    // Flyout header
    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;padding:0 12px;height:36px;flex-shrink:0;border-bottom:1px solid hsl(var(--dock-border));background:hsl(var(--dock-panel-header));';

    const titleSpan = document.createElement('span');
    titleSpan.style.cssText = 'font-size:12px;font-weight:500;color:hsl(var(--dock-text));';
    titleSpan.textContent = panel.title;
    header.appendChild(titleSpan);

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;align-items:center;gap:0;';

    // Pin button
    const pinBtn = document.createElement('button');
    // Note: no data-action attribute — the direct click handler below handles pinning.
    // Adding data-action would cause double dispatch via DockviewComponent's onActionClick.
    pinBtn.style.cssText = 'padding:4px;color:hsl(var(--dock-text));cursor:pointer;background:none;border:none;display:flex;align-items:center;';
    pinBtn.title = 'Pin panel (dock back)';
    pinBtn.innerHTML = iconPin();
    pinBtn.addEventListener('click', () => {
      this.closeFlyout();
      this.callbacks.onPinPanel(panelId);
    });
    btnGroup.appendChild(pinBtn);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.setAttribute('data-action', 'close');
    closeBtn.setAttribute('data-panel-id', panelId);
    closeBtn.style.cssText = 'padding:4px;color:hsl(var(--dock-text));cursor:pointer;background:none;border:none;display:flex;align-items:center;';
    closeBtn.title = 'Close panel';
    closeBtn.innerHTML = iconClose(14);
    closeBtn.addEventListener('click', () => {
      this.closeFlyout();
      this.callbacks.onClosePanel(panelId);
    });
    btnGroup.appendChild(closeBtn);

    header.appendChild(btnGroup);
    this.flyoutEl.appendChild(header);

    // Flyout content
    const contentContainer = document.createElement('div');
    contentContainer.style.cssText = 'flex:1;overflow:hidden;min-height:0;position:relative;';
    this.flyoutEl.appendChild(contentContainer);

    this.flyoutContentDisposable = this.callbacks.createContent(panelId, contentContainer);

    // Resize handle on the flyout edge — hover handled by CSS: .dock-flyout-resize:hover
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'dock-flyout-resize';
    resizeHandle.style.cssText = `position:absolute;transition:background-color 0.15s;${
      this.edge === 'left'
        ? 'right:0;top:0;bottom:0;width:4px;cursor:col-resize;'
        : this.edge === 'right'
        ? 'left:0;top:0;bottom:0;width:4px;cursor:col-resize;'
        : 'top:0;left:0;right:0;height:4px;cursor:row-resize;'
    }`;

    resizeHandle.addEventListener('mousedown', (startEv) => {
      startEv.preventDefault();
      startEv.stopPropagation();

      const startPos = isVertical ? startEv.clientX : startEv.clientY;
      const startSize = unpinned.size;
      const minSize = 100;
      const maxSize = 800;

      // Prevent flyout from auto-closing during resize
      this.cancelClose();

      this.resizeMove = (ev: MouseEvent) => {
        const delta = (isVertical ? ev.clientX : ev.clientY) - startPos;
        // For left/top edges, dragging right/down increases size; for right/bottom, it's inverted
        const sign = this.edge === 'left' || this.edge === 'top' ? 1 : -1;
        const newSize = Math.min(maxSize, Math.max(minSize, startSize + delta * sign));

        if (this.flyoutEl) {
          if (isVertical) {
            this.flyoutEl.style.width = `${newSize}px`;
          } else {
            this.flyoutEl.style.height = `${newSize}px`;
          }
        }
      };

      this.resizeUp = () => {
        if (this.resizeMove) document.removeEventListener('mousemove', this.resizeMove);
        if (this.resizeUp) document.removeEventListener('mouseup', this.resizeUp);

        // Read final size from the flyout element and persist
        if (this.flyoutEl) {
          const finalSize = isVertical
            ? this.flyoutEl.getBoundingClientRect().width
            : this.flyoutEl.getBoundingClientRect().height;
          this.callbacks.onResizeUnpinned(panelId, Math.round(finalSize));
        }

        this.resizeMove = null;
        this.resizeUp = null;
      };

      document.addEventListener('mousemove', this.resizeMove);
      document.addEventListener('mouseup', this.resizeUp);
    });

    this.flyoutEl.appendChild(resizeHandle);

    // Append flyout to the strip's parent (which should be position:relative)
    this.stripEl.parentElement?.appendChild(this.flyoutEl);
  }

  private closeFlyout(): void {
    // Clean up any in-progress resize
    if (this.resizeMove) document.removeEventListener('mousemove', this.resizeMove);
    if (this.resizeUp) document.removeEventListener('mouseup', this.resizeUp);
    this.resizeMove = null;
    this.resizeUp = null;

    if (this.flyoutContentDisposable) {
      this.flyoutContentDisposable.dispose();
      this.flyoutContentDisposable = null;
    }
    if (this.flyoutEl) {
      this.flyoutEl.remove();
      this.flyoutEl = null;
    }
    this.expandedPanelId = null;
  }

  private scheduleClose(): void {
    this.closeTimeout = setTimeout(() => {
      this.closeFlyout();
    }, 300);
  }

  private cancelClose(): void {
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout);
      this.closeTimeout = null;
    }
  }
}
