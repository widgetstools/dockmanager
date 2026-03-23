import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import type { PanelConfig } from '@widgetstools/dock-manager-core';

/**
 * Generic placeholder widget for panels without a specific widget type.
 * Shows panel info and demonstrates PanelApi read-only methods.
 */
@Component({
  selector: 'app-placeholder-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;padding:20px;opacity:0.5;color:inherit">
      <span style="font-size:14px;font-weight:500">{{ panel?.title }}</span>
      <span style="font-size:11px">Panel ID: {{ panel?.id }}</span>
      @if (panel?.widgetType) {
        <span style="font-size:10px;opacity:0.6">Widget: {{ panel.widgetType }}</span>
      }
    </div>
  `,
})
export class PlaceholderWidgetComponent {
  @Input() api: any;
  @Input() panel!: PanelConfig;
}
