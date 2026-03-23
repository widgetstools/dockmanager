import { useEffect, useRef } from 'react';
import { newsData } from '../data/news';
import { useTradingTheme } from '../context/ThemeContext';

const categoryConfig: Record<string, { color: string; label: string }> = {
  rates: { color: '#2979ff', label: 'RATES' },
  credit: { color: '#00c853', label: 'CREDIT' },
  macro: { color: '#ffc107', label: 'MACRO' },
  muni: { color: '#ab47bc', label: 'MUNI' },
  agency: { color: '#00bcd4', label: 'AGENCY' },
};

// Assign impact levels based on id for variety
const impactMap: Record<number, 'high' | 'medium' | 'low'> = {
  1: 'high', 2: 'high', 4: 'medium', 5: 'medium', 6: 'low',
  8: 'high', 9: 'low', 10: 'medium', 11: 'medium', 13: 'high',
  16: 'medium', 18: 'medium', 20: 'high',
};

function getRelativeTime(timestamp: string): string {
  // Parse HH:MM format, compute relative from "now" (14:35)
  const [h, m] = timestamp.split(':').map(Number);
  const nowH = 14, nowM = 35;
  const diffMin = (nowH * 60 + nowM) - (h * 60 + m);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  return `${hours}h ago`;
}

export function NewsFeed() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tradingTheme = useTradingTheme();

  const impactColors = {
    high: tradingTheme.colors.negative,
    medium: tradingTheme.colors.warning,
    low: tradingTheme.colors.positive,
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let animating = true;
    let raf: number;

    const scroll = () => {
      if (!animating || !el) return;
      if (el.scrollTop >= el.scrollHeight - el.clientHeight - 1) {
        el.scrollTop = 0;
      } else {
        el.scrollTop += 0.5;
      }
      raf = requestAnimationFrame(scroll);
    };

    const timer = setTimeout(() => {
      raf = requestAnimationFrame(scroll);
    }, 2000);

    const handleEnter = () => { animating = false; cancelAnimationFrame(raf); };
    const handleLeave = () => { animating = true; raf = requestAnimationFrame(scroll); };

    el.addEventListener('mouseenter', handleEnter);
    el.addEventListener('mouseleave', handleLeave);

    return () => {
      animating = false;
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      el.removeEventListener('mouseenter', handleEnter);
      el.removeEventListener('mouseleave', handleLeave);
    };
  }, []);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto" style={{ background: tradingTheme.colors.bg }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {newsData.map(item => {
          const cat = categoryConfig[item.category];
          const impact = impactMap[item.id] ?? 'low';
          const impactColor = impactColors[impact];
          return (
            <div
              key={item.id}
              style={{
                borderBottom: `1px solid ${tradingTheme.colors.border}`,
                padding: '6px 10px',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = tradingTheme.colors.hoverBg)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                {/* Impact indicator */}
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    backgroundColor: impactColor,
                    flexShrink: 0,
                  }}
                />
                {/* Category badge */}
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: cat.color,
                    padding: '0 4px',
                    borderRadius: 2,
                    background: `${cat.color}15`,
                  }}
                >
                  {cat.label}
                </span>
                {/* Relative time */}
                <span className="font-mono-num" style={{ fontSize: 9, color: tradingTheme.colors.textSecondary, marginLeft: 'auto' }}>
                  {getRelativeTime(item.timestamp)}
                </span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: tradingTheme.colors.text, lineHeight: 1.35 }}>
                {item.headline}
              </div>
              <div style={{ fontSize: 10, color: tradingTheme.colors.textSecondary, marginTop: 1, lineHeight: 1.3 }}>
                {item.summary}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
