import { Logo } from '@/components/brand/logo'

export function AppFooter() {
  return (
    <footer
      className="border-t border-border bg-card"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6">
        <Logo size="sm" />
        <p className="text-center sm:text-right">
          Plataforma de reparto nocturno entre restaurantes y repartidor
        </p>
      </div>
    </footer>
  )
}
