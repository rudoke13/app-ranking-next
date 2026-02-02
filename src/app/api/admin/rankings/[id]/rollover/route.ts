import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { hasAdminAccess } from "@/lib/domain/permissions"
import { rolloverRound } from "@/lib/domain/round-actions"

const bodySchema = z.object({
  referenceMonth: z.string().regex(/^\d{4}-\d{2}$/),
  targetMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  includeAll: z.boolean().optional(),
})

export async function POST(
  request: Request,
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
  const rankingId = Number(id)
  if (!Number.isFinite(rankingId)) {
    return NextResponse.json(
      { ok: false, message: "Ranking invalido." },
      { status: 400 }
    )
  }

  const payload = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const targetMonth =
      parsed.data.targetMonth
        ? new Date(`${parsed.data.targetMonth}-01T00:00:00`)
        : undefined
    if (targetMonth && Number.isNaN(targetMonth.getTime())) {
      return NextResponse.json(
        { ok: false, message: "Mes de abertura invalido." },
        { status: 400 }
      )
    }
    await rolloverRound(
      rankingId,
      parsed.data.referenceMonth,
      Number(session.userId) || null,
      {
        targetMonth,
        includeAll: parsed.data.includeAll === true,
      }
    )
    return NextResponse.json({
      ok: true,
      data: { message: "Rodada encerrada e proximo mes aberto." },
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel fechar a rodada.",
      },
      { status: 500 }
    )
  }
}
