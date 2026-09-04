// Minimal Docker-free probe of the compiled prediction-market contract.
// Mirrors midnight-leaderboard/probe.mjs, which is the verified-working pattern.
import {
  QueryContext, sampleContractAddress, createConstructorContext, CostModel,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger, Side, Phase } from './managed/prediction-market/contract/index.js';

const witnesses = {
  localSecretKey: ({ privateState }) => [privateState, privateState.secretKey],
  stakeValue: ({ privateState }) => [privateState, privateState.stake],
  stakeSalt: ({ privateState }) => [privateState, privateState.salt],
};

const mk = (fill, stake) => ({
  secretKey: new Uint8Array(32).fill(fill),
  stake,
  salt: new Uint8Array(32).fill(fill + 100),
});

// Chosen so the pro-rata arithmetic lands exactly: the YES side stakes 250,040
// in total and the NO side stakes the same, so each winner doubles.
const RESOLVER = mk(1, 1n);
const WHALE    = mk(2, 250000n);   // YES
const MINNOW   = mk(3, 40n);       // YES
const LOSER    = mk(4, 250040n);   // NO -- reveals, and funds the winners
const GHOST    = mk(5, 9999n);     // NO -- never reveals, forfeits
const OUTSIDER = mk(9, 1n);        // holds no position at all

const contract = new Contract(witnesses);
const init = contract.initialState(createConstructorContext(RESOLVER, '0'.repeat(64)));

let ctx = {
  currentPrivateState: init.currentPrivateState,
  currentZswapLocalState: init.currentZswapLocalState,
  costModel: CostModel.initialCostModel(),
  currentQueryContext: new QueryContext(init.currentContractState.data, sampleContractAddress()),
};

const as = (u) => { ctx = { ...ctx, currentPrivateState: u }; };
const L = () => ledger(ctx.currentQueryContext.state);
const call = (u, name, ...args) => {
  as(u);
  ctx = contract.impureCircuits[name](ctx, ...args).context;
};

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { console.log(`  ok    ${label}`); pass++; }
  else { console.log(`  FAIL  ${label}`); fail++; }
};
const rejects = (label, fn) => {
  try { fn(); console.log(`  FAIL  ${label} -- expected rejection, got success`); fail++; }
  catch (e) { console.log(`  ok    ${label} -> ${String(e.message).slice(0, 52)}`); pass++; }
};

console.log('\n[deployment]');
check('phase == OPEN', L().phase === Phase.OPEN);
check('no positions', L().positions.isEmpty());
check('no outcome yet', L().winningSide.is_some === false);
check('resolver stored as 32-byte hash', L().resolver.length === 32);
check('settlement terms start at zero', L().pool === 0n && L().winningStakeTotal === 0n);

console.log('\n[commit: the amount must not reach the ledger]');
call(WHALE, 'commitPosition', Side.YES);
const p1 = L().positions.lookup(1n);
check('revealedStake is 0', p1.revealedStake === 0n);
check('revealed flag false', p1.revealed === false);
check('claimed flag false', p1.claimed === false);
check('commitment is 32 bytes', p1.stakeCommitment.length === 32);
check('side is public (YES)', p1.side === Side.YES);
check('ownerHash != secretKey',
  Buffer.compare(Buffer.from(p1.ownerHash), Buffer.from(WHALE.secretKey)) !== 0);

const observable = [
  Buffer.from(p1.stakeCommitment).toString('hex'),
  Buffer.from(p1.ownerHash).toString('hex'),
  String(p1.revealedStake), String(L().nextId), String(L().yesCount),
  String(L().totalYesStake), String(L().pool),
].join('|');
check('250000 absent from all public state', !observable.includes('250000'));
check('running totals still zero pre-reveal', L().totalYesStake === 0n && L().totalNoStake === 0n);

console.log('\n[whale vs minnow are indistinguishable]');
call(MINNOW, 'commitPosition', Side.YES);
const [a, b] = Array.from(L().positions).map(([, v]) => v);
check('same side', a.side === b.side);
check('both revealedStake 0', a.revealedStake === 0n && b.revealedStake === 0n);
check('commitments same length', a.stakeCommitment.length === b.stakeCommitment.length);
check('commitments differ',
  Buffer.compare(Buffer.from(a.stakeCommitment), Buffer.from(b.stakeCommitment)) !== 0);

console.log('\n[public aggregates]');
call(LOSER, 'commitPosition', Side.NO);
call(GHOST, 'commitPosition', Side.NO);
check('yesCount == 2', L().yesCount === 2n);
check('noCount == 2', L().noCount === 2n);

console.log('\n[phase gating]');
rejects('reveal while OPEN is refused', () => call(WHALE, 'revealPosition', 1n, WHALE.stake, WHALE.salt));
rejects('resolve before REVEAL is refused', () => call(RESOLVER, 'resolve', Side.YES));
rejects('claim before RESOLVED is refused', () => call(WHALE, 'claimEntitlement', 1n));
rejects('non-resolver cannot close', () => call(OUTSIDER, 'closeMarket'));

call(RESOLVER, 'closeMarket');
check('phase == REVEAL', L().phase === Phase.REVEAL);
rejects('commit after close is refused', () => call(OUTSIDER, 'commitPosition', Side.NO));

console.log('\n[reveal: adversarial]');
rejects('inflated stake rejected', () => call(WHALE, 'revealPosition', 1n, 999999n, WHALE.salt));
rejects('wrong salt rejected',
  () => call(WHALE, 'revealPosition', 1n, WHALE.stake, new Uint8Array(32).fill(77)));
rejects('non-owner rejected', () => call(OUTSIDER, 'revealPosition', 1n, WHALE.stake, WHALE.salt));
rejects('nonexistent position rejected', () => call(WHALE, 'revealPosition', 42n, WHALE.stake, WHALE.salt));

const sizeBefore = L().positions.size();
call(WHALE, 'revealPosition', 1n, WHALE.stake, WHALE.salt);
check('true stake accepted', L().positions.lookup(1n).revealedStake === 250000n);
check('revealed flag set', L().positions.lookup(1n).revealed === true);
check('Map.insert overwrote (size unchanged)', L().positions.size() === sizeBefore);
rejects('double reveal rejected', () => call(WHALE, 'revealPosition', 1n, WHALE.stake, WHALE.salt));

console.log('\n[settlement terms accumulate]');
check('totalYesStake == 250000 after one reveal', L().totalYesStake === 250000n);
call(MINNOW, 'revealPosition', 2n, MINNOW.stake, MINNOW.salt);
call(LOSER, 'revealPosition', 3n, LOSER.stake, LOSER.salt);
// GHOST never reveals -- forfeits.
check('totalYesStake == 250040', L().totalYesStake === 250040n);
check('totalNoStake == 250040 (ghost excluded)', L().totalNoStake === 250040n);

console.log('\n[resolve]');
rejects('non-resolver cannot resolve', () => call(OUTSIDER, 'resolve', Side.YES));
call(RESOLVER, 'resolve', Side.YES);
check('phase == RESOLVED', L().phase === Phase.RESOLVED);
check('winningSide == YES', L().winningSide.is_some === true && L().winningSide.value === Side.YES);
check('pool == 500080 (both sides, revealed only)', L().pool === 500080n);
check('winningStakeTotal == 250040', L().winningStakeTotal === 250040n);
check('ghost stake excluded from pool', L().pool === 500080n && !observable.includes('9999'));

console.log('\n[entitlements: recorded, not paid]');
// The contract stores the terms; the quotient is computed here, off-chain,
// exactly as a client would. Compact has no division operator.
const entitlement = (id) => {
  const p = L().positions.lookup(id);
  return (p.revealedStake * L().pool) / L().winningStakeTotal;
};
check('whale entitlement == 500000 (doubled)', entitlement(1n) === 500000n);
check('minnow entitlement == 80 (doubled)', entitlement(2n) === 80n);
check('entitlements sum to the pool', entitlement(1n) + entitlement(2n) === L().pool);

rejects('loser cannot claim', () => call(LOSER, 'claimEntitlement', 3n));
rejects('ghost cannot claim (never revealed)', () => call(GHOST, 'claimEntitlement', 4n));
rejects('non-owner cannot claim a winning position', () => call(OUTSIDER, 'claimEntitlement', 1n));

call(WHALE, 'claimEntitlement', 1n);
check('claimed flag set', L().positions.lookup(1n).claimed === true);
check('claim did not alter the stake', L().positions.lookup(1n).revealedStake === 250000n);
check('claim did not alter settlement terms', L().pool === 500080n);
rejects('double claim rejected', () => call(WHALE, 'claimEntitlement', 1n));

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
