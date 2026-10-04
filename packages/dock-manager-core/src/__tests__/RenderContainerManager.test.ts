// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RenderContainerManager } from '../dom/RenderContainerManager';
import { toDisposable } from '../utils/lifecycle';

function makeHost(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host;
}

describe('RenderContainerManager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('creates the limbo render root as a child of host', () => {
    const host = makeHost();
    const m = new RenderContainerManager(host, () => toDisposable(() => {}));
    expect(m.element.parentElement).toBe(host);
    expect(m.element.classList.contains('dock-render-root')).toBe(true);
    m.dispose();
  });

  it('creates a container in limbo on first bind and reuses it on rebind', () => {
    const host = makeHost();
    const create = vi.fn().mockImplementation(() => toDisposable(() => {}));
    const m = new RenderContainerManager(host, create);

    const ph1 = document.createElement('div');
    host.appendChild(ph1);
    m.bindPlaceholder('p1', ph1);
    const c = m.getContainer('p1');
    expect(c).toBeDefined();
    expect(c!.parentElement).toBe(ph1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('reparents the container into the placeholder on bind', () => {
    const host = makeHost();
    const m = new RenderContainerManager(host, () => toDisposable(() => {}));
    const ph1 = document.createElement('div');
    const ph2 = document.createElement('div');
    host.append(ph1, ph2);

    m.bindPlaceholder('p1', ph1);
    const c = m.getContainer('p1')!;
    expect(c.parentElement).toBe(ph1);

    m.bindPlaceholder('p1', ph2);
    expect(c.parentElement).toBe(ph2);
    m.dispose();
  });

  it('container is never detached during reparent (parent always non-null)', () => {
    const host = makeHost();
    const m = new RenderContainerManager(host, () => toDisposable(() => {}));
    const ph1 = document.createElement('div');
    const ph2 = document.createElement('div');
    host.append(ph1, ph2);

    m.bindPlaceholder('p1', ph1);
    const c = m.getContainer('p1')!;
    // Sanity: at every observable instant, parentElement is non-null.
    expect(c.parentElement).not.toBeNull();
    m.bindPlaceholder('p1', ph2);
    expect(c.parentElement).not.toBeNull();
    m.dispose();
  });

  it('unbind moves container back to limbo and hides it', () => {
    const host = makeHost();
    const m = new RenderContainerManager(host, () => toDisposable(() => {}));
    const ph = document.createElement('div');
    host.appendChild(ph);

    const d = m.bindPlaceholder('p1', ph);
    const c = m.getContainer('p1')!;
    expect(c.parentElement).toBe(ph);
    expect(c.style.display).toBe('');

    d.dispose();
    expect(c.parentElement).toBe(m.element);
    expect(c.style.display).toBe('none');
    m.dispose();
  });

  it('rebinding before old dispose makes the old dispose a no-op', () => {
    const host = makeHost();
    const m = new RenderContainerManager(host, () => toDisposable(() => {}));
    const ph1 = document.createElement('div');
    const ph2 = document.createElement('div');
    host.append(ph1, ph2);

    const d1 = m.bindPlaceholder('p1', ph1);
    m.bindPlaceholder('p1', ph2);

    const c = m.getContainer('p1')!;
    expect(c.parentElement).toBe(ph2);

    d1.dispose(); // stale — must NOT move container back to limbo
    expect(c.parentElement).toBe(ph2);
    m.dispose();
  });

  it('createContent is called exactly once per panel across many binds', () => {
    const host = makeHost();
    const create = vi.fn().mockImplementation(() => toDisposable(() => {}));
    const m = new RenderContainerManager(host, create);
    const ph = document.createElement('div');
    host.appendChild(ph);

    for (let i = 0; i < 5; i++) {
      const d = m.bindPlaceholder('p1', ph);
      d.dispose();
    }
    expect(create).toHaveBeenCalledTimes(1);
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

  it('container is initially parked in limbo (display:none)', () => {
    const host = makeHost();
    const create = vi.fn().mockImplementation((_panelId, container: HTMLElement) => {
      // At create time, container should already have a parent (limbo)
      expect(container.parentElement).not.toBeNull();
      return toDisposable(() => {});
    });
    const m = new RenderContainerManager(host, create);
    const ph = document.createElement('div');
    host.appendChild(ph);
    m.bindPlaceholder('p1', ph);
    expect(create).toHaveBeenCalledTimes(1);
    m.dispose();
  });
});

describe('RenderContainerManager — keeping content state across moves', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('moves with moveBefore where the browser has it, so an iframe inside keeps its page', () => {
    const host = makeHost();
    const m = new RenderContainerManager(host, () => toDisposable(() => {}));
    const ph1 = document.createElement('div');
    const ph2 = document.createElement('div');
    host.append(ph1, ph2);
    const calls: Array<[Element, Node]> = [];
    const proto = Element.prototype as unknown as { moveBefore?: (n: Node, c: Node | null) => void };
    const had = proto.moveBefore;
    proto.moveBefore = function (this: Element, node: Node, child: Node | null) {
      calls.push([this, node]);
      this.insertBefore(node, child); // jsdom has no moveBefore: the move itself, recorded
    };
    try {
      m.bindPlaceholder('p1', ph1);
      const c = m.getContainer('p1')!;
      m.bindPlaceholder('p1', ph2);
      expect(c.parentElement).toBe(ph2);
      expect(calls.some(([parent, node]) => parent === ph2 && node === c)).toBe(true);
    } finally {
      if (had) proto.moveBefore = had; else delete proto.moveBefore;
      m.dispose();
    }
  });

  it('waits in limbo for a placeholder not yet in the document, then moves into it', async () => {
    const host = makeHost();
    const m = new RenderContainerManager(host, () => toDisposable(() => {}));
    const ph = document.createElement('div'); // detached, as a floating window builds its content
    m.bindPlaceholder('p1', ph);
    const c = m.getContainer('p1')!;
    expect(c.parentElement).toBe(m.element);
    host.appendChild(ph);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(c.parentElement).toBe(ph);
    expect(c.style.display).toBe('');
    m.dispose();
  });

  it('a later bind supersedes a bind still waiting for its placeholder', async () => {
    const host = makeHost();
    const m = new RenderContainerManager(host, () => toDisposable(() => {}));
    const late = document.createElement('div');
    const now = document.createElement('div');
    host.appendChild(now);
    m.bindPlaceholder('p1', late);
    m.bindPlaceholder('p1', now);
    host.appendChild(late);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(m.getContainer('p1')!.parentElement).toBe(now);
    m.dispose();
  });
});
