# Wallet

Generates the Midnight wallet the CLI and deploy scripts sign with.

```bash
npm install
node generate-wallet.mjs --network preview
```

## What a "wallet" is here

A **32-byte master seed**, and nothing else. Every address below is derived from
it, so the seed alone is enough to reconstruct the whole wallet — and enough for
anyone else to spend from it. `generate-wallet.mjs` does pure offline BIP32
derivation: no node, indexer, faucet or proof server is contacted.

`HDWallet.fromSeed(seed).selectAccount(a).selectRoles([...]).deriveKeysAt(i)`
gives one key per role. Three of the five roles matter to us:

| Role | Key becomes | Used for |
|---|---|---|
| `NightExternal` (0) | unshielded keystore → `mn_addr_…` | receiving NIGHT from the faucet, signing txs |
| `Zswap` (3) | `ZswapSecretKeys` → `mn_shield-addr_…` | shielded coins, the private side of the market |
| `Dust` (2) | `DustSecretKey` → `mn_dust-addr_…` | fee capacity; NIGHT UTXOs register against it |

`NightInternal` (1) is change addresses and `Metadata` (4) is wallet metadata;
neither is needed to deploy or transact, so the script skips them.

## Flags

| Flag | Default | Meaning |
|---|---|---|
| `--network` | `preview` | `preview`, `preprod`, or `undeployed`. Only changes the bech32m network segment — the keys are identical across networks. |
| `--seed <64 hex>` | — | Re-derive an existing wallet instead of generating a new one. Use this to recover addresses from a seed you already hold. |
| `--account N` | `0` | HD account index. |
| `--index N` | `0` | Address index within the role. |
| `--out <path>` | `.wallets/<network>.json` | Where to write the JSON. |
| `--no-out` | — | Print only; nothing touches disk. |

## The output file

`.wallets/<network>.json` is written with mode `0600` and is gitignored, because
it contains `seed`. Treat it the way you would a private key: it is not
encrypted, and anything that can read the file can drain the wallet. For a
throwaway hackathon wallet that is fine; for anything holding value, use
`--no-out` and put the seed in a password manager.

## Using the seed

Hand it to the SDK to get a live wallet against a network:

```ts
const builder = FluentWalletBuilder.forEnvironment(env).withDustOptions(dustOptions);
const { wallet, seeds, keystore } = await builder.withSeed(seed).buildWithoutStarting();
```

See `example-bboard/bboard-cli/src/midnight-wallet-provider.ts` for the full
provider that wraps this into `balanceTx` / `submitTx`.

## Funding it

The generated wallet is empty. On `preview`, the faucet at
`https://midnight-tmnight-preview.nethermind.dev/` funds the **unshielded**
address:

```ts
await new FaucetClient(env.faucet, logger).requestTokens(unshieldedAddress);
```

NIGHT alone is not enough to pay fees — the UTXOs have to be registered for dust
generation first (`walletFacade.registerNightUtxosForDustGeneration`, see
`bboard-cli/src/generate-dust.ts`). That step needs a running proof server, so it
belongs in the deploy CLI rather than here.

## Why no mnemonic

`@midnight-ntwrk/wallet-sdk-hd` exports `generateMnemonicWords` and
`validateMnemonic`, but no mnemonic→seed function — the entropy mapping Lace
uses is not exposed. Guessing it would produce a phrase that does not restore the
same wallet, which is worse than having no phrase at all. The raw seed is what
`FluentWalletBuilder.withSeed()` and the bboard CLI's "Build wallet from a seed"
prompt take, so that is what this script emits.
