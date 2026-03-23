export type OrderStatus = 'Filled' | 'Partial' | 'Working' | 'Rejected';
export type OrderSide = 'Buy' | 'Sell';

export interface OrderData {
  orderId: string;
  side: OrderSide;
  security: string;
  qty: number;
  price: number;
  status: OrderStatus;
  time: string;
  counterparty: string;
}

export const orderData: OrderData[] = [
  { orderId: 'ORD-20240315-001', side: 'Buy', security: 'US Treasury 10Y', qty: 5000, price: 95.625, status: 'Filled', time: '09:31:42', counterparty: 'Goldman Sachs' },
  { orderId: 'ORD-20240315-002', side: 'Sell', security: 'Apple Inc 3.85 29', qty: 2000, price: 97.375, status: 'Filled', time: '09:45:18', counterparty: 'JPMorgan' },
  { orderId: 'ORD-20240315-003', side: 'Buy', security: 'JPMorgan 4.95 28', qty: 3000, price: 100.250, status: 'Working', time: '10:02:33', counterparty: 'Citigroup' },
  { orderId: 'ORD-20240315-004', side: 'Sell', security: 'US Treasury 30Y', qty: 1000, price: 91.375, status: 'Partial', time: '10:15:07', counterparty: 'Barclays' },
  { orderId: 'ORD-20240315-005', side: 'Buy', security: 'Microsoft 3.50 30', qty: 4000, price: 95.750, status: 'Rejected', time: '10:22:51', counterparty: 'Morgan Stanley' },
  { orderId: 'ORD-20240315-006', side: 'Sell', security: 'California GO 5.00 33', qty: 500, price: 104.500, status: 'Filled', time: '10:38:14', counterparty: 'Wells Fargo' },
  { orderId: 'ORD-20240315-007', side: 'Buy', security: 'US Treasury 5Y', qty: 10000, price: 98.750, status: 'Working', time: '10:45:29', counterparty: 'BNP Paribas' },
  { orderId: 'ORD-20240315-008', side: 'Buy', security: 'Goldman Sachs 5.15 29', qty: 2500, price: 100.875, status: 'Filled', time: '11:01:42', counterparty: 'Deutsche Bank' },
  { orderId: 'ORD-20240315-009', side: 'Sell', security: 'FHLB 4.875 28', qty: 3000, price: 100.812, status: 'Working', time: '11:14:08', counterparty: 'HSBC' },
  { orderId: 'ORD-20240315-010', side: 'Buy', security: 'Fannie Mae 4.625 29', qty: 5000, price: 99.875, status: 'Partial', time: '11:28:33', counterparty: 'UBS' },
  { orderId: 'ORD-20240315-011', side: 'Sell', security: 'US Treasury 2Y', qty: 8000, price: 99.906, status: 'Filled', time: '11:42:17', counterparty: 'Credit Suisse' },
  { orderId: 'ORD-20240315-012', side: 'Buy', security: 'Exxon Mobil 3.45 29', qty: 1500, price: 96.875, status: 'Working', time: '12:05:44', counterparty: 'TD Securities' },
  { orderId: 'ORD-20240315-013', side: 'Sell', security: 'Bank of America 4.75 28', qty: 2000, price: 99.875, status: 'Rejected', time: '12:18:29', counterparty: 'Nomura' },
  { orderId: 'ORD-20240315-014', side: 'Buy', security: 'New York City GO 5.25 34', qty: 750, price: 105.500, status: 'Filled', time: '13:02:11', counterparty: 'Raymond James' },
  { orderId: 'ORD-20240315-015', side: 'Sell', security: 'Citigroup 5.50 33', qty: 3500, price: 102.500, status: 'Working', time: '13:15:56', counterparty: 'Jefferies' },
  { orderId: 'ORD-20240315-016', side: 'Buy', security: 'Freddie Mac 4.50 28', qty: 6000, price: 99.625, status: 'Filled', time: '13:31:08', counterparty: 'RBC Capital' },
  { orderId: 'ORD-20240315-017', side: 'Sell', security: 'Pfizer 4.00 29', qty: 1800, price: 97.500, status: 'Partial', time: '13:48:42', counterparty: 'BMO Capital' },
  { orderId: 'ORD-20240315-018', side: 'Buy', security: 'US Treasury 7Y', qty: 7000, price: 97.500, status: 'Working', time: '14:02:15', counterparty: 'Societe Generale' },
];
