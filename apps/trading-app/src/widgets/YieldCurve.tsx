import { useRef, useEffect, useState } from 'react';
import { useTradingTheme } from '../context/ThemeContext';

const maturities = ['3M', '6M', '1Y', '2Y', '5Y', '10Y', '30Y'];
const yields = [5.38, 5.32, 5.05, 4.68, 4.25, 4.35, 4.52];
const prevYields = [5.35, 5.28, 5.00, 4.62, 4.20, 4.30, 4.48];
const periods = ['1D', '1W', '1M', '3M', '1Y'] as const;

export function YieldCurve() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<{ idx: number; x: number; y: number } | null>(null);
  const [activePeriod, setActivePeriod] = useState<string>('1D');
  const [_tooltip, setTooltip] = useState<{ idx: number; x: number; y: number } | null>(null);
  const tradingTheme = useTradingTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf: number;

    const draw = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      const dpr = window.devicePixelRatio || 1;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      const pl = 50, pr = 20, pt = 12, pb = 32;
      const cw = w - pl - pr;
      const ch = h - pt - pb;

      // Clear with theme background
      ctx.fillStyle = tradingTheme.colors.bg;
      ctx.fillRect(0, 0, w, h);

      const yMin = 3.5;
      const yMax = 5.5;
      const yRange = yMax - yMin;

      const toX = (i: number) => pl + (i / (maturities.length - 1)) * cw;
      const toY = (val: number) => pt + (1 - (val - yMin) / yRange) * ch;

      // Dotted grid lines
      ctx.strokeStyle = tradingTheme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      for (let y = yMin; y <= yMax; y += 0.5) {
        const py = toY(y);
        ctx.beginPath();
        ctx.moveTo(pl, py);
        ctx.lineTo(pl + cw, py);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Y axis labels
      ctx.fillStyle = tradingTheme.colors.textSecondary;
      ctx.font = '10px "SF Mono", ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = yMin; y <= yMax; y += 0.5) {
        ctx.fillText(`${y.toFixed(1)}%`, pl - 8, toY(y));
      }

      // X axis labels
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = tradingTheme.colors.textSecondary;
      for (let i = 0; i < maturities.length; i++) {
        ctx.fillText(maturities[i], toX(i), pt + ch + 10);
      }

      // Previous day curve (dashed)
      ctx.beginPath();
      ctx.moveTo(toX(0), toY(prevYields[0]));
      for (let i = 1; i < prevYields.length; i++) {
        const xc = (toX(i - 1) + toX(i)) / 2;
        const yc = (toY(prevYields[i - 1]) + toY(prevYields[i])) / 2;
        ctx.quadraticCurveTo(toX(i - 1), toY(prevYields[i - 1]), xc, yc);
      }
      ctx.lineTo(toX(prevYields.length - 1), toY(prevYields[prevYields.length - 1]));
      ctx.strokeStyle = tradingTheme.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Gradient fill under current curve (teal/blue gradient)
      const gradient = ctx.createLinearGradient(0, pt, 0, pt + ch);
      gradient.addColorStop(0, `${tradingTheme.colors.chart}33`);
      gradient.addColorStop(0.5, tradingTheme.isDark ? 'rgba(41, 121, 255, 0.08)' : 'rgba(41, 121, 255, 0.12)');
      gradient.addColorStop(1, 'rgba(41, 121, 255, 0.01)');
      ctx.beginPath();
      ctx.moveTo(toX(0), toY(yields[0]));
      for (let i = 1; i < yields.length; i++) {
        const xc = (toX(i - 1) + toX(i)) / 2;
        const yc = (toY(yields[i - 1]) + toY(yields[i])) / 2;
        ctx.quadraticCurveTo(toX(i - 1), toY(yields[i - 1]), xc, yc);
      }
      ctx.lineTo(toX(yields.length - 1), toY(yields[yields.length - 1]));
      ctx.lineTo(toX(yields.length - 1), pt + ch);
      ctx.lineTo(toX(0), pt + ch);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Current curve line
      ctx.beginPath();
      ctx.moveTo(toX(0), toY(yields[0]));
      for (let i = 1; i < yields.length; i++) {
        const xc = (toX(i - 1) + toX(i)) / 2;
        const yc = (toY(yields[i - 1]) + toY(yields[i])) / 2;
        ctx.quadraticCurveTo(toX(i - 1), toY(yields[i - 1]), xc, yc);
      }
      ctx.lineTo(toX(yields.length - 1), toY(yields[yields.length - 1]));
      ctx.strokeStyle = tradingTheme.colors.chart;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Data points
      for (let i = 0; i < yields.length; i++) {
        const isHovered = tooltipRef.current?.idx === i;
        const radius = isHovered ? 5 : 3;

        ctx.beginPath();
        ctx.arc(toX(i), toY(yields[i]), radius, 0, Math.PI * 2);
        ctx.fillStyle = tradingTheme.colors.chart;
        ctx.fill();

        if (isHovered) {
          ctx.strokeStyle = `${tradingTheme.colors.chart}4D`;
          ctx.lineWidth = 6;
          ctx.stroke();
        }

        // Value labels (only when not hovered to avoid clutter)
        if (!isHovered) {
          ctx.fillStyle = tradingTheme.colors.text;
          ctx.font = '10px "SF Mono", ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`${yields[i].toFixed(2)}`, toX(i), toY(yields[i]) - 8);
        }
      }

      // Tooltip hover
      if (tooltipRef.current) {
        const { idx } = tooltipRef.current;
        const tx = toX(idx);
        const ty = toY(yields[idx]);

        // Crosshair
        ctx.strokeStyle = `${tradingTheme.colors.chart}33`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(tx, pt);
        ctx.lineTo(tx, pt + ch);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pl, ty);
        ctx.lineTo(pl + cw, ty);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tooltip box
        const tooltipW = 90;
        const tooltipH = 38;
        let tooltipX = tx + 10;
        let tooltipY = ty - tooltipH - 5;
        if (tooltipX + tooltipW > w - pr) tooltipX = tx - tooltipW - 10;
        if (tooltipY < pt) tooltipY = ty + 10;

        ctx.fillStyle = tradingTheme.isDark ? 'rgba(23, 27, 46, 0.95)' : 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = `${tradingTheme.colors.chart}4D`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tooltipX, tooltipY, tooltipW, tooltipH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = tradingTheme.colors.textMuted;
        ctx.font = '10px "Inter", system-ui';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(maturities[idx], tooltipX + 8, tooltipY + 6);

        ctx.fillStyle = tradingTheme.colors.chart;
        ctx.font = 'bold 13px "SF Mono", ui-monospace, monospace';
        ctx.fillText(`${yields[idx].toFixed(2)}%`, tooltipX + 8, tooltipY + 20);

        const chg = yields[idx] - prevYields[idx];
        ctx.fillStyle = chg >= 0 ? tradingTheme.colors.positive : tradingTheme.colors.negative;
        ctx.font = '10px "SF Mono", ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${chg >= 0 ? '+' : ''}${(chg * 100).toFixed(0)}bp`, tooltipX + tooltipW - 8, tooltipY + 22);
      }
    };

    draw();

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const parent = canvas.parentElement;
      if (!parent) return;

      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const pl = 50, pr = 20, pt = 12, pb = 32;
      const cw = w - pl - pr;
      const ch = h - pt - pb;
      const yMin = 3.5;
      const yMax = 5.5;
      const yRange = yMax - yMin;
      const toX = (i: number) => pl + (i / (maturities.length - 1)) * cw;
      const toY = (val: number) => pt + (1 - (val - yMin) / yRange) * ch;

      let closest: number | null = null;
      let closestDist = Infinity;
      for (let i = 0; i < yields.length; i++) {
        const dx = mx - toX(i);
        const dy = my - toY(yields[i]);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist && dist < 30) {
          closestDist = dist;
          closest = i;
        }
      }

      if (closest !== null) {
        tooltipRef.current = { idx: closest, x: toX(closest), y: toY(yields[closest]) };
        setTooltip(tooltipRef.current);
      } else {
        tooltipRef.current = null;
        setTooltip(null);
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };

    const handleMouseLeave = () => {
      tooltipRef.current = null;
      setTooltip(null);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    });
    observer.observe(canvas.parentElement!);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [tradingTheme]);

  return (
    <div className="h-full w-full flex flex-col" style={{ background: tradingTheme.colors.bg, minHeight: 0 }}>
      {/* Period tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: tradingTheme.colors.text }}>US Treasury Yield Curve</span>
        <div className="period-tabs">
          {periods.map(p => (
            <button
              key={p}
              className={`period-tab ${activePeriod === p ? 'period-tab-active' : ''}`}
              onClick={() => setActivePeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>
    </div>
  );
}
