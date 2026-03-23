import type { ComponentType } from 'react';
import { BondWatchlist } from './BondWatchlist';
import { OrderBlotter } from './OrderBlotter';
import { PositionMonitor } from './PositionMonitor';
import { TradeTicket } from './TradeTicket';
import { YieldCurve } from './YieldCurve';
import { NewsFeed } from './NewsFeed';
import { RiskMetrics } from './RiskMetrics';
import { TradeHistory } from './TradeHistory';

export const widgetRegistry: Record<string, ComponentType> = {
  bondWatchlist: BondWatchlist,
  orderBlotter: OrderBlotter,
  positionMonitor: PositionMonitor,
  tradeTicket: TradeTicket,
  yieldCurve: YieldCurve,
  newsFeed: NewsFeed,
  riskMetrics: RiskMetrics,
  tradeHistory: TradeHistory,
};
