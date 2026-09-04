import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/site/logo';
import { IdentityBar } from '@/components/app/identity-bar';
import { PublicLedger } from '@/components/app/public-ledger';
import { YourClient } from '@/components/app/your-client';
import { EventLog } from '@/components/app/event-log';
import { useMarket } from '@/hooks/use-market';
import { Phase, Side } from '@/lib/market-engine';

export function AppView() {
  const m = useMarket();

  const positionById = (id: bigint) => m.positions.find((p) => p.id === id);
  const isResolver = m.actor.id === 'resolver';

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={m.reset}>
              <RotateCcw />
              <span className="hidden sm:inline">Reset market</span>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="#/">
                <ArrowLeft />
                <span className="hidden sm:inline">Back</span>
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6">
          <Badge variant="accent" className="mb-3">
            Live contract · running in your browser
          </Badge>
          <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            {m.engine.question}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {m.engine.resolutionCriteria}
          </p>
        </div>

        <div className="mb-6 rounded-xl border border-border bg-surface/40 p-4 text-sm leading-relaxed text-muted-foreground sm:p-5">
          <span className="text-foreground">This is the real contract.</span> Every button below
          executes a compiled Compact circuit against real ledger state through
          <span className="font-mono text-xs"> @midnight-ntwrk/compact-runtime</span> — the same
          artifacts the test suite runs against. Rejections are genuine{' '}
          <span className="font-mono text-xs">assert</span> failures from inside the circuit. What is
          simulated is the network, not the contract: no proof server, no wallet, state in memory.
        </div>

        {m.flash && (
          <div
            className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
              m.flash.ok
                ? 'border-yes/25 bg-yes/10 text-yes'
                : 'border-no/25 bg-no/10 text-no'
            }`}
            role="status"
          >
            {m.flash.ok ? m.flash.detail : `Rejected by the circuit — ${m.flash.detail}`}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <PublicLedger
              ledger={m.ledger}
              positions={m.positions}
              entitlement={m.engine.entitlement.bind(m.engine)}
            />
            <EventLog log={m.log} />
          </div>

          <div className="min-w-0 space-y-5">
            <IdentityBar identities={m.identities} actor={m.actor} onSelect={m.setActorId} />
            <YourClient
              ledger={m.ledger}
              notes={m.notes}
              isResolver={isResolver}
              positionSide={(id) => positionById(id)?.side ?? null}
              positionRevealed={(id) => positionById(id)?.revealed ?? false}
              positionClaimed={(id) => positionById(id)?.claimed ?? false}
              entitlement={m.engine.entitlement.bind(m.engine)}
              onCommit={m.commit}
              onClose={() => m.closeMarket()}
              onReveal={m.reveal}
              onResolve={(s: Side) => m.resolve(s)}
              onClaim={m.claim}
            />
            <Walkthrough phase={m.ledger.phase} />
          </div>
        </div>
      </main>
    </div>
  );
}

function Walkthrough({ phase }: { phase: number }) {
  const steps =
    phase === Phase.OPEN
      ? [
          'Commit a large stake as the Whale, then a tiny one as the Minnow.',
          'Compare the two rows in the public ledger — nothing distinguishes them.',
          'Switch to Observer and try to close the market. It will be refused.',
          'Switch to Resolver and close the book.',
        ]
      : phase === Phase.REVEAL
        ? [
            'Reveal as the Whale — the stake becomes public and provable.',
            'Try the 4× forgery button and watch the commitment check reject it.',
            'Leave one position unrevealed; it forfeits its claim.',
            'As Resolver, report the outcome.',
          ]
        : [
            'Entitlements are derived from pool ÷ winning total.',
            'Claim as a winner; try again to see the double-claim guard.',
            'Try claiming as the losing side, or as a position that never revealed.',
          ];

  return (
    <div className="rounded-xl border border-border bg-surface/40 p-5">
      <p className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
        Try this next
      </p>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
            <span className="font-mono text-xs text-accent">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
