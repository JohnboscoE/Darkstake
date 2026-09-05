// Network wiring for the deploy CLI.
//
// The one rule: the wallet address you funded, the network id, and the
// indexer/RPC URLs must all name the same chain. Bundling them per-network --
// rather than threading a network string through by hand -- is what stops a
// preview wallet from being pointed at a preprod indexer, which fails in ways
// that look like anything but a config error.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type EnvironmentConfiguration,
  RemoteTestEnvironment,
  type TestEnvironment,
} from '@midnight-ntwrk/testkit-js';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { type Logger } from 'pino';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Where `compact compile` (without --skip-zk) puts contract, zkir and keys. */
export const zkConfigPath = path.resolve(here, '..', '..', 'contract', 'managed', 'prediction-market');

export type NetworkName = 'preview' | 'preprod';

export interface Config {
  readonly network: NetworkName;
  readonly privateStateStoreName: string;
  readonly zkConfigPath: string;
  readonly logDir: string;
  getEnvironment(logger: Logger): TestEnvironment;
}

/** Public endpoints per network. One place, so they cannot drift apart. */
const urlsFor = (network: NetworkName) => ({
  walletNetworkId: network,
  networkId: network,
  indexer: `https://indexer.${network}.midnight.network/api/v4/graphql`,
  indexerWS: `wss://indexer.${network}.midnight.network/api/v4/graphql/ws`,
  node: `https://rpc.${network}.midnight.network`,
  nodeWS: `wss://rpc.${network}.midnight.network`,
  faucet: `https://midnight-tmnight-${network}.nethermind.dev/`,
});

/**
 * An environment pointing at a proof server that is already running.
 *
 * Skips testcontainers entirely. Preferred when something else owns the proof
 * server -- the devcontainer starts one on :6300 via postStartCommand, and a
 * remote one works identically. Fewer moving parts than docker-in-docker, and
 * it is the only option when the prover lives on another machine.
 */
export const environmentFor = (network: NetworkName, proofServer: string): EnvironmentConfiguration => {
  setNetworkId(network);
  return { ...urlsFor(network), proofServer };
};

const remoteEnvironment = (network: NetworkName): new (logger: Logger) => RemoteTestEnvironment =>
  class extends RemoteTestEnvironment {
    getEnvironmentConfiguration(): EnvironmentConfiguration {
      const container = this.proofServerContainer as { getUrl(): string } | undefined;
      if (!container) throw new Error('Proof server container is not available.');
      return { ...urlsFor(network), proofServer: container.getUrl() };
    }
  };

const makeConfig = (network: NetworkName): Config => ({
  network,
  privateStateStoreName: `darkstake-private-state-${network}`,
  zkConfigPath,
  logDir: path.resolve(here, '..', 'logs', network, `${new Date().toISOString().replace(/:/g, '-')}.log`),
  getEnvironment(logger: Logger): TestEnvironment {
    setNetworkId(network);
    const Env = remoteEnvironment(network);
    return new Env(logger);
  },
});

export const configFor = (network: string): Config => {
  if (network !== 'preview' && network !== 'preprod') {
    throw new Error(`unknown network '${network}' -- expected preview or preprod`);
  }
  return makeConfig(network);
};
