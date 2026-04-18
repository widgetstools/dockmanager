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
  panels: new Map<string, any>([
    ['explorer', { id: 'explorer', title: 'Explorer', icon: 'folder', closable: true, floatable: true, allowMaximize: true, allowPinning: true, widgetType: 'file-tree' }],
    ['doc1', { id: 'doc1', title: 'Document 1', icon: 'file', closable: true, floatable: true, allowMaximize: true, widgetType: 'editor', widgetProps: { language: 'ts' } }],
    ['doc2', { id: 'doc2', title: 'Document 2', icon: 'file', closable: true, floatable: true, allowMaximize: true, widgetType: 'editor', widgetProps: { language: 'css' } }],
    ['tab1', { id: 'tab1', title: 'Clock', icon: 'clock', closable: true, floatable: true, allowMaximize: true, allowPinning: true, widgetType: 'clock' }],
    ['tab2', { id: 'tab2', title: 'Properties', closable: true, floatable: true, allowMaximize: true, allowPinning: true, widgetType: 'placeholder', widgetProps: { label: 'Properties panel' } }],
    ['contentPane2', { id: 'contentPane2', title: 'Problems', icon: 'alert', closable: true, floatable: true, allowMaximize: true, allowPinning: true, widgetType: 'problems' }],
    ['floatingPane', { id: 'floatingPane', title: 'Floating Clock', icon: 'clock', closable: true, floatable: true, allowMaximize: true, widgetType: 'clock' }],
    ['unpinnedPane1', { id: 'unpinnedPane1', title: 'Terminal', icon: 'terminal', closable: true, floatable: true, allowPinning: true, widgetType: 'terminal' }],
    ['chartPane', { id: 'chartPane', title: 'Revenue', icon: 'list', closable: true, floatable: true, allowPinning: true, widgetType: 'chart', widgetProps: { color: '#3b82f6', variant: 'area' } }],
    ['chartPane2', { id: 'chartPane2', title: 'Signups', icon: 'list', closable: true, floatable: true, allowPinning: true, widgetType: 'chart', widgetProps: { color: '#10b981', variant: 'line' } }],
    ['chartPane3', { id: 'chartPane3', title: 'Errors', icon: 'list', closable: true, floatable: true, allowPinning: true, widgetType: 'chart', widgetProps: { color: '#f59e0b', variant: 'bars' } }],
    ['chartPane4', { id: 'chartPane4', title: 'Latency', icon: 'list', closable: true, floatable: true, allowPinning: true, widgetType: 'chart', widgetProps: { color: '#f43f5e', variant: 'area' } }],
    ['dataGridPane', { id: 'dataGridPane', title: 'Vehicles', icon: 'list', closable: true, floatable: true, allowPinning: true, widgetType: 'datagrid' }],
    ['unpinnedPane2', { id: 'unpinnedPane2', title: 'Output', icon: 'scroll', closable: true, floatable: true, allowPinning: true, widgetType: 'placeholder', widgetProps: { label: 'Output panel' } }],
  ]),
  layout: {
    type: 'split',
    id: 'root_split',
    direction: 'horizontal',
    sizes: [25, 45, 30],
    children: [
      { type: 'tabgroup', id: 'tg_left', panels: ['explorer'], activePanel: 'explorer' },
      { type: 'tabgroup', id: 'tg_center', panels: ['doc1', 'doc2'], activePanel: 'doc1' },
      {
        type: 'split',
        id: 'right_split',
        direction: 'vertical',
        sizes: [60, 40],
        children: [
          { type: 'tabgroup', id: 'tg_right_top', panels: ['tab1', 'tab2'], activePanel: 'tab2', headerPosition: 'bottom' },
          { type: 'tabgroup', id: 'tg_right_bottom', panels: ['contentPane2'], activePanel: 'contentPane2' },
        ],
      },
    ],
  },
  placements: new Map([
    ['explorer', { type: 'docked' as const, groupId: 'tg_left' }],
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
