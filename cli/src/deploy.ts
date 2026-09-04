// Deploys one prediction market to a Midnight network.
//
//   npm run deploy -- --network preview --seed-file ../wallet/.wallets/preview.json
//
// One deployed contract == one market, and the deployer's secret key becomes the
// resolver (see the contract's `constructor`). So the seed used here is the seed
// that will later be able to call closeMarket and resolve -- keep it.
//
// Requires a reachable proof server. The testkit starts one in Docker for you.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { WebSocket } from 'ws';

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import pino from 'pino';

import { configFor } from './config.js';
import { DarkstakeWalletProvider } from './wallet-provider.js';
import { registerForDust, syncWallet, waitForNight } from './funding.js';
import {
  CompiledPredictionMarket,
  pmPrivateStateKey,
  type PMCircuitKeys,
  type PMPrivateState,
  type PMProviders,
} from './contract.js';

// Apollo's subscription transport expects a global WebSocket.
// @ts-expect-error -- Node has no global WebSocket in this version.
globalThis.WebSocket = WebSocket;

const here = path.dirname(fileURLToPath(import.meta.url));

type Args = {
  network: string;
  seedFile: string | null;
  seed: string | null;
  faucet: boolean;
};

const parseArgs = (argv: string[]): Args => {
  const args: Args = { network: 'preview', seedFile: null, seed: null, faucet: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = (): string => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    switch (arg) {
      case '--network': args.network = value(); break;
      case '--seed-file': args.seedFile = value(); break;
      case '--seed': args.seed = value(); break;
      case '--faucet': args.faucet = true; break;
      default: throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
};

const readSeed = (args: Args): string => {
  if (args.seed !== null) return args.seed;
  const file = args.seedFile ?? path.resolve(here, '..', '..', 'wallet', '.wallets', `${args.network}.json`);
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { seed?: string; network?: string };
  if (typeof parsed.seed !== 'string') throw new Error(`${file} has no "seed" field`);
  if (parsed.network !== undefined && parsed.network !== args.network) {
    throw new Error(`${file} is a ${parsed.network} wallet but --network is ${args.network}`);
  }
  return parsed.seed;
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const config = configFor(args.network);
  const seed = readSeed(args);

  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const testEnv = config.getEnvironment(logger);
  let walletProvider: DarkstakeWalletProvider | undefined;

  try {
    // Starts the proof server container and hands back the resolved URLs.
    const env = await testEnv.start();
    logger.info(`Environment ready on ${config.network} (proof server ${env.proofServer})`);

    walletProvider = await DarkstakeWalletProvider.build(logger, env, seed);
    await walletProvider.start();

    const unshielded = await waitForNight(logger, walletProvider.wallet, env, args.faucet);
    await registerForDust(logger, seed, unshielded, walletProvider.wallet);
    await syncWallet(logger, walletProvider.wallet);

    const zkConfigProvider = new NodeZkConfigProvider<PMCircuitKeys>(config.zkConfigPath);
    const providers: PMProviders = {
      privateStateProvider: levelPrivateStateProvider<typeof pmPrivateStateKey, PMPrivateState>({
        privateStateStoreName: config.privateStateStoreName,
        signingKeyStoreName: `${config.privateStateStoreName}-signing-keys`,
        privateStoragePasswordProvider: () => process.env.PRIVATE_STATE_PASSWORD ?? 'Darkstake-Local-Dev',
        accountId: seed,
      }),
      publicDataProvider: indexerPublicDataProvider(env.indexer, env.indexerWS),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(env.proofServer, zkConfigProvider),
      walletProvider,
      midnightProvider: walletProvider,
    };

    // The resolver identity is derived from this secret key inside the
    // constructor. Losing it means losing the ability to close and resolve the
    // market, so it is written out alongside the contract address.
    const resolverSecretKey = new Uint8Array(32);
    webcrypto.getRandomValues(resolverSecretKey);
    const initialPrivateState: PMPrivateState = {
      secretKey: resolverSecretKey,
      stake: 0n,
      salt: new Uint8Array(32),
    };

    logger.info('Deploying prediction market...');
    const deployed = await deployContract(providers, {
      compiledContract: CompiledPredictionMarket,
      privateStateId: pmPrivateStateKey,
      initialPrivateState,
    });

    const contractAddress = deployed.deployTxData.public.contractAddress;
    const out = path.resolve(here, '..', '.deployments', `${config.network}.json`);
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(
      out,
      `${JSON.stringify(
        {
          network: config.network,
          contractAddress,
          deployedAt: new Date().toISOString(),
          resolverSecretKey: Buffer.from(resolverSecretKey).toString('hex'),
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );

    logger.info(`Deployed at ${contractAddress}`);
    logger.info(`Wrote ${out} (contains the resolver secret key -- gitignored)`);
  } finally {
    if (walletProvider) await walletProvider.stop().catch(() => undefined);
    await testEnv.shutdown().catch(() => undefined);
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : error);
  process.exitCode = 1;
});
