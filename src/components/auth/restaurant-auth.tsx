'use client'

import { useState } from 'react'
import { ArrowLeft, Loader2, Store, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api-client'
import type { AppUser } from '@/lib/types'
import { Logo } from '@/components/brand/logo'

export function RestaurantAuth({
  onSuccess,
  onBack,
}: {
  onSuccess: (user: AppUser) => void
  onBack: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.login(username, password)
      if (res.user) {
        toast.success(`Bienvenido, ${res.user.name}`)
        onSuccess(res.user)
      }
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
      <div className="relative mx-auto flex w-full max-w-md flex-col px-4 py-8 sm:py-12">
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>

        <Logo size="md" className="mb-6" />

        <div className="mb-6 flex items-center gap-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Store className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Acceso restaurante</h1>
            <p className="text-sm text-muted-foreground">
              Inicia sesión para pedir reparto
            </p>
          </div>
        </div>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Usuario</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="tu_usuario"
                  autoCapitalize="none"
                  autoCorrect="off"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-primary text-white hover:bg-primary/90"
                size="lg"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Iniciar sesión
              </Button>
            </form>

            <div className="mt-4 flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 text-primary" />
              <p>
                ¿No tienes cuenta? El repartidor te dará de alta y te entregará
                tus credenciales en persona. Si las has perdido, contáctale para
                que te las reponga.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
