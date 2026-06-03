import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"
import {
  countUnreadNotifications,
  listNotifications,
} from "@/lib/domain/notifications"

export async function GET() {
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

  let items: Awaited<ReturnType<typeof listNotifications>> = []
  let unreadCount = 0
  try {
    ;[items, unreadCount] = await Promise.all([
      listNotifications(userId, 30),
      countUnreadNotifications(userId),
    ])
  } catch (error) {
    // Degrada graciosamente caso a tabela ainda nao exista (migracao pendente).
    console.error("[api/notifications][GET] failed", error)
    return NextResponse.json({
      ok: true,
      data: { unreadCount: 0, items: [] },
    })
  }

  return NextResponse.json({
    ok: true,
    data: {
      unreadCount,
      items: items.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: notification.data ?? null,
        isRead: Boolean(notification.is_read),
        createdAt: notification.created_at?.toISOString() ?? null,
      })),
    },
  })
}
