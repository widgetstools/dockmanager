import { CompositeDisposable, MutableDisposable, toDisposable, type IDisposable } from '../utils/lifecycle';
import { debugLog } from '../utils/debug';

export type CreatePanelContent = (panelId: string, container: HTMLElement) => IDisposable;

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
    placeholder.appendChild(entry.container);
    entry.container.style.display = '';
    debugLog('RENDER_CONTAINER', `bind panel=${panelId} gen=${myGen}`);
    return toDisposable(() => {
      if (entry.generation !== myGen) {
        debugLog('RENDER_CONTAINER', `unbind panel=${panelId} gen=${myGen} STALE (current=${entry.generation})`);
        return;
      }
      entry.container.style.display = 'none';
      this.element.appendChild(entry.container);
      debugLog('RENDER_CONTAINER', `unbind panel=${panelId} gen=${myGen}`);
    });
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
