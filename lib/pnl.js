// Pure trade logic. No network calls here, so it can be tested on sample data.

/**
 * Turn Helius enhanced transactions into buy/sell trades for one wallet.
 * A trade is a transaction where exactly one non-quote token changed for the
 * wallet and a quote asset (SOL, USDC or SPYx) moved the other way.
 *
 * Returns [{ ts, sig, mint, qty, quote, quoteAmt }]
 *   qty > 0 is a buy, qty < 0 is a sell. quoteAmt is always positive.
 */
export function extractTrades(txs, wallet, { solMint, usdcMint, spyxMint }) {
  const trades = [];
  for (const tx of txs) {
    if (tx.transactionError) continue;
    const d = {};
    let sol = 0;
    for (const ad of tx.accountData || []) {
      if (ad.account === wallet) sol += (ad.nativeBalanceChange || 0) / 1e9;
      for (const t of ad.tokenBalanceChanges || []) {
        if (t.userAccount !== wallet) continue;
        const raw = t.rawTokenAmount || {};
        const amt = Number(raw.tokenAmount) / 10 ** Number(raw.decimals || 0);
        if (!Number.isFinite(amt) || amt === 0) continue;
        d[t.mint] = (d[t.mint] || 0) + amt;
      }
    }
    // Wrapped SOL counts as SOL
    if (d[solMint]) { sol += d[solMint]; delete d[solMint]; }
    const usdc = d[usdcMint] || 0; delete d[usdcMint];
    const spyx = spyxMint ? d[spyxMint] || 0 : 0; if (spyxMint) delete d[spyxMint];

    const others = Object.entries(d).filter(([, v]) => Math.abs(v) > 0);
    if (others.length !== 1) continue; // transfers, token-to-token swaps, airdrops
    const [mint, qty] = others[0];

    // Pick the quote leg that moved opposite to the token. Prefer USDC/SPYx,
    // because SOL also moves slightly for fees on every transaction.
    let quote = null, amt = 0;
    for (const [name, v] of [["USDC", usdc], ["SPYX", spyx], ["SOL", sol]]) {
      if (v !== 0 && Math.sign(v) === -Math.sign(qty)) { quote = name; amt = Math.abs(v); break; }
    }
    if (!quote) continue;
    trades.push({ ts: tx.timestamp, sig: tx.signature, mint, qty, quote, quoteAmt: amt });
  }
  return trades;
}

/**
 * Return on capital for the trades inside a window.
 * Sells are matched only against buys made inside the same window, so coins
 * bought before the window don't count as free profit.
 * Open positions are valued at the current price (0 if no price is found).
 *
 * usdAt(quote, ts) -> USD value of 1 unit of the quote asset at that time
 * priceNow(mint)   -> current USD price of the token, or 0
 */
export function windowReturn(trades, sinceTs, usdAt, priceNow) {
  const per = new Map();
  let count = 0, volume = 0;
  for (const t of trades) {
    if (t.ts < sinceTs) continue;
    const usd = t.quoteAmt * usdAt(t.quote, t.ts);
    if (!Number.isFinite(usd) || usd <= 0) continue;
    count++;
    volume += usd;
    const p = per.get(t.mint) || { qb: 0, cb: 0, qs: 0, ps: 0 };
    if (t.qty > 0) { p.qb += t.qty; p.cb += usd; } else { p.qs += -t.qty; p.ps += usd; }
    per.set(t.mint, p);
  }
  let cost = 0, pnl = 0;
  for (const [mint, p] of per) {
    if (p.qb === 0) continue; // only sells in window: cost unknown, skip
    const matched = Math.min(p.qs, p.qb);
    const realized = p.qs > 0 ? p.ps * (matched / p.qs) : 0;
    const open = (p.qb - matched) * (priceNow(mint) || 0);
    cost += p.cb;
    pnl += realized + open - p.cb;
  }
  const ret = cost > 0 ? (pnl / cost) * 100 : 0;
  return { ret, pnl, cost, trades: count, volume };
}
