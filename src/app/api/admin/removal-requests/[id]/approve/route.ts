import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"
import { hasAdminAccess } from "@/lib/domain/permissions"
import { approveRemovalRequest } from "@/lib/domain/removal-requests"

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

  if (!hasAdminAccess(session)) {
    return NextResponse.json(
      { ok: false, message: "Acesso restrito." },
      { status: 403 }
    )
  }

  const { id } = await params
  const requestId = Number(id)
  if (!Number.isFinite(requestId) || requestId <= 0) {
    return NextResponse.json(
      { ok: false, message: "Pedido invalido." },
      { status: 400 }
    )
  }

  const result = await approveRemovalRequest(requestId, Number(session.userId))
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: "Pedido nao esta mais pendente." },
      { status: 409 }
    )
  }

  return NextResponse.json({ ok: true })
}
