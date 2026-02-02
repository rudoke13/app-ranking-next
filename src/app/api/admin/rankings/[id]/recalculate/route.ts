import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { canManageRanking } from "@/lib/domain/collaborator-access"
import { hasStaffAccess } from "@/lib/domain/permissions"
import { closeRound } from "@/lib/domain/round-actions"

const bodySchema = z.object({
  referenceMonth: z.string().regex(/^\d{4}-\d{2}$/),
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

  if (!hasStaffAccess(session)) {
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

  const canManage = await canManageRanking(session, rankingId)
  if (!canManage) {
    return NextResponse.json(
      { ok: false, message: "Sem permissao para este ranking." },
      { status: 403 }
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
    const openRankingRound = await db.rounds.findFirst({
      where: { status: "open", ranking_id: rankingId },
      select: { reference_month: true },
      orderBy: { reference_month: "desc" },
    })

    const openGlobalRound = openRankingRound
      ? null
      : await db.rounds.findFirst({
          where: { status: "open", ranking_id: null },
          select: { reference_month: true },
          orderBy: { reference_month: "desc" },
        })

    const monthValue = (value: Date) => {
      const year = value.getUTCFullYear()
      const month = String(value.getUTCMonth() + 1).padStart(2, "0")
      return `${year}-${month}`
    }

    const openMonthValue = openRankingRound?.reference_month
      ? monthValue(openRankingRound.reference_month)
      : openGlobalRound?.reference_month
      ? monthValue(openGlobalRound.reference_month)
      : null

    const isOpenMonth = !openMonthValue
      ? true
      : parsed.data.referenceMonth === openMonthValue

    const result = await closeRound(
      rankingId,
      parsed.data.referenceMonth,
      Number(session.userId) || null,
      {
        persistMemberships: isOpenMonth,
        closeStatus: false,
      }
    )

    if (result.violations.length) {
      return NextResponse.json(
        {
          ok: false,
          message: "Falha ao atualizar ranking. Verifique as violacoes.",
          issues: result.violations,
        },
        { status: 422 }
      )
    }

    const message = result.manualOverride
      ? "Ranking fechado com ordem manual."
      : "Ranking atualizado com sucesso."

    return NextResponse.json({
      ok: true,
      data: {
        message,
        logCount: result.log.length,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel atualizar o ranking.",
      },
      { status: 500 }
    )
  }
}
