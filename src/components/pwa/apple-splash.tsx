/**
 * Pantallas de arranque nativas para iPhone (modo app instalada).
 * Cada <link> coincide con un tamaño exacto de pantalla mediante media queries
 * (device-width/height en px CSS + densidad de píxeles). React 19 los sube al <head>.
 * Los PNG los genera `scripts/generate-brand-assets.ts`.
 */
const SPLASHES: Array<{ file: string; w: number; h: number; dpr: number }> = [
  { file: 'apple-splash-640-1136', w: 640, h: 1136, dpr: 2 }, // iPhone SE 1ª gen
  { file: 'apple-splash-750-1334', w: 750, h: 1334, dpr: 2 }, // 6/7/8, SE 2/3
  { file: 'apple-splash-828-1792', w: 828, h: 1792, dpr: 2 }, // XR / 11
  { file: 'apple-splash-1125-2436', w: 1125, h: 2436, dpr: 3 }, // X / XS / 11 Pro / 12 mini
  { file: 'apple-splash-1170-2532', w: 1170, h: 2532, dpr: 3 }, // 12 / 13 / 14 / 15
  { file: 'apple-splash-1179-2556', w: 1179, h: 2556, dpr: 3 }, // 14 Pro / 15 / 16
  { file: 'apple-splash-1206-2622', w: 1206, h: 2622, dpr: 3 }, // 16 Pro / 17
  { file: 'apple-splash-1242-2688', w: 1242, h: 2688, dpr: 3 }, // XS Max / 11 Pro Max
  { file: 'apple-splash-1284-2778', w: 1284, h: 2778, dpr: 3 }, // 12 / 13 Pro Max
  { file: 'apple-splash-1290-2796', w: 1290, h: 2796, dpr: 3 }, // 14/15/16 Plus y Pro Max
  { file: 'apple-splash-1320-2868', w: 1320, h: 2868, dpr: 3 }, // 16 Pro Max / 17 Pro Max
]

export function AppleSplashScreens() {
  return (
    <>
      {SPLASHES.map(({ file, w, h, dpr }) => (
        <link
          key={file}
          rel="apple-touch-startup-image"
          media={`screen and (device-width: ${w / dpr}px) and (device-height: ${h / dpr}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`}
          href={`/splash/${file}.png`}
        />
      ))}
    </>
  )
}
