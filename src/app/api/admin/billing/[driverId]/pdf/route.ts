import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { db } from '@/lib/db'
import { requireAdminFromRequest } from '@/lib/session'
import { getCommissionPct, applyCommission } from '@/lib/settings'

/**
 * PDF de liquidación mensual de UN repartidor — documento formal tipo nómina
 * que el admin puede enviar por WhatsApp o imprimir para justificar el pago.
 *
 *   GET /api/admin/billing/[driverId]/pdf?month=YYYY-MM
 *
 * Contenido: cabecera (repartidor, mes, comisión), desglose día a día de los
 * repartos entregados (hora, restaurante, dirección, distancia, tarifa,
 * comisión y neto) con subtotal por día, y totales del mes.
 */

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 42
const PAGE_W = A4[0]
const PAGE_H = A4[1]
const CONTENT_W = PAGE_W - MARGIN * 2

// Paleta (la misma que la app: emerald para generado, amber para neto)
const INK = rgb(0.10, 0.10, 0.12) // casi negro
const MUTED = rgb(0.45, 0.47, 0.50) // gris
const LINE = rgb(0.87, 0.88, 0.90) // borde suave
const ACCENT = rgb(0.02, 0.47, 0.35) // emerald-700
const ACCENT_SOFT = rgb(0.91, 0.97, 0.94) // emerald muy claro
const AMBER = rgb(0.68, 0.42, 0.04) // amber-700
const HEAD_BG = rgb(0.10, 0.10, 0.12) // cabecera oscura

const round2 = (n: number) => Math.round(n * 100) / 100

function fmtEur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}
function fmtKm(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
}
function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
function fmtDay(d: Date): string {
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}
function fmtTime(d: Date): string {
  return d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}
function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
/** pdf-lib solo soporta WinAnsi: normaliza caracteres fuera de rango. */
function sane(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
}

interface Row {
  deliveredAt: Date
  restaurantName: string
  dropoffAddress: string | null
  distanceKm: number | null
  gross: number
  commission: number
  net: number
}

export async function GET(req: Request, ctx: { params: Promise<{ driverId: string }> }) {
  try {
    await requireAdminFromRequest(req)
    const { driverId } = await ctx.params

    // Mes: YYYY-MM (por defecto el actual)
    const { searchParams } = new URL(req.url)
    const monthParam = searchParams.get('month') || ''
    let year: number
    let month: number
    if (/^\d{4}-\d{2}$/.test(monthParam)) {
      year = Number(monthParam.slice(0, 4))
      month = Number(monthParam.slice(5, 7))
      if (month < 1 || month > 12 || year < 2020 || year > 2100) {
        return NextResponse.json({ error: 'Mes no válido' }, { status: 400 })
      }
    } else {
      const now = new Date()
      year = now.getUTCFullYear()
      month = now.getUTCMonth() + 1
    }
    const from = new Date(Date.UTC(year, month - 1, 1))
    const to = new Date(Date.UTC(year, month, 1))

    const driver = await db.driver.findUnique({
      where: { id: driverId },
      select: { id: true, name: true },
    })
    if (!driver) return NextResponse.json({ error: 'Repartidor no encontrado' }, { status: 404 })

    const commissionPct = await getCommissionPct()

    const deliveries = await db.delivery.findMany({
      where: {
        driverId,
        status: 'DELIVERED',
        deliveredAt: { gte: from, lt: to },
      },
      include: { restaurant: { select: { name: true } } },
      orderBy: { deliveredAt: 'asc' },
    })

    const rows: Row[] = deliveries.map((d) => {
      const gross = d.fee ?? 0
      const net = applyCommission(d.fee, commissionPct) ?? 0
      return {
        deliveredAt: d.deliveredAt as Date,
        restaurantName: d.restaurant.name,
        dropoffAddress: d.dropoffAddress,
        distanceKm: d.distanceKm,
        gross,
        commission: round2(gross - net),
        net,
      }
    })

    // Agrupar por día (UTC, igual que el resto de la liquidación)
    const byDay = new Map<string, Row[]>()
    for (const r of rows) {
      const k = dayKey(r.deliveredAt)
      const arr = byDay.get(k)
      if (arr) arr.push(r)
      else byDay.set(k, [r])
    }

    // ------------------------------------------------------------------
    // Generar el PDF
    // ------------------------------------------------------------------
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

    pdf.setTitle(sane(`Liquidación — ${driver.name} — ${monthLabel(year, month)}`))
    pdf.setCreator('Repartos NOVI')

    let page: PDFPage = pdf.addPage(A4)
    let y = PAGE_H - MARGIN

    const text = (
      s: string,
      x: number,
      yy: number,
      size: number,
      f: PDFFont = font,
      color = INK,
    ) => page.drawText(sane(s), { x, y: yy, size, font: f, color })

    const textRight = (
      s: string,
      xRight: number,
      yy: number,
      size: number,
      f: PDFFont = font,
      color = INK,
    ) => {
      const w = f.widthOfTextAtSize(sane(s), size)
      page.drawText(sane(s), { x: xRight - w, y: yy, size, font: f, color })
    }

    const line = (yy: number, color = LINE, thickness = 0.8) => {
      page.drawLine({
        start: { x: MARGIN, y: yy },
        end: { x: PAGE_W - MARGIN, y: yy },
        thickness,
        color,
      })
    }

    const newPageIfNeeded = (needed: number) => {
      if (y - needed < MARGIN + 30) {
        page = pdf.addPage(A4)
        y = PAGE_H - MARGIN
        return true
      }
      return false
    }

    // --- Cabecera ---
    page.drawRectangle({
      x: MARGIN,
      y: y - 64,
      width: CONTENT_W,
      height: 64,
      color: HEAD_BG,
    })
    text('Repartos NOVI', MARGIN + 16, y - 26, 16, bold, rgb(1, 1, 1))
    text('Liquidación mensual de repartos', MARGIN + 16, y - 44, 10, font, rgb(0.75, 0.78, 0.8))
    textRight(monthLabel(year, month), PAGE_W - MARGIN - 16, y - 26, 12, bold, rgb(1, 1, 1))
    textRight(
      `Comisión de la plataforma: ${commissionPct}%`,
      PAGE_W - MARGIN - 16,
      y - 44,
      9,
      font,
      rgb(0.75, 0.78, 0.8),
    )
    y -= 88

    // Repartidor
    text('Repartidor', MARGIN, y, 9, font, MUTED)
    text(driver.name, MARGIN, y - 16, 16, bold, INK)
    y -= 40

    // --- Resumen (3 cajas: generado / comisión / a recibir) ---
    const boxW = (CONTENT_W - 12 * 2) / 3
    const boxH = 52
    const totals = rows.reduce(
      (acc, r) => ({
        gross: acc.gross + r.gross,
        commission: acc.commission + r.commission,
        net: acc.net + r.net,
      }),
      { gross: 0, commission: 0, net: 0 },
    )
    const boxes: [string, string, ReturnType<typeof rgb>][] = [
      ['Generado', fmtEur(round2(totals.gross)), ACCENT],
      ['Comisión app', fmtEur(round2(totals.commission)), MUTED],
      ['A recibir', fmtEur(round2(totals.net)), AMBER],
    ]
    boxes.forEach(([label, value, color], i) => {
      const x = MARGIN + i * (boxW + 12)
      page.drawRectangle({ x, y: y - boxH, width: boxW, height: boxH, color: ACCENT_SOFT })
      text(label, x + 10, y - 18, 8, font, MUTED)
      text(value, x + 10, y - 36, 14, bold, color)
    })
    y -= boxH + 18

    text(
      `Desglose de ${rows.length} reparto${rows.length === 1 ? '' : 's'} entregado${rows.length === 1 ? '' : 's'} en ${monthLabel(year, month)}:`,
      MARGIN,
      y,
      10,
      bold,
    )
    y -= 20

    // --- Tabla por días ---
    const C = {
      hora: MARGIN + 2,
      rest: MARGIN + 46,
      addr: MARGIN + 156,
      kmR: MARGIN + 330,
      feeR: MARGIN + 398,
      comR: MARGIN + 462,
      netR: PAGE_W - MARGIN - 4,
    }

    const drawDayHeader = (label: string, count: number) => {
      newPageIfNeeded(34)
      page.drawRectangle({
        x: MARGIN,
        y: y - 20,
        width: CONTENT_W,
        height: 20,
        color: ACCENT_SOFT,
      })
      const cap = label.charAt(0).toUpperCase() + label.slice(1)
      text(cap, C.hora, y - 14, 9.5, bold, ACCENT)
      textRight(
        `${count} reparto${count === 1 ? '' : 's'}`,
        PAGE_W - MARGIN - 6,
        y - 14,
        8.5,
        font,
        MUTED,
      )
      y -= 28
    }

    const drawRow = (r: Row) => {
      newPageIfNeeded(30)
      text(fmtTime(r.deliveredAt), C.hora, y, 9, font, MUTED)
      text(r.restaurantName, C.rest, y, 9.5, bold)
      // Dirección truncada al ancho disponible
      const addrMax = C.kmR - C.addr - 34
      let addr = r.dropoffAddress ?? '—'
      while (addr.length > 3 && font.widthOfTextAtSize(addr, 8.5) > addrMax) {
        addr = addr.slice(0, -2)
      }
      if (addr !== (r.dropoffAddress ?? '—')) addr += '...'
      text(addr, C.addr, y, 8.5, font, MUTED)
      if (r.distanceKm != null) textRight(fmtKm(r.distanceKm), C.kmR, y, 8.5, font, MUTED)
      textRight(fmtEur(r.gross), C.feeR, y, 9.5, bold, ACCENT)
      textRight(`-${fmtEur(r.commission)}`, C.comR, y, 8.5, font, MUTED)
      textRight(fmtEur(r.net), C.netR, y, 9.5, bold, AMBER)
      y -= 16
      line(y + 4, LINE, 0.5)
    }

    const drawDaySubtotal = (gross: number, net: number) => {
      newPageIfNeeded(26)
      text('Subtotal del día', C.hora, y, 8.5, font, MUTED)
      textRight(fmtEur(gross), C.feeR, y, 9, bold, ACCENT)
      textRight(fmtEur(net), C.netR, y, 9, bold, AMBER)
      y -= 22
    }

    for (const [, dayRows] of byDay) {
      drawDayHeader(fmtDay(dayRows[0].deliveredAt), dayRows.length)
      for (const r of dayRows) drawRow(r)
      const dayGross = dayRows.reduce((s, r) => s + r.gross, 0)
      const dayNet = dayRows.reduce((s, r) => s + r.net, 0)
      drawDaySubtotal(round2(dayGross), round2(dayNet))
    }

    // --- Totales del mes ---
    if (rows.length === 0) {
      text('Sin repartos entregados este mes.', MARGIN, y, 10, font, MUTED)
      y -= 18
    } else {
      newPageIfNeeded(80)
      y -= 6
      line(y, ACCENT, 1.5)
      y -= 20
      text('Total del mes', MARGIN, y, 11, bold)
      textRight(fmtEur(round2(totals.gross)), C.feeR, y, 11, bold, ACCENT)
      textRight(`-${fmtEur(round2(totals.commission))}`, C.comR, y, 10, font, MUTED)
      textRight(fmtEur(round2(totals.net)), C.netR, y, 11, bold, AMBER)
      y -= 24
      text(
        `${rows.length} reparto${rows.length === 1 ? '' : 's'} · comisión de la plataforma ${commissionPct}% · neto = generado - comisión`,
        MARGIN,
        y,
        8.5,
        font,
        MUTED,
      )
      y -= 16
    }

    // --- Pie: fecha de emisión y paginación ---
    const pages = pdf.getPages()
    const issued = new Date().toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    pages.forEach((p, i) => {
      const footer = `Documento generado automáticamente por Repartos NOVI · ${issued} · Página ${i + 1} de ${pages.length}`
      const w = font.widthOfTextAtSize(sane(footer), 7.5)
      p.drawText(sane(footer), {
        x: (PAGE_W - w) / 2,
        y: MARGIN / 2 + 4,
        size: 7.5,
        font,
        color: MUTED,
      })
    })

    const bytes = await pdf.save()
    const filename = `liquidacion-${driver.name.toLowerCase().replace(/\s+/g, '-')}-${year}-${String(month).padStart(2, '0')}.pdf`
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}
