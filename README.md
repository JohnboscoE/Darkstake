# Darkstake

A prediction market on [Midnight](https://midnight.network) where **the size of
your bet is private until the market closes**.

Everything else stays public — that a market exists, which side each position
took, how many positions per side, the phase, who the resolver is. The one thing
held back is the number that makes front-running possible.

---

## The problem it solves

On a transparent prediction market, every stake is visible the moment it lands.
That leaks two things worth money:

- **Order flow.** A large position moves the implied odds. Anyone watching the
  mempool can trade ahead of it.
- **Conviction.** Stake size is a signal. Publishing it hands your read on the
  outcome to everyone else, for free.

The usual fix is to trust an operator to hold the amounts. Darkstake removes the
operator instead.

## How it works

A two-phase commit–reveal, enforced by a zero-knowledge circuit rather than a
server:

**1. Commit (phase `OPEN`).** You pick a side and a stake. Your browser hashes
the stake with a random salt and sends only `hash(stake, salt)`. The chain
records which side you took and a commitment to how much. It never sees the
amount. Your identity is a commitment too — `hash(secretKey)` — so positions
cannot be linked to a person.

The circuit still constrains what it cannot see: `assert(stake > 0)` runs
against the private witness. It proves the stake is positive without disclosing
it.

**2. Reveal (phase `REVEAL`).** The resolver closes the book. Only now do
holders reveal, proving `hash(stake, salt)` matches the commitment posted
*before* the outcome was known. Revealed stakes accumulate into public
settlement totals.

Revealing before the book closes is impossible — that is what the phase gate is
for. Otherwise the first reveal would leak the very number the commit phase
exists to hide.

**3. Resolve and settle (phase `RESOLVED`).** The resolver records the outcome
and the settlement terms freeze. Entitlement for a winning position is:

```
revealedStake × pool ÷ winningStakeTotal
```

Compact has no division operator, so the contract records `pool` and
`winningStakeTotal` and the quotient is computed off-chain — by anyone, from
public state. **Recording the terms instead of the answer is what makes it
verifiable**: you do not have to trust the division, you can redo it.

### Reveal-or-forfeit

A position that never reveals funds nothing and can claim nothing.

This is not an oversight, it is the rule that makes the design work. Without it,
a loser could stay silent to avoid funding the winners' pool, and the market
would only ever pay out when everyone happened to cooperate. The cost of
forfeiting is a claim, not a balance — v1 records entitlements rather than
escrowing value.

## What is actually private

| Public on the ledger | Never on the ledger |
|---|---|
| A market exists, and its phase | Your stake, before you reveal it |
| Which side each position took | Which person holds a position |
| How many positions per side (counts, never sums) | Your secret key or salt |
| Settlement totals, after reveal | |

The counts are deliberate: publishing *sums* while the market is open would
disclose the aggregate the whole design protects.

**One disclosed weakness.** Commit transactions are individually observable, so
an observer learns *when* you took a position and on which side — just not for
how much. Timing is a real side channel and the UI says so rather than hiding
it.

## Is it real?

Yes, and the tests are adversarial rather than happy-path. Against the compiled
contract — not a mock — `contract/` runs 31 vitest cases and `probe.mjs` runs 52
assertions covering:

- the stake never reaching the ledger before reveal
- forged stakes and forged salts being rejected
- non-owners being rejected on reveal and on claim
- double-reveal and double-claim being blocked
- phase gating holding in both directions
- an unrevealed position being excluded from the pool and unable to claim

Every error the demo UI shows is a genuine failed `assert` from inside the
circuit, not a string invented by the front end.

## Repository layout

| Path | What it is |
|---|---|
| `contract/` | The Compact circuit, its witnesses, and the test suite |
| `ui/` | React + Vite front end, including a live in-browser demo |
| `cli/` | Deploys a market to a Midnight network |
| `wallet/` | Generates a Midnight wallet offline from a 32-byte seed |
| `proof-server/` | Docker compose for a local proof server |
| `.devcontainer/` | Codespace that can build proving keys and run a prover |

## Running it

```bash
cd ui && npm install && npm run dev     # http://localhost:3000, #/app for the demo
cd contract && npm test                 # adversarial suite against the real contract
```

The demo runs the real compiled circuit in the browser through
`@midnight-ntwrk/compact-runtime`. What is simulated is the *network*, not the
contract: there is no proof server, indexer or wallet, so circuits run unproven
and state lives in memory. The circuit logic, the disclosure boundary and the
assert behaviour are exactly what would run on-chain.

## Current status

**Deployed and live on Midnight preview.**

| | |
|---|---|
| Contract | `7577ecf6fda6015f87c8efa9341da537c7fcf11a6ac0317daa904e97f8812bcf` |
| Block | 735676 |

See [DEPLOYMENTS.md](DEPLOYMENTS.md) for the transaction hashes and a command
that verifies all of it against the public indexer.

**Working:** the circuit compiles and behaves; proving keys generate in CI and
in the devcontainer, byte-identically; the contract is deployed, with real
proofs produced by a real proof server and fees paid in dust from a funded
wallet; the browser demo drives the real compiled circuit.

**In progress:** the deployed site still runs the demo in memory rather than
against the deployed contract. The browser provider stack (Lace wallet, indexer,
proof and ZK-config providers) is written; wiring it to the address above is the
remaining step.

**v1 limitations, stated plainly:**

- A single trusted resolver reports the outcome. Named and gated, but trusted.
- Entitlements are recorded, not paid. There is no escrow; settlement is a
  ledger of who is owed what, on terms anyone can verify.
- Commit timing is observable, as described above.
- Interacting on-chain needs the Lace extension, a local proof server and
  preview NIGHT. That is the standard Midnight dapp requirement, not a quirk of
  this project, but it is real friction.

## Why contract/ and cli/ are one npm workspace

They must share a single copy of `@midnight-ntwrk/onchain-runtime-v3`. Separate
`node_modules` gave `contract/` version 3.1.1 and `cli/` version 3.0.0, so the
generated contract was built by one WASM instance and read by another, and
deployment died with:

```
expected instance of ContractMaintenanceAuthority
```

The error names a class, not the real problem, and points at neither package.
`ui/vite.config.ts` documents the same hazard from the bundler side, where it
surfaces as `expected instance of ChargedState`. Any `expected instance of X`
from the Midnight runtime should be read as "two copies of the WASM module",
not as a type error.

The root `overrides` pins the runtime to 3.0.0, the version `midnight-js-protocol`
requires. `ui/` is deliberately NOT a workspace: it pins the runtime through
Vite aliases instead, which is a different mechanism for the same goal, and
folding it in would break that.

## Build notes

See `midnight-prediction-market-SPEC.md` for the full build spec, including a
section on what the original draft got wrong. Two things worth knowing before
touching the toolchain:

- **Pin Compact 0.31.1** (`compact update 0.31`) — language 0.23, runtime
  0.16.0, ledger 8. Toolchain 0.34.x targets ledger 9, which is not deployed.
- **Never invoke `~/.compact/bin/compactc` directly.** It is a wrapper that
  execs a `compactc.bin` the installer does not create, so it exits 127 on a
  fresh machine. `compact compile` resolves the versioned toolchain itself.
