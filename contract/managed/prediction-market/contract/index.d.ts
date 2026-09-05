import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum Side { YES = 0, NO = 1 }

export enum Phase { OPEN = 0, REVEAL = 1, RESOLVED = 2 }

export type Witnesses<PS> = {
  localSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  stakeValue(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  stakeSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  commitPosition(context: __compactRuntime.CircuitContext<PS>, side_0: Side): __compactRuntime.CircuitResults<PS, []>;
  closeMarket(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  revealPosition(context: __compactRuntime.CircuitContext<PS>,
                 id_0: bigint,
                 stake_0: bigint,
                 salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  resolve(context: __compactRuntime.CircuitContext<PS>, outcome_0: Side): __compactRuntime.CircuitResults<PS, []>;
  claimEntitlement(context: __compactRuntime.CircuitContext<PS>, id_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  commitPosition(context: __compactRuntime.CircuitContext<PS>, side_0: Side): __compactRuntime.CircuitResults<PS, []>;
  closeMarket(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  revealPosition(context: __compactRuntime.CircuitContext<PS>,
                 id_0: bigint,
                 stake_0: bigint,
                 salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  resolve(context: __compactRuntime.CircuitContext<PS>, outcome_0: Side): __compactRuntime.CircuitResults<PS, []>;
  claimEntitlement(context: __compactRuntime.CircuitContext<PS>, id_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  ownerCommitment(sk_0: Uint8Array): Uint8Array;
  stakeCommit(stake_0: bigint, salt_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  ownerCommitment(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  stakeCommit(context: __compactRuntime.CircuitContext<PS>,
              stake_0: bigint,
              salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  commitPosition(context: __compactRuntime.CircuitContext<PS>, side_0: Side): __compactRuntime.CircuitResults<PS, []>;
  closeMarket(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  revealPosition(context: __compactRuntime.CircuitContext<PS>,
                 id_0: bigint,
                 stake_0: bigint,
                 salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  resolve(context: __compactRuntime.CircuitContext<PS>, outcome_0: Side): __compactRuntime.CircuitResults<PS, []>;
  claimEntitlement(context: __compactRuntime.CircuitContext<PS>, id_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  positions: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): { side: Side,
                             stakeCommitment: Uint8Array,
                             ownerHash: Uint8Array,
                             revealed: boolean,
                             revealedStake: bigint,
                             claimed: boolean
                           };
    [Symbol.iterator](): Iterator<[bigint, { side: Side,
  stakeCommitment: Uint8Array,
  ownerHash: Uint8Array,
  revealed: boolean,
  revealedStake: bigint,
  claimed: boolean
}]>
  };
  readonly nextId: bigint;
  readonly phase: Phase;
  readonly winningSide: { is_some: boolean, value: Side };
  readonly resolver: Uint8Array;
  readonly yesCount: bigint;
  readonly noCount: bigint;
  readonly totalYesStake: bigint;
  readonly totalNoStake: bigint;
  readonly pool: bigint;
  readonly winningStakeTotal: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
