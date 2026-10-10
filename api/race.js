import { send } from "../lib/db.js";
import { SPYX_MINT } from "../lib/config.js";

// Last 24 hours of $BEAT vs SPYx, for the race chart on the home page.
// Until BEAT_MINT is set in Vercel, it answers { live: false } and the page shows simulated prices.

const GT = "https://api.geckoterminal.com/api/v2/networks/solana";

async function gt(path) {
  const r = await fetch(GT + path, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`GeckoTerminal ${r.status} ${path}`);
  return r.json();
}

// 15-minute USD closes for a token, oldest first: [[ts, price]]
async function candles(mint) {
  const pools = await gt(`/tokens/${mint}/pools?page=1`);
  const pool = pools.data?.[0]?.attributes?.address;
  if (!pool) throw new Error(`No pool for ${mint}`);
  const j = await gt(`/pools/${pool}/ohlcv/minute?aggregate=15&limit=100&currency=usd&token=${mint}`);
  return (j.data?.attributes?.ohlcv_list || []).map((c) => [c[0], c[4]]).sort((a, b) => a[0] - b[0]);
}

function priceAt(series, ts) {
  let p = series[0]?.[1];
  for (const [t, v] of series) { if (t <= ts) p = v; else break; }
  return p;
}

async function potBalance(wallet) {
  const key = process.env.HELIUS_API_KEY;
  if (!wallet || !key || !SPYX_MINT) return null;
  const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner", params: [wallet, { mint: SPYX_MINT }, { encoding: "jsonParsed" }] }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return (j.result?.value || []).reduce((s, a) => s + (a.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0), 0);
}

export default async function handler(req, res) {
  const mint = process.env.BEAT_MINT;
  if (!mint) return send(res, 200, { live: false }, 60);
  try {
    const since = Math.floor(Date.now() / 1000) - 86400;
    const [beat, spy, pot] = await Promise.all([candles(mint), candles(SPYX_MINT), potBalance(process.env.CREATOR_WALLET)]);
    const pts = beat.filter(([t]) => t >= since);
    const potOut = pot == null ? null : { spyx: pot, wallet: process.env.CREATOR_WALLET };
    if (pts.length < 2) return send(res, 200, { live: false, mint, pot: potOut, reason: "Not enough trading history yet" }, 60);
    const b0 = pts[0][1], s0 = priceAt(spy, pts[0][0]);
    return send(res, 200, {
      live: true,
      mint,
      beat: pts.map(([, p]) => (p / b0 - 1) * 100),
      spy: pts.map(([t]) => (priceAt(spy, t) / s0 - 1) * 100),
      pot: potOut,
    }, 60);
  } catch (e) {
    console.error(e);
    return send(res, 200, { live: false, mint, reason: "Price data is unavailable right now" }, 30);
  }
}
