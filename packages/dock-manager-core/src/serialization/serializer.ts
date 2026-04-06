import type { DockManagerState, LayoutNode, PanelConfig } from '../types/dock';
import { collectLayoutPanelIds } from '../layout/LayoutTree';

// ─── Versioned serialization format ─────────────────────────────────

export interface SerializedDockLayout {
  version: 1 | 2;
  timestamp: number;
  state: DockManagerState;
  /** Layout format version for forward compatibility. Added in v2. */
  layoutVersion?: number;
}

// ─── Validation ─────────────────────────────────────────────────────

function isValidLayoutNode(node: any): node is LayoutNode {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'tabgroup') {
    return (
      typeof node.id === 'string' &&
      Array.isArray(node.panels) &&
      node.panels.every((p: any) => typeof p === 'string') &&
      typeof node.activePanel === 'string' &&
      (node.headerCollapsed === undefined || typeof node.headerCollapsed === 'boolean')
      // headerPosition is optional — no validation needed
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

function isValidPanelConfig(panel: any): panel is PanelConfig {
  return (
    panel &&
    typeof panel === 'object' &&
    typeof panel.id === 'string' &&
    typeof panel.title === 'string'
  );
}

function isValidDockState(data: any): data is DockManagerState {
  if (!data || typeof data !== 'object') return false;
  if (!isValidLayoutNode(data.layout)) return false;

  if (!data.panels || typeof data.panels !== 'object') return false;
  for (const key of Object.keys(data.panels)) {
    if (!isValidPanelConfig(data.panels[key])) return false;
  }

  if (!Array.isArray(data.floatingPanels)) return false;
  for (const fp of data.floatingPanels) {
    if (
      typeof fp.panelId !== 'string' ||
      typeof fp.x !== 'number' ||
      typeof fp.y !== 'number' ||
      typeof fp.width !== 'number' ||
      typeof fp.height !== 'number'
    ) {
      return false;
    }
  }

  if (!Array.isArray(data.unpinnedPanels)) return false;
  for (const up of data.unpinnedPanels) {
    if (
      typeof up.panelId !== 'string' ||
      !['left', 'right', 'bottom'].includes(up.edge) ||
      typeof up.size !== 'number'
    ) {
      return false;
    }
  }

  // popoutPanels is optional for backward compat
  if (data.popoutPanels !== undefined) {
    if (!Array.isArray(data.popoutPanels)) return false;
    for (const pp of data.popoutPanels) {
      if (
        typeof pp.panelId !== 'string' ||
        typeof pp.windowName !== 'string' ||
        typeof pp.x !== 'number' ||
        typeof pp.y !== 'number' ||
        typeof pp.width !== 'number' ||
        typeof pp.height !== 'number'
      ) {
        return false;
      }
    }
  }

  if (typeof data.nextZIndex !== 'number') return false;
  // maximizedPanelId is optional
  if (data.maximizedPanelId !== undefined && typeof data.maximizedPanelId !== 'string') return false;
  return true;
}

// ─── Integrity check ────────────────────────────────────────────────

/** Validate integrity of a dock manager state, returning warnings */
export function validateIntegrity(state: DockManagerState): string[] {
  const warnings: string[] = [];
  const knownPanelIds = new Set(Object.keys(state.panels));
  const layoutIds = collectLayoutPanelIds(state.layout);
  const floatingIds = new Set(state.floatingPanels.map((f) => f.panelId));
  const unpinnedIds = new Set(state.unpinnedPanels.map((u) => u.panelId));
  const popoutIds = new Set((state.popoutPanels || []).map((p) => p.panelId));

  for (const id of [...layoutIds, ...floatingIds, ...unpinnedIds, ...popoutIds]) {
    if (!knownPanelIds.has(id)) {
      warnings.push(`Panel "${id}" is referenced in layout but has no config in panels record`);
    }
  }

  const allPlaced = [...layoutIds, ...floatingIds, ...unpinnedIds, ...popoutIds];
  const seen = new Set<string>();
  for (const id of allPlaced) {
    if (seen.has(id)) {
      warnings.push(`Panel "${id}" appears in multiple placements (layout/floating/unpinned/popout)`);
    }
    seen.add(id);
  }

  // Check maximizedPanelId references a valid panel
  if (state.maximizedPanelId && !knownPanelIds.has(state.maximizedPanelId)) {
    warnings.push(`maximizedPanelId "${state.maximizedPanelId}" does not exist in panels`);
  }

  return warnings;
}

// ─── Normalization ──────────────────────────────────────────────────

/** Normalize state for backward compatibility and convert popouts to floating */
function normalizeState(data: any): DockManagerState {
  const state = { ...data } as DockManagerState;

  // Default popoutPanels to empty array
  if (!state.popoutPanels) {
    state.popoutPanels = [];
  }

  // Default activePaneId
  if (!state.activePaneId) {
    state.activePaneId = '';
  }

  // On deserialize, convert popout panels to floating panels
  // because we can't restore OS-level windows from serialized state
  if (state.popoutPanels.length > 0) {
    for (const popout of state.popoutPanels) {
      state.floatingPanels.push({
        panelId: popout.panelId,
        x: popout.x,
        y: popout.y,
        width: popout.width,
        height: popout.height,
        zIndex: state.nextZIndex++,
      });
    }
    state.popoutPanels = [];
  }

  return state;
}

// ─── Serialization / Deserialization ────────────────────────────────

/** Serialize dock manager state to JSON string */
export function serialize(state: DockManagerState): string {
  const payload: SerializedDockLayout = {
    version: 2,
    timestamp: Date.now(),
    state,
    layoutVersion: 1,
  };
  return JSON.stringify(payload, null, 2);
}

/** Export the state as a base64 URL-safe string. */
export function exportAsUrl(state: DockManagerState): string {
  const json = JSON.stringify(state);
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(json)));
  }
  return Buffer.from(json, 'utf-8').toString('base64');
}

/** Import state from a base64 URL-safe string. */
export function importFromUrl(urlString: string): DockManagerState {
  let json: string;
  if (typeof atob === 'function') {
    json = decodeURIComponent(escape(atob(urlString)));
  } else {
    json = Buffer.from(urlString, 'base64').toString('utf-8');
  }
  return JSON.parse(json) as DockManagerState;
}

/** Deserialize dock manager state from JSON string */
export function deserialize(json: string): {
  state: DockManagerState;
  warnings: string[];
} {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON: unable to parse layout data');
  }

  let stateData: any;
  if ((parsed.version === 1 || parsed.version === 2) && parsed.state) {
    stateData = parsed.state;
  } else if (parsed.layout && parsed.panels) {
    stateData = parsed;
  } else {
    throw new Error('Unrecognized layout format: missing version or layout/panels fields');
  }

  if (!isValidDockState(stateData)) {
    throw new Error(
      'Invalid layout structure: validation failed. Check layout tree, panels, and floating/unpinned arrays.',
    );
  }

  // Normalize: handle backward compat and convert popouts to floating
  const normalizedState = normalizeState(stateData);

  const warnings = validateIntegrity(normalizedState);
  return { state: normalizedState, warnings };
}

// ─── Local Storage helpers ──────────────────────────────────────────

const STORAGE_KEY = 'dock-manager-layout';

export function saveToLocalStorage(state: DockManagerState): void {
  try {
    const json = serialize(state);
    localStorage.setItem(STORAGE_KEY, json);
  } catch (e) {
    console.warn('Failed to save dock layout to localStorage:', e);
  }
}

export function loadFromLocalStorage(): {
  state: DockManagerState;
  warnings: string[];
} | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return null;
    return deserialize(json);
  } catch (e) {
    console.warn('Failed to load dock layout from localStorage:', e);
    return null;
  }
}

export function clearLocalStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── File export/import helpers ─────────────────────────────────────

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
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function importFromFile(): Promise<{
  state: DockManagerState;
  warnings: string[];
}> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const result = deserialize(reader.result as string);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    };
    input.click();
  });
}
