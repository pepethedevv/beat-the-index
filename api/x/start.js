import crypto from "node:crypto";
import { db, send } from "../../lib/db.js";
import { env } from "../../lib/config.js";

// Step 1 of "Link X": only someone who joined with their wallet holds a token.
export default async function handler(req, res) {
  const token = new URL(req.url, "http://x").searchParams.get("token") || "";
  const { data: p } = await db().from("participants").select("wallet").eq("session_token", token).maybeSingle();
  if (!p) return send(res, 401, { error: "Join with your wallet first." });

  const state = crypto.randomBytes(16).toString("base64url");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  await db().from("oauth_states").insert({ state, verifier, wallet: p.wallet });

  const q = new URLSearchParams({
    response_type: "code",
    client_id: env("X_CLIENT_ID"),
    redirect_uri: env("X_REDIRECT_URI"),
    scope: "users.read tweet.read",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  res.statusCode = 302;
  res.setHeader("location", `https://x.com/i/oauth2/authorize?${q}`);
  res.end();
}
