import { db, send } from "../lib/db.js";
import { PERIODS } from "../lib/config.js";

export default async function handler(req, res) {
  const period = new URL(req.url, "http://x").searchParams.get("period") || "week";
  if (!PERIODS[period]) return send(res, 400, { error: "period must be day, week or month" });

  const [{ data: rows, error }, { data: meta }] = await Promise.all([
    db().from("scores")
      .select("wallet, ret, vs, trades, volume, computed_at, participants(x_handle, x_avatar)")
      .eq("period", period).eq("qualified", true)
      .order("vs", { ascending: false }).limit(100),
    db().from("meta").select("value").eq("key", "spy").maybeSingle(),
  ]);
  if (error) return send(res, 500, { error: "Could not load the board" });

  return send(res, 200, {
    period,
    spy: meta?.value?.[period] ?? null,
    updated: meta?.value?.at ?? null,
    rows: rows.map((r) => ({
      wallet: r.wallet,
      handle: r.participants?.x_handle || null,
      avatar: r.participants?.x_avatar || null,
      ret: Number(r.ret), vs: Number(r.vs), trades: r.trades, volume: Number(r.volume),
    })),
  }, 120);
}
