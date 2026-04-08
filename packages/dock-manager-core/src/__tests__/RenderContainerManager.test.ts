// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RenderContainerManager } from '../dom/RenderContainerManager';
import { toDisposable } from '../utils/lifecycle';

// jsdom does not implement ResizeObserver — provide a no-op shim. The
// manager's behavior under tests is verified via explicit syncAll/syncPanel
// calls and the bind/destroy lifecycle, not via observer firings.
class NoopRO {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
// @ts-expect-error — install shim
globalThis.ResizeObserver = NoopRO;

function makeHost(): HTMLElement {
  const host = document.createElement('div');
  // jsdom getBoundingClientRect returns zeros, which is fine for these tests.
  document.body.appendChild(host);
  return host;
}

describe('RenderContainerManager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('creates the render root as a child of host', () => {
    const host = makeHost();
    const m = new RenderContainerManager(host, () => toDisposable(() => {}));
    expect(m.element.parentElement).toBe(host);
    expect(m.element.classList.contains('dock-render-root')).toBe(true);
    m.dispose();
  });

  it('creates exactly one container per panel and reuses it on rebind', () => {
    const host = makeHost();
    const create = vi.fn().mockImplementation(() => toDisposable(() => {}));
    const m = new RenderContainerManager(host, create);

    const ph1 = document.createElement('div');
    host.appendChild(ph1);
    const d1 = m.bindPlaceholder('p1', ph1);
    const c = m.getContainer('p1');
    expect(c).toBeDefined();
    expect(create).toHaveBeenCalledTimes(1);

    d1.dispose();

    const ph2 = document.createElement('div');
    host.appendChild(ph2);
    m.bindPlaceholder('p1', ph2);
    expect(m.getContainer('p1')).toBe(c); // same identity
    expect(create).toHaveBeenCalledTimes(1); // not recreated
    m.dispose();
  });

  it('hides container on unbind, shows on rebind', () => {
    const host = makeHost();
    const m = new RenderContainerManager(host, () => toDisposable(() => {}));
    const ph = document.createElement('div');
    host.appendChild(ph);

    const d = m.bindPlaceholder('p1', ph);
    expect(m.getContainer('p1')!.style.display).toBe('');

    d.dispose();
    expect(m.getContainer('p1')!.style.display).toBe('none');

    m.bindPlaceholder('p1', ph);
    expect(m.getContainer('p1')!.style.display).toBe('');
    m.dispose();
  });

  it('container is never reparented across binds', () => {
    const host = makeHost();
    const m = new RenderContainerManager(host, () => toDisposable(() => {}));
    const ph1 = document.createElement('div');
    const ph2 = document.createElement('div');
    host.append(ph1, ph2);

    m.bindPlaceholder('p1', ph1);
    const c = m.getContainer('p1')!;
    const parentBefore = c.parentElement;

    m.bindPlaceholder('p1', ph2);
    expect(c.parentElement).toBe(parentBefore);
    expect(c.parentElement).toBe(m.element);
    m.dispose();
  });

  it('rebinding while still bound switches the active placeholder without recreating content', () => {
    const host = makeHost();
    const create = vi.fn().mockImplementation(() => toDisposable(() => {}));
    const m = new RenderContainerManager(host, create);
    const ph1 = document.createElement('div');
    const ph2 = document.createElement('div');
    host.append(ph1, ph2);

    m.bindPlaceholder('p1', ph1);
    m.bindPlaceholder('p1', ph2); // direct rebind, no dispose

    expect(create).toHaveBeenCalledTimes(1);
    expect(m.getContainer('p1')!.style.display).toBe('');
    m.dispose();
  });

  it('disposing an old binding after a newer rebind is a no-op', () => {
    const host = makeHost();
    const m = new RenderContainerManager(host, () => toDisposable(() => {}));
    const ph1 = document.createElement('div');
    const ph2 = document.createElement('div');
    host.append(ph1, ph2);

    const d1 = m.bindPlaceholder('p1', ph1);
    m.bindPlaceholder('p1', ph2);

    d1.dispose(); // stale — must NOT hide the container
    expect(m.getContainer('p1')!.style.display).toBe('');
    m.dispose();
  });

  it('destroyContainer disposes content and removes the element', () => {
    const host = makeHost();
    const dispose = vi.fn();
    const m = new RenderContainerManager(host, () => toDisposable(dispose));
    const ph = document.createElement('div');
    host.appendChild(ph);

    m.bindPlaceholder('p1', ph);
    const c = m.getContainer('p1')!;
    m.destroyContainer('p1');

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(c.parentElement).toBeNull();
    expect(m.hasContainer('p1')).toBe(false);
    m.dispose();
  });

  it('dispose tears down all containers and removes the render root', () => {
    const host = makeHost();
    const disposeA = vi.fn();
    const disposeB = vi.fn();
    let i = 0;
    const m = new RenderContainerManager(host, () =>
      toDisposable(i++ === 0 ? disposeA : disposeB),
    );
    const ph1 = document.createElement('div');
    const ph2 = document.createElement('div');
    host.append(ph1, ph2);
    m.bindPlaceholder('a', ph1);
    m.bindPlaceholder('b', ph2);

    m.dispose();
    expect(disposeA).toHaveBeenCalled();
    expect(disposeB).toHaveBeenCalled();
    expect(m.element.parentElement).toBeNull();
  });

  it('syncPanel and syncAll are safe to call before any bind', () => {
    const host = makeHost();
    const m = new RenderContainerManager(host, () => toDisposable(() => {}));
    expect(() => m.syncPanel('nope')).not.toThrow();
    expect(() => m.syncAll()).not.toThrow();
    m.dispose();
  });

  it('mirror sets transform/width/height on the container', () => {
    const host = makeHost();
    const m = new RenderContainerManager(host, () => toDisposable(() => {}));
    const ph = document.createElement('div');
    // Stub getBoundingClientRect for placeholder + host so mirror has nonzero values.
    ph.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 300, height: 200, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => '' }) as DOMRect;
    host.getBoundingClientRect = () =>
      ({ left: 10, top: 5, width: 1000, height: 800, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => '' }) as DOMRect;
    host.appendChild(ph);

    m.bindPlaceholder('p1', ph);
    m.syncAll();

    const c = m.getContainer('p1')!;
    expect(c.style.transform).toBe('translate(90px, 45px)');
    expect(c.style.width).toBe('300px');
    expect(c.style.height).toBe('200px');
    m.dispose();
  });
});
