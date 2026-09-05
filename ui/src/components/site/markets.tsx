import { useMemo, useState } from 'react';
import { Section, SectionHeading } from '@/components/site/section';
import { MarketCard } from '@/components/site/market-card';
import { CATEGORIES, MARKETS, type Market } from '@/data/markets';
import { useMarketSummary } from '@/hooks/use-market-summary';
import { cn } from '@/lib/utils';

const PHASE_NAME = ['OPEN', 'REVEAL', 'RESOLVED'] as const;

export function Markets() {
  const [active, setActive] = useState<string>('All');
  const summary = useMarketSummary();

  /**
   * The deployed market's card, with its figures replaced by what the chain
   * actually says. Everything else keeps its illustrative numbers and its
   * "not deployed" label.
   *
   * The live card sorts first: the one real market being buried among seven
   * mockups is the fastest way to make a working contract look like a mockup
   * too.
   */
  const markets: Market[] = useMemo(() => {
    const merged = MARKETS.map((market): Market => {
      if (!market.live || summary === null) return market;
      return {
        ...market,
        phase: PHASE_NAME[summary.phase] ?? market.phase,
        yesPositions: summary.yesPositions,
        noPositions: summary.noPositions,
        winningSide: summary.winningSide ?? undefined,
      };
    });
    return merged.sort((a, b) => Number(b.live ?? false) - Number(a.live ?? false));
  }, [summary]);

  const visible = useMemo(
    () => (active === 'All' ? markets : markets.filter((m) => m.category === active)),
    [active, markets],
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

      <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground/70">
        {summary === null ? (
          <>
            One market on this page is backed by a deployed contract; the rest are illustrative and
            open the no-wallet demo. Nothing here settles in real value.
          </>
        ) : (
          <>
            The card marked <span className="text-accent">On-chain</span> is reading live from the
            Midnight indexer — contract{' '}
            <span className="font-mono">{summary.contractAddress.slice(0, 16)}…</span>. The rest are
            illustrative. Nothing here settles in real value.
          </>
        )}
      </p>
    </Section>
  );
}
