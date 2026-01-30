import DashboardCards from "@/components/dashboard/DashboardCards"
import { getSessionFromCookies } from "@/lib/auth/session"
import { hasAdminAccess } from "@/lib/domain/permissions"

export default async function DashboardPage() {
  const session = await getSessionFromCookies()
  const isAdmin = hasAdminAccess(session)
  return <DashboardCards isAdmin={isAdmin} />
}
