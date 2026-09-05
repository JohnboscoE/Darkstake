import { useEffect, useState } from 'react';
import { Nav } from '@/components/site/nav';
import { Hero } from '@/components/site/hero';
import { Markets } from '@/components/site/markets';
import { FrontRunning } from '@/components/site/front-running';
import { HowItWorks } from '@/components/site/how-it-works';
import { Transparency } from '@/components/site/transparency';
import { Resolver } from '@/components/site/resolver';
import { Faq } from '@/components/site/faq';
import { Footer } from '@/components/site/footer';
import { AppView } from '@/components/app/app-view';
import { LiveView } from '@/components/app/live-view';

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

export default function App() {
  const hash = useHashRoute();

  // Anchor links (#markets, #faq) must not be mistaken for a route: the
  // leading slash is what separates them.
  if (hash.startsWith('#/live')) {
    return <LiveView />;
  }
  if (hash.startsWith('#/app')) {
    return <AppView />;
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
