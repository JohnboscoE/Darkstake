import { Eye, EyeOff } from 'lucide-react';
import { Section, SectionHeading } from '@/components/site/section';

const PUBLIC = [
  'That a market exists, its question and its resolution criteria',
  'Which side each position took — YES or NO',
  'How many positions sit on each side',
  'The current phase: open, revealing, or resolved',
  'The resolver’s commitment hash',
  'Every winning stake, after the reveal phase opens',
];

const PRIVATE = [
  'How much you staked, for as long as the market is open',
  'The salt that seals your commitment',
  'Your secret key — it never leaves your browser',
  'The link between your wallet and your positions',
  'Your total exposure across markets',
  'Every losing stake, unless you choose to reveal it',
];

export function Transparency() {
  return (
    <Section id="transparency" className="border-y border-border bg-surface/40">
      <SectionHeading
        eyebrow="Threat model"
        title="Exactly what is public, and exactly what is not."
        description="Privacy claims are worth nothing unless they are specific. Here is the full split — if something is not in the right-hand column, assume the whole world can read it."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <Eye className="size-4 text-muted-foreground" />
            <h3 className="font-medium">Public, on-chain, forever</h3>
          </div>
          <ul className="space-y-3">
            {PUBLIC.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-accent/25 bg-card p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <EyeOff className="size-4 text-accent" />
            <h3 className="font-medium">Private, never leaves your device</h3>
          </div>
          <ul className="space-y-3">
            {PRIVATE.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-accent/60" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        <span className="text-foreground">One leak worth naming:</span> commit transactions are
        individually observable, so an observer can see that <em>a</em> position was opened on a
        given side at a given moment. They just cannot tell whether it was worth ten units or ten
        million. Timing correlation is a real side channel and we would rather say so than let you
        discover it yourself.
      </p>
    </Section>
  );
}
