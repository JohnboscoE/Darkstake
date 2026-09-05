import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DarkstakeAPI,
  entitlementOf,
  failureDetail,
  positionsOf,
  Side,
  type CallOutcome,
  type Ledger,
  type LivePosition,
} from '@/lib/darkstake-api';
import {
  initializeLiveProviders,
  liveContractAddress,
  liveNetworkId,
  detectWallet,
} from '@/lib/live-providers';
import {
  appendNote,
  importSecretKey,
  loadNotes,
  loadOrCreateSecretKey,
  secretKeyPersisted,
  storageAvailable,
  type StoredNote,
} from '@/lib/notes-store';

/**
 * One identity per market in live mode, unlike the simulation's cast of five.
 * There is only ever one secret key in this browser for a given contract, so
 * the notes it owns need no further discrimination.
 */
const LIVE_IDENTITY = 'me';

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export type LiveStage =
  /** No wallet connected yet. Nothing has touched the network. */
  | 'disconnected'
  /** Talking to Lace and building the provider stack. */
  | 'connecting'
  /** Connected; deploying or joining a market. */
  | 'attaching'
  /** Attached to a market and streaming its state. */
  | 'ready'
  /** Something failed before we got a market. `error` says what. */
  | 'failed';

export type LiveEvent = {
  seq: number;
  actor: string;
  call: string;
  ok: boolean;
  detail: string;
};

export function useLiveMarket() {
  const [stage, setStage] = useState<LiveStage>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ledgerState, setLedgerState] = useState<Ledger | null>(null);
  const [notes, setNotes] = useState<StoredNote[]>([]);
  const [log, setLog] = useState<LiveEvent[]>([]);
  const [proofServer, setProofServer] = useState<string | null>(null);

  const apiRef = useRef<DarkstakeAPI | null>(null);
  const seqRef = useRef(0);
  // The state subscription outlives individual renders and must be torn down on
  // unmount, or a websocket keeps pushing into a dead component.
  const subscriptionRef = useRef<{ unsubscribe(): void } | null>(null);

  useEffect(
    () => () => {
      subscriptionRef.current?.unsubscribe();
    },
    [],
  );

  const record = useCallback((call: string, ok: boolean, detail: string) => {
    setLog((entries) => [
      { seq: ++seqRef.current, actor: 'You', call, ok, detail },
      ...entries,
    ]);
  }, []);

  const attach = useCallback(
    (api: DarkstakeAPI) => {
      apiRef.current = api;
      setNotes(loadNotes(api.contractAddress, LIVE_IDENTITY));
      subscriptionRef.current?.unsubscribe();
      subscriptionRef.current = api.state$.subscribe({
        next: (state) => {
          setLedgerState(state);
          setStage('ready');
        },
        // A dropped indexer subscription is not fatal to what is already on
        // screen, so it is reported without discarding the market.
        error: (streamError: unknown) =>
          setError(`Lost the indexer stream: ${failureDetail(streamError)}`),
      });
    },
    [],
  );

  /**
   * Connects Lace and joins the market named by `VITE_CONTRACT_ADDRESS`.
   *
   * Nothing here happens on page load. Connecting a wallet is a decision, and
   * a landing page that reaches for the extension unprompted is one users are
   * right to distrust.
   */
  const connect = useCallback(async () => {
    setStage('connecting');
    setError(null);
    try {
      const address = liveContractAddress();
      if (address === null) {
        throw new Error(
          'No market configured. Set VITE_CONTRACT_ADDRESS to a deployed contract address and rebuild.',
        );
      }
      const connection = await initializeLiveProviders();
      setProofServer(connection.proofServerUri);
      setStage('attaching');

      const secretKey = loadOrCreateSecretKey(address);
      const api = await DarkstakeAPI.join(connection.providers, address, secretKey);
      attach(api);
      record('join()', true, `attached to ${address.slice(0, 12)}…`);
    } catch (caught) {
      setError(failureDetail(caught));
      setStage('failed');
    }
  }, [attach, record]);

  /**
   * Deploys a market of your own, making you its resolver.
   *
   * The key is generated before the deploy and persisted after it, under the
   * address the deploy returns -- it is the resolver secret, and the contract
   * has no circuit that can replace it. Losing it leaves a market that can
   * never be closed or resolved.
   */
  const deploy = useCallback(async () => {
    setStage('connecting');
    setError(null);
    try {
      const connection = await initializeLiveProviders();
      setProofServer(connection.proofServerUri);
      setStage('attaching');

      const secretKey = new Uint8Array(32);
      crypto.getRandomValues(secretKey);
      const api = await DarkstakeAPI.deploy(connection.providers, secretKey);
      importSecretKey(
        api.contractAddress,
        Array.from(secretKey, (b) => b.toString(16).padStart(2, '0')).join(''),
      );
      attach(api);
      record('deploy()', true, `you are the resolver of ${api.contractAddress.slice(0, 12)}…`);
    } catch (caught) {
      setError(failureDetail(caught));
      setStage('failed');
    }
  }, [attach, record]);

  /** Wraps a circuit call: one at a time, logged, with the button state driven. */
  const run = useCallback(
    async (label: string, call: (api: DarkstakeAPI) => Promise<CallOutcome>) => {
      const api = apiRef.current;
      if (api === null) return;
      setBusy(label);
      try {
        const outcome = await call(api);
        record(
          label,
          outcome.ok,
          outcome.ok ? `tx ${outcome.txId.slice(0, 12)}… in block ${outcome.blockHeight}` : outcome.detail,
        );
      } finally {
        setBusy(null);
      }
    },
    [record],
  );

  const commit = useCallback(
    async (side: Side, stake: bigint) => {
      const api = apiRef.current;
      if (api === null) return;
      setBusy('commitPosition');
      try {
        const outcome = await api.commitPosition(side, stake);
        if (
          outcome.ok &&
          outcome.salt &&
          outcome.ownerSalt &&
          outcome.positionId !== undefined
        ) {
          const note: StoredNote = {
            positionId: outcome.positionId,
            stake,
            salt: outcome.salt,
            ownerSalt: outcome.ownerSalt,
          };
          const saved = appendNote(api.contractAddress, LIVE_IDENTITY, note);
          setNotes(loadNotes(api.contractAddress, LIVE_IDENTITY));
          record(
            `commitPosition(${side === Side.YES ? 'YES' : 'NO'})`,
            true,
            saved
              ? `position #${outcome.positionId} committed; stake and salt saved locally`
              : `position #${outcome.positionId} committed, but this browser refused to store the salt — export it now or the position forfeits`,
          );
        } else if (outcome.ok) {
          // Submitted but we could not find our own row; the salt would be lost
          // on reload, which forfeits the position, so it goes in the log.
          record(
            `commitPosition(${side === Side.YES ? 'YES' : 'NO'})`,
            true,
            `submitted, but the position id could not be read back. Save both secrets now — stake salt ${
              outcome.salt ? toHex(outcome.salt) : 'unavailable'
            }, owner salt ${outcome.ownerSalt ? toHex(outcome.ownerSalt) : 'unavailable'}.`,
          );
        } else {
          record(`commitPosition(${side === Side.YES ? 'YES' : 'NO'})`, false, outcome.detail);
        }
      } finally {
        setBusy(null);
      }
    },
    [record],
  );

  const closeMarket = useCallback(() => run('closeMarket()', (api) => api.closeMarket()), [run]);

  const reveal = useCallback(
    (note: StoredNote) =>
      run(`revealPosition(#${note.positionId})`, (api) =>
        api.revealPosition(note.positionId, note.stake, note.salt, note.ownerSalt),
      ),
    [run],
  );

  const resolve = useCallback(
    (outcome: Side) =>
      run(`resolve(${outcome === Side.YES ? 'YES' : 'NO'})`, (api) => api.resolve(outcome)),
    [run],
  );

  const claim = useCallback(
    (note: StoredNote) =>
      run(`claimEntitlement(#${note.positionId})`, (api) =>
        api.claimEntitlement(note.positionId, note.ownerSalt),
      ),
    [run],
  );

  const api = apiRef.current;
  // Which positions are ours is answered from local notes, because since v2 it
  // cannot be answered from the chain: each position's owner tag is blinded
  // separately, so nothing on-chain groups them. This client is no better
  // placed than any other observer, which is the property we wanted.
  const myPositionIds = useMemo(
    () => new Set(notes.map((n) => String(n.positionId))),
    [notes],
  );
  const positions: LivePosition[] =
    ledgerState === null ? [] : positionsOf(ledgerState, myPositionIds);

  return {
    stage,
    error,
    busy,
    ledger: ledgerState,
    positions,
    notes,
    log,
    proofServer,
    networkId: liveNetworkId(),
    contractAddress: api?.contractAddress ?? liveContractAddress(),
    configuredAddress: liveContractAddress(),
    walletDetected: detectWallet(),
    notesPersist: storageAvailable(),
    keyPersisted: api !== null && secretKeyPersisted(api.contractAddress),
    isResolver: api !== null && ledgerState !== null && api.isResolver(ledgerState),
    entitlement: (id: bigint) => (ledgerState === null ? 0n : entitlementOf(ledgerState, id)),
    connect,
    deploy,
    commit,
    closeMarket,
    reveal,
    resolve,
    claim,
  };
}
