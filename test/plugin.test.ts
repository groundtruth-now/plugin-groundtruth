import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { clearCache, createGroundtruthPlugin, extractAddresses, formatCoin, formatCreator, venueFigures } from "../src/index.js";

const SOL = "GCyzQVvCqHvE2pgAmKamDaZwL4rnT6QyuUG96fYYpump";
const EVM = "0x1aa7FB1045a0cB6e1C4a2B81f4A1e0a3dC5f6e21";

const runtime = (settings: Record<string, string> = {}) =>
  ({ getSetting: (k: string) => settings[k] ?? null }) as unknown as IAgentRuntime;
const msg = (text: string) => ({ content: { text } }) as unknown as Memory;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const COIN = { ca: SOL, chain: "solana", in_set: true, outcome: "rugged", creator: "Cre8tor1111111111111111111111111111111111", launches: 12,
  failure_pct: 91.7, band: "RED", median_ttr_s: 102, card_url: "https://groundtruths.xyz/?ca=" + SOL };
const CREATOR = { launched: 12, rugged: 9, died: 2, active: 0, survived: 1, graduated: 0, resolved: 12, rug_rate: 0.75,
  failure_rate: 0.9167, known_bad: true, asof: "2026-09-21T00:00:00Z" };
const FIGURES = {
  generated_at_utc: "2026-09-21T21:46:23Z",
  solana: { resolved: 2544288, counts: { rugged: 771571, died: 1727712, survived: 28616, graduated: 16389, active: 51034 },
    pct_of_resolved: { rugged: 30.3256, died: 67.9055, survived: 1.1247 } },
  robinhood: { resolved: 532486, counts: { rugged: 99640, died: 426776, survived: 6070, graduated: 0, active: 8442 },
    pct_of_resolved: { rugged: 18.7, died: 80.1, survived: 1.1 } },
  rh_venues: { asof: "2026-09-07", venues: [
    { tag: "rh-hood", name: "hood.fun", status: null, captured: 404, share_pct: 0.18, sealed: 156, resolved: 146 },
    { tag: "rh-liquiditylauncher-2", name: "LiquidityLauncher", status: null, captured: 32757, share_pct: 14.77, sealed: 32757, resolved: 32545 },
  ] },
  pons_venue: { venue: "Pons (PonsV2LaunchFactory)", outcomes: { resolved: 243648, rug_or_die_pct: 98.57, median_time_to_rug_s: 102 } },
};

const SAFE = /\b(safe|legit|verified|trusted|clean|low risk)\b/i;

beforeEach(() => clearCache());

describe("extractAddresses", () => {
  it("finds Solana mints and EVM addresses, ignores prose", () => {
    expect(extractAddresses(`check ${SOL} please`)).toEqual([SOL]);
    expect(extractAddresses(`and ${EVM} too`)).toEqual([EVM]);
    expect(extractAddresses("what is the rug rate on pump.fun today")).toEqual([]);
  });
});

describe("plugin shape", () => {
  const p = createGroundtruthPlugin();
  it("exposes three actions and one provider", () => {
    expect(p.actions?.map((a) => a.name)).toEqual(["GROUNDTRUTH_CREATOR_RECORD", "GROUNDTRUTH_COIN_RECORD", "GROUNDTRUTH_VENUE_FIGURES"]);
    expect(p.providers?.map((x) => x.name)).toEqual(["GROUNDTRUTH_RECORD"]);
  });
  it("similes carry the spec names", () => {
    const sims = p.actions!.flatMap((a) => a.similes ?? []);
    for (const s of ["creatorRecord", "coinRecord", "venueFigures"]) expect(sims).toContain(s);
  });
});

describe("coinRecord", () => {
  it("calls /v1/record with the pasted CA and reports the record", async () => {
    const f = vi.fn(async () => json(200, COIN));
    const act = createGroundtruthPlugin({ fetch: f }).actions!.find((a) => a.name === "GROUNDTRUTH_COIN_RECORD")!;
    const cb = vi.fn(async () => []);
    expect(await act.validate(runtime(), msg(`is ${SOL} a rug`))).toBe(true);
    const r = await act.handler(runtime({ GROUNDTRUTH_API_KEY: "k1" }), msg(`is ${SOL} a rug`), undefined, undefined, cb);
    const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe(`https://api.groundtruths.xyz/v1/record?ca=${SOL}`);
    expect(init.headers["x-api-key"]).toBe("k1");
    expect(r).toMatchObject({ success: true });
    expect((r as { text: string }).text).toContain("Outcome: rugged");
    expect(cb).toHaveBeenCalledOnce();
  });
  it("renders a 404 as no record, never as clean", async () => {
    const f = vi.fn(async () => json(404, { ca: SOL, chain: "solana", in_set: false, status: "not yet published", card_url: "x" }));
    const act = createGroundtruthPlugin({ fetch: f }).actions!.find((a) => a.name === "GROUNDTRUTH_COIN_RECORD")!;
    const r = (await act.handler(runtime(), msg(SOL))) as { text: string; success: boolean };
    expect(r.text).toContain("Absence is not innocence");
    expect(r.text).not.toMatch(SAFE);
  });
  it("explains a 402 (trial used up) instead of failing silently", async () => {
    const f = vi.fn(async () => json(402, { x402Version: 2, accepts: [] }));
    const act = createGroundtruthPlugin({ fetch: f }).actions!.find((a) => a.name === "GROUNDTRUTH_COIN_RECORD")!;
    const r = (await act.handler(runtime(), msg(SOL))) as { text: string; success: boolean };
    expect(r.success).toBe(false);
    expect(r.text).toMatch(/x402/);
  });
});

describe("creatorRecord", () => {
  it("calls /v1/flag and reports counts", async () => {
    const f = vi.fn(async () => json(200, CREATOR));
    const act = createGroundtruthPlugin({ fetch: f }).actions!.find((a) => a.name === "GROUNDTRUTH_CREATOR_RECORD")!;
    const r = (await act.handler(runtime(), msg(`dev ${EVM}`))) as { text: string };
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe(`https://api.groundtruths.xyz/v1/flag?addr=${EVM}`);
    expect(r.text).toContain("Launched 12: rugged 9");
    expect(r.text).toContain("Rug rate 75%");
  });
});

describe("venueFigures", () => {
  it("resolves chain, named launchpad and Pons", () => {
    expect(venueFigures(FIGURES, "pump.fun").text).toContain("Rugged 30.3256%");
    expect(venueFigures(FIGURES, "hood.fun").matched).toBe("rh-hood");
    expect(venueFigures(FIGURES, "LiquidityLauncher").text).toContain("32,757");
    expect(venueFigures(FIGURES, "Pons").text).toContain("98.57%");
    expect(venueFigures(FIGURES, "robinhood").matched).toBe("robinhood");
    expect(venueFigures(FIGURES, "nowhere").matched).toBeNull();
  });
  it("action validates on venue text and calls /api/figures", async () => {
    const f = vi.fn(async () => json(200, FIGURES));
    const act = createGroundtruthPlugin({ fetch: f }).actions!.find((a) => a.name === "GROUNDTRUTH_VENUE_FIGURES")!;
    expect(await act.validate(runtime(), msg("how often do hood.fun coins rug"))).toBe(true);
    expect(await act.validate(runtime(), msg("hello"))).toBe(false);
    const r = (await act.handler(runtime(), msg("how often do hood.fun coins rug"))) as { success: boolean };
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://api.groundtruths.xyz/api/figures");
    expect(r.success).toBe(true);
  });
});

describe("provider", () => {
  it("adds record context only when a CA is pasted", async () => {
    const f = vi.fn(async () => json(200, COIN));
    const prov = createGroundtruthPlugin({ fetch: f }).providers![0];
    expect((await prov.get(runtime(), msg("gm"), {} as State)).text).toBe("");
    expect(f).not.toHaveBeenCalled();
    const out = await prov.get(runtime(), msg(`ape ${SOL}?`), {} as State);
    expect(out.text).toContain("GROUNDTRUTH record");
    expect(out.values).toMatchObject({ groundtruthOutcome: "rugged", groundtruthBand: "RED" });
  });
});

describe("no safe badge", () => {
  it("GREEN, zero-rug and empty records never read as safe", () => {
    const green = formatCoin({ ...COIN, outcome: "survived", band: "GREEN", failure_pct: 0 });
    expect(green.replace("not a rating", "")).not.toMatch(SAFE);
    expect(green).toContain("GREEN launches have still rugged");
    expect(formatCreator(EVM, { ...CREATOR, rugged: 0, died: 0, failure_rate: 0, rug_rate: 0, known_bad: false })).not.toMatch(SAFE);
    expect(formatCreator(EVM, { launched: 0 })).not.toMatch(SAFE);
  });
});

describe.skipIf(!process.env.GT_LIVE)("live API", () => {
  it("/api/figures resolves every venue kind", async () => {
    const r = await fetch("https://api.groundtruths.xyz/api/figures");
    const fig = await r.json();
    for (const v of ["pump.fun", "robinhood", "Pons", "hood.fun"]) expect(venueFigures(fig, v).matched).not.toBeNull();
  });
});
