import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"
import { markNotificationRead } from "@/lib/domain/notifications"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params
  const notificationId = Number(id)
  if (!Number.isFinite(notificationId) || notificationId <= 0) {
    return NextResponse.json(
      { ok: false, message: "Notificacao invalida." },
      { status: 400 }
    )
  }

  await markNotificationRead(userId, notificationId)

  return NextResponse.json({ ok: true })
}
