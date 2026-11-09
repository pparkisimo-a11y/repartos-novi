import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { db } from '@/lib/db'
import { requireAdminFromRequest } from '@/lib/session'
import { getCommissionPct, applyCommission } from '@/lib/settings'

/**
 * PDF de liquidación de UN repartidor — documento formal tipo nómina
 * que el admin puede enviar por WhatsApp o imprimir para justificar el pago.
 *
 *   GET /api/admin/billing/[driverId]/pdf?month=YYYY-MM
 *   GET /api/admin/billing/[driverId]/pdf?from=<ISO>&to=<ISO>   (periodo/turno)
 *
 * Contenido: cabecera (repartidor, periodo, comisión), desglose día a día de
 * los repartos entregados (hora, restaurante, dirección, distancia, tarifa,
 * comisión y neto) con subtotal por día, y totales del periodo.
 *
 * Las horas se muestran en hora española (Europe/Madrid) para coincidir con
 * lo que repartidor y admin ven en la app.
 */

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 42
const PAGE_W = A4[0]
const PAGE_H = A4[1]
const CONTENT_W = PAGE_W - MARGIN * 2
/** Límite inferior del contenido (debajo queda el pie de página). */
const BOTTOM = MARGIN + 34

// Paleta (la misma que la app: emerald para generado, amber para neto)
const INK = rgb(0.10, 0.10, 0.12) // casi negro
const MUTED = rgb(0.45, 0.47, 0.50) // gris
const LINE = rgb(0.87, 0.88, 0.90) // borde suave
const LINE_STRONG = rgb(0.72, 0.74, 0.78) // regla bajo cabeceras
const ACCENT = rgb(0.02, 0.47, 0.35) // emerald-700
const ACCENT_SOFT = rgb(0.91, 0.97, 0.94) // emerald muy claro
const AMBER = rgb(0.68, 0.42, 0.04) // amber-700
const HEAD_BG = rgb(0.10, 0.10, 0.12) // cabecera oscura
const SUBTLE_BG = rgb(0.955, 0.965, 0.97) // banda de subtotal

const TZ = 'Europe/Madrid'
const MAX_PERIOD_MS = 366 * 24 * 60 * 60 * 1000

const round2 = (n: number) => Math.round(n * 100) / 100

function fmtEur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}
function fmtKm(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
}
/** YYYY-MM-DD en hora española (agrupa los repartos por día correcto). */
function dayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}
function fmtDay(d: Date): string {
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  })
}
function fmtTime(d: Date): string {
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
}
/** "jue, 12 nov" en hora española. */
function fmtDayShort(d: Date): string {
  return d.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: TZ,
  })
}
/** "jueves, 12 de noviembre" en hora española. */
function fmtDayLong(d: Date): string {
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  })
}
/** Componentes de fecha/hora en hora española: YYYYMMDD-HHmm. */
function madridStamp(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  const hh = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}${get('month')}${get('day')}-${hh}${get('minute')}`
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
    .replace(/\u2192/g, '->')
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

    const { searchParams } = new URL(req.url)
    const monthParam = searchParams.get('month') || ''
    const fromParam = searchParams.get('from') || ''
    const toParam = searchParams.get('to') || ''

    let mode: 'month' | 'custom' = 'month'
    let from: Date
    let to: Date
    let year = 0
    let month = 0 // 1-12

    if (fromParam || toParam) {
      // Periodo personalizado (p. ej. un turno: jue 19:00 → vie 13:00)
      const fromD = new Date(fromParam)
      const toD = new Date(toParam)
      if (
        !fromParam ||
        !toParam ||
        Number.isNaN(fromD.getTime()) ||
        Number.isNaN(toD.getTime())
      ) {
        return NextResponse.json({ error: 'Periodo no válido' }, { status: 400 })
      }
      if (fromD >= toD) {
        return NextResponse.json(
          { error: 'La fecha de inicio debe ser anterior a la de fin' },
          { status: 400 },
        )
      }
      if (toD.getTime() - fromD.getTime() > MAX_PERIOD_MS) {
        return NextResponse.json(
          { error: 'El periodo no puede abarcar más de un año' },
          { status: 400 },
        )
      }
      mode = 'custom'
      from = fromD
      to = toD
    } else if (/^\d{4}-\d{2}$/.test(monthParam)) {
      year = Number(monthParam.slice(0, 4))
      month = Number(monthParam.slice(5, 7))
      if (month < 1 || month > 12 || year < 2020 || year > 2100) {
        return NextResponse.json({ error: 'Mes no válido' }, { status: 400 })
      }
      from = new Date(Date.UTC(year, month - 1, 1))
      to = new Date(Date.UTC(year, month, 1))
    } else {
      const now = new Date()
      year = now.getUTCFullYear()
      month = now.getUTCMonth() + 1
      from = new Date(Date.UTC(year, month - 1, 1))
      to = new Date(Date.UTC(year, month, 1))
    }

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

    // Agrupar por día (hora española, igual que la app)
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

    const periodTitle =
      mode === 'custom'
        ? `${fmtDayShort(from)} ${fmtTime(from)} – ${fmtDayShort(to)} ${fmtTime(to)}`
        : monthLabel(year, month)
    const periodDetail =
      mode === 'custom'
        ? `Del ${fmtDayLong(from)} a las ${fmtTime(from)} al ${fmtDayLong(to)} a las ${fmtTime(to)} (hora española)`
        : `Mes de ${monthLabel(year, month)}`

    pdf.setTitle(sane(`Liquidación — ${driver.name} — ${periodTitle}`))
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

    /** Nueva página cuando no quede espacio; devuelve true si cambió. */
    const breakPage = (needed: number): boolean => {
      if (y - needed < BOTTOM) {
        page = pdf.addPage(A4)
        y = PAGE_H - MARGIN
        return true
      }
      return false
    }

    // --- Cabecera del documento ---
    page.drawRectangle({
      x: MARGIN,
      y: y - 64,
      width: CONTENT_W,
      height: 64,
      color: HEAD_BG,
    })
    text('Repartos NOVI', MARGIN + 16, y - 26, 16, bold, rgb(1, 1, 1))
    text('Liquidación de repartos', MARGIN + 16, y - 44, 10, font, rgb(0.75, 0.78, 0.8))
    if (mode === 'custom') {
      textRight('Periodo personalizado', PAGE_W - MARGIN - 16, y - 26, 11, bold, rgb(1, 1, 1))
      textRight(
        `${fmtDayShort(from)} ${fmtTime(from)} – ${fmtDayShort(to)} ${fmtTime(to)}`,
        PAGE_W - MARGIN - 16,
        y - 44,
        8.5,
        font,
        rgb(0.75, 0.78, 0.8),
      )
    } else {
      const cap = monthLabel(year, month)
      textRight(cap.charAt(0).toUpperCase() + cap.slice(1), PAGE_W - MARGIN - 16, y - 26, 12, bold, rgb(1, 1, 1))
      textRight(
        `Comisión de la plataforma: ${commissionPct}%`,
        PAGE_W - MARGIN - 16,
        y - 44,
        9,
        font,
        rgb(0.75, 0.78, 0.8),
      )
    }
    y -= 88

    // Repartidor + periodo
    text('Repartidor', MARGIN, y, 9, font, MUTED)
    text(driver.name, MARGIN, y - 16, 16, bold, INK)
    y -= 32
    text(periodDetail, MARGIN, y, 9, font, MUTED)
    y -= 24

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
      ['Comisión app', fmtEur(round2(totals.commission)), INK],
      ['A recibir', fmtEur(round2(totals.net)), AMBER],
    ]
    boxes.forEach(([label, value, color], i) => {
      const x = MARGIN + i * (boxW + 12)
      page.drawRectangle({ x, y: y - boxH, width: boxW, height: boxH, color: ACCENT_SOFT })
      text(label, x + 10, y - 18, 8, font, MUTED)
      text(value, x + 10, y - 36, 14, bold, color)
    })
    y -= boxH + 18

    const rangeText =
      mode === 'custom' ? 'durante el periodo seleccionado' : `en ${monthLabel(year, month)}`
    text(
      `Desglose de ${rows.length} reparto${rows.length === 1 ? '' : 's'} entregado${rows.length === 1 ? '' : 's'} ${rangeText}:`,
      MARGIN,
      y,
      10,
      bold,
    )
    y -= 20

    // --- Tabla por días ---
    // Columnas numéricas alineadas a la derecha con separación uniforme
    const C = {
      hora: MARGIN + 2,
      rest: MARGIN + 50,
      addr: MARGIN + 156,
      kmR: MARGIN + 331, // derecha "2,4 km"
      feeR: MARGIN + 385, // derecha tarifa
      comR: MARGIN + 443, // derecha comisión
      netR: PAGE_W - MARGIN - 10, // derecha neto
    }

    /** Fila de cabecera con las etiquetas de columna. */
    const drawColHeader = () => {
      text('HORA', C.hora, y, 7, bold, MUTED)
      text('RESTAURANTE', C.rest, y, 7, bold, MUTED)
      text('DIRECCIÓN', C.addr, y, 7, bold, MUTED)
      textRight('KM', C.kmR, y, 7, bold, MUTED)
      textRight('TARIFA', C.feeR, y, 7, bold, MUTED)
      textRight('COMISIÓN', C.comR, y, 7, bold, MUTED)
      textRight('NETO', C.netR, y, 7, bold, MUTED)
      line(y - 4, LINE_STRONG, 0.8)
      y -= 20
    }

    const drawDayHeader = (label: string, count: number) => {
      const cap = label.charAt(0).toUpperCase() + label.slice(1)
      page.drawRectangle({
        x: MARGIN,
        y: y - 17,
        width: CONTENT_W,
        height: 17,
        color: ACCENT_SOFT,
      })
      text(cap, C.hora, y - 12, 9.5, bold, ACCENT)
      textRight(
        `${count} reparto${count === 1 ? '' : 's'}`,
        PAGE_W - MARGIN - 12,
        y - 12,
        8.5,
        font,
        MUTED,
      )
      y -= 17 + 9 // primera fila 9pt por debajo de la banda
    }

    /** Acorta un texto con "..." final para que quepa en maxPt puntos.
     *  (Se mide con los puntos incluidos para nunca pasarse del límite.) */
    const fitText = (s: string, maxPt: number, size: number, f: PDFFont): string => {
      if (f.widthOfTextAtSize(sane(s), size) <= maxPt) return s
      let out = s
      while (out.length > 3 && f.widthOfTextAtSize(sane(out) + '...', size) > maxPt) {
        out = out.slice(0, -1)
      }
      return out.trimEnd() + '...'
    }

    const drawRow = (r: Row) => {
      text(fmtTime(r.deliveredAt), C.hora, y, 9, font, MUTED)
      // Restaurante: nunca puede invadir la columna DIRECCIÓN
      text(fitText(r.restaurantName, C.addr - C.rest - 10, 9.5, bold), C.rest, y, 9.5, bold)
      // Dirección: se recorta al hueco REAL que deja el texto de KM en esta
      // fila (KM se alinea a la derecha, así que su borde izquierdo varía —
      // medirlo evita que una dirección larga se meta dentro de los km).
      const kmText = r.distanceKm != null ? fmtKm(r.distanceKm) : null
      const kmW = kmText ? font.widthOfTextAtSize(sane(kmText), 8.5) : 0
      const addrMaxRow = C.kmR - kmW - 12 - C.addr
      text(fitText(r.dropoffAddress ?? '—', addrMaxRow, 8.5, font), C.addr, y, 8.5, font, MUTED)
      if (kmText) textRight(kmText, C.kmR, y, 8.5, font, MUTED)
      textRight(fmtEur(r.gross), C.feeR, y, 9.5, bold, ACCENT)
      textRight(`-${fmtEur(r.commission)}`, C.comR, y, 8.5, font, MUTED)
      textRight(fmtEur(r.net), C.netR, y, 9.5, bold, AMBER)
      y -= 19
    }

    /** Banda de subtotal del día (separa del listado de arriba). */
    const drawDaySubtotal = (gross: number, net: number) => {
      const bandTop = y + 4
      const bandBottom = bandTop - 15
      page.drawRectangle({
        x: MARGIN,
        y: bandBottom,
        width: CONTENT_W,
        height: 15,
        color: SUBTLE_BG,
      })
      text('Subtotal del día', C.hora, bandBottom + 4.5, 8.5, bold, MUTED)
      textRight(fmtEur(gross), C.feeR, bandBottom + 4.5, 9, bold, ACCENT)
      textRight(fmtEur(net), C.netR, bandBottom + 4.5, 9, bold, AMBER)
      y = bandBottom - 13
    }

    if (rows.length === 0) {
      text(
        mode === 'custom' ? 'Sin repartos entregados en este periodo.' : 'Sin repartos entregados este mes.',
        MARGIN,
        y,
        10,
        font,
        MUTED,
      )
      y -= 18
    } else {
      drawColHeader()
      for (const [, dayRows] of byDay) {
        // Cabecera del día: banda + hueco + primera fila + subtotal
        if (breakPage(72)) drawColHeader()
        drawDayHeader(fmtDay(dayRows[0].deliveredAt), dayRows.length)
        dayRows.forEach((r, i) => {
          if (breakPage(28)) {
            drawColHeader()
          } else if (i > 0) {
            // Separador ENTRE filas: nunca cruza el texto de arriba ni de abajo
            line(y + 9, LINE, 0.5)
          }
          drawRow(r)
        })
        if (breakPage(30)) drawColHeader()
        const dayGross = dayRows.reduce((s, r) => s + r.gross, 0)
        const dayNet = dayRows.reduce((s, r) => s + r.net, 0)
        drawDaySubtotal(round2(dayGross), round2(dayNet))
      }

      // --- Totales del periodo ---
      // (la regla verde queda a la misma distancia del subtotal de arriba
      // que las cabeceras de día, para mantener el ritmo vertical)
      breakPage(80)
      line(y, ACCENT, 1.5)
      y -= 20
      text(mode === 'custom' ? 'Total del periodo' : 'Total del mes', MARGIN, y, 11, bold)
      textRight(fmtEur(round2(totals.gross)), C.feeR, y, 11, bold, ACCENT)
      textRight(`-${fmtEur(round2(totals.commission))}`, C.comR, y, 10, font, MUTED)
      textRight(fmtEur(round2(totals.net)), C.netR, y, 11, bold, AMBER)
      y -= 16
      text(
        `${rows.length} reparto${rows.length === 1 ? '' : 's'} · comisión de la plataforma ${commissionPct}% · neto = generado - comisión`,
        MARGIN,
        y,
        8.5,
        font,
        MUTED,
      )
      y -= 12
    }

    // --- Pie: fecha de emisión y paginación ---
    const pages = pdf.getPages()
    const issued = new Date().toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: TZ,
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

    const slug = driver.name.toLowerCase().replace(/\s+/g, '-')
    const filename =
      mode === 'custom'
        ? `liquidacion-${slug}-${madridStamp(from)}_${madridStamp(to)}.pdf`
        : `liquidacion-${slug}-${year}-${String(month).padStart(2, '0')}.pdf`
    const bytes = await pdf.save()
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
