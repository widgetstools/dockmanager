import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DockManagerState } from '../types/dock';
import {
  serialize,
  deserialize,
  saveToLocalStorage,
  loadFromLocalStorage,
  clearLocalStorage,
  exportAsUrl,
  importFromUrl,
  validateIntegrity,
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

describe('serialize / deserialize round-trip', () => {
  it('returns equivalent state after round-trip', () => {
    const state = makeState();
    const { state: restored } = deserialize(serialize(state));
    expect(restored.layout).toEqual(state.layout);
    expect(restored.panels).toEqual(state.panels);
  });

  it('preserves layout structure (tabgroup)', () => {
    const state = makeState(['a', 'b', 'c']);
    const { state: restored } = deserialize(serialize(state));
    expect(restored.layout.type).toBe('tabgroup');
    if (restored.layout.type === 'tabgroup') {
      expect(restored.layout.panels).toEqual(['a', 'b', 'c']);
      expect(restored.layout.activePanel).toBe('a');
    }
  });

  it('preserves panel configs', () => {
    const state = makeState(['x']);
    state.panels['x'].icon = 'star';
    state.panels['x'].closable = false;
    const { state: restored } = deserialize(serialize(state));
    expect(restored.panels['x']).toEqual(state.panels['x']);
  });

  it('preserves floating panels', () => {
    const state = makeState(['p1']);
    state.floatingPanels = [{ panelId: 'p1', x: 10, y: 20, width: 300, height: 200, zIndex: 5 }];
    state.layout = { type: 'tabgroup', id: 'tg1', panels: [], activePanel: '' };
    const { state: restored } = deserialize(serialize(state));
    expect(restored.floatingPanels).toEqual(state.floatingPanels);
  });

  it('preserves unpinned panels', () => {
    const state = makeState(['p1']);
    state.unpinnedPanels = [{ panelId: 'p1', edge: 'left', size: 250 }];
    state.layout = { type: 'tabgroup', id: 'tg1', panels: [], activePanel: '' };
    const { state: restored } = deserialize(serialize(state));
    expect(restored.unpinnedPanels).toEqual(state.unpinnedPanels);
  });

  it('accepts all four unpinned edges including top (regression)', () => {
    // Regression: validator whitelist was missing 'top', so any layout with
    // a top-edge unpinned panel failed to deserialize.
    const state = makeState(['p1', 'p2', 'p3', 'p4']);
    state.layout = { type: 'tabgroup', id: 'tg1', panels: [], activePanel: '' };
    state.unpinnedPanels = [
      { panelId: 'p1', edge: 'left', size: 200 },
      { panelId: 'p2', edge: 'right', size: 200 },
      { panelId: 'p3', edge: 'top', size: 150 },
      { panelId: 'p4', edge: 'bottom', size: 150 },
    ];
    const { state: restored } = deserialize(serialize(state));
    expect(restored.unpinnedPanels).toEqual(state.unpinnedPanels);
  });

  it('preserves maximizedPanelId when set', () => {
    const state = makeState(['p1', 'p2']);
    state.maximizedPanelId = 'p1';
    const { state: restored } = deserialize(serialize(state));
    expect(restored.maximizedPanelId).toBe('p1');
  });
});

describe('serialize format', () => {
  it('output is valid JSON', () => {
    const json = serialize(makeState());
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('contains version field set to 2', () => {
    const parsed = JSON.parse(serialize(makeState()));
    expect(parsed.version).toBe(2);
  });

  it('contains a timestamp', () => {
    const before = Date.now();
    const parsed = JSON.parse(serialize(makeState()));
    const after = Date.now();
    expect(parsed.timestamp).toBeGreaterThanOrEqual(before);
    expect(parsed.timestamp).toBeLessThanOrEqual(after);
  });

  it('contains state', () => {
    const parsed = JSON.parse(serialize(makeState()));
    expect(parsed.state).toBeDefined();
    expect(parsed.state.layout).toBeDefined();
    expect(parsed.state.panels).toBeDefined();
  });
});

describe('deserialize validation', () => {
  it('throws on invalid JSON', () => {
    expect(() => deserialize('not json {')).toThrow('Invalid JSON');
  });

  it('throws on missing layout', () => {
    const json = JSON.stringify({ version: 2, timestamp: 0, state: { panels: {} } });
    expect(() => deserialize(json)).toThrow();
  });

  it('throws on missing panels', () => {
    const json = JSON.stringify({
      version: 2,
      timestamp: 0,
      state: { layout: { type: 'tabgroup', id: 'tg1', panels: [], activePanel: '' } },
    });
    expect(() => deserialize(json)).toThrow();
  });

  it('handles legacy format (no version wrapper, raw layout+panels)', () => {
    const state = makeState();
    const legacyJson = JSON.stringify(state);
    const { state: restored } = deserialize(legacyJson);
    expect(restored.layout).toEqual(state.layout);
    expect(restored.panels).toEqual(state.panels);
  });
});

describe('deserialize normalization', () => {
  it('adds missing popoutPanels array', () => {
    const state = makeState();
    const raw: any = { ...state };
    delete raw.popoutPanels;
    const json = JSON.stringify({ version: 2, timestamp: 0, state: raw });
    const { state: restored } = deserialize(json);
    expect(restored.popoutPanels).toEqual([]);
  });

  it('adds missing activePaneId', () => {
    const state = makeState();
    const raw: any = { ...state };
    delete raw.activePaneId;
    const json = JSON.stringify({ version: 2, timestamp: 0, state: raw });
    const { state: restored } = deserialize(json);
    expect(restored.activePaneId).toBe('');
  });

  it('converts popout panels to floating on deserialize', () => {
    const state = makeState(['p1', 'p2', 'p3']);
    state.popoutPanels = [
      { panelId: 'p3', windowName: 'win1', x: 100, y: 200, width: 400, height: 300 },
    ];
    state.layout = { type: 'tabgroup', id: 'tg1', panels: ['p1', 'p2'], activePanel: 'p1' };
    const json = JSON.stringify({ version: 2, timestamp: 0, state });
    const { state: restored } = deserialize(json);
    expect(restored.popoutPanels).toEqual([]);
    expect(restored.floatingPanels).toHaveLength(1);
    expect(restored.floatingPanels[0].panelId).toBe('p3');
    expect(restored.floatingPanels[0].x).toBe(100);
    expect(restored.floatingPanels[0].y).toBe(200);
    expect(restored.floatingPanels[0].width).toBe(400);
    expect(restored.floatingPanels[0].height).toBe(300);
  });
});

describe('complex state round-trip', () => {
  it('split layout with nested tab groups survives round-trip', () => {
    const state: DockManagerState = {
      layout: {
        type: 'split',
        id: 's1',
        direction: 'horizontal',
        children: [
          { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1' },
          {
            type: 'split',
            id: 's2',
            direction: 'vertical',
            children: [
              { type: 'tabgroup', id: 'tg2', panels: ['p2'], activePanel: 'p2' },
              { type: 'tabgroup', id: 'tg3', panels: ['p3', 'p4'], activePanel: 'p3' },
            ],
            sizes: [40, 60],
          },
        ],
        sizes: [30, 70],
      },
      panels: {
        p1: { id: 'p1', title: 'Panel 1' },
        p2: { id: 'p2', title: 'Panel 2' },
        p3: { id: 'p3', title: 'Panel 3' },
        p4: { id: 'p4', title: 'Panel 4' },
      },
      floatingPanels: [],
      popoutPanels: [],
      unpinnedPanels: [],
      nextZIndex: 1,
      activePaneId: 'p1',
    };
    const { state: restored } = deserialize(serialize(state));
    expect(restored.layout).toEqual(state.layout);
    expect(Object.keys(restored.panels)).toHaveLength(4);
  });

  it('state with floating panels survives round-trip', () => {
    const state = makeState(['p1', 'p2', 'p3']);
    state.floatingPanels = [
      { panelId: 'p3', x: 50, y: 60, width: 200, height: 150, zIndex: 10 },
    ];
    state.layout = { type: 'tabgroup', id: 'tg1', panels: ['p1', 'p2'], activePanel: 'p1' };
    const { state: restored } = deserialize(serialize(state));
    expect(restored.floatingPanels).toEqual(state.floatingPanels);
  });
});

describe('URL encoding', () => {
  it('exportAsUrl produces a string', () => {
    const result = exportAsUrl(makeState());
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('importFromUrl(exportAsUrl(state)) returns equivalent state', () => {
    const state = makeState(['a', 'b']);
    const encoded = exportAsUrl(state);
    const restored = importFromUrl(encoded);
    expect(restored.layout).toEqual(state.layout);
    expect(restored.panels).toEqual(state.panels);
    expect(restored.floatingPanels).toEqual(state.floatingPanels);
  });

  it('importFromUrl throws on invalid base64', () => {
    expect(() => importFromUrl('!!!not-base64!!!')).toThrow();
  });
});

describe('localStorage', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
    });
  });

  it('saveToLocalStorage + loadFromLocalStorage round-trips', () => {
    const state = makeState(['p1', 'p2']);
    saveToLocalStorage(state);
    const result = loadFromLocalStorage();
    expect(result).not.toBeNull();
    expect(result!.state.layout).toEqual(state.layout);
    expect(result!.state.panels).toEqual(state.panels);
  });

  it('loadFromLocalStorage returns null when nothing saved', () => {
    expect(loadFromLocalStorage()).toBeNull();
  });

  it('clearLocalStorage removes the stored data', () => {
    const state = makeState();
    saveToLocalStorage(state);
    expect(loadFromLocalStorage()).not.toBeNull();
    clearLocalStorage();
    expect(loadFromLocalStorage()).toBeNull();
  });
});

describe('validateIntegrity', () => {
  it('returns no warnings for a valid state', () => {
    const state = makeState(['p1', 'p2']);
    expect(validateIntegrity(state)).toEqual([]);
  });

  it('warns when a panel is referenced in layout but missing from panels record', () => {
    const state = makeState(['p1', 'p2']);
    delete state.panels['p2'];
    const warnings = validateIntegrity(state);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('p2');
  });

  it('warns when maximizedPanelId references a non-existent panel', () => {
    const state = makeState(['p1']);
    state.maximizedPanelId = 'gone';
    const warnings = validateIntegrity(state);
    expect(warnings.some(w => w.includes('gone'))).toBe(true);
  });
});
