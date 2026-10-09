import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "node:crypto";
import { db, readJson, send } from "../lib/db.js";
import { BASE58_RE } from "../lib/config.js";
import { buildContext, computeWallet, scoreRows } from "../lib/compute.js";

// The browser asks the wallet to sign exactly this text. No transaction, no fee.
export function joinMessage(wallet, iso) {
  return `Join the Beat The Index leaderboard\nWallet: ${wallet}\nTime: ${iso}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const { wallet, time, signature } = await readJson(req);

  if (!BASE58_RE.test(wallet || "")) return send(res, 400, { error: "Invalid wallet address" });
  const t = Date.parse(time || "");
  if (!t || Math.abs(Date.now() - t) > 10 * 60 * 1000) return send(res, 400, { error: "Signature expired. Try joining again." });

  let ok = false;
  try {
    const msg = new TextEncoder().encode(joinMessage(wallet, time));
    ok = nacl.sign.detached.verify(msg, Buffer.from(signature, "base64"), bs58.decode(wallet));
  } catch { ok = false; }
  if (!ok) return send(res, 401, { error: "Signature does not match this wallet" });

  const token = crypto.randomBytes(24).toString("base64url");
  const { error } = await db().from("participants").upsert({ wallet, session_token: token }, { onConflict: "wallet" });
  if (error) return send(res, 500, { error: "Could not save. Try again." });

  // First score right away, so the person sees themselves without waiting for the cron
  try {
    const ctx = await buildContext();
    const scores = await computeWallet(wallet, ctx);
    await db().from("scores").upsert(scoreRows(wallet, scores));
    await db().from("participants").update({ last_computed: new Date().toISOString() }).eq("wallet", wallet);
  } catch (e) {
    console.error("first compute failed", e);
  }
  return send(res, 200, { token });
}
