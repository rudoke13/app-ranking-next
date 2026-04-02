import { redirect } from "next/navigation"

import BluePointHistoryPage from "@/components/admin/BluePointHistoryPage"
import { getSessionFromCookies } from "@/lib/auth/session"
import { hasAdminAccess } from "@/lib/domain/permissions"

export default async function AdminBluePointPage() {
  const session = await getSessionFromCookies()

  if (!hasAdminAccess(session)) {
    redirect("/dashboard")
  }

  return <BluePointHistoryPage />
}
