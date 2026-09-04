# CLI

Deploys one prediction market to a Midnight network.

```bash
npm install
npm run deploy -- --network preview
```

The seed is read from `../wallet/.wallets/<network>.json` by default; override
with `--seed-file <path>` or `--seed <64 hex>`. Pass `--faucet` to ask the
network faucet for NIGHT before deploying (an outbound request, so it is opt-in).

## ⚠️ This cannot run on the current dev machine

Two hard blockers, both hardware:

**1. There are no proving keys, and this CPU cannot make them.** `contract/managed/`
was built with `--skip-zk`, so it has `contract/` and `zkir/` but no `keys/`.
Generating keys runs `zkir`, which requires the `bmi2` and `adx` instruction-set
extensions. This machine is a Sandy Bridge i7-2640M (2011) and has neither:

```
$ compact compile prediction-market.compact /tmp/pm-zk-test
Compiling 5 circuits:
Exception: zkir returned a non-zero exit status -4      # -4 == SIGILL
```

The fix is `.github/workflows/proving-keys.yml`: run it via workflow_dispatch,
download the `managed` artifact, unzip into `contract/managed/`.

**2. There is no proof server, and it may not run here either.** Docker is not
installed. Beyond that, deploying needs a *live* proof, not just keys — and the
prover is the same crypto stack that just died with SIGILL. Whether the
`midnight-proof-server` image tolerates a CPU without bmi2/adx is untested here;
assume it does not until something proves otherwise. If it does not, the proof
server has to run somewhere modern and `EnvironmentConfiguration.proofServer`
has to point at it instead of a local container.

So: keys come from CI, and the deploy itself wants a machine newer than 2011.

## What each piece does

| File | Role |
|---|---|
| `config.ts` | Per-network bundle of network id + indexer/RPC/faucet URLs. Keeps the funded address, the network id, and the URLs naming one chain. |
| `wallet-provider.ts` | Seed → `WalletFacade`, plus `balanceTx`/`submitTx`. Adapted from `example-bboard/bboard-cli/src/midnight-wallet-provider.ts`. |
| `funding.ts` | Waits for NIGHT, then registers those UTXOs for dust generation. |
| `contract.ts` | Binds the compiled contract to its witnesses. |
| `deploy.ts` | Entry point. |

## NIGHT is not enough to pay fees

A funded wallet still cannot submit anything until its NIGHT UTXOs are
registered for dust generation — dust pays fees, and registered NIGHT generates
dust. `funding.ts` does this automatically before deploying. A wallet with a
healthy NIGHT balance and zero dust looks broken in a way that has nothing to do
with your contract.

## The deployer is the resolver

The contract's `constructor` sets `resolver = ownerCommitment(localSecretKey())`,
so whoever deploys becomes the only account that can call `closeMarket` and
`resolve`. `deploy.ts` generates that secret key and writes it to
`.deployments/<network>.json` next to the contract address. That file is
gitignored and holds the market's control key — losing it means the market can
never be closed or resolved.
