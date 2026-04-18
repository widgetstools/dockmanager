export interface IDisposable {
  dispose(): void;
}

export class CompositeDisposable implements IDisposable {
  private readonly _disposables = new Set<IDisposable>();
  private _disposed = false;

  constructor(...items: IDisposable[]) {
    for (const d of items) this._disposables.add(d);
  }

  get isDisposed(): boolean { return this._disposed; }

  add(...items: IDisposable[]): void {
    if (this._disposed) {
      for (const d of items) { try { d.dispose(); } catch (err) { console.error('[CompositeDisposable] post-dispose add threw', err); } }
      return;
    }
    for (const d of items) this._disposables.add(d);
  }

  remove(item: IDisposable): void { this._disposables.delete(item); }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    const items = Array.from(this._disposables).reverse();
    this._disposables.clear();
    for (const d of items) { try { d.dispose(); } catch (err) { console.error('[CompositeDisposable] dispose threw', err); } }
  }
}

export class MutableDisposable implements IDisposable {
  private _value: IDisposable | null = null;
  private _disposed = false;

  get value(): IDisposable | null { return this._value; }

  set value(next: IDisposable | null) {
    if (this._disposed) { next?.dispose(); return; }
    if (this._value === next) return;
    if (this._value) { try { this._value.dispose(); } catch (err) { console.error('[MutableDisposable] previous value dispose threw', err); } }
    this._value = next;
  }

  clear(): void { this.value = null; }

  dispose(): void {
    if (this._disposed) return;
    this.clear();
    this._disposed = true;
  }
}

export function toDisposable(fn: () => void): IDisposable {
  let disposed = false;
  return { dispose() { if (disposed) return; disposed = true; fn(); } };
}

export function listenEvent<K extends keyof HTMLElementEventMap>(
  target: EventTarget, type: K, handler: (ev: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions | boolean,
): IDisposable;
export function listenEvent(
  target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions | boolean,
): IDisposable;
export function listenEvent(
  target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions | boolean,
): IDisposable {
  target.addEventListener(type, handler, options);
  return toDisposable(() => target.removeEventListener(type, handler, options));
}
