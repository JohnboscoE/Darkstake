import { Copy, EyeOff, TrendingDown } from 'lucide-react';
import { Section, SectionHeading } from '@/components/site/section';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function Row({
  label,
  side,
  amount,
  shielded = false,
  muted = false,
}: {
  label: string;
  side: 'YES' | 'NO';
  amount: string;
  shielded?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5 font-mono text-xs ${
        muted ? 'opacity-55' : ''
      }`}
    >
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <div className="flex shrink-0 items-center gap-3">
        <span className={side === 'YES' ? 'text-yes' : 'text-no'}>{side}</span>
        {shielded ? (
          <span className="flex items-center gap-1.5 text-accent">
            <EyeOff className="size-3" />
            <span className="sr-only">shielded</span>
            <span aria-hidden="true" className="select-none blur-[3px]">
              {amount}
            </span>
          </span>
        ) : (
          <span className="text-foreground">{amount}</span>
        )}
      </div>
    </div>
  );
}

export function FrontRunning() {
  return (
    <Section id="front-running" className="border-y border-border bg-surface/40">
      <SectionHeading
        eyebrow="The problem"
        title="A visible position is a free trading signal for everyone else."
        description="On a transparent market, size is public the instant you commit. A large, well-researched position is the most valuable thing on the book — and it is handed to every bot watching, for nothing, before it has even settled."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="min-w-0 border-no/20 p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <TrendingDown className="size-4 text-no" />
            <h3 className="font-medium">Transparent market</h3>
            <Badge variant="no" className="ml-auto">
              signal leaks
            </Badge>
          </div>

          <div className="space-y-2">
            <Row label="0x4f2a…c19b" side="YES" amount="$250,000" />
            <div className="flex items-center gap-2 py-1 pl-3 text-xs text-muted-foreground">
              <Copy className="size-3" />
              copied 0.8s later
            </div>
            <Row label="bot_0091" side="YES" amount="$48,000" muted />
            <Row label="bot_0244" side="YES" amount="$61,500" muted />
            <Row label="bot_0870" side="YES" amount="$39,200" muted />
          </div>

          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            The original position gets front-run into a worse price, the copycats add no information,
            and the aggregate stops describing what anyone actually believes. The researcher pays for
            the research; everybody else reads the answer off the tape.
          </p>
        </Card>

        <Card className="min-w-0 border-accent/25 p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <EyeOff className="size-4 text-accent" />
            <h3 className="font-medium">Darkstake</h3>
            <Badge variant="accent" className="ml-auto">
              size sealed
            </Badge>
          </div>

          <div className="space-y-2">
            <Row label="0x4f2a…c19b" side="YES" amount="$250,000" shielded />
            <Row label="0x91de…7f30" side="NO" amount="$12,400" shielded />
            <Row label="0xbb07…2a5e" side="YES" amount="$3,900" shielded />
            <Row label="0x55c1…9e42" side="NO" amount="$88,100" shielded />
          </div>

          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Four positions, two directions, and no way to tell the whale from the tourist. Copying a
            side you can already see is just taking the same view — it is copying the{' '}
            <span className="text-foreground">conviction behind it</span> that front-running
            needs, and that number is not on the chain to read.
          </p>
        </Card>
      </div>

      <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        <span className="text-foreground">The tradeoff, stated plainly:</span> hiding size means
        there is no continuous price, only a direction and a participation count. We think that is
        the right trade for a market whose job is to aggregate belief rather than to be scalped. It
        also means the protection is temporal — once the reveal phase opens, every winning stake
        becomes public so settlement can be verified by anyone.
      </p>
    </Section>
  );
}
