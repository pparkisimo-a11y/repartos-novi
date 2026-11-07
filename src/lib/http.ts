/**
 * Fetch a servicios externos con REINTENTO.
 *
 * En entornos con IPv6 roto (como algunos sandboxes/VPNs) las peticiones a
 * hosts dual-stack fallan aleatoriamente con `AggregateError` cuando el
 * runtime elige la dirección IPv6. Reintentar la conexión resuelve el
 * problema en la práctica: el siguiente intento suele ir por IPv4.
 *
 * Solo se usa para servicios externos tolerantes a un reintento (OSRM,
 * Nominatim, Photon). Las API propias nunca lo necesitan.
 */

export async function fetchWithRetry(
  url: string | URL,
  init?: RequestInit,
  opts: { attempts?: number; retryDelayMs?: number } = {},
): Promise<Response> {
  const attempts = Math.max(1, opts.attempts ?? 2)
  const delay = opts.retryDelayMs ?? 250

  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, { ...init, cache: 'no-store' })
    } catch (e) {
      lastError = e
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}
