/** venueFigures: resolve a free-text venue against /api/figures and render it. */

interface ChainBlock {
  resolved?: number;
  counts?: Record<string, number>;
  pct_of_resolved?: Record<string, number>;
  generated_at_utc?: string;
}
interface RhVenue { tag: string; name: string; status: string | null; captured: number; share_pct: number; sealed: number; resolved: number }
interface PonsVenue { venue: string; outcomes?: { resolved?: number; rug_or_die_pct?: number; median_time_to_rug_s?: number } }
export interface Figures {
  generated_at_utc?: string;
  solana?: ChainBlock;
  robinhood?: ChainBlock;
  rh_venues?: { asof?: string; venues?: RhVenue[] };
  pons_venue?: PonsVenue;
}

const n = (v: number | undefined) => (v == null ? "n/a" : v.toLocaleString("en-US"));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export const VENUE_KEYWORDS = ["solana", "pump.fun", "pumpfun", "robinhood", "pons", "ponslaunch", "hood.fun", "pools.trade",
  "liquiditylauncher", "launch factory"];

function chainText(label: string, b: ChainBlock | undefined, asof?: string): string | null {
  if (!b || !b.counts) return null;
  const p = b.pct_of_resolved ?? {};
  return [
    `GROUNDTRUTH figures: ${label} (market data we have captured, not a census)`,
    `Resolved launches: ${n(b.resolved)}`,
    `Rugged ${p.rugged ?? "n/a"}%, died ${p.died ?? "n/a"}%, survived ${p.survived ?? "n/a"}% of resolved`,
    `Graduated: ${n(b.counts.graduated)}; still active: ${n(b.counts.active)}`,
    asof ? `As of ${asof}` : null,
  ].filter(Boolean).join("\n");
}

/** Returns the rendered figures for the venue, or null with a list of what is known. */
export function venueFigures(fig: Figures, venue: string): { text: string; matched: string | null } {
  const v = norm(venue);
  const asof = fig.generated_at_utc;
  if (v.includes("pons")) {
    const o = fig.pons_venue?.outcomes;
    if (o) {
      return {
        matched: "pons",
        text: [
          `GROUNDTRUTH figures: ${fig.pons_venue!.venue}`,
          `Resolved: ${n(o.resolved)}; rugged or died: ${o.rug_or_die_pct ?? "n/a"}%`,
          o.median_time_to_rug_s != null ? `Median time-to-rug: ${o.median_time_to_rug_s}s` : null,
        ].filter(Boolean).join("\n"),
      };
    }
  }
  const rh = (fig.rh_venues?.venues ?? []).find((x) => norm(x.name) === v || norm(x.tag) === v
    || (v.length >= 4 && (norm(x.name).includes(v) || v.includes(norm(x.name)))));
  if (rh) {
    return {
      matched: rh.tag,
      text: [
        `GROUNDTRUTH figures: ${rh.name} (Robinhood Chain launchpad)`,
        `Launches captured: ${n(rh.captured)} (${rh.share_pct}% of Robinhood Chain capture); sealed ${n(rh.sealed)}, resolved ${n(rh.resolved)}`,
        rh.status ? `Status: ${rh.status}` : null,
        fig.rh_venues?.asof ? `As of ${fig.rh_venues.asof}` : null,
      ].filter(Boolean).join("\n"),
    };
  }
  if (v.includes("robinhood") || v === "rh") {
    const t = chainText("Robinhood Chain", fig.robinhood, asof);
    if (t) return { matched: "robinhood", text: t };
  }
  if (v.includes("solana") || v.includes("pump")) {
    const t = chainText("Solana (pump.fun)", fig.solana, asof);
    if (t) return { matched: "solana", text: t };
  }
  const known = ["Solana (pump.fun)", "Robinhood Chain", ...(fig.rh_venues?.venues ?? []).map((x) => x.name)];
  return { matched: null, text: `No GROUNDTRUTH figures for "${venue}". Known venues: ${known.join(", ")}.` };
}

/** First venue keyword found in free text, or "" if none. */
export function venueFromText(text: string): string {
  const t = text.toLowerCase();
  return VENUE_KEYWORDS.find((k) => t.includes(k)) ?? "";
}
