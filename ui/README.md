# Darkstake UI

Landing page for the shielded prediction market. React 19 + Vite 7 + Tailwind v4 +
shadcn-style primitives, TypeScript strict.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run typecheck
```

## Layout

```
src/
  components/ui/     shadcn primitives (button, card, badge, accordion, sheet)
                     + glsl-hills.tsx, the animated hero background
  components/site/   page sections
  data/markets.ts    placeholder market data
  index.css          design tokens (@theme) — single dark palette, no toggle
```

`components.json` is configured for the Vite flavour of shadcn, so
`npx shadcn@latest add <component>` writes into `src/components/ui` and picks up
the `@/` alias. The alias is declared in **both** `tsconfig.json` (`paths`) and
`vite.config.ts` (`resolve.alias`) — shadcn reads the first, the bundler needs
the second, and omitting either produces a resolve error that looks like a
missing package.

## Proving keys and the ZK config provider

`vite.config.ts` already carries the full Midnight wiring ported from
`midnight-leaderboard/leaderboard-ui/vite.config.ts` -- `vite-plugin-wasm`, the
hand-written `wasm-module-resolver` that intercepts `onchain-runtime-v3`, the
`optimizeDeps` excludes, `build.minify: false`, and the `resolve.alias` pins
that stop the contract being constructed by one wasm instance and read by
another. That config is load-bearing and non-obvious; change it only with a
reason.

Real proving keys are served from `public/`, in the exact layout
`FetchZkConfigProvider` expects:

```
public/keys/<circuit>.prover      public/keys/<circuit>.verifier
public/zkir/<circuit>.bzkir       <- binary zkir, NOT the .zkir text form
```

Both directories are gitignored. Repopulate them from a `managed` artifact
built by the `proving-keys` workflow:

```bash
M=../contract/managed/prediction-market
cp $M/keys/*.prover $M/keys/*.verifier public/keys/
cp $M/zkir/*.bzkir public/zkir/
```

`src/lib/zk-config.ts` builds the provider and exposes `verifyZkArtifacts()`,
which fetches all fifteen files and reports what actually arrived. Use it rather
than trusting a directory listing: a dev server that falls back to `index.html`
returns `200 text/html` for a missing key, so a successful request is not
evidence the key is there.

**Keys alone do not make the demo prove anything.** A proving key is an input to
a prover; the prover is the proof server, and there isn't one yet. `market-
engine.ts` still runs circuits unproven in memory, which is the honest state of
the demo. What the keys unblock is the moment a proof server URL exists.

## Things the copy commits us to

The page states the mechanism in specific terms, so some of it is a promise the
contract has to keep:

- **No price anywhere.** Cards show a lean derived from position *counts* and
  nothing else. There are no amounts to weight a probability with, so any
  dollar-denominated figure on this page would be false. The blurred numbers in
  the pool slot and in the front-running comparison are decoys, marked
  `aria-hidden` with an `sr-only` "shielded" label.
- **Reveal-or-forfeit.** Enforced in the contract as of M3: only revealed stakes
  enter the pool, and an unrevealed position cannot claim. The FAQ says exactly
  that, and keeps the honest caveat that forfeiting costs a claim rather than a
  balance, since v1 records entitlements instead of escrowing value.
- **Timing side channel disclosed.** Both the transparency section and the FAQ
  say that commit transactions are individually observable. Keep it that way.

## The live contract app (`#/app`)

`#/app` is not a mock. It loads the compiled contract from
`../contract/managed/prediction-market` — the same artifacts `vitest` and
`probe.mjs` run against — and drives it through
`@midnight-ntwrk/compact-runtime`. Every button executes a real circuit against
real ledger state, and every rejection shown in the log is a genuine `assert`
failure from inside the circuit, surfaced unedited.

What is simulated is the **network**, not the contract: no proof server, no
indexer, no wallet, and state lives in memory for the tab's lifetime. Circuits
therefore run unproven — which is also forced, since proving keys cannot be
generated on this machine (`zkir` needs Haswell-era CPU instructions; see §0 of
the build spec). The circuit logic, the disclosure boundary and the assert
behaviour are exactly what would run on-chain.

Identity switching stands in for a wallet: it swaps which secret key feeds the
`localSecretKey` witness, which is the only thing deciding whether an ownership
assert passes.

### Why `vite.config.ts` grew

`compact-runtime` pulls in `onchain-runtime-v3`, a wasm module with top-level
await. The `wasm()` / `topLevelAwait()` plugins, the `wasm-module-resolver`
plugin, the `optimizeDeps` excludes and `build.minify: false` are all required —
ported from `midnight-leaderboard/leaderboard-ui`. Without them the contract
fails to load with errors that point nowhere near the cause.
