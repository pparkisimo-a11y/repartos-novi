'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Política de privacidad de Repartos NOVI.
 *
 * El contenido describe los datos que la aplicación trata REALMENTE
 * (cuentas por perfil, pedidos con dirección de entrega, coordenadas,
 * tokens de notificaciones push, cookie técnica de sesión) y los
 * proveedores implicados (Render, Supabase, Mapbox, Google Routes).
 *
 * NOTA: la sección "Responsable" usa el nombre de la marca. Cuando el
 * titular facilite su nombre fiscal, NIF y domicilio, sustituir los
 * valores de RESPONSABLE_* más abajo.
 */

// --- Datos del responsable (completar cuando el titular los facilite) ---
const RESPONSABLE_NAME = 'Repartos NOVI'
const RESPONSABLE_CONTACT = 'el formulario de contacto de esta misma aplicación'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

export function PrivacyPolicyDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Política de privacidad</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pb-2">
          <p className="text-xs text-muted-foreground">
            Última actualización: {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long' })}
          </p>

          <Section title="1. Responsable del tratamiento">
            <p>
              {RESPONSABLE_NAME}, titular y operador de esta aplicación (en adelante, «la
              aplicación»). Para cualquier cuestión sobre el tratamiento de tus datos
              puedes escribir a través de {RESPONSABLE_CONTACT}.
            </p>
          </Section>

          <Section title="2. Qué datos tratamos">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong className="text-foreground">Cuentas de restaurantes:</strong> nombre
                de usuario, nombre del local, dirección y coordenadas, horario de servicio,
                tarifas de reparto acordadas y repartidores asignados.
              </li>
              <li>
                <strong className="text-foreground">Cuentas de repartidores:</strong> nombre
                de usuario, nombre, horario de trabajo y ajustes de notificaciones.
              </li>
              <li>
                <strong className="text-foreground">Cuentas de administración:</strong> nombre
                de usuario y nombre.
              </li>
              <li>
                <strong className="text-foreground">Pedidos de reparto:</strong> nombre del
                cliente final, dirección de entrega y sus coordenadas, distancia, tarifa
                aplicada, estado del pedido y marcas de tiempo (solicitud, aceptación,
                recogida y entrega).
              </li>
              <li>
                <strong className="text-foreground">Notificaciones:</strong> preferencias de
                aviso por tipo y, si activas los avisos push, el token del dispositivo.
              </li>
              <li>
                <strong className="text-foreground">Sesión:</strong> una cookie técnica
                estrictamente necesaria para mantenerte identificado.
              </li>
            </ul>
            <p>
              Las contraseñas se almacenan cifradas (nunca en texto claro) y no tratamos
              datos de carácter especialmente sensible (salud, ideología, etc.).
            </p>
          </Section>

          <Section title="3. Para qué los usamos">
            <p>
              Únicamente para prestar el servicio de gestión de repartos: registrar los
              pedidos que solicitan los locales, ofrecerlos y asignarlos a los repartidores,
              seguir su estado en tiempo real, calcular las liquidaciones y enviarte los
              avisos que hayas activado. No usamos tus datos para publicidad ni perfilado
              comercial.
            </p>
          </Section>

          <Section title="4. Pagos: fuera de la aplicación">
            <p>
              La aplicación <strong className="text-foreground">no gestiona ni procesa
              pagos</strong>. Los cobros y abonos entre los locales y los repartidores se
              realizan directamente entre las partes, fuera de la aplicación. En la app solo
              se registran las tarifas y liquidaciones a efectos de cálculo y histórico.
            </p>
          </Section>

          <Section title="5. Ubicación">
            <p>
              Las coordenadas de recogida y entrega se guardan junto a cada pedido (son
              necesarias para calcular la distancia y la tarifa). La posición GPS del
              repartidor se emplea en su propio dispositivo para mostrar el mapa y la
              navegación hacia el destino; no se almacena un histórico de movimientos.
            </p>
          </Section>

          <Section title="6. Base jurídica">
            <p>
              La ejecución del contrato de prestación del servicio con restaurantes y
              repartidores (art. 6.1.b RGPD) y el interés legítimo para el funcionamiento
              técnico y la seguridad de la aplicación (art. 6.1.f RGPD).
            </p>
          </Section>

          <Section title="7. Quién presta partes del servicio">
            <p>Trabajamos con estos proveedores, que actúan como encargados del tratamiento:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong className="text-foreground">Render</strong> — alojamiento de la aplicación.</li>
              <li><strong className="text-foreground">Supabase</strong> — base de datos, alojada en la UE (Irlanda).</li>
              <li><strong className="text-foreground">Mapbox</strong> — visualización de mapas.</li>
              <li><strong className="text-foreground">Google</strong> — cálculo de rutas.</li>
            </ul>
            <p>No cedemos tus datos a terceros con fines propios de estos.</p>
          </Section>

          <Section title="8. Asignación de repartos">
            <p>
              La oferta de pedidos a los repartidores se realiza de forma automatizada
              según reglas de negocio acordadas (rotación secuencial por repartidor
              disponible). Puedes rechazar un pedido salvo cuando eres el último
              repartidor disponible del turno.
            </p>
          </Section>

          <Section title="9. Cuánto tiempo los conservamos">
            <p>
              Los datos de las cuentas se conservan mientras estas estén activas. El
              histórico de pedidos y liquidaciones se conserva durante los plazos de
              prescripción mercantil y fiscal aplicables y, en todo caso, hasta que
              solicites su supresión cuando ya no sean necesarios.
            </p>
          </Section>

          <Section title="10. Tus derechos">
            <p>
              Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición,
              limitación del tratamiento y portabilidad escribiendo a través de{' '}
              {RESPONSABLE_CONTACT}. También puedes reclamar ante la Agencia Española de
              Protección de Datos (aepd.es).
            </p>
          </Section>

          <Section title="11. Cookies">
            <p>
              Solo utilizamos una cookie técnica de sesión, estrictamente necesaria para
              identificar al usuario conectado. No hay cookies de analítica ni publicidad,
              por eso no verás banner de cookies.
            </p>
          </Section>

          <Section title="12. Cambios en esta política">
            <p>
              Si actualizamos esta política, publicaremos la nueva versión en esta misma
              ventana con la fecha de actualización correspondiente.
            </p>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
