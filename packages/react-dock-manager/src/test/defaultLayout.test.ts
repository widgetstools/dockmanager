import { describe, it, expect } from 'vitest';
import { defaultState } from '../config/defaultLayout';
import type { SplitNode, TabGroupNode } from '@widgetstools/dock-manager-core';

describe('defaultLayout', () => {
  it('should have required panel configs', () => {
    const requiredPanels = [
      'content1', 'content3', 'content5',
      'tab1', 'tab2',
      'doc1', 'doc2',
      'floating1',
      'unpinned1', 'unpinned2',
    ];

    for (const panelId of requiredPanels) {
      expect(defaultState.panels[panelId]).toBeDefined();
      expect(defaultState.panels[panelId].id).toBe(panelId);
      expect(typeof defaultState.panels[panelId].title).toBe('string');
    }
  });

  it('should have valid panel configs', () => {
    for (const [id, panel] of Object.entries(defaultState.panels)) {
      expect(panel.id).toBe(id);
      expect(panel.title).toBeTruthy();
      expect(typeof panel.closable).toBe('boolean');
      expect(typeof panel.floatable).toBe('boolean');
    }
  });

  it('should have valid root layout structure', () => {
    expect(defaultState.layout.type).toBe('split');
    expect((defaultState.layout as SplitNode).direction).toBe('horizontal');
    expect((defaultState.layout as SplitNode).children.length).toBe(3);
  });

  it('should have correct sizes summing to 100', () => {
    const rootSplit = defaultState.layout as SplitNode;
    const totalSize = rootSplit.sizes.reduce((a, b) => a + b, 0);
    expect(totalSize).toBeCloseTo(100, 1);
  });

  it('should have valid left panel', () => {
    const rootSplit = defaultState.layout as SplitNode;
    const leftPanel = rootSplit.children[0] as TabGroupNode;

    expect(leftPanel.type).toBe('tabgroup');
    expect(leftPanel.id).toBe('tg_left');
    expect(leftPanel.panels).toContain('content1');
    expect(leftPanel.activePanel).toBe('content1');
  });

  it('should have valid center panel with nested split', () => {
    const rootSplit = defaultState.layout as SplitNode;
    const centerSplit = rootSplit.children[1] as SplitNode;

    expect(centerSplit.type).toBe('split');
    expect(centerSplit.id).toBe('center_split');
    expect(centerSplit.direction).toBe('vertical');
    expect(centerSplit.children.length).toBe(2);

    const topTabGroup = centerSplit.children[0] as TabGroupNode;
    expect(topTabGroup.type).toBe('tabgroup');
    expect(topTabGroup.id).toBe('tg_center');
    expect(topTabGroup.panels).toEqual(['doc1', 'doc2']);
    expect(topTabGroup.activePanel).toBe('doc1');

    const bottomTabGroup = centerSplit.children[1] as TabGroupNode;
    expect(bottomTabGroup.type).toBe('tabgroup');
    expect(bottomTabGroup.id).toBe('tg_bottom');
    expect(bottomTabGroup.panels).toEqual(['content5']);
    expect(bottomTabGroup.activePanel).toBe('content5');
  });

  it('should have valid right panel with nested split', () => {
    const rootSplit = defaultState.layout as SplitNode;
    const rightSplit = rootSplit.children[2] as SplitNode;

    expect(rightSplit.type).toBe('split');
    expect(rightSplit.id).toBe('right_split');
    expect(rightSplit.direction).toBe('vertical');
    expect(rightSplit.children.length).toBe(2);

    const topTabGroup = rightSplit.children[0] as TabGroupNode;
    expect(topTabGroup.type).toBe('tabgroup');
    expect(topTabGroup.id).toBe('tg_right_top');
    expect(topTabGroup.panels).toEqual(['content3']);
    expect(topTabGroup.activePanel).toBe('content3');

    const bottomTabGroup = rightSplit.children[1] as TabGroupNode;
    expect(bottomTabGroup.type).toBe('tabgroup');
    expect(bottomTabGroup.id).toBe('tg_right_bottom');
    expect(bottomTabGroup.panels).toEqual(['tab1', 'tab2']);
    expect(bottomTabGroup.activePanel).toBe('tab1');
  });

  it('should have valid floating panels', () => {
    expect(defaultState.floatingPanels.length).toBe(1);

    const floating = defaultState.floatingPanels[0];
    expect(floating.panelId).toBe('floating1');
    expect(typeof floating.x).toBe('number');
    expect(typeof floating.y).toBe('number');
    expect(typeof floating.width).toBe('number');
    expect(typeof floating.height).toBe('number');
    expect(typeof floating.zIndex).toBe('number');
  });

  it('should have valid unpinned panels', () => {
    expect(defaultState.unpinnedPanels.length).toBe(2);

    const unpinned1 = defaultState.unpinnedPanels[0];
    expect(unpinned1.panelId).toBe('unpinned1');
    expect(unpinned1.edge).toBe('left');
    expect(typeof unpinned1.size).toBe('number');

    const unpinned2 = defaultState.unpinnedPanels[1];
    expect(unpinned2.panelId).toBe('unpinned2');
    expect(unpinned2.edge).toBe('bottom');
    expect(typeof unpinned2.size).toBe('number');
  });

  it('should have valid nextZIndex', () => {
    expect(typeof defaultState.nextZIndex).toBe('number');
    expect(defaultState.nextZIndex).toBeGreaterThan(0);
  });

  it('should have all layout panels referenced in panels record', () => {
    const layoutPanels = new Set<string>();

    function collectPanels(node: any) {
      if (node.type === 'tabgroup') {
        node.panels.forEach((p: string) => layoutPanels.add(p));
      } else {
        node.children.forEach(collectPanels);
      }
    }

    collectPanels(defaultState.layout);

    for (const panelId of layoutPanels) {
      expect(defaultState.panels[panelId]).toBeDefined();
    }
  });

  it('should have all floating panels referenced in panels record', () => {
    for (const fp of defaultState.floatingPanels) {
      expect(defaultState.panels[fp.panelId]).toBeDefined();
    }
  });

  it('should have all unpinned panels referenced in panels record', () => {
    for (const up of defaultState.unpinnedPanels) {
      expect(defaultState.panels[up.panelId]).toBeDefined();
    }
  });

  it('should have default state as valid DockManagerState', () => {
    expect(defaultState.layout).toBeDefined();
    expect(defaultState.panels).toBeDefined();
    expect(Array.isArray(defaultState.floatingPanels)).toBe(true);
    expect(Array.isArray(defaultState.unpinnedPanels)).toBe(true);
    expect(typeof defaultState.nextZIndex).toBe('number');
  });

  it('should have nested splits with valid sizes', () => {
    const rootSplit = defaultState.layout as SplitNode;

    const centerSplit = rootSplit.children[1] as SplitNode;
    const centerTotal = centerSplit.sizes.reduce((a, b) => a + b, 0);
    expect(centerTotal).toBeCloseTo(100, 1);

    const rightSplit = rootSplit.children[2] as SplitNode;
    const rightTotal = rightSplit.sizes.reduce((a, b) => a + b, 0);
    expect(rightTotal).toBeCloseTo(100, 1);
  });

  it('should have all tab groups with valid activePanel', () => {
    function validateTabGroups(node: any) {
      if (node.type === 'tabgroup') {
        expect(node.activePanel).toBeDefined();
        expect(node.panels.includes(node.activePanel)).toBe(true);
      } else {
        node.children.forEach(validateTabGroups);
      }
    }

    validateTabGroups(defaultState.layout);
  });

  it('should have meaningful panel titles', () => {
    for (const panel of Object.values(defaultState.panels)) {
      expect(panel.title.length).toBeGreaterThan(0);
    }
  });
});
