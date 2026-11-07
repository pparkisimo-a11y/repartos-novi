/**
 * Ajustes globales de la plataforma.
 *
 * Por ahora el único ajuste es la COMISIÓN por reparto que se lleva el admin:
 * un PORCENTAJE de la tarifa que se descuenta para mostrar a los repartidores
 * el importe neto (lo que cobran). El admin y el restaurante ven siempre la
 * tarifa real (lo que cobra la plataforma / lo que paga el local).
 *
 * Se guarda en la tabla Setting (clave-valor). Si no hay fila, el porcentaje
 * es 0.
 */
import { db } from '@/lib/db'

const COMMISSION_KEY = 'commissionPct'

/** Lee la comisión global por reparto (%). 0 si no se ha configurado. */
export async function getCommissionPct(): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: COMMISSION_KEY } })
  return row?.value ?? 0
}

/** Guarda la comisión global por reparto (%). */
export async function setCommissionPct(value: number): Promise<void> {
  await db.setting.upsert({
    where: { key: COMMISSION_KEY },
    create: { key: COMMISSION_KEY, value },
    update: { value },
  })
}

/** Aplica la comisión porcentual a una tarifa: devuelve el importe neto (mínimo 0). */
export function applyCommission(fee: number | null, commissionPct: number): number | null {
  if (fee == null) return null
  return Math.max(0, Math.round((fee * (1 - commissionPct / 100)) * 100) / 100)
}
