import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { monthKeyFromValue } from "@/lib/date"
import { db } from "@/lib/db"
import { hasAdminAccess } from "@/lib/domain/permissions"
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

  const positionsMap: Array<{ membershipId: number; position: number }> = []

  orderedIds.forEach((userId, index) => {
    const member = membershipByUser.get(userId)
    if (!member) return
    positionsMap.push({ membershipId: member.id, position: index + 1 })
  })

  suspendedMembers.forEach((member, index) => {
    positionsMap.push({
      membershipId: member.id,
      position: orderedIds.length + index + 1,
    })
  })

  const referenceMonth = parsed.data.referenceMonth
  const monthStart = referenceMonth ? toMonthStart(referenceMonth) : null

  await db.$transaction(async (tx) => {
    for (const entry of positionsMap) {
      await tx.ranking_memberships.update({
        where: { id: entry.membershipId },
        data: { position: entry.position },
      })
    }

    if (monthStart && !Number.isNaN(monthStart.getTime())) {
      const snapshotPositions = positionsMap.map((entry) => {
        const userId = memberships.find((member) => member.id === entry.membershipId)
          ?.user_id
        return userId
          ? {
              ranking_id: rankingId,
              round_month: monthStart,
              snapshot_type: "start" as const,
              user_id: userId,
              position: entry.position,
            }
          : null
      })
      const snapshotData = snapshotPositions.filter(Boolean) as Array<{
        ranking_id: number
        round_month: Date
        snapshot_type: "start"
        user_id: number
        position: number
      }>
      const uniqueByUser = new Map<number, number>()
      for (const row of snapshotData) {
        const current = uniqueByUser.get(row.user_id)
        if (!current || row.position < current) {
          uniqueByUser.set(row.user_id, row.position)
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

      await tx.ranking_snapshots.deleteMany({
        where: {
          ranking_id: rankingId,
          round_month: monthStart,
          snapshot_type: "start",
        },
      })

      if (dedupedSnapshots.length) {
        await tx.ranking_snapshots.createMany({
          data: dedupedSnapshots,
          skipDuplicates: true,
        })
      }

      await tx.round_logs.deleteMany({
        where: {
          ranking_id: rankingId,
          reference_month: monthStart,
          line_no: MANUAL_ORDER_LOG_LINE,
          message: MANUAL_ORDER_LOG_MESSAGE,
        },
      })

      await tx.round_logs.create({
        data: {
          ranking_id: rankingId,
          reference_month: monthStart,
          line_no: MANUAL_ORDER_LOG_LINE,
          message: MANUAL_ORDER_LOG_MESSAGE,
        },
      })
    }
  })

  return NextResponse.json({
    ok: true,
    data: { message: "Posicoes atualizadas com sucesso." },
  })
}
