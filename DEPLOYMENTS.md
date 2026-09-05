# Deployments

## preview — current (v2)

| | |
|---|---|
| **Contract address** | `0ce149b8cd281c89d4a0ec55e4f56982fc3d934770345ab438352efd30bfc508` |
| Deploy transaction | `997314a4570def5829e1990bd4dc2dc413ebffc3b9372f350d0af25e87283bca` |
| Block | 738714 |
| Deployed | 2026-09-05 21:48:12 UTC |
| Network | Midnight preview |

Verify it independently against the public indexer:

```bash
curl -s -X POST https://indexer.preview.midnight.network/api/v4/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ contractAction(address: \"0ce149b8cd281c89d4a0ec55e4f56982fc3d934770345ab438352efd30bfc508\") { __typename address transaction { hash block { height } } } }"}'
```

A `__typename` of `ContractDeploy` at that address is the whole claim: the
contract exists on preview, at that block, in a transaction anyone can look up
without trusting this repository.

### What v2 changed

Both findings in [contract/SECURITY-REVIEW.md](contract/SECURITY-REVIEW.md).
Contract logic is immutable, so closing them meant a new address rather than an
upgrade:

- Each position's owner tag is blinded with fresh randomness, so two positions
  opened by one key are unlinkable on-chain. Under v1 they carried an identical
  tag, which let an observer group them and add the revealed stakes back
  together — defeating the point of splitting a stake to hide its size.
- Commitments use the standard library's `persistentCommit` rather than a salt
  folded into a `persistentHash` preimage.

### Supporting transactions

Both predate v2 and still apply: the deploying wallet is unchanged, and its
NIGHT is still registered, so v2 needed no new funding.

| Purpose | Transaction | Block |
|---|---|---|
| Faucet funding (5000 tNight) | `e244027e4d5ea60685754f97ddd7e9210e351263fc217082d57515e4386cf670` | 734774 |
| Dust generation registration | `ed07b904c8316e241f6cb974c9b84cd8f8277fdc63dcacab719a6b5709234d8c` | 735066 |

NIGHT does not pay fees directly. It has to be registered for dust generation
first, and dust pays the fee -- which is why that middle transaction exists.

### The resolver key

The `constructor` sets `resolver = resolverId(localSecretKey())`, so whoever
deployed is the only account that can call `closeMarket` or `resolve`.
`cli/.deployments/preview.json` holds that secret key and is gitignored. It is
not recoverable from the chain and not regenerable: **losing it means this
market can never be settled.** It is written by the deploy on the machine that
ran it, which for this project is an ephemeral Codespace — copy it off before
that container is discarded.

---

## preview — superseded (v1)

Left here deliberately rather than deleted. It is still on-chain, still
queryable, and it is the evidence that the security review changed something
rather than just describing it.

| | |
|---|---|
| Contract address | `7577ecf6fda6015f87c8efa9341da537c7fcf11a6ac0317daa904e97f8812bcf` |
| Deploy transaction | `5cb8dea87f8cac38b2c1a2052a810a6c1487899fe716edcdf04898bc0fe61b90` |
| Block | 735676 |
| Deployed | 2026-09-05 18:04:12 UTC |

Do not point the UI at this address. Its compiled binding differs from the one
in `contract/managed/` — v1 has no `ownerSalt` witness and derives owner tags
differently — so a v2 client cannot produce a transcript it will accept.
