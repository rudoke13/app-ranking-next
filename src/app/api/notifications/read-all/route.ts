import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"
import { markAllNotificationsRead } from "@/lib/domain/notifications"

export async function POST() {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const userId = Number(session.userId)
  if (!Number.isFinite(userId)) {
    return NextResponse.json(
      { ok: false, message: "Sessao invalida." },
      { status: 401 }
    )
  }

  await markAllNotificationsRead(userId)

  return NextResponse.json({ ok: true })
}
