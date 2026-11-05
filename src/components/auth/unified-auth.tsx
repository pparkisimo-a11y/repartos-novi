'use client'

import { useState } from 'react'
import { Loader2, KeyRound, Moon, Zap, ShieldCheck, Clock, MapPin, Store, Bike, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api-client'
import type { AppUser } from '@/lib/types'
import { Logo } from '@/components/brand/logo'

/**
 * Pantalla de acceso única para los tres perfiles (restaurante, repartidor y
 * administrador). El mismo usuario+contraseña: el backend detecta el perfil
 * automáticamente y la app redirige al panel correspondiente.
 */
export function UnifiedAuth({ onSuccess }: { onSuccess: (user: AppUser) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.login(username, password)
      if (res.user) {
        toast.success(`Bienvenido, ${res.user.name}`)
        onSuccess(res.user)
      } else {
        toast.error('Usuario o contraseña incorrectos')
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Error inesperado'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Decorative orange glow */}
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-4 py-10 lg:flex-row lg:items-center lg:justify-between lg:gap-16 lg:py-20">
        {/* Branding */}
        <div className="w-full max-w-xl">
          <Logo size="lg" className="mb-6" />

          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Zap className="h-3.5 w-3.5" />
            Reparto nocturno entre varios locales
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Repartos <span className="text-primary">NOVI</span>
          </h1>
          <p className="mt-3 text-muted-foreground sm:text-lg">
            La plataforma sencilla para gestionar tu reparto de noche. Los
            restaurantes piden repartidor con un solo botón; el repartidor
            recibe, recoge y entrega.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1">
              <Clock className="h-3.5 w-3.5 text-primary" /> Tiempo real
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1">
              <MapPin className="h-3.5 w-3.5 text-primary" /> Mapa integrado
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Historial y estadísticas
            </span>
          </div>

          <div className="mt-8 space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Store className="h-4.5 w-4.5" />
              </span>
              <span><strong className="text-foreground">Restaurantes:</strong> un botón para pedir repartidor</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Bike className="h-4.5 w-4.5" />
              </span>
              <span><strong className="text-foreground">Repartidores:</strong> solicitudes al instante, con mapa</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Shield className="h-4.5 w-4.5" />
              </span>
              <span><strong className="text-foreground">Administración:</strong> locales, equipo y captación</span>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
            <Moon className="h-3.5 w-3.5" />
            Pensada para turnos de noche · rápida y fácil de usar
          </div>
        </div>

        {/* Login card — única para los 3 perfiles */}
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="p-6 sm:p-8">
            <h2 className="text-xl font-bold">Iniciar sesión</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Restaurante, repartidor o administración — el mismo acceso
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Usuario</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Tu usuario"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-primary text-white hover:bg-primary/90"
                size="lg"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                Entrar
              </Button>
            </form>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              ¿Problemas para entrar? Contacta con tu coordinador de reparto.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Captación de locales */}
      <div className="relative flex justify-center pb-8">
        <a
          href="/?contacto"
          className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Store className="h-4 w-4" />
          ¿Tienes un local y quieres reparto nocturno? Escríbenos
        </a>
      </div>
    </div>
  )
}
