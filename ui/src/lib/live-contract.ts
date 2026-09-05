/**
 * The compiled contract, bound to its witnesses, for on-chain use.
 *
 * This is the live counterpart to `market-engine.ts`. That file drives the same
 * compiled circuits through an in-memory `CircuitContext`; this one hands them
 * to midnight-js so they run against a real ledger, with real proofs.
 *
 * `withCompiledFileAssets` is inert in the browser -- there is no filesystem --
 * but the combinator is still required to produce a complete `CompiledContract`.
 * The artifacts actually come from `FetchZkConfigProvider`, which serves
 * `public/keys/` and `public/zkir/` over HTTP. The path below is what the CLI
 * uses on Node, kept identical so the two cannot describe different builds.
 */
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { type MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';

import * as Generated from '../../../contract/managed/prediction-market/contract/index.js';
import { createWitnesses, type PMPrivateState } from '../../../contract/src/witnesses.js';

export type { PMPrivateState };

export const pmPrivateStateKey = 'pmPrivateState';
export type PrivateStateId = typeof pmPrivateStateKey;

export type PMContract = Generated.Contract<PMPrivateState, Generated.Witnesses<PMPrivateState>>;
export type PMCircuitKeys = Exclude<keyof PMContract['impureCircuits'], number | symbol>;
export type PMProviders = MidnightProviders<PMCircuitKeys, PrivateStateId, PMPrivateState>;
export type DeployedPMContract = FoundContract<PMContract>;

export const CompiledPredictionMarket = CompiledContract.make<PMContract>(
  'PredictionMarket',
  Generated.Contract<PMPrivateState>,
).pipe(
  CompiledContract.withWitnesses(createWitnesses()),
  CompiledContract.withCompiledFileAssets('./managed/prediction-market'),
);
