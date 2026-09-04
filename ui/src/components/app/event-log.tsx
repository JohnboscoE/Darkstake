import { CheckCircle2, Terminal, XCircle } from 'lucide-react';
import type { LogEntry } from '@/lib/market-engine';

/**
 * Every circuit call and its result.
 *
 * The failures are the interesting half: each message is the literal string
 * from an `assert` inside the compiled contract, surfaced unedited. A rejected
 * call also leaves the ledger untouched, the same as a reverted transaction.
 */
export function EventLog({ log }: { log: LogEntry[] }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Terminal className="size-4 text-muted-foreground" />
        <h2 className="font-medium">Circuit log</h2>
        <span className="text-xs text-muted-foreground">real calls, real asserts</span>
      </div>

      <ul className="max-h-80 divide-y divide-border/60 overflow-y-auto">
        {log.map((e) => (
          <li key={e.seq} className="flex items-start gap-3 px-5 py-3">
            {e.ok ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-yes" />
            ) : (
              <XCircle className="mt-0.5 size-3.5 shrink-0 text-no" />
            )}
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-xs">
                <span className="text-muted-foreground">{e.actor}</span>
                <span className="text-foreground">{e.call}</span>
              </p>
              <p className={`mt-0.5 text-xs ${e.ok ? 'text-muted-foreground' : 'text-no'}`}>
                {e.ok ? e.detail : `rejected — ${e.detail}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
