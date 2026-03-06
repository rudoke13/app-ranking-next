import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { monthKeyFromDate, monthKeyFromValue } from "@/lib/date"
import { hasAdminAccess } from "@/lib/domain/permissions"

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/

const querySchema = z.object({
  ranking_id: z.coerce.number().int().positive(),
  month: z.string().regex(monthPattern).optional(),
})

const bodySchema = z.object({
  action: z.enum(["cancel_pending", "delete_challenge"]),
  ranking_id: z.number().int().positive(),
  month: z.string().regex(monthPattern).optional(),
  challenge_id: z.number().int().positive().optional(),
})

const challengeWindowStatuses: Array<"scheduled" | "accepted" | "completed"> = [
  "scheduled",
  "accepted",
  "completed",
]
const scheduledAcceptedStatuses: Array<"scheduled" | "accepted"> = [
  "scheduled",
  "accepted",
]

function resolveMonthWindow(monthRaw?: string) {
  const monthStart = monthRaw ? monthKeyFromValue(monthRaw) : monthKeyFromDate(new Date())
  if (Number.isNaN(monthStart.getTime())) {
    throw new Error("Mes invalido.")
  }

  const monthEnd = new Date(monthStart)
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1)

  const monthKey = `${monthStart.getUTCFullYear()}-${String(
    monthStart.getUTCMonth() + 1
  ).padStart(2, "0")}`

  return { monthStart, monthEnd, monthKey }
}

function buildRoundPeriodFilter(
  monthStart: Date,
  monthEnd: Date
): Prisma.challengesWhereInput {
  // O desafio pertence ao periodo do agendamento (scheduled_for),
  // evitando bloqueio indevido por conclusao tardia (played_at em outro mes).
  return {
    scheduled_for: {
      gte: monthStart,
      lt: monthEnd,
    },
  }
}

function userChallengeScope(userId: number): Prisma.challengesWhereInput {
  return {
    OR: [{ challenger_id: userId }, { challenged_id: userId }],
  }
}

type ChallengeSummary = {
  id: number
  status: "scheduled" | "accepted" | "completed" | "cancelled" | "declined"
  scheduled_for: string
  played_at: string | null
  challenger_id: number
  challenger_name: string
  challenged_id: number
  challenged_name: string
  is_user_challenger: boolean
  is_user_challenged: boolean
}

function fullName(parts: {
  first_name: string
  last_name: string
  nickname: string | null
}) {
  const base = `${parts.first_name} ${parts.last_name}`.trim()
  return parts.nickname ? `${base} "${parts.nickname}"` : base
}

async function findBlockingChallenges(
  userId: number,
  rankingId: number,
  monthStart: Date,
  monthEnd: Date,
  statuses: Prisma.challengesWhereInput["status"] = { in: challengeWindowStatuses }
) {
  return db.challenges.findMany({
    where: {
      ranking_id: rankingId,
      status: statuses,
      AND: [userChallengeScope(userId), buildRoundPeriodFilter(monthStart, monthEnd)],
    },
    orderBy: [{ scheduled_for: "desc" }, { id: "desc" }],
    select: {
      id: true,
      status: true,
      scheduled_for: true,
      played_at: true,
      challenger_id: true,
      challenged_id: true,
      users_challenges_challenger_idTousers: {
        select: { first_name: true, last_name: true, nickname: true },
      },
      users_challenges_challenged_idTousers: {
        select: { first_name: true, last_name: true, nickname: true },
      },
    },
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json({ ok: false, message: "Nao autorizado." }, { status: 401 })
  }
  if (!hasAdminAccess(session)) {
    return NextResponse.json(
      { ok: false, message: "Apenas admin pode executar esta acao." },
      { status: 403 }
    )
  }

  const { id } = await params
  const userId = Number(id)
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ ok: false, message: "Usuario invalido." }, { status: 400 })
  }

  const parsedQuery = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  )
  if (!parsedQuery.success) {
    return NextResponse.json(
      { ok: false, message: "Parametros invalidos.", issues: parsedQuery.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const { monthStart, monthEnd, monthKey } = resolveMonthWindow(parsedQuery.data.month)
    const rankingId = parsedQuery.data.ranking_id
    const challenges = await findBlockingChallenges(
      userId,
      rankingId,
      monthStart,
      monthEnd
    )

    const blockers: ChallengeSummary[] = challenges.map((challenge) => ({
      id: challenge.id,
      status: challenge.status,
      scheduled_for: challenge.scheduled_for.toISOString(),
      played_at: challenge.played_at ? challenge.played_at.toISOString() : null,
      challenger_id: challenge.challenger_id,
      challenger_name: fullName(challenge.users_challenges_challenger_idTousers),
      challenged_id: challenge.challenged_id,
      challenged_name: fullName(challenge.users_challenges_challenged_idTousers),
      is_user_challenger: challenge.challenger_id === userId,
      is_user_challenged: challenge.challenged_id === userId,
    }))

    const pendingCount = blockers.filter(
      (challenge) => challenge.status === "scheduled" || challenge.status === "accepted"
    ).length
    const completedCount = blockers.filter(
      (challenge) => challenge.status === "completed"
    ).length

    return NextResponse.json({
      ok: true,
      data: {
        user_id: userId,
        ranking_id: rankingId,
        month: monthKey,
        blocked: blockers.length > 0,
        pending_count: pendingCount,
        completed_count: completedCount,
        blockers,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro ao verificar bloqueios.",
      },
      { status: 400 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json({ ok: false, message: "Nao autorizado." }, { status: 401 })
  }
  if (!hasAdminAccess(session)) {
    return NextResponse.json(
      { ok: false, message: "Apenas admin pode executar esta acao." },
      { status: 403 }
    )
  }

  const { id } = await params
  const userId = Number(id)
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ ok: false, message: "Usuario invalido." }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const parsedBody = bodySchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos.", issues: parsedBody.error.flatten() },
      { status: 400 }
    )
  }

  const actorUserId = Number(session.userId)

  try {
    const { monthStart, monthEnd, monthKey } = resolveMonthWindow(parsedBody.data.month)
    const rankingId = parsedBody.data.ranking_id

    if (parsedBody.data.action === "cancel_pending") {
      const pendingChallenges = await findBlockingChallenges(
        userId,
        rankingId,
        monthStart,
        monthEnd,
        { in: scheduledAcceptedStatuses }
      )

      if (!pendingChallenges.length) {
        return NextResponse.json({
          ok: true,
          data: {
            action: "cancel_pending",
            user_id: userId,
            ranking_id: rankingId,
            month: monthKey,
            affected: 0,
            challenge_ids: [],
          },
        })
      }

      const ids = pendingChallenges.map((challenge) => challenge.id)
      const now = new Date()

      await db.$transaction([
        db.challenges.updateMany({
          where: { id: { in: ids } },
          data: {
            status: "cancelled",
            cancelled_by_admin: true,
            updated_at: now,
          },
        }),
        db.challenge_events.createMany({
          data: ids.map((challengeId) => ({
            challenge_id: challengeId,
            event_type: "cancelled",
            payload: {
              reason: "admin_unlock",
              month: monthKey,
              ranking_id: rankingId,
              user_id: userId,
            },
            created_by: Number.isFinite(actorUserId) ? actorUserId : undefined,
          })),
        }),
      ])

      return NextResponse.json({
        ok: true,
        data: {
          action: "cancel_pending",
          user_id: userId,
          ranking_id: rankingId,
          month: monthKey,
          affected: ids.length,
          challenge_ids: ids,
        },
      })
    }

    if (!parsedBody.data.challenge_id) {
      return NextResponse.json(
        { ok: false, message: "Informe o ID do desafio para exclusao." },
        { status: 400 }
      )
    }

    const challenge = await db.challenges.findFirst({
      where: {
        id: parsedBody.data.challenge_id,
        ranking_id: rankingId,
        AND: [userChallengeScope(userId), buildRoundPeriodFilter(monthStart, monthEnd)],
      },
      select: { id: true },
    })

    if (!challenge) {
      return NextResponse.json(
        { ok: false, message: "Desafio nao encontrado neste periodo." },
        { status: 404 }
      )
    }

    await db.challenges.delete({ where: { id: challenge.id } })

    return NextResponse.json({
      ok: true,
      data: {
        action: "delete_challenge",
        user_id: userId,
        ranking_id: rankingId,
        month: monthKey,
        deleted_challenge_id: challenge.id,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Erro ao executar acao de bloqueio.",
      },
      { status: 400 }
    )
  }
}
