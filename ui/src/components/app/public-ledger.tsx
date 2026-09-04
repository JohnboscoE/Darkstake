import { Eye, EyeOff, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Phase, Side, type Ledger } from '@/lib/market-engine';
import { shortHex, fmt, cn } from '@/lib/utils';

type Row = {
  id: bigint;
  side: Side;
  stakeCommitment: Uint8Array;
  ownerHash: Uint8Array;
  revealed: boolean;
  revealedStake: bigint;
  claimed: boolean;
  owner?: string;
};

const PHASE_LABEL: Record<number, string> = {
  [Phase.OPEN]: 'Open',
  [Phase.REVEAL]: 'Revealing',
  [Phase.RESOLVED]: 'Resolved',
};

export function PublicLedger({
  ledger,
  positions,
  entitlement,
}: {
  ledger: Ledger;
  positions: Row[];
  entitlement: (id: bigint) => bigint;
}) {
  const resolved = ledger.phase === Phase.RESOLVED;

  return (
    <div className="min-w-0 rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Globe className="size-4 text-muted-foreground" />
        <h2 className="font-medium">Public ledger</h2>
        <span className="text-xs text-muted-foreground">everything the chain reveals</span>
        <Badge variant={resolved ? 'outline' : 'accent'} className="ml-auto">
          {PHASE_LABEL[ledger.phase]}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">
        <Stat label="YES positions" value={fmt(ledger.yesCount)} tone="yes" />
        <Stat label="NO positions" value={fmt(ledger.noCount)} tone="no" />
        <Stat
          label="Pool"
          value={ledger.pool === 0n ? '—' : fmt(ledger.pool)}
          hint={ledger.pool === 0n ? 'set at resolve' : undefined}
        />
        <Stat
          label="Winning total"
          value={ledger.winningStakeTotal === 0n ? '—' : fmt(ledger.winningStakeTotal)}
          hint={ledger.winningStakeTotal === 0n ? 'set at resolve' : undefined}
        />
      </div>

      {positions.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">
          No positions yet. Commit one and watch what the chain does — and does not — record.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">#</th>
                <th className="py-3 font-medium">Side</th>
                <th className="py-3 font-medium">Stake commitment</th>
                <th className="py-3 font-medium">Owner</th>
                <th className="py-3 font-medium">Stake</th>
                {resolved && <th className="px-5 py-3 font-medium">Entitlement</th>}
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={String(p.id)} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                    {String(p.id)}
                  </td>
                  <td className="py-3">
                    <span
                      className={cn(
                        'font-medium',
                        p.side === Side.YES ? 'text-yes' : 'text-no',
                      )}
                    >
                      {p.side === Side.YES ? 'YES' : 'NO'}
                    </span>
                  </td>
                  <td className="py-3 font-mono text-xs text-muted-foreground">
                    {shortHex(p.stakeCommitment)}
                  </td>
                  <td className="py-3 font-mono text-xs text-muted-foreground">
                    {shortHex(p.ownerHash)}
                  </td>
                  <td className="py-3">
                    {p.revealed ? (
                      <span className="flex items-center gap-1.5 font-mono text-xs">
                        <Eye className="size-3 text-muted-foreground" />
                        {fmt(p.revealedStake)}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-accent">
                        <EyeOff className="size-3" />
                        shielded
                      </span>
                    )}
                  </td>
                  {resolved && (
                    <td className="px-5 py-3 font-mono text-xs">
                      {entitlement(p.id) > 0n ? (
                        <span className="text-yes">
                          {fmt(entitlement(p.id))}
                          {p.claimed && <span className="ml-1.5 text-muted-foreground">claimed</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resolved && (
        <p className="border-t border-border px-5 py-4 text-xs leading-relaxed text-muted-foreground">
          Entitlement is <span className="font-mono">stake × pool / winningStakeTotal</span>,
          computed here in the client — Compact has no division operator, so the contract publishes
          the terms and anyone can derive and check the quotient.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'yes' | 'no';
}) {
  return (
    <div className="bg-card px-5 py-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 font-mono text-lg',
          tone === 'yes' && 'text-yes',
          tone === 'no' && 'text-no',
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground/60">{hint}</p>}
    </div>
  );
}
