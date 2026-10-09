import assert from "node:assert/strict";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { extractTrades, windowReturn } from "../lib/pnl.js";
import { spyReturn, nearest } from "../lib/prices.js";
import { joinMessage } from "../api/join.js";

const W = "Wa11etAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SPYX = "SPYxMintXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const MEME = "MemeMintXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const MEME2 = "Meme2MintXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const mints = { solMint: SOL, usdcMint: USDC, spyxMint: SPYX };

const tok = (mint, amount, decimals = 6, user = W) => ({ userAccount: user, mint, rawTokenAmount: { tokenAmount: String(Math.round(amount * 10 ** decimals)), decimals } });
const tx = (ts, solLamports, changes, extra = {}) => ({
  signature: "sig" + ts, timestamp: ts,
  accountData: [{ account: W, nativeBalanceChange: solLamports, tokenBalanceChanges: [] }, { account: "ata", nativeBalanceChange: 0, tokenBalanceChanges: changes }],
  ...extra,
});

const txs = [
  tx(1000, -1_000_005_000, [tok(MEME, 1000)]),            // buy 1000 MEME for 1 SOL
  tx(2000, 1_499_995_000, [tok(MEME, -600)]),             // sell 600 MEME for 1.5 SOL
  tx(3000, -5000, [tok(SPYX, -2, 8), tok(MEME2, 500)]),   // buy 500 MEME2 for 2 SPYx
  tx(4000, -5000, [tok(USDC, -100), tok(MEME, 100)]),     // buy 100 MEME for 100 USDC
  tx(5000, -5000, [tok(MEME, -50), tok(MEME2, 50)]),      // token-to-token: skipped
  tx(6000, 0, [tok(MEME, 10)]),                           // airdrop: skipped
  tx(7000, -1_000_000_000, [tok(MEME, 1)], { transactionError: { x: 1 } }), // failed: skipped
  tx(8000, 0, [tok(SOL, -0.5, 9), tok(MEME2, 20)]),       // wrapped SOL counts as SOL
];

const trades = extractTrades(txs, W, mints);
assert.equal(trades.length, 5, "five real trades");
assert.deepEqual(trades.map((t) => t.quote), ["SOL", "SOL", "SPYX", "USDC", "SOL"]);
assert.ok(Math.abs(trades[0].quoteAmt - 1.000005) < 1e-9);
assert.equal(trades[1].qty, -600);
assert.equal(trades[2].quoteAmt, 2);

// SOL = $100, SPYx = $600, MEME now $0.5, MEME2 now $3
const usdAt = (q) => ({ SOL: 100, USDC: 1, SPYX: 600 }[q]);
const price = (m) => ({ [MEME]: 0.5, [MEME2]: 3 }[m] || 0);
const r = windowReturn(trades, 0, usdAt, price);
// MEME: cost 100.0005 + 100 = 200.0005, sold 600 for 149.9995, 500 left * 0.5 = 250
// MEME2: cost 1200 + 50 = 1250, 520 left * 3 = 1560
const cost = 200.0005 + 1250, pnl = (149.9995 + 250 - 200.0005) + (1560 - 1250);
assert.ok(Math.abs(r.cost - cost) < 1e-6);
assert.ok(Math.abs(r.pnl - pnl) < 1e-6);
assert.equal(r.trades, 5);
assert.ok(Math.abs(r.ret - (pnl / cost) * 100) < 1e-9);

// Window that starts after the MEME buy: the sell has no matching buy, so it can't count as profit
const late = windowReturn(trades, 1500, usdAt, price);
assert.ok(Math.abs(late.cost - (100 + 1250)) < 1e-6);

// Selling more than bought inside the window only counts the matched part
const over = windowReturn([{ ts: 1, mint: MEME, qty: 10, quote: "USDC", quoteAmt: 10 }, { ts: 2, mint: MEME, qty: -20, quote: "USDC", quoteAmt: 40 }], 0, usdAt, price);
assert.equal(over.pnl, 10); // 20 proceeds for the matched 10, minus 10 cost

// Price series helpers
const series = [[100, 1], [200, 2], [300, 3]];
assert.equal(nearest(series, 250), 2);
assert.equal(nearest(series, 50), 1);
const spy = [[0, 500], [86400, 505], [2 * 86400, 510]];
assert.ok(Math.abs(spyReturn(spy, 1, 2 * 86400) - (510 / 505 - 1) * 100) < 1e-9);

// Join signature round trip
const kp = nacl.sign.keyPair();
const wallet = bs58.encode(kp.publicKey);
const time = new Date().toISOString();
const sig = nacl.sign.detached(new TextEncoder().encode(joinMessage(wallet, time)), kp.secretKey);
const b64 = Buffer.from(sig).toString("base64");
assert.ok(nacl.sign.detached.verify(new TextEncoder().encode(joinMessage(wallet, time)), Buffer.from(b64, "base64"), bs58.decode(wallet)));
assert.ok(!nacl.sign.detached.verify(new TextEncoder().encode(joinMessage(wallet, "other")), Buffer.from(b64, "base64"), bs58.decode(wallet)));

console.log("All tests passed");
