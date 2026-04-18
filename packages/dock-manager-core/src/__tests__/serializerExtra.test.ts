import { describe, it, expect } from 'vitest';
import type { DockManagerState, PanelConfig, Placement } from '../types/dock';
import {
  serialize,
  deserialize,
} from '../serialization/serializer';

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

describe('serialize / deserialize string round-trip (extra)', () => {
  it('serialize returns a valid JSON string with version 3', () => {
    const state = makeState();
    const json = serialize(state);
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(3);
  });

  it('deserialize restores state from JSON string', () => {
    const state = makeState(['p1', 'p2']);
    const json = serialize(state);
    const { state: restored } = deserialize(json);
    expect(restored.panels).toBeInstanceOf(Map);
    expect(restored.panels.size).toBe(2);
    expect(restored.layout).toEqual(state.layout);
  });

  it('deserialize throws on invalid JSON string', () => {
    expect(() => deserialize('{{{')).toThrow('Invalid JSON');
  });

  it('round-trips complex state', () => {
    const state = makeState(['p1', 'p2', 'p3']);
    state.placements.set('p3', {
      type: 'floating', x: 10, y: 20, width: 300, height: 200, zIndex: 5,
    });
    state.layout = {
      type: 'tabgroup', id: 'tg1', panels: ['p1', 'p2'], activePanel: 'p1',
    };
    const json = serialize(state);
    const { state: restored } = deserialize(json);
    expect(restored.placements.get('p3')).toEqual({
      type: 'floating', x: 10, y: 20, width: 300, height: 200, zIndex: 5,
    });
  });
});

describe('v1/v2 migration via deserialize', () => {
  it('converts popoutPanels to floating placements', () => {
    const v2State = {
      layout: { type: 'tabgroup', id: 'tg1', panels: ['p1', 'p2'], activePanel: 'p1' },
      panels: {
        p1: { id: 'p1', title: 'P1' },
        p2: { id: 'p2', title: 'P2' },
        p3: { id: 'p3', title: 'P3' },
      },
      floatingPanels: [],
      unpinnedPanels: [],
      popoutPanels: [
        { panelId: 'p3', windowName: 'win1', x: 50, y: 60, width: 300, height: 200 },
      ],
      nextZIndex: 1000,
      activePaneId: 'p1',
    };
    const { state: restored } = deserialize({ version: 2, timestamp: 0, state: v2State });
    const placement = restored.placements.get('p3');
    expect(placement).toBeDefined();
    expect(placement!.type).toBe('floating');
    if (placement!.type === 'floating') {
      expect(placement!.x).toBe(50);
      expect(placement!.y).toBe(60);
      expect(placement!.width).toBe(300);
      expect(placement!.height).toBe(200);
      expect(placement!.zIndex).toBeDefined();
    }
  });

  it('defaults activePaneId to empty string when missing', () => {
    const v2State = {
      layout: { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1' },
      panels: { p1: { id: 'p1', title: 'P1' } },
      floatingPanels: [],
      unpinnedPanels: [],
      popoutPanels: [],
      nextZIndex: 1,
    };
    delete (v2State as any).activePaneId;
    const { state: restored } = deserialize({ version: 2, timestamp: 0, state: v2State });
    expect(restored.activePaneId).toBe('');
  });

  it('converts multiple popoutPanels with incrementing zIndex', () => {
    const v2State = {
      layout: { type: 'tabgroup', id: 'tg1', panels: ['p1', 'p2'], activePanel: 'p1' },
      panels: {
        p1: { id: 'p1', title: 'P1' },
        p2: { id: 'p2', title: 'P2' },
        p3: { id: 'p3', title: 'P3' },
        p4: { id: 'p4', title: 'P4' },
      },
      floatingPanels: [],
      unpinnedPanels: [],
      popoutPanels: [
        { panelId: 'p3', windowName: 'win1', x: 10, y: 20, width: 100, height: 100 },
        { panelId: 'p4', windowName: 'win2', x: 30, y: 40, width: 200, height: 200 },
      ],
      nextZIndex: 1000,
      activePaneId: 'p1',
    };
    const { state: restored } = deserialize({ version: 2, timestamp: 0, state: v2State });
    const p3 = restored.placements.get('p3');
    const p4 = restored.placements.get('p4');
    expect(p3!.type).toBe('floating');
    expect(p4!.type).toBe('floating');
    if (p3!.type === 'floating' && p4!.type === 'floating') {
      expect(p4!.zIndex).toBeGreaterThan(p3!.zIndex);
    }
  });
});

describe('deserialize error paths', () => {
  it('throws on non-object input', () => {
    expect(() => deserialize(null)).toThrow();
    expect(() => deserialize('string')).toThrow();
  });

  it('throws on unrecognized format (no version, no layout)', () => {
    expect(() => deserialize({ foo: 'bar' })).toThrow('Unrecognized layout format');
  });

  it('throws on invalid state structure (bad layout node)', () => {
    const data = {
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
    };
    expect(() => deserialize(data)).toThrow('Invalid layout structure');
  });
});
