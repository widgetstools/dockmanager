import { Component, OnInit, OnDestroy, Input, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-clock-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;padding:20px;color:inherit">
      <div style="font-size:36px;font-weight:300;font-family:monospace;letter-spacing:2px">{{ time }}</div>
      <div style="font-size:13px;opacity:0.5">{{ dateStr }}</div>
      <div style="font-size:10px;opacity:0.3;margin-top:8px">Panel title updates every second via PanelApi.setTitle()</div>
    </div>
  `,
})
export class ClockWidgetComponent implements OnInit, OnDestroy {
  @Input() api: any;
  @Input() panel: any;

  time = '';
  dateStr = '';
  private timer: any;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.update();
    // Set initial icon
    this.api?.setIcon?.('clock');

    this.timer = setInterval(() => {
      this.update();
      this.cdr.markForCheck();
    }, 1000);

    // Register cleanup with PanelApi dispose
    this.api?.onDidDispose?.(() => this.cleanup());
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private update(): void {
    const now = new Date();
    this.time = now.toLocaleTimeString();
    this.dateStr = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    this.api?.setTitle?.(`Clock \u2014 ${this.time}`);
  }
}
