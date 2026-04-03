// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DockManagerState } from '../types/dock';
import {
  serialize,
  deserialize,
  exportToFile,
  importFromFile,
} from '../serialization/serializer';

function makeState(panelIds: string[] = ['p1', 'p2']): DockManagerState {
  return {
    layout: { type: 'tabgroup' as const, id: 'tg1', panels: panelIds, activePanel: panelIds[0] || '' },
    panels: Object.fromEntries(panelIds.map(id => [id, { id, title: `Panel ${id}`, closable: true }])),
    floatingPanels: [],
    popoutPanels: [],
    unpinnedPanels: [],
    nextZIndex: 1000,
    activePaneId: panelIds[0] || '',
  };
}

describe('exportToFile', () => {
  let anchorEl: HTMLAnchorElement;
  let appendChildSpy: ReturnType<typeof vi.fn>;
  let removeChildSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create a real anchor element so jsdom accepts it in appendChild
    anchorEl = document.createElement('a');
    vi.spyOn(anchorEl, 'click').mockImplementation(() => {});

    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return anchorEl;
      return origCreateElement(tag);
    });

    appendChildSpy = vi.spyOn(document.body, 'appendChild');
    removeChildSpy = vi.spyOn(document.body, 'removeChild');

    vi.stubGlobal('URL', {
      ...globalThis.URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an anchor element, triggers download, and cleans up', () => {
    const state = makeState();
    exportToFile(state);

    // createElement('a') was called
    expect(document.createElement).toHaveBeenCalledWith('a');

    // URL.createObjectURL was called with a Blob
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    // Anchor was appended to body and has correct href
    expect(appendChildSpy).toHaveBeenCalled();
    expect(anchorEl.href).toContain('blob:mock');

    // click() was called
    expect(anchorEl.click).toHaveBeenCalledTimes(1);

    // Anchor was removed from body
    expect(removeChildSpy).toHaveBeenCalled();

    // URL.revokeObjectURL was called
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('uses default filename with date when none provided', () => {
    const state = makeState();
    exportToFile(state);

    expect(anchorEl.download).toMatch(/^dock-layout-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('uses custom filename when provided', () => {
    const state = makeState();
    exportToFile(state, 'my-layout.json');

    expect(anchorEl.download).toBe('my-layout.json');
  });
});

describe('importFromFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a file input and triggers click', () => {
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'input') {
        return {
          type: '',
          accept: '',
          onchange: null as any,
          click: clickSpy,
        } as unknown as HTMLInputElement;
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement;
    });

    // Don't await — we just want to trigger the creation
    const promise = importFromFile();
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // The promise remains pending because no file was selected
    // We can't easily resolve it without simulating FileReader, so just verify it's a promise
    expect(promise).toBeInstanceOf(Promise);
  });

  it('rejects when no file is selected (empty files list)', async () => {
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'input') {
        const input = {
          type: '',
          accept: '',
          onchange: null as any,
          click: vi.fn(),
        } as any;

        // After click, immediately trigger onchange with empty files
        input.click = vi.fn(() => {
          if (input.onchange) {
            input.onchange({ target: { files: [] } });
          }
        });
        return input as HTMLInputElement;
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement;
    });

    await expect(importFromFile()).rejects.toThrow('No file selected');
  });
});

describe('normalizeState paths via deserialize', () => {
  it('converts popoutPanels to floatingPanels', () => {
    const state = makeState(['p1', 'p2', 'p3']);
    state.popoutPanels = [
      { panelId: 'p3', windowName: 'win1', x: 50, y: 60, width: 300, height: 200 },
    ];
    state.layout = { type: 'tabgroup', id: 'tg1', panels: ['p1', 'p2'], activePanel: 'p1' };

    const json = JSON.stringify({ version: 2, timestamp: 0, state });
    const { state: restored } = deserialize(json);

    expect(restored.popoutPanels).toEqual([]);
    expect(restored.floatingPanels).toHaveLength(1);
    expect(restored.floatingPanels[0]).toMatchObject({
      panelId: 'p3',
      x: 50,
      y: 60,
      width: 300,
      height: 200,
    });
    // zIndex should be assigned from nextZIndex
    expect(restored.floatingPanels[0].zIndex).toBeDefined();
  });

  it('defaults activePaneId to empty string when missing', () => {
    const state = makeState(['p1']);
    const raw: any = { ...state };
    delete raw.activePaneId;

    const json = JSON.stringify({ version: 2, timestamp: 0, state: raw });
    const { state: restored } = deserialize(json);

    expect(restored.activePaneId).toBe('');
  });

  it('defaults popoutPanels to empty array when field is absent', () => {
    const state = makeState(['p1']);
    const raw: any = { ...state };
    delete raw.popoutPanels;

    const json = JSON.stringify({ version: 2, timestamp: 0, state: raw });
    const { state: restored } = deserialize(json);

    expect(restored.popoutPanels).toEqual([]);
  });

  it('converts multiple popoutPanels and increments zIndex for each', () => {
    const state = makeState(['p1', 'p2', 'p3', 'p4']);
    state.popoutPanels = [
      { panelId: 'p3', windowName: 'win1', x: 10, y: 20, width: 100, height: 100 },
      { panelId: 'p4', windowName: 'win2', x: 30, y: 40, width: 200, height: 200 },
    ];
    state.layout = { type: 'tabgroup', id: 'tg1', panels: ['p1', 'p2'], activePanel: 'p1' };

    const json = JSON.stringify({ version: 2, timestamp: 0, state });
    const { state: restored } = deserialize(json);

    expect(restored.popoutPanels).toEqual([]);
    expect(restored.floatingPanels).toHaveLength(2);
    // Second floating panel should have a higher zIndex
    expect(restored.floatingPanels[1].zIndex).toBeGreaterThan(restored.floatingPanels[0].zIndex);
  });
});

describe('deserialize error paths', () => {
  it('throws on invalid JSON', () => {
    expect(() => deserialize('{{{')).toThrow('Invalid JSON');
  });

  it('throws on unrecognized format (no version, no layout)', () => {
    const json = JSON.stringify({ foo: 'bar' });
    expect(() => deserialize(json)).toThrow('Unrecognized layout format');
  });

  it('throws on invalid state structure (bad layout node)', () => {
    const json = JSON.stringify({
      version: 2,
      timestamp: 0,
      state: {
        layout: { type: 'unknown', id: 'x' },
        panels: {},
        floatingPanels: [],
        unpinnedPanels: [],
        popoutPanels: [],
        nextZIndex: 1,
      },
    });
    expect(() => deserialize(json)).toThrow('Invalid layout structure');
  });

  it('throws when panels record contains invalid panel config', () => {
    const json = JSON.stringify({
      version: 2,
      timestamp: 0,
      state: {
        layout: { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1' },
        panels: { p1: { id: 'p1' } }, // missing title
        floatingPanels: [],
        unpinnedPanels: [],
        popoutPanels: [],
        nextZIndex: 1,
      },
    });
    expect(() => deserialize(json)).toThrow('Invalid layout structure');
  });

  it('throws when floatingPanels contains invalid entry', () => {
    const json = JSON.stringify({
      version: 2,
      timestamp: 0,
      state: {
        layout: { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1' },
        panels: { p1: { id: 'p1', title: 'P1' } },
        floatingPanels: [{ panelId: 'p1' }], // missing x, y, width, height
        unpinnedPanels: [],
        popoutPanels: [],
        nextZIndex: 1,
      },
    });
    expect(() => deserialize(json)).toThrow('Invalid layout structure');
  });

  it('throws when unpinnedPanels contains invalid entry', () => {
    const json = JSON.stringify({
      version: 2,
      timestamp: 0,
      state: {
        layout: { type: 'tabgroup', id: 'tg1', panels: [], activePanel: '' },
        panels: {},
        floatingPanels: [],
        unpinnedPanels: [{ panelId: 'p1' }], // missing edge, size
        popoutPanels: [],
        nextZIndex: 1,
      },
    });
    expect(() => deserialize(json)).toThrow('Invalid layout structure');
  });
});
