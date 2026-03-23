import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// Mock ResizeObserver (not available in jsdom)
class ResizeObserverMock {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
});

// Mock MutationObserver if not available
if (typeof window.MutationObserver === 'undefined') {
  (window as any).MutationObserver = class {
    constructor(_cb: any) {}
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}

// Mock matchMedia — define as a regular function so vi.clearAllMocks() doesn't remove it
const matchMediaMock = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(matchMediaMock),
});

// Mock URL.createObjectURL / revokeObjectURL (missing in older jsdom)
if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
}
if (!window.URL.revokeObjectURL) {
  window.URL.revokeObjectURL = vi.fn();
}

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(),
    readText: vi.fn(),
  },
});

// Clean up mocks after each test, but re-apply matchMedia mock
afterEach(() => {
  vi.clearAllMocks();
  // Re-apply matchMedia mock since clearAllMocks resets the implementation
  (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation(matchMediaMock);
});
