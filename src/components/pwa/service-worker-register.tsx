'use client'

import { useEffect } from 'react'

/**
 * Registra el service worker para que la web sea instalable como app
 * (iPhone: "Añadir a pantalla de inicio"; Android: prompt de instalación).
 * Solo en producción: durante el desarrollo evitaría ver los cambios.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* silencioso: la app funciona igualmente sin SW */
      })
    }

    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
      return () => window.removeEventListener('load', register)
    }
  }, [])

  return null
}
