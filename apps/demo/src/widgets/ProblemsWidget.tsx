import { useEffect } from 'react';
import type { PanelApi } from '@widgetstools/dock-manager-core';

const MOCK_PROBLEMS = [
  { severity: 'error', message: "'useState' is defined but never used", file: 'App.tsx', line: 3, col: 10 },
  { severity: 'warning', message: "Missing return type on function", file: 'utils.ts', line: 12, col: 1 },
  { severity: 'error', message: "Cannot find name 'RouterProvider'", file: 'index.tsx', line: 8, col: 5 },
  { severity: 'warning', message: "Unexpected any. Specify a different type", file: 'hooks.ts', line: 22, col: 18 },
  { severity: 'info', message: "Consider using optional chaining", file: 'format.ts', line: 45, col: 7 },
];

/**
 * Problems panel — demonstrates PanelApi.setBadge() to show error count.
 */
export function ProblemsWidget({ api }: { api: PanelApi }) {
  const errorCount = MOCK_PROBLEMS.filter(p => p.severity === 'error').length;

  useEffect(() => {
    api.setBadge(String(errorCount));
  }, [api, errorCount]);

  return (
    <div style={{ fontSize: 12, overflow: 'auto', height: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid hsl(var(--dock-border))', textAlign: 'left' }}>
            <th style={{ padding: '4px 8px', fontWeight: 500, opacity: 0.6 }}>Severity</th>
            <th style={{ padding: '4px 8px', fontWeight: 500, opacity: 0.6 }}>Message</th>
            <th style={{ padding: '4px 8px', fontWeight: 500, opacity: 0.6 }}>File</th>
            <th style={{ padding: '4px 8px', fontWeight: 500, opacity: 0.6 }}>Line</th>
          </tr>
        </thead>
        <tbody>
          {MOCK_PROBLEMS.map((p, i) => (
            <tr key={i} style={{ borderBottom: '1px solid hsl(var(--dock-border) / 0.3)' }} className="hover:dock-hover">
              <td style={{ padding: '3px 8px' }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 4,
                  background: p.severity === 'error' ? '#e53935' : p.severity === 'warning' ? '#f9a825' : '#42a5f5',
                }} />
                {p.severity}
              </td>
              <td style={{ padding: '3px 8px' }}>{p.message}</td>
              <td style={{ padding: '3px 8px', opacity: 0.6 }}>{p.file}</td>
              <td style={{ padding: '3px 8px', opacity: 0.6 }}>{p.line}:{p.col}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
