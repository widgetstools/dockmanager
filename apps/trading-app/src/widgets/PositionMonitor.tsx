import { useMemo } from 'react';
import type { ColDef, ValueFormatterParams, ICellRendererParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { createGridTheme } from '../config/gridTheme';
import { useTradingTheme } from '../context/ThemeContext';

interface PositionData {
  security: string;
  assetClass: 'Treasury' | 'Corporate' | 'Municipal' | 'Agency';
  position: number;
  avgCost: number;
  mktPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  dv01: number;
  duration: number;
}

const positionData: PositionData[] = [
  { security: 'US Treasury 2Y', assetClass: 'Treasury', position: 10000, avgCost: 99.750, mktPrice: 99.875, unrealizedPnl: 12500, realizedPnl: 3200, dv01: 185, duration: 1.92 },
  { security: 'US Treasury 5Y', assetClass: 'Treasury', position: 8000, avgCost: 98.625, mktPrice: 98.750, unrealizedPnl: 10000, realizedPnl: -1500, dv01: 380, duration: 4.65 },
  { security: 'US Treasury 10Y', assetClass: 'Treasury', position: 5000, avgCost: 95.250, mktPrice: 95.625, unrealizedPnl: 18750, realizedPnl: 8400, dv01: 420, duration: 8.35 },
  { security: 'US Treasury 30Y', assetClass: 'Treasury', position: -2000, avgCost: 91.125, mktPrice: 91.250, unrealizedPnl: -2500, realizedPnl: 5600, dv01: 620, duration: 18.72 },
  { security: 'Apple Inc 3.85 29', assetClass: 'Corporate', position: -2000, avgCost: 97.500, mktPrice: 97.125, unrealizedPnl: 7500, realizedPnl: 2100, dv01: 95, duration: 4.42 },
  { security: 'JPMorgan 4.95 28', assetClass: 'Corporate', position: 3000, avgCost: 100.125, mktPrice: 100.250, unrealizedPnl: 3750, realizedPnl: -800, dv01: 115, duration: 3.75 },
  { security: 'Microsoft 3.50 30', assetClass: 'Corporate', position: 4000, avgCost: 95.500, mktPrice: 95.750, unrealizedPnl: 10000, realizedPnl: 4200, dv01: 165, duration: 5.52 },
  { security: 'Goldman Sachs 5.15 29', assetClass: 'Corporate', position: -1500, avgCost: 101.000, mktPrice: 100.875, unrealizedPnl: 1875, realizedPnl: 950, dv01: 78, duration: 4.18 },
  { security: 'Citigroup 5.50 33', assetClass: 'Corporate', position: -2000, avgCost: 102.125, mktPrice: 102.250, unrealizedPnl: -2500, realizedPnl: 1800, dv01: 185, duration: 7.65 },
  { security: 'California GO 5.00 33', assetClass: 'Municipal', position: -1000, avgCost: 104.250, mktPrice: 104.250, unrealizedPnl: 0, realizedPnl: 3400, dv01: 72, duration: 7.12 },
  { security: 'New York City GO 5.25 34', assetClass: 'Municipal', position: 800, avgCost: 105.250, mktPrice: 105.500, unrealizedPnl: 2000, realizedPnl: -400, dv01: 68, duration: 7.85 },
  { security: 'FHLB 4.875 28', assetClass: 'Agency', position: 5000, avgCost: 100.500, mktPrice: 100.625, unrealizedPnl: 6250, realizedPnl: 2800, dv01: 195, duration: 3.55 },
  { security: 'Fannie Mae 4.625 29', assetClass: 'Agency', position: -3000, avgCost: 100.000, mktPrice: 99.875, unrealizedPnl: 3750, realizedPnl: 1200, dv01: 145, duration: 4.32 },
  { security: 'Freddie Mac 4.50 28', assetClass: 'Agency', position: 5000, avgCost: 99.500, mktPrice: 99.625, unrealizedPnl: 6250, realizedPnl: 3100, dv01: 175, duration: 3.42 },
];

// Compute summary values
const totalNotional = positionData.reduce((sum, p) => sum + Math.abs(p.position) * p.mktPrice / 100, 0);
const totalMV = positionData.reduce((sum, p) => sum + p.position * p.mktPrice / 100, 0);
const totalPnl = positionData.reduce((sum, p) => sum + p.unrealizedPnl + p.realizedPnl, 0);
const totalDV01 = positionData.reduce((sum, p) => sum + p.dv01, 0);
const totalUnrealizedPnl = positionData.reduce((sum, p) => sum + p.unrealizedPnl, 0);

// Sector allocation
const sectorAlloc = ['Treasury', 'Corporate', 'Municipal', 'Agency'].map(sector => {
  const sectorPositions = positionData.filter(p => p.assetClass === sector);
  const notional = sectorPositions.reduce((sum, p) => sum + Math.abs(p.position) * p.mktPrice / 100, 0);
  return { sector, notional, pct: (notional / totalNotional) * 100 };
});

function getSectorColors(theme: ReturnType<typeof useTradingTheme>): Record<string, string> {
  return {
    Treasury: theme.colors.blue,
    Corporate: theme.colors.green,
    Municipal: theme.colors.amber,
    Agency: theme.colors.cyan,
  };
}

interface SummaryCardProps {
  label: string;
  value: string;
  change?: string;
  changePositive?: boolean;
  colors: { textMuted: string; text: string; positive: string; negative: string };
}

function SummaryCard({ label, value, change, changePositive, colors }: SummaryCardProps) {
  return (
    <div className="glass-card" style={{ padding: '8px 10px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: colors.textMuted, fontWeight: 500, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div className="card-value" style={{ color: colors.text, lineHeight: 1.1 }}>
        {value}
      </div>
      {change && (
        <div className="card-value-sm" style={{ color: changePositive ? colors.positive : colors.negative, marginTop: 2 }}>
          {changePositive ? '+' : ''}{change}
        </div>
      )}
    </div>
  );
}

function PnlRenderer(params: ICellRendererParams<PositionData>) {
  const val = params.value as number | null;
  if (val == null) return null;
  const colors = params.context?.colors;
  const color = val > 0 ? (colors?.positive ?? '#00c853') : val < 0 ? (colors?.negative ?? '#ff5252') : (colors?.textMuted ?? '#6b7280');
  const prefix = val > 0 ? '+' : '';
  return (
    <span className="font-mono-num" style={{ color }}>
      {prefix}${val.toLocaleString()}
    </span>
  );
}

export function PositionMonitor() {
  const tradingTheme = useTradingTheme();
  const gridTheme = useMemo(() => createGridTheme(tradingTheme.dockTheme), [tradingTheme.dockTheme]);
  const sectorColors = useMemo(() => getSectorColors(tradingTheme), [tradingTheme]);

  const columnDefs = useMemo<ColDef<PositionData>[]>(() => [
    { field: 'assetClass', headerName: 'Class', rowGroup: true, hide: true },
    { field: 'security', headerName: 'Security', flex: 1, minWidth: 150, cellStyle: { fontWeight: 500 } },
    {
      field: 'position',
      headerName: 'Pos',
      width: 85,
      valueFormatter: (p: ValueFormatterParams<PositionData>) => p.value != null ? p.value.toLocaleString() : '',
      cellClass: 'font-mono-num',
    },
    {
      field: 'avgCost',
      headerName: 'Avg Cost',
      width: 82,
      valueFormatter: (p: ValueFormatterParams<PositionData>) => p.value != null ? p.value.toFixed(3) : '',
      cellClass: 'font-mono-num',
    },
    {
      field: 'mktPrice',
      headerName: 'Mkt Px',
      width: 82,
      valueFormatter: (p: ValueFormatterParams<PositionData>) => p.value != null ? p.value.toFixed(3) : '',
      cellClass: 'font-mono-num',
    },
    {
      field: 'unrealizedPnl',
      headerName: 'Unreal P&L',
      width: 100,
      cellRenderer: PnlRenderer,
      aggFunc: 'sum',
    },
    {
      field: 'realizedPnl',
      headerName: 'Real P&L',
      width: 95,
      cellRenderer: PnlRenderer,
      aggFunc: 'sum',
    },
    {
      field: 'dv01',
      headerName: 'DV01',
      width: 70,
      valueFormatter: (p: ValueFormatterParams<PositionData>) => p.value != null ? `$${p.value}` : '',
      cellClass: 'font-mono-num',
      aggFunc: 'sum',
    },
    {
      field: 'duration',
      headerName: 'Dur',
      width: 65,
      valueFormatter: (p: ValueFormatterParams<PositionData>) => p.value != null ? p.value.toFixed(2) : '',
      cellClass: 'font-mono-num',
    },
  ], []);

  const defaultColDef = useMemo<ColDef<PositionData>>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
  }), []);

  return (
    <div className="h-full w-full flex flex-col" style={{ background: tradingTheme.colors.bg }}>
      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 6px 0 6px', flexShrink: 0 }}>
        <SummaryCard
          label="Total Notional"
          value={`$${(totalNotional / 1000).toFixed(0)}K`}
          colors={tradingTheme.colors}
        />
        <SummaryCard
          label="Market Value"
          value={`$${(totalMV / 1000).toFixed(0)}K`}
          change={`${(totalMV * 0.0012 / 1000).toFixed(1)}K`}
          changePositive={true}
          colors={tradingTheme.colors}
        />
        <SummaryCard
          label="Total P&L"
          value={`$${(totalPnl / 1000).toFixed(1)}K`}
          change={`$${(totalUnrealizedPnl / 1000).toFixed(1)}K unreal`}
          changePositive={totalPnl > 0}
          colors={tradingTheme.colors}
        />
        <SummaryCard
          label="Portfolio DV01"
          value={`$${totalDV01.toLocaleString()}`}
          colors={tradingTheme.colors}
        />
      </div>

      {/* Sector Allocation Bar */}
      <div style={{ padding: '6px 6px 4px 6px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: tradingTheme.colors.textMuted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Sector Allocation
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            {sectorAlloc.map(s => (
              <div key={s.sector} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span className="category-dot" style={{ backgroundColor: sectorColors[s.sector] }} />
                <span style={{ fontSize: 10, color: tradingTheme.colors.textMuted }}>{s.sector}</span>
                <span className="font-mono-num" style={{ fontSize: 10, color: tradingTheme.colors.text }}>{s.pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="sector-bar">
          {sectorAlloc.map(s => (
            <div key={s.sector} style={{ width: `${s.pct}%`, backgroundColor: sectorColors[s.sector], opacity: 0.7 }} />
          ))}
        </div>
      </div>

      {/* Positions Grid */}
      <div className="flex-1 min-h-0">
        <AgGridReact<PositionData>
          rowData={positionData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          theme={gridTheme}
          groupDefaultExpanded={1}
          suppressAggFuncInHeader={true}
          grandTotalRow="bottom"
          getRowId={(params) => params.data.security}
          context={{ colors: tradingTheme.colors }}
        />
      </div>
    </div>
  );
}
