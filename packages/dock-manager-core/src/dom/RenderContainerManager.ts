import { CompositeDisposable, MutableDisposable, toDisposable, type IDisposable } from '../utils/lifecycle';
import { debugLog } from '../utils/debug';

/**
 * Factory invoked once per panel when its persistent container is first
 * created. Returns the host disposable that tears down the user's content
 * (e.g. a React root, an Angular component instance).
 */
export type CreatePanelContent = (panelId: string, container: HTMLElement) => IDisposable;

/**
 * RenderContainerManager — "stable render containers".
 *
 * Every panel has exactly ONE content container that lives as a child of
 * a single hidden render-root for its entire lifetime. Containers are
 * NEVER reparented. Views render `<div>` placeholders where the panel
 * should appear; this manager mirrors each placeholder's bounding rect
 * onto its container's `top/left/width/height`.
 *
 * Why: reparenting cached content has caused multiple bugs (React portal
 * unmounts, ResizeObserver mount races, generation-counter complexity).
 * Stable containers eliminate the entire bug class.
 *
 * Pointer events: the render root is `pointer-events:none`; containers
 * opt back in via `pointer-events:auto`. Chrome (tab strips, headers,
 * splitters) lives in the layout DOM under the root and remains
 * hit-testable so long as containers don't visually overlap chrome —
 * which they won't, since their rects exactly match a placeholder rect.
 */
export class RenderContainerManager implements IDisposable {
  /** The hidden host element that owns all panel containers. */
  readonly element: HTMLDivElement;

  private readonly host: HTMLElement;
  private readonly create: CreatePanelContent;

  private readonly entries = new Map<string, ContainerEntry>();
  private hostRect: DOMRect;

  // Single shared ResizeObserver for all placeholders + the host element.
  // Whenever any placeholder or the host resizes, we re-mirror.
  private readonly resizeObserver: ResizeObserver;
  // Reverse map: placeholder element → panelId, so the RO callback can
  // resolve which entries to update.
  private readonly placeholderToPanel = new WeakMap<Element, string>();

  // One scroll listener on host (capturing) so chrome scrolling re-mirrors.
  private readonly disposables = new CompositeDisposable();

  private _disposed = false;

  constructor(host: HTMLElement, create: CreatePanelContent) {
    this.host = host;
    this.create = create;

    this.element = document.createElement('div');
    this.element.className = 'dock-render-root';
    this.element.style.cssText =
      'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    this.host.appendChild(this.element);

    this.hostRect = this.host.getBoundingClientRect();

    this.resizeObserver = new ResizeObserver((entries) => {
      // Host resized → every container's rect needs re-mirroring.
      for (const e of entries) {
        if (e.target === this.host) {
          this.hostRect = this.host.getBoundingClientRect();
          this.remirrorAll();
          return;
        }
      }
      // Otherwise: only mirror the placeholders that changed.
      for (const e of entries) {
        const panelId = this.placeholderToPanel.get(e.target);
        if (panelId) this.mirror(panelId);
      }
    });
    this.resizeObserver.observe(this.host);

    // Capture-phase scroll: any scroll inside host (e.g. tab strip overflow,
    // a content area) can shift placeholder positions without triggering RO.
    const onScroll = () => this.remirrorAll();
    this.host.addEventListener('scroll', onScroll, true);
    this.disposables.add(toDisposable(() => this.host.removeEventListener('scroll', onScroll, true)));
  }

  /**
   * Bind a placeholder element to a panel. Creates the persistent
   * container on first call, makes it visible, mirrors the placeholder
   * rect. Returns a disposable that hides the container (does NOT
   * destroy it). Call destroyContainer() when the panel is permanently
   * closed.
   */
  bindPlaceholder(panelId: string, placeholder: HTMLElement): IDisposable {
    const entry = this.getOrCreate(panelId);

    // If a previous placeholder is still bound, unbind it first. The
    // most common case is the same view re-rendering and passing a new
    // placeholder element for the same panel.
    if (entry.placeholder && entry.placeholder !== placeholder) {
      this.placeholderToPanel.delete(entry.placeholder);
      this.resizeObserver.unobserve(entry.placeholder);
    }

    entry.placeholder = placeholder;
    this.placeholderToPanel.set(placeholder, panelId);
    this.resizeObserver.observe(placeholder);

    entry.container.style.display = '';
    this.mirror(panelId);

    return toDisposable(() => {
      // Only clear if we are still the bound placeholder for this panel.
      // If a newer bind() reused the entry, leave it alone.
      if (entry.placeholder === placeholder) {
        this.placeholderToPanel.delete(placeholder);
        this.resizeObserver.unobserve(placeholder);
        entry.placeholder = null;
        entry.container.style.display = 'none';
      }
    });
  }

  /**
   * Imperative re-mirror — called by views immediately after they have
   * laid out their chrome (e.g. floating window drag). Avoids the
   * one-frame lag of waiting for ResizeObserver.
   */
  syncPanel(panelId: string): void {
    if (this.entries.has(panelId)) this.mirror(panelId);
  }

  /** Re-mirror every visible container. */
  syncAll(): void {
    this.remirrorAll();
  }

  /**
   * Permanently destroy a panel's container. Disposes the user content
   * and removes the element. Call when the panel is closed.
   */
  destroyContainer(panelId: string): void {
    const entry = this.entries.get(panelId);
    if (!entry) return;
    debugLog('RENDER_CONTAINER', `destroyContainer panel=${panelId}`);
    if (entry.placeholder) {
      this.placeholderToPanel.delete(entry.placeholder);
      this.resizeObserver.unobserve(entry.placeholder);
    }
    entry.contentSlot.dispose();
    entry.container.remove();
    this.entries.delete(panelId);
  }

  /** True if a container exists for this panel. */
  hasContainer(panelId: string): boolean {
    return this.entries.has(panelId);
  }

  /** Iterate panel ids that currently have a container. */
  panelIds(): IterableIterator<string> {
    return this.entries.keys();
  }

  /** Test/debug accessor — do not use to mutate. */
  getContainer(panelId: string): HTMLElement | undefined {
    return this.entries.get(panelId)?.container;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.resizeObserver.disconnect();
    this.disposables.dispose();
    for (const panelId of Array.from(this.entries.keys())) {
      this.destroyContainer(panelId);
    }
    this.element.remove();
  }

  // ── internals ─────────────────────────────────────────────────────

  private getOrCreate(panelId: string): ContainerEntry {
    let entry = this.entries.get(panelId);
    if (entry) return entry;

    const container = document.createElement('div');
    container.setAttribute('data-panel-container-id', panelId);
    container.className = 'dock-panel-render-container';
    container.style.cssText =
      'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;pointer-events:auto;display:none;';
    this.element.appendChild(container);

    const contentSlot = new MutableDisposable();
    try {
      contentSlot.value = this.create(panelId, container);
    } catch (err) {
      // Surface the error but keep the container so future bind calls don't
      // re-throw the same error in a tighter loop.
      // eslint-disable-next-line no-console
      console.error('[RenderContainerManager] createContent threw for', panelId, err);
    }

    entry = { container, contentSlot, placeholder: null };
    this.entries.set(panelId, entry);
    debugLog('RENDER_CONTAINER', `created panel=${panelId}`);
    return entry;
  }

  private mirror(panelId: string): void {
    const entry = this.entries.get(panelId);
    if (!entry || !entry.placeholder) return;
    const r = entry.placeholder.getBoundingClientRect();
    // Coordinates are relative to the host element so the render root
    // (which is `inset:0` inside host) shares the same coordinate space.
    const left = r.left - this.hostRect.left;
    const top = r.top - this.hostRect.top;
    const s = entry.container.style;
    s.transform = `translate(${left}px, ${top}px)`;
    s.left = '0px';
    s.top = '0px';
    s.width = `${r.width}px`;
    s.height = `${r.height}px`;
  }

  private remirrorAll(): void {
    this.hostRect = this.host.getBoundingClientRect();
    for (const panelId of this.entries.keys()) {
      this.mirror(panelId);
    }
  }
}

interface ContainerEntry {
  container: HTMLDivElement;
  contentSlot: MutableDisposable;
  placeholder: HTMLElement | null;
}
