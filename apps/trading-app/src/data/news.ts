export interface NewsItem {
  id: number;
  timestamp: string;
  headline: string;
  summary: string;
  category: 'rates' | 'credit' | 'macro' | 'muni' | 'agency';
}

export const newsData: NewsItem[] = [
  { id: 1, timestamp: '14:32', headline: 'Fed holds rates steady at 5.25-5.50% as expected', summary: 'FOMC votes unanimously to maintain current target range, signals potential cuts later in 2024.', category: 'rates' },
  { id: 2, timestamp: '14:28', headline: '10Y Treasury yield rises to 4.35% on strong jobs data', summary: 'Benchmark yield climbs 8bps after NFP report shows 275K jobs added in February.', category: 'rates' },
  { id: 3, timestamp: '14:15', headline: 'Investment-grade spreads tighten to 90bps over Treasuries', summary: 'IG credit index reaches tightest level since January 2022 on strong corporate earnings.', category: 'credit' },
  { id: 4, timestamp: '13:58', headline: 'Treasury announces $42B 10-year note auction next week', summary: 'Quarterly refunding plan slightly above expectations, market impact expected to be minimal.', category: 'rates' },
  { id: 5, timestamp: '13:45', headline: 'JPMorgan raises 2024 GDP forecast to 2.4%', summary: 'Bank cites resilient consumer spending and robust labor market as key drivers.', category: 'macro' },
  { id: 6, timestamp: '13:32', headline: 'California GO bonds rally on improved budget outlook', summary: 'State revises revenue projections upward by $3.2B, boosting muni sentiment.', category: 'muni' },
  { id: 7, timestamp: '13:18', headline: 'High-yield bond ETF sees $1.2B inflows this week', summary: 'HYG and JNK attract record flows as investors chase yield in risk-on environment.', category: 'credit' },
  { id: 8, timestamp: '13:05', headline: 'CPI comes in at 3.2% YoY, below 3.4% consensus', summary: 'Core inflation decelerates to 3.8%, supporting case for rate cuts in second half.', category: 'macro' },
  { id: 9, timestamp: '12:48', headline: 'FHLB issues $5B in new 3-year benchmark notes', summary: 'Deal prices at Treasury +12bps, drawing strong demand from bank portfolios.', category: 'agency' },
  { id: 10, timestamp: '12:35', headline: 'Apple prices $4.5B multi-tranche bond offering', summary: 'Five and ten-year tranches price 5bps inside initial guidance on strong book.', category: 'credit' },
  { id: 11, timestamp: '12:22', headline: '2s10s curve steepens to -35bps on long-end selling', summary: 'Curve inversion narrows as 10Y yields rise faster than short-end rates.', category: 'rates' },
  { id: 12, timestamp: '12:08', headline: 'Muni market sees $8.5B new issuance this week', summary: 'Heavy supply calendar pressures secondary market prices, creating buying opportunities.', category: 'muni' },
  { id: 13, timestamp: '11:55', headline: 'European Central Bank holds rates, signals June cut', summary: 'Lagarde points to improving inflation trajectory, EUR/USD drops on dovish guidance.', category: 'macro' },
  { id: 14, timestamp: '11:42', headline: 'Fannie Mae 30Y MBS spreads widen 3bps on prepayment fears', summary: 'Mortgage spreads under pressure as refinancing activity picks up with lower rates.', category: 'agency' },
  { id: 15, timestamp: '11:28', headline: 'Goldman Sachs downgrades IG credit to neutral', summary: 'Strategists cite tight valuations and limited spread compression potential.', category: 'credit' },
  { id: 16, timestamp: '11:15', headline: 'US budget deficit widens to $1.1T in first five months', summary: 'Treasury borrowing needs remain elevated, supporting higher long-end yields.', category: 'macro' },
  { id: 17, timestamp: '11:02', headline: 'New York MTA revenue bonds upgraded by Moody\'s', summary: 'Ridership recovery and congestion pricing revenue support one-notch upgrade to A2.', category: 'muni' },
  { id: 18, timestamp: '10:48', headline: 'Repo rate spikes to 5.45% on quarter-end demand', summary: 'Overnight funding pressure expected to ease after March 31 reporting date.', category: 'rates' },
  { id: 19, timestamp: '10:35', headline: 'Microsoft issues $3B green bond for sustainability initiatives', summary: 'First green bond from MSFT prices at Treasury +42bps, 3x oversubscribed.', category: 'credit' },
  { id: 20, timestamp: '10:22', headline: 'China sells $38B in Treasuries, largest monthly decline', summary: 'Foreign holdings drop raises questions about demand at upcoming auctions.', category: 'rates' },
  { id: 21, timestamp: '10:08', headline: 'Freddie Mac 10Y note deal priced at +8bps to interpolated curve', summary: 'Strong investor appetite for agency paper as portfolio allocations increase.', category: 'agency' },
  { id: 22, timestamp: '09:55', headline: 'Oil prices drop 3% on surprise inventory build', summary: 'WTI falls to $76.50 as EIA reports unexpected 4.2M barrel increase.', category: 'macro' },
  { id: 23, timestamp: '09:42', headline: 'Texas municipal bond index outperforms IG corporates YTD', summary: 'Tax-exempt munis benefit from strong state revenues and limited supply.', category: 'muni' },
  { id: 24, timestamp: '09:28', headline: 'Swap spreads turn negative on heavy corporate issuance', summary: '10Y swap spread at -15bps as corporate hedging activity increases.', category: 'rates' },
];
