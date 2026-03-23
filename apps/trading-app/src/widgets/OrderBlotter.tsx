import { useMemo } from 'react';
import type { ColDef, ICellRendererParams, ValueFormatterParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { createGridTheme } from '../config/gridTheme';
import { useTradingTheme } from '../context/ThemeContext';
import { orderData, type OrderData } from '../data/orders';

const statusMap: Record<string, { cls: string; label: string }> = {
  Filled: { cls: 'badge-filled', label: 'FILLED' },
  Partial: { cls: 'badge-partial', label: 'PARTIAL' },
  Working: { cls: 'badge-working', label: 'WORKING' },
  Rejected: { cls: 'badge-rejected', label: 'REJECTED' },
};

function StatusBadge(params: ICellRendererParams<OrderData>) {
  const status = params.value as string;
  const info = statusMap[status];
  if (!info) return null;
  return <span className={`badge ${info.cls}`}>{info.label}</span>;
}

function SideBadge(params: ICellRendererParams<OrderData>) {
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

function FillBar(params: ICellRendererParams<OrderData>) {
  const status = params.data?.status;
  const colors = params.context?.colors;
  if (!status) return null;
  const pct = status === 'Filled' ? 100 : status === 'Partial' ? Math.floor(Math.random() * 40 + 30) : status === 'Working' ? 0 : 0;
  const color = status === 'Filled' ? (colors?.positive ?? '#00c853') : status === 'Partial' ? (colors?.warning ?? '#ffc107') : (colors?.accent ?? '#2979ff');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: '100%' }}>
      <div className="fill-bar" style={{ width: 40, flexShrink: 0 }}>
        <div className="fill-bar-inner" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="font-mono-num" style={{ fontSize: 10, color: colors?.textMuted ?? '#6b7280' }}>{pct}%</span>
    </div>
  );
}

export function OrderBlotter() {
  const tradingTheme = useTradingTheme();
  const gridTheme = useMemo(() => createGridTheme(tradingTheme.dockTheme), [tradingTheme.dockTheme]);

  const columnDefs = useMemo<ColDef<OrderData>[]>(() => [
    {
      field: 'side',
      headerName: 'Side',
      width: 60,
      cellRenderer: SideBadge,
    },
    { field: 'orderId', headerName: 'Order ID', width: 150, cellStyle: { color: tradingTheme.colors.textMuted, fontFamily: "'SF Mono', ui-monospace, monospace", fontSize: '10px' } as Record<string, string | number> },
    { field: 'security', headerName: 'Security', flex: 1, minWidth: 140, cellStyle: { fontWeight: '500' } as Record<string, string | number> },
    {
      field: 'qty',
      headerName: 'Qty',
      width: 80,
      valueFormatter: (p: ValueFormatterParams<OrderData>) => p.value != null ? p.value.toLocaleString() : '',
      cellClass: 'font-mono-num',
    },
    {
      field: 'price',
      headerName: 'Price',
      width: 80,
      valueFormatter: (p: ValueFormatterParams<OrderData>) => p.value != null ? p.value.toFixed(3) : '',
      cellClass: 'font-mono-num',
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 90,
      cellRenderer: StatusBadge,
      filter: true,
    },
    {
      headerName: 'Fill',
      width: 85,
      cellRenderer: FillBar,
    },
    { field: 'time', headerName: 'Time', width: 80, cellClass: 'font-mono-num', cellStyle: { color: tradingTheme.colors.textMuted } as Record<string, string | number> },
    { field: 'counterparty', headerName: 'Cpty', width: 120, cellStyle: { color: tradingTheme.colors.textMuted } as Record<string, string | number> },
  ], [tradingTheme.colors]);

  const defaultColDef = useMemo<ColDef<OrderData>>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
  }), []);

  return (
    <div className="h-full w-full" style={{ background: tradingTheme.colors.bg }}>
      <AgGridReact<OrderData>
        rowData={orderData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        theme={gridTheme}
        getRowId={(params) => params.data.orderId}
        context={{ colors: tradingTheme.colors }}
      />
    </div>
  );
}
