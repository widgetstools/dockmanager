import { useState, useCallback, useMemo } from 'react';
import { Send } from 'lucide-react';
import { useTradingTheme } from '../context/ThemeContext';

const securities = [
  'US Treasury 2Y', 'US Treasury 5Y', 'US Treasury 10Y', 'US Treasury 30Y',
  'Apple Inc 3.85 29', 'JPMorgan 4.95 28', 'Microsoft 3.50 30',
  'Goldman Sachs 5.15 29', 'FHLB 4.875 28', 'Fannie Mae 4.625 29',
];

const counterparties = [
  'Goldman Sachs', 'JPMorgan', 'Citigroup', 'Barclays', 'Morgan Stanley',
  'Deutsche Bank', 'HSBC', 'UBS', 'BNP Paribas', 'Credit Suisse',
];

const orderTypes = ['Limit', 'Market', 'Stop'] as const;

export function TradeTicket() {
  const [side, setSide] = useState<'Buy' | 'Sell'>('Buy');
  const [security, setSecurity] = useState(securities[0]);
  const [qty, setQty] = useState('1000');
  const [price, setPrice] = useState('99.500');
  const [orderType, setOrderType] = useState<string>('Limit');
  const [counterparty, setCounterparty] = useState(counterparties[0]);
  const [toast, setToast] = useState<string | null>(null);
  const tradingTheme = useTradingTheme();

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setToast(`${side} ${qty} ${security} @ ${price} sent to ${counterparty}`);
    setTimeout(() => setToast(null), 3000);
  }, [side, qty, security, price, counterparty]);

  const estNotional = useMemo(() => {
    const q = parseFloat(qty) || 0;
    const p = parseFloat(price) || 0;
    return (q * p / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }, [qty, price]);

  return (
    <div className="h-full overflow-y-auto" style={{ background: tradingTheme.colors.bg, padding: 10 }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Side toggle — large prominent buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 2 }}>
          <button
            type="button"
            onClick={() => setSide('Buy')}
            style={{
              padding: '10px 0',
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.05em',
              transition: 'all 0.15s',
              background: side === 'Buy' ? tradingTheme.colors.positive : `${tradingTheme.colors.positive}14`,
              color: side === 'Buy' ? tradingTheme.colors.bg : tradingTheme.colors.positive,
            }}
          >
            BUY
          </button>
          <button
            type="button"
            onClick={() => setSide('Sell')}
            style={{
              padding: '10px 0',
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.05em',
              transition: 'all 0.15s',
              background: side === 'Sell' ? tradingTheme.colors.negative : `${tradingTheme.colors.negative}14`,
              color: side === 'Sell' ? '#fff' : tradingTheme.colors.negative,
            }}
          >
            SELL
          </button>
        </div>

        {/* Security */}
        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 500, color: tradingTheme.colors.textMuted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Security</label>
          <select value={security} onChange={e => setSecurity(e.target.value)} className="input-dark">
            {securities.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Quantity */}
        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 500, color: tradingTheme.colors.textMuted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quantity (000s)</label>
          <input
            type="number"
            value={qty}
            onChange={e => setQty(e.target.value)}
            className="input-dark font-mono-num"
            min="1"
            step="100"
          />
        </div>

        {/* Order Type */}
        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 500, color: tradingTheme.colors.textMuted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order Type</label>
          <div style={{ display: 'flex', gap: 2, background: tradingTheme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', borderRadius: 4, padding: 2 }}>
            {orderTypes.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setOrderType(t)}
                style={{
                  flex: 1,
                  padding: '4px 0',
                  border: 'none',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 500,
                  transition: 'all 0.15s',
                  background: orderType === t ? `${tradingTheme.colors.accent}33` : 'transparent',
                  color: orderType === t ? tradingTheme.colors.accent : tradingTheme.colors.textMuted,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Price */}
        {orderType !== 'Market' && (
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 500, color: tradingTheme.colors.textMuted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Price</label>
            <input
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
              className="input-dark font-mono-num"
              step="0.001"
            />
          </div>
        )}

        {/* Counterparty */}
        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 500, color: tradingTheme.colors.textMuted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Counterparty</label>
          <select value={counterparty} onChange={e => setCounterparty(e.target.value)} className="input-dark">
            {counterparties.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Estimated cost section */}
        <div className="glass-card" style={{ padding: '8px 10px', marginTop: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: tradingTheme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Est. Notional</span>
            <span className="font-mono-num" style={{ fontSize: 14, fontWeight: 700, color: tradingTheme.colors.text }}>${estNotional}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: tradingTheme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Accrued Int.</span>
            <span className="font-mono-num" style={{ fontSize: 11, color: tradingTheme.colors.textMuted }}>$1,247</span>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          style={{
            marginTop: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '9px 0',
            borderRadius: 4,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: '0.03em',
            transition: 'all 0.15s',
            background: side === 'Buy' ? tradingTheme.colors.positive : tradingTheme.colors.negative,
            color: side === 'Buy' ? tradingTheme.colors.bg : '#fff',
          }}
        >
          <Send size={12} />
          SUBMIT {side === 'Buy' ? 'BUY' : 'SELL'} ORDER
        </button>
      </form>

      {/* Toast */}
      {toast && (
        <div
          style={{
            marginTop: 8,
            padding: '6px 10px',
            borderRadius: 4,
            fontSize: 11,
            background: `${tradingTheme.colors.accent}1a`,
            border: `1px solid ${tradingTheme.colors.accent}33`,
            color: tradingTheme.colors.accent,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
