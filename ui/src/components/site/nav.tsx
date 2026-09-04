import { useEffect, useState } from 'react';
import { Menu, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Logo } from '@/components/site/logo';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '#markets', label: 'Markets' },
  { href: '#front-running', label: 'Why shielded' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-colors duration-300',
        scrolled && 'border-b border-border bg-background/80 backdrop-blur-xl',
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" className="hidden sm:inline-flex" asChild>
            <a href="#/app">
              <Play />
              Launch app
            </a>
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="mb-10 mt-1">
                <Logo />
              </div>
              <div className="flex flex-col">
                {LINKS.map((link) => (
                  <SheetClose asChild key={link.href}>
                    <a
                      href={link.href}
                      className="border-b border-border py-4 text-lg text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </SheetClose>
                ))}
              </div>
              <Button className="mt-8 w-full" size="lg" asChild>
                <a href="#/app">
                  <Play />
                  Launch app
                </a>
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Runs the real contract in your browser. No real value at stake.
              </p>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
