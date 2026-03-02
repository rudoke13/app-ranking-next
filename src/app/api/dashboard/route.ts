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

export async function GET() {
  const startedAt = performance.now()
  const buildTimingHeader = (entries: Array<[string, number]>) =>
    entries.map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`).join(", ")

  const session = await getSessionFromCookies()
  if (!session) {
    const response = NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
    response.headers.set(
      "Server-Timing",
      buildTimingHeader([["total", performance.now() - startedAt]])
    )
    return response
  }
  const sessionMs = performance.now() - startedAt

  const userId = Number(session.userId)
  if (!Number.isFinite(userId)) {
    const response = NextResponse.json(
      { ok: false, message: "Usuario invalido." },
      { status: 400 }
    )
    response.headers.set(
      "Server-Timing",
      buildTimingHeader([
        ["session", sessionMs],
        ["total", performance.now() - startedAt],
      ])
    )
    return response
  }

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthKey = monthKeyFromDate(monthStart)
  const nextMonth = new Date(monthStart)
  nextMonth.setMonth(nextMonth.getMonth() + 1)

  const baseQueryStartedAt = performance.now()
  const [membership, receivedChallengesRaw, myChallenges, recentResultsRaw] = await Promise.all([
    db.ranking_memberships.findFirst({
      where: { user_id: userId },
      select: {
        ranking_id: true,
        position: true,
        rankings: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { ranking_id: "asc" },
    }),
    db.challenges.findMany({
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
    }),
    db.challenges.findMany({
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
    }),
    db.challenges.findMany({
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
      take: 12,
    }),
  ])
  const baseQueryMs = performance.now() - baseQueryStartedAt

  const roundQueryStartedAt = performance.now()
  const rounds = await db.rounds.findMany({
    where: {
      reference_month: monthKey,
      OR: membership
        ? [{ ranking_id: membership.ranking_id }, { ranking_id: null }]
        : [{ ranking_id: null }],
    },
  })
  const roundQueryMs = performance.now() - roundQueryStartedAt

  const currentRound =
    rounds.find((round) => round.ranking_id === membership?.ranking_id) ??
    rounds.find((round) => round.ranking_id === null) ??
    null

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
  let statsQueryMs = 0

  if (membership) {
    type MembershipStatsRow = {
      active_players: unknown
      blue_points: unknown
    }
    type ChallengeStatsRow = {
      challenge_month_count: unknown
      pending_month_count: unknown
      my_pending_month_count: unknown
    }

    const statsQueryStartedAt = performance.now()
    const [membershipStatsRows, challengeStatsRows, suspendedRows] = await Promise.all([
      db.$queryRaw<MembershipStatsRow[]>`
        SELECT
          COUNT(*) FILTER (WHERE is_suspended = false) AS active_players,
          COUNT(*) FILTER (WHERE is_blue_point = true AND is_suspended = false) AS blue_points
        FROM ranking_memberships
        WHERE ranking_id = ${membership.ranking_id}
      `,
      db.$queryRaw<ChallengeStatsRow[]>`
        SELECT
          COUNT(*) FILTER (WHERE status <> 'cancelled') AS challenge_month_count,
          COUNT(*) FILTER (WHERE status IN ('scheduled', 'accepted')) AS pending_month_count,
          COUNT(*) FILTER (
            WHERE status IN ('scheduled', 'accepted')
              AND (challenger_id = ${userId} OR challenged_id = ${userId})
          ) AS my_pending_month_count
        FROM challenges
        WHERE ranking_id = ${membership.ranking_id}
          AND scheduled_for >= ${monthStart}
          AND scheduled_for < ${nextMonth}
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
    statsQueryMs = performance.now() - statsQueryStartedAt

    const membershipStats = membershipStatsRows[0]
    const challengeStats = challengeStatsRows[0]

    activePlayers = toCount(membershipStats?.active_players)
    bluePoints = toCount(membershipStats?.blue_points)
    challengeMonthCount = toCount(challengeStats?.challenge_month_count)
    pendingMonthCount = toCount(challengeStats?.pending_month_count)
    myPendingMonthCount = toCount(challengeStats?.my_pending_month_count)
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
    .slice()
    .sort((a, b) => {
      const timeA = a.played_at?.getTime() ?? a.scheduled_for.getTime() ?? a.id
      const timeB = b.played_at?.getTime() ?? b.scheduled_for.getTime() ?? b.id
      return timeB - timeA
    })
    .slice(0, 9)

  const response = NextResponse.json({
    ok: true,
    data: {
      viewerId: userId,
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
    },
  })
  response.headers.set(
    "Server-Timing",
    buildTimingHeader([
      ["session", sessionMs],
      ["base", baseQueryMs],
      ["round", roundQueryMs],
      ["stats", statsQueryMs],
      ["total", performance.now() - startedAt],
    ])
  )
  return response
}
