import { ArrowRight, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GLSLHills } from '@/components/ui/glsl-hills';

export function Hero() {
  return (
    <section id="top" className="relative min-h-[100svh] overflow-hidden">
      <GLSLHills cameraZ={125} speed={0.5} tint={[0.58, 0.55, 0.82]} />

      {/* Fade the terrain into the page so the section boundary is invisible. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-64 bg-gradient-to-b from-transparent to-background" />

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-4xl flex-col items-center justify-center px-4 pb-24 pt-28 text-center sm:px-6">
        <Badge variant="accent" className="mb-8">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-shimmer rounded-full bg-accent" />
            <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
          </span>
          Built on Midnight · Preprod testnet
        </Badge>

        <h1 className="text-balance font-semibold leading-[1.05] tracking-tight">
          <span className="block font-display text-4xl font-normal italic text-muted-foreground sm:text-5xl lg:text-6xl">
            Everyone sees your call.
          </span>
          <span className="mt-2 block text-4xl sm:text-6xl lg:text-7xl">Nobody sees your size.</span>
        </h1>

        <p className="mt-7 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          A binary prediction market where your side stays public — so the market still carries
          signal — while your stake amount and your identity stay shielded by zero-knowledge proofs
          until settlement.
        </p>

        <div className="mt-10 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
          <Button size="lg" className="w-full sm:w-auto" asChild>
            <a href="#/app">
              Try the live contract
              <ArrowRight />
            </a>
          </Button>
          <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
            <a href="#markets">Browse markets</a>
          </Button>
        </div>

        <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground/80">
          <Lock className="size-3.5" />
          Stakes are sealed client-side. The amount never touches the chain before you reveal it.
        </p>
      </div>
    </section>
  );
}
