import type { DockManagerState } from '@widgetstools/dock-manager-core';

export const defaultState: DockManagerState = {
  panels: {
    content1: { id: 'content1', title: 'Content Pane 1', closable: true, floatable: true },
    content3: { id: 'content3', title: 'Content Pane 3', closable: true, floatable: true },
    content5: { id: 'content5', title: 'Content Pane 5', closable: true, floatable: true },
    tab1: { id: 'tab1', title: 'Tab 1', closable: true, floatable: true },
    tab2: { id: 'tab2', title: 'Tab 2', closable: true, floatable: true },
    doc1: { id: 'doc1', title: 'Document 1', closable: true, floatable: true },
    doc2: { id: 'doc2', title: 'Document 2', closable: true, floatable: true },
    floating1: { id: 'floating1', title: 'Floating Pane', closable: true, floatable: true },
    unpinned1: { id: 'unpinned1', title: 'Unpinned Pane 1', closable: true, floatable: true },
    unpinned2: { id: 'unpinned2', title: 'Unpinned Pane 2', closable: true, floatable: true },
  },
  layout: {
    type: 'split',
    id: 'root_split',
    direction: 'horizontal',
    sizes: [22, 56, 22],
    children: [
      // Left: Content Pane 1
      {
        type: 'tabgroup',
        id: 'tg_left',
        panels: ['content1'],
        activePanel: 'content1',
      },
      // Center: top doc tabs + bottom content pane 5
      {
        type: 'split',
        id: 'center_split',
        direction: 'vertical',
        sizes: [65, 35],
        children: [
          {
            type: 'tabgroup',
            id: 'tg_center',
            panels: ['doc1', 'doc2'],
            activePanel: 'doc1',
          },
          {
            type: 'tabgroup',
            id: 'tg_bottom',
            panels: ['content5'],
            activePanel: 'content5',
          },
        ],
      },
      // Right: Content Pane 3 + tabs (Tab 1, Tab 2)
      {
        type: 'split',
        id: 'right_split',
        direction: 'vertical',
        sizes: [50, 50],
        children: [
          {
            type: 'tabgroup',
            id: 'tg_right_top',
            panels: ['content3'],
            activePanel: 'content3',
          },
          {
            type: 'tabgroup',
            id: 'tg_right_bottom',
            panels: ['tab1', 'tab2'],
            activePanel: 'tab1',
          },
        ],
      },
    ],
  },
  floatingPanels: [
    {
      panelId: 'floating1',
      x: 340,
      y: 180,
      width: 280,
      height: 200,
      zIndex: 1,
    },
  ],
  unpinnedPanels: [
    { panelId: 'unpinned1', edge: 'left', size: 220 },
    { panelId: 'unpinned2', edge: 'bottom', size: 180 },
  ],
  popoutPanels: [],
  activePaneId: 'content1',
  nextZIndex: 2,
};
