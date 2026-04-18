import type { DockManagerState } from '@widgetstools/dock-manager-core';

/**
 * Default layout matching the Infragistics Dock Manager demo:
 *
 * ┌─┬─────────────┬────────────────┐
 * │U│ Explorer     │ Properties     │ ← header on top, blue underline
 * │n│ (file-tree)  │ (placeholder)  │
 * │p│              │                │
 * │i│ [Floating    │                │
 * │n│  Clock]      │ Clock | Props▼ │ ← tabs at bottom
 * │n│              ├────────────────┤
 * │e│ Document 1 × │ Problems       │
 * │d│ Document 2   │ (problems)     │
 * │ │ (editors)    │                │
 * │1│              │                │
 * ├─┴─────────────┴────────────────┤
 * │          Output                 │ ← bottom auto-hide strip
 * └────────────────────────────────┘
 */
export const defaultState: DockManagerState = {
  panels: new Map<string, any>([
    // Left: File Tree (Explorer)
    ['contentPane1', {
      id: 'contentPane1',
      title: 'Explorer',
      icon: 'folder',
      closable: true,
      floatable: true,
      allowMaximize: true,
      allowPinning: true,
      widgetType: 'file-tree',
    }],
    // Center: Document 1 (Editor)
    ['doc1', {
      id: 'doc1',
      title: 'Document 1',
      icon: 'file',
      closable: true,
      floatable: true,
      allowMaximize: true,
      widgetType: 'editor',
      widgetProps: { language: 'ts' },
    }],
    // Center: Document 2 (Editor)
    ['doc2', {
      id: 'doc2',
      title: 'Document 2',
      icon: 'file',
      closable: true,
      floatable: true,
      allowMaximize: true,
      widgetType: 'editor',
      widgetProps: { language: 'css' },
    }],
    // Right top: Clock (part of bottom-tabs group)
    ['tab1', {
      id: 'tab1',
      title: 'Clock',
      icon: 'clock',
      closable: true,
      floatable: true,
      allowMaximize: true,
      allowPinning: true,
      widgetType: 'clock',
    }],
    // Right top: Properties (part of bottom-tabs group)
    ['tab2', {
      id: 'tab2',
      title: 'Properties',
      closable: true,
      floatable: true,
      allowMaximize: true,
      allowPinning: true,
      widgetType: 'placeholder',
      widgetProps: { label: 'Properties panel' },
    }],
    // Right bottom: Problems
    ['contentPane2', {
      id: 'contentPane2',
      title: 'Problems',
      icon: 'alert',
      closable: true,
      floatable: true,
      allowMaximize: true,
      allowPinning: true,
      widgetType: 'problems',
    }],
    // Floating pane: Clock
    ['floatingPane', {
      id: 'floatingPane',
      title: 'Floating Clock',
      icon: 'clock',
      closable: true,
      floatable: true,
      allowMaximize: true,
      widgetType: 'clock',
    }],
    // Unpinned Pane 1 (left edge auto-hide): Terminal
    ['unpinnedPane1', {
      id: 'unpinnedPane1',
      title: 'Terminal',
      icon: 'terminal',
      closable: true,
      floatable: true,
      allowPinning: true,
      widgetType: 'terminal',
    }],
    // Chart — blue area (size-dependent canvas, ResizeObserver path)
    ['chartPane', {
      id: 'chartPane', title: 'Revenue', icon: 'list',
      closable: true, floatable: true, allowPinning: true,
      widgetType: 'chart', widgetProps: { color: '#3b82f6', variant: 'area' },
    }],
    ['chartPane2', {
      id: 'chartPane2', title: 'Signups', icon: 'list',
      closable: true, floatable: true, allowPinning: true,
      widgetType: 'chart', widgetProps: { color: '#10b981', variant: 'line' },
    }],
    ['chartPane3', {
      id: 'chartPane3', title: 'Errors', icon: 'list',
      closable: true, floatable: true, allowPinning: true,
      widgetType: 'chart', widgetProps: { color: '#f59e0b', variant: 'bars' },
    }],
    ['chartPane4', {
      id: 'chartPane4', title: 'Latency', icon: 'list',
      closable: true, floatable: true, allowPinning: true,
      widgetType: 'chart', widgetProps: { color: '#f43f5e', variant: 'area' },
    }],
    ['dataGridPane', {
      id: 'dataGridPane', title: 'Vehicles', icon: 'list',
      closable: true, floatable: true, allowPinning: true,
      widgetType: 'datagrid',
    }],
    // Unpinned Pane 2 (bottom edge auto-hide)
    ['unpinnedPane2', {
      id: 'unpinnedPane2',
      title: 'Output',
      icon: 'scroll',
      closable: true,
      floatable: true,
      allowPinning: true,
      widgetType: 'placeholder',
      widgetProps: { label: 'Output panel' },
    }],
  ]),
  layout: {
    type: 'split',
    id: 'root_split',
    direction: 'horizontal',
    sizes: [25, 45, 30],
    children: [
      // Left: Explorer (single panel, no tabs)
      {
        type: 'tabgroup',
        id: 'tg_left',
        panels: ['contentPane1'],
        activePanel: 'contentPane1',
      },
      // Center: Document Host (Document 1, Document 2)
      {
        type: 'tabgroup',
        id: 'tg_center',
        panels: ['doc1', 'doc2'],
        activePanel: 'doc1',
      },
      // Right: vertical split — top has tabs-at-bottom, bottom has Problems
      {
        type: 'split',
        id: 'right_split',
        direction: 'vertical',
        sizes: [60, 40],
        children: [
          // Right top: Clock + Properties with tabs at bottom
          {
            type: 'tabgroup',
            id: 'tg_right_top',
            panels: ['tab1', 'tab2'],
            activePanel: 'tab2',
            headerPosition: 'bottom',
          },
          // Right bottom: Problems (single panel)
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
  placements: new Map([
    ['contentPane1', { type: 'docked' as const, groupId: 'tg_left' }],
    ['doc1', { type: 'docked' as const, groupId: 'tg_center' }],
    ['doc2', { type: 'docked' as const, groupId: 'tg_center' }],
    ['tab1', { type: 'docked' as const, groupId: 'tg_right_top' }],
    ['tab2', { type: 'docked' as const, groupId: 'tg_right_top' }],
    ['contentPane2', { type: 'docked' as const, groupId: 'tg_right_bottom' }],
    ['floatingPane', { type: 'floating' as const, x: 300, y: 200, width: 300, height: 200, zIndex: 1 }],
    ['unpinnedPane1', { type: 'unpinned' as const, edge: 'left' as const, size: 200 }],
    ['chartPane', { type: 'unpinned' as const, edge: 'left' as const, size: 320 }],
    ['chartPane2', { type: 'unpinned' as const, edge: 'left' as const, size: 320 }],
    ['chartPane3', { type: 'unpinned' as const, edge: 'right' as const, size: 320 }],
    ['chartPane4', { type: 'unpinned' as const, edge: 'right' as const, size: 320 }],
    ['dataGridPane', { type: 'unpinned' as const, edge: 'right' as const, size: 520 }],
    ['unpinnedPane2', { type: 'unpinned' as const, edge: 'bottom' as const, size: 180 }],
  ]),
  nextZIndex: 2,
  activePaneId: 'tab2',
};
