import { BondWatchlist } from './BondWatchlist';
import { OrderBlotter } from './OrderBlotter';
import { PositionMonitor } from './PositionMonitor';
import { TradeTicket } from './TradeTicket';
import { YieldCurve } from './YieldCurve';
import { NewsFeed } from './NewsFeed';
import { RiskMetrics } from './RiskMetrics';
import { TradeHistory } from './TradeHistory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const widgetRegistry: Record<string, React.ComponentType<any>> = {
  bondWatchlist: BondWatchlist,
  orderBlotter: OrderBlotter,
  positionMonitor: PositionMonitor,
  tradeTicket: TradeTicket,
  yieldCurve: YieldCurve,
  newsFeed: NewsFeed,
  riskMetrics: RiskMetrics,
  tradeHistory: TradeHistory,
};
