import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, Plugin, Provider, State } from "@elizaos/core";
import { type ClientOptions, type FetchLike, extractAddresses, gtGet } from "./client.js";
import { type CoinRecord, type CreatorRecord, formatCoin, formatCreator, paymentRequiredText } from "./format.js";
import { type Figures, venueFigures, venueFromText } from "./venues.js";

export { extractAddresses, clearCache, DEFAULT_API_URL } from "./client.js";
export { formatCoin, formatCreator } from "./format.js";
export { venueFigures } from "./venues.js";
export type { FetchLike } from "./client.js";

export interface GroundtruthPluginOptions {
  /** A fetch that settles x402 payments, e.g. wrapFetchWithPayment(fetch, signer) from x402-fetch. */
  fetch?: FetchLike;
}

function clientOpts(runtime: IAgentRuntime, fetchImpl?: FetchLike): ClientOptions {
  const s = (k: string) => {
    const v = runtime.getSetting(k);
    return v == null || v === "" ? undefined : String(v);
  };
  return { baseUrl: s("GROUNDTRUTH_API_URL"), apiKey: s("GROUNDTRUTH_API_KEY"), fetch: fetchImpl };
}

function argOrText(options: unknown, key: string, message: Memory): string | undefined {
  const o = options as Record<string, unknown> | undefined;
  const direct = o?.[key] ?? (o?.parameters as Record<string, unknown> | undefined)?.[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return extractAddresses(message.content?.text)[0];
}

async function reply(callback: HandlerCallback | undefined, action: string, r: ActionResult): Promise<ActionResult> {
  if (callback && r.text) await callback({ text: r.text, actions: [action] });
  return r;
}

const hasAddress = async (_rt: IAgentRuntime, m: Memory) => extractAddresses(m.content?.text).length > 0;

function makeCoinRecord(fetchImpl?: FetchLike): Action {
  const NAME = "GROUNDTRUTH_COIN_RECORD";
  return {
    name: NAME,
    similes: ["COIN_RECORD", "CHECK_CA", "RUG_CHECK", "TOKEN_RECORD", "coinRecord"],
    description: "Look up the GROUNDTRUTH record for a token contract address (Solana mint or Robinhood Chain 0x token): "
      + "sealed outcome, creator, the creator's launch count and failure rate, and the record band. Never a safety rating.",
    validate: hasAddress,
    handler: async (runtime, message, _state, options, callback) => {
      const ca = argOrText(options, "ca", message);
      if (!ca) return reply(callback, NAME, { success: false, text: "Paste a token contract address to look up.", error: "no address" });
      const r = await gtGet<CoinRecord>("/v1/record", { ca }, clientOpts(runtime, fetchImpl));
      if (r.ok) return reply(callback, NAME, { success: true, text: formatCoin(r.data), data: { record: r.data } });
      if (r.status === 404 && r.data) {
        return reply(callback, NAME, { success: true, text: formatCoin(r.data as unknown as CoinRecord), data: { record: r.data } });
      }
      const text = r.paymentRequired ? paymentRequiredText("coin records") : `GROUNDTRUTH lookup failed: ${r.error}`;
      return reply(callback, NAME, { success: false, text, error: r.error, data: { status: r.status } });
    },
    examples: [[
      { name: "{{user}}", content: { text: "who made GCyzQVvCqHvE2pgAmKamDaZwL4rnT6QyuUG96fYYpump? is it a rug?" } },
      { name: "{{agent}}", content: { text: "Pulling the GROUNDTRUTH record for that coin.", actions: [NAME] } },
    ]],
  };
}

function makeCreatorRecord(fetchImpl?: FetchLike): Action {
  const NAME = "GROUNDTRUTH_CREATOR_RECORD";
  return {
    name: NAME,
    similes: ["CREATOR_RECORD", "DEV_RECORD", "DEPLOYER_HISTORY", "CHECK_DEV", "creatorRecord"],
    description: "Look up a token creator's (dev wallet's) GROUNDTRUTH record: how many coins they launched and how many "
      + "rugged, died, survived or graduated. Use for a creator/dev/deployer wallet, not a token address.",
    validate: hasAddress,
    handler: async (runtime, message, _state, options, callback) => {
      const addr = argOrText(options, "address", message);
      if (!addr) return reply(callback, NAME, { success: false, text: "Paste a creator wallet address to look up.", error: "no address" });
      const r = await gtGet<CreatorRecord>("/v1/flag", { addr }, clientOpts(runtime, fetchImpl));
      if (r.ok) return reply(callback, NAME, { success: true, text: formatCreator(addr, r.data), data: { record: r.data } });
      const text = r.paymentRequired ? paymentRequiredText("creator records") : `GROUNDTRUTH lookup failed: ${r.error}`;
      return reply(callback, NAME, { success: false, text, error: r.error, data: { status: r.status } });
    },
    examples: [[
      { name: "{{user}}", content: { text: "what's the track record of dev wallet 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" } },
      { name: "{{agent}}", content: { text: "Checking that creator's launch history.", actions: [NAME] } },
    ]],
  };
}

function makeVenueFigures(fetchImpl?: FetchLike): Action {
  const NAME = "GROUNDTRUTH_VENUE_FIGURES";
  return {
    name: NAME,
    similes: ["VENUE_FIGURES", "LAUNCHPAD_STATS", "RUG_RATE", "venueFigures"],
    description: "Population figures for a launch venue (Solana/pump.fun, Robinhood Chain, or a Robinhood launchpad such as "
      + "PonsLaunch, LiquidityLauncher, pools.trade, hood.fun): how many launches rugged, died, survived or graduated.",
    validate: async (_rt, m) => venueFromText(m.content?.text ?? "") !== "",
    handler: async (runtime, message, _state, options, callback) => {
      const o = options as Record<string, unknown> | undefined;
      const venue = (typeof o?.venue === "string" && o.venue) || venueFromText(message.content?.text ?? "");
      if (!venue) return reply(callback, NAME, { success: false, text: "Name a venue: Solana, Robinhood Chain, or a launchpad.", error: "no venue" });
      const r = await gtGet<Figures>("/api/figures", {}, clientOpts(runtime, fetchImpl));
      if (!r.ok) return reply(callback, NAME, { success: false, text: `GROUNDTRUTH figures unavailable: ${r.error}`, error: r.error });
      const f = venueFigures(r.data, venue);
      return reply(callback, NAME, { success: f.matched != null, text: f.text, data: { venue: f.matched } });
    },
    examples: [[
      { name: "{{user}}", content: { text: "what share of pump.fun launches rug?" } },
      { name: "{{agent}}", content: { text: "Here are the captured pump.fun figures.", actions: [NAME] } },
    ]],
  };
}

function makeRecordProvider(fetchImpl?: FetchLike): Provider {
  return {
    name: "GROUNDTRUTH_RECORD",
    description: "GROUNDTRUTH record context for a token contract address pasted in the current message.",
    get: async (runtime: IAgentRuntime, message: Memory, _state: State) => {
      const ca = extractAddresses(message.content?.text)[0];
      if (!ca) return { text: "", values: {}, data: {} };
      const r = await gtGet<CoinRecord>("/v1/record", { ca }, clientOpts(runtime, fetchImpl));
      const rec = r.ok ? r.data : r.status === 404 && r.data ? (r.data as unknown as CoinRecord) : null;
      if (!rec) return { text: "", values: { groundtruthStatus: r.status }, data: {} };
      return {
        text: "# GROUNDTRUTH record for the pasted address\n" + formatCoin(rec)
          + "\n(Never describe this as safe: GROUNDTRUTH publishes records, not safety ratings.)",
        values: { groundtruthOutcome: rec.outcome ?? null, groundtruthBand: rec.band ?? null },
        data: { groundtruthRecord: rec },
      };
    },
  };
}

/** Build the plugin. Pass an x402-paying fetch to keep working past the free trial without an API key. */
export function createGroundtruthPlugin(opts: GroundtruthPluginOptions = {}): Plugin {
  return {
    name: "groundtruth",
    description: "GROUNDTRUTH memecoin records: coin outcomes, creator track records and venue figures (Solana, Robinhood Chain).",
    actions: [makeCreatorRecord(opts.fetch), makeCoinRecord(opts.fetch), makeVenueFigures(opts.fetch)],
    providers: [makeRecordProvider(opts.fetch)],
  };
}

export const groundtruthPlugin: Plugin = createGroundtruthPlugin();
export default groundtruthPlugin;
