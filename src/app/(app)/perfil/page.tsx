import SectionTitle from "@/components/app/SectionTitle"
import AvatarUploader from "@/components/profile/AvatarUploader"
import ProfileForm from "@/components/profile/ProfileForm"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
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
  const roleLabel =
    session?.role === "admin"
      ? "Admin"
      : session?.role === "collaborator"
      ? "Colaborador"
      : "Atleta"

  return (
    <div className="space-y-8">
      <SectionTitle title="Perfil" subtitle="Dados pessoais e preferencias" />

      <Card>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-4">
              <AvatarUploader
                name={fullName}
                avatarUrl={user?.avatarUrl ?? null}
                fallbackLabel={session?.role === "admin" ? "TCC" : undefined}
              />
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

      <ProfileForm
        initialData={{
          firstName: user?.first_name ?? "",
          lastName: user?.last_name ?? "",
          nickname,
          email,
          phone,
          birthDate: birthDateValue,
        }}
      />
    </div>
  )
}
