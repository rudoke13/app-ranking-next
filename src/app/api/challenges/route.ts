import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma } from "@prisma/client"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"
import {
  resolveChallengeStatus,
  resolveChallengeWinner,
} from "@/lib/challenges/result"
import { resolveChallengeWindows } from "@/lib/domain/challenges"
import { maxPositionsUp, ensureBaselineSnapshot, getAccessThreshold, monthStartFrom } from "@/lib/domain/ranking"
import { shiftMonthValue } from "@/lib/date"
import { hasAdminAccess } from "@/lib/domain/permissions"
import {
  readShowOtherRankingsFromCookieHeader,
  readVisibleRankingIdsFromCookieHeader,
} from "@/lib/preferences/ranking-visibility"
import { normalizeAppDateTimeInput, parseAppDateTime } from "@/lib/timezone"

export const dynamic = "force-dynamic"
export const revalidate = 0

const createSchema = z.object({
  ranking_id: z.number().int().positive(),
  challenged_id: z.number().int().positive(),
  challenger_id: z.number().int().positive().optional(),
  scheduled_for: z.string().optional(),
})

const listSchema = z.object({
  ranking: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  status: z.enum(["scheduled", "accepted", "declined", "completed", "cancelled"]).optional(),
  sort: z
    .enum([
      "recent",
      "oldest",
      "played_recent",
      "pending_first",
      "completed_first",
      "challenger",
    ])
    .optional(),
})

const formatName = (first?: string | null, last?: string | null, nickname?: string | null) => {
  const full = `${first ?? ""} ${last ?? ""}`.trim()
  if (nickname && nickname.trim()) {
    return full ? `${full} "${nickname.trim()}"` : nickname.trim()
  }
  return full || "Jogador"
}

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
} as const
const CHALLENGES_RESPONSE_CACHE_TTL_MS = 0
const MAX_CHALLENGES_RESPONSE_CACHE_ENTRIES = 300

type ChallengesResponsePayload = {
  ok: true
  data: {
    items: unknown[]
    isAdmin: boolean
  }
}
type ChallengesResponseCacheEntry = {
  payload: ChallengesResponsePayload
  cachedAt: number
}
const challengesResponseCache = new Map<string, ChallengesResponseCacheEntry>()
const challengesResponseInFlight = new Map<
  string,
  Promise<ChallengesResponsePayload>
>()

const jsonResponse = (body: unknown, init?: { status?: number }) =>
  NextResponse.json(body, {
    status: init?.status,
    headers: NO_STORE_HEADERS,
  })

const readChallengesResponseCache = (cacheKey: string) => {
  if (CHALLENGES_RESPONSE_CACHE_TTL_MS <= 0) return null
  const cached = challengesResponseCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() - cached.cachedAt > CHALLENGES_RESPONSE_CACHE_TTL_MS) {
    challengesResponseCache.delete(cacheKey)
    return null
  }
  return cached.payload
}

const writeChallengesResponseCache = (
  cacheKey: string,
  payload: ChallengesResponsePayload
) => {
  if (CHALLENGES_RESPONSE_CACHE_TTL_MS <= 0) return
  if (challengesResponseCache.size >= MAX_CHALLENGES_RESPONSE_CACHE_ENTRIES) {
    const oldestKey = challengesResponseCache.keys().next().value
    if (oldestKey) {
      challengesResponseCache.delete(oldestKey)
    }
  }
  challengesResponseCache.set(cacheKey, {
    payload,
    cachedAt: Date.now(),
  })
}

const toMonthStartUtc = (value: string) => {
  const [yearRaw, monthRaw] = value.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null
  if (month < 1 || month > 12) return null
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
}

export async function GET(request: Request) {
  let session: Awaited<ReturnType<typeof getSessionFromCookies>> = null
  try {
    session = await getSessionFromCookies()
  } catch (error) {
    console.error("[api/challenges][GET] session failed", error)
    return jsonResponse(
      { ok: false, message: "Erro interno ao validar sessao." },
      { status: 500 }
    )
  }

  if (!session) {
    return jsonResponse(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const parsed = listSchema.safeParse({
    ranking: searchParams.get("ranking") || undefined,
    month: searchParams.get("month") || undefined,
    status: searchParams.get("status") || undefined,
    sort: searchParams.get("sort") || undefined,
  })

  if (!parsed.success) {
    return jsonResponse(
      { ok: false, message: "Filtros invalidos." },
      { status: 400 }
    )
  }

  const isAdmin = hasAdminAccess(session)
  const viewerId = Number(session.userId)
  const isRestrictedToMembership =
    session.role === "player" || session.role === "member"
  const cookieHeader = request.headers.get("cookie")
  const showOtherRankings = readShowOtherRankingsFromCookieHeader(
    cookieHeader
  )
  const visibleRankingIdsPreference = readVisibleRankingIdsFromCookieHeader(
    cookieHeader
  )
  const restrictToLinkedRankings =
    isRestrictedToMembership && !showOtherRankings
  const rankingFilter = parsed.data.ranking
  const statusFilter = parsed.data.status
  const sortKey = parsed.data.sort ?? "recent"
  const freshParam = (searchParams.get("fresh") ?? "").toLowerCase()
  const forceFresh =
    freshParam === "1" || freshParam === "true" || freshParam === "yes"
  const visibilityKey = !isRestrictedToMembership
    ? "unrestricted"
    : restrictToLinkedRankings
    ? "linked-only"
    : visibleRankingIdsPreference === null
    ? "all-visible"
    : `selected-${visibleRankingIdsPreference.join(",") || "none"}`
  const responseCacheKey = `${session.role}:${session.userId}:${
    rankingFilter ?? "all"
  }:${parsed.data.month ?? "open"}:${statusFilter ?? "all"}:${sortKey}:${
    visibilityKey
  }`
  const inFlightKey = forceFresh ? `${responseCacheKey}:fresh` : responseCacheKey

  if (forceFresh) {
    challengesResponseCache.delete(responseCacheKey)
  } else {
    const cached = readChallengesResponseCache(responseCacheKey)
    if (cached) {
      return jsonResponse(cached)
    }
  }
  const pendingCached = challengesResponseInFlight.get(inFlightKey)
  if (pendingCached) {
    const payload = await pendingCached
    return jsonResponse(payload)
  }

  const pending = (async (): Promise<ChallengesResponsePayload> => {
  const useDbSort =
    sortKey === "recent" || sortKey === "oldest" || sortKey === "played_recent"

  const monthValue = parsed.data.month
  const monthStart = monthValue ? toMonthStartUtc(monthValue) : null
  const nextMonth = monthValue
    ? toMonthStartUtc(shiftMonthValue(monthValue, 1))
    : null

  const linkedRankingIds =
    isRestrictedToMembership && Number.isFinite(viewerId)
      ? (
          await db.ranking_memberships.findMany({
            where: { user_id: viewerId },
            select: { ranking_id: true },
          })
        ).map((membership) => membership.ranking_id)
      : []
  const linkedRankingSet = new Set(linkedRankingIds)
  let visibleRankingIdsForViewer: number[] | null = null

  if (isRestrictedToMembership) {
    if (restrictToLinkedRankings) {
      visibleRankingIdsForViewer = linkedRankingIds
    } else {
      const activeRankings = await db.rankings.findMany({
        where: { is_active: true },
        select: { id: true, only_for_enrolled_players: true },
      })
      const allowedRankingIds = activeRankings
        .filter(
          (ranking) =>
            !ranking.only_for_enrolled_players ||
            linkedRankingSet.has(ranking.id)
        )
        .map((ranking) => ranking.id)

      if (visibleRankingIdsPreference === null) {
        visibleRankingIdsForViewer = allowedRankingIds
      } else {
        const selectedRankingSet = new Set([
          ...linkedRankingIds,
          ...visibleRankingIdsPreference,
        ])
        visibleRankingIdsForViewer = allowedRankingIds.filter((rankingId) =>
          selectedRankingSet.has(rankingId)
        )
      }
    }
  }

  if (
    isRestrictedToMembership &&
    (visibleRankingIdsForViewer?.length ?? 0) === 0
  ) {
    const responseBody: ChallengesResponsePayload = {
      ok: true,
      data: { items: [], isAdmin },
    }
    writeChallengesResponseCache(responseCacheKey, responseBody)
    return responseBody
  }

  let rankingId: number | null = null
  if (rankingFilter) {
    const asNumber = Number(rankingFilter)
    if (Number.isFinite(asNumber)) {
      rankingId = asNumber
    } else {
      const ranking = await db.rankings.findUnique({
        where: { slug: rankingFilter },
        select: { id: true },
      })
      rankingId = ranking?.id ?? null
    }
  }

  if (
    isRestrictedToMembership &&
    rankingId &&
    !(visibleRankingIdsForViewer ?? []).includes(rankingId)
  ) {
    const responseBody: ChallengesResponsePayload = {
      ok: true,
      data: { items: [], isAdmin },
    }
    writeChallengesResponseCache(responseCacheKey, responseBody)
    return responseBody
  }

  const where: Record<string, unknown> = {}

  if (statusFilter === "cancelled") {
    where.status = "cancelled"
  } else if (
    statusFilter === "scheduled" ||
    statusFilter === "accepted" ||
    statusFilter === "declined"
  ) {
    where.status = statusFilter
  } else if (statusFilter === "completed") {
    where.status = { not: "cancelled" }
    where.OR = [
      { status: "completed" },
      { winner: { not: null } },
      { played_at: { not: null } },
      { challenger_games: { not: null } },
      { challenged_games: { not: null } },
      { challenger_walkover: true },
      { challenged_walkover: true },
    ]
  } else {
    where.status = { not: "cancelled" }
  }

  if (rankingId) {
    where.ranking_id = rankingId
  } else if (isRestrictedToMembership) {
    where.ranking_id = { in: visibleRankingIdsForViewer ?? [] }
  }

  if (monthStart && nextMonth) {
    where.scheduled_for = {
      gte: monthStart,
      lt: nextMonth,
    }
  }

  if (!isAdmin) {
    where.rankings = { is_active: true }
  }

  const orderBy = useDbSort
    ? sortKey === "oldest"
      ? [{ played_at: "asc" as const }, { scheduled_for: "asc" as const }, { created_at: "asc" as const }, { id: "asc" as const }]
      : [{ played_at: "desc" as const }, { scheduled_for: "desc" as const }, { created_at: "desc" as const }, { id: "desc" as const }]
    : undefined

  const challenges = await db.challenges.findMany({
    where,
    orderBy,
    select: {
      id: true,
      status: true,
      winner: true,
      ranking_id: true,
      scheduled_for: true,
      played_at: true,
      created_at: true,
      challenger_games: true,
      challenged_games: true,
      challenger_tiebreak: true,
      challenged_tiebreak: true,
      challenger_walkover: true,
      challenged_walkover: true,
      challenger_retired: true,
      challenged_retired: true,
      challenger_id: true,
      challenged_id: true,
      rankings: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
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
  })

  const nowMs = Date.now()
  const preparedChallenges: Array<{
    challenge: (typeof challenges)[number]
    ranking: NonNullable<(typeof challenges)[number]["rankings"]>
    challenger: (typeof challenges)[number]["users_challenges_challenger_idTousers"]
    challenged: (typeof challenges)[number]["users_challenges_challenged_idTousers"]
    normalizedStatus: ReturnType<typeof resolveChallengeStatus>
    resolvedWinner: ReturnType<typeof resolveChallengeWinner>
    sortTime: number
    playedAtTime: number
    challengerName: string
    challengedName: string
  }> = []

  for (const challenge of challenges) {
    const normalizedStatus = resolveChallengeStatus({
      status: challenge.status,
      winner: challenge.winner,
      played_at: challenge.played_at,
      challenger_games: challenge.challenger_games,
      challenged_games: challenge.challenged_games,
      challenger_walkover: challenge.challenger_walkover,
      challenged_walkover: challenge.challenged_walkover,
    })

    if (
      statusFilter &&
      statusFilter !== "cancelled" &&
      normalizedStatus !== statusFilter
    ) {
      continue
    }

    const ranking = challenge.rankings
    const challenger = challenge.users_challenges_challenger_idTousers
    const challenged = challenge.users_challenges_challenged_idTousers

    if (!ranking || !challenger || !challenged) {
      continue
    }

    preparedChallenges.push({
      challenge,
      ranking,
      challenger,
      challenged,
      normalizedStatus,
      resolvedWinner: resolveChallengeWinner({
        winner: challenge.winner,
        challenger_games: challenge.challenger_games,
        challenged_games: challenge.challenged_games,
        challenger_walkover: challenge.challenger_walkover,
        challenged_walkover: challenge.challenged_walkover,
      }),
      sortTime:
        challenge.played_at?.getTime() ??
        challenge.scheduled_for?.getTime() ??
        challenge.created_at?.getTime() ??
        0,
      playedAtTime: challenge.played_at?.getTime() ?? 0,
      challengerName: formatName(
        challenger.first_name,
        challenger.last_name,
        challenger.nickname
      ),
      challengedName: formatName(
        challenged.first_name,
        challenged.last_name,
        challenged.nickname
      ),
    })
  }

  const sorted = useDbSort
    ? preparedChallenges
    : preparedChallenges.sort((a, b) => {
        switch (sortKey) {
          case "pending_first":
            return (
              (a.normalizedStatus === "scheduled" ||
              a.normalizedStatus === "accepted"
                ? 0
                : 1) -
                (b.normalizedStatus === "scheduled" ||
                b.normalizedStatus === "accepted"
                  ? 0
                  : 1) ||
              a.sortTime - b.sortTime
            )
          case "completed_first":
            return (
              (a.normalizedStatus === "completed" ? 0 : 1) -
                (b.normalizedStatus === "completed" ? 0 : 1) ||
              b.playedAtTime - a.playedAtTime
            )
          case "challenger":
            return a.challengerName.localeCompare(b.challengerName)
          default:
            return b.sortTime - a.sortTime
        }
      })

  const data = sorted.map((entry) => {
    const challenge = entry.challenge
    const { ranking, challenger, challenged } = entry
    const scheduledFor =
      challenge.scheduled_for ?? challenge.played_at ?? challenge.created_at

    if (!scheduledFor) {
      return null
    }

    const isChallenger = viewerId === challenge.challenger_id
    const isChallenged = viewerId === challenge.challenged_id
    const createdAt = challenge.created_at?.getTime() ?? 0
    const cancelWindowOpen = nowMs - createdAt <= 5 * 60 * 1000
    const cancelWindowClosesAt = challenge.created_at
      ? new Date(challenge.created_at.getTime() + 5 * 60 * 1000).toISOString()
      : null

    const canCancel =
      (entry.normalizedStatus === "scheduled" ||
        (isAdmin && entry.normalizedStatus === "accepted")) &&
      (isChallenger || isAdmin) &&
      (isAdmin || cancelWindowOpen)

    const canResult =
      (entry.normalizedStatus === "accepted" ||
        (entry.normalizedStatus === "scheduled" &&
          (isAdmin || !cancelWindowOpen))) &&
      (isChallenger || isChallenged || isAdmin)

    return {
      id: challenge.id,
      status: entry.normalizedStatus,
      winner: entry.resolvedWinner,
      ranking: {
        id: ranking.id,
        name: ranking.name,
        slug: ranking.slug,
      },
      scheduledFor: scheduledFor.toISOString(),
      playedAt: challenge.played_at?.toISOString() ?? null,
      challengerGames: challenge.challenger_games ?? null,
      challengedGames: challenge.challenged_games ?? null,
      challengerTiebreak: challenge.challenger_tiebreak ?? null,
      challengedTiebreak: challenge.challenged_tiebreak ?? null,
      challengerWalkover: Boolean(challenge.challenger_walkover),
      challengedWalkover: Boolean(challenge.challenged_walkover),
      challengerRetired: Boolean(challenge.challenger_retired),
      challengedRetired: Boolean(challenge.challenged_retired),
      challenger: {
        id: challenger.id,
        name: entry.challengerName,
        avatarUrl: challenger.avatarUrl ?? null,
      },
      challenged: {
        id: challenged.id,
        name: entry.challengedName,
        avatarUrl: challenged.avatarUrl ?? null,
      },
      cancelWindowOpen,
      cancelWindowClosesAt,
      canCancel,
      canResult,
    }
  }).filter((item): item is NonNullable<typeof item> => Boolean(item))

  const responseBody: ChallengesResponsePayload = {
    ok: true,
    data: {
      items: data,
      isAdmin,
    },
  }

  writeChallengesResponseCache(responseCacheKey, responseBody)
  return responseBody
  })()

  challengesResponseInFlight.set(inFlightKey, pending)
  let payload: ChallengesResponsePayload
  try {
    payload = await pending
  } catch (error) {
    console.error("[api/challenges][GET] failed", error)
    return jsonResponse(
      { ok: false, message: "Erro interno ao carregar desafios." },
      { status: 500 }
    )
  } finally {
    if (challengesResponseInFlight.get(inFlightKey) === pending) {
      challengesResponseInFlight.delete(inFlightKey)
    }
  }

  return jsonResponse(payload)
}

export async function POST(request: Request) {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const isAdmin = hasAdminAccess(session)

  const payload = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(payload)

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const rankingId = parsed.data.ranking_id
  const challengedId = parsed.data.challenged_id
  const challengerId =
    isAdmin && parsed.data.challenger_id
      ? parsed.data.challenger_id
      : Number(session.userId)

  if (challengerId === challengedId) {
    return NextResponse.json(
      { ok: false, message: "Nao e possivel desafiar a si mesmo." },
      { status: 422 }
    )
  }

  const ranking = await db.rankings.findUnique({
    where: { id: rankingId },
  })

  if (!ranking || (!ranking.is_active && !isAdmin)) {
    return NextResponse.json(
      { ok: false, message: "Ranking invalido." },
      { status: 404 }
    )
  }

  const [challengerMembership, challengedMembership] = await Promise.all([
    db.ranking_memberships.findFirst({
      where: { ranking_id: rankingId, user_id: challengerId },
    }),
    db.ranking_memberships.findFirst({
      where: { ranking_id: rankingId, user_id: challengedId },
    }),
  ])

  if (!challengerMembership || !challengedMembership) {
    return NextResponse.json(
      {
        ok: false,
        message: "Ambos os jogadores precisam estar inscritos no ranking.",
      },
      { status: 422 }
    )
  }

  const now = new Date()
  if (!isAdmin) {
    const window = await resolveChallengeWindows(rankingId, now)

    if (now < window.roundStart) {
      return NextResponse.json(
        {
          ok: false,
          message: `A rodada ainda nao iniciou. Desafios liberados a partir de ${window.roundStart.toLocaleString("pt-BR")}.`,
        },
        { status: 422 }
      )
    }

    if (window.roundEnd && now > window.roundEnd) {
      return NextResponse.json(
        { ok: false, message: "O periodo desta rodada ja foi encerrado." },
        { status: 422 }
      )
    }

    if (now < window.blueStart) {
      return NextResponse.json(
        {
          ok: false,
          message: `Os desafios ainda nao estao liberados. A janela de ponto azul inicia em ${window.blueStart.toLocaleString("pt-BR")}.`,
        },
        { status: 422 }
      )
    }

    const bluePhaseEnd = window.blueEnd ?? window.openStart
    const isBluePhase = now < bluePhaseEnd

    if (isBluePhase) {
      if (!challengerMembership.is_blue_point) {
        return NextResponse.json(
          {
            ok: false,
            message: "Neste periodo apenas jogadores ponto azul podem desafiar.",
          },
          { status: 422 }
        )
      }
      if (challengedMembership.is_blue_point) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Durante o ponto azul nao e permitido desafiar outro jogador ponto azul.",
          },
          { status: 422 }
        )
      }
    } else {
      if (now < window.openStart) {
        return NextResponse.json(
          {
            ok: false,
            message: `Os desafios livres serao liberados em ${window.openStart.toLocaleString("pt-BR")}.`,
          },
          { status: 422 }
        )
      }

      if (window.openEnd && now > window.openEnd) {
        return NextResponse.json(
          {
            ok: false,
            message: "O periodo de desafios livres para este ranking ja encerrou.",
          },
          { status: 422 }
        )
      }

      if (challengerMembership.is_blue_point) {
        const bluePhaseStart = window.blueStart
        const bluePhaseEnd = window.blueEnd ?? window.openStart
        const blueStatuses: Array<"scheduled" | "accepted" | "completed"> = [
          "scheduled",
          "accepted",
          "completed",
        ]
        const challengedDuringBlue = await db.challenges.findFirst({
          where: {
            ranking_id: rankingId,
            challenger_id: challengerId,
            status: { in: blueStatuses },
            scheduled_for: {
              gte: bluePhaseStart,
              lt: bluePhaseEnd,
            },
          },
          select: { id: true },
        })

        if (challengedDuringBlue) {
          return NextResponse.json(
            {
              ok: false,
              message:
                "Na janela livre, ponto azul so pode desafiar se NAO tiver desafiado durante a janela de ponto azul.",
            },
            { status: 422 }
          )
        }
      }
    }

    if (challengerMembership.is_access_challenge) {
      if (now < window.openStart) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Jogadores de acesso so podem desafiar no periodo de desafios livres.",
          },
          { status: 422 }
        )
      }

      if (window.openEnd && now > window.openEnd) {
        return NextResponse.json(
          {
            ok: false,
            message: "Periodo de desafios livres encerrado para este ranking.",
          },
          { status: 422 }
        )
      }

      const accessLimit = getAccessThreshold(ranking.slug)
      if (accessLimit) {
        const totalMembers = await db.ranking_memberships.count({
          where: { ranking_id: rankingId },
        })
        const threshold = Math.min(accessLimit, totalMembers)
        if ((challengedMembership.position ?? 0) < threshold) {
          return NextResponse.json(
            {
              ok: false,
              message: `Jogadores de acesso so podem desafiar a partir da posicao ${threshold}.`,
            },
            { status: 422 }
          )
        }
      }
    }
  }

  const challengerPosition = challengerMembership.position ?? 0
  const challengedPosition = challengedMembership.position ?? 0

  if (!isAdmin) {
    if (
      !challengerMembership.is_access_challenge &&
      challengerPosition > 0 &&
      challengedPosition > 0
    ) {
      const difference = challengerPosition - challengedPosition
      if (difference > maxPositionsUp()) {
        return NextResponse.json(
          {
            ok: false,
            message: `Voce so pode desafiar ate ${maxPositionsUp()} posicoes acima.`,
          },
          { status: 422 }
        )
      }
    }
  }

  const scheduledFor = isAdmin
    ? parseAppDateTime(normalizeAppDateTimeInput(parsed.data.scheduled_for)) ?? now
    : now
  const monthStart = monthStartFrom(scheduledFor)
  const monthEnd = new Date(monthStart)
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1)
  const challengeWindowStatuses: Array<"scheduled" | "accepted" | "completed"> =
    ["scheduled", "accepted", "completed"]
  // Regra de bloqueio por periodo:
  // o desafio sempre pertence ao mes da rodada em que foi agendado (scheduled_for),
  // nao ao mes em que foi marcado como concluido (played_at).
  // Isso evita travar jogador no mes seguinte por resultado lancado atrasado.
  const roundPeriodFilter: Prisma.challengesWhereInput = {
    scheduled_for: {
      gte: monthStart,
      lt: monthEnd,
    },
  }

  if (!isAdmin) {
    const [challengerAlreadyInPeriod, targetAlreadyChallenged, pairChallenge] = await Promise.all([
      db.challenges.findFirst({
        where: {
          ranking_id: rankingId,
          status: { in: challengeWindowStatuses },
          AND: [
            {
              OR: [
                { challenger_id: challengerId },
                { challenged_id: challengerId },
              ],
            },
            roundPeriodFilter,
          ],
        },
        select: { id: true },
      }),
      db.challenges.findFirst({
        where: {
          ranking_id: rankingId,
          status: { in: challengeWindowStatuses },
          challenged_id: challengedId,
          ...roundPeriodFilter,
        },
        select: { id: true },
      }),
      db.challenges.findFirst({
        where: {
          ranking_id: rankingId,
          status: { in: challengeWindowStatuses },
          challenger_id: challengerId,
          challenged_id: challengedId,
          ...roundPeriodFilter,
        },
        select: { id: true },
      }),
    ])

    if (targetAlreadyChallenged) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Este jogador ja foi desafiado nesta rodada. O primeiro desafio confirmado prevalece.",
        },
        { status: 422 }
      )
    }

    if (challengerAlreadyInPeriod) {
      return NextResponse.json(
        {
          ok: false,
          message: "Jogadores ja registraram desafio neste periodo.",
        },
        { status: 422 }
      )
    }

    if (pairChallenge) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Este confronto ja esta registrado nesta rodada. Aguarde a proxima rodada.",
        },
        { status: 422 }
      )
    }
  }

  await ensureBaselineSnapshot(rankingId, monthStart)

  const created = await db.$transaction(async (tx) => {
    if (!isAdmin) {
      // Serialize attempts against the same challenged player in this ranking
      // so the first committed click wins under concurrent requests.
      const challengedLockNamespace = -Math.abs(rankingId)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${challengedLockNamespace}, ${challengedId})`

      const lockUserIds =
        challengerId === challengedId
          ? [challengerId]
          : [Math.min(challengerId, challengedId), Math.max(challengerId, challengedId)]

      for (const lockUserId of lockUserIds) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${rankingId}, ${lockUserId})`
      }

      const [targetAlreadyChallenged, challengerAlreadyInPeriod, pairChallenge] =
        await Promise.all([
          tx.challenges.findFirst({
            where: {
              ranking_id: rankingId,
              challenged_id: challengedId,
              status: { in: challengeWindowStatuses },
              ...roundPeriodFilter,
            },
            select: { id: true },
          }),
          tx.challenges.findFirst({
            where: {
              ranking_id: rankingId,
              status: { in: challengeWindowStatuses },
              AND: [
                {
                  OR: [
                    { challenger_id: challengerId },
                    { challenged_id: challengerId },
                  ],
                },
                roundPeriodFilter,
              ],
            },
            select: { id: true },
          }),
          tx.challenges.findFirst({
            where: {
              ranking_id: rankingId,
              status: { in: challengeWindowStatuses },
              challenger_id: challengerId,
              challenged_id: challengedId,
              ...roundPeriodFilter,
            },
            select: { id: true },
          }),
        ])

      if (targetAlreadyChallenged) {
        return {
          ok: false as const,
          status: 422,
          message:
            "Este jogador ja foi desafiado nesta rodada. O primeiro desafio confirmado prevalece.",
        }
      }

      if (challengerAlreadyInPeriod) {
        return {
          ok: false as const,
          status: 422,
          message: "Jogadores ja registraram desafio neste periodo.",
        }
      }

      if (pairChallenge) {
        return {
          ok: false as const,
          status: 422,
          message:
            "Este confronto ja esta registrado nesta rodada. Aguarde a proxima rodada.",
        }
      }
    }

    const challenge = await tx.challenges.create({
      data: {
        ranking_id: rankingId,
        challenger_id: challengerId,
        challenged_id: challengedId,
        scheduled_for: scheduledFor,
        challenger_position_at_challenge: challengerPosition || null,
        challenged_position_at_challenge: challengedPosition || null,
        status: "scheduled",
        winner: null,
      },
    })

    await tx.challenge_events.create({
      data: {
        challenge_id: challenge.id,
        event_type: "created",
        payload: {
          ranking_id: rankingId,
          challenger_id: challengerId,
          challenged_id: challengedId,
          scheduled_for: scheduledFor.toISOString(),
          challenger_position_at_challenge: challengerPosition,
          challenged_position_at_challenge: challengedPosition,
          status: "scheduled",
        },
        created_by: challengerId,
      },
    })

    return { ok: true as const, challenge }
  })

  if (!created.ok) {
    return NextResponse.json(
      { ok: false, message: created.message },
      { status: created.status }
    )
  }

  challengesResponseCache.clear()

  return NextResponse.json(
    { ok: true, data: { id: created.challenge.id } },
    { status: 201 }
  )
}
