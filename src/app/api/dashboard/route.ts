import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"
import { monthKeyFromDate } from "@/lib/date"
import { db } from "@/lib/db"

const formatName = (first?: string | null, last?: string | null, nickname?: string | null) => {
  const full = `${first ?? ""} ${last ?? ""}`.trim()
  if (nickname && nickname.trim()) {
    return full ? `${full} "${nickname.trim()}"` : nickname.trim()
  }
  return full || "Jogador"
}

export async function GET() {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const userId = Number(session.userId)
  if (!Number.isFinite(userId)) {
    return NextResponse.json(
      { ok: false, message: "Usuario invalido." },
      { status: 400 }
    )
  }

  const membership = await db.ranking_memberships.findFirst({
    where: { user_id: userId },
    include: { rankings: true },
    orderBy: { ranking_id: "asc" },
  })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthKey = monthKeyFromDate(monthStart)
  const nextMonth = new Date(monthStart)
  nextMonth.setMonth(nextMonth.getMonth() + 1)

  const rounds = await db.rounds.findMany({
    where: {
      reference_month: monthKey,
      OR: [{ ranking_id: membership?.ranking_id ?? undefined }, { ranking_id: null }],
    },
  })

  const currentRound =
    rounds.find((round) => round.ranking_id === membership?.ranking_id) ??
    rounds.find((round) => round.ranking_id === null) ??
    null

  const [activePlayers, bluePoints, challengeMonthCount, pendingMonthCount, myPendingMonthCount] =
    membership
      ? await Promise.all([
          db.ranking_memberships.count({
            where: {
              ranking_id: membership.ranking_id,
              is_suspended: false,
            },
          }),
          db.ranking_memberships.count({
            where: {
              ranking_id: membership.ranking_id,
              is_blue_point: true,
              is_suspended: false,
            },
          }),
          db.challenges.count({
            where: {
              ranking_id: membership.ranking_id,
              scheduled_for: {
                gte: monthStart,
                lt: nextMonth,
              },
            },
          }),
          db.challenges.count({
            where: {
              ranking_id: membership.ranking_id,
              status: { in: ["scheduled", "accepted"] },
              scheduled_for: {
                gte: monthStart,
                lt: nextMonth,
              },
            },
          }),
          db.challenges.count({
            where: {
              ranking_id: membership.ranking_id,
              status: { in: ["scheduled", "accepted"] },
              scheduled_for: {
                gte: monthStart,
                lt: nextMonth,
              },
              OR: [{ challenger_id: userId }, { challenged_id: userId }],
            },
          }),
        ])
      : [0, 0, 0, 0, 0]

  const suspendedMembers = membership
    ? await db.ranking_memberships.findMany({
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
      })
    : []

  const licensePlayers = suspendedMembers.filter(
    (membership) => membership.license_position !== null
  )
  const inactivePlayers = suspendedMembers.filter(
    (membership) => membership.license_position === null
  )

  const receivedChallenges = await db.challenges.findMany({
    where: {
      challenged_id: userId,
      status: { in: ["scheduled", "accepted", "declined"] },
    },
    select: {
      id: true,
      status: true,
      scheduled_for: true,
      users_challenges_challenger_idTousers: {
        select: { first_name: true, last_name: true, nickname: true },
      },
    },
    orderBy: {
      scheduled_for: "desc",
    },
    take: 3,
  })

  const myChallenges = await db.challenges.findMany({
    where: {
      OR: [{ challenger_id: userId }, { challenged_id: userId }],
      status: { not: "cancelled" },
    },
    select: {
      id: true,
      status: true,
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

  const recentResults = await db.challenges.findMany({
    where: {
      OR: [{ challenger_id: userId }, { challenged_id: userId }],
      status: "completed",
    },
    select: {
      id: true,
      status: true,
      winner: true,
      played_at: true,
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
    orderBy: { played_at: "desc" },
    take: 3,
  })

  return NextResponse.json({
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
        status: challenge.status,
        scheduledFor: challenge.scheduled_for.toISOString(),
        opponent: formatName(
          challenge.users_challenges_challenger_idTousers.first_name,
          challenge.users_challenges_challenger_idTousers.last_name,
          challenge.users_challenges_challenger_idTousers.nickname
        ),
      })),
      myChallenges: myChallenges.map((challenge) => ({
        id: challenge.id,
        status: challenge.status,
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
        id: challenge.id,
        winner: challenge.winner,
        playedAt: challenge.played_at?.toISOString() ?? null,
        result:
          challenge.winner === null
            ? "pending"
            : challenge.winner === "challenger"
            ? challenge.challenger_id === userId
              ? "win"
              : "loss"
            : challenge.challenged_id === userId
            ? "win"
            : "loss",
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
}
