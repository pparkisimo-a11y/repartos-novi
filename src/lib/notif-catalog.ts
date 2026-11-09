/**
 * Catálogo de tipos de notificación por perfil (puro, sin dependencias —
 * seguro para importar tanto en el servidor como en componentes cliente).
 *
 * Cada rol ve en su panel → pestaña "Notificaciones" los tipos de aquí:
 * activar/desactivar un tipo apaga sus avisos en la app (toasts/sonido) Y
 * las notificaciones push del dispositivo.
 */

export type NotifRole = 'admin' | 'driver' | 'restaurant'

export interface NotifTypeDef {
  key: string
  label: string
  description: string
}

export const NOTIF_CATALOG: Record<NotifRole, NotifTypeDef[]> = {
  driver: [
    {
      key: 'new_order',
      label: 'Nuevos pedidos',
      description:
        'Aviso cuando un local te ofrece un reparto — directamente o al tocar la rotación.',
    },
    {
      key: 'sound_alert',
      label: 'Sonido de nuevo pedido',
      description: 'Pitido en la app al recibir un pedido nuevo, además del aviso visual.',
    },
    {
      key: 'order_taken',
      label: 'Me quitan un pedido',
      description:
        'Aviso cuando un súper repartidor se hace cargo de uno de mis pedidos aceptados.',
    },
    {
      key: 'order_cancelled',
      label: 'Pedidos cancelados',
      description: 'Aviso cuando un local cancela un reparto que me afecta.',
    },
  ],
  restaurant: [
    {
      key: 'order_accepted',
      label: 'Pedido aceptado',
      description: 'El repartidor ha aceptado mi solicitud y va de camino al local.',
    },
    {
      key: 'order_picked_up',
      label: 'Pedido recogido',
      description: 'El repartidor ha recogido el pedido en el local.',
    },
    {
      key: 'order_delivered',
      label: 'Pedido entregado',
      description: 'El repartidor ha confirmado la entrega al cliente.',
    },
    {
      key: 'order_rejected',
      label: 'Pedido rechazado',
      description: 'El repartidor no ha podido aceptar mi solicitud.',
    },
    {
      key: 'order_cancelled',
      label: 'Pedido cancelado',
      description: 'El repartidor ha cancelado un reparto que ya había aceptado.',
    },
  ],
  admin: [
    {
      key: 'new_request',
      label: 'Nuevas solicitudes de reparto',
      description: 'Cuando un local pide un reparto para sus clientes.',
    },
    {
      key: 'order_status',
      label: 'Estado de los pedidos',
      description: 'Cuando un repartidor acepta, recoge o entrega un pedido.',
    },
    {
      key: 'new_lead',
      label: 'Nuevos locales interesados',
      description: 'Cuando un local envía el formulario de contacto para unirse.',
    },
  ],
}

/** Claves válidas de un rol. */
export function notifKeys(role: NotifRole): Set<string> {
  return new Set(NOTIF_CATALOG[role].map((t) => t.key))
}
