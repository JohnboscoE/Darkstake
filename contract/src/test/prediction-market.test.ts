import { describe, it, expect, beforeEach } from 'vitest';
import { MarketSimulator, Side, Phase, user, withFreshBlinding } from './simulator.js';

// A whale and a minnow, so the privacy tests can check that the ledger gives
// no way to tell them apart. Stakes are chosen so the pro-rata arithmetic lands
// exactly: both sides reveal 250,040, so each winner doubles.
const RESOLVER = user(1, 1n);
const WHALE = user(2, 250_000n); // YES
const MINNOW = user(3, 40n); // YES
const LOSER = user(4, 250_040n); // NO, reveals -- funds the winners
const GHOST = user(5, 9_999n); // NO, never reveals -- forfeits
const OUTSIDER = user(9, 1n); // holds no position

describe('Darkstake prediction market', () => {
  let sim: MarketSimulator;

  beforeEach(() => {
    sim = new MarketSimulator(RESOLVER);
  });

  describe('deployment', () => {
    it('opens in the OPEN phase with no positions and no outcome', () => {
      expect(sim.ledger.phase).toBe(Phase.OPEN);
      expect(sim.ledger.positions.isEmpty()).toBe(true);
      expect(sim.ledger.winningSide.is_some).toBe(false);
      expect(sim.ledger.nextId).toBe(0n);
    });

    it('records the deployer as resolver, as a hash rather than a key', () => {
      expect(sim.ledger.resolver).toHaveLength(32);
      expect(sim.ledger.resolver).not.toEqual(RESOLVER.secretKey);
    });
  });

  // ── The property the whole contract exists for ──────────────────────────
  describe('privacy: the stake never reaches the ledger before reveal', () => {
    it('stores a commitment, not the amount', () => {
      sim.commitPosition(WHALE, Side.YES);

      const p = sim.ledger.positions.lookup(1n);
      expect(p.revealedStake).toBe(0n);
      expect(p.revealed).toBe(false);
      expect(p.stakeCommitment).toHaveLength(32);
    });

    it('leaves nothing in the public state that encodes 250,000', () => {
      sim.commitPosition(WHALE, Side.YES);

      // Serialise everything an observer could read and confirm the amount is
      // absent in every plausible encoding.
      const p = sim.ledger.positions.lookup(1n);
      const observable = [
        Buffer.from(p.stakeCommitment).toString('hex'),
        Buffer.from(p.ownerHash).toString('hex'),
        String(p.revealedStake),
        String(sim.ledger.nextId),
        String(sim.ledger.yesCount),
      ].join('|');

      expect(observable).not.toContain('250000');
      expect(observable).not.toContain(WHALE.stake.toString(16));
    });

    it('makes a whale and a minnow indistinguishable in the ledger', () => {
      sim.commitPosition(WHALE, Side.YES);
      sim.commitPosition(MINNOW, Side.YES);

      const [a, b] = sim.allPositions();

      // Same side, same shape, same everything an observer can see.
      expect(a.side).toBe(b.side);
      expect(a.revealedStake).toBe(b.revealedStake);
      expect(a.stakeCommitment).toHaveLength(b.stakeCommitment.length);
      // The commitments differ (they must, they cover different values) but
      // neither reveals which is the larger.
      expect(a.stakeCommitment).not.toEqual(b.stakeCommitment);
    });

    it('hides the staker identity behind a hash', () => {
      sim.commitPosition(WHALE, Side.YES);
      const p = sim.ledger.positions.lookup(1n);
      expect(p.ownerHash).not.toEqual(WHALE.secretKey);
      expect(p.ownerHash).toHaveLength(32);
    });
  });

  // ── Finding 2 from SECURITY-REVIEW.md, and the regression test for it ───
  //
  // v1 tagged every position with hash(domain, sk), so all positions opened by
  // one key were equal on-chain. An observer could group them and, once they
  // revealed, add the parts back together -- which defeats the obvious defence
  // of splitting a large stake into several small ones.
  describe('privacy: positions by one staker are not linkable', () => {
    it('gives one key two different owner tags across two positions', () => {
      const first = WHALE;
      const second = withFreshBlinding(WHALE, 201, 50_000n);

      sim.commitPosition(first, Side.YES);
      sim.commitPosition(second, Side.YES);

      const [a, b] = sim.allPositions();
      expect(a.ownerHash).not.toEqual(b.ownerHash);
    });

    it('lets a split stake hide its total from an observer', () => {
      // One whale splitting 250,000 into three, against a single decoy.
      const parts = [
        withFreshBlinding(WHALE, 210, 150_000n),
        withFreshBlinding(WHALE, 211, 60_000n),
        withFreshBlinding(WHALE, 212, 40_000n),
      ];
      for (const part of parts) sim.commitPosition(part, Side.YES);
      sim.commitPosition(MINNOW, Side.YES);

      // Four positions, four distinct owner tags. Nothing on the ledger says
      // three of them are one person, so nothing says the whale staked 250,000.
      const tags = sim.allPositions().map((p) => Buffer.from(p.ownerHash).toString('hex'));
      expect(new Set(tags).size).toBe(4);
    });

    it('still lets the owner prove each position is theirs', () => {
      const first = WHALE;
      const second = withFreshBlinding(WHALE, 201, 50_000n);
      sim.commitPosition(first, Side.YES);
      sim.commitPosition(second, Side.YES);
      sim.closeMarket(RESOLVER);

      // Blinding the tag must not cost the owner the ability to open it: each
      // position is revealed with the blinding it was committed under.
      sim.revealPosition(first, 1n, first.stake, first.salt);
      sim.revealPosition(second, 2n, second.stake, second.salt);

      expect(sim.ledger.positions.lookup(1n).revealed).toBe(true);
      expect(sim.ledger.positions.lookup(2n).revealed).toBe(true);
    });

    it('rejects a reveal that presents the wrong blinding', () => {
      sim.commitPosition(WHALE, Side.YES);
      sim.closeMarket(RESOLVER);

      // Right key, right stake, right stake-salt -- wrong owner blinding. The
      // owner tag no longer matches, so the circuit refuses.
      const wrongBlinding = withFreshBlinding(WHALE, 222);
      expect(() => sim.revealPosition(wrongBlinding, 1n, WHALE.stake, WHALE.salt)).toThrow(
        /not owner/,
      );
    });

    it('re-links positions if the client reuses one blinding', () => {
      // Not a contract bug -- a statement of what the client must do. Fresh
      // randomness per position is the whole mechanism; reuse gives back the
      // v1 behaviour, so this test exists to make that requirement visible.
      const second = withFreshBlinding(WHALE, WHALE.ownerSalt[0], 50_000n);
      sim.commitPosition(WHALE, Side.YES);
      sim.commitPosition(second, Side.YES);

      const [a, b] = sim.allPositions();
      expect(a.ownerHash).toEqual(b.ownerHash);
    });
  });

  // ── What is deliberately public ─────────────────────────────────────────
  describe('public aggregates', () => {
    it('publishes the side and per-side counts', () => {
      sim.commitPosition(WHALE, Side.YES);
      sim.commitPosition(MINNOW, Side.NO);
      sim.commitPosition(OUTSIDER, Side.YES);

      expect(sim.ledger.yesCount).toBe(2n);
      expect(sim.ledger.noCount).toBe(1n);
      expect(sim.ledger.positions.lookup(1n).side).toBe(Side.YES);
      expect(sim.ledger.positions.lookup(2n).side).toBe(Side.NO);
    });

    it('gives each position a distinct id', () => {
      sim.commitPosition(WHALE, Side.YES);
      sim.commitPosition(MINNOW, Side.NO);
      expect(sim.allPositions().map((p) => p.id)).toEqual([1n, 2n]);
    });
  });

  // ── Adversarial: a circuit that compiles can still prove nonsense ───────
  describe('reveal rejects forgery', () => {
    beforeEach(() => {
      sim.commitPosition(WHALE, Side.YES);
      sim.closeMarket(RESOLVER);
    });

    it('accepts the true stake and salt', () => {
      sim.revealPosition(WHALE, 1n, WHALE.stake, WHALE.salt);
      const p = sim.ledger.positions.lookup(1n);
      expect(p.revealed).toBe(true);
      expect(p.revealedStake).toBe(250_000n);
    });

    it('rejects an inflated stake', () => {
      expect(() => sim.revealPosition(WHALE, 1n, 999_999n, WHALE.salt)).toThrow(
        /stake != commitment/,
      );
    });

    it('rejects the right stake with the wrong salt', () => {
      expect(() =>
        sim.revealPosition(WHALE, 1n, WHALE.stake, new Uint8Array(32).fill(77)),
      ).toThrow(/stake != commitment/);
    });

    it('rejects someone else claiming the position', () => {
      expect(() => sim.revealPosition(OUTSIDER, 1n, WHALE.stake, WHALE.salt)).toThrow(
        /not owner/,
      );
    });

    it('rejects revealing the same position twice', () => {
      sim.revealPosition(WHALE, 1n, WHALE.stake, WHALE.salt);
      expect(() => sim.revealPosition(WHALE, 1n, WHALE.stake, WHALE.salt)).toThrow(
        /already revealed/,
      );
    });

    it('rejects a position that does not exist', () => {
      expect(() => sim.revealPosition(WHALE, 42n, WHALE.stake, WHALE.salt)).toThrow(
        /no such position/,
      );
    });

    it('updates in place rather than appending a second entry', () => {
      // Guards spec §9 #8: `Map.insert` on an existing key must overwrite.
      const before = sim.ledger.positions.size();
      sim.revealPosition(WHALE, 1n, WHALE.stake, WHALE.salt);
      expect(sim.ledger.positions.size()).toBe(before);
    });
  });

  // ── Phase gating: revealing early would defeat the entire design ────────
  describe('phase gating', () => {
    it('refuses a reveal while the market is still open', () => {
      sim.commitPosition(WHALE, Side.YES);
      expect(() => sim.revealPosition(WHALE, 1n, WHALE.stake, WHALE.salt)).toThrow(
        /not in reveal phase/,
      );
    });

    it('refuses new positions once the book is closed', () => {
      sim.commitPosition(WHALE, Side.YES);
      sim.closeMarket(RESOLVER);
      expect(() => sim.commitPosition(MINNOW, Side.NO)).toThrow(/market not open/);
    });

    it('refuses to resolve before the reveal phase', () => {
      expect(() => sim.resolve(RESOLVER, Side.YES)).toThrow(/not in reveal phase/);
    });
  });

  // ── Resolver authority ──────────────────────────────────────────────────
  describe('resolver authority', () => {
    it('lets only the resolver close the market', () => {
      expect(() => sim.closeMarket(OUTSIDER)).toThrow(/not the resolver/);
      sim.closeMarket(RESOLVER);
      expect(sim.ledger.phase).toBe(Phase.REVEAL);
    });

    it('lets only the resolver record the outcome', () => {
      sim.closeMarket(RESOLVER);
      expect(() => sim.resolve(OUTSIDER, Side.YES)).toThrow(/not the resolver/);
    });

    it('records the winning side and moves to RESOLVED', () => {
      sim.closeMarket(RESOLVER);
      sim.resolve(RESOLVER, Side.NO);
      expect(sim.ledger.phase).toBe(Phase.RESOLVED);
      expect(sim.ledger.winningSide.is_some).toBe(true);
      expect(sim.ledger.winningSide.value).toBe(Side.NO);
    });
  });

  // ── Settlement (M3): entitlements recorded, no value moved ──────────────
  describe('settlement', () => {
    /** Runs the market to RESOLVED with YES winning. Ghost never reveals. */
    const settle = () => {
      sim.commitPosition(WHALE, Side.YES);
      sim.commitPosition(MINNOW, Side.YES);
      sim.commitPosition(LOSER, Side.NO);
      sim.commitPosition(GHOST, Side.NO);
      sim.closeMarket(RESOLVER);
      sim.revealPosition(WHALE, 1n, WHALE.stake, WHALE.salt);
      sim.revealPosition(MINNOW, 2n, MINNOW.stake, MINNOW.salt);
      sim.revealPosition(LOSER, 3n, LOSER.stake, LOSER.salt);
      sim.resolve(RESOLVER, Side.YES);
    };

    it('keeps the running totals at zero until reveals happen', () => {
      sim.commitPosition(WHALE, Side.YES);
      expect(sim.ledger.totalYesStake).toBe(0n);
      expect(sim.ledger.totalNoStake).toBe(0n);
      expect(sim.ledger.pool).toBe(0n);
    });

    it('counts only revealed stakes into the pool', () => {
      settle();
      // GHOST staked 9,999 on NO and never revealed, so it is not in the pool.
      expect(sim.ledger.totalNoStake).toBe(250_040n);
      expect(sim.ledger.pool).toBe(500_080n);
      expect(sim.ledger.winningStakeTotal).toBe(250_040n);
    });

    it('derives pro-rata entitlements that sum to the pool', () => {
      settle();
      expect(sim.entitlement(1n)).toBe(500_000n); // whale doubles
      expect(sim.entitlement(2n)).toBe(80n); // minnow doubles
      expect(sim.entitlement(1n) + sim.entitlement(2n)).toBe(sim.ledger.pool);
    });

    it('lets a winner claim exactly once', () => {
      settle();
      sim.claimEntitlement(WHALE, 1n);
      expect(sim.ledger.positions.lookup(1n).claimed).toBe(true);
      expect(() => sim.claimEntitlement(WHALE, 1n)).toThrow(/already claimed/);
    });

    it('records the claim without moving or altering value', () => {
      settle();
      const poolBefore = sim.ledger.pool;
      sim.claimEntitlement(WHALE, 1n);
      expect(sim.ledger.positions.lookup(1n).revealedStake).toBe(250_000n);
      expect(sim.ledger.pool).toBe(poolBefore);
    });

    it('refuses a claim from the losing side', () => {
      settle();
      expect(() => sim.claimEntitlement(LOSER, 3n)).toThrow(/position did not win/);
    });

    it('refuses a claim on a position that never revealed', () => {
      settle();
      expect(() => sim.claimEntitlement(GHOST, 4n)).toThrow(/never revealed/);
    });

    it('refuses a claim from someone who does not own the position', () => {
      settle();
      expect(() => sim.claimEntitlement(OUTSIDER, 1n)).toThrow(/not owner/);
    });

    it('refuses a claim before the market resolves', () => {
      sim.commitPosition(WHALE, Side.YES);
      expect(() => sim.claimEntitlement(WHALE, 1n)).toThrow(/market not resolved/);
    });
  });

  // ── End to end ──────────────────────────────────────────────────────────
  it('runs a full market: commit sealed, reveal proven, outcome settled', () => {
    sim.commitPosition(WHALE, Side.YES);
    sim.commitPosition(LOSER, Side.NO);

    // Mid-market: sides public, amounts invisible, nothing accumulated.
    expect(sim.ledger.yesCount).toBe(1n);
    expect(sim.ledger.noCount).toBe(1n);
    expect(sim.allPositions().every((p) => p.revealedStake === 0n)).toBe(true);
    expect(sim.ledger.pool).toBe(0n);

    sim.closeMarket(RESOLVER);
    sim.revealPosition(WHALE, 1n, WHALE.stake, WHALE.salt);
    sim.revealPosition(LOSER, 2n, LOSER.stake, LOSER.salt);
    sim.resolve(RESOLVER, Side.YES);

    // Post-settlement: amounts public so anyone can verify the payout.
    expect(sim.ledger.positions.lookup(1n).revealedStake).toBe(250_000n);
    expect(sim.ledger.winningSide.value).toBe(Side.YES);
    expect(sim.entitlement(1n)).toBe(sim.ledger.pool); // sole winner takes it all

    sim.claimEntitlement(WHALE, 1n);
    expect(sim.ledger.positions.lookup(1n).claimed).toBe(true);
  });
});
