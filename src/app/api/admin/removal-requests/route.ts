import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"
import { hasAdminAccess } from "@/lib/domain/permissions"
import { listPendingRemovalRequests } from "@/lib/domain/removal-requests"

export async function GET() {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  if (!hasAdminAccess(session)) {
    return NextResponse.json(
      { ok: false, message: "Acesso restrito." },
      { status: 403 }
    )
  }

  try {
    const items = await listPendingRemovalRequests()
    return NextResponse.json({ ok: true, data: { items } })
  } catch (error) {
    // Degrada graciosamente caso a tabela ainda nao exista (migracao pendente).
    console.error("[api/admin/removal-requests][GET] failed", error)
    return NextResponse.json({ ok: true, data: { items: [] } })
  }
}
