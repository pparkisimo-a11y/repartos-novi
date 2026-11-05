'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import type { AppUser } from '@/lib/types'
import { UnifiedAuth } from '@/components/auth/unified-auth'
import { RestaurantDashboard } from '@/components/restaurant/restaurant-dashboard'
import { DriverDashboard } from '@/components/driver/driver-dashboard'
import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { ContactForm } from '@/components/public/contact-form'
import { AppFooter } from '@/components/app-footer'

function HomeInner() {
  const qc = useQueryClient()
  const searchParams = useSearchParams()
  const isContact = searchParams.has('contacto')

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
  })

  const user = data?.user ?? null

  function handleAuthed(u: AppUser) {
    qc.setQueryData(['me'], { user: u })
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
    if (user.role === 'restaurant') {
      return <RestaurantDashboard user={user} onLogout={handleLogout} />
    }
    if (user.role === 'admin') {
      return <AdminDashboard user={user} onLogout={handleLogout} />
    }
    return <DriverDashboard user={user} onLogout={handleLogout} />
  }

  // Unified login screen (restaurant / driver / admin) with sticky footer.
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1">
        {isLoading ? (
          <div className="flex h-[70vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <UnifiedAuth onSuccess={handleAuthed} />
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
