import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
} as const
const PRIVATE_SHORT_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=8, stale-while-revalidate=24",
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

type RankingPayloadItem = {
  id: number
  name: string
  slug: string
  description: string | null
  activePlayers: number
  isUserMember: boolean
}

type RankingsCacheEntry = {
  cachedAt: number
  data: RankingPayloadItem[]
}

const RANKINGS_CACHE_TTL_MS = 20_000
const MAX_RANKINGS_CACHE_ENTRIES = 300
const rankingsCache = new Map<string, RankingsCacheEntry>()
const rankingsInFlight = new Map<string, Promise<RankingPayloadItem[]>>()

const readCache = (cacheKey: string) => {
  const cached = rankingsCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() - cached.cachedAt > RANKINGS_CACHE_TTL_MS) {
    rankingsCache.delete(cacheKey)
    return null
  }
  return cached.data
}

const writeCache = (cacheKey: string, data: RankingPayloadItem[]) => {
  if (rankingsCache.size >= MAX_RANKINGS_CACHE_ENTRIES) {
    const oldestKey = rankingsCache.keys().next().value
    if (oldestKey) {
      rankingsCache.delete(oldestKey)
    }
  }
  rankingsCache.set(cacheKey, {
    cachedAt: Date.now(),
    data,
  })
}

export async function GET(request: Request) {
  const session = await getSessionFromCookies()
  if (!session) {
    return jsonResponse(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const userId = Number(session.userId)
  const isAdmin = session.role === "admin"
  const isRestrictedToMembership =
    session.role === "player" || session.role === "member"
  const shouldLoadMemberships =
    Number.isFinite(userId) && isRestrictedToMembership
  const cacheKey = `${session.role}:${Number.isFinite(userId) ? userId : "anonymous"}`
  const searchParams = new URL(request.url).searchParams
  const freshParam = (searchParams.get("fresh") ?? "").toLowerCase()
  const forceFresh =
    freshParam === "1" || freshParam === "true" || freshParam === "yes"

  if (forceFresh) {
    rankingsCache.delete(cacheKey)
  } else {
    const cached = readCache(cacheKey)
    if (cached) {
      return jsonResponse({ ok: true, data: cached })
    }

    const pending = rankingsInFlight.get(cacheKey)
    if (pending) {
      const pendingData = await pending
      return jsonResponse({ ok: true, data: pendingData })
    }
  }

  const fetchRankings = async (): Promise<RankingPayloadItem[]> => {
    const [userMemberships, rankings] = await Promise.all([
      shouldLoadMemberships
        ? db.ranking_memberships.findMany({
            where: { user_id: userId },
            select: { ranking_id: true },
          })
        : Promise.resolve([]),
      db.rankings.findMany({
        where: isAdmin ? undefined : { is_active: true },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          only_for_enrolled_players: true,
        },
        orderBy: { name: "asc" },
      }),
    ])

    const membershipIds = userMemberships.map((item) => item.ranking_id)
    const memberSet = new Set(membershipIds)
    const visibleRankings = isRestrictedToMembership
      ? rankings.filter(
          (ranking) =>
            !ranking.only_for_enrolled_players || memberSet.has(ranking.id)
        )
      : rankings

    const visibleRankingIds = visibleRankings.map((ranking) => ranking.id)
    const counts = visibleRankingIds.length
      ? await db.ranking_memberships.groupBy({
          by: ["ranking_id"],
          where: {
            is_suspended: false,
            ranking_id: { in: visibleRankingIds },
          },
          _count: { _all: true },
        })
      : []

    const countMap = new Map(
      counts.map((item) => [item.ranking_id, item._count._all])
    )

    return visibleRankings.map((ranking) => ({
      id: ranking.id,
      name: ranking.name,
      slug: ranking.slug,
      description: ranking.description,
      activePlayers: countMap.get(ranking.id) ?? 0,
      isUserMember: memberSet.has(ranking.id),
    }))
  }

  const pending = fetchRankings()
  if (!forceFresh) {
    rankingsInFlight.set(cacheKey, pending)
  }
  const payload = await pending.finally(() => {
    if (rankingsInFlight.get(cacheKey) === pending) {
      rankingsInFlight.delete(cacheKey)
    }
  })

  writeCache(cacheKey, payload)

  return jsonResponse({ ok: true, data: payload })
}
