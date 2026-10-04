import { CompositeDisposable, MutableDisposable, toDisposable, type IDisposable } from '../utils/lifecycle';
import { debugLog } from '../utils/debug';

export type CreatePanelContent = (panelId: string, container: HTMLElement) => IDisposable;

type MovableParent = Element & { moveBefore?(node: Node, child: Node | null): void };

/** How long a bind waits for its placeholder to join the document before moving anyway. */
const MAX_PLACE_FRAMES = 30;

/**
 * Moves `child` to the end of `parent`, keeping its state where the browser can: with
 * `moveBefore` (Chrome/Edge 133+, Firefox 144+), an iframe inside keeps its page, and media,
 * focus and animations go on; `appendChild` would reload the iframe. Elsewhere (Safari, or a move
 * between documents, as into a popout window), it falls back to `appendChild`.
 */
export function moveInto(parent: Element, child: Element): void {
  if (child.parentNode === parent && parent.lastChild === child) return;
  const p = parent as MovableParent;
  if (typeof p.moveBefore === 'function' && parent.isConnected && child.isConnected && parent.ownerDocument === child.ownerDocument) {
    try {
      p.moveBefore(child, null);
      return;
    } catch {
      // A move the browser refuses (a hierarchy it does not allow): the plain way.
    }
  }
  parent.appendChild(child);
}

export class RenderContainerManager implements IDisposable {
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
    this.element.style.cssText =
      'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;pointer-events:none;visibility:hidden;';
    this.host.appendChild(this.element);
  }

  bindPlaceholder(panelId: string, placeholder: HTMLElement): IDisposable {
    const entry = this.getOrCreate(panelId);
    entry.generation++;
    const myGen = entry.generation;
    this.place(entry, placeholder, myGen);
    debugLog('RENDER_CONTAINER', `bind panel=${panelId} gen=${myGen}`);
    return toDisposable(() => {
      if (entry.generation !== myGen) {
        debugLog('RENDER_CONTAINER', `unbind panel=${panelId} gen=${myGen} STALE (current=${entry.generation})`);
        return;
      }
      entry.container.style.display = 'none';
      moveInto(this.element, entry.container);
      debugLog('RENDER_CONTAINER', `unbind panel=${panelId} gen=${myGen}`);
    });
  }

  /**
   * Moves the container into its placeholder. A placeholder not yet in the document (a floating
   * window or a maximize overlay builds its content before it is attached) is waited for, a frame
   * at a time: content moved into a detached element is unloaded, and an iframe in it would
   * reload. Meanwhile the content stays where it was. A later bind supersedes the wait.
   */
  private place(entry: ContainerEntry, placeholder: HTMLElement, gen: number, frames = 0): void {
    if (entry.generation !== gen || this._disposed) return;
    if (!placeholder.isConnected && this.element.isConnected && frames < MAX_PLACE_FRAMES && typeof requestAnimationFrame === 'function') {
      // Wait in limbo, not in a view that may be removed meanwhile (a floating window docking back).
      if (frames === 0 && entry.container.parentNode !== this.element) moveInto(this.element, entry.container);
      requestAnimationFrame(() => this.place(entry, placeholder, gen, frames + 1));
      return;
    }
    moveInto(placeholder, entry.container);
    entry.container.style.display = '';
  }

  destroyContainer(panelId: string): void {
    const entry = this.entries.get(panelId);
    if (!entry) return;
    debugLog('RENDER_CONTAINER', `destroyContainer panel=${panelId}`);
    entry.contentSlot.dispose();
    entry.container.remove();
    this.entries.delete(panelId);
  }

  hasContainer(panelId: string): boolean { return this.entries.has(panelId); }
  panelIds(): IterableIterator<string> { return this.entries.keys(); }
  getContainer(panelId: string): HTMLElement | undefined { return this.entries.get(panelId)?.container; }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.disposables.dispose();
    for (const panelId of Array.from(this.entries.keys())) this.destroyContainer(panelId);
    this.element.remove();
  }

  private getOrCreate(panelId: string): ContainerEntry {
    let entry = this.entries.get(panelId);
    if (entry) return entry;
    const container = document.createElement('div');
    container.setAttribute('data-panel-container-id', panelId);
    container.className = 'dock-panel-render-container';
    container.style.cssText = 'width:100%;height:100%;overflow:hidden;display:none;';
    this.element.appendChild(container);
    const contentSlot = new MutableDisposable();
    try { contentSlot.value = this.create(panelId, container); }
    catch (err) { console.error('[RenderContainerManager] createContent threw for', panelId, err); }
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
