/* ASTRA Terminal — candlestick pattern recognition.
   Pure detection over candle arrays; used for chart markers AND as Observer strategies. */
const PAT = {
  /* helpers */
  body(c){ return Math.abs(c.close - c.open); },
  range(c){ return c.high - c.low || 1e-12; },
  upWick(c){ return c.high - Math.max(c.open, c.close); },
  dnWick(c){ return Math.min(c.open, c.close) - c.low; },
  green(c){ return c.close >= c.open; },
  /* net direction of the few bars before i (trend context) */
  ctxDir(c, i, n){
    const a = c[Math.max(0, i - n)], b = c[i - 1];
    if (!a || !b) return 0;
    const d = (b.close - a.close) / a.close;
    return d > 0.004 ? 1 : d < -0.004 ? -1 : 0;
  },

  /* detect patterns at bar i; returns [{dir, name}] (dir 0 = informational) */
  at(c, i){
    if (i < 4) return [];
    const out = [];
    const b = c[i], a = c[i - 1], a2 = c[i - 2];
    const body = this.body(b), rng = this.range(b);
    const trend = this.ctxDir(c, i, 4);

    // doji — indecision (marker only)
    if (body < 0.08 * rng && rng > 0) out.push({ dir: 0, name: 'Doji' });

    // hammer / shooting star (need prior trend)
    if (trend < 0 && this.dnWick(b) >= 2 * body && this.upWick(b) <= Math.max(body * 0.5, rng * 0.12))
      out.push({ dir: 1, name: 'Hammer' });
    if (trend > 0 && this.upWick(b) >= 2 * body && this.dnWick(b) <= Math.max(body * 0.5, rng * 0.12))
      out.push({ dir: -1, name: 'Shooting star' });

    // engulfing
    if (!this.green(a) && this.green(b) && b.close > a.open && b.open < a.close && this.body(a) > 0)
      out.push({ dir: 1, name: 'Bullish engulfing' });
    if (this.green(a) && !this.green(b) && b.close < a.open && b.open > a.close && this.body(a) > 0)
      out.push({ dir: -1, name: 'Bearish engulfing' });

    // morning / evening star
    if (a2 && !this.green(a2) && this.body(a2) > 0.5 * this.range(a2) &&
        this.body(a) < 0.35 * this.body(a2) &&
        this.green(b) && b.close > (a2.open + a2.close) / 2)
      out.push({ dir: 1, name: 'Morning star' });
    if (a2 && this.green(a2) && this.body(a2) > 0.5 * this.range(a2) &&
        this.body(a) < 0.35 * this.body(a2) &&
        !this.green(b) && b.close < (a2.open + a2.close) / 2)
      out.push({ dir: -1, name: 'Evening star' });

    // three white soldiers / black crows
    if (a2 && this.green(a2) && this.green(a) && this.green(b) &&
        a.close > a2.close && b.close > a.close &&
        this.body(a2) > 0.5 * this.range(a2) && this.body(a) > 0.5 * this.range(a) && this.body(b) > 0.5 * rng)
      out.push({ dir: 1, name: 'Three soldiers' });
    if (a2 && !this.green(a2) && !this.green(a) && !this.green(b) &&
        a.close < a2.close && b.close < a.close &&
        this.body(a2) > 0.5 * this.range(a2) && this.body(a) > 0.5 * this.range(a) && this.body(b) > 0.5 * rng)
      out.push({ dir: -1, name: 'Three crows' });

    // tweezers
    const tol = Math.max(b.close * 0.0007, 1e-10);
    if (trend < 0 && !this.green(a) && this.green(b) && Math.abs(a.low - b.low) < tol)
      out.push({ dir: 1, name: 'Tweezer bottom' });
    if (trend > 0 && this.green(a) && !this.green(b) && Math.abs(a.high - b.high) < tol)
      out.push({ dir: -1, name: 'Tweezer top' });

    return out;
  },

  /* index every bar: array (same length) of pattern lists */
  index(c){
    const out = new Array(c.length);
    for (let i = 0; i < c.length; i++) out[i] = this.at(c, i);
    return out;
  },
};
