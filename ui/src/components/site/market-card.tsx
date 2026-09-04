import { EyeOff, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Market } from '@/data/markets';
import { cn } from '@/lib/utils';

/**
 * Deterministic decoy figure for the shielded-pool slot.
 *
 * It is rendered blurred and `aria-hidden`, and it is never a real number --
 * the point is to show the reader that a quantity exists in that slot and is
 * being withheld. A blank space reads as "no data"; a blurred figure reads as
 * "hidden", which is the honest description.
 */
function decoyPool(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `$${(120 + (h % 780)).toLocaleString()},${(h % 900).toString().padStart(3, '0')}`;
}

const PHASE_LABEL: Record<Market['phase'], string> = {
  OPEN: 'Open',
  REVEAL: 'Revealing',
  RESOLVED: 'Resolved',
};

export function MarketCard({ market }: { market: Market }) {
  const total = market.yesPositions + market.noPositions;
  const yesPct = Math.round((market.yesPositions / total) * 100);
  const noPct = 100 - yesPct;
  const isResolved = market.phase === 'RESOLVED';

  return (
    <Card className="group flex flex-col justify-between p-5 transition-colors hover:border-border/80 hover:bg-surface-2/60">
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <Badge>{market.category}</Badge>
          <Badge
            variant={isResolved ? 'outline' : market.phase === 'REVEAL' ? 'accent' : 'default'}
            className={cn(isResolved && 'text-muted-foreground')}
          >
            {PHASE_LABEL[market.phase]}
          </Badge>
        </div>

        <h3 className="text-pretty text-[15px] font-medium leading-snug">{market.question}</h3>

        <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {market.resolution}
        </p>
      </div>

      <div className="mt-5">
        {/* Crowd lean. Derived from position COUNTS only -- there are no amounts
            to weight it with, and calling it a "price" would be a lie. */}
        <div className="mb-2 flex items-baseline justify-between text-xs">
          <span className="font-medium text-yes">YES {yesPct}%</span>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
            lean by position count
          </span>
          <span className="font-medium text-no">NO {noPct}%</span>
        </div>

        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="bg-yes/80" style={{ width: `${yesPct}%` }} />
          <div className="bg-no/70" style={{ width: `${noPct}%` }} />
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5" />
            {total.toLocaleString()} positions
          </span>

          <span className="flex items-center gap-1.5">
            <EyeOff className="size-3.5 text-accent" />
            <span className="sr-only">Pool size is shielded</span>
            <span aria-hidden="true" className="select-none font-mono blur-[3.5px]">
              {decoyPool(market.id)}
            </span>
          </span>
        </div>

        {isResolved ? (
          <div className="mt-4 rounded-lg border border-border bg-surface-2/50 px-3 py-2.5 text-center text-xs">
            Resolved{' '}
            <span className={market.winningSide === 'YES' ? 'text-yes' : 'text-no'}>
              {market.winningSide}
            </span>
            {' · '}
            <span className="text-muted-foreground">stakes now public for settlement</span>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-yes/25 bg-yes/10 text-yes hover:border-yes/40 hover:bg-yes/20 hover:text-yes"
            >
              Take YES
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-no/25 bg-no/10 text-no hover:border-no/40 hover:bg-no/20 hover:text-no"
            >
              Take NO
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
