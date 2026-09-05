/**
 * Browser-side market engine.
 *
 * This is NOT a mock. It loads the real compiled Compact contract from
 * `../contract/managed/prediction-market` -- the same artifacts the vitest suite
 * runs against -- and drives it through `@midnight-ntwrk/compact-runtime`. Every
 * button in the demo UI executes a real circuit against real ledger state, and
 * every error message you see is a genuine failed `assert` from inside the
 * circuit, not a string we invented.
 *
 * What is simulated is the *network*, not the contract: there is no proof
 * server, no indexer and no wallet, so circuits run unproven and state lives in
 * memory. The circuit logic, the disclosure boundary and the assert behaviour
 * are all exactly what would run on-chain.
 *
 * Proving keys DO now exist -- built by the `proving-keys` GitHub workflow,
 * since `zkir` needs bmi2/adx instructions this 2011 CPU lacks -- and are
 * served from `public/keys/` via `zk-config.ts`. They change nothing here:
 * keys feed a prover, and there is still no proof server to run one. Wiring
 * this engine to real proofs means replacing the in-memory `CircuitContext`
 * with the provider stack in `cli/`, not adding keys to this file.
 */
import {
  CostModel,
  QueryContext,
  createConstructorContext,
  sampleContractAddress,
  type CircuitContext,
} from '@midnight-ntwrk/compact-runtime';

import { Contract, ledger, Side, Phase, type Ledger } from '../../../contract/managed/prediction-market/contract/index.js';

export { Side, Phase };
export type { Ledger };

export interface Identity {
  id: string;
  label: string;
  blurb: string;
  secretKey: Uint8Array;
}

/**
 * A staker's local bookkeeping: the numbers that never reach the chain.
 * Lose these and you cannot reveal, which is a real property of the design and
 * worth showing rather than hiding.
 */
export interface LocalNote {
  positionId: bigint;
  stake: bigint;
  salt: Uint8Array;
}

export interface LogEntry {
  seq: number;
  actor: string;
  call: string;
  ok: boolean;
  detail: string;
}

type PrivateState = {
  readonly secretKey: Uint8Array;
  readonly stake: bigint;
  readonly salt: Uint8Array;
};

const key = (fill: number) => new Uint8Array(32).fill(fill);

export const IDENTITIES: Identity[] = [
  {
    id: 'resolver',
    label: 'Resolver',
    blurb: 'Deployed the market. The only account that can close it and report the outcome.',
    secretKey: key(1),
  },
  {
    id: 'whale',
    label: 'Whale',
    blurb: 'Large conviction position. The one a transparent market would leak.',
    secretKey: key(2),
  },
  {
    id: 'minnow',
    label: 'Minnow',
    blurb: 'Small position. Indistinguishable from the whale on-chain.',
    secretKey: key(3),
  },
  {
    id: 'contrarian',
    label: 'Contrarian',
    blurb: 'Takes the other side.',
    secretKey: key(4),
  },
  {
    id: 'observer',
    label: 'Observer',
    blurb: 'Holds no position. Useful for proving that outsiders are rejected.',
    secretKey: key(9),
  },
];

const randomSalt = (): Uint8Array => {
  const s = new Uint8Array(32);
  crypto.getRandomValues(s);
  return s;
};

/** Strips the runtime's wrapper so the UI shows the circuit's own message. */
const assertMessage = (e: unknown): string => {
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.match(/failed assert:\s*(.+)/i);
  return m ? m[1].trim() : raw;
};

export class MarketEngine {
  private contract: Contract<PrivateState>;
  private context: CircuitContext<PrivateState>;

  /** positionId -> owning identity, for rendering only. Not on-chain. */
  readonly owners = new Map<string, string>();
  /** identity id -> their private notes. Never leaves the "client". */
  readonly notes = new Map<string, LocalNote[]>();
  readonly log: LogEntry[] = [];

  readonly question: string;
  readonly resolutionCriteria: string;

  private seq = 0;

  constructor(question: string, resolutionCriteria: string) {
    this.question = question;
    this.resolutionCriteria = resolutionCriteria;

    this.contract = new Contract<PrivateState>({
      localSecretKey: ({ privateState }) => [privateState, privateState.secretKey],
      stakeValue: ({ privateState }) => [privateState, privateState.stake],
      stakeSalt: ({ privateState }) => [privateState, privateState.salt],
    });

    const deployer = IDENTITIES[0];
    const init = this.contract.initialState(
      createConstructorContext(
        { secretKey: deployer.secretKey, stake: 1n, salt: randomSalt() },
        '0'.repeat(64),
      ),
    );

    this.context = {
      currentPrivateState: init.currentPrivateState,
      currentZswapLocalState: init.currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(init.currentContractState.data, sampleContractAddress()),
    };

    this.record('Resolver', 'deploy', true, 'market created, phase OPEN');
  }

  // ── reads ────────────────────────────────────────────────────────────────

  get ledger(): Ledger {
    return ledger(this.context.currentQueryContext.state);
  }

  /**
   * Positions as an on-chain observer sees them, sorted by id.
   *
   * The sort matters: the ledger Map is Merkle-backed and keyed by hash, so it
   * does not iterate in insertion order.
   */
  positions() {
    return Array.from(this.ledger.positions)
      .map(([id, p]) => ({ id, ...p, owner: this.owners.get(String(id)) }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  notesFor(identityId: string): LocalNote[] {
    return this.notes.get(identityId) ?? [];
  }

  /**
   * Pro-rata payout, derived off-chain because Compact has no division
   * operator. The contract publishes `pool` and `winningStakeTotal`; anyone can
   * compute and check this number from public state.
   */
  entitlement(positionId: bigint): bigint {
    const l = this.ledger;
    if (l.winningStakeTotal === 0n) return 0n;
    const p = l.positions.lookup(positionId);
    if (!l.winningSide.is_some || p.side !== l.winningSide.value) return 0n;
    return (p.revealedStake * l.pool) / l.winningStakeTotal;
  }

  // ── writes ───────────────────────────────────────────────────────────────

  private record(actor: string, call: string, ok: boolean, detail: string) {
    this.log.unshift({ seq: ++this.seq, actor, call, ok, detail });
  }

  /** Runs a circuit, committing the new context only if it succeeded. */
  private run(
    identity: Identity,
    call: string,
    privateState: PrivateState,
    fn: (ctx: CircuitContext<PrivateState>) => CircuitContext<PrivateState>,
    okDetail: string,
  ): { ok: boolean; detail: string } {
    const attempt: CircuitContext<PrivateState> = { ...this.context, currentPrivateState: privateState };
    try {
      this.context = fn(attempt);
      this.record(identity.label, call, true, okDetail);
      return { ok: true, detail: okDetail };
    } catch (e) {
      // Context is left untouched, so a rejected circuit changes no state --
      // exactly as a reverted transaction would.
      const detail = assertMessage(e);
      this.record(identity.label, call, false, detail);
      return { ok: false, detail };
    }
  }

  commit(identity: Identity, side: Side, stake: bigint) {
    const salt = randomSalt();
    const before = this.ledger.nextId;

    const res = this.run(
      identity,
      `commitPosition(${side === Side.YES ? 'YES' : 'NO'})`,
      { secretKey: identity.secretKey, stake, salt },
      (ctx) => this.contract.impureCircuits.commitPosition(ctx, side).context,
      'commitment stored; amount stayed local',
    );

    if (res.ok) {
      const positionId = this.ledger.nextId;
      if (positionId !== before) {
        this.owners.set(String(positionId), identity.id);
        const list = this.notes.get(identity.id) ?? [];
        list.push({ positionId, stake, salt });
        this.notes.set(identity.id, list);
      }
    }
    return res;
  }

  closeMarket(identity: Identity) {
    return this.run(
      identity,
      'closeMarket()',
      { secretKey: identity.secretKey, stake: 1n, salt: randomSalt() },
      (ctx) => this.contract.impureCircuits.closeMarket(ctx).context,
      'book closed; phase REVEAL',
    );
  }

  /**
   * Reveal a position. `override` exists so the UI can attempt a forged reveal
   * and show the circuit rejecting it -- the demo is more convincing when you
   * can try to cheat and watch it fail.
   */
  reveal(identity: Identity, positionId: bigint, override?: { stake?: bigint; salt?: Uint8Array }) {
    const note = this.notesFor(identity.id).find((n) => n.positionId === positionId);
    const stake = override?.stake ?? note?.stake ?? 0n;
    const salt = override?.salt ?? note?.salt ?? randomSalt();

    return this.run(
      identity,
      `revealPosition(#${positionId}, ${stake})`,
      { secretKey: identity.secretKey, stake, salt },
      (ctx) => this.contract.impureCircuits.revealPosition(ctx, positionId, stake, salt).context,
      `stake ${stake} proven against the commitment`,
    );
  }

  resolve(identity: Identity, outcome: Side) {
    return this.run(
      identity,
      `resolve(${outcome === Side.YES ? 'YES' : 'NO'})`,
      { secretKey: identity.secretKey, stake: 1n, salt: randomSalt() },
      (ctx) => this.contract.impureCircuits.resolve(ctx, outcome).context,
      'outcome recorded; settlement terms frozen',
    );
  }

  claim(identity: Identity, positionId: bigint) {
    return this.run(
      identity,
      `claimEntitlement(#${positionId})`,
      { secretKey: identity.secretKey, stake: 1n, salt: randomSalt() },
      (ctx) => this.contract.impureCircuits.claimEntitlement(ctx, positionId).context,
      'entitlement recorded (no value moved)',
    );
  }
}
