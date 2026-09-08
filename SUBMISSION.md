# Darkstake

**A prediction market on Midnight where your side is public and your size is not.**

| | |
|---|---|
| Live site | https://darkstake.vercel.app |
| Contract | `0ce149b8cd281c89d4a0ec55e4f56982fc3d934770345ab438352efd30bfc508` |
| Network | Midnight preview, block 738714 |
| Repository | https://github.com/JohnboscoE/Darkstake |

---

## What it does

Darkstake is a binary prediction market where **the amount you stake stays hidden
until the market closes**, while everything that gives a market its signal stays
public.

Public: that a market exists, which side each position took, how many positions
sit on each side, the phase, who the resolver is. Private: how much anyone put
down, and which positions belong to the same person.

The lifecycle is three phases enforced by a zero-knowledge circuit:

1. **OPEN** — you pick a side and a stake. Your browser hashes the amount with a
   random salt and publishes only the commitment. The side goes on-chain; the
   number never leaves your machine.
2. **REVEAL** — the resolver closes the book. Only now do stakers open their
   commitments, proving the amount matches what they committed *before the
   outcome was known*. Reveal or forfeit: a position that stays sealed funds
   nothing and can claim nothing.
3. **RESOLVED** — the resolver reports the outcome. The contract publishes
   `pool` and `winningStakeTotal`, and each winner's entitlement is
   `revealedStake × pool ÷ winningStakeTotal`.

Two things are worth calling out because they are choices, not accidents:

**The contract records entitlements; it does not move value.** Compact has no
division operator, so rather than computing the payout on-chain it publishes the
*terms* and lets anyone derive the quotient from public state. That is strictly
more verifiable than a number we assert — you can check our arithmetic without
trusting our client.

**You can try to cheat, in the UI, and watch it fail.** There is a button that
submits a stake four times larger than the one you committed. The commitment
check rejects it. Every error message the interface shows is the literal string
from an `assert` inside the compiled circuit, not something the front end
invented.

## The problem it solves

On a transparent prediction market every stake is visible the moment it lands,
and that leaks two things worth money.

**Order flow.** A large position moves the implied odds. Anyone watching the
mempool can trade ahead of it — the same front-running problem that makes public
order books hostile to size.

**Conviction.** Stake size *is* the signal. A market that publishes it hands your
read on the outcome to everyone else for free, which is precisely the information
you were paid to have.

The industry's usual fix is to trust an operator to hold the amounts privately.
That replaces a public leak with a private one and adds a party who can be
compromised, subpoenaed, or simply dishonest. Darkstake removes the operator
instead: the amounts are hidden by a commitment scheme the chain itself enforces,
and no one — including us — is in a position to see them early.

The nuance we care about is that **not everything should be hidden.** A market
where nobody can see which way the crowd is leaning has no signal left to trade
on. Hiding direction destroys the product; hiding size protects it. Darkstake
discloses exactly one of those.

## Challenges I ran into

**The proving keys could not be built on the development machine.** `zkir` needs
the `bmi2` and `adx` CPU instructions, and the laptop this was written on is a
2011 Sandy Bridge that lacks both — every compile died with `SIGILL`, a signal,
with no message explaining why. The fix was a GitHub Actions workflow that
compiles with keys on a modern runner, plus a devcontainer that can do the same.
It cost several hours mostly because the failure mode looks like a broken
toolchain rather than a missing instruction set.

**Two copies of the same WebAssembly module.** Deployment failed with
`expected instance of ContractMaintenanceAuthority` — which names a class and
tells you nothing. The real cause was `contract/` resolving
`@midnight-ntwrk/onchain-runtime-v3` at 3.1.1 while `cli/` had 3.0.0, so the
contract was built by one WASM instance and read by another. The same hazard bit
again later in the browser bundle, where it surfaces as
`expected instance of ChargedState`. The lesson generalises: **any
`expected instance of X` from the Midnight runtime means two copies of the
module, not a type error.** Fixed with an npm workspace and a pinned override.

**NIGHT does not pay fees.** A funded wallet sat at
`balance=10000000000` and still could not send anything, because NIGHT has to be
registered for dust generation first and dust is what actually pays. Compounding
it, our own sync gate waited on *all three* sub-wallets — shielded, unshielded,
and dust — while only the unshielded scan was relevant, so the deploy deadlocked
against a balance it had already found.

**A privacy bug that only showed up under review.** See "What we learned".

**Being unable to test the thing we built.** Live mode needs a proof server, and
proving on a 15-year-old CPU is somewhere between slow and impossible. The
mitigation is architectural rather than a workaround: the same compiled circuits
also run in-browser with no wallet and no prover, so the mechanism is
demonstrable on any machine even when the hardware cannot produce real proofs.

## Technologies I used

| Layer | What |
|---|---|
| Contract | **Compact** (`language_version 0.23`), compiled with toolchain 0.31.1 |
| Chain | **Midnight** preview testnet — indexer, node, proof server |
| Contract client | `@midnight-ntwrk/midnight-js-contracts`, `-protocol`, `-types`, indexer / proof / ZK-config providers |
| Wallet | **Lace** via `@midnight-ntwrk/dapp-connector-api` (4.x) |
| Deploy CLI | `@midnight-ntwrk/wallet-sdk`, `wallet-sdk-hd` for offline key derivation, `testkit-js` |
| Front end | React 19, TypeScript, Vite 7, Tailwind 4, Three.js |
| Testing | Vitest + a hand-written probe, both against the **real compiled contract** |
| Build | GitHub Actions for proving keys; Codespaces devcontainer; Vercel for hosting |

## How we built it

**The contract first, and adversarially.** The test suite runs against the real
compiled artifacts rather than a mock — a mock cannot catch a circuit bug, which
is the only kind of bug that matters here. 36 Vitest cases and 52 probe
assertions cover forged stakes, forged salts, non-owners attempting reveal and
claim, double-reveal, double-claim, phase gating in both directions, and an
unrevealed position being excluded from the pool.

**Two execution modes over one set of circuits.** `#/app` drives the compiled
contract through `@midnight-ntwrk/compact-runtime` in the browser: real
circuits, real asserts, simulated network. `#/live` drives *the same circuits*
through midnight-js against the deployed contract: proved by a proof server,
signed by Lace, settled in a block, read back from the indexer. Sharing the
circuits between them means the demo cannot drift from the deployment.

**The landing page reads the chain directly.** Contract state is public, so the
market grid queries the indexer with no wallet at all. A visitor who has
installed nothing still sees the real position counts and phase.

**Deployment is reproducible, not a one-off.** The wallet is generated offline
from a seed, proving keys come from a pinned CI toolchain, and a script builds
the keys and places all three copies where they belong. Every deployment
transaction hash is in `DEPLOYMENTS.md` with a `curl` that verifies them against
the public indexer.

## What we learned

**The most valuable thing we did was review the contract against Midnight's own
checklists, and it found a real bug.**

We ran `prediction-market.compact` against the Midnight Expert review skills
(`compact-security`, `compact-privacy-disclosure`, `compact-review`). Two
findings came out. The second one mattered:

> Every position carried `hash("pm:owner:", sk)` — **identical for every position
> one key opened.** Splitting a large stake across several positions is the
> obvious way to blur its size. That tag undid it: group the rows by owner, wait
> for the reveals, and add the parts back together.

The contract was hiding each individual stake perfectly and still leaking the
total, because we had protected the value and not the *linkage*. Privacy is not a
property of a field; it is a property of what an observer can correlate.

The fix blinds each position's owner tag with fresh randomness
(`persistentCommit(["pm:owner:", sk], ownerSalt)`), so two positions by one key
are unequal on-chain. Contract logic is immutable, so it meant recompiling,
regenerating keys, and redeploying to a new address — which is its own lesson
about the cost of shipping before reviewing.

Three smaller things we now believe:

- **A blinded tag means our own client cannot recognise its own positions from
  public state.** It knows them because it recorded the ids when it committed.
  That is the property working: this UI is no better placed than any observer.
- **`persistentHash` is not a commitment.** It provides binding, not hiding, and
  does not clear witness taint. `persistentCommit` is the primitive; we had
  hand-rolled the same construction with a salt in the preimage, which was sound
  but read like an oversight to anyone applying the checklist.
- **`disclose()` is an assertion about intent, not a way to silence the
  compiler.** Every one in this contract is at a ledger boundary and justified in
  a table in the review document.

The full review, including what each fix cost, is in
[`contract/SECURITY-REVIEW.md`](contract/SECURITY-REVIEW.md).

## What's next for Darkstake

**Settlement that moves value.** Today `claimEntitlement` records *who is owed
what, on what terms* — a verifiable ledger of entitlements, not an escrow.
Actually paying out needs shielded token custody, which is a larger design than
this wave allowed and the honest next step rather than a footnote.

**A resolver that is not one trusted party.** The resolver is named in the
constructor and gated on every privileged circuit, but it can still report an
outcome the world disagrees with. That is a governance problem, not something
better asserts can fix. The direction is a multi-party resolver or a dispute
window with a challenge period.

**Hiding commit timing.** Transactions are ordered and visible, so an observer
still learns *when* positions were opened even though size and owner stay hidden.
Batching or delayed submission would close it.

**Unlinkability across markets.** v2 makes positions unlinkable within a market.
A staker who joins several markets with the same device key is still correlatable
across them; round-based key rotation is the documented pattern for it.

**Reducing the client's burden.** Each position now carries two secrets that must
survive — the stake salt and the owner salt — and losing either forfeits the
position permanently. They are stored per-market and exportable, but a key
derived from the wallet would be a real improvement over browser storage.
