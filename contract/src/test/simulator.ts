/**
 * Simulator for the prediction-market contract.
 *
 * This drives the REAL compiled contract through `@midnight-ntwrk/compact-runtime`
 * against the artifacts in `managed/` -- no Docker, no proof server, no proving
 * keys. It is deliberately NOT the pattern used by
 * `midnight-leaderboard/contract/test/leaderboard-simulator.ts`, which is a
 * hand-written mock of a different contract and therefore cannot catch a circuit
 * bug. See §0 of the build spec.
 *
 * Because the contract is what actually runs, a failed `assert` inside a circuit
 * surfaces here as a thrown error, which is exactly what the adversarial tests
 * rely on.
 */
import {
  CostModel,
  QueryContext,
  createConstructorContext,
  sampleContractAddress,
  type CircuitContext,
} from '@midnight-ntwrk/compact-runtime';

import { Contract, ledger, type Ledger, Side, Phase } from '../../managed/prediction-market/contract/index.js';
import { createWitnesses, type PMPrivateState } from '../witnesses.js';

export { Side, Phase };

/** A participant: their secret key plus the stake and salt they are holding. */
export interface User {
  secretKey: Uint8Array;
  stake: bigint;
  salt: Uint8Array;
}

export const user = (fill: number, stake: bigint, saltFill = fill + 100): User => ({
  secretKey: new Uint8Array(32).fill(fill),
  stake,
  salt: new Uint8Array(32).fill(saltFill),
});

export class MarketSimulator {
  private contract: Contract<PMPrivateState>;
  private context: CircuitContext<PMPrivateState>;

  /**
   * The deployer becomes the resolver, so whoever is passed here is the one
   * account that can later close and resolve the market.
   */
  constructor(deployer: User) {
    this.contract = new Contract<PMPrivateState>(createWitnesses());

    const { currentPrivateState, currentContractState, currentZswapLocalState } =
      this.contract.initialState(
        createConstructorContext(
          { secretKey: deployer.secretKey, stake: deployer.stake, salt: deployer.salt },
          '0'.repeat(64),
        ),
      );

    this.context = {
      currentPrivateState,
      currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(currentContractState.data, sampleContractAddress()),
    };
  }

  /** Public ledger state — only ever what an on-chain observer could read. */
  get ledger(): Ledger {
    return ledger(this.context.currentQueryContext.state);
  }

  /** Swap in a different participant's private state before calling a circuit. */
  private as(u: User): void {
    this.context = {
      ...this.context,
      currentPrivateState: { secretKey: u.secretKey, stake: u.stake, salt: u.salt },
    };
  }

  commitPosition(u: User, side: Side): void {
    this.as(u);
    this.context = this.contract.impureCircuits.commitPosition(this.context, side).context;
  }

  closeMarket(u: User): void {
    this.as(u);
    this.context = this.contract.impureCircuits.closeMarket(this.context).context;
  }

  revealPosition(u: User, id: bigint, stake: bigint, salt: Uint8Array): void {
    this.as(u);
    this.context = this.contract.impureCircuits.revealPosition(
      this.context,
      id,
      stake,
      salt,
    ).context;
  }

  resolve(u: User, outcome: Side): void {
    this.as(u);
    this.context = this.contract.impureCircuits.resolve(this.context, outcome).context;
  }

  claimEntitlement(u: User, id: bigint): void {
    this.as(u);
    this.context = this.contract.impureCircuits.claimEntitlement(this.context, id).context;
  }

  /**
   * Pro-rata payout for a winning position:
   *
   *     revealedStake * pool / winningStakeTotal
   *
   * Computed here rather than in the circuit because **Compact has no division
   * operator** — the contract records the three terms and any client can derive
   * and verify the quotient from public state. Integer division truncates, so
   * the sum of entitlements can fall a few units short of the pool; that dust is
   * unavoidable without a rounding rule and is left in the pool.
   */
  entitlement(id: bigint): bigint {
    const p = this.ledger.positions.lookup(id);
    const { pool, winningStakeTotal } = this.ledger;
    if (winningStakeTotal === 0n) return 0n;
    return (p.revealedStake * pool) / winningStakeTotal;
  }

  /**
   * Every position, as an on-chain observer would see it, sorted by id.
   *
   * The sort is load-bearing: the ledger `Map` does NOT iterate in insertion
   * order (it is a Merkle-backed structure keyed by hash), so reading positions
   * straight off the iterator returns them in an arbitrary order. Anything that
   * displays or settles positions has to order them explicitly.
   */
  allPositions() {
    return Array.from(this.ledger.positions)
      .map(([id, p]) => ({ id, ...p }))
      .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  }
}
