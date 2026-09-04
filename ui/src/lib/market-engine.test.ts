import { describe, it, expect, beforeEach } from 'vitest';
import { MarketEngine, IDENTITIES, Side, Phase } from './market-engine';

const byId = (id: string) => IDENTITIES.find((i) => i.id === id)!;
const RESOLVER = byId('resolver');
const WHALE = byId('whale');
const MINNOW = byId('minnow');
const CONTRARIAN = byId('contrarian');
const OBSERVER = byId('observer');

const make = () => new MarketEngine('Test question?', 'Test criteria.');

/**
 * These exercise the engine's own orchestration — note bookkeeping, position-id
 * derivation, error extraction, state rollback on rejection. The contract logic
 * itself is covered in `contract/src/test`; what is under test here is the layer
 * the UI actually calls.
 */
describe('MarketEngine', () => {
  let e: MarketEngine;
  beforeEach(() => {
    e = make();
  });

  it('starts OPEN with the deployer as resolver', () => {
    expect(e.ledger.phase).toBe(Phase.OPEN);
    expect(e.positions()).toHaveLength(0);
    expect(e.closeMarket(RESOLVER).ok).toBe(true);
  });

  it('stores a private note and maps the position to its owner', () => {
    const res = e.commit(WHALE, Side.YES, 250_000n);
    expect(res.ok).toBe(true);

    const notes = e.notesFor('whale');
    expect(notes).toHaveLength(1);
    expect(notes[0].positionId).toBe(1n);
    expect(notes[0].stake).toBe(250_000n);
    expect(notes[0].salt).toHaveLength(32);

    // The stake lives only in the note; the ledger has a commitment.
    expect(e.ledger.positions.lookup(1n).revealedStake).toBe(0n);
    expect(e.positions()[0].owner).toBe('whale');
  });

  it('gives each staker a distinct random salt', () => {
    e.commit(WHALE, Side.YES, 100n);
    e.commit(MINNOW, Side.YES, 100n);
    const a = e.notesFor('whale')[0];
    const b = e.notesFor('minnow')[0];
    expect(Buffer.from(a.salt).equals(Buffer.from(b.salt))).toBe(false);
    // Equal stakes, different salts => different commitments.
    expect(
      Buffer.from(e.ledger.positions.lookup(1n).stakeCommitment).equals(
        Buffer.from(e.ledger.positions.lookup(2n).stakeCommitment),
      ),
    ).toBe(false);
  });

  it('surfaces the circuit assert message verbatim and rolls state back', () => {
    e.commit(WHALE, Side.YES, 100n);
    const before = e.ledger.phase;

    const res = e.closeMarket(OBSERVER);
    expect(res.ok).toBe(false);
    expect(res.detail).toBe('not the resolver');
    // A rejected circuit must leave the ledger untouched.
    expect(e.ledger.phase).toBe(before);
  });

  it('records both successes and rejections in the log', () => {
    e.commit(WHALE, Side.YES, 100n);
    e.closeMarket(OBSERVER);

    const [latest, prior] = e.log;
    expect(latest.ok).toBe(false);
    expect(latest.detail).toBe('not the resolver');
    expect(prior.ok).toBe(true);
    expect(prior.call).toContain('commitPosition(YES)');
  });

  it('reveals using the stored note without being told the stake', () => {
    e.commit(WHALE, Side.YES, 250_000n);
    e.closeMarket(RESOLVER);

    expect(e.reveal(WHALE, 1n).ok).toBe(true);
    expect(e.ledger.positions.lookup(1n).revealedStake).toBe(250_000n);
  });

  it('lets a forged reveal be attempted and rejected', () => {
    e.commit(WHALE, Side.YES, 250_000n);
    e.closeMarket(RESOLVER);

    const res = e.reveal(WHALE, 1n, { stake: 1_000_000n });
    expect(res.ok).toBe(false);
    expect(res.detail).toBe('stake != commitment');
    expect(e.ledger.positions.lookup(1n).revealed).toBe(false);
  });

  it('sorts positions by id rather than trusting Map iteration order', () => {
    e.commit(WHALE, Side.YES, 100n);
    e.commit(MINNOW, Side.NO, 200n);
    e.commit(CONTRARIAN, Side.NO, 300n);
    expect(e.positions().map((p) => p.id)).toEqual([1n, 2n, 3n]);
  });

  it('derives entitlements that sum to the pool', () => {
    e.commit(WHALE, Side.YES, 250_000n);
    e.commit(MINNOW, Side.YES, 40n);
    e.commit(CONTRARIAN, Side.NO, 250_040n);
    e.closeMarket(RESOLVER);
    e.reveal(WHALE, 1n);
    e.reveal(MINNOW, 2n);
    e.reveal(CONTRARIAN, 3n);
    e.resolve(RESOLVER, Side.YES);

    expect(e.ledger.pool).toBe(500_080n);
    expect(e.entitlement(1n)).toBe(500_000n);
    expect(e.entitlement(2n)).toBe(80n);
    expect(e.entitlement(3n)).toBe(0n); // losing side
    expect(e.entitlement(1n) + e.entitlement(2n)).toBe(e.ledger.pool);
  });

  it('excludes an unrevealed position from the pool', () => {
    e.commit(WHALE, Side.YES, 100n);
    e.commit(CONTRARIAN, Side.NO, 9_999n);
    e.closeMarket(RESOLVER);
    e.reveal(WHALE, 1n);
    // Contrarian never reveals.
    e.resolve(RESOLVER, Side.YES);

    expect(e.ledger.totalNoStake).toBe(0n);
    expect(e.ledger.pool).toBe(100n);
    expect(e.claim(CONTRARIAN, 2n).ok).toBe(false);
  });

  it('lets a winner claim once and refuses the rest', () => {
    e.commit(WHALE, Side.YES, 100n);
    e.commit(CONTRARIAN, Side.NO, 100n);
    e.closeMarket(RESOLVER);
    e.reveal(WHALE, 1n);
    e.reveal(CONTRARIAN, 2n);
    e.resolve(RESOLVER, Side.YES);

    // Ownership is checked *after* the already-claimed guard, so this has to
    // run against a position nobody has claimed yet.
    expect(e.claim(OBSERVER, 1n).detail).toBe('not owner');

    expect(e.claim(WHALE, 1n).ok).toBe(true);
    expect(e.positions()[0].claimed).toBe(true);
    expect(e.claim(WHALE, 1n).detail).toBe('already claimed');
    expect(e.claim(CONTRARIAN, 2n).detail).toBe('position did not win');
  });

  it('runs the whole lifecycle end to end', () => {
    expect(e.commit(WHALE, Side.YES, 250_000n).ok).toBe(true);
    expect(e.commit(CONTRARIAN, Side.NO, 250_000n).ok).toBe(true);
    expect(e.reveal(WHALE, 1n).ok).toBe(false); // still OPEN
    expect(e.closeMarket(RESOLVER).ok).toBe(true);
    expect(e.commit(MINNOW, Side.YES, 5n).ok).toBe(false); // book closed
    expect(e.reveal(WHALE, 1n).ok).toBe(true);
    expect(e.reveal(CONTRARIAN, 2n).ok).toBe(true);
    expect(e.resolve(RESOLVER, Side.YES).ok).toBe(true);
    expect(e.entitlement(1n)).toBe(500_000n);
    expect(e.claim(WHALE, 1n).ok).toBe(true);
    expect(e.ledger.phase).toBe(Phase.RESOLVED);
  });
});
