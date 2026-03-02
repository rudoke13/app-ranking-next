import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import {
  formatMonthYearPt,
  monthKeyFromValue,
  monthStartLocalFromValue,
} from "@/lib/date"
import {
  resolveChallengeWindows,
  toWindowState,
} from "@/lib/domain/challenges"
import { getAccessThreshold, maxPositionsUp } from "@/lib/domain/ranking"
import { db } from "@/lib/db"
import { canManageRanking } from "@/lib/domain/collaborator-access"
import { resolveChallengeWinner } from "@/lib/challenges/result"

const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .optional()

const formatUserName = (
  first?: string | null,
  last?: string | null,
  nickname?: string | null
) => {
  const full = `${first ?? ""} ${last ?? ""}`.trim()
  const nick = (nickname ?? "").trim()

  if (!full && !nick) return "Jogador"
  if (nick && full) return `${full} "${nick}"`
  if (nick) return `"${nick}"`
  return full
}

const monthLabel = (value: Date) => formatMonthYearPt(monthValueUtc(value))

const monthValueUtc = (value: Date) => {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

export async function GET(
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

  const { id } = await params
  const rankingId = Number(id)
  if (!Number.isFinite(rankingId)) {
    return NextResponse.json(
      { ok: false, message: "Ranking invalido." },
      { status: 400 }
    )
  }

  const { searchParams } = new URL(request.url)
  const monthParam = monthSchema.safeParse(searchParams.get("month") || undefined)
  if (!monthParam.success) {
    return NextResponse.json(
      { ok: false, message: "Mes invalido." },
      { status: 400 }
    )
  }

  const now = new Date()

  const ranking = await db.rankings.findUnique({
    where: { id: rankingId },
  })

  if (!ranking || (!ranking.is_active && session.role !== "admin")) {
    return NextResponse.json(
      { ok: false, message: "Ranking nao encontrado." },
      { status: 404 }
    )
  }

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

  const openMonthValue = openRankingRound
    ? monthValueUtc(openRankingRound.reference_month)
    : openGlobalRound
    ? monthValueUtc(openGlobalRound.reference_month)
    : null

  let requestedMonthValue =
    monthParam.data ?? openMonthValue ?? monthValueUtc(now)

  if (openMonthValue && requestedMonthValue > openMonthValue) {
    requestedMonthValue = openMonthValue
  }

  const monthStart = monthStartLocalFromValue(requestedMonthValue)
  if (Number.isNaN(monthStart.getTime())) {
    return NextResponse.json(
      { ok: false, message: "Mes invalido." },
      { status: 400 }
    )
  }
  const monthKey = monthKeyFromValue(requestedMonthValue)
  if (Number.isNaN(monthKey.getTime())) {
    return NextResponse.json(
      { ok: false, message: "Mes invalido." },
      { status: 400 }
    )
  }
  const nextMonth = new Date(monthStart)
  nextMonth.setMonth(nextMonth.getMonth() + 1)
  const shouldUseSnapshot = !openMonthValue || requestedMonthValue !== openMonthValue

  const [memberships, challenges, roundMonths, playedMonths, snapshotRows] = await Promise.all([
    db.ranking_memberships.findMany({
      where: { ranking_id: rankingId },
      select: {
        id: true,
        ranking_id: true,
        user_id: true,
        position: true,
        points: true,
        is_blue_point: true,
        is_access_challenge: true,
        is_locked: true,
        is_suspended: true,
        users: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            nickname: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { position: "asc" },
    }),
    db.challenges.findMany({
      where: {
        ranking_id: rankingId,
        OR: [
          {
            status: "completed",
            played_at: {
              gte: monthStart,
              lt: nextMonth,
            },
          },
          {
            status: { in: ["scheduled", "accepted"] },
            scheduled_for: {
              gte: monthStart,
              lt: nextMonth,
            },
          },
        ],
      },
      select: {
        id: true,
        ranking_id: true,
        challenger_id: true,
        challenged_id: true,
        status: true,
        winner: true,
        challenger_games: true,
        challenged_games: true,
        challenger_walkover: true,
        challenged_walkover: true,
        played_at: true,
        scheduled_for: true,
        created_at: true,
        challenger_position_at_challenge: true,
        challenged_position_at_challenge: true,
        users_challenges_challenger_idTousers: {
          select: { first_name: true, last_name: true, nickname: true },
        },
        users_challenges_challenged_idTousers: {
          select: { first_name: true, last_name: true, nickname: true },
        },
      },
    }),
    db.rounds.findMany({
      where: {
        OR: [{ ranking_id: rankingId }, { ranking_id: null }],
      },
      distinct: ["reference_month"],
      select: { reference_month: true },
      orderBy: { reference_month: "desc" },
      take: 12,
    }),
    db.challenges.findMany({
      where: {
        ranking_id: rankingId,
        status: "completed",
        played_at: { not: null },
      },
      distinct: ["played_at"],
      select: { played_at: true },
      orderBy: { played_at: "desc" },
      take: 24,
    }),
    shouldUseSnapshot
      ? db.ranking_snapshots.findMany({
          where: {
            ranking_id: rankingId,
            round_month: monthKey,
            snapshot_type: { in: ["end", "start"] },
          },
          select: { user_id: true, position: true, snapshot_type: true },
          orderBy: { position: "asc" },
        })
      : Promise.resolve([]),
  ])

  let snapshotPositions: Map<number, number> | null = null
  if (shouldUseSnapshot && snapshotRows.length) {
    const endRows = snapshotRows.filter((row) => row.snapshot_type === "end")
    const baseRows =
      endRows.length > 0
        ? endRows
        : snapshotRows.filter((row) => row.snapshot_type === "start")
    if (baseRows.length) {
      snapshotPositions = new Map(
        baseRows
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((row) => [row.user_id, row.position])
      )
    }
  }

  const monthSet = new Set<string>()
  roundMonths.forEach((row) => {
    monthSet.add(monthValueUtc(row.reference_month))
  })
  playedMonths.forEach((row) => {
    if (row.played_at) {
      monthSet.add(monthValueUtc(row.played_at))
    }
  })
  if (openMonthValue) {
    monthSet.add(openMonthValue)
  }
  monthSet.add(requestedMonthValue)
  const maxMonthValue = openMonthValue ?? requestedMonthValue
  const months = Array.from(monthSet)
    .filter((value) => value <= maxMonthValue)
    .sort((a, b) => b.localeCompare(a))

  const sortedChallenges = challenges
    .map((challenge) => {
      const timestamp =
        challenge.played_at?.getTime() ??
        challenge.scheduled_for?.getTime() ??
        challenge.created_at?.getTime() ??
        0
      return { challenge, timestamp }
    })
    .sort((a, b) =>
      b.timestamp === a.timestamp
        ? b.challenge.id - a.challenge.id
        : b.timestamp - a.timestamp
    )

  const summaries = new Map<
    number,
    {
      role: "challenger" | "challenged"
      roleLabel: string
      opponentName: string
      position: number | null
      status: string
      result: "win" | "loss" | "pending"
    }
  >()

  for (const item of sortedChallenges) {
    const row = item.challenge
    const status = row.status
    const winner = resolveChallengeWinner({
      winner: row.winner,
      challenger_games: row.challenger_games,
      challenged_games: row.challenged_games,
      challenger_walkover: row.challenger_walkover,
      challenged_walkover: row.challenged_walkover,
    })

    const challengerId = row.challenger_id
    const challengedId = row.challenged_id

    if (!summaries.has(challengerId)) {
      summaries.set(challengerId, {
        role: "challenger",
        roleLabel: "Desafiante",
        opponentName: formatUserName(
          row.users_challenges_challenged_idTousers.first_name,
          row.users_challenges_challenged_idTousers.last_name,
          row.users_challenges_challenged_idTousers.nickname
        ),
        position: row.challenged_position_at_challenge ?? null,
        status,
        result:
          status === "completed"
            ? winner === "challenger"
              ? "win"
              : winner === "challenged"
              ? "loss"
              : "pending"
            : "pending",
      })
    }

    if (!summaries.has(challengedId)) {
      summaries.set(challengedId, {
        role: "challenged",
        roleLabel: "Desafiado",
        opponentName: formatUserName(
          row.users_challenges_challenger_idTousers.first_name,
          row.users_challenges_challenger_idTousers.last_name,
          row.users_challenges_challenger_idTousers.nickname
        ),
        position: row.challenger_position_at_challenge ?? null,
        status,
        result:
          status === "completed"
            ? winner === "challenged"
              ? "win"
              : winner === "challenger"
              ? "loss"
              : "pending"
            : "pending",
      })
    }

    if (summaries.size >= memberships.length * 2) {
      break
    }
  }

  const activePlayers = [] as Array<Record<string, unknown>>
  const suspendedPlayers = [] as Array<Record<string, unknown>>

  const membershipByUser = new Map(
    memberships.map((membership) => [membership.user_id, membership])
  )

  if (snapshotPositions && snapshotPositions.size > 0) {
    const snapshotEntries = Array.from(snapshotPositions.entries()).sort(
      (a, b) => a[1] - b[1]
    )
    const missingUserIds = snapshotEntries
      .map(([userId]) => userId)
      .filter((userId) => !membershipByUser.has(userId))

    const missingUsers = missingUserIds.length
      ? await db.users.findMany({
          where: { id: { in: missingUserIds } },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            nickname: true,
            avatarUrl: true,
          },
        })
      : []

    const missingUsersById = new Map(
      missingUsers.map((user) => [user.id, user])
    )

    snapshotEntries.forEach(([userId, position]) => {
      const membership = membershipByUser.get(userId)
      const user = membership?.users ?? missingUsersById.get(userId)
      if (!user) return
      activePlayers.push({
        membershipId: membership?.id ?? 0,
        userId,
        position,
        points: membership?.points ?? 0,
        firstName: user.first_name,
        lastName: user.last_name,
        nickname: user.nickname ?? null,
        avatarUrl: user.avatarUrl ?? null,
        isBluePoint: Boolean(membership?.is_blue_point),
        isAccessChallenge: Boolean(membership?.is_access_challenge),
        isSuspended: false,
        isLocked: Boolean(membership?.is_locked),
        summary: summaries.get(userId) ?? null,
      })
    })
  } else {
    for (const membership of memberships) {
      const user = membership.users
      const snapshotPosition = snapshotPositions?.get(membership.user_id)
      const resolvedPosition =
        snapshotPosition ?? membership.position ?? 0
      const payload = {
        membershipId: membership.id,
        userId: membership.user_id,
        position: resolvedPosition,
        points: membership.points ?? 0,
        firstName: user.first_name,
        lastName: user.last_name,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl ?? null,
        isBluePoint: Boolean(membership.is_blue_point),
        isAccessChallenge: Boolean(membership.is_access_challenge),
        isSuspended: Boolean(membership.is_suspended),
        isLocked: Boolean(membership.is_locked),
        summary: summaries.get(membership.user_id) ?? null,
      }

      if (membership.is_suspended) {
        suspendedPlayers.push(payload)
      } else {
        activePlayers.push(payload)
      }
    }
  }

  const sortByPosition = (
    a: Record<string, unknown>,
    b: Record<string, unknown>
  ) => {
    const posA =
      typeof a.position === "number" && a.position > 0
        ? a.position
        : Number.MAX_SAFE_INTEGER
    const posB =
      typeof b.position === "number" && b.position > 0
        ? b.position
        : Number.MAX_SAFE_INTEGER
    if (posA !== posB) return posA - posB
    const idA = typeof a.userId === "number" ? a.userId : 0
    const idB = typeof b.userId === "number" ? b.userId : 0
    return idA - idB
  }

  activePlayers.sort(sortByPosition)
  suspendedPlayers.sort(sortByPosition)

  const challengeWindow = await resolveChallengeWindows(rankingId, now)
  const baseAccessThreshold = getAccessThreshold(ranking.slug)
  const accessThreshold = baseAccessThreshold
    ? Math.min(baseAccessThreshold, memberships.length)
    : null
  const windowState = toWindowState(challengeWindow, now)

  const canManage = await canManageRanking(session, rankingId)
  const canManageAll = session.role === "admin"

  return NextResponse.json({
    ok: true,
    data: {
      viewerId: Number(session.userId),
      canManage,
      canManageAll,
      ranking: {
        id: ranking.id,
        name: ranking.name,
        slug: ranking.slug,
        description: ranking.description,
      },
      month: {
        value: requestedMonthValue,
        label: monthLabel(monthStart),
      },
      currentMonth: openMonthValue ?? requestedMonthValue,
      months,
      accessThreshold,
      maxPositionsUp: maxPositionsUp(),
      challengeWindow: {
        phase: windowState.phase,
        canChallenge: windowState.canChallenge,
        requiresBlue: windowState.requiresBlue,
        requiresRegular: windowState.requiresRegular,
        message: windowState.message,
        unlockAt: windowState.unlockAt?.toISOString() ?? null,
        roundStart: windowState.roundStart.toISOString(),
        blueStart: windowState.blueStart.toISOString(),
        blueEnd: windowState.blueEnd?.toISOString() ?? null,
        openStart: windowState.openStart.toISOString(),
        openEnd: windowState.openEnd?.toISOString() ?? null,
        roundEnd: windowState.roundEnd?.toISOString() ?? null,
      },
      players: activePlayers,
      suspended: suspendedPlayers,
    },
  })
}
