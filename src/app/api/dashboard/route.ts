import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"
import {
  resolveChallengeResultForUser,
  resolveChallengeStatus,
  resolveChallengeWinner,
} from "@/lib/challenges/result"
import { monthKeyFromDate } from "@/lib/date"
import { db } from "@/lib/db"

const formatName = (first?: string | null, last?: string | null, nickname?: string | null) => {
  const full = `${first ?? ""} ${last ?? ""}`.trim()
  if (nickname && nickname.trim()) {
    return full ? `${full} "${nickname.trim()}"` : nickname.trim()
  }
  return full || "Jogador"
}

const toCount = (value: unknown) => {
  if (typeof value === "number") return value
  if (typeof value === "bigint") return Number(value)
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

type DashboardCacheEntry = {
  cachedAt: number
  data: unknown
}

type DashboardInFlightResult = {
  dataPayload: unknown
  baseQueryMs: number
  roundQueryMs: number
  statsQueryMs: number
}

const DASHBOARD_CACHE_TTL_MS = 30_000
const MAX_DASHBOARD_CACHE_ENTRIES = 300
const dashboardCache = new Map<string, DashboardCacheEntry>()
const dashboardInFlight = new Map<string, Promise<DashboardInFlightResult>>()
const PRIVATE_SHORT_CACHE_CONTROL = "private, max-age=8, stale-while-revalidate=24"
const NO_STORE_CACHE_CONTROL =
  "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"

const readDashboardCache = (cacheKey: string) => {
  const cached = dashboardCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() - cached.cachedAt > DASHBOARD_CACHE_TTL_MS) {
    dashboardCache.delete(cacheKey)
    return null
  }
  return cached.data
}

const writeDashboardCache = (cacheKey: string, data: unknown) => {
  if (dashboardCache.size >= MAX_DASHBOARD_CACHE_ENTRIES) {
    const oldestKey = dashboardCache.keys().next().value
    if (oldestKey) {
      dashboardCache.delete(oldestKey)
    }
  }
  dashboardCache.set(cacheKey, {
    cachedAt: Date.now(),
    data,
  })
}

export async function GET(request: Request) {
  const startedAt = performance.now()
  const buildTimingHeader = (entries: Array<[string, number]>) =>
    entries.map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`).join(", ")
  const applyResponseMeta = (
    response: NextResponse,
    entries: Array<[string, number]>,
    options?: { noStore?: boolean }
  ) => {
    response.headers.set("Server-Timing", buildTimingHeader(entries))
    response.headers.set(
      "Cache-Control",
      options?.noStore ? NO_STORE_CACHE_CONTROL : PRIVATE_SHORT_CACHE_CONTROL
    )
    response.headers.set("Vary", "Cookie")
  }

  const session = await getSessionFromCookies()
  if (!session) {
    const response = NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
    applyResponseMeta(
      response,
      [["total", performance.now() - startedAt]],
      { noStore: true }
    )
    return response
  }
  const sessionMs = performance.now() - startedAt

  const userId = Number(session.userId)
  const isAdmin = session.role === "admin"
  if (!Number.isFinite(userId)) {
    const response = NextResponse.json(
      { ok: false, message: "Usuario invalido." },
      { status: 400 }
    )
    applyResponseMeta(
      response,
      [
        ["session", sessionMs],
        ["total", performance.now() - startedAt],
      ],
      { noStore: true }
    )
    return response
  }
  const cacheKey = `${session.role}:${userId}`
  const searchParams = new URL(request.url).searchParams
  const freshParam = (searchParams.get("fresh") ?? "").toLowerCase()
  const bypassCache =
    freshParam === "1" || freshParam === "true" || freshParam === "yes"
  const inFlightKey = bypassCache ? `${cacheKey}:fresh` : cacheKey

  if (bypassCache) {
    dashboardCache.delete(cacheKey)
  }

  if (!bypassCache) {
    const cachedData = readDashboardCache(cacheKey)
    if (cachedData) {
      const response = NextResponse.json({
        ok: true,
        data: cachedData,
      })
      applyResponseMeta(response, [
          ["session", sessionMs],
          ["cache", performance.now() - startedAt - sessionMs],
          ["total", performance.now() - startedAt],
        ])
      return response
    }
  }

  const pendingFetch = dashboardInFlight.get(inFlightKey)
  if (pendingFetch) {
    try {
      const pendingResult = await pendingFetch
      const response = NextResponse.json({
        ok: true,
        data: pendingResult.dataPayload,
      })
      applyResponseMeta(response, [
          ["session", sessionMs],
          ["wait", performance.now() - startedAt - sessionMs],
          ["total", performance.now() - startedAt],
        ])
      return response
    } catch {
      const response = NextResponse.json(
        { ok: false, message: "Erro ao carregar dashboard." },
        { status: 500 }
      )
      applyResponseMeta(
        response,
        [
          ["session", sessionMs],
          ["total", performance.now() - startedAt],
        ],
        { noStore: true }
      )
      return response
    }
  }

  let resolveInFlight: ((value: DashboardInFlightResult) => void) | undefined
  let rejectInFlight: ((reason?: unknown) => void) | undefined
  const inFlightPromise = new Promise<DashboardInFlightResult>((resolve, reject) => {
    resolveInFlight = resolve
    rejectInFlight = reject
  })
  dashboardInFlight.set(inFlightKey, inFlightPromise)

  try {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthKey = monthKeyFromDate(monthStart)
  const nextMonth = new Date(monthStart)
  nextMonth.setMonth(nextMonth.getMonth() + 1)

  const baseQueryStartedAt = performance.now()
  const membershipPromise = db.ranking_memberships.findFirst({
    where: { user_id: userId },
    select: {
      ranking_id: true,
      position: true,
      rankings: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { ranking_id: "asc" },
  })

  const receivedChallengesPromise = db.challenges.findMany({
    where: {
      challenged_id: userId,
      status: { in: ["scheduled", "accepted", "declined"] },
    },
    select: {
      id: true,
      status: true,
      winner: true,
      played_at: true,
      challenger_games: true,
      challenged_games: true,
      challenger_walkover: true,
      challenged_walkover: true,
      scheduled_for: true,
      users_challenges_challenger_idTousers: {
        select: { first_name: true, last_name: true, nickname: true },
      },
    },
    orderBy: {
      scheduled_for: "desc",
    },
    take: 6,
  })

  const myChallengesPromise = db.challenges.findMany({
    where: {
      OR: [{ challenger_id: userId }, { challenged_id: userId }],
      status: { not: "cancelled" },
    },
    select: {
      id: true,
      status: true,
      winner: true,
      played_at: true,
      challenger_games: true,
      challenged_games: true,
      challenger_walkover: true,
      challenged_walkover: true,
      scheduled_for: true,
      challenger_id: true,
      challenged_id: true,
      rankings: { select: { name: true } },
      users_challenges_challenger_idTousers: {
        select: { id: true, first_name: true, last_name: true, nickname: true, avatarUrl: true },
      },
      users_challenges_challenged_idTousers: {
        select: { id: true, first_name: true, last_name: true, nickname: true, avatarUrl: true },
      },
    },
    orderBy: [{ status: "asc" }, { scheduled_for: "asc" }],
    take: 10,
  })

  const recentResultsPromise = db.challenges.findMany({
    where: {
      AND: [
        {
          OR: [{ challenger_id: userId }, { challenged_id: userId }],
        },
        {
          OR: [
            { status: "completed" },
            { winner: { not: null } },
            { played_at: { not: null } },
            { challenger_games: { not: null } },
            { challenged_games: { not: null } },
            { challenger_walkover: true },
            { challenged_walkover: true },
          ],
        },
      ],
    },
    select: {
      id: true,
      status: true,
      winner: true,
      played_at: true,
      scheduled_for: true,
      challenger_id: true,
      challenged_id: true,
      challenger_games: true,
      challenged_games: true,
      challenger_tiebreak: true,
      challenged_tiebreak: true,
      challenger_walkover: true,
      challenged_walkover: true,
      users_challenges_challenger_idTousers: {
        select: { first_name: true, last_name: true, nickname: true },
      },
      users_challenges_challenged_idTousers: {
        select: { first_name: true, last_name: true, nickname: true },
      },
    },
    orderBy: [{ played_at: "desc" }, { scheduled_for: "desc" }, { id: "desc" }],
    take: 9,
  })

  const membership = await membershipPromise

  const roundQueryStartedAt = performance.now()
  const openRankingRoundPromise = membership
    ? db.rounds.findFirst({
        where: {
          status: "open",
          ranking_id: membership.ranking_id,
          reference_month: monthKey,
        },
      })
    : Promise.resolve(null)
  const openGlobalRoundPromise = db.rounds.findFirst({
    where: {
      status: "open",
      ranking_id: null,
      reference_month: monthKey,
    },
  })

  type DashboardStatsRow = {
    active_players: unknown
    blue_points: unknown
    challenge_month_count: unknown
    pending_month_count: unknown
    my_pending_month_count: unknown
  }

  const statsQueryStartedAt = performance.now()
  const statsPromise = membership
    ? Promise.all([
        db.$queryRaw<DashboardStatsRow[]>`
          SELECT
            (
              SELECT COUNT(*)
              FROM ranking_memberships rm
              WHERE rm.ranking_id = ${membership.ranking_id}
                AND rm.is_suspended = false
            ) AS active_players,
            (
              SELECT COUNT(*)
              FROM ranking_memberships rm
              WHERE rm.ranking_id = ${membership.ranking_id}
                AND rm.is_blue_point = true
                AND rm.is_suspended = false
            ) AS blue_points,
            (
              SELECT COUNT(*)
              FROM challenges c
              WHERE c.ranking_id = ${membership.ranking_id}
                AND c.scheduled_for >= ${monthStart}
                AND c.scheduled_for < ${nextMonth}
                AND c.status <> 'cancelled'
            ) AS challenge_month_count,
            (
              SELECT COUNT(*)
              FROM challenges c
              WHERE c.ranking_id = ${membership.ranking_id}
                AND c.scheduled_for >= ${monthStart}
                AND c.scheduled_for < ${nextMonth}
                AND c.status IN ('scheduled', 'accepted')
            ) AS pending_month_count,
            (
              SELECT COUNT(*)
              FROM challenges c
              WHERE c.ranking_id = ${membership.ranking_id}
                AND c.scheduled_for >= ${monthStart}
                AND c.scheduled_for < ${nextMonth}
                AND c.status IN ('scheduled', 'accepted')
                AND (c.challenger_id = ${userId} OR c.challenged_id = ${userId})
            ) AS my_pending_month_count
        `,
        db.ranking_memberships.findMany({
          where: {
            ranking_id: membership.ranking_id,
            is_suspended: true,
          },
          select: {
            user_id: true,
            license_position: true,
            position: true,
            users: {
              select: {
                first_name: true,
                last_name: true,
                nickname: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: [{ license_position: "asc" }, { position: "asc" }],
        }),
      ])
    : Promise.resolve(null)

  const [receivedChallengesRaw, myChallenges, recentResultsRaw, openRankingRound, openGlobalRound, statsPayload] =
    await Promise.all([
      receivedChallengesPromise,
      myChallengesPromise,
      recentResultsPromise,
      openRankingRoundPromise,
      openGlobalRoundPromise,
      statsPromise,
    ])
  const baseQueryMs = performance.now() - baseQueryStartedAt
  const roundQueryMs = performance.now() - roundQueryStartedAt

  const currentRound = openRankingRound ?? openGlobalRound ?? null

  let activePlayers = 0
  let bluePoints = 0
  let challengeMonthCount = 0
  let pendingMonthCount = 0
  let myPendingMonthCount = 0
  let suspendedMembers: Array<{
    user_id: number
    license_position: number | null
    position: number | null
    users: {
      first_name: string
      last_name: string
      nickname: string | null
      avatarUrl: string | null
    }
  }> = []
  const statsQueryMs = membership ? performance.now() - statsQueryStartedAt : 0

  if (membership && statsPayload) {
    const [statsRows, suspendedRows] = statsPayload
    const stats = statsRows[0]

    activePlayers = toCount(stats?.active_players)
    bluePoints = toCount(stats?.blue_points)
    challengeMonthCount = toCount(stats?.challenge_month_count)
    pendingMonthCount = toCount(stats?.pending_month_count)
    myPendingMonthCount = toCount(stats?.my_pending_month_count)
    suspendedMembers = suspendedRows
  }

  const licensePlayers = suspendedMembers.filter(
    (membership) => membership.license_position !== null
  )
  const inactivePlayers = suspendedMembers.filter(
    (membership) => membership.license_position === null
  )

  const receivedChallenges = receivedChallengesRaw
    .map((challenge) => ({
      ...challenge,
      normalized_status: resolveChallengeStatus({
        status: challenge.status,
        winner: challenge.winner,
        played_at: challenge.played_at,
        challenger_games: challenge.challenger_games,
        challenged_games: challenge.challenged_games,
        challenger_walkover: challenge.challenger_walkover,
        challenged_walkover: challenge.challenged_walkover,
      }),
    }))
    .filter(
      (challenge) =>
        challenge.normalized_status === "scheduled" ||
        challenge.normalized_status === "accepted" ||
        challenge.normalized_status === "declined"
    )
    .slice(0, 3)

  const recentResults = recentResultsRaw

  const dataPayload = {
    viewerId: userId,
    isAdmin,
    defaultRanking: membership
      ? {
          id: membership.rankings.id,
          name: membership.rankings.name,
          slug: membership.rankings.slug,
          position: membership.position ?? null,
        }
      : null,
    round: currentRound
      ? {
          id: currentRound.id,
          title: currentRound.title,
          referenceMonth: currentRound.reference_month.toISOString(),
          rankingName: membership?.rankings.name ?? "Geral",
          bluePointOpensAt: currentRound.blue_point_opens_at.toISOString(),
          openChallengesAt: currentRound.open_challenges_at.toISOString(),
          matchesDeadline: currentRound.matches_deadline.toISOString(),
          status: currentRound.status,
        }
      : null,
    stats: {
      activePlayers,
      bluePoints,
      challengeMonthCount,
      pendingMonthCount,
      myPendingCount: myPendingMonthCount,
      myPosition: membership?.position ?? null,
    },
    licensePlayers: licensePlayers.map((membership) => ({
      id: membership.user_id,
      name: formatName(
        membership.users.first_name,
        membership.users.last_name,
        membership.users.nickname
      ),
      avatarUrl: membership.users.avatarUrl ?? null,
    })),
    inactivePlayers: inactivePlayers.map((membership) => ({
      id: membership.user_id,
      name: formatName(
        membership.users.first_name,
        membership.users.last_name,
        membership.users.nickname
      ),
      avatarUrl: membership.users.avatarUrl ?? null,
    })),
    received: receivedChallenges.map((challenge) => ({
      id: challenge.id,
      status: challenge.normalized_status,
      scheduledFor: challenge.scheduled_for.toISOString(),
      opponent: formatName(
        challenge.users_challenges_challenger_idTousers.first_name,
        challenge.users_challenges_challenger_idTousers.last_name,
        challenge.users_challenges_challenger_idTousers.nickname
      ),
    })),
    myChallenges: myChallenges.map((challenge) => ({
      id: challenge.id,
      status: resolveChallengeStatus({
        status: challenge.status,
        winner: challenge.winner,
        played_at: challenge.played_at,
        challenger_games: challenge.challenger_games,
        challenged_games: challenge.challenged_games,
        challenger_walkover: challenge.challenger_walkover,
        challenged_walkover: challenge.challenged_walkover,
      }),
      scheduledFor: challenge.scheduled_for.toISOString(),
      ranking: challenge.rankings.name,
      isChallenger: challenge.challenger_id === userId,
      challenger: {
        id: challenge.challenger_id,
        name: formatName(
          challenge.users_challenges_challenger_idTousers.first_name,
          challenge.users_challenges_challenger_idTousers.last_name,
          challenge.users_challenges_challenger_idTousers.nickname
        ),
        avatarUrl: challenge.users_challenges_challenger_idTousers.avatarUrl ?? null,
      },
      challenged: {
        id: challenge.challenged_id,
        name: formatName(
          challenge.users_challenges_challenged_idTousers.first_name,
          challenge.users_challenges_challenged_idTousers.last_name,
          challenge.users_challenges_challenged_idTousers.nickname
        ),
        avatarUrl: challenge.users_challenges_challenged_idTousers.avatarUrl ?? null,
      },
    })),
    recentResults: recentResults.map((challenge) => ({
      winner: resolveChallengeWinner({
        winner: challenge.winner,
        challenger_games: challenge.challenger_games,
        challenged_games: challenge.challenged_games,
        challenger_walkover: challenge.challenger_walkover,
        challenged_walkover: challenge.challenged_walkover,
      }),
      id: challenge.id,
      playedAt: challenge.played_at?.toISOString() ?? null,
      result: resolveChallengeResultForUser({
        userId,
        challengerId: challenge.challenger_id,
        challengedId: challenge.challenged_id,
        winner: challenge.winner,
        challenger_games: challenge.challenger_games,
        challenged_games: challenge.challenged_games,
        challenger_walkover: challenge.challenger_walkover,
        challenged_walkover: challenge.challenged_walkover,
      }),
      challenger: {
        id: challenge.challenger_id,
        name: formatName(
          challenge.users_challenges_challenger_idTousers.first_name,
          challenge.users_challenges_challenger_idTousers.last_name,
          challenge.users_challenges_challenger_idTousers.nickname
        ),
      },
      challenged: {
        id: challenge.challenged_id,
        name: formatName(
          challenge.users_challenges_challenged_idTousers.first_name,
          challenge.users_challenges_challenged_idTousers.last_name,
          challenge.users_challenges_challenged_idTousers.nickname
        ),
      },
      score: {
        challengerGames: challenge.challenger_games,
        challengedGames: challenge.challenged_games,
        challengerTiebreak: challenge.challenger_tiebreak,
        challengedTiebreak: challenge.challenged_tiebreak,
        challengerWalkover: Boolean(challenge.challenger_walkover),
        challengedWalkover: Boolean(challenge.challenged_walkover),
      },
    })),
  }

  writeDashboardCache(cacheKey, dataPayload)
  resolveInFlight?.({
    dataPayload,
    baseQueryMs,
    roundQueryMs,
    statsQueryMs,
  })

  const response = NextResponse.json({
    ok: true,
    data: dataPayload,
  })
  applyResponseMeta(response, [
      ["session", sessionMs],
      ["base", baseQueryMs],
      ["round", roundQueryMs],
      ["stats", statsQueryMs],
      ["total", performance.now() - startedAt],
    ])
  return response
  } catch (error) {
    rejectInFlight?.(error)
    const response = NextResponse.json(
      { ok: false, message: "Erro ao carregar dashboard." },
      { status: 500 }
    )
    applyResponseMeta(
      response,
      [
        ["session", sessionMs],
        ["total", performance.now() - startedAt],
      ],
      { noStore: true }
    )
    return response
  } finally {
    if (dashboardInFlight.get(inFlightKey) === inFlightPromise) {
      dashboardInFlight.delete(inFlightKey)
    }
  }
}
