## What it does

A binary prediction market on Midnight where **your side is public and your stake size is not**.

**Commit** — your browser hashes the amount with a random salt; only the commitment reaches the chain. **Reveal** — once the resolver closes the book you open it, proving the amount matches what you committed *before the outcome was known*. Reveal or forfeit: a sealed stake funds nothing and claims nothing. **Settle** — entitlement is `revealedStake × pool ÷ winningStakeTotal`, derived by anyone from public state, because Compact has no division operator.

Deployed on Midnight preview at `0ce149b8…`, verifiable against the public indexer. `#/live` sends real transactions; `#/app` runs the same compiled circuits in the browser with no wallet at all.

## The problem it solves

On a transparent market every stake is visible the moment it lands, leaking two things worth money. **Order flow:** a large position moves the implied odds, so it can be front-run. **Conviction:** size *is* the signal, and publishing it gives your read away for free.

The usual fix is trusting an operator to hold the amounts, which swaps a public leak for a private one. Darkstake removes the operator — the chain enforces the commitment.

But **not everything should be hidden.** A market where nobody can see which way the crowd leans has no signal left to trade on. Hiding direction destroys the product; hiding size protects it. Darkstake discloses exactly one.

## Challenges I ran into

**`expected instance of ContractMaintenanceAuthority`** — a message naming a class and telling you nothing. The cause was two copies of `onchain-runtime-v3` (3.1.1 and 3.0.0), so the contract was built by one WASM instance and read by another. Any `expected instance of X` from the Midnight runtime means two copies of the module, not a type error.

**NIGHT does not pay fees.** A funded wallet still could not send anything: NIGHT has to be registered for dust generation first, and dust is what pays.

## Technologies I used

Compact 0.23 (toolchain 0.31.1); `midnight-js` contracts with indexer, proof-server and ZK-config providers; Lace via `dapp-connector-api` 4.x; `wallet-sdk` for the deploy CLI; React 19, Vite 7, Tailwind 4; Vitest; GitHub Actions for proving keys; Vercel.

## How I built it

Contract first, adversarially: 36 Vitest cases and 52 probe assertions run against the **real compiled artifacts**, not a mock — a mock cannot catch a circuit bug, the only kind that matters here. Two execution modes share one set of circuits, so the demo cannot drift from the deployment. The landing page reads live contract state straight from the indexer, so a visitor who installed nothing still sees real numbers.

## What I learned

Reviewing the contract against Midnight's own checklists found a real bug. Every position carried `hash("pm:owner:", sk)` — **identical for every position one key opened.** Splitting a large stake across several positions is the obvious way to blur its size; that tag undid it. Group the rows by owner, wait for the reveals, add the parts back together.

The contract hid each individual stake perfectly and still leaked the total, because I had protected the value and not the *linkage*. **Privacy is not a property of a field; it is a property of what an observer can correlate.**

The fix blinds each owner tag with fresh randomness. Contract logic is immutable, so it cost a recompile, new proving keys and a redeploy to a new address.

## What's next

Settlement that moves value, which needs shielded token custody. A resolver that is not one trusted party. And hiding commit timing — size and owner are sealed, but transactions are ordered, so *when* a position was opened is still visible.
