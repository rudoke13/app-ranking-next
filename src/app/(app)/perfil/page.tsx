import SectionTitle from "@/components/app/SectionTitle"
import AvatarUploader from "@/components/profile/AvatarUploader"
import { Badge } from "@/components/ui/badge"
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
import { Separator } from "@/components/ui/separator"
import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"

const formatDateInput = (value?: Date | null) =>
  value ? value.toISOString().split("T")[0] : ""

const formatDateDisplay = (value?: Date | null) =>
  value ? value.toLocaleDateString("pt-BR") : "12/07/1994"

export default async function PerfilPage() {
  const session = await getSessionFromCookies()
  const userId = session?.userId ? Number(session.userId) : null
  const hasValidUserId = typeof userId === "number" && Number.isFinite(userId)
  const user = hasValidUserId
    ? await db.users.findUnique({ where: { id: userId } })
    : null

  const fullName = user
    ? `${user.first_name} ${user.last_name}`.trim() ||
      session?.name ||
      "Rodolfo Lelis"
    : session?.name ?? "Rodolfo Lelis"
  const nickname = user?.nickname ?? "Rodo"
  const email = user?.email ?? "rodolfo@tcc.com.br"
  const phone = user?.phone ?? "(11) 99999-0000"
  const birthDateLabel = formatDateDisplay(user?.birth_date ?? null)
  const birthDateValue = formatDateInput(user?.birth_date ?? null)
  const roleLabel = session?.role === "admin" ? "Admin" : "Atleta"

  return (
    <div className="space-y-8">
      <SectionTitle title="Perfil" subtitle="Dados pessoais e preferencias" />

      <Card>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-4">
              <AvatarUploader name={fullName} avatarUrl={user?.avatarUrl ?? null} />
              <div className="space-y-1">
                <p className="text-lg font-semibold text-foreground">
                  {fullName}
                </p>
                <p className="text-sm text-muted-foreground">
                  Apelido: {nickname}
                </p>
                <p className="text-sm text-muted-foreground">
                  Funcao: {roleLabel}
                </p>
              </div>
            </div>
            <div className="grid gap-2 text-sm text-muted-foreground sm:text-right">
              <span>E-mail: {email}</span>
              <span>Celular: {phone}</span>
              <span>Nascimento: {birthDateLabel}</span>
            </div>
          </div>
        </CardContent>
        <Separator />
        <CardContent className="space-y-3">
          <p className="text-sm font-semibold text-foreground">
            Rankings vinculados
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Feminino</Badge>
            <Badge variant="secondary">Masculino</Badge>
            <Badge variant="secondary">Master 45+</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Editar perfil</CardTitle>
          <CardDescription>Atualize suas informacoes basicas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" defaultValue={user?.first_name ?? ""} placeholder="Rodolfo" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sobrenome">Sobrenome</Label>
            <Input id="sobrenome" defaultValue={user?.last_name ?? ""} placeholder="Lelis" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apelido">Apelido</Label>
            <Input id="apelido" defaultValue={nickname} placeholder="Rodo" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" defaultValue={email} placeholder="rodolfo@tcc.com.br" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="celular">Celular</Label>
            <Input id="celular" defaultValue={phone} placeholder="(11) 99999-0000" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nascimento">Data de nascimento</Label>
            <Input id="nascimento" type="date" defaultValue={birthDateValue} />
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
            <Input id="nova-senha" type="password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmar-senha">Confirmar senha</Label>
            <Input id="confirmar-senha" type="password" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button className="bg-success text-success-foreground hover:bg-success/90">
          Salvar
        </Button>
      </div>
    </div>
  )
}
