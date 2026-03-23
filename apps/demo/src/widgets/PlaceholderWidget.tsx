import type { PanelApi } from '@widgetstools/dock-manager-core';
import type { PanelConfig } from '@widgetstools/dock-manager-core';

/**
 * Generic placeholder widget for panels without a specific widget type.
 * Shows panel info and demonstrates PanelApi read-only methods.
 */
export function PlaceholderWidget({ api: _api, panel }: { api: PanelApi; panel: PanelConfig }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 8, padding: 20, opacity: 0.5,
    }}>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{panel.title}</span>
      <span style={{ fontSize: 11 }}>Panel ID: {panel.id}</span>
      {panel.widgetType && (
        <span style={{ fontSize: 10, opacity: 0.6 }}>Widget: {panel.widgetType}</span>
      )}
    </div>
  );
}
