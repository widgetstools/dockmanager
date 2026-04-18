import type {
  DockManagerState, LayoutNode, PanelConfig, Placement,
  FloatingPanel, UnpinnedPanel, PopoutPanel,
} from '../types/dock';
import { collectLayoutPanelIds } from '../layout/LayoutTree';

export interface SerializedDockLayout {
  version: number;
  layout: LayoutNode;
  panels: Record<string, PanelConfig>;
  placements: Record<string, Placement>;
  activePaneId: string;
  nextZIndex: number;
  maximizedPanelId?: string;
}

function collectDockedPlacements(node: LayoutNode): Map<string, string> {
  const result = new Map<string, string>();
  if (node.type === 'tabgroup') {
    for (const panelId of node.panels) result.set(panelId, node.id);
  } else {
    for (const child of node.children)
      for (const [panelId, groupId] of collectDockedPlacements(child))
        result.set(panelId, groupId);
  }
  return result;
}

function isValidLayoutNode(node: any): node is LayoutNode {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'tabgroup') {
    return typeof node.id === 'string' && Array.isArray(node.panels)
      && node.panels.every((p: any) => typeof p === 'string')
      && typeof node.activePanel === 'string';
  }
  if (node.type === 'split') {
    return typeof node.id === 'string'
      && (node.direction === 'horizontal' || node.direction === 'vertical')
      && Array.isArray(node.children) && node.children.every(isValidLayoutNode)
      && Array.isArray(node.sizes) && node.sizes.every((s: any) => typeof s === 'number');
  }
  return false;
}

export function validateIntegrity(state: DockManagerState): string[] {
  const warnings: string[] = [];
  const knownPanelIds = new Set(state.panels.keys());
  const placementIds = new Set(state.placements.keys());
  for (const id of placementIds) {
    if (!knownPanelIds.has(id))
      warnings.push(`Panel "${id}" is referenced in placements but has no config in panels map`);
  }
  const layoutIds = collectLayoutPanelIds(state.layout);
  for (const id of layoutIds) {
    if (!knownPanelIds.has(id))
      warnings.push(`Panel "${id}" is referenced in layout but has no config in panels map`);
  }
  const seen = new Set<string>();
  for (const id of [...layoutIds, ...placementIds]) {
    if (seen.has(id)) {
      const placement = state.placements.get(id);
      if (placement && placement.type !== 'docked')
        warnings.push(`Panel "${id}" appears in multiple placements`);
    }
    seen.add(id);
  }
  if (state.maximizedPanelId && !knownPanelIds.has(state.maximizedPanelId))
    warnings.push(`maximizedPanelId "${state.maximizedPanelId}" does not exist in panels`);
  return warnings;
}

export function serialize(state: DockManagerState): string {
  return JSON.stringify(serializeToObject(state));
}

export function serializeToObject(state: DockManagerState): SerializedDockLayout {
  const panels: Record<string, PanelConfig> = {};
  for (const [id, config] of state.panels) panels[id] = config;
  const placements: Record<string, Placement> = {};
  for (const [id, placement] of state.placements) placements[id] = placement;
  return {
    version: 3, layout: state.layout, panels, placements,
    activePaneId: state.activePaneId, nextZIndex: state.nextZIndex,
    ...(state.maximizedPanelId !== undefined && { maximizedPanelId: state.maximizedPanelId }),
  };
}

export function deserialize(data: any): { state: DockManagerState; warnings: string[] } {
  let parsed = data;
  if (typeof data === 'string') {
    try { parsed = JSON.parse(data); }
    catch { throw new Error('Invalid JSON: unable to parse layout data'); }
  }
  const state = deserializeInner(parsed);
  return { state, warnings: validateIntegrity(state) };
}

function toMap<V>(obj: any): Map<string, V> {
  const m = new Map<string, V>();
  if (obj && typeof obj === 'object')
    for (const [k, v] of Object.entries(obj)) m.set(k, v as V);
  return m;
}

function deserializeInner(data: any): DockManagerState {
  if (!data || typeof data !== 'object') throw new Error('Invalid data: expected an object');
  if (data.version === 3) return deserializeV3(data);
  if ((data.version === 1 || data.version === 2) && data.state) return deserializeV1V2(data.state);
  if (data.layout && data.panels) {
    if (data.placements && typeof data.placements === 'object' && !Array.isArray(data.placements))
      return deserializeV3({ ...data, version: 3 });
    return deserializeV1V2(data);
  }
  throw new Error('Unrecognized layout format: missing version or layout/panels fields');
}

function deserializeV3(data: any): DockManagerState {
  if (!isValidLayoutNode(data.layout)) throw new Error('Invalid layout structure in v3 data');
  return {
    layout: data.layout,
    panels: toMap<PanelConfig>(data.panels),
    placements: toMap<Placement>(data.placements),
    activePaneId: data.activePaneId || '',
    nextZIndex: typeof data.nextZIndex === 'number' ? data.nextZIndex : 1000,
    maximizedPanelId: data.maximizedPanelId,
  };
}

function deserializeV1V2(stateData: any): DockManagerState {
  if (!isValidLayoutNode(stateData.layout)) throw new Error('Invalid layout structure in v1/v2 data');
  const panels = toMap<PanelConfig>(stateData.panels);
  const placements = new Map<string, Placement>();
  for (const [panelId, groupId] of collectDockedPlacements(stateData.layout))
    placements.set(panelId, { type: 'docked', groupId });
  const ensurePanel = (id: string) => { if (!panels.has(id)) panels.set(id, { id, title: id }); };
  for (const fp of (stateData.floatingPanels || []) as FloatingPanel[]) {
    placements.set(fp.panelId, {
      type: 'floating', x: fp.x, y: fp.y, width: fp.width, height: fp.height,
      zIndex: fp.zIndex, sourceGroupId: fp.sourceTabGroupId,
    });
    ensurePanel(fp.panelId);
  }
  for (const up of (stateData.unpinnedPanels || []) as UnpinnedPanel[]) {
    placements.set(up.panelId, { type: 'unpinned', edge: up.edge, size: up.size, sourceGroupId: up.sourceTabGroupId });
    ensurePanel(up.panelId);
  }
  let nextZIndex = typeof stateData.nextZIndex === 'number' ? stateData.nextZIndex : 1000;
  for (const pp of (stateData.popoutPanels || []) as PopoutPanel[]) {
    placements.set(pp.panelId, {
      type: 'floating', x: pp.x, y: pp.y, width: pp.width, height: pp.height, zIndex: nextZIndex++,
    });
    ensurePanel(pp.panelId);
  }
  return {
    layout: stateData.layout, panels, placements,
    activePaneId: stateData.activePaneId || '', nextZIndex,
    maximizedPanelId: stateData.maximizedPanelId,
  };
}

const STORAGE_KEY = 'dock-manager-layout';

export function saveToLocalStorage(state: DockManagerState, key?: string): void {
  try { localStorage.setItem(key || STORAGE_KEY, serialize(state)); }
  catch (e) { console.warn('Failed to save dock layout to localStorage:', e); }
}

export function loadFromLocalStorage(key?: string): { state: DockManagerState; warnings: string[] } | null {
  try {
    const json = localStorage.getItem(key || STORAGE_KEY);
    return json ? deserialize(json) : null;
  } catch (e) { console.warn('Failed to load dock layout from localStorage:', e); return null; }
}

export function clearLocalStorage(key?: string): void {
  localStorage.removeItem(key || STORAGE_KEY);
}

export function exportToFile(state: DockManagerState, filename?: string): void {
  const json = serialize(state);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `dock-layout-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally { URL.revokeObjectURL(url); }
}

export function importFromFile(): Promise<{ state: DockManagerState; warnings: string[] }> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) { reject(new Error('No file selected')); return; }
      const reader = new FileReader();
      reader.onload = () => { try { resolve(deserialize(reader.result as string)); } catch (err) { reject(err); } };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    };
    input.click();
  });
}

export function exportAsUrl(state: DockManagerState): string {
  const json = serialize(state);
  return typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json, 'utf-8').toString('base64');
}

export function importFromUrl(urlString: string): { state: DockManagerState; warnings: string[] } {
  const json = typeof atob === 'function'
    ? decodeURIComponent(escape(atob(urlString)))
    : Buffer.from(urlString, 'base64').toString('utf-8');
  return deserialize(json);
}
