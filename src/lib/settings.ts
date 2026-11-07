/**
 * Ajustes globales de la plataforma.
 *
 * Por ahora el único ajuste es la COMISIÓN por reparto que se lleva el admin:
 * una cantidad fija en € que se descuenta de la tarifa de cada reparto para
 * mostrar a repartidores y restaurantes el importe neto (lo que cobran/lo que
 * pagan) sin la comisión de la plataforma. El admin ve siempre la tarifa real.
 *
 * Se guarda en la tabla Setting (clave-valor). Si no hay fila, la comisión es 0.
 */
import { db } from '@/lib/db'

const COMMISSION_KEY = 'commissionEur'

/** Lee la comisión global por reparto (€). 0 si no se ha configurado. */
export async function getCommissionEur(): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: COMMISSION_KEY } })
  return row?.value ?? 0
}

/** Guarda la comisión global por reparto (€). */
export async function setCommissionEur(value: number): Promise<void> {
  await db.setting.upsert({
    where: { key: COMMISSION_KEY },
    create: { key: COMMISSION_KEY, value },
    update: { value },
  })
}

/** Aplica la comisión a una tarifa: devuelve el importe neto (mínimo 0). */
export function applyCommission(fee: number | null, commissionEur: number): number | null {
  if (fee == null) return null
  return Math.max(0, Math.round((fee - commissionEur) * 100) / 100)
}
