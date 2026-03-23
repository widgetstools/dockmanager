export interface TradeData {
  tradeId: string;
  dateTime: string;
  security: string;
  side: 'Buy' | 'Sell';
  qty: number;
  price: number;
  counterparty: string;
  settlement: string;
}

export const tradeData: TradeData[] = [
  { tradeId: 'TRD-20240315-001', dateTime: '2024-03-15 09:31:42', security: 'US Treasury 10Y', side: 'Buy', qty: 5000, price: 95.625, counterparty: 'Goldman Sachs', settlement: '2024-03-18' },
  { tradeId: 'TRD-20240315-002', dateTime: '2024-03-15 09:45:18', security: 'Apple Inc 3.85 29', side: 'Sell', qty: 2000, price: 97.375, counterparty: 'JPMorgan', settlement: '2024-03-18' },
  { tradeId: 'TRD-20240314-003', dateTime: '2024-03-14 10:12:05', security: 'US Treasury 5Y', side: 'Buy', qty: 8000, price: 98.625, counterparty: 'Citigroup', settlement: '2024-03-18' },
  { tradeId: 'TRD-20240314-004', dateTime: '2024-03-14 11:22:33', security: 'JPMorgan 4.95 28', side: 'Buy', qty: 3000, price: 100.125, counterparty: 'Barclays', settlement: '2024-03-18' },
  { tradeId: 'TRD-20240314-005', dateTime: '2024-03-14 13:45:11', security: 'California GO 5.00 33', side: 'Sell', qty: 1000, price: 104.250, counterparty: 'Wells Fargo', settlement: '2024-03-18' },
  { tradeId: 'TRD-20240313-006', dateTime: '2024-03-13 09:55:28', security: 'Microsoft 3.50 30', side: 'Buy', qty: 4000, price: 95.500, counterparty: 'Morgan Stanley', settlement: '2024-03-15' },
  { tradeId: 'TRD-20240313-007', dateTime: '2024-03-13 10:38:42', security: 'US Treasury 30Y', side: 'Sell', qty: 2000, price: 91.125, counterparty: 'BNP Paribas', settlement: '2024-03-15' },
  { tradeId: 'TRD-20240313-008', dateTime: '2024-03-13 11:15:09', security: 'FHLB 4.875 28', side: 'Buy', qty: 5000, price: 100.500, counterparty: 'Deutsche Bank', settlement: '2024-03-15' },
  { tradeId: 'TRD-20240313-009', dateTime: '2024-03-13 14:02:37', security: 'Goldman Sachs 5.15 29', side: 'Sell', qty: 1500, price: 101.000, counterparty: 'HSBC', settlement: '2024-03-15' },
  { tradeId: 'TRD-20240312-010', dateTime: '2024-03-12 09:22:14', security: 'US Treasury 2Y', side: 'Buy', qty: 10000, price: 99.750, counterparty: 'UBS', settlement: '2024-03-14' },
  { tradeId: 'TRD-20240312-011', dateTime: '2024-03-12 10:45:58', security: 'Fannie Mae 4.625 29', side: 'Sell', qty: 3000, price: 100.000, counterparty: 'Credit Suisse', settlement: '2024-03-14' },
  { tradeId: 'TRD-20240312-012', dateTime: '2024-03-12 11:33:21', security: 'Exxon Mobil 3.45 29', side: 'Buy', qty: 2500, price: 96.750, counterparty: 'TD Securities', settlement: '2024-03-14' },
  { tradeId: 'TRD-20240312-013', dateTime: '2024-03-12 13:18:44', security: 'Bank of America 4.75 28', side: 'Buy', qty: 4000, price: 99.500, counterparty: 'Nomura', settlement: '2024-03-14' },
  { tradeId: 'TRD-20240311-014', dateTime: '2024-03-11 09:41:02', security: 'US Treasury 7Y', side: 'Sell', qty: 6000, price: 97.375, counterparty: 'Raymond James', settlement: '2024-03-13' },
  { tradeId: 'TRD-20240311-015', dateTime: '2024-03-11 10:28:37', security: 'New York City GO 5.25 34', side: 'Buy', qty: 800, price: 105.250, counterparty: 'Jefferies', settlement: '2024-03-13' },
  { tradeId: 'TRD-20240311-016', dateTime: '2024-03-11 11:55:19', security: 'Citigroup 5.50 33', side: 'Sell', qty: 2000, price: 102.125, counterparty: 'RBC Capital', settlement: '2024-03-13' },
  { tradeId: 'TRD-20240311-017', dateTime: '2024-03-11 13:42:08', security: 'Freddie Mac 4.50 28', side: 'Buy', qty: 5000, price: 99.500, counterparty: 'BMO Capital', settlement: '2024-03-13' },
  { tradeId: 'TRD-20240311-018', dateTime: '2024-03-11 14:15:33', security: 'Pfizer 4.00 29', side: 'Sell', qty: 1200, price: 97.375, counterparty: 'Societe Generale', settlement: '2024-03-13' },
  { tradeId: 'TRD-20240308-019', dateTime: '2024-03-08 09:35:47', security: 'US Treasury 20Y', side: 'Buy', qty: 3000, price: 98.125, counterparty: 'Goldman Sachs', settlement: '2024-03-12' },
  { tradeId: 'TRD-20240308-020', dateTime: '2024-03-08 10:48:22', security: 'S&P Global 4.25 31', side: 'Sell', qty: 1000, price: 97.875, counterparty: 'JPMorgan', settlement: '2024-03-12' },
  { tradeId: 'TRD-20240308-021', dateTime: '2024-03-08 11:22:59', security: 'Texas Water Dev 4.75 31', side: 'Buy', qty: 600, price: 102.250, counterparty: 'Citigroup', settlement: '2024-03-12' },
  { tradeId: 'TRD-20240308-022', dateTime: '2024-03-08 13:05:14', security: 'Ginnie Mae 4.75 29', side: 'Sell', qty: 4000, price: 100.250, counterparty: 'Barclays', settlement: '2024-03-12' },
  { tradeId: 'TRD-20240307-023', dateTime: '2024-03-07 09:18:36', security: 'Apple Inc 4.10 32', side: 'Buy', qty: 2500, price: 96.375, counterparty: 'Morgan Stanley', settlement: '2024-03-11' },
  { tradeId: 'TRD-20240307-024', dateTime: '2024-03-07 10:55:41', security: 'US Treasury 3Y', side: 'Sell', qty: 7000, price: 99.562, counterparty: 'Wells Fargo', settlement: '2024-03-11' },
  { tradeId: 'TRD-20240307-025', dateTime: '2024-03-07 14:28:17', security: 'Massachusetts GO 4.50 32', side: 'Buy', qty: 900, price: 101.000, counterparty: 'BNP Paribas', settlement: '2024-03-11' },
  { tradeId: 'TRD-20240306-026', dateTime: '2024-03-06 09:42:53', security: 'FHLB 5.00 33', side: 'Sell', qty: 3500, price: 101.125, counterparty: 'Deutsche Bank', settlement: '2024-03-08' },
  { tradeId: 'TRD-20240306-027', dateTime: '2024-03-06 11:08:29', security: 'Florida Board of Ed 4.25 30', side: 'Buy', qty: 700, price: 100.375, counterparty: 'HSBC', settlement: '2024-03-08' },
];
