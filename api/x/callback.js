import { db } from "../../lib/db.js";
import { env } from "../../lib/config.js";

function back(res, query) {
  res.statusCode = 302;
  res.setHeader("location", `/?${query}`);
  res.end();
}

// Step 2 of "Link X": X sends the person back here after they approve.
export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) return back(res, "xerror=cancelled");

  const { data: s } = await db().from("oauth_states").select("*").eq("state", state).maybeSingle();
  if (!s || Date.now() - Date.parse(s.created_at) > 10 * 60 * 1000) return back(res, "xerror=expired");
  await db().from("oauth_states").delete().eq("state", state);

  const basic = Buffer.from(`${env("X_CLIENT_ID")}:${env("X_CLIENT_SECRET")}`).toString("base64");
  const tr = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: env("X_REDIRECT_URI"), code_verifier: s.verifier }),
  });
  if (!tr.ok) { console.error("x token", tr.status, await tr.text()); return back(res, "xerror=failed"); }
  const { access_token } = await tr.json();

  const ur = await fetch("https://api.x.com/2/users/me?user.fields=profile_image_url", { headers: { authorization: `Bearer ${access_token}` } });
  if (!ur.ok) { console.error("x me", ur.status, await ur.text()); return back(res, "xerror=failed"); }
  const { data: me } = await ur.json();

  // One X account per wallet, so nobody stacks the board with many wallets under one name
  const { data: taken } = await db().from("participants").select("wallet").eq("x_id", me.id).maybeSingle();
  if (taken && taken.wallet !== s.wallet) return back(res, "xerror=taken");

  await db().from("participants")
    .update({ x_id: me.id, x_handle: me.username, x_avatar: me.profile_image_url || null })
    .eq("wallet", s.wallet);
  return back(res, `linked=${encodeURIComponent(me.username)}`);
}
