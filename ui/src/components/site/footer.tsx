import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/site/logo';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Markets', href: '#markets' },
      { label: 'How it works', href: '#how-it-works' },
      { label: 'What is public', href: '#transparency' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  {
    title: 'Built with',
    links: [
      { label: 'Midnight Network', href: 'https://midnight.network' },
      { label: 'Compact language', href: 'https://docs.midnight.network' },
      { label: 'Lace wallet', href: 'https://www.lace.io' },
    ],
  },
];

/**
 * Read rather than written out, because this line was wrong once already: it
 * claimed preprod while the deployed contract was on preview. The build knows
 * which network it is configured for; a sentence does not.
 */
const NETWORK = import.meta.env.VITE_NETWORK_ID ?? 'preview';

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Prediction markets where direction is public and size is not. Running on the
              Midnight {NETWORK} testnet.
            </p>
            <Button size="sm" className="mt-5" asChild>
              <a href="#/live">
                <Play />
                Launch app
              </a>
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              or{' '}
              <a href="#/app" className="underline underline-offset-4 hover:text-foreground">
                run the same contract without a wallet
              </a>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <h3 className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                  {column.title}
                </h3>
                <ul className="space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        {...(link.href.startsWith('http')
                          ? { target: '_blank', rel: 'noreferrer' }
                          : {})}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground/70 sm:flex-row sm:items-center sm:justify-between">
          <p>Testnet only. Illustrative markets. Not financial advice.</p>
          <p>Resolution is centrally reported in v1 — see the roadmap above.</p>
        </div>
      </div>
    </footer>
  );
}
