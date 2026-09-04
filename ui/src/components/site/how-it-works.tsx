import { CheckCircle2, KeyRound, Lock, Scale } from 'lucide-react';
import { Section, SectionHeading } from '@/components/site/section';
import { Card } from '@/components/ui/card';

const STEPS = [
  {
    icon: Lock,
    phase: 'Phase 1',
    title: 'Commit',
    body: 'You pick a side and a stake. Your browser hashes the amount together with a random salt and sends only that hash. The side goes on-chain in the clear; the amount and your identity never leave your machine.',
    chain: 'on-chain  →  side: YES, commitment: 0x8f3c…, owner: 0x21ab…',
    local: 'stays local  →  stake: 250000, salt: 0x9d1e…, secretKey',
  },
  {
    icon: KeyRound,
    phase: 'Phase 2',
    title: 'Reveal',
    body: 'When the market closes you reveal the amount. A zero-knowledge proof shows it hashes to the commitment you posted earlier and that you own the position — so you cannot inflate a winning stake or claim somebody else’s.',
    chain: 'proves  →  hash(stake, salt) == stored commitment  ∧  owner == you',
    local: 'now public  →  stake: 250000',
  },
  {
    icon: Scale,
    phase: 'Phase 3',
    title: 'Settle',
    body: 'The resolver records the outcome and freezes the settlement terms — the pool, and the total staked on the winning side. Your entitlement is pro-rata across revealed winning stakes: the same arithmetic as any pari-mutuel pool, just with the inputs sealed until the moment they stop being useful to a front-runner.',
    chain: 'on-chain  →  pool: 500080, winningStakeTotal: 250040',
    local: 'anyone can verify  →  stake × pool / winningStakeTotal',
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHeading
        eyebrow="How it works"
        title="Commit, reveal, settle."
        description="Three phases, one guarantee: the number that would let somebody trade against you is not published while it is still worth something."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {STEPS.map((step) => (
          <Card key={step.title} className="flex min-w-0 flex-col p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg border border-accent/25 bg-accent/10">
                <step.icon className="size-4 text-accent" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {step.phase}
                </p>
                <h3 className="font-medium leading-tight">{step.title}</h3>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>

            <div className="mt-5 space-y-2">
              <pre className="overflow-x-auto rounded-lg border border-border bg-background/60 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {step.chain}
              </pre>
              {step.local && (
                <pre className="overflow-x-auto rounded-lg border border-accent/20 bg-accent/5 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-accent/90">
                  {step.local}
                </pre>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-10 flex items-start gap-3 rounded-xl border border-border bg-surface/50 p-5">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-yes" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          <span className="text-foreground">Why the reveal step is safe.</span> The commitment is
          binding: because it was published before the outcome was known, you cannot go back and
          claim a different number. And it is hiding: the salt makes the hash unguessable, so nobody
          can brute-force your stake out of it while the market is open.
        </p>
      </div>
    </Section>
  );
}
