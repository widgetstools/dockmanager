// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  CompositeDisposable,
  MutableDisposable,
  toDisposable,
  listenEvent,
} from '../utils/lifecycle';

describe('CompositeDisposable', () => {
  it('disposes all children in reverse-add order', () => {
    const order: number[] = [];
    const c = new CompositeDisposable();
    c.add(toDisposable(() => order.push(1)));
    c.add(toDisposable(() => order.push(2)));
    c.add(toDisposable(() => order.push(3)));
    c.dispose();
    expect(order).toEqual([3, 2, 1]);
  });

  it('is idempotent', () => {
    const fn = vi.fn();
    const c = new CompositeDisposable(toDisposable(fn));
    c.dispose();
    c.dispose();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('disposes immediately when adding after dispose', () => {
    const c = new CompositeDisposable();
    c.dispose();
    const fn = vi.fn();
    c.add(toDisposable(fn));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('swallows dispose errors and continues', () => {
    const fn = vi.fn();
    const c = new CompositeDisposable(
      toDisposable(() => {
        throw new Error('boom');
      }),
      toDisposable(fn),
    );
    expect(() => c.dispose()).not.toThrow();
    expect(fn).toHaveBeenCalled();
  });

  it('remove() detaches without disposing', () => {
    const fn = vi.fn();
    const d = toDisposable(fn);
    const c = new CompositeDisposable(d);
    c.remove(d);
    c.dispose();
    expect(fn).not.toHaveBeenCalled();
  });

  it('reports isDisposed', () => {
    const c = new CompositeDisposable();
    expect(c.isDisposed).toBe(false);
    c.dispose();
    expect(c.isDisposed).toBe(true);
  });
});

describe('MutableDisposable', () => {
  it('disposes the previous value when assigning a new one', () => {
    const m = new MutableDisposable();
    const a = vi.fn();
    const b = vi.fn();
    m.value = toDisposable(a);
    m.value = toDisposable(b);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    m.dispose();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('clear() disposes the current value', () => {
    const m = new MutableDisposable();
    const fn = vi.fn();
    m.value = toDisposable(fn);
    m.clear();
    expect(fn).toHaveBeenCalled();
    expect(m.value).toBeNull();
  });

  it('disposes assignments made after dispose() immediately', () => {
    const m = new MutableDisposable();
    m.dispose();
    const fn = vi.fn();
    m.value = toDisposable(fn);
    expect(fn).toHaveBeenCalled();
  });
});

describe('listenEvent', () => {
  it('adds and removes a DOM listener via dispose', () => {
    const el = document.createElement('div');
    const fn = vi.fn();
    const d = listenEvent(el, 'click', fn);
    el.dispatchEvent(new Event('click'));
    expect(fn).toHaveBeenCalledTimes(1);
    d.dispose();
    el.dispatchEvent(new Event('click'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
