'use client'

import { signIn } from "next-auth/react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      toast.error("Email ou senha incorretos")
      setLoading(false)
    } else {
      toast.success("Login realizado!")
      router.push("/dashboard")
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="grid min-h-screen md:grid-cols-2">
        {/* Coluna esquerda: visual */}
        <div className="relative hidden md:block bg-muted">
          <div className="absolute inset-0">
            <img
              src="/login/hero.svg"
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-br from-background/10 via-transparent to-background/10" />
          </div>
        </div>

        {/* Coluna direita: formulário */}
        <div className="relative flex items-center justify-center p-6 md:p-10">
          <div className="w-full max-w-md">
            <div className="mb-6 text-center">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Bem-vindo de volta
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Acompanhe seus leads, atribuição e conversas do WhatsApp em um só lugar.
              </p>
            </div>

            <Card className="p-6 md:p-8">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="seu@email.com"
                    required
                    autoComplete="email"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Senha
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>

                <div className="text-center text-xs text-muted-foreground">
                  Ao entrar, você concorda com as políticas internas do sistema.
                </div>
              </form>
            </Card>

          </div>
          <div className="absolute bottom-6 text-xs text-muted-foreground">
            © 2026 midify • WhatsApp Attribution Hub
          </div>
          </div>
        </div>
      </div>
  )
}