## What it does

A prediction market on Midnight where **your side is public and your stake size is not**. You commit a hash of the amount plus a random salt; only the commitment reaches the chain. After the resolver closes the book you reveal, proving the amount matches what you committed *before the outcome was known* — reveal or forfeit. Entitlement is `revealedStake × pool ÷ winningStakeTotal`, derived by anyone from public state.

Deployed on Midnight preview: `0ce149b8cd281c89d4a0ec55e4f56982fc3d934770345ab438352efd30bfc508`, block 738714.

## The problem it solves

Public stakes leak **order flow** — a large position moves the odds, so it can be front-run — and **conviction**, because size *is* the signal. The usual fix, trusting an operator to hold the amounts, swaps a public leak for a private one.

But **not everything should be hidden.** A market where nobody sees which way the crowd leans has no signal left to trade on. Hiding direction destroys the product; hiding size protects it. Darkstake discloses exactly one.

## Challenges I ran into

`expected instance of ContractMaintenanceAuthority` — two copies of `onchain-runtime-v3` (3.1.1 and 3.0.0), so the contract was built by one WASM instance and read by another. **Any `expected instance of X` from the Midnight runtime means duplicate modules, not a type error.**

NIGHT does not pay fees. A funded wallet still cannot send until that NIGHT is registered for dust generation.

## Technologies I used

Compact 0.23, `midnight-js` (indexer, proof-server, ZK-config providers), Lace connector 4.x, a `wallet-sdk` deploy CLI, React 19 + Vite, Vitest, GitHub Actions for proving keys, Vercel.

## How I built it

Tests run against the real compiled artifacts, not a mock — 36 Vitest cases and 52 probe assertions covering forged stakes and salts, non-owner claims, double-claims and phase gating. Two modes share one set of circuits: `#/app` runs in-browser with no wallet, `#/live` against the deployed contract.

## What I learned

Reviewing the contract against Midnight's own checklists found a real bug. Every position carried `hash("pm:owner:", sk)` — identical for every position one key opened — so splitting a large stake to hide its size didn't work: group by owner, wait for the reveals, add the parts back together.

The contract hid each stake perfectly and still leaked the total. **Privacy is not a property of a field; it is a property of what an observer can correlate.** Fixed by blinding each tag; contract logic is immutable, so it cost a redeploy.

## What's next

Settlement that moves value, needing shielded token custody. A resolver that is not one trusted party. Hiding commit timing — transactions are ordered, so *when* a position opened is still visible.
