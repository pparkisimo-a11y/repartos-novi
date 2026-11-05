/** Análisis del logo: rango del fondo + bounding box del contenido brillante */
import sharp from 'sharp'

async function main() {
  const { data, info } = await sharp('public/logo-novi.png')
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels } = info
  const px = (x: number, y: number) => {
    const i = (y * W + x) * channels
    return [data[i], data[i + 1], data[i + 2]]
  }
  const luma = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

  // Muestras de fondo: anillo exterior + puntos interiores (esquinas y centros de banda)
  const pts: Array<[string, number, number]> = [
    ['esquina TL', 3, 3], ['esquina TR', W - 4, 3], ['esquina BL', 3, H - 4], ['esquina BR', W - 4, H - 4],
    ['borde top-c', Math.round(W / 2), 3], ['borde bot-c', Math.round(W / 2), H - 4],
    ['borde left-c', 3, Math.round(H / 2)], ['borde right-c', W - 4, Math.round(H / 2)],
    ['inner TL', 25, 40], ['inner TR', W - 25, 40], ['inner center', Math.round(W / 2), Math.round(H * 0.35)],
    ['inner L-mid', 30, Math.round(H * 0.45)], ['inner R-mid', W - 30, Math.round(H * 0.45)],
  ]
  console.log('== Muestras de fondo (RGB / luma) ==')
  for (const [name, x, y] of pts) {
    const c = px(x, y)
    console.log(`${name.padEnd(14)} rgb(${c.join(',')})  luma=${luma(c).toFixed(1)}`)
  }

  // BBox de contenido brillante (luma > 60) por regiones
  let minX = W, maxX = 0, minY = H, maxY = 0
  let riderMaxY = 0 // contenido brillante en la mitad superior
  let textMinY = H // contenido brillante en la banda inferior
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (luma(px(x, y)) > 60) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
        if (y < H * 0.6 && y > riderMaxY) riderMaxY = y
        if (y > H * 0.6 && y < textMinY) textMinY = y
      }
    }
  }
  console.log('\n== BBox contenido brillante ==')
  console.log(`todo:      x ${minX}→${maxX} (de ${W}), y ${minY}→${maxY} (de ${H})`)
  console.log(`rider:     y hasta ${riderMaxY} (${(riderMaxY / H * 100).toFixed(0)}%)`)
  console.log(`texto:     y desde ${textMinY} (${(textMinY / H * 100).toFixed(0)}%)`)
  // Espacio entre rider y texto
  console.log(`hueco entre rider y texto: y ${riderMaxY}→${textMinY}`)
}
main()
