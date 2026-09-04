import { useMemo, useState } from 'react';
import { Section, SectionHeading } from '@/components/site/section';
import { MarketCard } from '@/components/site/market-card';
import { CATEGORIES, MARKETS } from '@/data/markets';
import { cn } from '@/lib/utils';

export function Markets() {
  const [active, setActive] = useState<string>('All');

  const visible = useMemo(
    () => (active === 'All' ? MARKETS : MARKETS.filter((m) => m.category === active)),
    [active],
  );

  return (
    <Section id="markets">
      <SectionHeading
        eyebrow="Live markets"
        title="Direction in the open. Size under seal."
        description="Every card shows how the crowd is leaning and how many positions are behind it. What no card shows — because the chain does not have it — is how much anyone put down."
      />

      <div
        className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0"
        role="tablist"
        aria-label="Market categories"
      >
        {CATEGORIES.map((category) => (
          <button
            key={category}
            role="tab"
            aria-selected={active === category}
            onClick={() => setActive(category)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
              active === category
                ? 'border-foreground/20 bg-foreground text-primary-foreground'
                : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground',
            )}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((market) => (
          <MarketCard key={market.id} market={market} />
        ))}
      </div>

      {visible.length === 0 && (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No open markets in this category yet.
        </p>
      )}

      <p className="mt-8 text-center text-xs text-muted-foreground/70">
        Illustrative markets for the testnet demo. Not financial advice, and nothing here settles in
        real value.
      </p>
    </Section>
  );
}
