/**
 * Genera todos los assets de marca PWA a partir del logo oficial:
 *   public/logo-novi.png   (logo completo: repartidor + "Repartos NOVI", fondo #1A1A1A)
 *
 * Salidas:
 *   public/icons/apple-touch-icon.png   180x180  (icono "Añadir a inicio" en iPhone)
 *   public/icons/icon-192.png / icon-512.png      (manifest, Android/escritorio)
 *   public/icons/icon-maskable-192/512.png        (iconos adaptativos Android)
 *   public/favicon-32.png                         (pestaña del navegador)
 *   public/logo-rider.png                         (recorte del repartidor, chips de la UI)
 *   public/splash/apple-splash-*.png              (pantallas de arranque iPhone)
 *
 * Uso: bun scripts/generate-brand-assets.ts
 */
import sharp from 'sharp'
import { mkdirSync, copyFileSync } from 'fs'

const SRC_FULL = 'public/logo-novi.png'
const DARK = '#1A1A1A'

// [ancho_px, alto_px, dpr] — iPhones habituales (SE → 16 Pro Max)
const SPLASHES: Array<[number, number, number]> = [
  [640, 1136, 2],
  [750, 1334, 2],
  [828, 1792, 2],
  [1125, 2436, 3],
  [1170, 2532, 3],
  [1179, 2556, 3],
  [1206, 2622, 3],
  [1242, 2688, 3],
  [1284, 2778, 3],
  [1290, 2796, 3],
  [1320, 2868, 3],
]

async function main() {
  mkdirSync('public/icons', { recursive: true })
  mkdirSync('public/splash', { recursive: true })

  const meta = await sharp(SRC_FULL).metadata()
  const W = meta.width!
  const H = meta.height!
  console.log(`Logo origen: ${W}x${H}`)

  // Color real de la esquina (para que chips/splash coincidan exactamente)
  const { data } = await sharp(SRC_FULL)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const i = 2 * meta.channels! // píxel (2,2)
  const hex =
    '#' +
    [data[i], data[i + 1], data[i + 2]]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  console.log(`Color de fondo detectado: ${hex}`)
  const BG = { r: data[i], g: data[i + 1], b: data[i + 2], alpha: 1 }

  // --- Cuadrar el logo (206x205 → 205x205) ---
  const side = Math.min(W, H)
  const square = sharp(SRC_FULL).extract({
    left: Math.floor((W - side) / 2),
    top: Math.floor((H - side) / 2),
    width: side,
    height: side,
  })

  // --- Icono iOS "Añadir a pantalla de inicio" (iOS redondea solo) ---
  await square.clone().resize(180, 180, { kernel: 'lanczos3' }).png().toFile('public/icons/apple-touch-icon.png')
  console.log('✓ icons/apple-touch-icon.png (180)')

  // --- Iconos manifest ---
  await square.clone().resize(192, 192, { kernel: 'lanczos3' }).png().toFile('public/icons/icon-192.png')
  await square.clone().resize(512, 512, { kernel: 'lanczos3' }).png().toFile('public/icons/icon-512.png')
  console.log('✓ icons/icon-192.png, icon-512.png')

  // --- Iconos maskable (logo al 76%, zona segura circular Android) ---
  for (const size of [192, 512]) {
    const inner = Math.round(size * 0.76)
    const logo = await square.clone().resize(inner, inner, { kernel: 'lanczos3' }).png().toBuffer()
    await sharp({
      create: { width: size, height: size, channels: 4, background: BG },
    })
      .composite([{ input: logo, gravity: 'center' }])
      .png()
      .toFile(`public/icons/icon-maskable-${size}.png`)
  }
  console.log('✓ icons/icon-maskable-192.png, icon-maskable-512.png')

  // --- Recorte del repartidor (para chips de la UI) ---
  // Análisis de píxeles: contenido brillante x 12→181 (líneas de velocidad se
  // desvanecen hacia el borde izquierdo), repartidor y 25→122, texto desde y 124.
  // Recorte: ancho completo (las líneas sangran de forma natural por la izquierda)
  // y por debajo justo antes del texto.
  const rider = sharp(SRC_FULL).extract({
    left: 0,
    top: 16,
    width: W,
    height: 107, // y 16→123, el texto empieza en y=124
  })
  await rider.clone().png().toFile('public/logo-rider.png')
  console.log('✓ logo-rider.png (recorte del repartidor)')

  // --- Favicon 32px (fondo oscuro + repartidor centrado) ---
  const riderBuf = await rider.clone().resize(26, 26, { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer()
  const riderMeta = await sharp(riderBuf).metadata()
  await sharp({ create: { width: 32, height: 32, channels: 4, background: BG } })
    .composite([
      {
        input: riderBuf,
        left: Math.round((32 - riderMeta.width!) / 2),
        top: Math.round((32 - riderMeta.height!) / 2),
      },
    ])
    .png()
    .toFile('public/favicon-32.png')
  console.log('✓ favicon-32.png')

  // --- Splash screens iPhone (fondo oscuro + logo centrado, algo elevado) ---
  for (const [w, h] of SPLASHES) {
    const logoSize = Math.round(Math.min(w, h) * 0.42)
    const logoBuf = await square.clone().resize(logoSize, logoSize, { kernel: 'lanczos3' }).png().toBuffer()
    const top = Math.round(h * 0.42 - logoSize / 2)
    await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
      .composite([{ input: logoBuf, left: Math.round((w - logoSize) / 2), top }])
      .png({ compressionLevel: 9 })
      .toFile(`public/splash/apple-splash-${w}-${h}.png`)
  }
  console.log(`✓ splash/apple-splash-*.png (${SPLASHES.length} tamaños)`)
  console.log('Listo.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
