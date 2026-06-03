import { redirect } from "next/navigation"

import SectionTitle from "@/components/app/SectionTitle"
import RemovalRequestsAdmin from "@/components/admin/RemovalRequestsAdmin"
import { getSessionFromCookies } from "@/lib/auth/session"
import { hasAdminAccess } from "@/lib/domain/permissions"

export default async function AdminNotificacoesPage() {
  const session = await getSessionFromCookies()
  if (!hasAdminAccess(session)) {
    redirect("/dashboard")
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Central de notificacoes"
        subtitle="Pedidos de saida de ranking para aprovar"
      />
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">
          Pedidos de saida pendentes
        </p>
        <RemovalRequestsAdmin />
      </div>
    </div>
  )
}
