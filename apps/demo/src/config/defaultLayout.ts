import type { DockManagerState } from '@widgetstools/dock-manager-core';

/**
 * Default layout matching the Infragistics Dock Manager demo:
 *
 * ┌─┬─────────────┬────────────────┐
 * │U│ Content      │ Tab 2 (active) │ ← header on top, blue underline
 * │n│ Pane 1       │ Content 7      │
 * │p│              │                │
 * │i│ [Floating    │                │
 * │n│  Pane]       │ Tab 1 | Tab 2▼ │ ← tabs at bottom
 * │n│              ├────────────────┤
 * │e│ Document 1 × │ Content Pane 2 │
 * │d│ Document 2   │ Content 8      │
 * │ │ Content 3    │                │
 * │1│              │                │
 * ├─┴─────────────┴────────────────┤
 * │        Unpinned Pane 2          │ ← bottom auto-hide strip
 * └────────────────────────────────┘
 */
export const defaultState: DockManagerState = {
  panels: {
    // Left: File Tree (Explorer)
    explorer: {
      id: 'explorer',
      title: 'Explorer',
      icon: 'folder',
      closable: true,
      floatable: true,
      allowMaximize: true,
      allowPinning: true,
      widgetType: 'file-tree',
    },
    // Center: Document 1 (Editor)
    doc1: {
      id: 'doc1',
      title: 'Document 1',
      icon: 'file',
      closable: true,
      floatable: true,
      allowMaximize: true,
      widgetType: 'editor',
      widgetProps: { language: 'ts' },
    },
    // Center: Document 2 (Editor)
    doc2: {
      id: 'doc2',
      title: 'Document 2',
      icon: 'file',
      closable: true,
      floatable: true,
      allowMaximize: true,
      widgetType: 'editor',
      widgetProps: { language: 'css' },
    },
    // Right top: Clock (part of bottom-tabs group)
    tab1: {
      id: 'tab1',
      title: 'Clock',
      icon: 'clock',
      closable: true,
      floatable: true,
      allowMaximize: true,
      allowPinning: true,
      widgetType: 'clock',
    },
    // Right top: Properties (part of bottom-tabs group)
    tab2: {
      id: 'tab2',
      title: 'Properties',
      closable: true,
      floatable: true,
      allowMaximize: true,
      allowPinning: true,
      widgetType: 'placeholder',
      widgetProps: { label: 'Properties panel' },
    },
    // Right bottom: Problems
    contentPane2: {
      id: 'contentPane2',
      title: 'Problems',
      icon: 'alert',
      closable: true,
      floatable: true,
      allowMaximize: true,
      allowPinning: true,
      widgetType: 'problems',
    },
    // Floating pane: Clock
    floatingPane: {
      id: 'floatingPane',
      title: 'Floating Clock',
      icon: 'clock',
      closable: true,
      floatable: true,
      allowMaximize: true,
      widgetType: 'clock',
    },
    // Unpinned Pane 1 (left edge auto-hide): Terminal
    unpinnedPane1: {
      id: 'unpinnedPane1',
      title: 'Terminal',
      icon: 'terminal',
      closable: true,
      floatable: true,
      allowPinning: true,
      widgetType: 'terminal',
    },
    // Unpinned Pane 2 (bottom edge auto-hide)
    unpinnedPane2: {
      id: 'unpinnedPane2',
      title: 'Output',
      icon: 'scroll',
      closable: true,
      floatable: true,
      allowPinning: true,
      widgetType: 'placeholder',
      widgetProps: { label: 'Output panel' },
    },
  },
  layout: {
    type: 'split',
    id: 'root_split',
    direction: 'horizontal',
    sizes: [25, 45, 30],
    children: [
      // Left: Content Pane 1 (single panel, no tabs)
      {
        type: 'tabgroup',
        id: 'tg_left',
        panels: ['explorer'],
        activePanel: 'explorer',
      },
      // Center: Document Host (Document 1, Document 2)
      {
        type: 'tabgroup',
        id: 'tg_center',
        panels: ['doc1', 'doc2'],
        activePanel: 'doc1',
      },
      // Right: vertical split — top has tabs-at-bottom, bottom has Content Pane 2
      {
        type: 'split',
        id: 'right_split',
        direction: 'vertical',
        sizes: [60, 40],
        children: [
          // Right top: Tab 1 + Tab 2 with tabs at bottom, Tab 2 is active
          {
            type: 'tabgroup',
            id: 'tg_right_top',
            panels: ['tab1', 'tab2'],
            activePanel: 'tab2',
            headerPosition: 'bottom',
          },
          // Right bottom: Content Pane 2 (single panel)
          {
            type: 'tabgroup',
            id: 'tg_right_bottom',
            panels: ['contentPane2'],
            activePanel: 'contentPane2',
          },
        ],
      },
    ],
  },
  floatingPanels: [
    {
      panelId: 'floatingPane',
      x: 300,
      y: 200,
      width: 300,
      height: 200,
      zIndex: 1,
    },
  ],
  popoutPanels: [],
  unpinnedPanels: [
    { panelId: 'unpinnedPane1', edge: 'left', size: 200 },
    { panelId: 'unpinnedPane2', edge: 'bottom', size: 180 },
  ],
  nextZIndex: 2,
  activePaneId: 'tab2',
};
