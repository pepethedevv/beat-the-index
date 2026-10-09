export const MIN_TRADES = 30;
export const MIN_VOLUME_USD = 1000;

// Rolling windows, in days
export const PERIODS = { day: 1, week: 7, month: 30 };

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SPYX_MINT = process.env.SPYX_MINT || "";

export const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}
