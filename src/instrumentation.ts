/**
 * Se ejecuta UNA vez al arrancar el servidor de Next.js.
 *
 * 1. Preferir IPv4 en las conexiones salientes (fetch a servicios externos):
 *    hay entornos (sandboxes, algunas VPNs/clouds) con IPv6 roto donde los
 *    hosts dual-stack fallan aleatoriamente con `AggregateError` cuando el
 *    runtime elige la dirección IPv6 (p. ej. router.project-osrm.org). Con
 *    ipv4first las conexiones van primero por IPv4, que siempre está
 *    disponible. Es solo un orden de preferencia: si solo hubiera IPv6, se
 *    seguiría usando.
 *
 * 2. Calentar las conexiones a los servicios de mapas (OSRM/Photon): así la
 *    primera petición real de un repartidor no paga la resolución DNS ni el
 *    primer handshake TLS, que es cuando más fallan.
 */
const MAP_WARMUP_URLS = [
  // Ruta mínima de 1 m — solo para abrir la conexión
  'https://router.project-osrm.org/route/v1/driving/-3.7038,40.4168;-3.70381,40.41681?overview=false',
  'https://photon.komoot.io/api/?q=m&limit=1',
]

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const dns = await import('node:dns')
    // @ts-expect-error - existe en Node 18.17+/20+
    dns.setDefaultResultOrder?.('ipv4first')

    // Warm-up fire-and-forget: no bloquea el arranque del servidor
    for (const url of MAP_WARMUP_URLS) {
      fetch(url, {
        headers: { 'User-Agent': 'RepartosNOVI/1.0 (repartos.novi@gmail.com)' },
        signal: AbortSignal.timeout(8000),
      })
        .then((res) => res.body?.cancel())
        .catch(() => {})
    }
  }
}
