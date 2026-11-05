'use client'

import { useState } from 'react'
import { BellRing, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api-client'
import { usePushNotifications } from '@/hooks/use-push-notifications'

/**
 * Control de avisos push para los paneles:
 * - "Activar avisos" si aún no se pidió permiso (iOS exige un toque del
 *   usuario para mostrar el diálogo del sistema).
 * - "Probar aviso" si ya están activos: envía una notificación de prueba
 *   que llega unos segundos después para poder cerrar la app y verla.
 */
export function PushBell({ role, userId }: { role: 'driver' | 'restaurant'; userId: string }) {
  const { permission, supported, requestAndSubscribe } = usePushNotifications(role, userId)
  const [busy, setBusy] = useState(false)

  // En un navegador normal (Safari sin instalar, sin soporte de push) no se
  // muestra nada: los avisos son una función de la app instalada.
  if (!supported || permission === 'denied') return null

  if (permission === 'default') {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-9 rounded-full border-primary/40 bg-primary/10 px-3.5 text-primary hover:bg-primary/20 hover:text-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            const result = await requestAndSubscribe()
            if (result === 'granted') {
              toast.success('Avisos activados', {
                description: 'Te avisaremos de cada pedido aunque la app esté cerrada.',
              })
            } else {
              toast.info('Avisos no activados', {
                description:
                  'Puedes activarlos otra vez desde Ajustes → NOVI → Notificaciones.',
              })
            }
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
        Activar avisos
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-9 rounded-full px-3.5 text-muted-foreground hover:text-foreground"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const res = await api.pushTest()
          if (res.sent === 0) {
            toast.info('Todavía no hay avisos activos', {
              description:
                'Abre la app en el móvil (icono de la pantalla de inicio), inicia sesión y pulsa "Activar avisos".',
              duration: 8000,
            })
          } else {
            toast.success('Aviso enviado', {
              description:
                'Cierra la app (o bloquea el móvil) y espera unos segundos: la notificación aparecerá en pantalla.',
              duration: 10000,
            })
          }
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : 'Error al enviar el aviso')
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
      Probar aviso
    </Button>
  )
}
