import { useState } from 'react';
import { KeyRound, Loader2, Lock, ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phase, Side, type Ledger, type LivePosition } from '@/lib/darkstake-api';
import type { StoredNote } from '@/lib/notes-store';
import { cn, fmt, fullHex } from '@/lib/utils';

interface Props {
  ledger: Ledger;
  positions: LivePosition[];
  notes: StoredNote[];
  isResolver: boolean;
  busy: string | null;
  notesPersist: boolean;
  entitlement: (id: bigint) => bigint;
  onCommit: (side: Side, stake: bigint) => void;
  onClose: () => void;
  onReveal: (note: StoredNote) => void;
  onResolve: (side: Side) => void;
  onClaim: (id: bigint) => void;
}

/**
 * The live-mode action panel.
 *
 * Deliberately close to `your-client.tsx`, which drives the simulation: the two
 * modes are meant to feel like the same market, because they *are* the same
 * circuits. The differences are all consequences of the network being real --
 * every button is disabled while a transaction is in flight, because proving
 * takes seconds and a second click would build a transaction against state the
 * first one is about to change.
 */
export function LiveClient(props: Props) {
  const { ledger, notes, isResolver, busy } = props;
  const [stake, setStake] = useState('250000');

  const working = busy !== null;

  // Counted across the whole ledger rather than our own notes: resolving is
  // irreversible for every position still sealed, not just ours.
  const totalPositions = props.positions.length;
  const unrevealedCount = props.positions.filter((p) => !p.revealed).length;

  const positionById = (id: bigint) => props.positions.find((p) => p.id === id);

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
        {working && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-accent">
            <Loader2 className="size-3 animate-spin" />
            proving
          </span>
        )}
      </div>

      {/* ── private notes ─────────────────────────────────────────────────── */}
      <div className="border-b border-border px-5 py-4">
        <p className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
          Local secrets
        </p>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Commit a position and the stake and salt are stored in this browser —
            never sent to the chain, never sent to us.
          </p>
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li
                key={String(n.positionId)}
                className="rounded-lg border border-border bg-background/60 p-3"
              >
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
        {!props.notesPersist && (
          <p className="mt-3 text-xs leading-relaxed text-no">
            This browser is refusing to store data, so these secrets will not survive a reload —
            and a position whose salt is lost can never be revealed. Copy the salts above, or use
            a normal (non-private) window.
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
                disabled={working}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-50"
              />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              Hashed with a random salt in your browser. Only the hash reaches the chain — the
              transaction carries a proof that you know a number matching it, not the number.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                disabled={!parsedStake || working}
                onClick={() => parsedStake && props.onCommit(Side.YES, parsedStake)}
                className="border-yes/25 bg-yes/10 text-yes hover:border-yes/40 hover:bg-yes/20 hover:text-yes"
              >
                Commit YES
              </Button>
              <Button
                variant="outline"
                disabled={!parsedStake || working}
                onClick={() => parsedStake && props.onCommit(Side.NO, parsedStake)}
                className="border-no/25 bg-no/10 text-no hover:border-no/40 hover:bg-no/20 hover:text-no"
              >
                Commit NO
              </Button>
            </div>

            <ResolverBlock show={isResolver}>
              <Button
                variant="secondary"
                className="w-full"
                disabled={working}
                onClick={props.onClose}
              >
                Close the book → REVEAL
              </Button>
            </ResolverBlock>
            {!isResolver && (
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                Only the resolver — the key that deployed this market — can close it. Deploy your
                own market to drive the whole lifecycle yourself.
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
              <p className="text-sm text-muted-foreground">You hold no positions in this market.</p>
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => {
                  const done = positionById(n.positionId)?.revealed ?? false;
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
                          <Button size="sm" disabled={working} onClick={() => props.onReveal(n)}>
                            <KeyRound />
                            Reveal
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={working}
                            className="border-no/25 text-no hover:bg-no/10 hover:text-no"
                            onClick={() => props.onReveal({ ...n, stake: n.stake * 4n })}
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
              The forgery button claims a stake four times what you committed. It costs nothing to
              try: the commitment check fails while the transaction is still being built, so no
              proof is produced and nothing is submitted or paid for.
            </p>

            <ResolverBlock show={isResolver}>
              {unrevealedCount > 0 && (
                <p className="mb-2.5 text-xs leading-relaxed text-no">
                  {unrevealedCount} of {totalPositions}{' '}
                  {totalPositions === 1 ? 'position has' : 'positions have'} not revealed.
                  Resolving now forfeits them permanently: they fund nothing and can claim
                  nothing.
                </p>
              )}
              <p className="mb-2 text-xs text-muted-foreground">Report the outcome:</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  disabled={working}
                  className="border-yes/25 bg-yes/10 text-yes hover:bg-yes/20 hover:text-yes"
                  onClick={() => props.onResolve(Side.YES)}
                >
                  Resolve YES
                </Button>
                <Button
                  variant="outline"
                  disabled={working}
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
                  const position = positionById(n.positionId);
                  // A position that never revealed is forfeit: claimEntitlement
                  // asserts `revealed`, so the button could only ever fail.
                  const revealed = position?.revealed ?? false;
                  const claimed = position?.claimed ?? false;
                  const side = position?.side ?? null;
                  const won = props.entitlement(n.positionId) > 0n;
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
                        disabled={claimed || !revealed || working}
                        onClick={() => props.onClaim(n.positionId)}
                      >
                        {claimed
                          ? 'Claimed'
                          : !revealed
                            ? 'Never revealed — forfeited'
                            : 'Claim entitlement'}
                      </Button>
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
