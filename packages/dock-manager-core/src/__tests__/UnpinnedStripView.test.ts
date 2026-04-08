// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnpinnedStripView } from '../dom/views/UnpinnedStripView';
import type { UnpinnedStripViewCallbacks } from '../dom/views/UnpinnedStripView';
import type { UnpinnedPanel, PanelConfig } from '../types/dock';

function makeUnpinnedPanels(ids: string[], edge: 'left' | 'right' | 'top' | 'bottom' = 'left'): UnpinnedPanel[] {
  return ids.map(id => ({ panelId: id, edge, size: 250 }));
}

function makePanels(ids: string[]): Record<string, PanelConfig> {
  return Object.fromEntries(ids.map(id => [id, { id, title: `Panel ${id}` }]));
}

function makeCallbacks(): UnpinnedStripViewCallbacks {
  return {
    onPinPanel: vi.fn(),
    onClosePanel: vi.fn(),
    onResizeUnpinned: vi.fn(),
    createContent: vi.fn(() => ({ dispose: vi.fn() })),
  };
}

/**
 * Find the flyout element among children of view.element.
 * The flyout is the second child div (after stripEl) with position:absolute style.
 */
function findFlyout(viewElement: HTMLElement): HTMLDivElement | null {
  // The flyout is appended to stripEl.parentElement which is view.element
  // It's a child of view.element that is NOT the stripEl
  const children = Array.from(viewElement.children) as HTMLElement[];
  for (const child of children) {
    if (child.style.position === 'absolute') {
      return child as HTMLDivElement;
    }
  }
  return null;
}

describe('UnpinnedStripView', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.position = 'relative';
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('creates element and strip for left edge (vertical)', () => {
      const unpinned = makeUnpinnedPanels(['p1'], 'left');
      const panels = makePanels(['p1']);
      const view = new UnpinnedStripView('left', unpinned, panels, makeCallbacks());

      expect(view.element).toBeInstanceOf(HTMLDivElement);
      expect(view.stripEl).toBeInstanceOf(HTMLDivElement);
      expect(view.element.contains(view.stripEl)).toBe(true);

      // Vertical strip should have flex-direction:column
      expect(view.stripEl.style.flexDirection).toBe('column');
    });

    it('creates strip for bottom edge (horizontal)', () => {
      const unpinned = makeUnpinnedPanels(['p1'], 'bottom');
      const panels = makePanels(['p1']);
      const view = new UnpinnedStripView('bottom', unpinned, panels, makeCallbacks());

      expect(view.stripEl.style.flexDirection).toBe('row');
    });

    it('creates strip for right edge (vertical)', () => {
      const unpinned = makeUnpinnedPanels(['p1'], 'right');
      const panels = makePanels(['p1']);
      const view = new UnpinnedStripView('right', unpinned, panels, makeCallbacks());

      expect(view.stripEl.style.flexDirection).toBe('column');
    });
  });

  describe('buildTabs', () => {
    it('creates buttons for each unpinned panel', () => {
      const unpinned = makeUnpinnedPanels(['p1', 'p2', 'p3'], 'left');
      const panels = makePanels(['p1', 'p2', 'p3']);
      const view = new UnpinnedStripView('left', unpinned, panels, makeCallbacks());

      const buttons = view.stripEl.querySelectorAll('[data-unpinned-id]');
      expect(buttons.length).toBe(3);
      expect(buttons[0].getAttribute('data-unpinned-id')).toBe('p1');
      expect(buttons[1].getAttribute('data-unpinned-id')).toBe('p2');
      expect(buttons[2].getAttribute('data-unpinned-id')).toBe('p3');
    });

    it('sets vertical writing mode for left edge tabs', () => {
      const unpinned = makeUnpinnedPanels(['p1'], 'left');
      const panels = makePanels(['p1']);
      const view = new UnpinnedStripView('left', unpinned, panels, makeCallbacks());

      const label = view.stripEl.querySelector('span');
      expect(label).not.toBeNull();
      expect(label!.style.writingMode).toBe('vertical-lr');
    });

    it('does not set vertical writing mode for bottom edge tabs', () => {
      const unpinned = makeUnpinnedPanels(['p1'], 'bottom');
      const panels = makePanels(['p1']);
      const view = new UnpinnedStripView('bottom', unpinned, panels, makeCallbacks());

      const label = view.stripEl.querySelector('span');
      expect(label).not.toBeNull();
      expect(label!.style.writingMode).not.toBe('vertical-lr');
    });

    it('skips panels not found in panels record', () => {
      const unpinned = makeUnpinnedPanels(['p1', 'p2'], 'left');
      const panels = makePanels(['p1']); // p2 missing from panels
      const view = new UnpinnedStripView('left', unpinned, panels, makeCallbacks());

      const buttons = view.stripEl.querySelectorAll('[data-unpinned-id]');
      expect(buttons.length).toBe(1);
    });
  });

  describe('update()', () => {
    it('rebuilds tabs with new panel list', () => {
      const callbacks = makeCallbacks();
      const view = new UnpinnedStripView(
        'left',
        makeUnpinnedPanels(['p1'], 'left'),
        makePanels(['p1']),
        callbacks,
      );

      expect(view.stripEl.querySelectorAll('[data-unpinned-id]').length).toBe(1);

      view.update(
        makeUnpinnedPanels(['p1', 'p2', 'p3'], 'left'),
        makePanels(['p1', 'p2', 'p3']),
      );

      expect(view.stripEl.querySelectorAll('[data-unpinned-id]').length).toBe(3);
    });

    it('closes flyout when expanded panel is removed', () => {
      const callbacks = makeCallbacks();
      const view = new UnpinnedStripView(
        'left',
        makeUnpinnedPanels(['p1', 'p2'], 'left'),
        makePanels(['p1', 'p2']),
        callbacks,
      );

      // Mount the element so flyout can be appended
      container.appendChild(view.element);

      // Open flyout by clicking on p1 tab
      const tab = view.stripEl.querySelector('[data-unpinned-id="p1"]') as HTMLElement;
      tab.click();

      // Flyout should exist
      expect(findFlyout(view.element)).not.toBeNull();

      // Update with p1 removed
      view.update(
        makeUnpinnedPanels(['p2'], 'left'),
        makePanels(['p2']),
      );

      // Flyout should be closed
      expect(findFlyout(view.element)).toBeNull();
    });
  });

  describe('dispose()', () => {
    it('removes DOM elements', () => {
      const view = new UnpinnedStripView(
        'left',
        makeUnpinnedPanels(['p1'], 'left'),
        makePanels(['p1']),
        makeCallbacks(),
      );

      container.appendChild(view.element);
      expect(container.contains(view.element)).toBe(true);

      view.dispose();

      expect(container.contains(view.element)).toBe(false);
      expect(container.contains(view.stripEl)).toBe(false);
    });
  });

  describe('flyout interactions', () => {
    it('click on tab opens flyout with header and content', () => {
      const callbacks = makeCallbacks();
      const view = new UnpinnedStripView(
        'left',
        makeUnpinnedPanels(['p1'], 'left'),
        makePanels(['p1']),
        callbacks,
      );
      container.appendChild(view.element);

      const tab = view.stripEl.querySelector('[data-unpinned-id="p1"]') as HTMLElement;
      tab.click();

      // Flyout should be appended to view.element (stripEl's parent)
      const flyout = findFlyout(view.element);
      expect(flyout).not.toBeNull();

      // Flyout should have a header with the panel title
      const titleSpan = flyout!.querySelector('span');
      expect(titleSpan).not.toBeNull();
      expect(titleSpan!.textContent).toBe('Panel p1');

      // createContent should have been called
      expect(callbacks.createContent).toHaveBeenCalledWith('p1', expect.any(HTMLElement));
    });

    it('click on same tab closes flyout (toggle)', () => {
      const callbacks = makeCallbacks();
      const view = new UnpinnedStripView(
        'left',
        makeUnpinnedPanels(['p1'], 'left'),
        makePanels(['p1']),
        callbacks,
      );
      container.appendChild(view.element);

      const tab = view.stripEl.querySelector('[data-unpinned-id="p1"]') as HTMLElement;

      // Open
      tab.click();
      expect(findFlyout(view.element)).not.toBeNull();

      // Close by clicking same tab
      tab.click();
      expect(findFlyout(view.element)).toBeNull();
    });

    it('click on different tab switches flyout', () => {
      const callbacks = makeCallbacks();
      const view = new UnpinnedStripView(
        'left',
        makeUnpinnedPanels(['p1', 'p2'], 'left'),
        makePanels(['p1', 'p2']),
        callbacks,
      );
      container.appendChild(view.element);

      const tab1 = view.stripEl.querySelector('[data-unpinned-id="p1"]') as HTMLElement;
      const tab2 = view.stripEl.querySelector('[data-unpinned-id="p2"]') as HTMLElement;

      // Open p1
      tab1.click();
      let flyout = findFlyout(view.element);
      expect(flyout).not.toBeNull();
      expect(flyout!.querySelector('span')!.textContent).toBe('Panel p1');

      // Click p2 -- should switch
      tab2.click();
      flyout = findFlyout(view.element);
      expect(flyout).not.toBeNull();
      expect(flyout!.querySelector('span')!.textContent).toBe('Panel p2');
    });

    it('pin button calls onPinPanel callback', () => {
      const callbacks = makeCallbacks();
      const view = new UnpinnedStripView(
        'left',
        makeUnpinnedPanels(['p1'], 'left'),
        makePanels(['p1']),
        callbacks,
      );
      container.appendChild(view.element);

      // Open flyout
      const tab = view.stripEl.querySelector('[data-unpinned-id="p1"]') as HTMLElement;
      tab.click();

      // Find pin button (title contains "Pin")
      const flyout = findFlyout(view.element)!;
      const buttons = flyout.querySelectorAll('button');
      const pinBtn = Array.from(buttons).find(b => b.title.includes('Pin'));
      expect(pinBtn).not.toBeUndefined();

      pinBtn!.click();
      expect(callbacks.onPinPanel).toHaveBeenCalledWith('p1');
    });

    it('close button calls onClosePanel callback', () => {
      const callbacks = makeCallbacks();
      const view = new UnpinnedStripView(
        'left',
        makeUnpinnedPanels(['p1'], 'left'),
        makePanels(['p1']),
        callbacks,
      );
      container.appendChild(view.element);

      // Open flyout
      const tab = view.stripEl.querySelector('[data-unpinned-id="p1"]') as HTMLElement;
      tab.click();

      // Find close button
      const flyout = findFlyout(view.element)!;
      const buttons = flyout.querySelectorAll('button');
      const closeBtn = Array.from(buttons).find(b => b.title.includes('Close'));
      expect(closeBtn).not.toBeUndefined();

      closeBtn!.click();
      expect(callbacks.onClosePanel).toHaveBeenCalledWith('p1');
    });

    it('createContent is called with panelId and container when flyout opens', () => {
      const callbacks = makeCallbacks();
      const view = new UnpinnedStripView(
        'left',
        makeUnpinnedPanels(['p1'], 'left'),
        makePanels(['p1']),
        callbacks,
      );
      container.appendChild(view.element);

      const tab = view.stripEl.querySelector('[data-unpinned-id="p1"]') as HTMLElement;
      tab.click();

      expect(callbacks.createContent).toHaveBeenCalledTimes(1);
      expect(callbacks.createContent).toHaveBeenCalledWith('p1', expect.any(HTMLDivElement));
    });

    it('flyout is attached to DOM BEFORE createContent is called (fixes blank-content bug)', () => {
      // Regression: previously createContent ran while the flyout was still
      // detached, so ResizeObserver-based content mounted at 0x0 and never
      // recovered until a manual resize. The fix reorders attach → create.
      const callbacks = makeCallbacks();
      let parentAtCreateTime: Node | null = null;
      (callbacks.createContent as ReturnType<typeof vi.fn>).mockImplementation(
        (_id: string, el: HTMLElement) => {
          parentAtCreateTime = el.parentNode;
          return { dispose: vi.fn() };
        },
      );

      const view = new UnpinnedStripView(
        'left',
        makeUnpinnedPanels(['p1'], 'left'),
        makePanels(['p1']),
        callbacks,
      );
      container.appendChild(view.element);

      (view.stripEl.querySelector('[data-unpinned-id="p1"]') as HTMLElement).click();

      // When createContent ran, its container's parent chain should terminate
      // at document — i.e. the flyout was already attached.
      expect(parentAtCreateTime).not.toBeNull();
      let node: Node | null = parentAtCreateTime;
      let reachedDocument = false;
      while (node) {
        if (node === document) {
          reachedDocument = true;
          break;
        }
        node = node.parentNode;
      }
      expect(reachedDocument).toBe(true);
    });

    it('switching between sibling flyouts does not leak size writes across them (multi-unpinned bug)', () => {
      // Regression: pending rAF size-nudges from a closed flyout used to
      // reference this.flyoutEl dynamically and wrote the old size onto the
      // newly-opened sibling flyout. The fix captures flyoutEl in a local
      // const + isConnected guard.
      const rafCallbacks: Array<() => void> = [];
      const originalRaf = globalThis.requestAnimationFrame;
      globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
        rafCallbacks.push(() => cb(0));
        return rafCallbacks.length;
      }) as typeof requestAnimationFrame;

      try {
        const callbacks = makeCallbacks();
        const view = new UnpinnedStripView(
          'left',
          [
            { panelId: 'p1', edge: 'left', size: 200 },
            { panelId: 'p2', edge: 'left', size: 400 },
          ],
          makePanels(['p1', 'p2']),
          callbacks,
        );
        container.appendChild(view.element);

        // Open p1, immediately switch to p2 BEFORE any rAFs have fired.
        (view.stripEl.querySelector('[data-unpinned-id="p1"]') as HTMLElement).click();
        (view.stripEl.querySelector('[data-unpinned-id="p2"]') as HTMLElement).click();

        const p2Flyout = findFlyout(view.element)!;
        expect(p2Flyout).not.toBeNull();
        // p2 was opened with size=400
        expect(p2Flyout.style.width).toBe('400px');

        // Now drain all pending rAF callbacks (including stale ones from p1).
        while (rafCallbacks.length > 0) {
          const cb = rafCallbacks.shift()!;
          cb();
        }

        // The new p2 flyout's width must NOT have been corrupted to p1's 200px.
        // It should be 400px (the pulse sets 401, then 400 — or just 400 if
        // isConnected guards kept p1's stale pulse as a no-op).
        expect(p2Flyout.style.width).not.toBe('200px');
        expect(p2Flyout.style.width).not.toBe('201px');
      } finally {
        globalThis.requestAnimationFrame = originalRaf;
      }
    });

    it('top-edge flyout has resize handle at bottom (not top)', () => {
      // Regression: top/bottom edge flyouts weren't resizable because the
      // handle was placed at top:0 for both, putting it under the header
      // chrome on the top edge. Fix: handle at bottom:0 for top edge.
      const callbacks = makeCallbacks();
      const view = new UnpinnedStripView(
        'top',
        [{ panelId: 'p1', edge: 'top', size: 200 }],
        makePanels(['p1']),
        callbacks,
      );
      container.appendChild(view.element);

      (view.stripEl.querySelector('[data-unpinned-id="p1"]') as HTMLElement).click();
      const flyout = findFlyout(view.element)!;
      const handle = flyout.querySelector('.dock-flyout-resize') as HTMLElement;
      expect(handle).not.toBeNull();
      expect(handle.style.bottom).toBe('0px');
      expect(handle.style.top).toBe('');
      expect(handle.style.cursor).toBe('row-resize');
    });

    it('bottom-edge flyout has resize handle at top', () => {
      const callbacks = makeCallbacks();
      const view = new UnpinnedStripView(
        'bottom',
        [{ panelId: 'p1', edge: 'bottom', size: 200 }],
        makePanels(['p1']),
        callbacks,
      );
      container.appendChild(view.element);

      (view.stripEl.querySelector('[data-unpinned-id="p1"]') as HTMLElement).click();
      const flyout = findFlyout(view.element)!;
      const handle = flyout.querySelector('.dock-flyout-resize') as HTMLElement;
      expect(handle).not.toBeNull();
      expect(handle.style.top).toBe('0px');
      expect(handle.style.bottom).toBe('');
      expect(handle.style.cursor).toBe('row-resize');
    });

    it('content disposable is called when flyout closes', () => {
      const disposeFn = vi.fn();
      const callbacks = makeCallbacks();
      (callbacks.createContent as ReturnType<typeof vi.fn>).mockReturnValue({ dispose: disposeFn });

      const view = new UnpinnedStripView(
        'left',
        makeUnpinnedPanels(['p1'], 'left'),
        makePanels(['p1']),
        callbacks,
      );
      container.appendChild(view.element);

      // Open flyout
      const tab = view.stripEl.querySelector('[data-unpinned-id="p1"]') as HTMLElement;
      tab.click();
      expect(disposeFn).not.toHaveBeenCalled();

      // Close flyout
      tab.click();
      expect(disposeFn).toHaveBeenCalledTimes(1);
    });
  });
});
