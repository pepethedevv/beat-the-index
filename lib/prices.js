// Market data. All sources are free; CoinGecko works without a key but a free
// demo key raises the limits.

function nearest(series, ts) {
  // series: [[ts, value]] sorted ascending. Returns the last value at or before ts.
  let lo = 0, hi = series.length - 1, best = series[0]?.[1];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= ts) { best = series[mid][1]; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}

// Hourly SOL/USD for the last 31 days
export async function solHistory() {
  const key = process.env.COINGECKO_API_KEY;
  const url = "https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=31";
  const r = await fetch(url, { headers: key ? { "x-cg-demo-api-key": key } : {} });
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
  const j = await r.json();
  return j.prices.map(([ms, usd]) => [Math.floor(ms / 1000), usd]);
}

// Daily SPY closes (SPYx tracks one SPY share)
export async function spyHistory() {
  const r = await fetch("https://stooq.com/q/d/l/?s=spy.us&i=d");
  if (!r.ok) throw new Error(`Stooq ${r.status}`);
  const rows = (await r.text()).trim().split("\n").slice(1);
  return rows.slice(-60).map((line) => {
    const [date, , , , close] = line.split(",");
    // Close is at 16:00 New York, roughly 21:00 UTC
    return [Math.floor(Date.parse(date + "T21:00:00Z") / 1000), Number(close)];
  }).filter(([t, c]) => t && c);
}

// SPY return over the last `days` days, in percent
export function spyReturn(spy, days, nowTs) {
  const last = spy[spy.length - 1][1];
  const startTs = days === 1 ? spy[spy.length - 2][0] : nowTs - days * 86400;
  const start = nearest(spy, startTs);
  return (last / start - 1) * 100;
}

// Current USD prices from Jupiter, batched
export async function pricesNow(mints) {
  const base = process.env.JUP_PRICE_URL || "https://lite-api.jup.ag/price/v3";
  const out = {};
  for (let i = 0; i < mints.length; i += 50) {
    const ids = mints.slice(i, i + 50).join(",");
    const r = await fetch(`${base}?ids=${ids}`);
    if (!r.ok) continue;
    const j = await r.json();
    const data = j.data || j;
    for (const [mint, v] of Object.entries(data)) {
      const p = Number(v?.usdPrice ?? v?.price);
      if (Number.isFinite(p)) out[mint] = p;
    }
  }
  return out;
}

export { nearest };
