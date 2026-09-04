// Binds the compiled contract to its witnesses so midnight-js can deploy it.
//
// `withCompiledFileAssets` points at the directory `compact compile` wrote --
// the one that must contain `keys/*.prover` and `keys/*.verifier`. Those are the
// files this machine cannot generate (see cli/README.md).

import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { type MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';

import * as Generated from '../../contract/managed/prediction-market/contract/index.js';
import { createWitnesses, type PMPrivateState } from '../../contract/src/witnesses.js';

export { Side, Phase, ledger } from '../../contract/managed/prediction-market/contract/index.js';
export type { PMPrivateState } from '../../contract/src/witnesses.js';

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
  CompiledContract.withCompiledFileAssets('../../contract/managed/prediction-market'),
);
