import { cn } from '@/lib/utils'

/**
 * "Repartos NOVI" brand lockup.
 * variant="sidebar" → for the dark sidebar (rider in a light chip + white/orange wordmark)
 * variant="light"   → for light backgrounds (rider direct + dark/orange wordmark)
 * variant="compact" → just the rider chip, no wordmark
 */
export function Logo({
  variant = 'light',
  className,
  size = 'md',
}: {
  variant?: 'sidebar' | 'light' | 'compact'
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const chip = size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-9 w-9' : 'h-11 w-11'
  const novi = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-lg' : 'text-xl'
  const repartos =
    size === 'lg' ? 'text-sm' : size === 'sm' ? 'text-[10px]' : 'text-xs'

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'inline-flex items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm',
          chip,
          className,
        )}
      >
        <img
          src="/logo-rider.png"
          alt="Repartos NOVI"
          className="h-full w-full object-contain p-0.5"
        />
      </div>
    )
  }

  const onDark = variant === 'sidebar'

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm',
          chip,
        )}
      >
        <img
          src="/logo-rider.png"
          alt="Repartos NOVI"
          className="h-full w-full object-contain p-0.5"
        />
      </div>
      <div className="leading-none">
        <div
          className={cn(
            'font-semibold italic tracking-tight',
            repartos,
            onDark ? 'text-white' : 'text-foreground',
          )}
        >
          Repartos
        </div>
        <div
          className={cn(
            'font-black italic leading-none',
            novi,
            'text-primary',
          )}
          style={{ letterSpacing: '-0.02em' }}
        >
          NOVI
        </div>
      </div>
    </div>
  )
}
