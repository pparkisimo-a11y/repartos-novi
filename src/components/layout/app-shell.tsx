'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { LogOut, Menu, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/brand/logo'

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  badge?: number
}

/**
 * App shell with a fixed dark sidebar (like the "Repartos Novi" reference) and a
 * light-gray main content area. Responsive: sidebar collapses into a slide-over
 * drawer on mobile (hamburger button in a top bar).
 */
export function AppShell({
  navItems,
  activeView,
  onChangeView,
  onLogout,
  header,
  children,
}: {
  navItems: NavItem[]
  activeView: string
  onChangeView: (view: string) => void
  onLogout: () => void
  /** Optional header node rendered at the top of the main content area. */
  header?: ReactNode
  children: ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  // Cerrar el drawer móvil con Escape (accesibilidad: el lector de pantalla
  // anuncia el drawer como diálogo y debe poder cerrarse con el teclado).
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Brand — respeta el notch / Dynamic Island en móvil */}
      <div
        className="px-5 pb-4"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 1.25rem)' }}
      >
        <Logo variant="sidebar" />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = item.id === activeView
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onChangeView(item.id)
                setMobileOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-white/70 hover:bg-white/10 hover:text-white',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
                    active
                      ? 'bg-white/25 text-white'
                      : 'bg-primary text-white',
                  )}
                >
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Logout */}
      <div
        className="border-t border-white/10 p-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
      >
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-5 w-5" />
          Cerrar sesión
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-[#1A1A1A] lg:block">
        {sidebar}
      </aside>

      {/* Mobile slide-over */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-[#1A1A1A] shadow-xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex min-h-screen w-full flex-col lg:pl-64">
        {/* Mobile top bar — padding superior para el notch / Dynamic Island */}
        <div
          className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card px-4 py-3 lg:hidden"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-foreground hover:bg-muted"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Logo variant="light" size="sm" />
        </div>

        <main
          className="flex-1"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
            {header}
            <div className="mt-6">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}
