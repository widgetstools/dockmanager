export interface BondData {
  cusip: string;
  issuer: string;
  issuerType: 'Treasury' | 'Corporate' | 'Municipal' | 'Agency';
  coupon: number;
  maturity: string;
  bid: number;
  ask: number;
  spread: number;
  change: number;
  volume: number;
}

export const bondData: BondData[] = [
  // US Treasuries
  { cusip: '912810TM0', issuer: 'US Treasury 2Y', issuerType: 'Treasury', coupon: 4.625, maturity: '2026-03-31', bid: 99.875, ask: 99.906, spread: 0, change: 0.031, volume: 42500 },
  { cusip: '912810TN8', issuer: 'US Treasury 3Y', issuerType: 'Treasury', coupon: 4.500, maturity: '2027-03-15', bid: 99.625, ask: 99.656, spread: 0, change: -0.062, volume: 38200 },
  { cusip: '912810TP3', issuer: 'US Treasury 5Y', issuerType: 'Treasury', coupon: 4.375, maturity: '2029-03-31', bid: 98.750, ask: 98.812, spread: 0, change: 0.125, volume: 51800 },
  { cusip: '912810TQ1', issuer: 'US Treasury 7Y', issuerType: 'Treasury', coupon: 4.250, maturity: '2031-03-31', bid: 97.500, ask: 97.562, spread: 0, change: -0.187, volume: 29600 },
  { cusip: '912810TR9', issuer: 'US Treasury 10Y', issuerType: 'Treasury', coupon: 4.125, maturity: '2034-02-15', bid: 95.625, ask: 95.687, spread: 0, change: 0.250, volume: 67200 },
  { cusip: '912810TS7', issuer: 'US Treasury 20Y', issuerType: 'Treasury', coupon: 4.750, maturity: '2044-05-15', bid: 98.312, ask: 98.437, spread: 0, change: -0.125, volume: 18400 },
  { cusip: '912810TT5', issuer: 'US Treasury 30Y', issuerType: 'Treasury', coupon: 4.375, maturity: '2054-02-15', bid: 91.250, ask: 91.375, spread: 0, change: 0.375, volume: 24800 },

  // Corporate Bonds
  { cusip: '037833DX8', issuer: 'Apple Inc', issuerType: 'Corporate', coupon: 3.850, maturity: '2029-05-04', bid: 97.125, ask: 97.375, spread: 52, change: -0.125, volume: 12500 },
  { cusip: '037833EB5', issuer: 'Apple Inc', issuerType: 'Corporate', coupon: 4.100, maturity: '2032-08-08', bid: 96.500, ask: 96.750, spread: 58, change: 0.062, volume: 8700 },
  { cusip: '46625HRL5', issuer: 'JPMorgan Chase', issuerType: 'Corporate', coupon: 4.950, maturity: '2028-06-01', bid: 100.250, ask: 100.500, spread: 72, change: 0.187, volume: 15300 },
  { cusip: '46625HRM3', issuer: 'JPMorgan Chase', issuerType: 'Corporate', coupon: 5.250, maturity: '2034-01-15', bid: 101.375, ask: 101.625, spread: 85, change: -0.250, volume: 11200 },
  { cusip: '594918CB2', issuer: 'Microsoft Corp', issuerType: 'Corporate', coupon: 3.500, maturity: '2030-02-12', bid: 95.750, ask: 96.000, spread: 45, change: 0.094, volume: 9800 },
  { cusip: '594918CC0', issuer: 'Microsoft Corp', issuerType: 'Corporate', coupon: 3.950, maturity: '2033-08-08', bid: 95.250, ask: 95.500, spread: 55, change: -0.156, volume: 7600 },
  { cusip: '38141GXZ2', issuer: 'Goldman Sachs', issuerType: 'Corporate', coupon: 5.150, maturity: '2029-05-22', bid: 100.875, ask: 101.125, spread: 78, change: 0.218, volume: 13400 },
  { cusip: '06051GJH8', issuer: 'Bank of America', issuerType: 'Corporate', coupon: 4.750, maturity: '2028-04-21', bid: 99.625, ask: 99.875, spread: 65, change: -0.094, volume: 10100 },
  { cusip: '172967MN2', issuer: 'Citigroup Inc', issuerType: 'Corporate', coupon: 5.500, maturity: '2033-09-13', bid: 102.250, ask: 102.500, spread: 92, change: 0.312, volume: 8900 },
  { cusip: '30231GAV4', issuer: 'Exxon Mobil', issuerType: 'Corporate', coupon: 3.450, maturity: '2029-04-15', bid: 96.875, ask: 97.125, spread: 48, change: -0.062, volume: 6700 },
  { cusip: '78354PAR5', issuer: 'S&P Global', issuerType: 'Corporate', coupon: 4.250, maturity: '2031-05-01', bid: 97.750, ask: 98.000, spread: 62, change: 0.156, volume: 5400 },
  { cusip: '717081EV8', issuer: 'Pfizer Inc', issuerType: 'Corporate', coupon: 4.000, maturity: '2029-03-15', bid: 97.250, ask: 97.500, spread: 55, change: 0.094, volume: 7200 },

  // Municipal Bonds
  { cusip: '13063DAG5', issuer: 'California GO', issuerType: 'Municipal', coupon: 5.000, maturity: '2033-10-01', bid: 104.250, ask: 104.500, spread: 35, change: 0.125, volume: 3200 },
  { cusip: '64966MBZ8', issuer: 'New York City GO', issuerType: 'Municipal', coupon: 5.250, maturity: '2034-08-01', bid: 105.500, ask: 105.750, spread: 42, change: -0.187, volume: 2800 },
  { cusip: '882723ZL4', issuer: 'Texas Water Dev', issuerType: 'Municipal', coupon: 4.750, maturity: '2031-06-01', bid: 102.375, ask: 102.625, spread: 28, change: 0.062, volume: 1900 },
  { cusip: '574193SX7', issuer: 'Massachusetts GO', issuerType: 'Municipal', coupon: 4.500, maturity: '2032-01-01', bid: 101.125, ask: 101.375, spread: 32, change: -0.094, volume: 2100 },
  { cusip: '341150PE4', issuer: 'Florida Board of Ed', issuerType: 'Municipal', coupon: 4.250, maturity: '2030-06-01', bid: 100.500, ask: 100.750, spread: 25, change: 0.156, volume: 1700 },

  // Agency Bonds
  { cusip: '3130A0F70', issuer: 'FHLB', issuerType: 'Agency', coupon: 4.875, maturity: '2028-09-13', bid: 100.625, ask: 100.812, spread: 12, change: 0.094, volume: 22500 },
  { cusip: '3135G0W33', issuer: 'Fannie Mae', issuerType: 'Agency', coupon: 4.625, maturity: '2029-01-19', bid: 99.875, ask: 100.062, spread: 15, change: -0.062, volume: 19800 },
  { cusip: '3134GXRM2', issuer: 'Freddie Mac', issuerType: 'Agency', coupon: 4.500, maturity: '2028-06-28', bid: 99.625, ask: 99.812, spread: 10, change: 0.031, volume: 17600 },
  { cusip: '3130A2UW8', issuer: 'FHLB', issuerType: 'Agency', coupon: 5.000, maturity: '2033-03-10', bid: 101.250, ask: 101.437, spread: 18, change: 0.187, volume: 14200 },
  { cusip: '3135G0X89', issuer: 'Fannie Mae', issuerType: 'Agency', coupon: 4.375, maturity: '2031-07-26', bid: 98.500, ask: 98.687, spread: 20, change: -0.125, volume: 11500 },
  { cusip: '3136G4VE2', issuer: 'Ginnie Mae', issuerType: 'Agency', coupon: 4.750, maturity: '2029-11-20', bid: 100.125, ask: 100.312, spread: 8, change: 0.062, volume: 16300 },
];
