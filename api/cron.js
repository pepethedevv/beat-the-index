import { db, send } from "../lib/db.js";
import { buildContext, computeWallet, scoreRows } from "../lib/compute.js";

// Recomputes the wallets that were updated longest ago, until the time budget runs out.
// Call it often (every 10 minutes from cron-job.org) so every wallet stays fresh.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url, "http://x");
  const given = (req.headers.authorization || "").replace("Bearer ", "") || url.searchParams.get("key");
  if (!secret || given !== secret) return send(res, 401, { error: "Unauthorized" });

  const started = Date.now();
  const ctx = await buildContext();
  await db().from("meta").upsert({ key: "spy", value: { ...ctx.spyRet, at: new Date().toISOString() } });

  const { data: due } = await db().from("participants").select("wallet")
    .order("last_computed", { ascending: true, nullsFirst: true }).limit(40);

  let done = 0, failed = 0;
  for (const { wallet } of due || []) {
    if (Date.now() - started > 45_000) break;
    try {
      const scores = await computeWallet(wallet, ctx);
      await db().from("scores").upsert(scoreRows(wallet, scores));
      done++;
    } catch (e) {
      console.error(wallet, e.message);
      failed++;
    }
    await db().from("participants").update({ last_computed: new Date().toISOString() }).eq("wallet", wallet);
  }

  // Clean up abandoned X logins
  await db().from("oauth_states").delete().lt("created_at", new Date(Date.now() - 3600_000).toISOString());
  return send(res, 200, { done, failed });
}
