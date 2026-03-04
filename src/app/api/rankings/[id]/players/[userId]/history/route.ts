import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import {
  formatMonthYearPt,
  monthKeyFromValue,
  shiftMonthValue,
} from "@/lib/date"
import {
  resolveChallengeStatus,
  resolveChallengeWinner,
} from "@/lib/challenges/result"
import { canManageRanking } from "@/lib/domain/collaborator-access"
import { db } from "@/lib/db"

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/).optional()

const NO_STORE_HEADERS = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
} as const

const PRIVATE_SHORT_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=6, stale-while-revalidate=18",
  Vary: "Cookie",
} as const

const jsonResponse = (body: unknown, init?: { status?: number }) =>
  NextResponse.json(body, {
    status: init?.status,
    headers:
      init?.status && init.status >= 400
        ? NO_STORE_HEADERS
        : PRIVATE_SHORT_CACHE_HEADERS,
  })

const toMonthStartUtc = (value: string) => {
  const [yearRaw, monthRaw] = value.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null
  if (month < 1 || month > 12) return null
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
}

const monthValueFromDate = (value: Date) => {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

type PlayedMonthRow = { month_start: Date }

const formatName = (
  first?: string | null,
  last?: string | null,
  nickname?: string | null
) => {
  const full = `${first ?? ""} ${last ?? ""}`.trim()
  if (nickname && nickname.trim()) {
    return full ? `${full} "${nickname.trim()}"` : nickname.trim()
  }
  return full || "Jogador"
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getSessionFromCookies()
  if (!session) {
    return jsonResponse(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const { id, userId } = await params
  const rankingId = Number(id)
  const targetUserId = Number(userId)
  if (!Number.isFinite(rankingId) || !Number.isFinite(targetUserId)) {
    return jsonResponse(
      { ok: false, message: "Parametros invalidos." },
      { status: 400 }
    )
  }

  const monthParam = monthSchema.safeParse(
    new URL(request.url).searchParams.get("month") || undefined
  )
  if (!monthParam.success) {
    return jsonResponse(
      { ok: false, message: "Mes invalido." },
      { status: 400 }
    )
  }

  const canManage = await canManageRanking(session, rankingId)

  const now = new Date()
  const fallbackMonth = `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1
  ).padStart(2, "0")}`
  const baseMonth = monthParam.data ?? fallbackMonth
  const baseMonthStart = toMonthStartUtc(baseMonth)
  if (!baseMonthStart) {
    return jsonResponse(
      { ok: false, message: "Mes invalido." },
      { status: 400 }
    )
  }

  const ranking = await db.rankings.findUnique({
    where: { id: rankingId },
    select: {
      id: true,
      name: true,
      is_active: true,
      only_for_enrolled_players: true,
    },
  })

  if (!ranking || (!ranking.is_active && !canManage)) {
    return jsonResponse(
      { ok: false, message: "Ranking nao encontrado." },
      { status: 404 }
    )
  }

  const isRestrictedToMembership =
    session.role === "player" || session.role === "member"
  const viewerId = Number(session.userId)

  const [viewerMembership, targetMembership] = await Promise.all([
    Number.isFinite(viewerId)
      ? db.ranking_memberships.findUnique({
          where: {
            ranking_id_user_id: {
              ranking_id: rankingId,
              user_id: viewerId,
            },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
    db.ranking_memberships.findUnique({
      where: {
        ranking_id_user_id: {
          ranking_id: rankingId,
          user_id: targetUserId,
        },
      },
      select: {
        user_id: true,
        is_blue_point: true,
        users: {
          select: {
            first_name: true,
            last_name: true,
            nickname: true,
            avatarUrl: true,
          },
        },
      },
    }),
  ])

  if (
    isRestrictedToMembership &&
    ranking.only_for_enrolled_players &&
    !viewerMembership
  ) {
    return jsonResponse(
      { ok: false, message: "Categoria disponivel apenas para inscritos." },
      { status: 403 }
    )
  }

  if (!targetMembership) {
    return jsonResponse(
      { ok: false, message: "Jogador nao encontrado no ranking." },
      { status: 404 }
    )
  }

  const roundRows = await db.rounds.findMany({
    where: {
      reference_month: {
        lte: baseMonthStart,
      },
      OR: [{ ranking_id: rankingId }, { ranking_id: null }],
    },
    distinct: ["reference_month"],
    select: { reference_month: true },
    orderBy: { reference_month: "desc" },
    take: 24,
  })

  const monthsSet = new Set(
    roundRows.map((row) => monthValueFromDate(row.reference_month))
  )

  if (monthsSet.size < 3) {
    const playedMonthRows = await db.$queryRaw<PlayedMonthRow[]>`
      SELECT month_start
      FROM (
        SELECT date_trunc('month', scheduled_for)::date AS month_start
        FROM challenges
        WHERE ranking_id = ${rankingId}
          AND scheduled_for IS NOT NULL
          AND status <> 'cancelled'
          AND scheduled_for <= ${baseMonthStart}
        UNION
        SELECT date_trunc('month', played_at)::date AS month_start
        FROM challenges
        WHERE ranking_id = ${rankingId}
          AND played_at IS NOT NULL
          AND status <> 'cancelled'
          AND played_at <= ${baseMonthStart}
      ) AS months
      ORDER BY month_start DESC
      LIMIT 24
    `

    for (const row of playedMonthRows) {
      monthsSet.add(monthValueFromDate(row.month_start))
      if (monthsSet.size >= 3) break
    }
  }

  const months = Array.from(monthsSet)
    .filter((value) => value <= baseMonth)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 3)

  if (!months.length) {
    months.push(baseMonth)
  }

  const oldestStart = toMonthStartUtc(months[months.length - 1])
  const endExclusive = toMonthStartUtc(shiftMonthValue(baseMonth, 1))
  if (!oldestStart || !endExclusive) {
    return jsonResponse(
      { ok: false, message: "Mes invalido." },
      { status: 400 }
    )
  }

  const [challenges, blueHistory] = await Promise.all([
    db.challenges.findMany({
      where: {
        ranking_id: rankingId,
        status: { not: "cancelled" },
        scheduled_for: {
          gte: oldestStart,
          lt: endExclusive,
        },
        OR: [{ challenger_id: targetUserId }, { challenged_id: targetUserId }],
      },
      select: {
        id: true,
        status: true,
        winner: true,
        scheduled_for: true,
        played_at: true,
        challenger_games: true,
        challenged_games: true,
        challenger_walkover: true,
        challenged_walkover: true,
        users_challenges_challenger_idTousers: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            nickname: true,
            avatarUrl: true,
          },
        },
        users_challenges_challenged_idTousers: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            nickname: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ scheduled_for: "desc" }, { played_at: "desc" }, { id: "desc" }],
    }),
    db.blue_point_history.findMany({
      where: {
        ranking_id: rankingId,
        user_id: targetUserId,
        month_key: {
          in: months
            .map((value) => monthKeyFromValue(value))
            .filter((value) => !Number.isNaN(value.getTime())),
        },
      },
      select: { month_key: true },
    }),
  ])

  const bluePointMonths = new Set(
    blueHistory.map((entry) => monthValueFromDate(entry.month_key))
  )

  const itemsByMonth = new Map<
    string,
    Array<{
      id: number
      status: "scheduled" | "accepted" | "declined" | "completed" | "cancelled"
      winner: "challenger" | "challenged" | null
      scheduledFor: string
      playedAt: string | null
      challengerGames: number | null
      challengedGames: number | null
      challengerWalkover: boolean
      challengedWalkover: boolean
      challenger: { id: number; name: string; avatarUrl: string | null }
      challenged: { id: number; name: string; avatarUrl: string | null }
    }>
  >()

  for (const value of months) {
    itemsByMonth.set(value, [])
  }

  for (const challenge of challenges) {
    const monthValue = monthValueFromDate(challenge.scheduled_for)
    if (!itemsByMonth.has(monthValue)) continue

    const status = resolveChallengeStatus({
      status: challenge.status,
      winner: challenge.winner,
      played_at: challenge.played_at,
      challenger_games: challenge.challenger_games,
      challenged_games: challenge.challenged_games,
      challenger_walkover: challenge.challenger_walkover,
      challenged_walkover: challenge.challenged_walkover,
    })
    const winner = resolveChallengeWinner({
      winner: challenge.winner,
      challenger_games: challenge.challenger_games,
      challenged_games: challenge.challenged_games,
      challenger_walkover: challenge.challenger_walkover,
      challenged_walkover: challenge.challenged_walkover,
    })

    itemsByMonth.get(monthValue)?.push({
      id: challenge.id,
      status,
      winner,
      scheduledFor: challenge.scheduled_for.toISOString(),
      playedAt: challenge.played_at ? challenge.played_at.toISOString() : null,
      challengerGames: challenge.challenger_games,
      challengedGames: challenge.challenged_games,
      challengerWalkover: Boolean(challenge.challenger_walkover),
      challengedWalkover: Boolean(challenge.challenged_walkover),
      challenger: {
        id: challenge.users_challenges_challenger_idTousers.id,
        name: formatName(
          challenge.users_challenges_challenger_idTousers.first_name,
          challenge.users_challenges_challenger_idTousers.last_name,
          challenge.users_challenges_challenger_idTousers.nickname
        ),
        avatarUrl: challenge.users_challenges_challenger_idTousers.avatarUrl ?? null,
      },
      challenged: {
        id: challenge.users_challenges_challenged_idTousers.id,
        name: formatName(
          challenge.users_challenges_challenged_idTousers.first_name,
          challenge.users_challenges_challenged_idTousers.last_name,
          challenge.users_challenges_challenged_idTousers.nickname
        ),
        avatarUrl: challenge.users_challenges_challenged_idTousers.avatarUrl ?? null,
      },
    })
  }

  const monthsPayload = months.map((value) => {
    const items = (itemsByMonth.get(value) ?? []).slice(0, 12)
    let wins = 0
    let losses = 0
    let pending = 0
    for (const item of items) {
      if (item.status === "completed") {
        const won =
          (item.winner === "challenger" && item.challenger.id === targetUserId) ||
          (item.winner === "challenged" && item.challenged.id === targetUserId)
        if (won) wins += 1
        else losses += 1
      } else if (item.status === "scheduled" || item.status === "accepted") {
        pending += 1
      }
    }

    const wasBluePoint =
      value === baseMonth
        ? Boolean(targetMembership.is_blue_point) || bluePointMonths.has(value)
        : bluePointMonths.has(value)

    return {
      month: { value, label: formatMonthYearPt(value) },
      wasBluePoint,
      stats: {
        total: items.length,
        wins,
        losses,
        pending,
      },
      items,
    }
  })

  return jsonResponse({
    ok: true,
    data: {
      player: {
        userId: targetMembership.user_id,
        name: formatName(
          targetMembership.users.first_name,
          targetMembership.users.last_name,
          targetMembership.users.nickname
        ),
        avatarUrl: targetMembership.users.avatarUrl ?? null,
      },
      months: monthsPayload,
    },
  })
}
