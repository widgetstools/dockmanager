import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DockManagerState, PanelConfig, Placement } from '../types/dock';
import {
  serialize,
  deserialize,
  saveToLocalStorage,
  loadFromLocalStorage,
  clearLocalStorage,
  exportToFile,
  importFromFile,
  exportAsUrl,
  importFromUrl,
  validateIntegrity,
  SerializedDockLayout,
} from '../serialization/serializer';

// ─── Test helpers ───────────────────────────────────────────────────

function makeState(panelIds: string[] = ['p1', 'p2']): DockManagerState {
  const panels = new Map<string, PanelConfig>();
  for (const id of panelIds) {
    panels.set(id, { id, title: `Panel ${id}`, closable: true });
  }

  const placements = new Map<string, Placement>();
  for (const id of panelIds) {
    placements.set(id, { type: 'docked', groupId: 'tg1' });
  }

  return {
    layout: { type: 'tabgroup' as const, id: 'tg1', panels: panelIds, activePanel: panelIds[0] || '' },
    panels,
    placements,
    activePaneId: panelIds[0] || '',
    nextZIndex: 1000,
  };
}

function makeV1V2State(panelIds: string[] = ['p1', 'p2']): any {
  return {
    layout: { type: 'tabgroup', id: 'tg1', panels: panelIds, activePanel: panelIds[0] || '' },
    panels: Object.fromEntries(panelIds.map(id => [id, { id, title: `Panel ${id}`, closable: true }])),
    floatingPanels: [],
    popoutPanels: [],
    unpinnedPanels: [],
    nextZIndex: 1000,
    activePaneId: panelIds[0] || '',
  };
}

// ─── v3 round-trip ──────────────────────────────────────────────────

describe('v3 serialize / deserialize round-trip', () => {
  it('returns equivalent state after round-trip', () => {
    const state = makeState();
    const serialized = serialize(state);
    const restored = deserialize(serialized);
    expect(restored.layout).toEqual(state.layout);
    expect([...restored.panels.entries()]).toEqual([...state.panels.entries()]);
    expect([...restored.placements.entries()]).toEqual([...state.placements.entries()]);
    expect(restored.activePaneId).toBe(state.activePaneId);
    expect(restored.nextZIndex).toBe(state.nextZIndex);
  });

  it('preserves layout structure (tabgroup)', () => {
    const state = makeState(['a', 'b', 'c']);
    const restored = deserialize(serialize(state));
    expect(restored.layout.type).toBe('tabgroup');
    if (restored.layout.type === 'tabgroup') {
      expect(restored.layout.panels).toEqual(['a', 'b', 'c']);
      expect(restored.layout.activePanel).toBe('a');
    }
  });

  it('preserves panel configs with extra fields', () => {
    const state = makeState(['x']);
    const config = state.panels.get('x')!;
    config.icon = 'star';
    config.closable = false;
    config.widgetType = 'chart';
    config.widgetProps = { symbol: 'AAPL' };
    const restored = deserialize(serialize(state));
    expect(restored.panels.get('x')).toEqual(config);
  });

  it('preserves floating placements', () => {
    const state = makeState(['p1']);
    state.placements.set('p1', {
      type: 'floating', x: 10, y: 20, width: 300, height: 200, zIndex: 5,
    });
    state.layout = { type: 'tabgroup', id: 'tg1', panels: [], activePanel: '' };
    const restored = deserialize(serialize(state));
    expect(restored.placements.get('p1')).toEqual({
      type: 'floating', x: 10, y: 20, width: 300, height: 200, zIndex: 5,
    });
  });

  it('preserves unpinned placements', () => {
    const state = makeState(['p1']);
    state.placements.set('p1', { type: 'unpinned', edge: 'left', size: 250 });
    state.layout = { type: 'tabgroup', id: 'tg1', panels: [], activePanel: '' };
    const restored = deserialize(serialize(state));
    expect(restored.placements.get('p1')).toEqual({ type: 'unpinned', edge: 'left', size: 250 });
  });

  it('preserves popout placements', () => {
    const state = makeState(['p1']);
    state.placements.set('p1', {
      type: 'popout', windowName: 'win1', x: 100, y: 200, width: 400, height: 300,
    });
    state.layout = { type: 'tabgroup', id: 'tg1', panels: [], activePanel: '' };
    const restored = deserialize(serialize(state));
    expect(restored.placements.get('p1')).toEqual({
      type: 'popout', windowName: 'win1', x: 100, y: 200, width: 400, height: 300,
    });
  });

  it('preserves maximizedPanelId when set', () => {
    const state = makeState(['p1', 'p2']);
    state.maximizedPanelId = 'p1';
    const restored = deserialize(serialize(state));
    expect(restored.maximizedPanelId).toBe('p1');
  });

  it('serialize sets version to 3', () => {
    const serialized = serialize(makeState());
    expect(serialized.version).toBe(3);
  });

  it('serialize converts Maps to Records', () => {
    const serialized = serialize(makeState(['p1']));
    expect(typeof serialized.panels).toBe('object');
    expect(serialized.panels).not.toBeInstanceOf(Map);
    expect(serialized.panels['p1']).toBeDefined();
    expect(typeof serialized.placements).toBe('object');
    expect(serialized.placements).not.toBeInstanceOf(Map);
    expect(serialized.placements['p1']).toBeDefined();
  });

  it('complex split layout survives round-trip', () => {
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
      panels: new Map([
        ['p1', { id: 'p1', title: 'Panel 1' }],
        ['p2', { id: 'p2', title: 'Panel 2' }],
        ['p3', { id: 'p3', title: 'Panel 3' }],
        ['p4', { id: 'p4', title: 'Panel 4' }],
      ]),
      placements: new Map([
        ['p1', { type: 'docked', groupId: 'tg1' }],
        ['p2', { type: 'docked', groupId: 'tg2' }],
        ['p3', { type: 'docked', groupId: 'tg3' }],
        ['p4', { type: 'docked', groupId: 'tg3' }],
      ]),
      activePaneId: 'p1',
      nextZIndex: 1,
    };
    const restored = deserialize(serialize(state));
    expect(restored.layout).toEqual(state.layout);
    expect(restored.panels.size).toBe(4);
    expect(restored.placements.size).toBe(4);
  });
});

// ─── v1/v2 deserialization ──────────────────────────────────────────

describe('v1/v2 deserialization (migration)', () => {
  it('deserializes v2 wrapped format with separate arrays', () => {
    const v2Data = {
      version: 2,
      timestamp: Date.now(),
      state: makeV1V2State(['p1', 'p2']),
    };
    const restored = deserialize(v2Data);
    expect(restored.panels).toBeInstanceOf(Map);
    expect(restored.placements).toBeInstanceOf(Map);
    expect(restored.panels.size).toBe(2);
    expect(restored.placements.get('p1')).toEqual({ type: 'docked', groupId: 'tg1' });
    expect(restored.placements.get('p2')).toEqual({ type: 'docked', groupId: 'tg1' });
  });

  it('deserializes v1 wrapped format', () => {
    const v1Data = {
      version: 1,
      timestamp: Date.now(),
      state: makeV1V2State(['p1']),
    };
    const restored = deserialize(v1Data);
    expect(restored.panels).toBeInstanceOf(Map);
    expect(restored.placements.get('p1')).toEqual({ type: 'docked', groupId: 'tg1' });
  });

  it('deserializes legacy raw format (no version wrapper)', () => {
    const rawState = makeV1V2State(['p1', 'p2']);
    const restored = deserialize(rawState);
    expect(restored.panels).toBeInstanceOf(Map);
    expect(restored.panels.size).toBe(2);
  });

  it('converts floatingPanels[] to floating placements', () => {
    const raw = makeV1V2State(['p1', 'p2']);
    raw.floatingPanels = [
      { panelId: 'p2', x: 50, y: 60, width: 200, height: 150, zIndex: 10, sourceTabGroupId: 'tg1' },
    ];
    raw.layout = { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1' };
    const restored = deserialize({ version: 2, timestamp: 0, state: raw });
    const placement = restored.placements.get('p2');
    expect(placement).toEqual({
      type: 'floating',
      x: 50, y: 60, width: 200, height: 150, zIndex: 10,
      sourceGroupId: 'tg1',
    });
  });

  it('converts unpinnedPanels[] to unpinned placements', () => {
    const raw = makeV1V2State(['p1', 'p2']);
    raw.unpinnedPanels = [
      { panelId: 'p2', edge: 'right', size: 300, sourceTabGroupId: 'tg1' },
    ];
    raw.layout = { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1' };
    const restored = deserialize({ version: 2, timestamp: 0, state: raw });
    const placement = restored.placements.get('p2');
    expect(placement).toEqual({
      type: 'unpinned',
      edge: 'right', size: 300,
      sourceGroupId: 'tg1',
    });
  });

  it('converts popoutPanels[] to floating placements (can\'t restore OS windows)', () => {
    const raw = makeV1V2State(['p1', 'p2', 'p3']);
    raw.popoutPanels = [
      { panelId: 'p3', windowName: 'win1', x: 100, y: 200, width: 400, height: 300 },
    ];
    raw.layout = { type: 'tabgroup', id: 'tg1', panels: ['p1', 'p2'], activePanel: 'p1' };
    const restored = deserialize({ version: 2, timestamp: 0, state: raw });
    const placement = restored.placements.get('p3');
    expect(placement).toBeDefined();
    expect(placement!.type).toBe('floating');
    if (placement!.type === 'floating') {
      expect(placement!.x).toBe(100);
      expect(placement!.y).toBe(200);
      expect(placement!.width).toBe(400);
      expect(placement!.height).toBe(300);
    }
  });

  it('adds stub config for floating panels missing from panels record', () => {
    const raw = makeV1V2State(['p1']);
    raw.floatingPanels = [
      { panelId: 'orphan', x: 0, y: 0, width: 100, height: 100, zIndex: 1 },
    ];
    const restored = deserialize({ version: 2, timestamp: 0, state: raw });
    expect(restored.panels.has('orphan')).toBe(true);
    expect(restored.panels.get('orphan')!.title).toBe('orphan');
  });

  it('adds stub config for unpinned panels missing from panels record', () => {
    const raw = makeV1V2State(['p1']);
    raw.unpinnedPanels = [
      { panelId: 'orphan', edge: 'left', size: 200 },
    ];
    const restored = deserialize({ version: 2, timestamp: 0, state: raw });
    expect(restored.panels.has('orphan')).toBe(true);
    expect(restored.panels.get('orphan')!.title).toBe('orphan');
  });

  it('preserves all four unpinned edges including top', () => {
    const raw = makeV1V2State(['p1', 'p2', 'p3', 'p4']);
    raw.layout = { type: 'tabgroup', id: 'tg1', panels: [], activePanel: '' };
    raw.unpinnedPanels = [
      { panelId: 'p1', edge: 'left', size: 200 },
      { panelId: 'p2', edge: 'right', size: 200 },
      { panelId: 'p3', edge: 'top', size: 150 },
      { panelId: 'p4', edge: 'bottom', size: 150 },
    ];
    const restored = deserialize({ version: 2, timestamp: 0, state: raw });
    expect(restored.placements.get('p1')).toEqual({ type: 'unpinned', edge: 'left', size: 200, sourceGroupId: undefined });
    expect(restored.placements.get('p3')).toEqual({ type: 'unpinned', edge: 'top', size: 150, sourceGroupId: undefined });
  });
});

// ─── Deserialize validation ─────────────────────────────────────────

describe('deserialize validation', () => {
  it('throws on non-object input', () => {
    expect(() => deserialize(null)).toThrow();
    expect(() => deserialize('string')).toThrow();
  });

  it('throws on missing layout in v1/v2', () => {
    const data = { version: 2, state: { panels: {} } };
    expect(() => deserialize(data)).toThrow();
  });

  it('throws on unrecognized format', () => {
    expect(() => deserialize({ foo: 'bar' })).toThrow('Unrecognized layout format');
  });
});

// ─── localStorage ───────────────────────────────────────────────────

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
    saveToLocalStorage('test-key', state);
    const result = loadFromLocalStorage('test-key');
    expect(result).not.toBeNull();
    expect(result!.layout).toEqual(state.layout);
    expect([...result!.panels.entries()]).toEqual([...state.panels.entries()]);
    expect([...result!.placements.entries()]).toEqual([...state.placements.entries()]);
  });

  it('loadFromLocalStorage returns null when nothing saved', () => {
    expect(loadFromLocalStorage('nonexistent-key')).toBeNull();
  });

  it('clearLocalStorage removes the stored data', () => {
    const state = makeState();
    saveToLocalStorage('test-key', state);
    expect(loadFromLocalStorage('test-key')).not.toBeNull();
    clearLocalStorage('test-key');
    expect(loadFromLocalStorage('test-key')).toBeNull();
  });

  it('loadFromLocalStorage returns null on corrupt data', () => {
    storage['bad-key'] = 'not valid json {{{';
    expect(loadFromLocalStorage('bad-key')).toBeNull();
  });
});

// ─── exportToFile / importFromFile ──────────────────────────────────

describe('exportToFile / importFromFile', () => {
  it('round-trips state through JSON string', () => {
    const state = makeState(['p1', 'p2']);
    const json = exportToFile(state);
    const restored = importFromFile(json);
    expect(restored.layout).toEqual(state.layout);
    expect([...restored.panels.entries()]).toEqual([...state.panels.entries()]);
  });

  it('exportToFile produces valid pretty-printed JSON', () => {
    const json = exportToFile(makeState());
    expect(() => JSON.parse(json)).not.toThrow();
    // Pretty-printed means it contains newlines
    expect(json).toContain('\n');
  });

  it('importFromFile throws on invalid JSON', () => {
    expect(() => importFromFile('not json {')).toThrow('Invalid JSON');
  });
});

// ─── URL encoding ───────────────────────────────────────────────────

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
    expect([...restored.panels.entries()]).toEqual([...state.panels.entries()]);
    expect([...restored.placements.entries()]).toEqual([...state.placements.entries()]);
  });

  it('importFromUrl throws on invalid base64', () => {
    expect(() => importFromUrl('!!!not-base64!!!')).toThrow();
  });
});

// ─── validateIntegrity ──────────────────────────────────────────────

describe('validateIntegrity', () => {
  it('returns no warnings for a valid state', () => {
    const state = makeState(['p1', 'p2']);
    expect(validateIntegrity(state)).toEqual([]);
  });

  it('warns when a panel is in placements but missing from panels map', () => {
    const state = makeState(['p1', 'p2']);
    state.panels.delete('p2');
    const warnings = validateIntegrity(state);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some(w => w.includes('p2'))).toBe(true);
  });

  it('warns when maximizedPanelId references a non-existent panel', () => {
    const state = makeState(['p1']);
    state.maximizedPanelId = 'gone';
    const warnings = validateIntegrity(state);
    expect(warnings.some(w => w.includes('gone'))).toBe(true);
  });
});
