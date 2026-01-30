import DesafiosClient from "@/components/challenges/DesafiosClient"
import { getSessionFromCookies } from "@/lib/auth/session"
import { hasAdminAccess } from "@/lib/domain/permissions"

export default async function DesafiosPage() {
  const session = await getSessionFromCookies()
  const isAdmin = hasAdminAccess(session)

  return <DesafiosClient isAdmin={isAdmin} />
}
