'use client'

import { useState } from 'react'
import { Loader2, KeyRound, Moon, Zap, ShieldCheck, Clock, MapPin, Store, Bike, Shield, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api-client'
import type { AppUser } from '@/lib/types'
import { Logo } from '@/components/brand/logo'
import { InstallIosBanner } from '@/components/pwa/install-ios-banner'

/**
 * Pantalla de acceso única para los tres perfiles (restaurante, repartidor y
 * administrador). El mismo usuario+contraseña: el backend detecta el perfil
 * automáticamente y la app redirige al panel correspondiente.
 *
 * Pensada para móvil (iPhone): marca compacta arriba y formulario accesible
 * sin hacer scroll; en escritorio se despliega la versión completa a dos columnas.
 */
export function UnifiedAuth({ onSuccess }: { onSuccess: (user: AppUser) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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

      <div
        className="relative mx-auto flex w-full max-w-6xl flex-col px-4 lg:flex-row lg:items-center lg:justify-between lg:gap-16"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 2.25rem)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)',
        }}
      >
        {/* Branding — compacto en móvil, completo en escritorio */}
        <div className="flex w-full flex-col items-center text-center lg:items-start lg:text-left">
          <Logo variant="full" size="lg" />

          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Zap className="h-3.5 w-3.5" />
            Reparto nocturno entre varios locales
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl lg:text-5xl">
            Repartos <span className="text-primary">NOVI</span>
          </h1>
          {/* Descripción larga: solo tablet/escritorio (en móvil prioriza el formulario) */}
          <p className="mt-3 hidden text-sm text-muted-foreground sm:block sm:text-base lg:text-lg">
            La plataforma sencilla para gestionar tu reparto de noche. Los
            restaurantes piden repartidor con un solo botón; el repartidor
            recibe, recoge y entrega.
          </p>

          {/* Detalles completos: solo escritorio */}
          <div className="mt-6 hidden flex-wrap items-center gap-2 text-xs text-muted-foreground lg:flex">
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

          <div className="mt-8 hidden space-y-3 text-sm text-muted-foreground lg:block">
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

          <div className="mt-8 hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
            <Moon className="h-3.5 w-3.5" />
            Pensada para turnos de noche · rápida y fácil de usar
          </div>
        </div>

        {/* Login card — única para los 3 perfiles */}
        <Card className="mt-8 w-full max-w-md self-center shadow-lg lg:mt-0">
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
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  spellCheck={false}
                  enterKeyHint="next"
                  className="h-11 text-base"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    enterKeyHint="go"
                    className="h-11 pr-12 text-base"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={showPassword}
                    className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                className="h-12 w-full bg-primary text-base text-white hover:bg-primary/90"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-5 w-5" />
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

      {/* Captación de locales — espacio extra en móvil para no quedar bajo
          el aviso de instalación de iOS */}
      <div
        className="relative flex justify-center pt-4"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}
      >
        <a
          href="/?contacto"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Store className="h-4 w-4" />
          ¿Tienes un local y quieres reparto nocturno? Escríbenos
        </a>
      </div>
      {/* Espacio para que el enlace de contacto no quede bajo el aviso de
          instalación de iOS (banner ~129px: 117px + 12px de margen) */}
      <div className="h-36 sm:h-0" aria-hidden="true" />

      {/* Aviso de instalación iOS: solo aquí, en el login — nunca sobre los
          paneles de trabajo para no tapar botones críticos (aceptar/recoger) */}
      <InstallIosBanner />
    </div>
  )
}
