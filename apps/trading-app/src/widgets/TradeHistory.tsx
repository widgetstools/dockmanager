import { useMemo } from 'react';
import type { ColDef, ICellRendererParams, ValueFormatterParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { createGridTheme } from '../config/gridTheme';
import { useTradingTheme } from '../context/ThemeContext';
import { tradeData, type TradeData } from '../data/trades';

function SideBadge(params: ICellRendererParams<TradeData>) {
  const side = params.value as string;
  const colors = params.context?.colors;
  return (
    <span
      className="font-mono-num"
      style={{
        color: side === 'Buy' ? (colors?.positive ?? '#00c853') : (colors?.negative ?? '#ff5252'),
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '0.02em',
      }}
    >
      {side === 'Buy' ? 'BUY' : 'SELL'}
    </span>
  );
}

function SettlementBadge(params: ICellRendererParams<TradeData>) {
  const val = params.value as string;
  const colors = params.context?.colors;
  if (!val) return null;
  // Determine if settled (past date) or pending
  const settleDate = new Date(val);
  const now = new Date('2024-03-15');
  const isSettled = settleDate <= now;
  return (
    <span
      className="badge font-mono-num"
      style={{
        fontSize: 10,
        background: isSettled ? `${colors?.positive ?? '#00c853'}1a` : `${colors?.warning ?? '#ffc107'}1a`,
        color: isSettled ? (colors?.positive ?? '#00c853') : (colors?.warning ?? '#ffc107'),
      }}
    >
      {isSettled ? 'SETTLED' : val}
    </span>
  );
}

function CounterpartyRenderer(params: ICellRendererParams<TradeData>) {
  const name = params.value as string;
  const colors = params.context?.colors;
  if (!name) return null;
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2);
  // Generate a deterministic color from the name
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  const isDark = colors?.bg ? true : false; // fallback: assume dark if context missing
  const bgColor = isDark ? `hsl(${hue}, 50%, 25%)` : `hsl(${hue}, 40%, 88%)`;
  const textColor = isDark ? `hsl(${hue}, 60%, 70%)` : `hsl(${hue}, 50%, 35%)`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: '100%' }}>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: bgColor,
          color: textColor,
          fontSize: 8,
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          letterSpacing: '0.02em',
        }}
      >
        {initials}
      </span>
      <span style={{ color: colors?.textMuted ?? '#6b7280', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    </div>
  );
}

export function TradeHistory() {
  const tradingTheme = useTradingTheme();
  const gridTheme = useMemo(() => createGridTheme(tradingTheme.dockTheme), [tradingTheme.dockTheme]);

  const columnDefs = useMemo<ColDef<TradeData>[]>(() => [
    {
      field: 'side',
      headerName: 'Side',
      width: 60,
      cellRenderer: SideBadge,
    },
    { field: 'tradeId', headerName: 'Trade ID', width: 150, cellStyle: { color: tradingTheme.colors.textMuted, fontFamily: "'SF Mono', ui-monospace, monospace", fontSize: '10px' } as Record<string, string | number> },
    { field: 'dateTime', headerName: 'Date/Time', width: 140, filter: 'agDateColumnFilter', cellClass: 'font-mono-num', cellStyle: { color: tradingTheme.colors.textMuted, fontSize: '10px' } as Record<string, string | number> },
    { field: 'security', headerName: 'Security', flex: 1, minWidth: 140, cellStyle: { fontWeight: '500' } as Record<string, string | number> },
    {
      field: 'qty',
      headerName: 'Qty',
      width: 75,
      valueFormatter: (p: ValueFormatterParams<TradeData>) => p.value != null ? p.value.toLocaleString() : '',
      cellClass: 'font-mono-num',
    },
    {
      field: 'price',
      headerName: 'Price',
      width: 78,
      valueFormatter: (p: ValueFormatterParams<TradeData>) => p.value != null ? p.value.toFixed(3) : '',
      cellClass: 'font-mono-num',
    },
    {
      field: 'counterparty',
      headerName: 'Counterparty',
      width: 150,
      cellRenderer: CounterpartyRenderer,
    },
    {
      field: 'settlement',
      headerName: 'Settle',
      width: 95,
      cellRenderer: SettlementBadge,
    },
  ], [tradingTheme.colors]);

  const defaultColDef = useMemo<ColDef<TradeData>>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
  }), []);

  return (
    <div className="h-full w-full" style={{ background: tradingTheme.colors.bg }}>
      <AgGridReact<TradeData>
        rowData={tradeData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        theme={gridTheme}
        getRowId={(params) => params.data.tradeId}
        context={{ colors: tradingTheme.colors }}
      />
    </div>
  );
}
