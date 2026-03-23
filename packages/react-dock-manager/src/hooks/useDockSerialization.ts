import type { DockManagerState, LayoutNode, PanelConfig } from '@widgetstools/dock-manager-core';

// ─── Versioned serialization format ─────────────────────────────────
export interface SerializedDockLayout {
  version: 1;
  timestamp: number;
  state: DockManagerState;
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

  // Validate layout tree
  if (!isValidLayoutNode(data.layout)) return false;

  // Validate panels record
  if (!data.panels || typeof data.panels !== 'object') return false;
  for (const key of Object.keys(data.panels)) {
    if (!isValidPanelConfig(data.panels[key])) return false;
  }

  // Validate floating panels
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

  // Validate unpinned panels
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

  if (typeof data.nextZIndex !== 'number') return false;

  return true;
}

// ─── Integrity check: ensure all referenced panel IDs exist ─────────

function collectLayoutPanelIds(node: LayoutNode): Set<string> {
  const ids = new Set<string>();
  if (node.type === 'tabgroup') {
    node.panels.forEach((id) => ids.add(id));
  } else {
    node.children.forEach((child) => {
      collectLayoutPanelIds(child).forEach((id) => ids.add(id));
    });
  }
  return ids;
}

function validateIntegrity(state: DockManagerState): string[] {
  const warnings: string[] = [];
  const knownPanelIds = new Set(Object.keys(state.panels));

  // Collect all referenced IDs
  const layoutIds = collectLayoutPanelIds(state.layout);
  const floatingIds = new Set(state.floatingPanels.map((f) => f.panelId));
  const unpinnedIds = new Set(state.unpinnedPanels.map((u) => u.panelId));

  // Check for missing panel configs
  for (const id of [...layoutIds, ...floatingIds, ...unpinnedIds]) {
    if (!knownPanelIds.has(id)) {
      warnings.push(`Panel "${id}" is referenced in layout but has no config in panels record`);
    }
  }

  // Check for duplicate placements
  const allPlaced = [...layoutIds, ...floatingIds, ...unpinnedIds];
  const seen = new Set<string>();
  for (const id of allPlaced) {
    if (seen.has(id)) {
      warnings.push(`Panel "${id}" appears in multiple placements (layout/floating/unpinned)`);
    }
    seen.add(id);
  }

  return warnings;
}

// ─── Serialization / Deserialization functions ──────────────────────

export function serialize(state: DockManagerState): string {
  const payload: SerializedDockLayout = {
    version: 1,
    timestamp: Date.now(),
    state,
  };
  return JSON.stringify(payload, null, 2);
}

export function deserialize(json: string): {
  state: DockManagerState;
  warnings: string[];
} {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error('Invalid JSON: unable to parse layout data');
  }

  // Handle both wrapped (versioned) and raw state formats
  let stateData: any;
  if (parsed.version === 1 && parsed.state) {
    stateData = parsed.state;
  } else if (parsed.layout && parsed.panels) {
    // Raw DockManagerState (no version wrapper)
    stateData = parsed;
  } else {
    throw new Error('Unrecognized layout format: missing version or layout/panels fields');
  }

  if (!isValidDockState(stateData)) {
    throw new Error('Invalid layout structure: validation failed. Check layout tree, panels, and floating/unpinned arrays.');
  }

  const warnings = validateIntegrity(stateData);

  return { state: stateData, warnings };
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
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `dock-layout-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

// ─── React hook ─────────────────────────────────────────────────────

export function useDockSerialization() {
  return {
    serialize,
    deserialize,
    saveToLocalStorage,
    loadFromLocalStorage,
    clearLocalStorage,
    exportToFile,
    importFromFile,
  };
}
