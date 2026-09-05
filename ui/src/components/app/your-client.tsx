import { useState } from 'react';
import { KeyRound, Lock, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Phase, Side, type LocalNote, type Ledger } from '@/lib/market-engine';
import { fullHex, fmt, cn } from '@/lib/utils';

interface Props {
  ledger: Ledger;
  notes: LocalNote[];
  isResolver: boolean;
  positionSide: (id: bigint) => Side | null;
  positionRevealed: (id: bigint) => boolean;
  positionClaimed: (id: bigint) => boolean;
  entitlement: (id: bigint) => bigint;
  onCommit: (side: Side, stake: bigint) => void;
  onClose: () => void;
  onReveal: (id: bigint, override?: { stake?: bigint; salt?: Uint8Array }) => void;
  onResolve: (side: Side) => void;
  onClaim: (id: bigint) => void;
}

export function YourClient(props: Props) {
  const { ledger, notes, isResolver } = props;
  const [stake, setStake] = useState('250000');

  // Counted across the whole ledger, not just this identity's notes: the
  // resolver is deciding for everyone, and resolving is irreversible for any
  // position still sealed.
  const allPositions = Array.from(ledger.positions);
  const totalPositions = allPositions.length;
  const unrevealedCount = allPositions.filter(([, p]) => !p.revealed).length;

  const parsedStake = (() => {
    try {
      const n = BigInt(stake.replace(/[^0-9]/g, '') || '0');
      return n > 0n ? n : null;
    } catch {
      return null;
    }
  })();

  return (
    <div className="min-w-0 rounded-xl border border-accent/25 bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Lock className="size-4 text-accent" />
        <h2 className="font-medium">Your client</h2>
        <span className="text-xs text-muted-foreground">what only you hold</span>
      </div>

      {/* ── private notes ─────────────────────────────────────────────────── */}
      <div className="border-b border-border px-5 py-4">
        <p className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
          Local secrets
        </p>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Commit a position and the stake and salt are stored here — never sent.
          </p>
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={String(n.positionId)} className="rounded-lg border border-border bg-background/60 p-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">position #{String(n.positionId)}</span>
                  <span className="font-mono text-foreground">stake {fmt(n.stake)}</span>
                </div>
                <p className="mt-1.5 break-all font-mono text-[10px] leading-relaxed text-muted-foreground/70">
                  salt {fullHex(n.salt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {notes.length > 0 && ledger.phase === Phase.OPEN && (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Lose these and you cannot reveal. That is a real property of commit–reveal, not an
            oversight.
          </p>
        )}
      </div>

      {/* ── actions ───────────────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        {ledger.phase === Phase.OPEN && (
          <>
            <p className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              Take a position
            </p>
            <label className="block">
              <span className="sr-only">Stake amount</span>
              <input
                inputMode="numeric"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder="Stake amount"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none transition-colors focus:border-accent/50"
              />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              This number is hashed with a random salt in your browser. Only the hash is sent.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                disabled={!parsedStake}
                onClick={() => parsedStake && props.onCommit(Side.YES, parsedStake)}
                className="border-yes/25 bg-yes/10 text-yes hover:border-yes/40 hover:bg-yes/20 hover:text-yes"
              >
                Commit YES
              </Button>
              <Button
                variant="outline"
                disabled={!parsedStake}
                onClick={() => parsedStake && props.onCommit(Side.NO, parsedStake)}
                className="border-no/25 bg-no/10 text-no hover:border-no/40 hover:bg-no/20 hover:text-no"
              >
                Commit NO
              </Button>
            </div>

            <ResolverBlock show={isResolver}>
              <Button variant="secondary" className="w-full" onClick={props.onClose}>
                Close the book → REVEAL
              </Button>
            </ResolverBlock>
            {!isResolver && (
              <p className="mt-4 text-xs text-muted-foreground">
                Only the Resolver can close the market. Switch identity above and try it as someone
                else to watch the circuit refuse.
              </p>
            )}
          </>
        )}

        {ledger.phase === Phase.REVEAL && (
          <>
            <p className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              Reveal your stakes
            </p>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You hold no positions in this market.
              </p>
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => {
                  const done = props.positionRevealed(n.positionId);
                  return (
                    <li key={String(n.positionId)} className="rounded-lg border border-border p-3">
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">
                          #{String(n.positionId)} · {fmt(n.stake)}
                        </span>
                        {done && <Badge variant="yes">revealed</Badge>}
                      </div>
                      {!done && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Button size="sm" onClick={() => props.onReveal(n.positionId)}>
                            <KeyRound />
                            Reveal
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-no/25 text-no hover:bg-no/10 hover:text-no"
                            onClick={() =>
                              props.onReveal(n.positionId, { stake: n.stake * 4n })
                            }
                          >
                            <ShieldAlert />
                            Try 4× forgery
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              The forgery button submits a stake four times larger than the one you committed. The
              circuit rejects it — watch the log.
            </p>

            <ResolverBlock show={isResolver}>
              {unrevealedCount > 0 && (
                <p className="mb-2.5 text-xs leading-relaxed text-no">
                  {unrevealedCount} of {totalPositions}{' '}
                  {totalPositions === 1 ? 'position has' : 'positions have'} not revealed.
                  Resolving now forfeits them permanently: they fund nothing and can claim
                  nothing. Reveal first unless you mean to demonstrate exactly that.
                </p>
              )}
              <p className="mb-2 text-xs text-muted-foreground">Report the outcome:</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="border-yes/25 bg-yes/10 text-yes hover:bg-yes/20 hover:text-yes"
                  onClick={() => props.onResolve(Side.YES)}
                >
                  Resolve YES
                </Button>
                <Button
                  variant="outline"
                  className="border-no/25 bg-no/10 text-no hover:bg-no/20 hover:text-no"
                  onClick={() => props.onResolve(Side.NO)}
                >
                  Resolve NO
                </Button>
              </div>
            </ResolverBlock>
          </>
        )}

        {ledger.phase === Phase.RESOLVED && (
          <>
            <p className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              Settlement
            </p>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">You hold no positions in this market.</p>
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => {
                  const won = props.entitlement(n.positionId) > 0n;
                  const claimed = props.positionClaimed(n.positionId);
                  const side = props.positionSide(n.positionId);
                  // A position that never revealed is forfeit: claimEntitlement
                  // asserts `revealed`, so the button could only ever fail.
                  // Offering it anyway reads as a bug in the contract rather
                  // than the rule the contract exists to enforce.
                  const revealed = props.positionRevealed(n.positionId);
                  return (
                    <li key={String(n.positionId)} className="rounded-lg border border-border p-3">
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">
                          #{String(n.positionId)} ·{' '}
                          <span className={side === Side.YES ? 'text-yes' : 'text-no'}>
                            {side === Side.YES ? 'YES' : 'NO'}
                          </span>
                        </span>
                        {!revealed ? (
                          <Badge variant="no">forfeited</Badge>
                        ) : won ? (
                          <span className="font-mono text-yes">
                            {fmt(props.entitlement(n.positionId))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">no entitlement</span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={claimed || !revealed}
                        onClick={() => props.onClaim(n.positionId)}
                      >
                        {claimed
                          ? 'Claimed'
                          : !revealed
                            ? 'Never revealed — forfeited'
                            : 'Claim entitlement'}
                      </Button>
                      {!revealed && (
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          This stake was never revealed before the market resolved, so it funded
                          nothing and can claim nothing. Reveal-or-forfeit is the rule that stops
                          losers from staying silent to avoid funding the pool.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Claiming records who is entitled and on what terms. It moves no value — v1 keeps an
              entitlement ledger rather than escrowing stakes.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ResolverBlock({ show, children }: { show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div className={cn('mt-5 rounded-lg border border-accent/25 bg-accent/5 p-3')}>
      <p className="mb-2 text-[11px] uppercase tracking-wider text-accent">Resolver only</p>
      {children}
    </div>
  );
}
