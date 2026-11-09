'use client'

import { useQuery } from '@tanstack/react-query'
import { api, type NotifPrefs } from '@/lib/api-client'
import type { AppUser } from '@/lib/types'

/**
 * Preferencias de notificación del usuario logueado (una sola consulta
 * compartida por el dashboard y el apartado "Notificaciones").
 *
 * `prefs` es undefined mientras carga; en los handlers de socket se usa el
 * patrón `prefs?.clave !== false`, que trata "aún no cargado" como ACTIVADO
 * (mejor un aviso de más que uno perdido).
 */
export function useNotifPrefs(user: AppUser | null) {
  const { data, isLoading } = useQuery({
    queryKey: ['notif-prefs', user?.role, user?.id],
    queryFn: () => api.getNotifPrefs(),
    enabled: !!user,
    staleTime: 30_000,
  })

  const prefs: NotifPrefs | undefined = data?.prefs
  return { prefs, isLoading }
}
