/**
 * Connects the browser to a real Midnight network through the Lace wallet.
 *
 * Ported from `midnight-leaderboard/leaderboard-ui/src/contexts/BrowserLeaderboardManager.ts`,
 * which is the verified-working shape for the 4.x connector API.
 *
 * The important thing this reveals: **the proof server and indexer URLs come
 * from Lace**, via `getConfiguration()`. The dapp does not host them and cannot
 * choose them. That is why no public proof server is needed to ship this site --
 * but also why each user must be running one locally for Lace to point at.
 *
 * What a user needs before any of this works:
 *   1. the Lace extension, on a connector API version matching 4.x
 *   2. a proof server Lace can reach (Lace's own setup covers this)
 *   3. NIGHT on the right network, registered for dust generation, or no
 *      transaction can pay its fee
 */
import { type ConnectedAPI, type InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { type NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  Binding,
  type FinalizedTransaction,
  Proof,
  SignatureEnabled,
  Transaction,
  type TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { type UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import {
  catchError,
  concatMap,
  filter,
  firstValueFrom,
  interval,
  map,
  take,
  throwError,
  timeout,
} from 'rxjs';

import { inMemoryPrivateStateProvider } from './private-state-provider';
import {
  type PMCircuitKeys,
  type PMPrivateState,
  type PMProviders,
  type PrivateStateId,
} from './live-contract';

/**
 * The connector API major version this dapp speaks.
 *
 * A major-version check rather than a semver dependency: the connector's
 * compatibility story is "major means breaking", and pulling semver plus its
 * types to evaluate `4.x` would be the only reason either is in this bundle.
 */
const COMPATIBLE_CONNECTOR_API_MAJOR = 4;
const COMPATIBLE_CONNECTOR_API_VERSION = `${COMPATIBLE_CONNECTOR_API_MAJOR}.x`;

const majorOf = (version: string): number | null => {
  const major = Number.parseInt(version.split('.')[0] ?? '', 10);
  return Number.isNaN(major) ? null : major;
};

/**
 * Which network to talk to. Defaults to preview, which is where the project's
 * wallet is funded. Lace must be on the same network or the connect is refused.
 */
export const liveNetworkId = (): NetworkId =>
  ((import.meta.env.VITE_NETWORK_ID ?? 'preview') as NetworkId);

/** The deployed market to join. Without it there is nothing to connect to. */
export const liveContractAddress = (): string | null => {
  const raw = import.meta.env.VITE_CONTRACT_ADDRESS;
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
};

type MidnightWindow = Window & {
  midnight?: Record<string, unknown>;
};

/** True when a compatible wallet is present right now. Used to gate the UI. */
export const detectWallet = (): boolean => firstCompatibleWallet() !== undefined;

const firstCompatibleWallet = (): InitialAPI | undefined => {
  const injected = (window as MidnightWindow).midnight;
  if (!injected) return undefined;
  return Object.values(injected).find(
    (wallet): wallet is InitialAPI =>
      !!wallet &&
      typeof wallet === 'object' &&
      'apiVersion' in wallet &&
      typeof (wallet as { apiVersion: unknown }).apiVersion === 'string' &&
      majorOf((wallet as { apiVersion: string }).apiVersion) === COMPATIBLE_CONNECTOR_API_MAJOR,
  );
};

/**
 * Waits for the extension to inject itself, then asks it to connect.
 *
 * Polled rather than awaited once: extensions inject asynchronously and are
 * routinely absent for the first few hundred milliseconds after load. The two
 * timeouts are distinguished on purpose -- "no wallet" and "wallet ignored us"
 * are different problems for the user to fix.
 */
export const connectToWallet = (networkId: string): Promise<ConnectedAPI> =>
  firstValueFrom(
    interval(100).pipe(
      map(() => firstCompatibleWallet()),
      filter((api): api is InitialAPI => !!api),
      take(1),
      timeout({
        first: 3_000,
        with: () =>
          throwError(
            () =>
              new Error(
                `No compatible Midnight wallet found. Install the Lace extension (connector API ${COMPATIBLE_CONNECTOR_API_VERSION}) and reload.`,
              ),
          ),
      }),
      concatMap(async (initialAPI) => initialAPI.connect(networkId)),
      timeout({
        first: 15_000,
        with: () =>
          throwError(() => new Error('Lace did not respond. Open the extension and approve the connection.')),
      }),
      catchError((error) =>
        throwError(() => (error instanceof Error ? error : new Error('Wallet connection was refused.'))),
      ),
    ),
  );

export type LiveConnection = {
  providers: PMProviders;
  proofServerUri: string;
  indexerUri: string;
  networkId: NetworkId;
};

/**
 * Builds the full provider stack against a connected Lace wallet.
 *
 * `balanceTx` and `submitTx` delegate to the wallet: this dapp never holds a
 * key and never signs. The user approves each transaction in the extension,
 * which is the only reason it is safe to ask a judge to point a funded wallet
 * at a hackathon build.
 */
export const initializeLiveProviders = async (): Promise<LiveConnection> => {
  const networkId = liveNetworkId();
  setNetworkId(networkId);

  const connectedAPI = await connectToWallet(networkId);
  const config = await connectedAPI.getConfiguration();

  const proofServerUri = config.proverServerUri;
  if (!proofServerUri) {
    throw new Error(
      'Lace reported no proof server. Start a local Midnight proof server and configure Lace to use it.',
    );
  }

  const shieldedAddresses = await connectedAPI.getShieldedAddresses();
  const zkConfigProvider = new FetchZkConfigProvider<PMCircuitKeys>(
    window.location.origin,
    fetch.bind(window),
  );

  const providers: PMProviders = {
    privateStateProvider: inMemoryPrivateStateProvider<PrivateStateId, PMPrivateState>(),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(proofServerUri, zkConfigProvider),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      getCoinPublicKey: () => shieldedAddresses.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => shieldedAddresses.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        const received = await connectedAPI.balanceUnsealedTransaction(toHex(tx.serialize()));
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
          'signature',
          'proof',
          'binding',
          fromHex(received.tx),
        );
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await connectedAPI.submitTransaction(toHex(tx.serialize()));
        return tx.identifiers()[0];
      },
    },
  } as unknown as PMProviders;

  return { providers, proofServerUri, indexerUri: config.indexerUri, networkId };
};
