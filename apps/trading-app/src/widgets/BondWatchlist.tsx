import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CellStyle, ColDef, ValueFormatterParams, ICellRendererParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { createGridTheme } from '../config/gridTheme';
import { useTradingTheme } from '../context/ThemeContext';
import { bondData, type BondData } from '../data/bonds';

function ChangeRenderer(params: ICellRendererParams<BondData>) {
  const val = params.value as number | null;
  if (val == null) return null;
  const isPositive = val > 0;
  const isNegative = val < 0;
  const arrow = isPositive ? '\u25B2' : isNegative ? '\u25BC' : '';
  const color = isPositive ? (params.context?.colors?.positive ?? '#00c853') : isNegative ? (params.context?.colors?.negative ?? '#ff5252') : (params.context?.colors?.textMuted ?? '#6b7280');
  const formatted = isPositive ? `+${val.toFixed(3)}` : val.toFixed(3);
  return (
    <span className="font-mono-num" style={{ color, fontSize: 11 }}>
      <span style={{ fontSize: 8, marginRight: 2 }}>{arrow}</span>
      {formatted}
    </span>
  );
}

function SpreadRenderer(params: ICellRendererParams<BondData>) {
  const val = params.value as number | null;
  if (val == null) return null;
  if (val === 0) return <span className="font-mono-num" style={{ color: params.context?.colors?.textMuted ?? '#6b7280' }}>--</span>;
  return <span className="font-mono-num" style={{ color: params.context?.colors?.text ?? '#e1e4ed' }}>{val}bp</span>;
}

function VolumeRenderer(params: ICellRendererParams<BondData>) {
  const val = params.value as number | null;
  if (val == null) return null;
  let formatted: string;
  if (val >= 1000000) {
    formatted = `${(val / 1000000).toFixed(1)}M`;
  } else if (val >= 1000) {
    formatted = `${(val / 1000).toFixed(1)}K`;
  } else {
    formatted = val.toString();
  }
  return <span className="font-mono-num" style={{ color: params.context?.colors?.textMuted ?? '#6b7280', fontSize: 11 }}>{formatted}</span>;
}

export function BondWatchlist() {
  const gridRef = useRef<AgGridReact<BondData>>(null);
  const [rowData, setRowData] = useState<BondData[]>(() => [...bondData]);
  const tradingTheme = useTradingTheme();
  const gridTheme = useMemo(() => createGridTheme(tradingTheme.dockTheme), [tradingTheme.dockTheme]);

  const columnDefs = useMemo<ColDef<BondData>[]>(() => [
    {
      field: 'issuerType',
      headerName: 'Type',
      rowGroup: true,
      hide: true,
    },
    { field: 'cusip', headerName: 'CUSIP', width: 105, cellStyle: { color: tradingTheme.colors.textMuted, fontFamily: "'SF Mono', ui-monospace, monospace", fontSize: '10px' } as CellStyle },
    { field: 'issuer', headerName: 'Issuer', flex: 1, minWidth: 140, cellStyle: { fontWeight: 500 } as CellStyle },
    {
      field: 'coupon',
      headerName: 'Cpn',
      width: 72,
      valueFormatter: (p: ValueFormatterParams<BondData>) => p.value != null ? `${p.value.toFixed(3)}%` : '',
      cellClass: 'font-mono-num',
    },
    { field: 'maturity', headerName: 'Maturity', width: 95, cellStyle: { color: tradingTheme.colors.textMuted, fontSize: '10px' } as CellStyle },
    {
      field: 'bid',
      headerName: 'Bid',
      width: 82,
      valueFormatter: (p: ValueFormatterParams<BondData>) => p.value != null ? p.value.toFixed(3) : '',
      cellClass: 'font-mono-num',
      enableCellChangeFlash: true,
    },
    {
      field: 'ask',
      headerName: 'Ask',
      width: 82,
      valueFormatter: (p: ValueFormatterParams<BondData>) => p.value != null ? p.value.toFixed(3) : '',
      cellClass: 'font-mono-num',
      enableCellChangeFlash: true,
    },
    {
      field: 'spread',
      headerName: 'Sprd',
      width: 68,
      cellRenderer: SpreadRenderer,
    },
    {
      field: 'change',
      headerName: 'Chg',
      width: 82,
      cellRenderer: ChangeRenderer,
      enableCellChangeFlash: true,
    },
    {
      field: 'volume',
      headerName: 'Vol',
      width: 72,
      cellRenderer: VolumeRenderer,
    },
  ], [tradingTheme.colors]);

  const defaultColDef: ColDef<BondData> = {
    sortable: true,
    filter: true,
    resizable: true,
  };

  const simulatePriceUpdates = useCallback(() => {
    setRowData(prev => {
      const next = [...prev];
      const count = Math.floor(Math.random() * 4) + 1;
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * next.length);
        const row = { ...next[idx] };
        const delta = (Math.random() - 0.5) * 0.125;
        row.bid = Math.round((row.bid + delta) * 1000) / 1000;
        row.ask = Math.round((row.bid + (row.ask - row.bid + (Math.random() - 0.5) * 0.02)) * 1000) / 1000;
        row.change = Math.round((row.change + delta * 0.5) * 1000) / 1000;
        row.volume = row.volume + Math.floor(Math.random() * 500);
        next[idx] = row;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const id = setInterval(simulatePriceUpdates, 2000);
    return () => clearInterval(id);
  }, [simulatePriceUpdates]);

  return (
    <div className="h-full w-full" style={{ background: tradingTheme.colors.bg }}>
      <AgGridReact<BondData>
        ref={gridRef}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        theme={gridTheme}
        animateRows={true}
        groupDefaultExpanded={1}
        getRowId={(params) => params.data.cusip}
        suppressAggFuncInHeader={true}
        context={{ colors: tradingTheme.colors }}
      />
    </div>
  );
}
