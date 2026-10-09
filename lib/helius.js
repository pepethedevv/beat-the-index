import { env } from "./config.js";

// All transactions for a wallet since `sinceTs`, newest first, parsed by Helius.
export async function walletTxs(wallet, sinceTs, maxPages = 25) {
  const key = env("HELIUS_API_KEY");
  const base = process.env.HELIUS_BASE || "https://api.helius.xyz";
  const all = [];
  let before = "";
  for (let page = 0; page < maxPages; page++) {
    const url = `${base}/v0/addresses/${wallet}/transactions?api-key=${key}&limit=100${before ? `&before=${before}` : ""}`;
    const r = await fetch(url);
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 1200)); page--; continue; }
    if (!r.ok) throw new Error(`Helius ${r.status}`);
    const batch = await r.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const tx of batch) if (tx.timestamp >= sinceTs) all.push(tx);
    const last = batch[batch.length - 1];
    if (last.timestamp < sinceTs) break;
    before = last.signature;
  }
  return all;
}
