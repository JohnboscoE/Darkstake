Contract `0ce149b8cd281c89d4a0ec55e4f56982fc3d934770345ab438352efd30bfc508` on Midnight preview, block 738714, verifiable on the public indexer.

## What it does

A binary prediction market where **the amount you stake stays hidden until the market closes**, while what gives a market its signal stays public: which side each position took, how many per side, the phase.

**OPEN** — you pick a side and a stake. Your browser hashes it with a random salt and publishes only the commitment; the number never leaves your machine. **REVEAL** — the resolver closes the book and stakers open their commitments, proving the amount matches what they committed *before the outcome was known*. Reveal or forfeit: a sealed position funds nothing and claims nothing. **RESOLVED** — entitlement is `revealedStake × pool ÷ winningStakeTotal`.

The contract records entitlements rather than moving value: Compact has no division operator, so it publishes the *terms* and anyone derives the payout. Try the demo's 4× forgery button and watch the circuit reject it — every error is a real `assert`.

## The problem it solves

On a transparent market every stake is visible the moment it lands, leaking two things worth money. **Order flow:** a large position moves the implied odds, so it can be front-run. **Conviction:** size *is* the signal, and publishing it gives your read away for free.

The usual fix is trusting an operator to hold the amounts, which replaces a public leak with a private one. Darkstake removes the operator: the chain enforces the commitment, and no one — including me — sees the amounts early.

The nuance: **not everything should be hidden.** A market where nobody sees which way the crowd leans has no signal left to trade on. Hiding direction destroys the product; hiding size protects it. Darkstake discloses exactly one.

## Challenges I ran into

**Two copies of the same WebAssembly module.** Deployment failed with `expected instance of ContractMaintenanceAuthority` — naming a class, telling you nothing. `contract/` resolved `onchain-runtime-v3` at 3.1.1 while `cli/` had 3.0.0, so the contract was built by one WASM instance and read by another. **Any `expected instance of X` from the Midnight runtime means two copies of the module, not a type error.**

**NIGHT does not pay fees.** A funded wallet still could not send: NIGHT must be registered for dust generation first, and dust pays.

## Technologies I used

Compact 0.23 (toolchain 0.31.1) on Midnight preview. `midnight-js` with indexer, proof-server and ZK-config providers. Lace via `dapp-connector-api` 4.x. A deploy CLI on `wallet-sdk`. React 19, Vite 7, Tailwind, Vitest. GitHub Actions, Vercel.

## How I built it

**Contract first, adversarially.** 36 Vitest cases and 52 probe assertions run against the real compiled artifacts, not a mock — a mock cannot catch a circuit bug, the only kind that matters here. They cover forged stakes and salts, non-owner reveals and claims, double-claims and phase gating.

**Two execution modes, one set of circuits.** `#/app` runs the compiled contract in the browser with nothing to install; `#/live` drives *the same circuits* against the deployed contract — proved, signed by Lace, settled in a block. So the demo cannot drift from the deployment. The landing page reads live contract state from the indexer, no wallet needed.

## What I learned

**Reviewing the contract against Midnight's own checklists found a real bug.**

Every position carried `hash("pm:owner:", sk)` — **identical for every position one key opened.** Splitting a large stake across positions is the obvious way to blur its size; that tag undid it. Group by owner, wait for the reveals, add the parts back together.

The contract hid each stake perfectly and still leaked the total, because I had protected the value and not the *linkage*. **Privacy is not a property of a field; it is a property of what an observer can correlate.**

The fix blinds each owner tag with fresh randomness. Contract logic is immutable, so it cost a recompile, new keys and a redeploy.

## What's next

Settlement that moves value, needing shielded token custody. A resolver that is not one trusted party. And hiding commit timing: size and owner are sealed, but transactions are ordered, so *when* a position opened is visible.
