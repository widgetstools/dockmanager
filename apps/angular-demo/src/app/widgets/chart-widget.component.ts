import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
} from '@angular/core';

/**
 * Canvas-based chart that measures its container and uses ResizeObserver.
 * Mirrors the React ChartWidget — size-dependent, used to stress-test the
 * dock-manager's unpinned flyout content-rendering path.
 */
@Component({
  selector: 'app-chart-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #host style="width:100%;height:100%;position:relative;overflow:hidden">
      <canvas #cv></canvas>
    </div>
  `,
})
export class ChartWidgetComponent implements AfterViewInit, OnDestroy {
  @Input() api: any;
  @Input() panel: any;

  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('cv', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private ro?: ResizeObserver;
  private series: number[] = Array.from(
    { length: 60 },
    (_, i) => 50 + Math.sin(i * 0.3) * 20 + Math.random() * 10,
  );

  ngAfterViewInit(): void {
    const host = this.hostRef.nativeElement;
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(host);
    this.draw();
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
  }

  private hexToRgb(hex: string): [number, number, number] {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return [59, 130, 246];
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  }

  private draw(): void {
    const host = this.hostRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
    const rect = host.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const color: string = this.panel?.widgetProps?.color ?? '#3b82f6';
    const variant: 'line' | 'bars' | 'area' = this.panel?.widgetProps?.variant ?? 'area';
    const [r, g, b] = this.hexToRgb(color);
    const stroke = `rgb(${r},${g},${b})`;

    const data = this.series;
    const pad = 24;
    const w = rect.width - pad * 2;
    const h = rect.height - pad * 2;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    // Grid
    ctx.strokeStyle = 'rgba(128,128,128,0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad + (h * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(pad + w, y);
      ctx.stroke();
    }

    const toXY = (v: number, i: number): [number, number] => {
      const x = pad + (w * i) / (data.length - 1);
      const y = pad + h - ((v - min) / range) * h;
      return [x, y];
    };

    if (variant === 'bars') {
      const barW = Math.max(1, (w / data.length) * 0.7);
      ctx.fillStyle = stroke;
      data.forEach((v, i) => {
        const [x, y] = toXY(v, i);
        ctx.fillRect(x - barW / 2, y, barW, pad + h - y);
      });
    } else {
      if (variant === 'area') {
        const grad = ctx.createLinearGradient(0, pad, 0, pad + h);
        grad.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0.02)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(pad, pad + h);
        data.forEach((v, i) => {
          const [x, y] = toXY(v, i);
          ctx.lineTo(x, y);
        });
        ctx.lineTo(pad + w, pad + h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      data.forEach((v, i) => {
        const [x, y] = toXY(v, i);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(128,128,128,0.8)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(`${Math.round(rect.width)} \u00D7 ${Math.round(rect.height)}`, pad, pad - 8);
  }
}
