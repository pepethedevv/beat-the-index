import { db, send } from "../lib/db.js";
import { BASE58_RE } from "../lib/config.js";
import { buildContext, computeWallet, scoreRows } from "../lib/compute.js";

// Report card for any wallet. Only stored if that wallet has joined.
export default async function handler(req, res) {
  const wallet = new URL(req.url, "http://x").searchParams.get("wallet") || "";
  if (!BASE58_RE.test(wallet)) return send(res, 400, { error: "That doesn't look like a Solana address." });

  let scores, ctx;
  try {
    ctx = await buildContext();
    scores = await computeWallet(wallet, ctx);
  } catch (e) {
    console.error(e);
    return send(res, 502, { error: "Trade data is busy right now. Try again in a minute." });
  }

  const { data: member } = await db().from("participants").select("wallet").eq("wallet", wallet).maybeSingle();
  if (member) {
    await db().from("scores").upsert(scoreRows(wallet, scores));
    await db().from("participants").update({ last_computed: new Date().toISOString() }).eq("wallet", wallet);
  }

  const m = scores.month;
  const { count } = await db().from("scores").select("wallet", { count: "exact", head: true })
    .eq("period", "month").eq("qualified", true).gt("vs", m.vs).neq("wallet", wallet);

  return send(res, 200, { wallet, joined: !!member, spy: ctx.spyRet, scores, rank: (count ?? 0) + 1 }, 600);
}
