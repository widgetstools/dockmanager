import type {
  DockManagerState,
  LayoutNode,
  PanelConfig,
  Placement,
  FloatingPanel,
  UnpinnedPanel,
  PopoutPanel,
} from '../types/dock';
import { collectLayoutPanelIds } from '../layout/LayoutTree';

// ─── Versioned serialization format ─────────────────────────────────

export interface SerializedDockLayout {
  version: number;
  layout: LayoutNode;
  panels: Record<string, PanelConfig>;
  placements: Record<string, Placement>;
  activePaneId: string;
  nextZIndex: number;
  maximizedPanelId?: string;
}

// ─── Layout tree helpers ────────────────────────────────────────────

/** Walk layout tree and return a map of panelId → groupId for all docked panels */
function collectDockedPlacements(node: LayoutNode): Map<string, string> {
  const result = new Map<string, string>();
  if (node.type === 'tabgroup') {
    for (const panelId of node.panels) {
      result.set(panelId, node.id);
    }
  } else {
    for (const child of node.children) {
      for (const [panelId, groupId] of collectDockedPlacements(child)) {
        result.set(panelId, groupId);
      }
    }
  }
  return result;
}

// ─── Validation ─────────────────────────────────────────────────────

function isValidLayoutNode(node: any): node is LayoutNode {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'tabgroup') {
    return (
      typeof node.id === 'string' &&
      Array.isArray(node.panels) &&
      node.panels.every((p: any) => typeof p === 'string') &&
      typeof node.activePanel === 'string'
    );
  }
  if (node.type === 'split') {
    return (
      typeof node.id === 'string' &&
      (node.direction === 'horizontal' || node.direction === 'vertical') &&
      Array.isArray(node.children) &&
      node.children.every(isValidLayoutNode) &&
      Array.isArray(node.sizes) &&
      node.sizes.every((s: any) => typeof s === 'number')
    );
  }
  return false;
}

// ─── Integrity check ────────────────────────────────────────────────

/** Validate integrity of a dock manager state, returning warnings */
export function validateIntegrity(state: DockManagerState): string[] {
  const warnings: string[] = [];
  const knownPanelIds = new Set(state.panels.keys());
  const placementIds = new Set(state.placements.keys());

  // Check that every placed panel has a config
  for (const id of placementIds) {
    if (!knownPanelIds.has(id)) {
      warnings.push(`Panel "${id}" is referenced in placements but has no config in panels map`);
    }
  }

  // Check that every panel in layout exists in panels map
  const layoutIds = collectLayoutPanelIds(state.layout);
  for (const id of layoutIds) {
    if (!knownPanelIds.has(id)) {
      warnings.push(`Panel "${id}" is referenced in layout but has no config in panels map`);
    }
  }

  // Check for duplicate placements (panel in layout AND in placements as non-docked)
  const seen = new Set<string>();
  for (const id of [...layoutIds, ...placementIds]) {
    if (seen.has(id)) {
      // Only warn if it's not a docked placement matching layout
      const placement = state.placements.get(id);
      if (placement && placement.type !== 'docked') {
        warnings.push(`Panel "${id}" appears in multiple placements`);
      }
    }
    seen.add(id);
  }

  // Check maximizedPanelId references a valid panel
  if (state.maximizedPanelId && !knownPanelIds.has(state.maximizedPanelId)) {
    warnings.push(`maximizedPanelId "${state.maximizedPanelId}" does not exist in panels`);
  }

  return warnings;
}

// ─── Serialization ──────────────────────────────────────────────────

/** Serialize dock manager state to a SerializedDockLayout object */
export function serialize(state: DockManagerState): SerializedDockLayout {
  const panels: Record<string, PanelConfig> = {};
  for (const [id, config] of state.panels) {
    panels[id] = config;
  }

  const placements: Record<string, Placement> = {};
  for (const [id, placement] of state.placements) {
    placements[id] = placement;
  }

  const result: SerializedDockLayout = {
    version: 3,
    layout: state.layout,
    panels,
    placements,
    activePaneId: state.activePaneId,
    nextZIndex: state.nextZIndex,
  };

  if (state.maximizedPanelId !== undefined) {
    result.maximizedPanelId = state.maximizedPanelId;
  }

  return result;
}

// ─── Deserialization ────────────────────────────────────────────────

/** Deserialize any supported format (v1, v2, v3) into DockManagerState */
export function deserialize(data: any): DockManagerState {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data: expected an object');
  }

  // v3 format: has placements map directly
  if (data.version === 3) {
    return deserializeV3(data);
  }

  // v1/v2 format: has version + state wrapper, or raw layout+panels
  if ((data.version === 1 || data.version === 2) && data.state) {
    return deserializeV1V2(data.state);
  }

  // Legacy: raw state object with layout + panels (no version wrapper)
  if (data.layout && data.panels) {
    // Could be a v3 without version (unlikely) or legacy v1/v2 raw
    if (data.placements && typeof data.placements === 'object' && !Array.isArray(data.placements)) {
      // Looks like a v3 without version field
      return deserializeV3({ ...data, version: 3 });
    }
    return deserializeV1V2(data);
  }

  throw new Error('Unrecognized layout format: missing version or layout/panels fields');
}

function deserializeV3(data: any): DockManagerState {
  if (!isValidLayoutNode(data.layout)) {
    throw new Error('Invalid layout structure in v3 data');
  }

  const panels = new Map<string, PanelConfig>();
  if (data.panels && typeof data.panels === 'object') {
    for (const [id, config] of Object.entries(data.panels)) {
      panels.set(id, config as PanelConfig);
    }
  }

  const placements = new Map<string, Placement>();
  if (data.placements && typeof data.placements === 'object') {
    for (const [id, placement] of Object.entries(data.placements)) {
      placements.set(id, placement as Placement);
    }
  }

  return {
    layout: data.layout,
    panels,
    placements,
    activePaneId: data.activePaneId || '',
    nextZIndex: typeof data.nextZIndex === 'number' ? data.nextZIndex : 1000,
    maximizedPanelId: data.maximizedPanelId,
  };
}

function deserializeV1V2(stateData: any): DockManagerState {
  if (!isValidLayoutNode(stateData.layout)) {
    throw new Error('Invalid layout structure in v1/v2 data');
  }

  // Convert panels Record to Map
  const panels = new Map<string, PanelConfig>();
  if (stateData.panels && typeof stateData.panels === 'object') {
    for (const [id, config] of Object.entries(stateData.panels)) {
      panels.set(id, config as PanelConfig);
    }
  }

  // Build placements map
  const placements = new Map<string, Placement>();

  // 1. Walk layout tree to find docked panels
  const dockedPanels = collectDockedPlacements(stateData.layout);
  for (const [panelId, groupId] of dockedPanels) {
    placements.set(panelId, { type: 'docked', groupId });
  }

  // 2. Convert floatingPanels[]
  const floatingPanels: FloatingPanel[] = stateData.floatingPanels || [];
  for (const fp of floatingPanels) {
    placements.set(fp.panelId, {
      type: 'floating',
      x: fp.x,
      y: fp.y,
      width: fp.width,
      height: fp.height,
      zIndex: fp.zIndex,
      sourceGroupId: fp.sourceTabGroupId,
    });
    // Add stub config if missing
    if (!panels.has(fp.panelId)) {
      panels.set(fp.panelId, { id: fp.panelId, title: fp.panelId });
    }
  }

  // 3. Convert unpinnedPanels[]
  const unpinnedPanels: UnpinnedPanel[] = stateData.unpinnedPanels || [];
  for (const up of unpinnedPanels) {
    placements.set(up.panelId, {
      type: 'unpinned',
      edge: up.edge,
      size: up.size,
      sourceGroupId: up.sourceTabGroupId,
    });
    if (!panels.has(up.panelId)) {
      panels.set(up.panelId, { id: up.panelId, title: up.panelId });
    }
  }

  // 4. Convert popoutPanels[] → floating (can't restore OS windows)
  const popoutPanels: PopoutPanel[] = stateData.popoutPanels || [];
  let nextZIndex = typeof stateData.nextZIndex === 'number' ? stateData.nextZIndex : 1000;
  for (const pp of popoutPanels) {
    placements.set(pp.panelId, {
      type: 'floating',
      x: pp.x,
      y: pp.y,
      width: pp.width,
      height: pp.height,
      zIndex: nextZIndex++,
    });
    if (!panels.has(pp.panelId)) {
      panels.set(pp.panelId, { id: pp.panelId, title: pp.panelId });
    }
  }

  return {
    layout: stateData.layout,
    panels,
    placements,
    activePaneId: stateData.activePaneId || '',
    nextZIndex,
    maximizedPanelId: stateData.maximizedPanelId,
  };
}

// ─── Local Storage helpers ──────────────────────────────────────────

export function saveToLocalStorage(key: string, state: DockManagerState): void {
  try {
    const json = JSON.stringify(serialize(state));
    localStorage.setItem(key, json);
  } catch (e) {
    console.warn('Failed to save dock layout to localStorage:', e);
  }
}

export function loadFromLocalStorage(key: string): DockManagerState | null {
  try {
    const json = localStorage.getItem(key);
    if (!json) return null;
    const parsed = JSON.parse(json);
    return deserialize(parsed);
  } catch (e) {
    console.warn('Failed to load dock layout from localStorage:', e);
    return null;
  }
}

export function clearLocalStorage(key: string): void {
  localStorage.removeItem(key);
}

// ─── File export/import helpers ─────────────────────────────────────

/** Export the state as a pretty-printed JSON string */
export function exportToFile(state: DockManagerState): string {
  return JSON.stringify(serialize(state), null, 2);
}

/** Import state from a JSON string */
export function importFromFile(json: string): DockManagerState {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON: unable to parse layout data');
  }
  return deserialize(parsed);
}

// ─── URL encoding helpers ───────────────────────────────────────────

/** Export the state as a base64 URL-safe string */
export function exportAsUrl(state: DockManagerState): string {
  const json = JSON.stringify(serialize(state));
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(json)));
  }
  return Buffer.from(json, 'utf-8').toString('base64');
}

/** Import state from a base64 URL-safe string */
export function importFromUrl(urlString: string): DockManagerState {
  let json: string;
  if (typeof atob === 'function') {
    json = decodeURIComponent(escape(atob(urlString)));
  } else {
    json = Buffer.from(urlString, 'base64').toString('utf-8');
  }
  const parsed = JSON.parse(json);
  return deserialize(parsed);
}
