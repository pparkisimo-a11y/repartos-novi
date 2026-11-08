'use client'

import { useState } from 'react'
import { BellRing, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { usePushNotifications } from '@/hooks/use-push-notifications'

/**
 * Control de avisos push para los paneles:
 * - "Activar avisos" si aún no se pidió permiso (iOS exige un toque del
 *   usuario para mostrar el diálogo del sistema).
 * - Una vez concedido el permiso no se muestra nada: el hook mantiene la
 *   suscripción registrada automáticamente en cada visita.
 */
export function PushBell({ role, userId }: { role: 'driver' | 'restaurant' | 'admin'; userId: string }) {
  const { permission, supported, requestAndSubscribe } = usePushNotifications(role, userId)
  const [busy, setBusy] = useState(false)

  // En un navegador normal (Safari sin instalar, sin soporte de push) no se
  // muestra nada: los avisos son una función de la app instalada.
  if (!supported || permission !== 'default') return null

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
