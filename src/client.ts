/** Thin client for the live GROUNDTRUTH API. No state beyond a 60 s per-URL cache. */

export const DEFAULT_API_URL = "https://api.groundtruths.xyz";

export type FetchLike = (input: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export interface ClientOptions {
  baseUrl?: string;
  apiKey?: string;
  fetch?: FetchLike;
}

export type GtResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; paymentRequired: boolean; data: Record<string, unknown> | null; error: string };

const SOLANA_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const EVM_RE = /\b0x[a-fA-F0-9]{40}\b/g;

/** Every address in the text, EVM first, in order of appearance within each kind. */
export function extractAddresses(text: string | undefined): string[] {
  if (!text) return [];
  const evm = text.match(EVM_RE) ?? [];
  const sol = (text.match(SOLANA_RE) ?? []).filter((s) => /\d/.test(s) || s.length >= 40);
  return [...new Set([...evm, ...sol])];
}

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; value: GtResult<unknown> }>();

export function clearCache(): void {
  cache.clear();
}

export async function gtGet<T>(path: string, params: Record<string, string>, opts: ClientOptions = {}): Promise<GtResult<T>> {
  const base = (opts.baseUrl || DEFAULT_API_URL).replace(/\/+$/, "");
  const url = base + path + (Object.keys(params).length ? "?" + new URLSearchParams(params).toString() : "");
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as GtResult<T>;

  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.apiKey) headers["x-api-key"] = opts.apiKey;
  const doFetch: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));

  let res: Response;
  try {
    res = await doFetch(url, { headers });
  } catch (e) {
    return { ok: false, status: 0, paymentRequired: false, data: null, error: "network error: " + (e as Error).message };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const value: GtResult<T> = res.ok
    ? { ok: true, status: res.status, data: body as T }
    : {
        ok: false,
        status: res.status,
        paymentRequired: res.status === 402,
        data: (body as Record<string, unknown>) ?? null,
        error: String((body as Record<string, unknown> | null)?.error ?? `HTTP ${res.status}`),
      };
  if (res.ok || res.status === 404) cache.set(url, { at: Date.now(), value });
  return value;
}
