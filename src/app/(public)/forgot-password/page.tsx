"use client"

import { useState } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    const response = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok || !payload?.ok) {
      setError(payload?.message ?? "Nao foi possivel enviar.")
      setLoading(false)
      return
    }

    setMessage(payload.data?.message ?? "Se o e-mail existir, enviaremos as instrucoes.")
    setLoading(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Esqueceu a senha?</CardTitle>
          <CardDescription>
            Envie seu e-mail para receber as instruções de acesso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="recovery-email">E-mail</Label>
              <Input
                id="recovery-email"
                type="email"
                placeholder="voce@tcc.com.br"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="text-sm text-success" role="status">
                {message}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Enviando..." : "Continuar"}
            </Button>
            <Link
              href="/login"
              className="block text-center text-sm font-medium text-primary hover:text-primary/80"
            >
              Voltar para o login
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
