import type { DockPosition } from '../types/dock';

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

// ─── DockIndicatorRenderer ──────────────────────────────────────────

/**
 * Manages all visual indicator elements during drag operations:
 * per-pane dock indicators, edge indicators, preview rectangles, and ghost elements.
 *
 * Extracted from DockDragManager for separation of concerns.
 */
export class DockIndicatorRenderer {
  private theme: 'light' | 'dark';

  // Ghost element
  private ghostEl: HTMLDivElement | null = null;

  // Preview rectangle
  private previewEl: HTMLDivElement | null = null;

  // Per-pane indicator containers
  private paneIndicators = new Map<string, { container: HTMLDivElement; rect: DOMRect }>();

  get paneIndicatorCount(): number { return this.paneIndicators.size; }

  // Edge indicators
  private edgeIndicators: HTMLDivElement[] = [];

  // Single-target indicator container (unused in current flow but kept for compatibility)
  private indicatorContainer: HTMLDivElement | null = null;

  constructor(theme: 'light' | 'dark') {
    this.theme = theme;
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.theme = theme;
  }

  // ── Ghost element ─────────────────────────────────────────────

  createGhost(x: number, y: number, sourceTitle: string, sourcePaneRect: DOMRect | null): void {
    const c = THEME_COLORS[this.theme];
    const el = document.createElement('div');

    const ghostW = sourcePaneRect ? Math.round(sourcePaneRect.width) : 280;
    const ghostH = sourcePaneRect ? Math.round(sourcePaneRect.height) : 180;
    const offsetX = Math.round(ghostW / 2);
    const offsetY = 14;

    Object.assign(el.style, {
      position: 'fixed', left: `${x - offsetX}px`, top: `${y - offsetY}px`, zIndex: '10001',
      pointerEvents: 'none', width: `${ghostW}px`, height: `${ghostH}px`,
      backgroundColor: c.ghost, border: `1px solid ${c.ghostBorder}`,
      borderRadius: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      overflow: 'hidden', opacity: '0.75',
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif',
    });

    const titlebar = document.createElement('div');
    Object.assign(titlebar.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 12px', fontSize: '12px', fontWeight: '500',
      borderBottom: `1px solid ${c.ghostBorder}`,
      color: c.text, minHeight: '32px',
    });
    titlebar.textContent = sourceTitle;
    el.appendChild(titlebar);

    const content = document.createElement('div');
    Object.assign(content.style, { flex: '1', background: c.ghost });
    el.appendChild(content);

    document.body.appendChild(el);
    this.ghostEl = el;
  }

  moveGhost(x: number, y: number, sourcePaneRect: DOMRect | null): void {
    if (this.ghostEl) {
      const ghostW = sourcePaneRect ? Math.round(sourcePaneRect.width) : 280;
      this.ghostEl.style.left = `${x - Math.round(ghostW / 2)}px`;
      this.ghostEl.style.top = `${y - 14}px`;
    }
  }

  hideGhost(): void {
    if (this.ghostEl) this.ghostEl.style.display = 'none';
  }

  showGhost(): void {
    if (this.ghostEl) this.ghostEl.style.display = '';
  }

  removeGhost(): void {
    if (this.ghostEl && this.ghostEl.parentNode) {
      this.ghostEl.parentNode.removeChild(this.ghostEl);
      this.ghostEl = null;
    }
  }

  // ── Preview rectangle ─────────────────────────────────────────

  showPreview(rect: DOMRect, position: DockPosition): void {
    const c = THEME_COLORS[this.theme];
    if (!this.previewEl) {
      const el = document.createElement('div');
      Object.assign(el.style, {
        position: 'fixed', zIndex: '10000', pointerEvents: 'none',
        backgroundColor: c.previewBg, border: `1px solid ${c.previewBorder}`,
        borderRadius: '2px',
        transition: 'left 0.08s, top 0.08s, width 0.08s, height 0.08s',
      });
      document.body.appendChild(el);
      this.previewEl = el;
    }

    let l = rect.left, t = rect.top, w = rect.width, h = rect.height;
    if (position === 'left')   { w = rect.width / 2; }
    if (position === 'right')  { l = rect.left + rect.width / 2; w = rect.width / 2; }
    if (position === 'top')    { h = rect.height / 2; }
    if (position === 'bottom') { t = rect.top + rect.height / 2; h = rect.height / 2; }

    Object.assign(this.previewEl.style, {
      left: `${l}px`, top: `${t}px`, width: `${w}px`, height: `${h}px`, opacity: '1',
    });
  }

  hidePreview(): void {
    if (this.previewEl) this.previewEl.style.opacity = '0';
  }

  removePreview(): void {
    if (this.previewEl && this.previewEl.parentNode) {
      this.previewEl.parentNode.removeChild(this.previewEl);
      this.previewEl = null;
    }
  }

  // ── Single-target indicators (legacy) ─────────────────────────

  showIndicators(targetRect: DOMRect, activePos: DockPosition): void {
    if (!this.indicatorContainer) this.createIndicatorDOM();

    const cx = targetRect.left + targetRect.width / 2;
    const cy = targetRect.top + targetRect.height / 2;

    if (this.indicatorContainer) {
      this.indicatorContainer.style.left = `${cx}px`;
      this.indicatorContainer.style.top = `${cy}px`;
      this.indicatorContainer.style.opacity = '1';
    }

    const c = THEME_COLORS[this.theme];
    if (this.indicatorContainer) {
      const indicators = this.indicatorContainer.querySelectorAll('[data-pos]');
      indicators.forEach((el) => {
        const pos = el.getAttribute('data-pos');
        const isActive = pos === activePos;
        const htmlEl = el as HTMLElement;
        htmlEl.style.backgroundColor = isActive ? c.indicatorActiveBg : 'transparent';
        htmlEl.style.borderColor = isActive ? c.indicatorActiveBorder : c.indicatorBorder;
        const svg = el.querySelector('svg');
        if (svg) {
          const color = isActive ? c.indicatorActiveBorder : c.text;
          svg.querySelectorAll('path,polyline,rect,line').forEach((s) => {
            if (s.getAttribute('stroke')) (s as SVGElement).setAttribute('stroke', color);
            if (s.getAttribute('fill') && s.getAttribute('fill') !== 'none') (s as SVGElement).setAttribute('fill', color);
          });
        }
      });
    }
  }

  hideIndicators(): void {
    if (this.indicatorContainer) this.indicatorContainer.style.opacity = '0';
  }

  removeIndicators(): void {
    if (this.indicatorContainer && this.indicatorContainer.parentNode) {
      this.indicatorContainer.parentNode.removeChild(this.indicatorContainer);
      this.indicatorContainer = null;
    }
  }

  getIndicatorUnderCursor(cx: number, cy: number): DockPosition | null {
    if (!this.indicatorContainer) return null;
    const indicators = this.indicatorContainer.querySelectorAll('[data-pos]');
    for (const el of indicators) {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
        return el.getAttribute('data-pos') as DockPosition;
      }
    }
    return null;
  }

  private createIndicatorDOM(): void {
    const S = 28;
    const G = 4;

    const cont = document.createElement('div');
    Object.assign(cont.style, {
      position: 'fixed', zIndex: '10002', pointerEvents: 'none',
      transform: 'translate(-50%, -50%)', opacity: '0',
      transition: 'opacity 0.12s ease',
    });

    const c = THEME_COLORS[this.theme];

    const caretSVG = (rotation: number) =>
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="transform:rotate(${rotation}deg)">
        <polyline points="6,18 12,12 18,18" stroke="${c.text}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>`;

    const centerSVG =
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="5" width="14" height="14" rx="1.5" stroke="${c.text}" stroke-width="2" fill="none"/>
      </svg>`;

    const mkIndicator = (pos: string, left: number, top: number, svg: string): HTMLDivElement => {
      const el = document.createElement('div');
      el.setAttribute('data-pos', pos);
      Object.assign(el.style, {
        position: 'absolute', width: `${S}px`, height: `${S}px`,
        left: `${left}px`, top: `${top}px`,
        backgroundColor: c.indicatorBg,
        border: `1.5px solid ${c.indicatorBorder}`,
        borderRadius: '5px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background-color 0.12s, border-color 0.12s, box-shadow 0.12s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
      });
      el.innerHTML = svg;
      return el;
    };

    const half = S / 2;

    cont.appendChild(mkIndicator('top',    -half,          -S - half - G,  caretSVG(0)));
    cont.appendChild(mkIndicator('left',   -S - half - G,  -half,          caretSVG(-90)));
    cont.appendChild(mkIndicator('center', -half,          -half,          centerSVG));
    cont.appendChild(mkIndicator('right',  half + G,       -half,          caretSVG(90)));
    cont.appendChild(mkIndicator('bottom', -half,          half + G,       caretSVG(180)));

    document.body.appendChild(cont);
    this.indicatorContainer = cont;
  }

  // ── Per-pane indicators ───────────────────────────────────────

  /** Create indicators for all dock target panes. Caches bounding rects at creation time. */
  createAllPaneIndicators(container: HTMLElement, sourceId: string): void {
    this.removeAllPaneIndicators();

    const targets = container.querySelectorAll<HTMLElement>('[data-dock-target]');
    const c = THEME_COLORS[this.theme];
    const S = 28;
    const G = 4;

    const caretSVG = (rotation: number) =>
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="transform:rotate(${rotation}deg)">
        <polyline points="6,18 12,12 18,18" stroke="${c.text}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>`;

    const centerSVG =
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="5" width="14" height="14" rx="1.5" stroke="${c.text}" stroke-width="2" fill="none"/>
      </svg>`;

    for (const target of targets) {
      const targetId = target.getAttribute('data-dock-target');
      if (!targetId || targetId === sourceId) continue;

      const rect = target.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 80) continue;

      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const cont = document.createElement('div');
      cont.setAttribute('data-indicator-target', targetId);
      cont.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;z-index:10002;pointer-events:none;transform:translate(-50%,-50%);transition:opacity 0.12s;`;

      const half = S / 2;
      const mkInd = (pos: string, left: number, top: number, svg: string) => {
        const el = document.createElement('div');
        el.setAttribute('data-pos', pos);
        el.setAttribute('data-target-id', targetId);
        el.style.cssText = `position:absolute;width:${S}px;height:${S}px;left:${left}px;top:${top}px;background:${c.indicatorBg};border:1.5px solid ${c.indicatorBorder};border-radius:5px;display:flex;align-items:center;justify-content:center;transition:background-color 0.12s,border-color 0.12s,box-shadow 0.12s;pointer-events:auto;box-shadow:0 1px 4px rgba(0,0,0,0.12);`;
        el.innerHTML = svg;
        cont.appendChild(el);
      };

      mkInd('top',    -half,          -S - half - G,  caretSVG(0));
      mkInd('left',   -S - half - G,  -half,          caretSVG(-90));
      mkInd('center', -half,          -half,          centerSVG);
      mkInd('right',  half + G,       -half,          caretSVG(90));
      mkInd('bottom', -half,          half + G,       caretSVG(180));

      document.body.appendChild(cont);
      // Cache the rect alongside the container for hit testing without re-querying
      this.paneIndicators.set(targetId, { container: cont, rect });
    }
  }

  removeAllPaneIndicators(): void {
    for (const [, entry] of this.paneIndicators) {
      if (entry.container.parentNode) entry.container.parentNode.removeChild(entry.container);
    }
    this.paneIndicators.clear();
  }

  /** Hit test using cached rects for indicator sub-elements. */
  getPaneIndicatorUnderCursor(cx: number, cy: number): { targetId: string; position: DockPosition } | null {
    for (const [targetId, entry] of this.paneIndicators) {
      const indicators = entry.container.querySelectorAll('[data-pos]');
      for (const el of indicators) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
          return { targetId, position: el.getAttribute('data-pos') as DockPosition };
        }
      }
    }
    return null;
  }

  updateAllPaneIndicatorActive(activeTargetId: string | null, activePos: DockPosition | null): void {
    const c = THEME_COLORS[this.theme];
    for (const [targetId, entry] of this.paneIndicators) {
      const indicators = entry.container.querySelectorAll('[data-pos]');
      indicators.forEach((el) => {
        const pos = el.getAttribute('data-pos');
        const isActive = targetId === activeTargetId && pos === activePos;
        const htmlEl = el as HTMLElement;
        htmlEl.style.backgroundColor = isActive ? c.indicatorActiveBg : 'transparent';
        htmlEl.style.borderColor = isActive ? c.indicatorActiveBorder : c.indicatorBorder;
        const svg = el.querySelector('svg');
        if (svg) {
          const color = isActive ? c.indicatorActiveBorder : c.text;
          svg.querySelectorAll('path,polyline,rect,line').forEach((s) => {
            if (s.getAttribute('stroke')) (s as SVGElement).setAttribute('stroke', color);
            if (s.getAttribute('fill') && s.getAttribute('fill') !== 'none') (s as SVGElement).setAttribute('fill', color);
          });
        }
      });
    }
  }

  // ── Edge indicators ───────────────────────────────────────────

  createEdgeIndicators(container: HTMLElement): void {
    this.removeEdgeIndicators();

    const containerRect = container.getBoundingClientRect();
    const c = THEME_COLORS[this.theme];
    const SIZE = 24;

    const positions: Array<{ pos: DockPosition; x: number; y: number; rotation: number }> = [
      { pos: 'top',    x: containerRect.left + containerRect.width / 2 - SIZE / 2, y: containerRect.top + 8,                          rotation: 0 },
      { pos: 'bottom', x: containerRect.left + containerRect.width / 2 - SIZE / 2, y: containerRect.bottom - SIZE - 8,                rotation: 180 },
      { pos: 'left',   x: containerRect.left + 8,                                  y: containerRect.top + containerRect.height / 2 - SIZE / 2, rotation: -90 },
      { pos: 'right',  x: containerRect.right - SIZE - 8,                          y: containerRect.top + containerRect.height / 2 - SIZE / 2, rotation: 90 },
    ];

    for (const { pos, x, y, rotation } of positions) {
      const el = document.createElement('div');
      el.setAttribute('data-edge-pos', pos);
      el.style.cssText = `
        position:fixed; left:${x}px; top:${y}px; z-index:10003;
        width:${SIZE}px; height:${SIZE}px;
        display:flex; align-items:center; justify-content:center;
        background:${c.indicatorBg}; border:1.5px solid ${c.indicatorBorder};
        border-radius:5px; pointer-events:auto; cursor:pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        transition: background-color 0.12s, border-color 0.12s, transform 0.12s, box-shadow 0.12s;
      `;
      el.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="transform:rotate(${rotation}deg)">
        <polyline points="6,18 12,12 18,18" stroke="${c.text}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>`;

      document.body.appendChild(el);
      this.edgeIndicators.push(el);
    }
  }

  removeEdgeIndicators(): void {
    for (const el of this.edgeIndicators) {
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    this.edgeIndicators = [];
  }

  getEdgeIndicatorUnderCursor(cx: number, cy: number): DockPosition | null {
    for (const el of this.edgeIndicators) {
      const rect = el.getBoundingClientRect();
      if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
        return el.getAttribute('data-edge-pos') as DockPosition;
      }
    }
    return null;
  }

  updateEdgeIndicatorActive(activePos: DockPosition | null): void {
    const c = THEME_COLORS[this.theme];
    for (const el of this.edgeIndicators) {
      const pos = el.getAttribute('data-edge-pos');
      const isActive = pos === activePos;
      el.style.backgroundColor = isActive ? c.indicatorActiveBg : c.indicatorBg;
      el.style.borderColor = isActive ? c.indicatorActiveBorder : c.indicatorBorder;
      el.style.transform = isActive ? 'scale(1.15)' : 'scale(1)';
      const svg = el.querySelector('svg');
      if (svg) {
        const color = isActive ? c.indicatorActiveBorder : c.text;
        svg.querySelectorAll('polyline').forEach((s) => {
          s.setAttribute('stroke', color);
        });
      }
    }
  }

  // ── Cleanup all ───────────────────────────────────────────────

  /** Hide all dock indicators without destroying them (for tab reorder sub-mode) */
  hideDockIndicators(): void {
    for (const [, entry] of this.paneIndicators) {
      entry.container.style.display = 'none';
    }
    for (const el of this.edgeIndicators) {
      el.style.display = 'none';
    }
  }

  /** Show all dock indicators (when exiting tab reorder sub-mode) */
  showDockIndicators(): void {
    for (const [, entry] of this.paneIndicators) {
      entry.container.style.display = '';
    }
    for (const el of this.edgeIndicators) {
      el.style.display = '';
    }
  }

  removeAll(): void {
    this.removeGhost();
    this.removePreview();
    this.removeIndicators();
    this.removeAllPaneIndicators();
    this.removeEdgeIndicators();
  }
}
