"use client"

import { useState } from "react"
import { Eye, EyeOff, Loader2 } from "lucide-react"

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

type ProfileFormData = {
  firstName: string
  lastName: string
  nickname: string
  email: string
  phone: string
  birthDate: string
}

type ProfileFormProps = {
  initialData: ProfileFormData
}

export default function ProfileForm({ initialData }: ProfileFormProps) {
  const [form, setForm] = useState<ProfileFormData>(initialData)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleChange = (field: keyof ProfileFormData) => {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }))
    }
  }

  const handleSave = async () => {
    setError(null)
    setMessage(null)

    if (password || confirm) {
      if (password.length < 6) {
        setError("A senha deve ter ao menos 6 caracteres.")
        return
      }
      if (password !== confirm) {
        setError("Senha e confirmacao nao conferem.")
        return
      }
    }

    setIsSaving(true)

    const payload: Record<string, string | null | undefined> = {
      firstName: form.firstName,
      lastName: form.lastName,
      nickname: form.nickname,
      email: form.email,
      phone: form.phone,
      birthDate: form.birthDate,
    }

    if (password) {
      payload.password = password
    }

    const response = await fetch("/api/users/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok || !data?.ok) {
      setError(data?.message ?? "Nao foi possivel atualizar o perfil.")
      setIsSaving(false)
      return
    }

    setMessage(data?.data?.message ?? "Perfil atualizado com sucesso.")
    setPassword("")
    setConfirm("")
    setIsSaving(false)
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Editar perfil</CardTitle>
          <CardDescription>Atualize suas informacoes basicas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              value={form.firstName}
              onChange={handleChange("firstName")}
              placeholder="Rodolfo"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sobrenome">Sobrenome</Label>
            <Input
              id="sobrenome"
              value={form.lastName}
              onChange={handleChange("lastName")}
              placeholder="Lelis"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apelido">Apelido</Label>
            <Input
              id="apelido"
              value={form.nickname}
              onChange={handleChange("nickname")}
              placeholder="Rodo"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={handleChange("email")}
              placeholder="rodolfo@tcc.com.br"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="celular">Celular</Label>
            <Input
              id="celular"
              value={form.phone}
              onChange={handleChange("phone")}
              placeholder="(11) 99999-0000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nascimento">Data de nascimento</Label>
            <Input
              id="nascimento"
              type="date"
              value={form.birthDate}
              onChange={handleChange("birthDate")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Senha</CardTitle>
          <CardDescription>Deixe em branco se nao quiser alterar.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nova-senha">Nova senha</Label>
            <div className="relative">
              <Input
                id="nova-senha"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmar-senha">Confirmar senha</Label>
            <div className="relative">
              <Input
                id="confirmar-senha"
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowConfirm((prev) => !prev)}
                aria-label={showConfirm ? "Ocultar senha" : "Mostrar senha"}
              >
                {showConfirm ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center sm:justify-end">
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
        <Button
          type="button"
          className="bg-success text-success-foreground hover:bg-success/90"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Salvando...
            </span>
          ) : (
            "Salvar"
          )}
        </Button>
      </div>
    </div>
  )
}
