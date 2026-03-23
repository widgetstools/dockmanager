import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-problems-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:12px;overflow:auto;height:100%;color:inherit">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:1px solid hsl(var(--dock-border));text-align:left">
            <th style="padding:4px 8px;font-weight:500;opacity:0.6">Severity</th>
            <th style="padding:4px 8px;font-weight:500;opacity:0.6">Message</th>
            <th style="padding:4px 8px;font-weight:500;opacity:0.6">File</th>
            <th style="padding:4px 8px;font-weight:500;opacity:0.6">Line</th>
          </tr>
        </thead>
        <tbody>
          @for (p of problems; track p.message) {
            <tr style="border-bottom:1px solid hsl(var(--dock-border) / 0.3)">
              <td style="padding:3px 8px">
                <span [style.background]="getColor(p.severity)" style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px"></span>
                {{ p.severity }}
              </td>
              <td style="padding:3px 8px">{{ p.message }}</td>
              <td style="padding:3px 8px;opacity:0.6">{{ p.file }}</td>
              <td style="padding:3px 8px;opacity:0.6">{{ p.line }}:{{ p.col }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class ProblemsWidgetComponent implements OnInit {
  @Input() api: any;
  @Input() panel: any;

  problems = [
    { severity: 'error', message: "'useState' is defined but never used", file: 'App.tsx', line: 3, col: 10 },
    { severity: 'warning', message: 'Missing return type on function', file: 'utils.ts', line: 12, col: 1 },
    { severity: 'error', message: "Cannot find name 'RouterProvider'", file: 'index.tsx', line: 8, col: 5 },
    { severity: 'warning', message: 'Unexpected any. Specify a different type', file: 'hooks.ts', line: 22, col: 18 },
    { severity: 'info', message: 'Consider using optional chaining', file: 'format.ts', line: 45, col: 7 },
  ];

  ngOnInit(): void {
    const errorCount = this.problems.filter(p => p.severity === 'error').length;
    this.api?.setBadge?.(String(errorCount));
  }

  getColor(severity: string): string {
    return severity === 'error' ? '#e53935' : severity === 'warning' ? '#f9a825' : '#42a5f5';
  }
}
