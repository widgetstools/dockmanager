import { CompositeDisposable, MutableDisposable, toDisposable, type IDisposable } from '../utils/lifecycle';
import { debugLog } from '../utils/debug';

/**
 * Factory invoked once per panel when its persistent container is first
 * created. Returns the host disposable that tears down the user's content
 * (e.g. a React root, an Angular component instance).
 */
export type CreatePanelContent = (panelId: string, container: HTMLElement) => IDisposable;

/**
 * RenderContainerManager — persistent panel containers with safe limbo.
 *
 * Each panel has exactly ONE content container. The container is created
 * once and from then on it is ALWAYS attached to the document (either
 * inside an active view's placeholder, or inside the hidden render-root
 * limbo). The container's identity never changes, so React portals,
 * Angular component refs, and other framework-bound state stay valid for
 * the panel's entire lifetime — across tab switches, float/dock, maximize,
 * and unpin/pin transitions.
 *
 * What this fixes vs the old cache+reparent flow:
 *  - React portal unmounts caused by an isConnected check while a cached
 *    container was momentarily detached
 *  - ResizeObserver mount races (the container is always laid out)
 *  - The generation counter that existed only to no-op stale dispose calls
 *
 * Why we reparent (and don't position absolutely in a fixed render root):
 *  - Each view has its own stacking context (flyouts, floating windows,
 *    maximize overlay all use z-index). A single absolute render root
 *    can't be at the right z-layer for every view simultaneously.
 *    Reparenting puts the container inside the right stacking context for
 *    free.
 *
 * Lifecycle:
 *  - bindPlaceholder(panelId, ph): the persistent container is appended
 *    INSIDE `ph`, its display is restored, and a disposable is returned.
 *  - The returned disposable moves the container back to limbo and hides
 *    it. The container is never detached during the move.
 *  - destroyContainer(panelId): runs the user content disposable and
 *    removes the container from the DOM. Call when the panel is closed.
 */
export class RenderContainerManager implements IDisposable {
  /** Hidden host that owns containers when they are not bound to a view. */
  readonly element: HTMLDivElement;

  private readonly host: HTMLElement;
  private readonly create: CreatePanelContent;

  private readonly entries = new Map<string, ContainerEntry>();

  private readonly disposables = new CompositeDisposable();
  private _disposed = false;

  constructor(host: HTMLElement, create: CreatePanelContent) {
    this.host = host;
    this.create = create;

    this.element = document.createElement('div');
    this.element.className = 'dock-render-root';
    // Off-screen, zero-size, non-interactive limbo. Containers parked here
    // remain in the document (so React portals stay mounted) but are not
    // visible or interactive.
    this.element.style.cssText =
      'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;pointer-events:none;visibility:hidden;';
    this.host.appendChild(this.element);
  }

  /**
   * Move the persistent container into the placeholder and make it
   * visible. Creates the container on first call. Returns a disposable
   * that moves the container back to limbo without destroying it.
   */
  bindPlaceholder(panelId: string, placeholder: HTMLElement): IDisposable {
    const entry = this.getOrCreate(panelId);

    // Bump generation so any prior bind's disposable becomes a no-op.
    entry.generation++;
    const myGen = entry.generation;

    // Atomic reparent. appendChild moves the node — at no point is
    // entry.container.parentElement null, so React portals do not see a
    // detach event.
    placeholder.appendChild(entry.container);
    entry.container.style.display = '';

    debugLog('RENDER_CONTAINER', `bind panel=${panelId} gen=${myGen}`);

    return toDisposable(() => {
      // If a newer bind has already taken over, this dispose is stale.
      if (entry.generation !== myGen) {
        debugLog('RENDER_CONTAINER', `unbind panel=${panelId} gen=${myGen} STALE (current=${entry.generation})`);
        return;
      }
      // Move back to limbo so the container stays attached.
      entry.container.style.display = 'none';
      this.element.appendChild(entry.container);
      debugLog('RENDER_CONTAINER', `unbind panel=${panelId} gen=${myGen}`);
    });
  }

  /**
   * Permanently destroy a panel's container. Disposes the user content
   * and removes the element. Call when the panel is closed.
   */
  destroyContainer(panelId: string): void {
    const entry = this.entries.get(panelId);
    if (!entry) return;
    debugLog('RENDER_CONTAINER', `destroyContainer panel=${panelId}`);
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

  /** Test/debug accessor — do not mutate the returned element. */
  getContainer(panelId: string): HTMLElement | undefined {
    return this.entries.get(panelId)?.container;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
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
    // Container fills its current parent (placeholder or limbo).
    container.style.cssText = 'width:100%;height:100%;overflow:hidden;display:none;';
    // Park in limbo until the first bind.
    this.element.appendChild(container);

    const contentSlot = new MutableDisposable();
    try {
      contentSlot.value = this.create(panelId, container);
    } catch (err) {
      // Surface the error but keep the container so future binds don't
      // re-throw the same error in a tighter loop.
      // eslint-disable-next-line no-console
      console.error('[RenderContainerManager] createContent threw for', panelId, err);
    }

    entry = { container, contentSlot, generation: 0 };
    this.entries.set(panelId, entry);
    debugLog('RENDER_CONTAINER', `created panel=${panelId}`);
    return entry;
  }
}

interface ContainerEntry {
  container: HTMLDivElement;
  contentSlot: MutableDisposable;
  generation: number;
}
