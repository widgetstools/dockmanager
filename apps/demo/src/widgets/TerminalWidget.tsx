import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { PanelApi } from '@widgetstools/dock-manager-core';

/**
 * Simulated terminal — demonstrates PanelApi.setAttention() for notification alerts.
 * When a "build" runs, the terminal flashes to draw attention.
 */
export function TerminalWidget({ api }: { api: PanelApi }) {
  const [lines, setLines] = useState<string[]>([
    '$ npm start',
    'Starting development server...',
    'Compiled successfully!',
    '',
    'Local:   http://localhost:5174/',
    '',
    'Ready.',
    '',
  ]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const cmd = input.trim();
    setInput('');
    setLines(prev => [...prev, `$ ${cmd}`]);

    // Simulate command responses
    if (cmd === 'help') {
      setLines(prev => [...prev, 'Available: help, build, clear, date, badges, attention']);
    } else if (cmd === 'build') {
      setLines(prev => [...prev, 'Building...']);
      setTimeout(() => {
        setLines(prev => [...prev, 'Build completed in 2.3s', '']);
        api.setBadge('done');
        api.setAttention(true);
        setTimeout(() => api.setAttention(false), 3000);
      }, 1500);
    } else if (cmd === 'clear') {
      setLines([]);
    } else if (cmd === 'date') {
      setLines(prev => [...prev, new Date().toString()]);
    } else if (cmd === 'badges') {
      api.setBadge('3');
      setLines(prev => [...prev, 'Badge set to "3" via PanelApi.setBadge()']);
    } else if (cmd === 'attention') {
      api.setAttention(true);
      setLines(prev => [...prev, 'Attention requested via PanelApi.setAttention()']);
      setTimeout(() => api.setAttention(false), 3000);
    } else {
      setLines(prev => [...prev, `Unknown command: ${cmd}`, 'Type "help" for available commands']);
    }
  }, [input, api]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      fontFamily: 'Consolas, Monaco, "Courier New", monospace', fontSize: 12,
    }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        {lines.map((line, i) => (
          <div key={i} style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap', opacity: line.startsWith('$') ? 1 : 0.7 }}>
            {line || '\u00A0'}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} style={{
        display: 'flex', alignItems: 'center', padding: '4px 12px',
        borderTop: '1px solid hsl(var(--dock-border))',
      }}>
        <span style={{ opacity: 0.5, marginRight: 8 }}>$</span>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a command..."
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit',
          }}
        />
      </form>
    </div>
  );
}
