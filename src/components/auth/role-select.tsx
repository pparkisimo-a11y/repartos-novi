'use client'

import { Bike, Store, ArrowRight, Moon, Zap, ShieldCheck, Clock, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Logo } from '@/components/brand/logo'

export function RoleSelect({
  onSelect,
}: {
  onSelect: (role: 'restaurant' | 'driver') => void
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Decorative orange glow */}
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center px-4 py-10 sm:py-16">
        {/* Brand */}
        <Logo size="lg" className="mb-6" />

        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Zap className="h-3.5 w-3.5" />
          Reparto nocturno entre varios locales
        </div>
        <h1 className="text-center text-3xl font-bold tracking-tight sm:text-5xl">
          Repartos <span className="text-primary">NOVI</span>
        </h1>
        <p className="mt-3 max-w-2xl text-center text-muted-foreground sm:text-lg">
          La plataforma sencilla para gestionar tu reparto de noche. Los
          restaurantes piden repartidor con un solo botón; tú recibes, recoges y
          entregas. Sin pedidos, clientes ni direcciones que gestionar.
        </p>

        {/* Feature pills */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
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

        <div className="mt-10 grid w-full gap-4 sm:grid-cols-2">
          <Card className="group relative overflow-hidden p-6 transition-all hover:border-primary/50 hover:shadow-lg sm:p-8">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Store className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-semibold">Soy Restaurante</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Inicia sesión con las credenciales que te haya entregado el
              repartidor. Pulsa un único botón para avisarle cuando tengas el
              pedido listo.
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Un solo botón: «Solicitar repartidor»
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Estado del reparto en tiempo real
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Confirmación al entregar
              </li>
            </ul>
            <Button
              className="mt-6 w-full bg-primary text-white hover:bg-primary/90"
              size="lg"
              onClick={() => onSelect('restaurant')}
            >
              Entrar como restaurante
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>

          <Card className="group relative overflow-hidden p-6 transition-all hover:border-primary/50 hover:shadow-lg sm:p-8">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Bike className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-semibold">Soy Repartidor</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Recibe todas las solicitudes de tus locales en una sola app.
              Acepta, ve al restaurante en el mapa, recoge y marca como
              entregado.
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Notificaciones instantáneas
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Mapa con la ubicación del local
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Historial y estadísticas de tu trabajo
              </li>
            </ul>
            <Button
              className="mt-6 w-full"
              size="lg"
              variant="outline"
              onClick={() => onSelect('driver')}
            >
              Entrar como repartidor
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
        </div>

        <div className="mt-10 flex items-center gap-2 text-xs text-muted-foreground">
          <Moon className="h-3.5 w-3.5" />
          Pensada para turnos de noche · rápida y fácil de usar
        </div>

        {/* Captación de locales */}
        <a
          href="/?contacto"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Store className="h-4 w-4" />
          ¿Tienes un local y quieres reparto nocturno? Escríbenos
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}
