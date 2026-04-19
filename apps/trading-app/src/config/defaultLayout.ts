import type { DockManagerState } from '@widgetstools/react-dock-manager';

/**
 * Default layout for the Fixed Income trading application.
 *
 * ┌──────────┬─────────────────────────┬──────────┐
 * │          │    Bond Watchlist        │  Risk    │
 * │  Trade   │    (center, large)      │ Metrics  │
 * │  Ticket  │                         │          │
 * │          ├─────────┬───────────────┤          │
 * │          │ Yield   │ News Feed     │          │
 * │          │ Curve   │               │          │
 * ├──────────┴─────────┴───────────────┴──────────┤
 * │  Order Blotter  │  Positions  │ Trade History  │
 * │  (tabs at bottom)                              │
 * └────────────────────────────────────────────────┘
 */
export const defaultLayout: DockManagerState = {
  layout: {
    type: 'split',
    id: 'root',
    direction: 'vertical',
    children: [
      // Top section (74%)
      {
        type: 'split',
        id: 'top',
        direction: 'horizontal',
        children: [
          // Center — watchlist on top, yield curve + news on bottom
          {
            type: 'split',
            id: 'center',
            direction: 'vertical',
            children: [
              {
                type: 'tabgroup',
                id: 'tg_watchlist',
                panels: ['bondWatchlist'],
                activePanel: 'bondWatchlist',
              },
              {
                type: 'split',
                id: 'center_bottom',
                direction: 'horizontal',
                children: [
                  {
                    type: 'tabgroup',
                    id: 'tg_yield',
                    panels: ['yieldCurve'],
                    activePanel: 'yieldCurve',
                  },
                  {
                    type: 'tabgroup',
                    id: 'tg_news',
                    panels: ['newsFeed'],
                    activePanel: 'newsFeed',
                  },
                ],
                sizes: [45, 55],
              },
            ],
            sizes: [58, 42],
          },
          // Right — Risk Metrics (18%)
          {
            type: 'tabgroup',
            id: 'tg_risk',
            panels: ['riskMetrics'],
            activePanel: 'riskMetrics',
          },
        ],
        sizes: [75, 25],
      },
      // Bottom section — Order Blotter, Positions, Trade History (26%)
      {
        type: 'split',
        id: 'bottom',
        direction: 'horizontal',
        children: [
          {
            type: 'tabgroup',
            id: 'tg_orders',
            panels: ['orderBlotter'],
            activePanel: 'orderBlotter',
          },
          {
            type: 'tabgroup',
            id: 'tg_positions',
            panels: ['positionMonitor'],
            activePanel: 'positionMonitor',
          },
          {
            type: 'tabgroup',
            id: 'tg_history',
            panels: ['tradeHistory'],
            activePanel: 'tradeHistory',
          },
        ],
        sizes: [30, 40, 30],
      },
    ],
    sizes: [74, 26],
  },
  panels: new Map([
    ['tradeTicket', { id: 'tradeTicket', title: 'Trade Ticket', widgetType: 'tradeTicket', closable: true }],
    ['bondWatchlist', { id: 'bondWatchlist', title: 'Bond Watchlist', widgetType: 'bondWatchlist', closable: true }],
    ['yieldCurve', { id: 'yieldCurve', title: 'Yield Curve', widgetType: 'yieldCurve', closable: true }],
    ['newsFeed', { id: 'newsFeed', title: 'News Feed', widgetType: 'newsFeed', closable: true }],
    ['riskMetrics', { id: 'riskMetrics', title: 'Risk Metrics', widgetType: 'riskMetrics', closable: true, disabled: true }],
    ['orderBlotter', { id: 'orderBlotter', title: 'Order Blotter', widgetType: 'orderBlotter', closable: true }],
    ['positionMonitor', { id: 'positionMonitor', title: 'Positions & P&L', widgetType: 'positionMonitor', closable: true }],
    ['tradeHistory', { id: 'tradeHistory', title: 'Trade History', widgetType: 'tradeHistory', closable: true }],
  ]),
  placements: new Map([
    ['tradeTicket', { type: 'floating', x: 50, y: 50, width: 340, height: 500, zIndex: 1 }],
    ['bondWatchlist', { type: 'docked', groupId: 'tg_watchlist' }],
    ['yieldCurve', { type: 'docked', groupId: 'tg_yield' }],
    ['newsFeed', { type: 'docked', groupId: 'tg_news' }],
    ['riskMetrics', { type: 'docked', groupId: 'tg_risk' }],
    ['orderBlotter', { type: 'docked', groupId: 'tg_orders' }],
    ['positionMonitor', { type: 'docked', groupId: 'tg_positions' }],
    ['tradeHistory', { type: 'docked', groupId: 'tg_history' }],
  ]),
  nextZIndex: 1,
  activePaneId: 'bondWatchlist',
};
