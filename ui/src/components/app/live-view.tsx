import { ArrowLeft, ExternalLink, Loader2, Wallet } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/site/logo';
import { EventLog } from '@/components/app/event-log';
import { LiveClient } from '@/components/app/live-client';
import { PublicLedger } from '@/components/app/public-ledger';
import { useLiveMarket } from '@/hooks/use-live-market';

/**
 * Darkstake against a real Midnight network.
 *
 * `#/app` runs the same circuits in memory so anyone can try the market with
 * nothing installed. This view is the other half of the claim: same contract,
 * same asserts, but proved by a proof server, paid for with tDUST, submitted
 * through Lace, and read back from the public indexer. If the two disagree
 * about anything, the chain is right and the simulation is the thing to fix.
 */
export function LiveView() {
  const m = useLiveMarket();

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex">
              {m.networkId}
            </Badge>
            <Button variant="ghost" size="sm" asChild>
              <a href="#/app">Simulation</a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="#/">
                <ArrowLeft />
                <span className="hidden sm:inline">Back</span>
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6">
          <Badge variant="accent" className="mb-3">
            Live contract · Midnight {m.networkId}
          </Badge>
          <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            Shielded prediction market, on-chain
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Every action below is a real Midnight transaction: proved locally, signed by your
            wallet, settled in a block, and read back from the indexer.
          </p>
          {m.contractAddress && (
            <p className="mt-3 break-all font-mono text-xs text-muted-foreground">
              contract {m.contractAddress}
            </p>
          )}
        </div>

        {m.error && (
          <div className="mb-6 rounded-lg border border-no/25 bg-no/10 px-4 py-3 text-sm text-no" role="alert">
            {m.error}
          </div>
        )}

        {m.stage === 'ready' && m.ledger !== null ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-5">
              <PublicLedger
                ledger={m.ledger}
                positions={m.positions}
                entitlement={m.entitlement}
              />
              <EventLog log={m.log} />
            </div>

            <div className="min-w-0 space-y-5">
              <LiveClient
                ledger={m.ledger}
                positions={m.positions}
                notes={m.notes}
                isResolver={m.isResolver}
                busy={m.busy}
                notesPersist={m.notesPersist}
                entitlement={m.entitlement}
                onCommit={m.commit}
                onClose={m.closeMarket}
                onReveal={m.reveal}
                onResolve={m.resolve}
                onClaim={m.claim}
              />
              <SessionFacts
                proofServer={m.proofServer}
                keyPersisted={m.keyPersisted}
                isResolver={m.isResolver}
              />
            </div>
          </div>
        ) : (
          <Gate
            stage={m.stage}
            walletDetected={m.walletDetected}
            configuredAddress={m.configuredAddress}
            onConnect={m.connect}
            onDeploy={m.deploy}
          />
        )}
      </main>
    </div>
  );
}

/**
 * The pre-flight panel.
 *
 * It states the requirements up front rather than letting people discover them
 * as failures. Two of the three are genuinely outside our control: the proof
 * server URL comes from Lace's own configuration, not from this site, and only
 * the faucet can fund a wallet.
 */
function Gate({
  stage,
  walletDetected,
  configuredAddress,
  onConnect,
  onDeploy,
}: {
  stage: string;
  walletDetected: boolean;
  configuredAddress: string | null;
  onConnect: () => void;
  onDeploy: () => void;
}) {
  const working = stage === 'connecting' || stage === 'attaching';

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6 sm:p-8">
      <h2 className="text-lg font-medium">Before you connect</h2>
      <ol className="mt-4 space-y-4">
        <Requirement
          n={1}
          title="The Lace wallet extension, set to this network"
          met={walletDetected}
          metLabel="detected"
          unmetLabel="not detected"
        >
          Darkstake never holds a key. Every transaction is balanced and signed inside the
          extension, and you approve each one.
        </Requirement>
        <Requirement n={2} title="A proof server Lace can reach">
          Proving happens on your machine, not ours — that is what keeps the stake private. Lace
          tells the dapp where its proof server is; this site cannot choose one for you.
        </Requirement>
        <Requirement n={3} title="tNIGHT, registered for dust generation">
          Dust pays fees; NIGHT does not. An unregistered wallet has a balance and still cannot
          send anything.
        </Requirement>
      </ol>

      <div className="mt-7 grid gap-2 sm:grid-cols-2">
        <Button disabled={working || configuredAddress === null} onClick={onConnect}>
          {working ? <Loader2 className="animate-spin" /> : <Wallet />}
          {stage === 'attaching' ? 'Joining market…' : 'Connect and join'}
        </Button>
        <Button variant="outline" disabled={working} onClick={onDeploy}>
          Deploy your own market
        </Button>
      </div>
      {configuredAddress === null && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          No market is configured in this build (<span className="font-mono">VITE_CONTRACT_ADDRESS</span>{' '}
          is unset), so only deploying is available.
        </p>
      )}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Deploying makes you the resolver of a fresh market — the only account that can ever close
        and resolve it — which is the way to walk the whole lifecycle yourself. It costs a
        deployment fee.
      </p>

      <p className="mt-6 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
        Want to see the mechanism without installing anything?{' '}
        <a href="#/app" className="text-foreground underline underline-offset-4">
          The simulation
        </a>{' '}
        runs the same compiled circuits in your browser, unproven and in memory. Same asserts,
        same rejections, no wallet.
      </p>
    </div>
  );
}

function Requirement({
  n,
  title,
  met,
  metLabel,
  unmetLabel,
  children,
}: {
  n: number;
  title: string;
  met?: boolean;
  metLabel?: string;
  unmetLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 font-mono text-xs text-accent">{n}</span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          {title}
          {met !== undefined && (
            <Badge variant={met ? 'yes' : 'no'}>{met ? metLabel : unmetLabel}</Badge>
          )}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

/** The facts about this session that are worth being able to check. */
function SessionFacts({
  proofServer,
  keyPersisted,
  isResolver,
}: {
  proofServer: string | null;
  keyPersisted: boolean;
  isResolver: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-5">
      <p className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
        This session
      </p>
      <dl className="space-y-2.5 text-xs">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-muted-foreground">Proof server</dt>
          <dd className="break-all font-mono text-foreground">{proofServer ?? 'unknown'}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-muted-foreground">Your role</dt>
          <dd className="text-foreground">{isResolver ? 'resolver' : 'staker'}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-muted-foreground">Secrets survive reload</dt>
          <dd className={keyPersisted ? 'text-yes' : 'text-no'}>{keyPersisted ? 'yes' : 'no'}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Your secret key and every salt live in this browser only. They are what prove a position
        is yours; nothing on the chain and nothing we host can reconstruct them.
      </p>
      <a
        href="https://midnight.network/"
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Midnight network
        <ExternalLink className="size-3" />
      </a>
    </div>
  );
}
