import { Check, UserRound } from 'lucide-react';
import type { Identity } from '@/lib/market-engine';
import { shortHex, cn } from '@/lib/utils';

/**
 * Stands in for a wallet connector. Switching identity swaps which secret key
 * is fed to the `localSecretKey` witness, which is the only thing that decides
 * whether an ownership assert passes.
 */
export function IdentityBar({
  identities,
  actor,
  onSelect,
}: {
  identities: Identity[];
  actor: Identity;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
        <UserRound className="size-3.5" />
        Acting as
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {identities.map((id) => {
          const active = id.id === actor.id;
          return (
            <button
              key={id.id}
              onClick={() => onSelect(id.id)}
              aria-pressed={active}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                active
                  ? 'border-accent/40 bg-accent/10 text-foreground'
                  : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground',
              )}
            >
              {active && <Check className="size-3.5 text-accent" />}
              {id.label}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{actor.blurb}</p>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground/70">
        secretKey {shortHex(actor.secretKey)} · never leaves this browser
      </p>
    </div>
  );
}
