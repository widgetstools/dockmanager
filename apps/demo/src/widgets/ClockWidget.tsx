import { useEffect, useState } from 'react';
import type { PanelApi } from '@widgetstools/dock-manager-core';

/**
 * Live clock widget — demonstrates PanelApi.setTitle() for dynamic header updates.
 * Updates the panel title with the current time every second.
 */
export function ClockWidget({ api }: { api: PanelApi }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTime(now);
      // Update the panel header title with current time
      api.setTitle(`Clock — ${now.toLocaleTimeString()}`);
    }, 1000);

    // Set initial title
    api.setTitle(`Clock — ${new Date().toLocaleTimeString()}`);
    api.setIcon('clock');

    // Clean up on dispose
    api.onDidDispose(() => clearInterval(timer));

    return () => clearInterval(timer);
  }, [api]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: 20 }}>
      <div style={{ fontSize: 36, fontWeight: 300, fontFamily: 'monospace', letterSpacing: 2 }}>
        {time.toLocaleTimeString()}
      </div>
      <div style={{ fontSize: 13, opacity: 0.5 }}>
        {time.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
      <div style={{ fontSize: 10, opacity: 0.3, marginTop: 8 }}>
        Panel title updates every second via PanelApi.setTitle()
      </div>
    </div>
  );
}
