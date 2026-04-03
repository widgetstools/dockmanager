// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PopoutWindowManager } from '../dom/PopoutWindowManager';

// ─── Helpers ─────────────────────────────────────────────────────────

function createMockWindow() {
  const head = document.createElement('head');
  const body = document.createElement('body');
  const documentElement = document.createElement('html');
  documentElement.appendChild(head);
  documentElement.appendChild(body);

  return {
    document: {
      write: vi.fn(),
      close: vi.fn(),
      head,
      body,
      title: '',
      createElement: document.createElement.bind(document),
      documentElement,
      querySelectorAll: vi.fn(() => []),
    },
    close: vi.fn(),
    closed: false,
    focus: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    screenX: 100,
    screenY: 100,
    screenLeft: 100,
    screenTop: 100,
    outerWidth: 400,
    outerHeight: 300,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('PopoutWindowManager', () => {
  let manager: PopoutWindowManager;
  let mockWindow: ReturnType<typeof createMockWindow>;

  beforeEach(() => {
    manager = new PopoutWindowManager();
    mockWindow = createMockWindow();
    vi.stubGlobal('open', vi.fn(() => mockWindow));
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager.dispose();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('open()', () => {
    it('creates a new popout window and returns a handle', () => {
      const handle = manager.open({ windowName: 'win1', title: 'Test Window' });

      expect(handle).not.toBeNull();
      expect(handle!.windowName).toBe('win1');
      expect(handle!.window).toBe(mockWindow);
      expect(handle!.container).toBeInstanceOf(HTMLElement);
      expect(handle!.container.id).toBe('popout-root');
    });

    it('calls window.open with correct features string', () => {
      manager.open({
        windowName: 'win1',
        title: 'Test',
        x: 200,
        y: 150,
        width: 600,
        height: 400,
      });

      expect(window.open).toHaveBeenCalledWith(
        'about:blank',
        'win1',
        expect.stringContaining('left=200'),
      );
      const features = (window.open as ReturnType<typeof vi.fn>).mock.calls[0][2] as string;
      expect(features).toContain('top=150');
      expect(features).toContain('width=600');
      expect(features).toContain('height=400');
    });

    it('uses default position and size when not specified', () => {
      manager.open({ windowName: 'win1', title: 'Test' });

      const features = (window.open as ReturnType<typeof vi.fn>).mock.calls[0][2] as string;
      expect(features).toContain('left=100');
      expect(features).toContain('top=100');
      expect(features).toContain('width=400');
      expect(features).toContain('height=300');
    });

    it('sets the document title on the popout window', () => {
      manager.open({ windowName: 'win1', title: 'My Panel' });
      expect(mockWindow.document.title).toBe('My Panel');
    });

    it('returns null if window.open returns null (popup blocked)', () => {
      vi.stubGlobal('open', vi.fn(() => null));

      const handle = manager.open({ windowName: 'blocked', title: 'Blocked' });
      expect(handle).toBeNull();
    });

    it('appends a container div to the popout body', () => {
      manager.open({ windowName: 'win1', title: 'Test' });

      const container = mockWindow.document.body.querySelector('#popout-root');
      expect(container).not.toBeNull();
      expect(container!.style.width).toBe('100%');
      expect(container!.style.height).toBe('100%');
    });

    it('sets body margin and padding to 0', () => {
      manager.open({ windowName: 'win1', title: 'Test' });

      expect(mockWindow.document.body.style.margin).toBe('0px');
      expect(mockWindow.document.body.style.padding).toBe('0px');
    });

    it('returns existing handle and focuses if window is still open', () => {
      const handle1 = manager.open({ windowName: 'win1', title: 'Test' });
      const handle2 = manager.open({ windowName: 'win1', title: 'Test' });

      expect(handle1).toBe(handle2);
      expect(mockWindow.focus).toHaveBeenCalled();
      // window.open should only be called once
      expect(window.open).toHaveBeenCalledTimes(1);
    });

    it('replaces previous window if it was closed externally', () => {
      const firstMock = createMockWindow();
      const secondMock = createMockWindow();
      let callCount = 0;
      vi.stubGlobal('open', vi.fn(() => {
        callCount++;
        return callCount === 1 ? firstMock : secondMock;
      }));

      const handle1 = manager.open({ windowName: 'win1', title: 'Test' });
      // Simulate external close
      firstMock.closed = true;
      const handle2 = manager.open({ windowName: 'win1', title: 'Test Reopened' });

      expect(handle2).not.toBeNull();
      expect(handle2!.window).toBe(secondMock);
      expect(handle2).not.toBe(handle1);
    });

    it('registers a beforeunload listener on the popout window', () => {
      manager.open({ windowName: 'win1', title: 'Test' });
      expect(mockWindow.addEventListener).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function),
      );
    });
  });

  describe('get()', () => {
    it('returns handle for an open window', () => {
      manager.open({ windowName: 'win1', title: 'Test' });

      const handle = manager.get('win1');
      expect(handle).not.toBeNull();
      expect(handle!.windowName).toBe('win1');
    });

    it('returns null for unknown window name', () => {
      expect(manager.get('nonexistent')).toBeNull();
    });

    it('returns null if the window has been closed', () => {
      manager.open({ windowName: 'win1', title: 'Test' });
      mockWindow.closed = true;

      expect(manager.get('win1')).toBeNull();
    });
  });

  describe('close()', () => {
    it('closes a specific window by name', () => {
      manager.open({ windowName: 'win1', title: 'Test' });
      manager.close('win1');

      expect(mockWindow.close).toHaveBeenCalled();
    });

    it('removes the window from tracked windows after close', () => {
      manager.open({ windowName: 'win1', title: 'Test' });
      manager.close('win1');

      expect(manager.get('win1')).toBeNull();
      expect(manager.getOpenWindowNames()).not.toContain('win1');
    });

    it('does not throw when closing a nonexistent window', () => {
      expect(() => manager.close('nonexistent')).not.toThrow();
    });

    it('does not call window.close if the window is already closed', () => {
      manager.open({ windowName: 'win1', title: 'Test' });
      mockWindow.closed = true;
      manager.close('win1');

      expect(mockWindow.close).not.toHaveBeenCalled();
    });
  });

  describe('getOpenWindowNames()', () => {
    it('returns empty array when no windows are open', () => {
      expect(manager.getOpenWindowNames()).toEqual([]);
    });

    it('returns names of all open windows', () => {
      const mock2 = createMockWindow();
      let callCount = 0;
      vi.stubGlobal('open', vi.fn(() => {
        callCount++;
        return callCount === 1 ? mockWindow : mock2;
      }));

      manager.open({ windowName: 'win1', title: 'Win 1' });
      manager.open({ windowName: 'win2', title: 'Win 2' });

      const names = manager.getOpenWindowNames();
      expect(names).toContain('win1');
      expect(names).toContain('win2');
      expect(names).toHaveLength(2);
    });

    it('excludes windows that have been closed externally', () => {
      const mock2 = createMockWindow();
      let callCount = 0;
      vi.stubGlobal('open', vi.fn(() => {
        callCount++;
        return callCount === 1 ? mockWindow : mock2;
      }));

      manager.open({ windowName: 'win1', title: 'Win 1' });
      manager.open({ windowName: 'win2', title: 'Win 2' });

      mockWindow.closed = true;
      const names = manager.getOpenWindowNames();
      expect(names).toEqual(['win2']);
    });
  });

  describe('dispose()', () => {
    it('closes all open windows', () => {
      const mock2 = createMockWindow();
      let callCount = 0;
      vi.stubGlobal('open', vi.fn(() => {
        callCount++;
        return callCount === 1 ? mockWindow : mock2;
      }));

      manager.open({ windowName: 'win1', title: 'Win 1' });
      manager.open({ windowName: 'win2', title: 'Win 2' });
      manager.dispose();

      expect(mockWindow.close).toHaveBeenCalled();
      expect(mock2.close).toHaveBeenCalled();
    });

    it('clears all tracked windows after disposal', () => {
      manager.open({ windowName: 'win1', title: 'Win 1' });
      manager.dispose();

      expect(manager.getOpenWindowNames()).toEqual([]);
      expect(manager.get('win1')).toBeNull();
    });
  });

  describe('handle.close()', () => {
    it('closes the popout window via the handle', () => {
      const handle = manager.open({ windowName: 'win1', title: 'Test' });
      handle!.close();

      expect(mockWindow.close).toHaveBeenCalled();
    });
  });

  describe('polling callbacks', () => {
    it('calls onDidClose when the popout window is closed externally', () => {
      const onDidClose = vi.fn();
      manager.open({ windowName: 'win1', title: 'Test', onDidClose });

      // Simulate the window being closed
      mockWindow.closed = true;
      vi.advanceTimersByTime(500);

      expect(onDidClose).toHaveBeenCalledWith('win1');
    });

    it('calls onDidResize with window position and size', () => {
      const onDidResize = vi.fn();
      manager.open({ windowName: 'win1', title: 'Test', onDidResize });

      vi.advanceTimersByTime(500);

      expect(onDidResize).toHaveBeenCalledWith('win1', 100, 100, 400, 300);
    });

    it('stops polling after window is closed', () => {
      const onDidClose = vi.fn();
      manager.open({ windowName: 'win1', title: 'Test', onDidClose });

      mockWindow.closed = true;
      vi.advanceTimersByTime(500);
      expect(onDidClose).toHaveBeenCalledTimes(1);

      // Should not fire again
      vi.advanceTimersByTime(500);
      expect(onDidClose).toHaveBeenCalledTimes(1);
    });

    it('clears poll interval when close() is called', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      manager.open({ windowName: 'win1', title: 'Test' });
      manager.close('win1');

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('copyStylesheets', () => {
    it('copies style elements from parent document to popout', () => {
      const style = document.createElement('style');
      style.textContent = '.test { color: red; }';
      document.head.appendChild(style);

      try {
        manager.open({ windowName: 'win1', title: 'Test' });

        const popoutStyles = mockWindow.document.head.querySelectorAll('style');
        expect(popoutStyles.length).toBeGreaterThanOrEqual(1);
        const copiedStyle = Array.from(popoutStyles).find(
          (s) => s.textContent === '.test { color: red; }',
        );
        expect(copiedStyle).toBeDefined();
      } finally {
        document.head.removeChild(style);
      }
    });

    it('copies link[rel=stylesheet] elements from parent document', () => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://example.com/styles.css';
      document.head.appendChild(link);

      try {
        manager.open({ windowName: 'win1', title: 'Test' });

        const popoutLinks = mockWindow.document.head.querySelectorAll('link[rel="stylesheet"]');
        expect(popoutLinks.length).toBeGreaterThanOrEqual(1);
        const copiedLink = Array.from(popoutLinks).find(
          (l) => (l as HTMLLinkElement).href === 'https://example.com/styles.css',
        );
        expect(copiedLink).toBeDefined();
      } finally {
        document.head.removeChild(link);
      }
    });

    it('copies html className for dark mode support', () => {
      document.documentElement.className = 'dark theme-custom';

      try {
        manager.open({ windowName: 'win1', title: 'Test' });
        expect(mockWindow.document.documentElement.className).toBe('dark theme-custom');
      } finally {
        document.documentElement.className = '';
      }
    });
  });
});
