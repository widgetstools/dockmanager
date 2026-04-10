import type { SplitNode, LayoutNode } from '../../types/dock';

// ─── Interfaces ──────────────────────────────────────────────────────

export interface SplitViewCallbacks {
  onResizeSplit: (splitId: string, sizes: number[]) => void;
  onResetSizes?: (splitId: string) => void;
  createChildView: (node: LayoutNode) => HTMLElement;
  /**
   * Optional min-size provider. Returns the minimum pixel size a child node
   * can occupy along the split axis. Used by the splitter drag handler to
   * clamp per-child based on the panels inside that subtree.
   */
  getChildMinSize?: (node: LayoutNode, axis: 'horizontal' | 'vertical') => number;
  /**
   * Optional max-size provider. Same semantics as `getChildMinSize` but for
   * upper bound. Return `Infinity` for unconstrained.
   */
  getChildMaxSize?: (node: LayoutNode, axis: 'horizontal' | 'vertical') => number;
}

// ─── SplitView ───────────────────────────────────────────────────────

/**
 * Creates a flex container (row or column) with child containers
 * at percentage sizes, separated by draggable splitter dividers.
 */
export class SplitView {
  readonly element: HTMLDivElement;

  private node: SplitNode;
  private callbacks: SplitViewCallbacks;

  // DOM references
  private childContainers: HTMLDivElement[] = [];
  private splitters: HTMLDivElement[] = [];

  // Resize state
  private resizingIndex: number | null = null;
  private liveSizes: number[];

  // Bound handlers for cleanup
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundMouseUp: (() => void) | null = null;
  private boundTouchMove: ((e: TouchEvent) => void) | null = null;
  private boundTouchEnd: (() => void) | null = null;

  // rAF throttle for resize dispatch
  private resizeRafId: number | null = null;

  constructor(node: SplitNode, callbacks: SplitViewCallbacks) {
    this.node = node;
    this.callbacks = callbacks;
    this.liveSizes = [...node.sizes];

    // Create root element
    this.element = document.createElement('div');
    this.element.style.cssText = `display:flex;height:100%;width:100%;flex-direction:${
      node.direction === 'horizontal' ? 'row' : 'column'
    };`;

    this.buildChildren();
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Update sizes without rebuilding children. Call when only sizes changed.
   */
  updateSizes(sizes: number[]): void {
    this.liveSizes = [...sizes];
    this.node = { ...this.node, sizes };
    const isHorizontal = this.node.direction === 'horizontal';

    for (let i = 0; i < this.childContainers.length; i++) {
      const container = this.childContainers[i];
      if (isHorizontal) {
        container.style.width = `${sizes[i]}%`;
      } else {
        container.style.height = `${sizes[i]}%`;
      }
    }
  }

  /**
   * Get the child containers (for inserting child views into).
   */
  getChildContainers(): HTMLDivElement[] {
    return this.childContainers;
  }

  /**
   * Full rebuild of children. Call when the structure changes.
   */
  rebuild(node: SplitNode): void {
    this.node = node;
    this.liveSizes = [...node.sizes];

    // Clear existing
    this.element.innerHTML = '';
    this.childContainers = [];
    this.splitters = [];

    this.element.style.flexDirection = node.direction === 'horizontal' ? 'row' : 'column';
    this.buildChildren();
  }

  dispose(): void {
    if (this.resizeRafId !== null) {
      cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = null;
    }
    this.removeDocumentListeners();
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }

  // ── Private: Build ──────────────────────────────────────────────

  private buildChildren(): void {
    const isHorizontal = this.node.direction === 'horizontal';

    for (let i = 0; i < this.node.children.length; i++) {
      // Child container
      const childContainer = document.createElement('div');
      childContainer.style.cssText = 'overflow:hidden;';
      if (isHorizontal) {
        childContainer.style.width = `${this.node.sizes[i]}%`;
        childContainer.style.minWidth = '40px';
        childContainer.style.height = '100%';
      } else {
        childContainer.style.height = `${this.node.sizes[i]}%`;
        childContainer.style.minHeight = '40px';
        childContainer.style.width = '100%';
      }

      // Insert child view
      const childEl = this.callbacks.createChildView(this.node.children[i]);
      childContainer.appendChild(childEl);
      this.element.appendChild(childContainer);
      this.childContainers.push(childContainer);

      // Splitter (between children)
      if (i < this.node.children.length - 1) {
        const splitter = this.createSplitter(i, isHorizontal);
        this.element.appendChild(splitter);
        this.splitters.push(splitter);
      }
    }
  }

  private createSplitter(index: number, isHorizontal: boolean): HTMLDivElement {
    const splitter = document.createElement('div');
    splitter.className = 'dock-splitter';
    splitter.setAttribute('role', 'separator');
    splitter.setAttribute('aria-orientation', isHorizontal ? 'vertical' : 'horizontal');
    splitter.setAttribute('aria-valuenow', String(Math.round(this.liveSizes[index])));
    splitter.tabIndex = 0;
    splitter.setAttribute('data-direction', isHorizontal ? 'horizontal' : 'vertical');

    // Invisible wider hit area
    const hitArea = document.createElement('div');
    hitArea.style.cssText = 'position:absolute;';
    if (isHorizontal) {
      hitArea.style.left = '-6px';
      hitArea.style.right = '-6px';
      hitArea.style.top = '0';
      hitArea.style.bottom = '0';
    } else {
      hitArea.style.left = '0';
      hitArea.style.right = '0';
      hitArea.style.top = '-6px';
      hitArea.style.bottom = '-6px';
    }
    splitter.appendChild(hitArea);

    // Hover effects are handled by CSS: .dock-splitter:hover { background: hsl(var(--dock-splitter-hover)); }
    // No JS listeners needed — avoids memory leaks when splitters are rebuilt.

    // Mousedown starts resize
    splitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.startResize(index);
    });

    // Double-click splitter → reset to equal sizes
    splitter.addEventListener('dblclick', (e) => {
      e.preventDefault();
      const equalSize = 100 / this.node.children.length;
      const equalSizes = this.node.children.map(() => equalSize);
      this.callbacks.onResizeSplit(this.node.id, equalSizes);
    });

    // Touch support for splitter resize
    splitter.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      this.startResize(index);
    }, { passive: false });

    return splitter;
  }

  // ── Private: Resize ─────────────────────────────────────────────

  private startResize(index: number): void {
    this.resizingIndex = index;
    const isHorizontal = this.node.direction === 'horizontal';

    // Cache the bounding rect at the start of resize instead of on every mousemove
    const cachedRect = this.element.getBoundingClientRect();
    const totalSize = isHorizontal ? cachedRect.width : cachedRect.height;
    const cachedOffset = isHorizontal ? cachedRect.left : cachedRect.top;

    // Highlight splitter
    if (this.splitters[index]) {
      this.splitters[index].style.backgroundColor = 'hsl(var(--dock-primary))';
    }

    this.boundMouseMove = (e: MouseEvent) => {
      if (this.resizingIndex === null) return;

      const pos = (isHorizontal ? e.clientX : e.clientY) - cachedOffset;
      const percentage = (pos / totalSize) * 100;

      const newSizes = [...this.liveSizes];
      let cumBefore = 0;
      for (let i = 0; i < this.resizingIndex; i++) {
        cumBefore += newSizes[i];
      }
      // Compute per-child min/max in pixels (from panel constraints), fall
      // back to the global 50px floor and Infinity ceiling when no provider.
      const axis = this.node.direction;
      const leftChild = this.node.children[this.resizingIndex];
      const rightChild = this.node.children[this.resizingIndex + 1];
      const leftMinPx = Math.max(50, this.callbacks.getChildMinSize?.(leftChild, axis) ?? 50);
      const rightMinPx = Math.max(50, this.callbacks.getChildMinSize?.(rightChild, axis) ?? 50);
      const leftMaxPx = this.callbacks.getChildMaxSize?.(leftChild, axis) ?? Infinity;
      const rightMaxPx = this.callbacks.getChildMaxSize?.(rightChild, axis) ?? Infinity;
      const leftMinPct = (leftMinPx / totalSize) * 100;
      const rightMinPct = (rightMinPx / totalSize) * 100;
      const leftMaxPct = isFinite(leftMaxPx) ? (leftMaxPx / totalSize) * 100 : Infinity;
      const rightMaxPct = isFinite(rightMaxPx) ? (rightMaxPx / totalSize) * 100 : Infinity;
      // Collapse threshold: 30px
      const collapsePct = (30 / totalSize) * 100;

      const combined = newSizes[this.resizingIndex] + newSizes[this.resizingIndex + 1];
      let newFirst = Math.max(0, Math.min(combined, percentage - cumBefore));
      let newSecond = combined - newFirst;

      // Collapse pane when dragged to edge (< 30px) — only if not min-constrained
      if (newFirst < collapsePct && leftMinPx <= 50) {
        newFirst = 0;
        newSecond = combined;
      } else if (newSecond < collapsePct && rightMinPx <= 50) {
        newSecond = 0;
        newFirst = combined;
      } else {
        // Enforce per-child minimum + maximum sizes
        newFirst = Math.max(leftMinPct, Math.min(combined - rightMinPct, newFirst));
        newFirst = Math.min(leftMaxPct, Math.max(combined - rightMaxPct, newFirst));
        newSecond = combined - newFirst;
      }

      newSizes[this.resizingIndex] = newFirst;
      newSizes[this.resizingIndex + 1] = newSecond;
      this.liveSizes = newSizes;

      // Update DOM sizes immediately for smooth feedback
      for (let i = 0; i < this.childContainers.length; i++) {
        if (isHorizontal) {
          this.childContainers[i].style.width = `${newSizes[i]}%`;
        } else {
          this.childContainers[i].style.height = `${newSizes[i]}%`;
        }
      }

      // Batch dispatch inside rAF to avoid triggering reducer+render on every mousemove
      if (this.resizeRafId === null) {
        this.resizeRafId = requestAnimationFrame(() => {
          this.resizeRafId = null;
          this.callbacks.onResizeSplit(this.node.id, this.liveSizes);
        });
      }
    };

    this.boundMouseUp = () => {
      // Cancel any pending rAF
      if (this.resizeRafId !== null) {
        cancelAnimationFrame(this.resizeRafId);
        this.resizeRafId = null;
      }
      // Final dispatch to ensure state is in sync
      this.callbacks.onResizeSplit(this.node.id, this.liveSizes);

      // Reset splitter styling
      if (this.resizingIndex !== null && this.splitters[this.resizingIndex]) {
        this.splitters[this.resizingIndex].style.backgroundColor = '';
      }
      this.resizingIndex = null;
      this.removeDocumentListeners();
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    // Touch move handler (maps touch coords to mouse handler logic)
    this.boundTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      // Create a synthetic mouse event-like object for the existing handler
      this.boundMouseMove?.({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
    };

    this.boundTouchEnd = () => {
      this.boundMouseUp?.();
    };

    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
    document.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    document.addEventListener('touchend', this.boundTouchEnd);
    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }

  private removeDocumentListeners(): void {
    if (this.boundMouseMove) {
      document.removeEventListener('mousemove', this.boundMouseMove);
      this.boundMouseMove = null;
    }
    if (this.boundMouseUp) {
      document.removeEventListener('mouseup', this.boundMouseUp);
      this.boundMouseUp = null;
    }
    if (this.boundTouchMove) {
      document.removeEventListener('touchmove', this.boundTouchMove);
      this.boundTouchMove = null;
    }
    if (this.boundTouchEnd) {
      document.removeEventListener('touchend', this.boundTouchEnd);
      this.boundTouchEnd = null;
    }
  }
}
