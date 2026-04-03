// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FocusManager } from '../dom/FocusManager';
import type { FocusManagerOptions } from '../dom/FocusManager';

// ─── Helpers ─────────────────────────────────────────────────────────

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function fireKeyDown(
  target: HTMLElement | EventTarget,
  key: string,
  opts: Partial<KeyboardEventInit> = {},
): void {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  target.dispatchEvent(event);
}

function fireFocusIn(container: HTMLElement, target: HTMLElement): void {
  const event = new FocusEvent('focusin', { bubbles: true, relatedTarget: null });
  Object.defineProperty(event, 'target', { value: target, writable: false });
  container.dispatchEvent(event);
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('FocusManager', () => {
  let container: HTMLElement;
  let onFocusChanged: ReturnType<typeof vi.fn>;
  let onNavigate: ReturnType<typeof vi.fn>;
  let onCloseActivePanel: ReturnType<typeof vi.fn>;
  let onNavigateTabGroup: ReturnType<typeof vi.fn>;
  let fm: FocusManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = createContainer();
    onFocusChanged = vi.fn();
    onNavigate = vi.fn();
    onCloseActivePanel = vi.fn();
    onNavigateTabGroup = vi.fn();
    fm = new FocusManager({
      containerElement: container,
      onFocusChanged,
      onNavigate,
      onCloseActivePanel,
      onNavigateTabGroup,
    });
  });

  // ─── Constructor ─────────────────────────────────────────────────

  it('constructor attaches keydown and focusin listeners to container', () => {
    // After dispose, events should no longer fire, proving they were attached
    fireKeyDown(container, 'Tab', { ctrlKey: true });
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  // ─── setFocus ────────────────────────────────────────────────────

  it('setFocus() updates state and calls onFocusChanged', () => {
    fm.setFocus('panel-1');
    expect(fm.getFocusedPanelId()).toBe('panel-1');
    expect(onFocusChanged).toHaveBeenCalledWith('panel-1');
  });

  it('setFocus() with same panelId is a no-op', () => {
    fm.setFocus('panel-1');
    onFocusChanged.mockClear();

    fm.setFocus('panel-1');
    expect(onFocusChanged).not.toHaveBeenCalled();
  });

  it('setFocus() focuses the DOM element with matching data-panel-id', () => {
    const panelEl = document.createElement('div');
    panelEl.setAttribute('data-panel-id', 'panel-1');
    panelEl.tabIndex = 0;
    container.appendChild(panelEl);

    const focusSpy = vi.spyOn(panelEl, 'focus');
    fm.setFocus('panel-1');
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });

  // ─── clearFocus ──────────────────────────────────────────────────

  it('clearFocus() resets to null and calls onFocusChanged(null)', () => {
    fm.setFocus('panel-1');
    onFocusChanged.mockClear();

    fm.clearFocus();
    expect(fm.getFocusedPanelId()).toBeNull();
    expect(onFocusChanged).toHaveBeenCalledWith(null);
  });

  it('clearFocus() when already null is a no-op', () => {
    fm.clearFocus();
    expect(onFocusChanged).not.toHaveBeenCalled();
  });

  // ─── getFocusedPanelId ───────────────────────────────────────────

  it('getFocusedPanelId() returns current value', () => {
    expect(fm.getFocusedPanelId()).toBeNull();
    fm.setFocus('abc');
    expect(fm.getFocusedPanelId()).toBe('abc');
  });

  // ─── updateOptions ──────────────────────────────────────────────

  it('updateOptions() updates callbacks', () => {
    const newOnNavigate = vi.fn();
    fm.updateOptions({ onNavigate: newOnNavigate });

    fireKeyDown(container, 'Tab', { ctrlKey: true });
    expect(newOnNavigate).toHaveBeenCalledWith('next');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  // ─── dispose ─────────────────────────────────────────────────────

  it('dispose() removes event listeners', () => {
    fm.dispose();

    fireKeyDown(container, 'Tab', { ctrlKey: true });
    expect(onNavigate).not.toHaveBeenCalled();

    // focusin should also be removed
    const panelEl = document.createElement('div');
    panelEl.setAttribute('data-panel-id', 'p1');
    container.appendChild(panelEl);
    fireFocusIn(container, panelEl);
    expect(onFocusChanged).not.toHaveBeenCalled();
  });

  // ─── Keyboard shortcuts ──────────────────────────────────────────

  it('Ctrl+Tab calls onNavigate("next")', () => {
    fireKeyDown(container, 'Tab', { ctrlKey: true });
    expect(onNavigate).toHaveBeenCalledWith('next');
  });

  it('Ctrl+Shift+Tab calls onNavigate("previous")', () => {
    fireKeyDown(container, 'Tab', { ctrlKey: true, shiftKey: true });
    expect(onNavigate).toHaveBeenCalledWith('previous');
  });

  it('Ctrl+PageDown calls onNavigate("next")', () => {
    fireKeyDown(container, 'PageDown', { ctrlKey: true });
    expect(onNavigate).toHaveBeenCalledWith('next');
  });

  it('Ctrl+PageUp calls onNavigate("previous")', () => {
    fireKeyDown(container, 'PageUp', { ctrlKey: true });
    expect(onNavigate).toHaveBeenCalledWith('previous');
  });

  it('Ctrl+W calls onCloseActivePanel', () => {
    fireKeyDown(container, 'w', { ctrlKey: true });
    expect(onCloseActivePanel).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+ArrowRight calls onNavigateTabGroup("next")', () => {
    fireKeyDown(container, 'ArrowRight', { ctrlKey: true, shiftKey: true });
    expect(onNavigateTabGroup).toHaveBeenCalledWith('next');
  });

  it('Ctrl+Shift+ArrowLeft calls onNavigateTabGroup("previous")', () => {
    fireKeyDown(container, 'ArrowLeft', { ctrlKey: true, shiftKey: true });
    expect(onNavigateTabGroup).toHaveBeenCalledWith('previous');
  });

  // ─── ArrowLeft/ArrowRight within tablist ──────────────────────────

  describe('ArrowLeft/ArrowRight within tablist', () => {
    let tablist: HTMLDivElement;
    let tab1: HTMLDivElement;
    let tab2: HTMLDivElement;
    let tab3: HTMLDivElement;

    beforeEach(() => {
      tablist = document.createElement('div');
      tablist.setAttribute('role', 'tablist');
      tab1 = document.createElement('div');
      tab1.setAttribute('role', 'tab');
      tab1.setAttribute('data-tab-id', 'tab1');
      tab1.tabIndex = 0;
      tab2 = document.createElement('div');
      tab2.setAttribute('role', 'tab');
      tab2.setAttribute('data-tab-id', 'tab2');
      tab2.tabIndex = 0;
      tab3 = document.createElement('div');
      tab3.setAttribute('role', 'tab');
      tab3.setAttribute('data-tab-id', 'tab3');
      tab3.tabIndex = 0;
      tablist.appendChild(tab1);
      tablist.appendChild(tab2);
      tablist.appendChild(tab3);
      container.appendChild(tablist);
    });

    it('ArrowRight on a tab moves focus and clicks the next tab', () => {
      const focusSpy = vi.spyOn(tab2, 'focus');
      const clickSpy = vi.spyOn(tab2, 'click');

      const event = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      });
      const preventSpy = vi.spyOn(event, 'preventDefault');
      tab1.dispatchEvent(event);

      expect(focusSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(preventSpy).toHaveBeenCalled();
    });

    it('ArrowLeft on a tab moves focus and clicks the previous tab', () => {
      const focusSpy = vi.spyOn(tab1, 'focus');
      const clickSpy = vi.spyOn(tab1, 'click');

      const event = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        bubbles: true,
        cancelable: true,
      });
      const preventSpy = vi.spyOn(event, 'preventDefault');
      tab2.dispatchEvent(event);

      expect(focusSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(preventSpy).toHaveBeenCalled();
    });

    it('ArrowRight on last tab wraps to first tab', () => {
      const focusSpy = vi.spyOn(tab1, 'focus');
      const clickSpy = vi.spyOn(tab1, 'click');

      const event = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      });
      const preventSpy = vi.spyOn(event, 'preventDefault');
      tab3.dispatchEvent(event);

      expect(focusSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(preventSpy).toHaveBeenCalled();
    });

    it('ArrowLeft on first tab wraps to last tab', () => {
      const focusSpy = vi.spyOn(tab3, 'focus');
      const clickSpy = vi.spyOn(tab3, 'click');

      const event = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        bubbles: true,
        cancelable: true,
      });
      const preventSpy = vi.spyOn(event, 'preventDefault');
      tab1.dispatchEvent(event);

      expect(focusSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(preventSpy).toHaveBeenCalled();
    });

    it('Arrow keys outside a tablist do not prevent default', () => {
      const outsideEl = document.createElement('div');
      outsideEl.tabIndex = 0;
      container.appendChild(outsideEl);

      const event = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      });
      const preventSpy = vi.spyOn(event, 'preventDefault');
      outsideEl.dispatchEvent(event);

      expect(preventSpy).not.toHaveBeenCalled();
    });
  });

  // ─── focusin ─────────────────────────────────────────────────────

  it('focusin on element with data-panel-id updates focus', () => {
    const panelEl = document.createElement('div');
    panelEl.setAttribute('data-panel-id', 'fp-1');
    container.appendChild(panelEl);

    fireFocusIn(container, panelEl);
    expect(fm.getFocusedPanelId()).toBe('fp-1');
    expect(onFocusChanged).toHaveBeenCalledWith('fp-1');
  });

  it('focusin on child of element with data-panel-id walks up', () => {
    const panelEl = document.createElement('div');
    panelEl.setAttribute('data-panel-id', 'fp-2');
    const child = document.createElement('span');
    panelEl.appendChild(child);
    container.appendChild(panelEl);

    fireFocusIn(container, child);
    expect(fm.getFocusedPanelId()).toBe('fp-2');
    expect(onFocusChanged).toHaveBeenCalledWith('fp-2');
  });
});
