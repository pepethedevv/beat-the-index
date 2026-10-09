import { createClient } from "@supabase/supabase-js";
import { env } from "./config.js";

let client;
export function db() {
  if (!client) client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  return client;
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { return {}; }
}

export function send(res, status, body, cacheSeconds = 0) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  if (cacheSeconds) res.setHeader("cache-control", `public, s-maxage=${cacheSeconds}, stale-while-revalidate=60`);
  res.end(JSON.stringify(body));
}
