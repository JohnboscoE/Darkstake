import { ArrowRight } from 'lucide-react';
import { Section } from '@/components/site/section';
import { Badge } from '@/components/ui/badge';

const ROADMAP = [
  {
    stage: 'v1 — today',
    title: 'Single trusted resolver',
    body: 'The market creator publishes the resolution criteria up front and reports the outcome. Everyone can see who they are and what they committed to. If they lie, they lie in public and permanently.',
    current: true,
  },
  {
    stage: 'v2',
    title: 'Threshold resolver set',
    body: 'Resolution requires m-of-n independent reporters to agree, so no single party can move an outcome alone.',
    current: false,
  },
  {
    stage: 'v3',
    title: 'Dispute window',
    body: 'A bonded challenge period between the reported outcome and settlement, letting anyone escalate a bad report at a cost.',
    current: false,
  },
  {
    stage: 'v4',
    title: 'External oracle',
    body: 'Criteria bound to an attested data feed, with the resolver set as fallback for anything a feed cannot express.',
    current: false,
  },
];

export function Resolver() {
  return (
    <Section id="resolver">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-accent">
            Honest limitations
          </p>
          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Resolution is centralised today. We are not going to pretend otherwise.
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            The zero-knowledge work here is about stake privacy. The oracle problem is a genuinely
            separate and genuinely hard problem, and half-building an oracle would have produced
            something worse than a clearly-labelled trusted one.
          </p>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            So v1 ships with a named resolver whose criteria are published before the market opens.
            Here is the path off that.
          </p>
        </div>

        <ol className="relative space-y-6 border-l border-border pl-6">
          {ROADMAP.map((item) => (
            <li key={item.stage} className="relative">
              <span
                aria-hidden="true"
                className={`absolute -left-[27px] top-1.5 size-2.5 rounded-full border-2 ${
                  item.current ? 'border-accent bg-accent' : 'border-border bg-background'
                }`}
              />
              <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
                <h3 className="font-medium">{item.title}</h3>
                <Badge variant={item.current ? 'accent' : 'default'} className="text-[10px]">
                  {item.stage}
                </Badge>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ol>
      </div>

      <a
        href="#faq"
        className="mt-12 inline-flex items-center gap-2 text-sm text-accent transition-colors hover:text-accent/80"
      >
        Read the rest of the caveats
        <ArrowRight className="size-4" />
      </a>
    </Section>
  );
}
