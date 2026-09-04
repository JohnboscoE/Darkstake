// Generates a Midnight wallet: a 32-byte master seed plus every address the
// three sub-wallets derive from it (unshielded/NIGHT, shielded/Zswap, dust).
//
// Everything here is offline key derivation -- no node, indexer or proof server
// is contacted. The master seed is the whole wallet; the addresses are just
// derived views of it. Feed the seed back to the SDK with
// `FluentWalletBuilder.forEnvironment(env).withSeed(seed)` (see
// example-bboard/bboard-cli/src/midnight-wallet-provider.ts) to get a live
// WalletFacade against a network.
//
// Usage:
//   node generate-wallet.mjs [--network preview|preprod|undeployed]
//                            [--seed <64 hex chars>]   re-derive, don't generate
//                            [--account N] [--index N]
//                            [--out <path>|--no-out]

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { createKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import {
  DustAddress,
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';
import { DustSecretKey, ZswapSecretKeys } from '@midnight-ntwrk/midnight-js-protocol/ledger';

const NETWORKS = ['preview', 'preprod', 'undeployed'];

const parseArgs = (argv) => {
  const args = { network: 'preview', seed: null, account: 0, index: 0, out: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    switch (arg) {
      case '--network': args.network = value(); break;
      case '--seed': args.seed = value(); break;
      case '--account': args.account = Number(value()); break;
      case '--index': args.index = Number(value()); break;
      case '--out': args.out = value(); break;
      case '--no-out': args.out = null; break;
      default: throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!NETWORKS.includes(args.network)) {
    throw new Error(`--network must be one of ${NETWORKS.join(', ')}`);
  }
  if (args.seed !== null && !/^[0-9a-fA-F]{64}$/.test(args.seed)) {
    throw new Error('--seed must be exactly 64 hex characters (32 bytes)');
  }
  if (!Number.isInteger(args.account) || args.account < 0) throw new Error('--account must be a non-negative integer');
  if (!Number.isInteger(args.index) || args.index < 0) throw new Error('--index must be a non-negative integer');
  return args;
};

const toHex = (bytes) => Buffer.from(bytes).toString('hex');

const args = parseArgs(process.argv.slice(2));

// The master seed IS the wallet. 32 bytes, same shape the bboard CLI hands to
// FluentWalletBuilder.withSeed().
const generated = args.seed === null;
const masterSeed = generated
  ? Buffer.from(webcrypto.getRandomValues(new Uint8Array(32)))
  : Buffer.from(args.seed, 'hex');

const seedResult = HDWallet.fromSeed(masterSeed);
if (seedResult.type !== 'seedOk') {
  throw new Error(`seed rejected by HDWallet: ${String(seedResult.error)}`);
}
const hdWallet = seedResult.hdWallet;

const roles = [Roles.NightExternal, Roles.Dust, Roles.Zswap];
const derived = hdWallet.selectAccount(args.account).selectRoles(roles).deriveKeysAt(args.index);
if (derived.type !== 'keysDerived') {
  throw new Error(`key derivation out of bounds for roles ${derived.roles.join(', ')}`);
}
hdWallet.clear();

// Unshielded (NIGHT) -- the address the faucet funds and fees are paid from.
const keystore = createKeystore(derived.keys[Roles.NightExternal], args.network);

// Shielded (Zswap) -- coin public key + encryption public key, bech32m together.
const zswap = ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]);
const shielded = new ShieldedAddress(
  ShieldedCoinPublicKey.fromHexString(zswap.coinPublicKey),
  ShieldedEncryptionPublicKey.fromHexString(zswap.encryptionPublicKey),
);

// Dust -- the fee-generating wallet NIGHT UTXOs get registered against.
const dust = DustSecretKey.fromSeed(derived.keys[Roles.Dust]);

const wallet = {
  network: args.network,
  account: args.account,
  addressIndex: args.index,
  createdAt: new Date().toISOString(),
  seed: masterSeed.toString('hex'),
  unshielded: {
    address: keystore.getBech32Address().toString(),
    addressHex: keystore.getAddress(),
  },
  shielded: {
    address: ShieldedAddress.codec.encode(args.network, shielded).toString(),
    coinPublicKey: shielded.coinPublicKeyString(),
    encryptionPublicKey: shielded.encryptionPublicKeyString(),
  },
  dust: {
    address: DustAddress.encodePublicKey(args.network, dust.publicKey),
  },
};

const label = (text) => `\x1b[2m${text}\x1b[0m`;
console.log(`
${generated ? 'Generated' : 'Re-derived'} a Midnight wallet on ${label(args.network)} (account ${args.account}, index ${args.index}).

${label('SEED (secret -- this is the entire wallet)')}
  ${wallet.seed}

${label('Unshielded / NIGHT   fund this one from the faucet')}
  ${wallet.unshielded.address}
  ${label('hex')} ${wallet.unshielded.addressHex}

${label('Shielded / Zswap')}
  ${wallet.shielded.address}
  ${label('coin pk')} ${wallet.shielded.coinPublicKey}
  ${label('enc pk')}  ${wallet.shielded.encryptionPublicKey}

${label('Dust')}
  ${wallet.dust.address}
`);

const outPath = args.out === undefined
  ? path.resolve(import.meta.dirname, '.wallets', `${args.network}.json`)
  : args.out;

if (outPath === null) {
  console.log('Not written to disk (--no-out). Copy the seed now or it is gone.\n');
} else {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(wallet, null, 2)}\n`, { mode: 0o600 });
  console.log(`Written to ${outPath} (contains the seed -- gitignored, do not commit).\n`);
}
