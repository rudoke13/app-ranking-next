import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { createRemovalRequest } from "@/lib/domain/removal-requests"

const schema = z.object({
  ranking_id: z.number().int().positive(),
  reason: z.string().max(500).optional().nullable(),
})

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos." },
      { status: 400 }
    )
  }

  const result = await createRemovalRequest({
    userId,
    rankingId: parsed.data.ranking_id,
    reason: parsed.data.reason,
  })

  if (!result.ok) {
    if (result.code === "no_membership") {
      return NextResponse.json(
        { ok: false, message: "Voce nao esta vinculado a esta categoria." },
        { status: 422 }
      )
    }
    if (result.code === "already_pending") {
      return NextResponse.json(
        {
          ok: false,
          message: "Ja existe um pedido pendente para esta categoria.",
        },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { ok: false, message: "Nao foi possivel registrar o pedido." },
      { status: 422 }
    )
  }

  return NextResponse.json({ ok: true })
}
