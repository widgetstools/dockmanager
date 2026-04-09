import { useEffect, useRef, useState } from 'react';

/**
 * Canvas-based chart that measures its container and uses ResizeObserver.
 * This is the exact pattern that exposed the unpinned-flyout blank-content bug:
 * if the container has a 0x0 box at mount time, the chart draws nothing until
 * something triggers a size change.
 */
import type { PanelConfig } from '@widgetstools/dock-manager-core';

interface ChartWidgetProps {
  panel?: PanelConfig;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return [59, 130, 246];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

export function ChartWidget({ panel }: ChartWidgetProps = {}) {
  const color = (panel?.widgetProps?.color as string) ?? '#3b82f6';
  const variant = (panel?.widgetProps?.variant as 'line' | 'bars' | 'area') ?? 'area';
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Generate stable series data once
  const seriesRef = useRef<number[]>(
    Array.from({ length: 60 }, (_, i) => 50 + Math.sin(i * 0.3) * 20 + Math.random() * 10),
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // rAF-based remeasure fallback. Even with stable render containers, a
    // freshly-mounted widget may measure 0x0 on the first paint (the parent
    // flyout has real size, but layout has not flushed to this subtree yet).
    // Poll for up to ~1 second until we read a non-zero rect, then stop —
    // the ResizeObserver below keeps tracking subsequent changes.
    let raf = 0;
    let frames = 0;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ w: rect.width, h: rect.height });
        return;
      }
      if (frames++ < 60) raf = requestAnimationFrame(measure);
    };
    measure();

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const cr = entry.contentRect;
      if (cr.width > 0 && cr.height > 0) {
        setSize({ w: cr.width, h: cr.height });
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size.w, size.h);

    const data = seriesRef.current;
    const pad = 24;
    const w = size.w - pad * 2;
    const h = size.h - pad * 2;
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

    const [r, g, b] = hexToRgb(color);
    const stroke = `rgb(${r},${g},${b})`;

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

    // Label
    ctx.fillStyle = 'rgba(128,128,128,0.8)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(`${Math.round(size.w)} × ${Math.round(size.h)}`, pad, pad - 8);
  }, [size, color, variant]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {size.w === 0 || size.h === 0 ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, opacity: 0.5 }}>
          Waiting for container size…
        </div>
      ) : (
        <canvas ref={canvasRef} />
      )}
    </div>
  );
}
