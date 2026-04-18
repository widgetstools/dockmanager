import type { SplitNode, LayoutNode } from '../../types/dock';

export interface SplitViewCallbacks {
  onResizeSplit: (splitId: string, sizes: number[]) => void;
  onResetSizes?: (splitId: string) => void;
  createChildView: (node: LayoutNode) => HTMLElement;
  /** Returns minimum pixel size a child node can occupy along the split axis */
  getChildMinSize?: (node: LayoutNode, axis: 'horizontal' | 'vertical') => number;
  /** Returns maximum pixel size (Infinity for unconstrained) */
  getChildMaxSize?: (node: LayoutNode, axis: 'horizontal' | 'vertical') => number;
}

export class SplitView {
  readonly element: HTMLDivElement;
  private node: SplitNode;
  private callbacks: SplitViewCallbacks;
  private childContainers: HTMLDivElement[] = [];
  private splitters: HTMLDivElement[] = [];
  private resizingIndex: number | null = null;
  private liveSizes: number[];
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundMouseUp: (() => void) | null = null;
  private boundTouchMove: ((e: TouchEvent) => void) | null = null;
  private boundTouchEnd: (() => void) | null = null;
  private resizeRafId: number | null = null;

  constructor(node: SplitNode, callbacks: SplitViewCallbacks) {
    this.node = node;
    this.callbacks = callbacks;
    this.liveSizes = [...node.sizes];
    this.element = document.createElement('div');
    this.element.style.cssText = `display:flex;height:100%;width:100%;flex-direction:${
      node.direction === 'horizontal' ? 'row' : 'column'};`;
    this.buildChildren();
  }

  updateSizes(sizes: number[]): void {
    this.liveSizes = [...sizes];
    this.node = { ...this.node, sizes };
    const prop = this.node.direction === 'horizontal' ? 'width' : 'height';
    for (let i = 0; i < this.childContainers.length; i++)
      this.childContainers[i].style[prop] = `${sizes[i]}%`;
  }

  getChildContainers(): HTMLDivElement[] { return this.childContainers; }

  rebuild(node: SplitNode): void {
    this.node = node;
    this.liveSizes = [...node.sizes];
    this.element.innerHTML = '';
    this.childContainers = [];
    this.splitters = [];
    this.element.style.flexDirection = node.direction === 'horizontal' ? 'row' : 'column';
    this.buildChildren();
  }

  dispose(): void {
    if (this.resizeRafId !== null) { cancelAnimationFrame(this.resizeRafId); this.resizeRafId = null; }
    this.removeDocumentListeners();
    this.element.parentNode?.removeChild(this.element);
  }

  private buildChildren(): void {
    const isH = this.node.direction === 'horizontal';
    for (let i = 0; i < this.node.children.length; i++) {
      const c = document.createElement('div');
      c.style.cssText = 'position:relative;overflow:hidden;';
      if (isH) { c.style.width = `${this.node.sizes[i]}%`; c.style.minWidth = '40px'; c.style.height = '100%'; }
      else { c.style.height = `${this.node.sizes[i]}%`; c.style.minHeight = '40px'; c.style.width = '100%'; }
      c.appendChild(this.callbacks.createChildView(this.node.children[i]));
      this.element.appendChild(c);
      this.childContainers.push(c);
      if (i < this.node.children.length - 1) {
        const s = this.createSplitter(i, isH);
        this.element.appendChild(s);
        this.splitters.push(s);
      }
    }
  }

  private createSplitter(index: number, isH: boolean): HTMLDivElement {
    const s = document.createElement('div');
    s.className = 'dock-splitter';
    s.setAttribute('role', 'separator');
    s.setAttribute('aria-orientation', isH ? 'vertical' : 'horizontal');
    s.setAttribute('aria-valuenow', String(Math.round(this.liveSizes[index])));
    s.tabIndex = 0;
    s.setAttribute('data-direction', isH ? 'horizontal' : 'vertical');
    const hit = document.createElement('div');
    hit.style.cssText = `position:absolute;cursor:${isH ? 'col-resize' : 'row-resize'};`;
    if (isH) { hit.style.left = '-6px'; hit.style.right = '-6px'; hit.style.top = '0'; hit.style.bottom = '0'; }
    else { hit.style.left = '0'; hit.style.right = '0'; hit.style.top = '-6px'; hit.style.bottom = '-6px'; }
    s.appendChild(hit);
    s.addEventListener('mousedown', (e) => { e.preventDefault(); this.startResize(index); });
    s.addEventListener('dblclick', (e) => {
      e.preventDefault();
      const eq = 100 / this.node.children.length;
      this.callbacks.onResizeSplit(this.node.id, this.node.children.map(() => eq));
    });
    s.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      this.startResize(index);
    }, { passive: false });
    return s;
  }

  private startResize(index: number): void {
    this.resizingIndex = index;
    const isH = this.node.direction === 'horizontal';
    const rect = this.element.getBoundingClientRect();
    const totalSize = isH ? rect.width : rect.height;
    const offset = isH ? rect.left : rect.top;

    if (this.splitters[index]) this.splitters[index].style.backgroundColor = 'hsl(var(--dock-primary))';

    this.boundMouseMove = (e: MouseEvent) => {
      if (this.resizingIndex === null) return;
      const pos = (isH ? e.clientX : e.clientY) - offset;
      const pct = (pos / totalSize) * 100;
      const newSizes = [...this.liveSizes];
      let cumBefore = 0;
      for (let i = 0; i < this.resizingIndex; i++) cumBefore += newSizes[i];
      const axis = this.node.direction;
      const lChild = this.node.children[this.resizingIndex];
      const rChild = this.node.children[this.resizingIndex + 1];
      const lMinPx = Math.max(50, this.callbacks.getChildMinSize?.(lChild, axis) ?? 50);
      const rMinPx = Math.max(50, this.callbacks.getChildMinSize?.(rChild, axis) ?? 50);
      const lMaxPx = this.callbacks.getChildMaxSize?.(lChild, axis) ?? Infinity;
      const rMaxPx = this.callbacks.getChildMaxSize?.(rChild, axis) ?? Infinity;
      const toPct = (px: number) => (px / totalSize) * 100;
      const lMinPct = toPct(lMinPx), rMinPct = toPct(rMinPx);
      const lMaxPct = isFinite(lMaxPx) ? toPct(lMaxPx) : Infinity;
      const rMaxPct = isFinite(rMaxPx) ? toPct(rMaxPx) : Infinity;
      const collapsePct = toPct(30);
      const combined = newSizes[this.resizingIndex] + newSizes[this.resizingIndex + 1];
      let newFirst = Math.max(0, Math.min(combined, pct - cumBefore));
      let newSecond = combined - newFirst;
      if (newFirst < collapsePct && lMinPx <= 50) { newFirst = 0; newSecond = combined; }
      else if (newSecond < collapsePct && rMinPx <= 50) { newSecond = 0; newFirst = combined; }
      else {
        newFirst = Math.max(lMinPct, Math.min(combined - rMinPct, newFirst));
        newFirst = Math.min(lMaxPct, Math.max(combined - rMaxPct, newFirst));
        newSecond = combined - newFirst;
      }
      newSizes[this.resizingIndex] = newFirst;
      newSizes[this.resizingIndex + 1] = newSecond;
      this.liveSizes = newSizes;
      const prop = isH ? 'width' : 'height';
      for (let i = 0; i < this.childContainers.length; i++)
        this.childContainers[i].style[prop] = `${newSizes[i]}%`;
      if (this.resizeRafId === null) {
        this.resizeRafId = requestAnimationFrame(() => {
          this.resizeRafId = null;
          this.callbacks.onResizeSplit(this.node.id, this.liveSizes);
        });
      }
    };

    this.boundMouseUp = () => {
      if (this.resizeRafId !== null) { cancelAnimationFrame(this.resizeRafId); this.resizeRafId = null; }
      this.callbacks.onResizeSplit(this.node.id, this.liveSizes);
      if (this.resizingIndex !== null && this.splitters[this.resizingIndex])
        this.splitters[this.resizingIndex].style.backgroundColor = '';
      this.resizingIndex = null;
      this.removeDocumentListeners();
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    this.boundTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const t = e.touches[0];
      this.boundMouseMove?.({ clientX: t.clientX, clientY: t.clientY } as MouseEvent);
    };
    this.boundTouchEnd = () => this.boundMouseUp?.();

    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
    document.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    document.addEventListener('touchend', this.boundTouchEnd);
    document.body.style.cursor = isH ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }

  private removeDocumentListeners(): void {
    if (this.boundMouseMove) { document.removeEventListener('mousemove', this.boundMouseMove); this.boundMouseMove = null; }
    if (this.boundMouseUp) { document.removeEventListener('mouseup', this.boundMouseUp); this.boundMouseUp = null; }
    if (this.boundTouchMove) { document.removeEventListener('touchmove', this.boundTouchMove); this.boundTouchMove = null; }
    if (this.boundTouchEnd) { document.removeEventListener('touchend', this.boundTouchEnd); this.boundTouchEnd = null; }
  }
}
