/**
 * Minimal typed event emitter for dock manager events.
 */
export type Listener<T> = (value: T) => void;

export class EventEmitter<T = void> {
  private listeners: Set<Listener<T>> = new Set();

  on(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: T): void {
    this.listeners.forEach((fn) => fn(value));
  }

  dispose(): void {
    this.listeners.clear();
  }
}
