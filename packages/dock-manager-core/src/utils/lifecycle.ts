/**
 * Lifecycle utilities — disposable composition.
 *
 * Modeled on dockview's `CompositeDisposable` and `MutableDisposable`.
 * The aim is to give views and managers a single, reusable bag for cleanup
 * so we stop tracking timers, listeners, observers, and child views in
 * ad-hoc fields.
 */

export interface IDisposable {
  dispose(): void;
}

/**
 * A bag of disposables that disposes them all in reverse-add order.
 *
 * Pattern:
 *   class MyView {
 *     private readonly disposables = new CompositeDisposable();
 *
 *     constructor() {
 *       this.disposables.add(
 *         addEventListener(el, 'click', this.onClick),
 *         resizeObserver(el, this.onResize),
 *       );
 *     }
 *
 *     dispose() { this.disposables.dispose(); }
 *   }
 *
 * Disposables added after `dispose()` is called are disposed immediately.
 */
export class CompositeDisposable implements IDisposable {
  private readonly _disposables = new Set<IDisposable>();
  private _disposed = false;

  constructor(...items: IDisposable[]) {
    for (const d of items) this._disposables.add(d);
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  add(...items: IDisposable[]): void {
    if (this._disposed) {
      for (const d of items) {
        try {
          d.dispose();
        } catch {
          /* swallow — caller is already tearing down */
        }
      }
      return;
    }
    for (const d of items) this._disposables.add(d);
  }

  /** Remove a disposable from the bag without disposing it. */
  remove(item: IDisposable): void {
    this._disposables.delete(item);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    // Dispose in reverse-add order so that things added later (which often
    // depend on earlier resources) tear down first.
    const items = Array.from(this._disposables).reverse();
    this._disposables.clear();
    for (const d of items) {
      try {
        d.dispose();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[CompositeDisposable] dispose threw', err);
      }
    }
  }
}

/**
 * A slot that holds at most one disposable. Replacing the value disposes
 * the previous one. Useful for "current resize handler", "current rAF
 * subscription", etc.
 */
export class MutableDisposable implements IDisposable {
  private _value: IDisposable | null = null;
  private _disposed = false;

  get value(): IDisposable | null {
    return this._value;
  }

  set value(next: IDisposable | null) {
    if (this._disposed) {
      next?.dispose();
      return;
    }
    if (this._value === next) return;
    if (this._value) {
      try {
        this._value.dispose();
      } catch {
        /* swallow */
      }
    }
    this._value = next;
  }

  clear(): void {
    this.value = null;
  }

  dispose(): void {
    if (this._disposed) return;
    this.clear();
    this._disposed = true;
  }
}

/** Wrap a teardown function as an IDisposable. */
export function toDisposable(fn: () => void): IDisposable {
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      fn();
    },
  };
}

/**
 * Add a DOM event listener and return a disposable that removes it.
 * Lets views write `this.disposables.add(listenEvent(el, 'click', fn))`
 * instead of tracking and removing handlers manually.
 */
export function listenEvent<K extends keyof HTMLElementEventMap>(
  target: EventTarget,
  type: K,
  handler: (ev: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions | boolean,
): IDisposable;
export function listenEvent(
  target: EventTarget,
  type: string,
  handler: EventListener,
  options?: AddEventListenerOptions | boolean,
): IDisposable;
export function listenEvent(
  target: EventTarget,
  type: string,
  handler: EventListener,
  options?: AddEventListenerOptions | boolean,
): IDisposable {
  target.addEventListener(type, handler, options);
  return toDisposable(() => target.removeEventListener(type, handler, options));
}
