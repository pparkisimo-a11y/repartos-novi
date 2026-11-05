'use client'

import { useState } from 'react'
import { ArrowLeft, Bike, CheckCircle2, Loader2, Phone, Send, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api-client'
import { Logo } from '@/components/brand/logo'

export function ContactForm() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [restaurantName, setRestaurantName] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  // Honeypot (hidden from humans)
  const [website, setWebsite] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await api.submitLead({
        restaurantName,
        contactName: contactName || undefined,
        phone,
        message: message || undefined,
        website,
      })
      setSent(true)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Error inesperado'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />

      <div
        className="relative mx-auto flex w-full max-w-lg flex-col px-4 py-10 sm:py-14"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 2.5rem)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 2.5rem)',
        }}
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo variant="full" size="lg" className="mb-4" />
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            ¿Tienes un local y necesitas reparto?
          </h1>
          <p className="mt-2 text-muted-foreground">
            Déjanos tus datos y te contactamos para contarte las condiciones del
            servicio de reparto nocturno. Sin compromiso.
          </p>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Store, text: 'Un solo botón para pedir reparto' },
            { icon: Bike, text: 'Repartidor dedicado en horario nocturno' },
            { icon: Phone, text: 'Trato directo y condiciones claras' },
          ].map((f, i) => {
            const Icon = f.icon
            return (
              <div
                key={i}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="text-xs text-muted-foreground">{f.text}</p>
              </div>
            )
          })}
        </div>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            {sent ? (
              <div className="flex flex-col items-center py-10 text-center">
                <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-8 w-8" />
                </span>
                <h2 className="text-xl font-bold">¡Solicitud enviada!</h2>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  Gracias por tu interés. El repartidor se pondrá en contacto
                  contigo pronto por teléfono para hablar de condiciones y
                  horarios.
                </p>
                <Button
                  variant="outline"
                  className="mt-6"
                  onClick={() => {
                    setSent(false)
                    setRestaurantName('')
                    setContactName('')
                    setPhone('')
                    setMessage('')
                  }}
                >
                  Enviar otra solicitud
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="lf-name">Nombre del local *</Label>
                  <Input
                    id="lf-name"
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    placeholder="Ej. Kebab Mediterráneo"
                    autoCapitalize="sentences"
                    autoComplete="organization"
                    className="h-11 text-base"
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="lf-contact">Persona de contacto</Label>
                    <Input
                      id="lf-contact"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Tu nombre"
                      autoComplete="name"
                      className="h-11 text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lf-phone">Teléfono / WhatsApp *</Label>
                    <Input
                      id="lf-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="600 123 456"
                      autoComplete="tel"
                      inputMode="tel"
                      className="h-11 text-base"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lf-message">¿Qué necesitas?</Label>
                  <Textarea
                    id="lf-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Cuéntanos horario de cierre, volumen aproximado de pedidos, zona…"
                    rows={4}
                  />
                </div>

                {/* Honeypot: invisible para humanos */}
                <input
                  type="text"
                  name="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="hidden"
                />

                <Button
                  type="submit"
                  className="w-full bg-primary text-white hover:bg-primary/90"
                  size="lg"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Enviar solicitud
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Al enviar aceptas que te contactemos por teléfono o WhatsApp
                  sobre el servicio de reparto.
                </p>
              </form>
            )}
          </CardContent>
        </Card>

        <a
          href="/"
          className="mt-6 inline-flex items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al inicio
        </a>
      </div>
    </div>
  )
}
