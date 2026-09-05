# Deployments

## preview

| | |
|---|---|
| **Contract address** | `7577ecf6fda6015f87c8efa9341da537c7fcf11a6ac0317daa904e97f8812bcf` |
| Deploy transaction | `5cb8dea87f8cac38b2c1a2052a810a6c1487899fe716edcdf04898bc0fe61b90` |
| Block | 735676 |
| Deployed | 2026-09-05 18:04:12 UTC |
| Network | Midnight preview |

Verify it independently against the public indexer:

```bash
curl -s -X POST https://indexer.preview.midnight.network/api/v4/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ contractAction(address: \"7577ecf6fda6015f87c8efa9341da537c7fcf11a6ac0317daa904e97f8812bcf\") { __typename address transaction { hash block { height } } } }"}'
```

### Supporting transactions

| Purpose | Transaction | Block |
|---|---|---|
| Faucet funding (5000 tNight) | `e244027e4d5ea60685754f97ddd7e9210e351263fc217082d57515e4386cf670` | 734774 |
| Dust generation registration | `ed07b904c8316e241f6cb974c9b84cd8f8277fdc63dcacab719a6b5709234d8c` | 735066 |

NIGHT does not pay fees directly. It has to be registered for dust generation
first, and dust pays the fee -- which is why that middle transaction exists.

### The resolver key

The contract's `constructor` sets `resolver = ownerCommitment(localSecretKey())`,
so whoever deployed is the only account that can call `closeMarket` or
`resolve`. `cli/.deployments/preview.json` holds that secret key and is
gitignored. It is not recoverable from the chain and not regenerable: losing it
means this market can never be settled.
