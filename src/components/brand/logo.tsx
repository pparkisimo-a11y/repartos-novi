import { cn } from '@/lib/utils'

/**
 * "Repartos NOVI" con el logo oficial.
 * variant="full"   → logo completo (repartidor + texto) — pantallas públicas
 * variant="sidebar" → sidebar oscura (chip + wordmark nítido)
 * variant="light"   → fondos claros (chip oscuro + wordmark)
 * variant="compact" → solo el chip
 */
export function Logo({
  variant = 'light',
  className,
  size = 'md',
}: {
  variant?: 'sidebar' | 'light' | 'compact' | 'full'
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  // Logo completo (variante "full")
  if (variant === 'full') {
    const full =
      size === 'lg'
        ? 'h-20 w-20 sm:h-24 sm:w-24 lg:h-28 lg:w-28'
        : size === 'sm'
          ? 'h-12 w-12'
          : 'h-16 w-16'
    return (
       
      <img
        src="/logo-novi.png"
        alt="Repartos NOVI"
        className={cn('rounded-2xl object-cover shadow-lg ring-1 ring-black/10', full, className)}
      />
    )
  }

  const chip = size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-9 w-9' : 'h-11 w-11'
  const novi = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-lg' : 'text-xl'
  const repartos =
    size === 'lg' ? 'text-sm' : size === 'sm' ? 'text-[10px]' : 'text-xs'
  const onDark = variant === 'sidebar'

  if (variant === 'compact') {
    return <LogoMark chip={chip} className={className} onDark={onDark} />
  }

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark chip={chip} onDark={onDark} />
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

/** Chip cuadrado con el logo oficial (fondo exacto del logo: #121212). */
function LogoMark({
  chip,
  className,
  onDark,
}: {
  chip: string
  className?: string
  onDark?: boolean
}) {
  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#121212]',
        onDark ? 'ring-1 ring-white/15' : 'shadow-sm ring-1 ring-black/10',
        chip,
        className,
      )}
    >
      { }
      <img
        src="/logo-novi.png"
        alt="Repartos NOVI"
        className="h-full w-full object-cover"
      />
    </div>
  )
}
