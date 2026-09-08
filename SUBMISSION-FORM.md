## What it does

A binary prediction market on Midnight where **the amount you stake stays hidden until the market closes**.

Public: that a market exists, which side each position took, how many per side, the phase, the resolver. Private: how much anyone staked, and which positions are the same person's.

Three phases, enforced by a zero-knowledge circuit:

1. **OPEN** — you pick a side and a stake. Your browser hashes the amount with a random salt and publishes only the commitment. The side goes on-chain; the number never leaves your machine.
2. **REVEAL** — the resolver closes the book. Stakers open their commitments, proving the amount matches what they committed *before the outcome was known*. Reveal or forfeit: a sealed position funds nothing and claims nothing.
3. **RESOLVED** — the outcome is recorded. Entitlement is `revealedStake × pool ÷ winningStakeTotal`.

Compact has no division operator, so the contract publishes the *terms* rather than the payout and anyone derives the quotient from public state.

The UI has a button that submits a stake four times larger than the one you committed; the commitment check rejects it. Every error shown is the literal string from an `assert` inside the compiled circuit.

## The problem it solves

On a transparent prediction market every stake is visible the moment it lands, leaking two things worth money. **Order flow:** a large position moves the implied odds, so anyone watching can trade ahead of it. **Conviction:** stake size *is* the signal, and publishing it hands your read on the outcome to everyone for free.

The usual fix is trusting an operator to hold the amounts, which swaps a public leak for a private one. Darkstake removes the operator: the chain enforces the commitment, and no one — including me — can see the amounts early.

The nuance: **not everything should be hidden.** A market where nobody can see which way the crowd leans has no signal left to trade on. Hiding direction destroys the product; hiding size protects it. Darkstake discloses exactly one.

## Challenges I ran into

**Two copies of the same WebAssembly module.** Deployment failed with `expected instance of ContractMaintenanceAuthority` — a message naming a class and telling you nothing. `contract/` resolved `onchain-runtime-v3` at 3.1.1 while `cli/` had 3.0.0, so the contract was built by one WASM instance and read by another. The lesson generalises: **any `expected instance of X` from the Midnight runtime means two copies of the module, not a type error.**

**NIGHT does not pay fees.** A wallet showing `balance=10000000000` still could not send anything: NIGHT must be registered for dust generation first, and dust pays. My own sync gate then deadlocked waiting on all three sub-wallets when only one mattered.

## Technologies I used

Compact (`language_version 0.23`, toolchain 0.31.1) on Midnight preview. `midnight-js` contracts/protocol/types with indexer, proof-server and ZK-config providers. Lace via `dapp-connector-api` 4.x. A deploy CLI on `wallet-sdk` + `wallet-sdk-hd`. React 19, TypeScript, Vite 7, Tailwind 4. Vitest plus a hand-written probe. GitHub Actions, Codespaces, Vercel.

## How I built it

**Contract first, adversarially.** Tests run against the real compiled artifacts, not a mock — a mock cannot catch a circuit bug, the only kind that matters here. 36 Vitest cases and 52 probe assertions cover forged stakes and salts, non-owner reveals and claims, double-reveal, double-claim, phase gating both ways, and unrevealed positions excluded from the pool.

**Two execution modes, one set of circuits.** `#/app` runs the compiled contract in the browser: real circuits, real asserts, simulated network, nothing to install. `#/live` drives *the same circuits* against the deployed contract — proved, signed by Lace, settled in a block. Sharing circuits means the demo cannot drift from the deployment.

**The landing page reads the chain directly.** Contract state is public, so the market grid queries the indexer with no wallet — a visitor who installed nothing sees real position counts and the live phase.

## What I learned

**Reviewing the contract against Midnight's own checklists found a real bug.**

Every position carried `hash("pm:owner:", sk)` — **identical for every position one key opened.** Splitting a large stake across positions is the obvious way to blur its size. That tag undid it: group the rows by owner, wait for the reveals, add the parts back together.

The contract hid each individual stake perfectly and still leaked the total, because I had protected the value and not the *linkage*. **Privacy is not a property of a field; it is a property of what an observer can correlate.**

The fix blinds each owner tag with fresh randomness, so two positions by one key are unequal on-chain. Contract logic is immutable, so it meant recompiling, regenerating keys and redeploying — its own lesson about shipping before reviewing.

A consequence I like: my own client can no longer pick out its own positions from public state. It knows them only because it recorded the ids at commit time — no better placed than any observer.

## What's next

**Settlement that moves value.** `claimEntitlement` records who is owed what, on what terms — a verifiable ledger, not an escrow. Paying out needs shielded token custody.

**A resolver that is not one trusted party.** It is named and gated, but can still report an outcome the world disagrees with. That is governance: multi-party resolution, or a dispute window.

**Hiding commit timing.** Size and owner stay hidden, but transactions are ordered and visible, so an observer still learns *when* a position was opened. And v2 unlinks positions within a market — one device key across markets is still correlatable.
