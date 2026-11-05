'use client'

import { useEffect, useState } from 'react'
import { Share, SquarePlus, X } from 'lucide-react'

const DISMISS_KEY = 'novi:hide-ios-install'

/**
 * Aviso de instalación para iPhone: iOS no ofrece un botón "Instalar app"
 * como Android, así que se guía al usuario con los pasos nativos
 * (Compartir → Añadir a pantalla de inicio). Se oculta:
 * - si ya está instalada (modo standalone),
 * - si se cierra manualmente (se recuerda en localStorage),
 * - si el navegador no es Safari (los demás navegadores de iOS no instalan PWAs).
 */
export function InstallIosBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let raf = 0
    try {
      const ua = navigator.userAgent
      const isIOS =
        /iphone|ipad|ipod/i.test(ua) ||
        (ua.includes('Macintosh') && 'ontouchend' in document) // iPadOS se presenta como Mac
      // Chrome/Firefox/Edge/Opera/Google en iOS usan WKWebView y no pueden instalar
      const isThirdPartyIos = /crios|fxios|edgios|opios|opt\/|gsa\//i.test(ua)
      const isStandalone =
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches
      const dismissed = localStorage.getItem(DISMISS_KEY) === '1'

      if (isIOS && !isThirdPartyIos && !isStandalone && !dismissed) {
        raf = requestAnimationFrame(() => setVisible(true))
      }
    } catch {
      /* sin acceso a localStorage/userAgent: no mostrar */
    }
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!visible) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignorar */
    }
    setVisible(false)
  }

  return (
    <div
      role="dialog"
      aria-label="Instalar la aplicación"
      className="fixed inset-x-3 bottom-3 z-[70] sm:left-auto sm:right-3 sm:w-96"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[#161616] p-4 text-white shadow-2xl">
        { }
        <img src="/icons/apple-touch-icon.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Instala Repartos NOVI</p>
          <p className="mt-1 text-xs leading-relaxed text-white/70">
            Toca{' '}
            <Share className="inline h-3.5 w-3.5 -translate-y-px text-white" aria-hidden />{' '}
            <strong className="font-semibold text-white">Compartir</strong> y luego{' '}
            <SquarePlus className="inline h-3.5 w-3.5 -translate-y-px text-white" aria-hidden />{' '}
            <strong className="font-semibold text-white">&ldquo;Añadir a pantalla de inicio&rdquo;</strong>{' '}
            para usarla como una app.
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Cerrar aviso"
          className="-m-1 rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
