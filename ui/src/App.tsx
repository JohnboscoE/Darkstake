import { Suspense, lazy, useEffect, useState } from 'react';
import { Nav } from '@/components/site/nav';
import { Hero } from '@/components/site/hero';
import { Markets } from '@/components/site/markets';
import { FrontRunning } from '@/components/site/front-running';
import { HowItWorks } from '@/components/site/how-it-works';
import { Transparency } from '@/components/site/transparency';
import { Resolver } from '@/components/site/resolver';
import { Faq } from '@/components/site/faq';
import { Footer } from '@/components/site/footer';

/**
 * Both app views are code-split, and it is not a micro-optimisation.
 *
 * `AppView` pulls the compact runtime (1.4 MB of wasm) and `LiveView` pulls the
 * ledger and the whole midnight-js provider stack (another 10 MB). Imported
 * statically, all of that lands in the landing page's bundle -- so a visitor who
 * only wanted to read what Darkstake is waits for 16 MB to download and compile
 * first. On an older laptop that is the difference between a page and a hang.
 *
 * Split, the landing page carries none of it, `#/app` fetches the runtime, and
 * only `#/live` pays for the ledger.
 */
const AppView = lazy(() =>
  import('@/components/app/app-view').then((m) => ({ default: m.AppView })),
);
const LiveView = lazy(() =>
  import('@/components/app/live-view').then((m) => ({ default: m.LiveView })),
);

/**
 * Hash routing, rather than a router dependency: there are three views.
 * `#/live` is the deployed contract on Midnight, `#/app` the same circuits run
 * in memory with no wallet, and everything else is the landing page.
 */
function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return hash;
}

/**
 * Shown while a view's chunk downloads. It names what is loading and why it is
 * slow, because on a modest machine this is a genuine wait and an unexplained
 * spinner reads as a hang.
 */
function Loading({ what }: { what: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <p className="text-center text-sm leading-relaxed text-muted-foreground">
        Loading {what}…
        <br />
        <span className="text-xs text-muted-foreground/70">
          Several megabytes of WebAssembly — the contract runs for real, so it
          has to come with you.
        </span>
      </p>
    </div>
  );
}

export default function App() {
  const hash = useHashRoute();

  // Anchor links (#markets, #faq) must not be mistaken for a route: the
  // leading slash is what separates them.
  if (hash.startsWith('#/live')) {
    return (
      <Suspense fallback={<Loading what="the contract client" />}>
        <LiveView />
      </Suspense>
    );
  }
  if (hash.startsWith('#/app')) {
    return (
      <Suspense fallback={<Loading what="the contract runtime" />}>
        <AppView />
      </Suspense>
    );
  }

  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Markets />
        <FrontRunning />
        <HowItWorks />
        <Transparency />
        <Resolver />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
