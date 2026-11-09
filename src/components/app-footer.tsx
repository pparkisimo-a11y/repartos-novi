'use client'

import { useState } from 'react'
import { Logo } from '@/components/brand/logo'
import { PrivacyPolicyDialog } from '@/components/privacy-policy-dialog'

export function AppFooter() {
  const [privacyOpen, setPrivacyOpen] = useState(false)

  return (
    <footer
      className="border-t border-border bg-card"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6">
        <Logo size="sm" />
        <div className="flex flex-col items-center gap-1 text-center sm:items-end sm:text-right">
          <p>Gestión de reparto nocturno para restaurantes y repartidores</p>
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:justify-end">
            <span>© {new Date().getFullYear()} Repartos NOVI</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setPrivacyOpen(true)}
              className="rounded underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Privacidad
            </button>
          </p>
        </div>
      </div>
      <PrivacyPolicyDialog open={privacyOpen} onOpenChange={setPrivacyOpen} />
    </footer>
  )
}
