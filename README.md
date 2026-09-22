# @groundtruth-now/plugin-groundtruth

ElizaOS plugin for [GROUNDTRUTH](https://groundtruths.xyz): receipts on memecoin launches. Your agent can say what
happened to a coin, what its creator's other launches did, and how a launch venue's coins turn out. Covers Solana
(pump.fun) and Robinhood Chain, using the live API.

> GROUNDTRUTH publishes records, not safety ratings. This plugin never describes a coin or creator as "safe",
> not for a GREEN band and not for a missing record. Absence is not innocence.

## Install

```bash
npm install github:groundtruth-now/plugin-groundtruth
```

> The npm package `@groundtruth-now/plugin-groundtruth` is not on the registry yet. Until it is, install from
> GitHub as above; the package name and import path are the same, and the plugin builds itself on install.

```ts
import { groundtruthPlugin } from "@groundtruth-now/plugin-groundtruth";

export const character = {
  name: "Degen",
  plugins: [groundtruthPlugin],
};
```

Requires `@elizaos/core` >= 1.7.

## Actions

| Action | Spec name | Calls | Triggers on |
|---|---|---|---|
| `GROUNDTRUTH_COIN_RECORD` | `coinRecord(CA)` | `GET /v1/record?ca=` | a token address (Solana mint or `0x` Robinhood Chain token) |
| `GROUNDTRUTH_CREATOR_RECORD` | `creatorRecord(address)` | `GET /v1/flag?addr=` | a creator / dev wallet |
| `GROUNDTRUTH_VENUE_FIGURES` | `venueFigures(venue)` | `GET /api/figures` | a venue: Solana, pump.fun, Robinhood Chain, PonsLaunch, LiquidityLauncher, pools.trade, hood.fun |

Actions take the address from `options.ca` / `options.address` / `options.venue`. If none is given, they use the
first address or venue mentioned in the message.

**coinRecord** returns the sealed outcome (`rugged`, `died`, `survived`, `graduated`, `active`, `unobserved`), the
creator, the creator's launch count and failure rate, the record band (RED / AMBER / GREEN), and the band's median
time-to-rug. The time-to-rug is a population figure, not a prediction for this coin.

**creatorRecord** returns the creator's launched, rugged, died, survived, graduated and active counts, plus rug rate
and failure rate.

**venueFigures** returns population outcomes for the venue from the market data GROUNDTRUTH has captured. This is
not a census of the chain.

## Provider

`GROUNDTRUTH_RECORD`: when the current message contains a token address, it adds that coin's record to the agent's
context, along with the rule never to call the coin safe. Messages without an address cost no API call. Responses
are cached for 60 s per URL, so the provider and the coinRecord action share a single call.

## Settings

| Setting | Required | Meaning |
|---|---|---|
| `GROUNDTRUTH_API_KEY` | no | Builder / Scale plan key, sent as `x-api-key`. No trial limit, no x402. |
| `GROUNDTRUTH_API_URL` | no | Defaults to `https://api.groundtruths.xyz`. |

## Paying: free trial, API key, or x402

`/v1/record` and `/v1/flag` serve **5 free calls per IP per day**. After that they answer `402 Payment Required`
with an [x402 v2](https://x402.org) challenge. `/api/figures` is free. You can keep going past the trial in two
ways:

1. **API key**: set `GROUNDTRUTH_API_KEY`.
2. **x402, pay per call**: $0.01 USDC per call on Base mainnet (`eip155:8453`) or Solana mainnet. No account
   needed. Pass a paying fetch to `createGroundtruthPlugin`:

```ts
import { createGroundtruthPlugin } from "@groundtruth-now/plugin-groundtruth";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.AGENT_WALLET_KEY as `0x${string}`);
const payingFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(account) }],
});

export const character = { name: "Degen", plugins: [createGroundtruthPlugin({ fetch: payingFetch })] };
```

The paying fetch answers the 402 challenge (base64 `PAYMENT-REQUIRED` header), signs the USDC payment and
retries with `PAYMENT-SIGNATURE`. Paid responses carry `x-x402-paid: 1`. The full list of priced resources,
networks, asset and `payTo` is at <https://api.groundtruths.xyz/.well-known/x402>. `/x402/v1/record` and
`/x402/v1/flag` are the same resources at the same price with no free trial.

Without a key or a paying fetch, a 402 is not an error the agent hides. The action tells the user the trial is
used up and how to continue.

## Develop

```bash
npm install
npm run typecheck
npm test                 # unit tests, fetch mocked
GT_LIVE=1 npm test       # also hits the live /api/figures
npm run build
```

## License

MIT
