/**
 * The prediction market, driven against a real Midnight network.
 *
 * This is the live counterpart to `market-engine.ts`. The two run the *same*
 * compiled circuits from the same `contract/managed/prediction-market` build;
 * what differs is where they run. `market-engine` executes them in memory
 * against a local `CircuitContext`, unproven, with state that dies on reload.
 * Everything here goes through midnight-js: each call is proved by a real proof
 * server, balanced and signed by the user's Lace wallet, submitted as a
 * transaction, and read back from the public indexer.
 *
 * Practical consequences worth knowing before reading further:
 *
 *   - Every write costs a fee and takes as long as proving plus a block.
 *     Proving `commitPosition` is seconds, not milliseconds.
 *   - A rejected `assert` fails *locally*, while the transaction is being
 *     built -- there is no proof for a transcript the circuit refused to
 *     produce, so nothing is submitted and nothing is paid. That is why the
 *     error messages below still read like the simulation's.
 *   - Reads come from the indexer, not from us. `state$` is the chain's view of
 *     the market, which is the only view that matters.
 */
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { map, type Observable } from 'rxjs';

import {
  CompiledPredictionMarket,
  Phase,
  Side,
  ledger,
  pmPrivateStateKey,
  pureCircuits,
  type DeployedPMContract,
  type Ledger,
  type PMPrivateState,
  type PMProviders,
} from './live-contract';

export { Phase, Side };
export type { Ledger };

/** A position as an on-chain observer sees it, plus whether it is ours. */
export type LivePosition = {
  id: bigint;
  side: Side;
  stakeCommitment: Uint8Array;
  ownerHash: Uint8Array;
  revealed: boolean;
  revealedStake: bigint;
  claimed: boolean;
  mine: boolean;
};

/**
 * The result of a circuit call.
 *
 * A failure is not an exception here because a rejected `assert` is an ordinary
 * outcome the UI has to render -- trying to close a market you do not own is a
 * thing this demo actively invites you to do.
 */
export type CallOutcome =
  | { ok: true; txId: string; blockHeight: number }
  | { ok: false; detail: string };

const zeroSalt = (): Uint8Array => new Uint8Array(32);

export const randomSalt = (): Uint8Array => {
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  return salt;
};

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Pulls the circuit's own `assert` message out of whatever wrapped it.
 *
 * Worth the effort: "market not open" is actionable and the runtime's wrapper
 * around it is not, and those assert strings are written in the contract
 * precisely so that a person can read them.
 */
export const failureDetail = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);
  const assertion = raw.match(/failed assert:\s*(.+?)(?:\n|$)/i);
  if (assertion) return assertion[1].trim();
  // The other common shape by far: the proof server or indexer is unreachable.
  if (/failed to fetch|networkerror|econnrefused/i.test(raw)) {
    return `${raw} - check that the proof server Lace points at is running.`;
  }
  return raw;
};

/**
 * Pro-rata payout for a position, derived from public state.
 *
 * Identical to the simulation's, and for the same reason: Compact has no
 * division operator, so the contract publishes `pool` and `winningStakeTotal`
 * and anyone -- this client, a judge, a competing UI -- computes the quotient
 * and gets the same answer. Recording the terms rather than the answer is what
 * makes the settlement checkable by someone who does not trust us.
 */
export const entitlementOf = (state: Ledger, positionId: bigint): bigint => {
  if (state.winningStakeTotal === 0n) return 0n;
  if (!state.positions.member(positionId)) return 0n;
  const position = state.positions.lookup(positionId);
  if (!state.winningSide.is_some || position.side !== state.winningSide.value) return 0n;
  return (position.revealedStake * state.pool) / state.winningStakeTotal;
};

/**
 * Positions sorted by id.
 *
 * The sort is load-bearing: `positions` is a Merkle-backed map keyed by hash,
 * so iterating it yields no useful order and an unsorted table would reshuffle
 * itself every time a block changed the map.
 */
export const positionsOf = (state: Ledger, ownerHash: Uint8Array | null): LivePosition[] => {
  const mine = ownerHash === null ? null : hex(ownerHash);
  return Array.from(state.positions)
    .map(([id, p]): LivePosition => ({
      id,
      side: p.side,
      stakeCommitment: p.stakeCommitment,
      ownerHash: p.ownerHash,
      revealed: p.revealed,
      revealedStake: p.revealedStake,
      claimed: p.claimed,
      mine: mine !== null && hex(p.ownerHash) === mine,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
};

export class DarkstakeAPI {
  private constructor(
    private readonly deployed: DeployedPMContract,
    private readonly providers: PMProviders,
    private readonly secretKey: Uint8Array,
  ) {
    this.contractAddress = deployed.deployTxData.public.contractAddress;
    this.ownerHash = pureCircuits.ownerCommitment(secretKey);

    providers.privateStateProvider.setContractAddress(this.contractAddress);

    this.state$ = providers.publicDataProvider
      .contractStateObservable(this.contractAddress, { type: 'latest' })
      .pipe(map((contractState) => ledger(contractState.data)));
  }

  readonly contractAddress: string;
  /** `hash(secretKey)`; what identifies our positions in public state. */
  readonly ownerHash: Uint8Array;
  /** The chain's view of this market, re-emitted on every block that changes it. */
  readonly state$: Observable<Ledger>;

  /** True when this key is the one the contract will accept as resolver. */
  isResolver(state: Ledger): boolean {
    return hex(state.resolver) === hex(this.ownerHash);
  }

  /**
   * Deploys a fresh market. The deployer becomes its resolver, permanently:
   * `resolver` is set from this secret key in the constructor and no circuit
   * changes it afterwards.
   */
  static async deploy(providers: PMProviders, secretKey: Uint8Array): Promise<DarkstakeAPI> {
    const deployed = await deployContract(providers, {
      compiledContract: CompiledPredictionMarket,
      privateStateId: pmPrivateStateKey,
      initialPrivateState: { secretKey, stake: 0n, salt: zeroSalt() },
    });
    return new DarkstakeAPI(deployed, providers, secretKey);
  }

  /** Joins a market someone else deployed. */
  static async join(
    providers: PMProviders,
    contractAddress: string,
    secretKey: Uint8Array,
  ): Promise<DarkstakeAPI> {
    const found = await findDeployedContract(providers, {
      contractAddress,
      compiledContract: CompiledPredictionMarket,
      privateStateId: pmPrivateStateKey,
      initialPrivateState: { secretKey, stake: 0n, salt: zeroSalt() },
    });
    return new DarkstakeAPI(found, providers, secretKey);
  }

  /** Reads current state once, for the cases that cannot wait on the stream. */
  async currentState(): Promise<Ledger> {
    const contractState = await this.providers.publicDataProvider.queryContractState(
      this.contractAddress,
    );
    if (contractState === null) {
      throw new Error(`No contract found at ${this.contractAddress} on this network.`);
    }
    return ledger(contractState.data);
  }

  /**
   * Loads the witness values this call will read.
   *
   * The witnesses (`localSecretKey`, `stakeValue`, `stakeSalt`) are pulled from
   * the private state provider while the transcript is being built, so the
   * values have to be in place *before* the call rather than passed to it.
   * Calls that stake nothing still pass a non-zero placeholder: no circuit but
   * `commitPosition` reads it, and `commitPosition` asserts it is positive.
   */
  private async loadWitnesses(stake: bigint, salt: Uint8Array): Promise<void> {
    const state: PMPrivateState = { secretKey: this.secretKey, stake, salt };
    this.providers.privateStateProvider.setContractAddress(this.contractAddress);
    await this.providers.privateStateProvider.set(pmPrivateStateKey, state);
  }

  private async submit(
    call: () => Promise<{ public: { txId: string; blockHeight: number } }>,
  ): Promise<CallOutcome> {
    try {
      const finalized = await call();
      return { ok: true, txId: finalized.public.txId, blockHeight: finalized.public.blockHeight };
    } catch (error) {
      return { ok: false, detail: failureDetail(error) };
    }
  }

  /**
   * Takes a position. The side is public; the amount is not.
   *
   * Returns the salt on success so the caller can persist it. It is generated
   * here rather than by the caller so there is exactly one place that can get
   * it wrong -- but it must be stored: without the salt the commitment cannot
   * be reopened and the position forfeits at reveal.
   */
  async commitPosition(
    side: Side,
    stake: bigint,
  ): Promise<CallOutcome & { salt?: Uint8Array; positionId?: bigint }> {
    const salt = randomSalt();
    await this.loadWitnesses(stake, salt);
    const outcome = await this.submit(() => this.deployed.callTx.commitPosition(side));
    if (!outcome.ok) return outcome;

    // Which id we were assigned is not in the call result, so it is recovered
    // from public state by matching the commitment we just computed. More
    // robust than assuming `nextId` still refers to us: another staker's commit
    // can land in the same block.
    const commitment = hex(pureCircuits.stakeCommit(stake, salt));
    let positionId: bigint | undefined;
    try {
      const state = await this.currentState();
      positionId = Array.from(state.positions).find(
        ([, p]) => hex(p.stakeCommitment) === commitment,
      )?.[0];
    } catch {
      // The position exists on-chain either way; we just cannot label it yet.
    }
    return { ...outcome, salt, positionId };
  }

  /** Resolver only: closes the book so stakes can be revealed. */
  async closeMarket(): Promise<CallOutcome> {
    await this.loadWitnesses(1n, zeroSalt());
    return this.submit(() => this.deployed.callTx.closeMarket());
  }

  /**
   * Reopens a commitment, making the amount public and provable.
   *
   * `stake` and `salt` are circuit arguments rather than witnesses: the point
   * of the reveal is that these values become public, and the circuit checks
   * them against the commitment posted before the outcome was known.
   */
  async revealPosition(positionId: bigint, stake: bigint, salt: Uint8Array): Promise<CallOutcome> {
    await this.loadWitnesses(stake, salt);
    return this.submit(() => this.deployed.callTx.revealPosition(positionId, stake, salt));
  }

  /** Resolver only: records the outcome and freezes the settlement terms. */
  async resolve(outcome: Side): Promise<CallOutcome> {
    await this.loadWitnesses(1n, zeroSalt());
    return this.submit(() => this.deployed.callTx.resolve(outcome));
  }

  /** Records that this position is entitled to a share. Moves no value. */
  async claimEntitlement(positionId: bigint): Promise<CallOutcome> {
    await this.loadWitnesses(1n, zeroSalt());
    return this.submit(() => this.deployed.callTx.claimEntitlement(positionId));
  }
}
