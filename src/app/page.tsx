'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import type { AppUser } from '@/lib/types'
import { RoleSelect } from '@/components/auth/role-select'
import { RestaurantAuth } from '@/components/auth/restaurant-auth'
import { DriverAuth } from '@/components/auth/driver-auth'
import { RestaurantDashboard } from '@/components/restaurant/restaurant-dashboard'
import { DriverDashboard } from '@/components/driver/driver-dashboard'
import { ContactForm } from '@/components/public/contact-form'
import { AppFooter } from '@/components/app-footer'

type AuthView = 'select' | 'restaurant' | 'driver'

function HomeInner() {
  const qc = useQueryClient()
  const [authView, setAuthView] = useState<AuthView>('select')
  const searchParams = useSearchParams()
  const isContact = searchParams.has('contacto')

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
  })

  const user = data?.user ?? null

  function handleAuthed(u: AppUser) {
    qc.setQueryData(['me'], { user: u })
    setAuthView('select')
  }

  async function handleLogout() {
    await api.logout()
    qc.setQueryData(['me'], { user: null })
    qc.invalidateQueries({ queryKey: ['deliveries'] })
    toast.info('Sesión cerrada')
  }

  // Public contact form (QR flyer landing) — always public, no session needed.
  if (isContact && !user) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <main className="flex-1">
          <ContactForm />
        </main>
        <AppFooter />
      </div>
    )
  }

  // Dashboards manage their own full-screen layout (sidebar shell); no footer.
  if (user) {
    return user.role === 'restaurant' ? (
      <RestaurantDashboard user={user} onLogout={handleLogout} />
    ) : (
      <DriverDashboard user={user} onLogout={handleLogout} />
    )
  }

  // Landing + auth screens get the sticky footer.
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1">
        {isLoading ? (
          <div className="flex h-[70vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : authView === 'select' ? (
          <RoleSelect onSelect={(r) => setAuthView(r)} />
        ) : authView === 'restaurant' ? (
          <RestaurantAuth onSuccess={handleAuthed} onBack={() => setAuthView('select')} />
        ) : (
          <DriverAuth onSuccess={handleAuthed} onBack={() => setAuthView('select')} />
        )}
      </main>
      <AppFooter />
    </div>
  )
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <HomeInner />
    </Suspense>
  )
}
