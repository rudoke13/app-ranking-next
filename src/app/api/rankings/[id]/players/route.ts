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
import {
  resolveChallengeWinner,
} from "@/lib/challenges/result"

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
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

const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .optional()

const monthLabel = (value: Date) => formatMonthYearPt(monthValueUtc(value))

const monthValueUtc = (value: Date) => {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

const PLAYED_MONTHS_CACHE_TTL_MS = 12_000
const PLAYERS_RESPONSE_CACHE_TTL_MS = 10_000
const MAX_PLAYERS_RESPONSE_CACHE_ENTRIES = 300
const MAX_PLAYED_MONTHS_CACHE_ENTRIES = 200

type PlayedMonthRow = { month_start: Date }
type RoundMonthRow = { reference_month: Date }
type PlayedMonthsCacheEntry = {
  rows: PlayedMonthRow[]
  cachedAt: number
}

const playedMonthsCache = new Map<number, PlayedMonthsCacheEntry>()
type PlayersResponsePayload = {
  ok: true
  data: unknown
}
type PlayersResponseCacheEntry = {
  payload: PlayersResponsePayload
  cachedAt: number
}
const playersResponseCache = new Map<string, PlayersResponseCacheEntry>()
const playersResponseInFlight = new Map<
  string,
  Promise<PlayersResponsePayload | NextResponse>
>()

const readPlayersResponseCache = (cacheKey: string) => {
  const cached = playersResponseCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() - cached.cachedAt > PLAYERS_RESPONSE_CACHE_TTL_MS) {
    playersResponseCache.delete(cacheKey)
    return null
  }
  return cached.payload
}

const writePlayersResponseCache = (
  cacheKey: string,
  payload: PlayersResponsePayload
) => {
  if (playersResponseCache.size >= MAX_PLAYERS_RESPONSE_CACHE_ENTRIES) {
    const oldestKey = playersResponseCache.keys().next().value
    if (oldestKey) {
      playersResponseCache.delete(oldestKey)
    }
  }
  playersResponseCache.set(cacheKey, {
    payload,
    cachedAt: Date.now(),
  })
}

const getPlayedMonths = async (rankingId: number) => {
  const cached = playedMonthsCache.get(rankingId)
  const now = Date.now()
  if (cached && now - cached.cachedAt <= PLAYED_MONTHS_CACHE_TTL_MS) {
    return cached.rows
  }

  const rows = await db.$queryRaw<PlayedMonthRow[]>`
      SELECT month_start
      FROM (
        SELECT date_trunc('month', scheduled_for)::date AS month_start
        FROM challenges
        WHERE ranking_id = ${rankingId}
          AND scheduled_for IS NOT NULL
          AND (
            status = 'completed'
            OR winner IS NOT NULL
            OR played_at IS NOT NULL
            OR challenger_games IS NOT NULL
            OR challenged_games IS NOT NULL
            OR challenger_walkover = true
            OR challenged_walkover = true
          )
        UNION
        SELECT date_trunc('month', played_at)::date AS month_start
        FROM challenges
        WHERE ranking_id = ${rankingId}
          AND played_at IS NOT NULL
          AND (
            status = 'completed'
            OR winner IS NOT NULL
            OR challenger_games IS NOT NULL
            OR challenged_games IS NOT NULL
            OR challenger_walkover = true
            OR challenged_walkover = true
          )
      ) AS months
      ORDER BY month_start DESC
      LIMIT 24
    `

  playedMonthsCache.set(rankingId, {
    rows,
    cachedAt: now,
  })
  if (playedMonthsCache.size > MAX_PLAYED_MONTHS_CACHE_ENTRIES) {
    const oldestKey = playedMonthsCache.keys().next().value
    if (oldestKey !== undefined) {
      playedMonthsCache.delete(oldestKey)
    }
  }
  return rows
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies()
  if (!session) {
    return jsonResponse(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const { id } = await params
  const rankingId = Number(id)
  if (!Number.isFinite(rankingId)) {
    return jsonResponse(
      { ok: false, message: "Ranking invalido." },
      { status: 400 }
    )
  }

  const { searchParams } = new URL(request.url)
  const monthParam = monthSchema.safeParse(searchParams.get("month") || undefined)
  if (!monthParam.success) {
    return jsonResponse(
      { ok: false, message: "Mes invalido." },
      { status: 400 }
    )
  }
  const forceFresh =
    searchParams.get("fresh") === "1" ||
    searchParams.get("fresh") === "true" ||
    searchParams.get("fresh") === "yes"
  const compactMode =
    searchParams.get("compact") === "1" ||
    searchParams.get("compact") === "true" ||
    searchParams.get("compact") === "yes"
  const responseCacheKey = `${session.role}:${session.userId}:${rankingId}:${monthParam.data ?? "open"}:${compactMode ? "compact" : "full"}`
  const inFlightKey = forceFresh ? `${responseCacheKey}:fresh` : responseCacheKey

  if (forceFresh) {
    playersResponseCache.delete(responseCacheKey)
  } else {
    const cached = readPlayersResponseCache(responseCacheKey)
    if (cached) {
      return jsonResponse(cached)
    }
  }
  const pendingCached = playersResponseInFlight.get(inFlightKey)
  if (pendingCached) {
    const payload = await pendingCached
    if (payload instanceof NextResponse) {
      return payload
    }
    return jsonResponse(payload)
  }

  const pending = (async (): Promise<PlayersResponsePayload | NextResponse> => {
  const now = new Date()
  const userId = Number(session.userId)
  const isAdmin = session.role === "admin"
  const isRestrictedToMembership =
    session.role === "player" || session.role === "member"

  const [ranking, userMembership] = await Promise.all([
    db.rankings.findUnique({
      where: { id: rankingId },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        is_active: true,
        only_for_enrolled_players: true,
      },
    }),
    Number.isFinite(userId)
      ? db.ranking_memberships.findUnique({
          where: {
            ranking_id_user_id: {
              ranking_id: rankingId,
              user_id: userId,
            },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ])

  if (!ranking || (!ranking.is_active && !isAdmin)) {
    return jsonResponse(
      { ok: false, message: "Ranking nao encontrado." },
      { status: 404 }
    )
  }

  if (
    isRestrictedToMembership &&
    ranking.only_for_enrolled_players &&
    !userMembership
  ) {
    return jsonResponse(
      { ok: false, message: "Categoria disponivel apenas para inscritos." },
      { status: 403 }
    )
  }

  if (compactMode) {
    const memberships = await db.ranking_memberships.findMany({
      where: { ranking_id: rankingId },
      select: {
        id: true,
        user_id: true,
        position: true,
        is_suspended: true,
        users: {
          select: {
            first_name: true,
            last_name: true,
            nickname: true,
          },
        },
      },
      orderBy: [{ is_suspended: "asc" }, { position: "asc" }, { user_id: "asc" }],
    })

    const activePlayers = memberships
      .filter((membership) => !membership.is_suspended)
      .map((membership) => ({
        userId: membership.user_id,
        position: membership.position ?? 0,
        firstName: membership.users.first_name ?? "",
        lastName: membership.users.last_name ?? "",
        nickname: membership.users.nickname ?? null,
        isSuspended: false,
      }))

    const suspended = memberships
      .filter((membership) => membership.is_suspended)
      .map((membership) => ({
        userId: membership.user_id,
        position: membership.position ?? 0,
        firstName: membership.users.first_name ?? "",
        lastName: membership.users.last_name ?? "",
        nickname: membership.users.nickname ?? null,
        isSuspended: true,
      }))

    const compactResponse: PlayersResponsePayload = {
      ok: true,
      data: {
        players: activePlayers,
        suspended,
      },
    }

    writePlayersResponseCache(responseCacheKey, compactResponse)
    return compactResponse
  }

  const [openRankingRound, openGlobalRound, canManage] = await Promise.all([
    db.rounds.findFirst({
      where: {
        status: "open",
        ranking_id: rankingId,
      },
      select: {
        reference_month: true,
        round_opens_at: true,
        matches_deadline: true,
        blue_point_opens_at: true,
        blue_point_closes_at: true,
        open_challenges_at: true,
        open_challenges_end_at: true,
      },
      orderBy: [{ reference_month: "desc" }, { id: "desc" }],
    }),
    db.rounds.findFirst({
      where: {
        status: "open",
        ranking_id: null,
      },
      select: {
        reference_month: true,
        round_opens_at: true,
        matches_deadline: true,
        blue_point_opens_at: true,
        blue_point_closes_at: true,
        open_challenges_at: true,
        open_challenges_end_at: true,
      },
      orderBy: [{ reference_month: "desc" }, { id: "desc" }],
    }),
    canManageRanking(session, rankingId),
  ])

  const openRound = openRankingRound ?? openGlobalRound ?? null

  const openMonthValue = openRound
    ? monthValueUtc(openRound.reference_month)
    : null

  let requestedMonthValue =
    monthParam.data ?? openMonthValue ?? monthValueUtc(now)

  if (openMonthValue && requestedMonthValue > openMonthValue) {
    requestedMonthValue = openMonthValue
  }

  const monthStart = monthStartLocalFromValue(requestedMonthValue)
  if (Number.isNaN(monthStart.getTime())) {
    return jsonResponse(
      { ok: false, message: "Mes invalido." },
      { status: 400 }
    )
  }
  const monthKey = monthKeyFromValue(requestedMonthValue)
  if (Number.isNaN(monthKey.getTime())) {
    return jsonResponse(
      { ok: false, message: "Mes invalido." },
      { status: 400 }
    )
  }
  const nextMonth = new Date(monthStart)
  nextMonth.setMonth(nextMonth.getMonth() + 1)
  const shouldUseSnapshot = !openMonthValue || requestedMonthValue !== openMonthValue
  const challengeWindowPromise = resolveChallengeWindows(rankingId, now, {
    openRankingRound,
    openGlobalRound,
  })
  const shouldLoadMonthHistory = canManage

  const [
    memberships,
    roundMonths,
    playedMonths,
    snapshotRows,
    challengeWindow,
  ] = await Promise.all([
    db.ranking_memberships.findMany({
      where: { ranking_id: rankingId },
      select: {
        id: true,
        user_id: true,
        position: true,
        is_blue_point: true,
        is_access_challenge: true,
        is_suspended: true,
        users: {
          select: {
            first_name: true,
            last_name: true,
            nickname: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { position: "asc" },
    }),
    shouldLoadMonthHistory
      ? db.rounds.findMany({
          where: {
            OR: [{ ranking_id: rankingId }, { ranking_id: null }],
          },
          distinct: ["reference_month"],
          select: { reference_month: true },
          orderBy: { reference_month: "desc" },
          take: 12,
        })
      : Promise.resolve([] as RoundMonthRow[]),
    shouldLoadMonthHistory
      ? getPlayedMonths(rankingId)
      : Promise.resolve([] as PlayedMonthRow[]),
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
    challengeWindowPromise,
  ])

  const bluePhaseEnd = challengeWindow.blueEnd ?? challengeWindow.openStart
  const isBluePhaseOpen = now < bluePhaseEnd
  const blueChallengeStatuses: Array<"scheduled" | "accepted" | "completed"> = [
    "scheduled",
    "accepted",
    "completed",
  ]
  const blueCandidateUserIds = memberships
    .filter((membership) => membership.is_blue_point)
    .map((membership) => membership.user_id)
  const blueChallengesInWindow = blueCandidateUserIds.length
    ? await db.challenges.findMany({
        where: {
          ranking_id: rankingId,
          challenger_id: { in: blueCandidateUserIds },
          status: { in: blueChallengeStatuses },
          scheduled_for: {
            gte: challengeWindow.blueStart,
            lt: bluePhaseEnd,
          },
        },
        select: { challenger_id: true },
        distinct: ["challenger_id"],
      })
    : []
  const blueUsersWhoUsedWindow = new Set<number>(
    blueChallengesInWindow.map((row) => row.challenger_id)
  )
  const hasEffectiveBluePoint = (membership: {
    is_blue_point: boolean | null
    user_id: number
  } | null) => {
    if (!membership?.is_blue_point) return false
    if (isBluePhaseOpen) return true
    return blueUsersWhoUsedWindow.has(membership.user_id)
  }

  const summaryTargetUserIdList = memberships
    .filter((membership) => !membership.is_suspended)
    .map((membership) => membership.user_id)
  const challengesTake = Math.min(
    Math.max(summaryTargetUserIdList.length * 2, 80),
    280
  )

  const challenges = summaryTargetUserIdList.length
    ? await db.challenges.findMany({
        where: {
          ranking_id: rankingId,
          status: { in: ["completed", "scheduled", "accepted"] },
          scheduled_for: {
            gte: monthStart,
            lt: nextMonth,
          },
          OR: [
            { challenger_id: { in: summaryTargetUserIdList } },
            { challenged_id: { in: summaryTargetUserIdList } },
          ],
        },
        select: {
          id: true,
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
        },
        orderBy: [
          { scheduled_for: "desc" },
          { played_at: "desc" },
          { id: "desc" },
        ],
        take: challengesTake,
      })
    : []

  const viewerMembership =
    Number.isFinite(userId)
      ? memberships.find((membership) => membership.user_id === userId) ?? null
      : null
  const viewerHasEffectiveBluePoint = hasEffectiveBluePoint(viewerMembership)
  let viewerBlueCanChallengeInOpen = false

  if (viewerMembership?.is_blue_point && !isBluePhaseOpen) {
    viewerBlueCanChallengeInOpen = !blueUsersWhoUsedWindow.has(userId)
  }

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

  const months = (() => {
    if (!canManage) {
      return [requestedMonthValue]
    }
    const monthSet = new Set<string>()
    roundMonths.forEach((row) => {
      monthSet.add(monthValueUtc(row.reference_month))
    })
    playedMonths.forEach((row) => {
      monthSet.add(monthValueUtc(row.month_start))
    })
    if (openMonthValue) {
      monthSet.add(openMonthValue)
    }
    monthSet.add(requestedMonthValue)
    const maxMonthValue = openMonthValue ?? requestedMonthValue
    return Array.from(monthSet)
      .filter((value) => value <= maxMonthValue)
      .sort((a, b) => b.localeCompare(a))
  })()

  const membershipUserIds = new Set(summaryTargetUserIdList)

  const summaries = new Map<
    number,
    {
      status: string
      result: "win" | "loss" | "pending"
    }
  >()

  for (const row of challenges) {
    // Para o resumo visual da lista, so consideramos resultado (vitoria/derrota)
    // quando o desafio esta efetivamente concluido no banco.
    // Isso evita mostrar resultado por dados legados (winner placar em desafio nao concluido).
    const isCompleted = row.status === "completed"
    const status = isCompleted ? "completed" : row.status
    const winner = isCompleted
      ? resolveChallengeWinner({
          winner: row.winner,
          challenger_games: row.challenger_games,
          challenged_games: row.challenged_games,
          challenger_walkover: row.challenger_walkover,
          challenged_walkover: row.challenged_walkover,
        })
      : null

    const challengerId = row.challenger_id
    const challengedId = row.challenged_id

    if (membershipUserIds.has(challengerId) && !summaries.has(challengerId)) {
      summaries.set(challengerId, {
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

    if (membershipUserIds.has(challengedId) && !summaries.has(challengedId)) {
      summaries.set(challengedId, {
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

    if (summaries.size >= membershipUserIds.size) {
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
        firstName: user.first_name,
        lastName: user.last_name,
        nickname: user.nickname ?? null,
        avatarUrl: user.avatarUrl ?? null,
        isBluePoint: hasEffectiveBluePoint(membership ?? null),
        isAccessChallenge: Boolean(membership?.is_access_challenge),
        isSuspended: false,
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
        firstName: user.first_name,
        lastName: user.last_name,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl ?? null,
        isBluePoint: hasEffectiveBluePoint(membership),
        isAccessChallenge: Boolean(membership.is_access_challenge),
        isSuspended: Boolean(membership.is_suspended),
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

  const baseAccessThreshold = getAccessThreshold(ranking.slug)
  const accessThreshold = baseAccessThreshold
    ? Math.min(baseAccessThreshold, memberships.length)
    : null
  const windowState = toWindowState(challengeWindow, now)
  const canManageAll = session.role === "admin"

  const responseBody: PlayersResponsePayload = {
    ok: true,
    data: {
      serverNow: now.toISOString(),
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
        viewerBlueCanChallengeInOpen:
          viewerHasEffectiveBluePoint && viewerBlueCanChallengeInOpen,
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
  }

  writePlayersResponseCache(responseCacheKey, responseBody)
  return responseBody
  })()

  playersResponseInFlight.set(inFlightKey, pending)
  const payload = await pending.finally(() => {
    if (playersResponseInFlight.get(inFlightKey) === pending) {
      playersResponseInFlight.delete(inFlightKey)
    }
  })

  if (payload instanceof NextResponse) {
    return payload
  }
  return jsonResponse(payload)
}
