'use client'

import { Bike, Eye } from 'lucide-react'

export type Scope = 'mine' | 'all'

/** Segmented control to switch between "my" deliveries and the whole team's. */
export function ScopeToggle({
  scope,
  onChange,
  allLabel = 'Todos (equipo)',
}: {
  scope: Scope
  onChange: (s: Scope) => void
  allLabel?: string
}) {
  return (
    <div className="inline-flex rounded-full border border-border bg-muted p-0.5" role="tablist" aria-label="Filtro de pedidos">
      <button
        type="button"
        role="tab"
        aria-selected={scope === 'mine'}
        onClick={() => onChange('mine')}
        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
          scope === 'mine' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Bike className="h-3.5 w-3.5" />
        Míos
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={scope === 'all'}
        onClick={() => onChange('all')}
        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
          scope === 'all' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Eye className="h-3.5 w-3.5" />
        {allLabel}
      </button>
    </div>
  )
}
