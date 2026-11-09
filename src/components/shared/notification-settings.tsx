'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  Bike,
  CheckCircle2,
  PackageCheck,
  PackageX,
  PackagePlus,
  UserMinus,
  UserPlus,
  Volume2,
  Inbox,
  Activity,
  Send,
  Loader2,
  RotateCcw,
  Smartphone,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api-client'
import { NOTIF_CATALOG, type NotifRole, type NotifTypeDef } from '@/lib/notif-catalog'
import { PushBell } from '@/components/pwa/push-bell'

/** Icono por tipo de notificación (mismo lenguaje visual que los paneles). */
const TYPE_ICONS: Record<string, typeof Bell> = {
  // repartidor
  new_order: PackagePlus,
  sound_alert: Volume2,
  order_taken: UserMinus,
  order_cancelled: PackageX,
  // restaurante
  order_accepted: CheckCircle2,
  order_picked_up: PackageCheck,
  order_delivered: Bike,
  order_rejected: PackageX,
  // admin
  new_request: Inbox,
  order_status: Activity,
  new_lead: UserPlus,
}

const ROLE_HINT: Record<NotifRole, string> = {
  driver: 'Elige qué avisos quieres recibir mientras repartes.',
  restaurant: 'Elige de qué quieres que te avisemos sobre tus pedidos.',
  admin: 'Elige de qué quieres que te avisemos sobre la actividad del servicio.',
}

/**
 * Apartado "Notificaciones": cada perfil (admin, repartidor o restaurante)
 * activa/desactiva los tipos de aviso que quiere recibir. Se aplica tanto a
 * los avisos en la app (toasts en tiempo real / sonido) como a las
 * notificaciones push de sus dispositivos.
 */
export function NotificationSettings({
  role,
  userId,
}: {
  role: NotifRole
  userId: string
}) {
  const qc = useQueryClient()
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['notif-prefs', role, userId],
    queryFn: () => api.getNotifPrefs(),
  })
  const prefs = data?.prefs
  const catalog = NOTIF_CATALOG[role]

  /** Cambia un tipo concreto: actualización optimista + PUT. */
  async function toggle(key: string, next: boolean) {
    if (!prefs) return
    setSavingKey(key)
    // Optimista: el switch se mueve ya; si falla, se revierte
    qc.setQueryData(['notif-prefs', role, userId], { prefs: { ...prefs, [key]: next } })
    try {
      const res = await api.setNotifPrefs({ [key]: next })
      qc.setQueryData(['notif-prefs', role, userId], res)
    } catch (err) {
      qc.setQueryData(['notif-prefs', role, userId], { prefs })
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el cambio')
    } finally {
      setSavingKey(null)
    }
  }

  /** Restablecer: todo activado (los valores por defecto del catálogo). */
  async function resetAll() {
    setSavingKey('__reset')
    const allOn: Record<string, boolean> = {}
    for (const t of catalog) allOn[t.key] = true
    qc.setQueryData(['notif-prefs', role, userId], { prefs: allOn })
    try {
      const res = await api.setNotifPrefs(allOn)
      qc.setQueryData(['notif-prefs', role, userId], res)
      toast.success('Preferencias restablecidas', {
        description: 'Todos los avisos vuelven a estar activados.',
      })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo restablecer')
    } finally {
      setSavingKey(null)
    }
  }

  /** Push de prueba al propio dispositivo (llega ~9 s después). */
  async function sendTest() {
    setTesting(true)
    try {
      const res = await api.sendTestPush()
      if (res.sent > 0) {
        toast.success('Notificación de prueba programada', {
          description:
            'Llegará en unos 9 segundos. Cierra o minimiza la app para ver el aviso como en la realidad.',
        })
      } else {
        toast.info('Todavía no hay dispositivos suscritos', {
          description:
            'Activa los avisos en tu móvil (botón de abajo o el del encabezado) y vuelve a intentarlo.',
        })
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al enviar la prueba')
    } finally {
      setTesting(false)
    }
  }

  const anyOff = isLoading ? false : catalog.some((t) => prefs?.[t.key] === false)

  return (
    <div className="space-y-6">
      {/* --- Tipos de notificación --- */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
            <span className="inline-flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              Tipos de notificaciones
            </span>
            {anyOff && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs"
                onClick={resetAll}
                disabled={savingKey === '__reset'}
              >
                {savingKey === '__reset' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Activar todo
              </Button>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {ROLE_HINT[role]} Los cambios se guardan al instante y afectan tanto a los
            avisos dentro de la app como a las notificaciones de tus dispositivos.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4 sm:p-5">
              {catalog.map((t) => (
                <Skeleton key={t.key} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {catalog.map((t: NotifTypeDef) => {
                const Icon = TYPE_ICONS[t.key] ?? Bell
                const enabled = prefs?.[t.key] !== false
                return (
                  <li
                    key={t.key}
                    className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/40 sm:gap-4 sm:px-5"
                  >
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                        enabled
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                      aria-hidden="true"
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight sm:text-base">
                        {t.label}
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-muted-foreground sm:text-sm">
                        {t.description}
                      </p>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(v) => toggle(t.key, v)}
                      disabled={savingKey === t.key || !prefs}
                      aria-label={`Activar o desactivar: ${t.label}`}
                      className="ml-2 shrink-0"
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* --- Avisos push del dispositivo --- */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4 text-primary" />
            Avisos en tus dispositivos
          </CardTitle>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Las notificaciones push llegan aunque la app esté cerrada (instalada en la
            pantalla de inicio del móvil). Se respetan los tipos que tengas activados
            arriba.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2.5">
          <PushBell role={role} userId={userId} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={sendTest}
            disabled={testing}
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar notificación de prueba
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
