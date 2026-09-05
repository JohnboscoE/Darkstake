# Security and privacy review

`prediction-market.compact`, reviewed against the checklists in Midnight Expert
(`compact-core`: `compact-security`, `compact-privacy-disclosure`, and the
`compact-review` privacy and security references).

Two findings are open and accepted for v1. Both are recorded here with what they
cost and what the fix is, rather than being left for a reader to notice.

---

## Trust boundary: every authorization compares a witness against pinned state

The rule the checklist is built around is that **a witness can return anything**.
`localSecretKey()` is chosen by whoever is building the transaction, so nothing
may depend on it until the circuit has constrained it.

Every gate in this contract has the same shape:

```compact
assert(ownerCommitment(localSecretKey()) == resolver, "not the resolver");
assert(ownerCommitment(localSecretKey()) == p.ownerHash, "not owner");
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

**Severity: low (best-practice deviation). Not fixed in v1.**

```compact
export circuit stakeCommit(stake: Uint<64>, salt: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<3, Bytes<32>>>(
    [pad(32, "pm:stake:"), stake as Field as Bytes<32>, salt]);
}
```

The checklist item is "`persistentHash` used where `persistentCommit` is needed",
on two grounds: `persistentHash` does not clear witness taint, and a hash without
a blinding factor provides binding but not hiding.

Neither ground bites here, but the deviation is real and worth stating:

- **Hiding.** The second objection is about hashes with *no* randomness, where a
  small input space is brute-forceable. A stake is a `Uint<64>` — trivially
  brute-forceable on its own — which is exactly why `salt` is 32 bytes of fresh
  randomness per position, drawn in the client and never reused. With that
  blinding factor the construction is a standard hash-based commitment: hiding
  from the salt, binding from collision resistance.
- **Taint.** `persistentHash` not clearing taint means the result needs an
  explicit `disclose()`. That is correct here rather than inconvenient — the
  commitment *must* be public, and writing the disclosure out makes that a
  decision in the source rather than something the primitive did quietly.

**Why it is not changed:** `persistentCommit` is the idiomatic primitive and a
future version should use it. Switching costs a recompile, a fresh set of proving
keys from the `proving-keys` workflow, and a redeploy to a new address — contract
logic is immutable, so there is no in-place upgrade. That is a poor trade for a
construction that is already sound. It is a v2 change, made together with
Finding 2, which needs a redeploy anyway.

## Finding 2 — one `ownerHash` per staker makes their positions linkable

**Severity: medium (privacy limitation, by design in v1). Not fixed in v1.**

`ownerHash` is `hash("pm:owner:", secretKey)` — the same value for every position
a given key opens. It is not linkable to a wallet address or to anything
off-chain, and the transaction is balanced by Lace rather than by this key, so it
does not tie back to the payer. But **within one market, an observer can group a
staker's positions**: three rows sharing an `ownerHash` are three positions by
one person.

That matters more than it first appears. Splitting a large stake across several
positions is the obvious way to blur size — and the grouping undoes it, because
the observer can add the parts back up once they reveal.

**The fix, for v2:** make the per-position owner tag a commitment rather than a
bare hash, `hash("pm:owner:", sk, positionSalt)`, with a fresh `positionSalt`
stored client-side next to the stake salt. Ownership is still provable at reveal
and claim — the prover supplies the same salt — but two positions by one key are
no longer equal, so nothing links them. The cost is one more secret the client
must not lose, on top of the stake and the salt.

The `compact-privacy-disclosure` skill's "unlinkable auth" pattern (round-based
key rotation via a `Counter`) is the more general form of the same idea.

---

## What is out of scope for v1, and stated as such

`claimEntitlement` records **who is entitled and on what terms**. It moves no
value: there is no escrow, and the pro-rata payout is computed off-chain from
`pool` and `winningStakeTotal` because Compact has no division operator. A
version that actually settles would need shielded token custody, which is a
larger design than this one.

The resolver is a single trusted party, named in the constructor and gated on
every privileged circuit. It can report an outcome the world disagrees with. That
is a governance problem, not a contract bug, and the honest v2 answer is a
multi-party or dispute-window resolver rather than better asserts.
