/** Plain-text renderings of API responses. Rule: no result is ever described as safe. */

export interface CoinRecord {
  ca: string;
  chain: string;
  in_set: boolean;
  outcome?: string | null;
  creator?: string | null;
  launches?: number | null;
  failure_pct?: number | null;
  band?: string | null;
  median_ttr_s?: number | null;
  card_url?: string;
  status?: string;
}

export interface CreatorRecord {
  launched?: number | null;
  rugged?: number | null;
  died?: number | null;
  active?: number | null;
  survived?: number | null;
  graduated?: number | null;
  resolved?: number | null;
  rug_rate?: number | null;
  failure_rate?: number | null;
  known_bad?: boolean | null;
  asof?: string | null;
  [k: string]: unknown;
}

const NOT_A_RATING = "A record, not a rating.";

/** Rates arrive as 0..1 fractions; anything above 1 is already a percentage. */
const pct = (r: number | null | undefined) =>
  r == null ? "n/a" : (Math.round((r > 1 ? r : r * 100) * 10) / 10).toString() + "%";
const n = (v: number | null | undefined) => (v == null ? "n/a" : v.toLocaleString("en-US"));

export function chainName(chain: string): string {
  return chain === "rh" || chain === "robinhood" ? "Robinhood Chain" : "Solana";
}

export function formatDuration(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
}

export function formatCoin(r: CoinRecord): string {
  if (!r.in_set) {
    return `No GROUNDTRUTH record for ${r.ca} (${chainName(r.chain)}) in the market data captured so far. `
      + `Absence is not innocence. ${r.card_url ?? ""}`.trim();
  }
  const lines = [`GROUNDTRUTH record for ${r.ca} (${chainName(r.chain)})`];
  lines.push(`Outcome: ${r.outcome ?? "no label yet"}`);
  if (r.band) lines.push(`Band: ${r.band}${r.band === "GREEN" ? " (GREEN launches have still rugged: see the scoreboard)" : ""}`);
  if (r.creator) {
    lines.push(`Creator: ${r.creator}: ${n(r.launches)} launches, ${r.failure_pct == null ? "n/a" : r.failure_pct + "%"} rugged or died`);
  }
  if (r.median_ttr_s != null) lines.push(`Band median time-to-rug (24h, population figure): ${formatDuration(r.median_ttr_s)}`);
  if (r.card_url) lines.push(`Full record: ${r.card_url}`);
  lines.push(NOT_A_RATING);
  return lines.join("\n");
}

export function formatCreator(addr: string, r: CreatorRecord): string {
  if (!r.launched) {
    return `No launches attributed to ${addr} in the market data GROUNDTRUTH has captured. Absence is not innocence.`;
  }
  return [
    `GROUNDTRUTH creator record for ${addr}`,
    `Launched ${n(r.launched)}: rugged ${n(r.rugged)}, died ${n(r.died)}, survived ${n(r.survived)}, graduated ${n(r.graduated)}, active ${n(r.active)}`,
    `Rug rate ${pct(r.rug_rate)}; rugged or died ${pct(r.failure_rate)} of ${n(r.resolved)} resolved`,
    r.known_bad ? "Flag: known_bad (above the observed baseline for creators)" : null,
    r.asof ? `As of ${r.asof}` : null,
    NOT_A_RATING,
  ].filter(Boolean).join("\n");
}

export function paymentRequiredText(what: string): string {
  return `The free GROUNDTRUTH trial (5 calls per IP per day) is used up for ${what}. `
    + "Set GROUNDTRUTH_API_KEY (Builder/Scale plan) or pass an x402-paying fetch ($0.01 USDC per call); see the plugin README.";
}
