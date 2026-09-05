# Security and privacy review

`prediction-market.compact`, reviewed against the checklists in Midnight Expert
(`compact-core`: `compact-security`, `compact-privacy-disclosure`, and the
`compact-review` privacy and security references).

Two findings came out of it. Both are **fixed in v2**, which is the deployed
version; each is recorded below with what it cost, because neither fix was
free.

---

## Trust boundary: every authorization compares a witness against pinned state

The rule the checklist is built around is that **a witness can return anything**.
`localSecretKey()` is chosen by whoever is building the transaction, so nothing
may depend on it until the circuit has constrained it.

Every gate in this contract has the same shape:

```compact
assert(resolverId(localSecretKey()) == resolver, "not the resolver");
assert(ownerTag(localSecretKey(), ownerSalt()) == p.ownerHash, "not owner");
```

The witness is hashed with a domain separator and compared against a value
already written to the public ledger — `resolver`, set once in the constructor,
or `ownerHash`, set when the position was created. Passing means finding a
preimage of a stored 32-byte hash. There is no path where a chosen witness value
is trusted directly.

`ownPublicKey()` — the documented anti-pattern for authorization, since it is a
prover-supplied Zswap key and is not bound to the transaction signer — **does not
appear anywhere in this contract.**

The one assert that constrains a witness without comparing it to ledger state is:

```compact
assert(stake > 0, "stake must be positive");
```

That is a value constraint, not an authorization check. The only party it can
affect is the caller committing their own position, and it exists because a zero
stake would make `winningStakeTotal` zero and the settlement division undefined.

## Assert messages carry no private state

Failed transactions are public, including their messages. Every string in this
contract is a fixed description of a rule (`"market not open"`, `"already
revealed"`, `"position did not win"`). None interpolates a stake, an id derived
from a secret, or any witness value.

## Disclosure placement

`disclose()` appears only where a value crosses into ledger state, never at a
witness call site:

| Site | Value | Why it is public |
|---|---|---|
| `commitPosition` | `side` | The market's whole point: direction is public signal |
| `commitPosition` | `stakeCommitment` | The commitment must be on-chain to be binding |
| `commitPosition` | `ownerHash` | Needed to authorize the later reveal and claim |
| `commitPosition` | `nextId.read()` | The map key; a sequential id, not an identity |
| `revealPosition` | `id`, `stake` | Reveal is the act of making the stake public |
| `resolve` | `outcome` | The settlement terms must be checkable by anyone |

Notably, the commitment check is **not** disclosed:

```compact
assert(stakeCommit(stake, salt) == p.stakeCommitment, "stake != commitment");
```

The comparison result stays inside the proof. Because the assert must hold for
the transaction to land, every transcript that reaches the chain carries the same
outcome, so nothing is learned from the fact that it passed. This is the pattern
the checklist prescribes over capturing a boolean and branching on it.

`if (disclose(side) == Side.YES)` is a conditional on a disclosed value guarding
ledger writes. It leaks nothing new: `side` was written to the ledger two lines
above, by design.

## Counter read

```compact
nextId.increment(1);
const id = disclose(nextId.read() as Uint<64>);
```

The checklist flags read-then-increment where the value is not needed. Here it is
the map key, so the read is load-bearing. `Counter` operations are public in any
case.

## Overflow

`totalYesStake` and `totalNoStake` are `Uint<128>` accumulating `Uint<64>`
stakes, and `pool` is their sum. Overflowing would take on the order of 2^64
positions. The widening is deliberate — a `Uint<64>` accumulator would be a real
overflow, not a theoretical one.

---

## Finding 1 — `persistentHash` with a salt, where the primitive is `persistentCommit`

**Severity: low (best-practice deviation). Fixed in v2.**

v1 hand-rolled a commitment by folding the salt into a `persistentHash`
preimage:

```compact
persistentHash<Vector<3, Bytes<32>>>([pad(32, "pm:stake:"), stake, salt])
```

That was sound — a 32-byte per-position salt is a real blinding factor, so the
construction was hiding and binding — but it reimplemented what the standard
library already provides, and `persistentHash` is documented as binding-only.
The checklist item is "`persistentHash` used where `persistentCommit` is
needed", and the reviewer reading it has no way to tell a considered choice from
an unconsidered one.

v2 uses the primitive:

```compact
persistentCommit<Vector<2, Bytes<32>>>([pad(32, "pm:stake:"), stake as Field as Bytes<32>], salt)
```

The domain separator stays inside the committed vector, so commitments from this
contract cannot be replayed into another scheme that commits to a bare stake.

## Finding 2 — one `ownerHash` per staker made their positions linkable

**Severity: medium (privacy limitation). Fixed in v2.**

v1 tagged every position with `hash("pm:owner:", sk)` — identical for every
position one key opened. Nothing tied it to a wallet address or to anything
off-chain, and Lace rather than this key balances the transaction, so it did not
lead back to the payer. But **within one market it grouped a staker's
positions**, and that is worse than it sounds: splitting a large stake across
several positions is the obvious way to blur size, and the grouping undid it —
an observer waits for the reveals and adds the parts back together.

v2 blinds the tag per position:

```compact
export circuit ownerTag(sk: Bytes<32>, blinding: Bytes<32>): Bytes<32> {
  return persistentCommit<Vector<2, Bytes<32>>>([pad(32, "pm:owner:"), sk], blinding);
}
```

`witness ownerSalt()` supplies fresh randomness at commit; the same value is
re-supplied at reveal and at claim, where the circuit recomputes the tag and
compares it against the stored one. Ownership is still provable, and two
positions by one key are now unequal on-chain.

The resolver keeps an unblinded identity under a **separate domain**,
`resolverId(sk) = hash("pm:resolver:", sk)`. That is not the same mistake: a
market's legitimacy depends on everyone being able to check, before staking, who
may close the book. Splitting the domain matters — reusing one domain for both
purposes is what would let the resolver's public id be correlated with the
positions they staked themselves.

### What this costs

- **A second secret per position.** Lose `ownerSalt` and the position can never
  be proven yours — the same failure mode as losing the stake salt, and now
  there are two ways to hit it. `notes-store.ts` persists both and the export
  carries both.
- **The client can no longer recognise its own positions from public state.**
  It knows them because it recorded their ids at commit time. This is the
  property working as intended: our UI is in exactly the same position as any
  other observer. `positionsOf()` takes a set of ids from local notes rather
  than matching an owner hash.
- **Fresh randomness per position is now a client obligation.** Reusing one
  `ownerSalt` across two positions makes their tags equal again and hands back
  the v1 behaviour. The contract cannot enforce this — a witness can return
  anything — so it is covered by a test that asserts reuse re-links them, to
  keep the requirement visible rather than implicit.

---

## What is out of scope for v1, and stated as such

`claimEntitlement` records **who is entitled and on what terms**. It moves no
value: there is no escrow, and the pro-rata payout is computed off-chain from
`pool` and `winningStakeTotal` because Compact has no division operator. A
version that actually settles would need shielded token custody, which is a
larger design than this one.

The resolver is a single trusted party, named in the constructor and gated on
every privileged circuit. It can report an outcome the world disagrees with.
That is a governance problem, not a contract bug, and the honest answer is a
multi-party or dispute-window resolver rather than better asserts.

Commit *timing* remains observable. Transactions are ordered and visible, so a
watcher learns when positions were opened even though they learn nothing about
size or owner. Hiding that needs batching or delayed submission, neither of
which is in this contract.
