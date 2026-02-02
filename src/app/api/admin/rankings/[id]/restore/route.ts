import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { canManageRanking } from "@/lib/domain/collaborator-access"
import { hasStaffAccess } from "@/lib/domain/permissions"
import { monthKeyFromValue } from "@/lib/date"
import { db } from "@/lib/db"
import { closeRound, restoreSnapshot } from "@/lib/domain/round-actions"

const bodySchema = z.object({
  referenceMonth: z.string().regex(/^\d{4}-\d{2}$/),
})

const toMonthStart = (value: string) => monthKeyFromValue(value)

const ensureSnapshotFromMemberships = async (
  rankingId: number,
  monthStart: Date,
  snapshotType: "start" | "end"
) => {
  const members = await db.ranking_memberships.findMany({
    where: { ranking_id: rankingId },
    select: { user_id: true, position: true },
    orderBy: { position: "asc" },
  })

  if (!members.length) {
    return false
  }

  const deduped = new Map<number, number>()
  members.forEach((member, index) => {
    const position = member.position ?? index + 1
    const current = deduped.get(member.user_id)
    if (!current || position < current) {
      deduped.set(member.user_id, position)
    }
  })

  if (!deduped.size) {
    return false
  }

  await db.ranking_snapshots.deleteMany({
    where: {
      ranking_id: rankingId,
      round_month: monthStart,
      snapshot_type: snapshotType,
    },
  })

  await db.ranking_snapshots.createMany({
    data: Array.from(deduped.entries()).map(([userId, position]) => ({
      ranking_id: rankingId,
      round_month: monthStart,
      snapshot_type: snapshotType,
      user_id: userId,
      position,
    })),
    skipDuplicates: true,
  })

  return true
}

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

    const monthStart = toMonthStart(parsed.data.referenceMonth)
    if (!isOpenMonth) {
      return NextResponse.json(
        {
          ok: false,
          message: "Restaurar so esta disponivel para o mes aberto.",
        },
        { status: 422 }
      )
    }

    try {
      await restoreSnapshot(rankingId, parsed.data.referenceMonth, {
        preferEndSnapshot: !isOpenMonth,
        persistMemberships: isOpenMonth,
      })
    } catch (error) {
      if (error instanceof Error && error.message === "Snapshot nao encontrado.") {
        await closeRound(
          rankingId,
          parsed.data.referenceMonth,
          Number(session.userId) || null,
          {
            persistMemberships: false,
            closeStatus: false,
            ignoreViolations: true,
          }
        )

        try {
          await restoreSnapshot(rankingId, parsed.data.referenceMonth, {
            preferEndSnapshot: !isOpenMonth,
            persistMemberships: isOpenMonth,
          })
        } catch (secondError) {
          if (
            secondError instanceof Error &&
            secondError.message === "Snapshot nao encontrado."
          ) {
            const createdStart = await ensureSnapshotFromMemberships(
              rankingId,
              monthStart,
              "start"
            )
            const createdEnd = await ensureSnapshotFromMemberships(
              rankingId,
              monthStart,
              "end"
            )
            if (!createdStart && !createdEnd) {
              throw secondError
            }

            await restoreSnapshot(rankingId, parsed.data.referenceMonth, {
              preferEndSnapshot: !isOpenMonth,
              persistMemberships: isOpenMonth,
            })
          } else {
            throw secondError
          }
        }
      } else {
        throw error
      }
    }

    return NextResponse.json({
      ok: true,
      data: { message: "Ranking restaurado com sucesso." },
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel restaurar o ranking.",
      },
      { status: 500 }
    )
  }
}
