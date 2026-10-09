import { PERIODS, MIN_TRADES, MIN_VOLUME_USD, SOL_MINT, USDC_MINT, SPYX_MINT } from "./config.js";
import { extractTrades, windowReturn } from "./pnl.js";
import { solHistory, spyHistory, spyReturn, pricesNow, nearest } from "./prices.js";
import { walletTxs } from "./helius.js";

// Market data shared by every wallet in one run
export async function buildContext() {
  const now = Math.floor(Date.now() / 1000);
  const [sol, spy] = await Promise.all([solHistory(), spyHistory()]);
  const spyRet = {};
  for (const [p, days] of Object.entries(PERIODS)) spyRet[p] = spyReturn(spy, days, now);
  return { now, sol, spy, spyRet, priceCache: {} };
}

function usdAtFor(ctx) {
  return (quote, ts) => {
    if (quote === "USDC") return 1;
    if (quote === "SOL") return nearest(ctx.sol, ts);
    if (quote === "SPYX") return nearest(ctx.spy, ts);
    return 0;
  };
}

// Scores for one wallet across all periods
export async function computeWallet(wallet, ctx) {
  const since = ctx.now - PERIODS.month * 86400;
  const txs = await walletTxs(wallet, since);
  const trades = extractTrades(txs, wallet, { solMint: SOL_MINT, usdcMint: USDC_MINT, spyxMint: SPYX_MINT });

  const need = [...new Set(trades.map((t) => t.mint))].filter((m) => !(m in ctx.priceCache));
  if (need.length) Object.assign(ctx.priceCache, await pricesNow(need));
  const priceNow = (m) => ctx.priceCache[m] || 0;
  const usdAt = usdAtFor(ctx);

  const out = {};
  for (const [p, days] of Object.entries(PERIODS)) {
    const r = windowReturn(trades, ctx.now - days * 86400, usdAt, priceNow);
    out[p] = {
      ret: r.ret,
      vs: r.ret - ctx.spyRet[p],
      trades: r.trades,
      volume: r.volume,
      qualified: r.trades >= MIN_TRADES && r.volume >= MIN_VOLUME_USD,
    };
  }
  return out;
}

export function scoreRows(wallet, scores) {
  const at = new Date().toISOString();
  return Object.entries(scores).map(([period, s]) => ({
    wallet, period,
    ret: round(s.ret), vs: round(s.vs), trades: s.trades, volume: round(s.volume),
    qualified: s.qualified, computed_at: at,
  }));
}

function round(n) { return Math.round(n * 100) / 100; }
