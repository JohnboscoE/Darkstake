import { cn } from '@/lib/utils';

/**
 * The mark: a peak whose upper half is solid and lower half is dashed.
 * The shape is public, the mass underneath it is not -- which is the product.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn('size-6', className)} aria-hidden="true">
      <path
        d="M12 3.5 20.5 19H3.5L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeDasharray="0 0"
        className="opacity-100"
        pathLength={100}
        style={{ strokeDasharray: '48 100', strokeDashoffset: 74 }}
      />
      <path
        d="M12 3.5 20.5 19H3.5L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        pathLength={100}
        style={{ strokeDasharray: '3 5', strokeDashoffset: 26 }}
        className="opacity-45"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <a href="#top" className={cn('flex items-center gap-2.5 font-semibold tracking-tight', className)}>
      <LogoMark className="size-6 text-accent" />
      <span className="text-[17px]">Darkstake</span>
    </a>
  );
}
