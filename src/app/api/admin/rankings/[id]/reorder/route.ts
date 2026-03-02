import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { monthKeyFromValue } from "@/lib/date"
import { db } from "@/lib/db"
import { canManageRanking } from "@/lib/domain/collaborator-access"
import { hasStaffAccess } from "@/lib/domain/permissions"
import {
  MANUAL_ORDER_LOG_LINE,
  MANUAL_ORDER_LOG_MESSAGE,
} from "@/lib/domain/round-overrides"

const bodySchema = z.object({
  orderedUserIds: z.array(z.number().int().positive()).min(1),
  referenceMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
})

const toMonthStart = (value: string) => monthKeyFromValue(value)

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const memberships = await db.ranking_memberships.findMany({
      where: { ranking_id: rankingId },
      select: { id: true, user_id: true, position: true, is_suspended: true },
    })

    if (memberships.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Ranking sem participantes." },
        { status: 404 }
      )
    }

    const activeMembers = memberships.filter((member) => !member.is_suspended)
    const suspendedMembers = memberships
      .filter((member) => member.is_suspended)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

    const orderedIds = parsed.data.orderedUserIds
    const uniqueIds = new Set(orderedIds)
    if (uniqueIds.size !== orderedIds.length) {
      return NextResponse.json(
        { ok: false, message: "Jogadores duplicados na nova ordem." },
        { status: 422 }
      )
    }

    if (orderedIds.length !== activeMembers.length) {
      return NextResponse.json(
        { ok: false, message: "Quantidade de jogadores invalida." },
        { status: 422 }
      )
    }

    const activeUserIds = new Set(activeMembers.map((member) => member.user_id))
    for (const userId of orderedIds) {
      if (!activeUserIds.has(userId)) {
        return NextResponse.json(
          { ok: false, message: "Jogador nao pertence ao ranking." },
          { status: 422 }
        )
      }
    }

    const membershipByUser = new Map(
      memberships.map((member) => [member.user_id, member])
    )

    const positionsMap: Array<{
      membershipId: number
      userId: number
      position: number
    }> = []

    orderedIds.forEach((userId, index) => {
      const member = membershipByUser.get(userId)
      if (!member) return
      positionsMap.push({
        membershipId: member.id,
        userId: member.user_id,
        position: index + 1,
      })
    })

    suspendedMembers.forEach((member, index) => {
      positionsMap.push({
        membershipId: member.id,
        userId: member.user_id,
        position: orderedIds.length + index + 1,
      })
    })

    const referenceMonth = parsed.data.referenceMonth
    const monthStart = referenceMonth ? toMonthStart(referenceMonth) : null

    const updateValues = Prisma.join(
      positionsMap.map(
        (entry) =>
          Prisma.sql`(${entry.membershipId}::int, ${entry.position}::int)`
      )
    )
    await db.$executeRaw(
      Prisma.sql`
        UPDATE ranking_memberships AS rm
        SET position = src.position
        FROM (VALUES ${updateValues}) AS src(id, position)
        WHERE rm.id = src.id
      `
    )

    if (monthStart && !Number.isNaN(monthStart.getTime())) {
      const uniqueByUser = new Map<number, number>()
      for (const row of positionsMap) {
        const current = uniqueByUser.get(row.userId)
        if (!current || row.position < current) {
          uniqueByUser.set(row.userId, row.position)
        }
      }

      const dedupedSnapshots = Array.from(uniqueByUser.entries()).map(
        ([userId, position]) => ({
          ranking_id: rankingId,
          round_month: monthStart,
          snapshot_type: "start" as const,
          user_id: userId,
          position,
        })
      )

      await db.ranking_snapshots.deleteMany({
        where: {
          ranking_id: rankingId,
          round_month: monthStart,
          snapshot_type: "start",
        },
      })

      if (dedupedSnapshots.length) {
        await db.ranking_snapshots.createMany({
          data: dedupedSnapshots,
          skipDuplicates: true,
        })
      }

      await db.round_logs.deleteMany({
        where: {
          ranking_id: rankingId,
          reference_month: monthStart,
          line_no: MANUAL_ORDER_LOG_LINE,
          message: MANUAL_ORDER_LOG_MESSAGE,
        },
      })

      await db.round_logs.create({
        data: {
          ranking_id: rankingId,
          reference_month: monthStart,
          line_no: MANUAL_ORDER_LOG_LINE,
          message: MANUAL_ORDER_LOG_MESSAGE,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      data: { message: "Posicoes atualizadas com sucesso." },
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel salvar a ordenacao manual.",
      },
      { status: 500 }
    )
  }
}
