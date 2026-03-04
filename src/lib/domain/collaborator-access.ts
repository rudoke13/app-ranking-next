import type { SessionPayload } from "@/lib/auth/types"
import { db } from "@/lib/db"

export type AllowedRankingIds = number[] | null

type CollaboratorRankingCacheEntry = {
  rankingIds: number[]
  expiresAt: number
}

type CollaboratorAccessGlobal = typeof globalThis & {
  __collaboratorRankingIdsCache?: Map<number, CollaboratorRankingCacheEntry>
  __collaboratorRankingIdsInFlight?: Map<number, Promise<number[]>>
}

const collaboratorAccessGlobal = globalThis as CollaboratorAccessGlobal
const collaboratorRankingIdsCache =
  collaboratorAccessGlobal.__collaboratorRankingIdsCache ?? new Map()
const collaboratorRankingIdsInFlight =
  collaboratorAccessGlobal.__collaboratorRankingIdsInFlight ?? new Map()

if (!collaboratorAccessGlobal.__collaboratorRankingIdsCache) {
  collaboratorAccessGlobal.__collaboratorRankingIdsCache =
    collaboratorRankingIdsCache
}

if (!collaboratorAccessGlobal.__collaboratorRankingIdsInFlight) {
  collaboratorAccessGlobal.__collaboratorRankingIdsInFlight =
    collaboratorRankingIdsInFlight
}

const COLLABORATOR_RANKING_IDS_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.COLLABORATOR_RANKING_IDS_CACHE_TTL_MS ?? "60000") || 0
)
const MAX_COLLABORATOR_RANKING_IDS_CACHE_ENTRIES = 300

const readCollaboratorRankingIdsCache = (userId: number) => {
  if (COLLABORATOR_RANKING_IDS_CACHE_TTL_MS <= 0) return null
  const cached = collaboratorRankingIdsCache.get(userId)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    collaboratorRankingIdsCache.delete(userId)
    return null
  }
  return cached.rankingIds
}

const writeCollaboratorRankingIdsCache = (userId: number, rankingIds: number[]) => {
  if (COLLABORATOR_RANKING_IDS_CACHE_TTL_MS <= 0) return
  if (
    collaboratorRankingIdsCache.size >=
    MAX_COLLABORATOR_RANKING_IDS_CACHE_ENTRIES
  ) {
    const oldestKey = collaboratorRankingIdsCache.keys().next().value
    if (oldestKey !== undefined) {
      collaboratorRankingIdsCache.delete(oldestKey)
    }
  }
  collaboratorRankingIdsCache.set(userId, {
    rankingIds,
    expiresAt: Date.now() + COLLABORATOR_RANKING_IDS_CACHE_TTL_MS,
  })
}

const toUserId = (session: SessionPayload | null) => {
  if (!session?.userId) return null
  const userId = Number(session.userId)
  return Number.isFinite(userId) ? userId : null
}

export async function getCollaboratorRankingIds(userId: number) {
  const cached = readCollaboratorRankingIdsCache(userId)
  if (cached) return cached

  const inFlight = collaboratorRankingIdsInFlight.get(userId)
  if (inFlight) return inFlight

  const pending = db.collaborator_rankings
    .findMany({
      where: { user_id: userId },
      select: { ranking_id: true },
    })
    .then((rows) => rows.map((row) => row.ranking_id))
    .then((rankingIds) => {
      writeCollaboratorRankingIdsCache(userId, rankingIds)
      return rankingIds
    })
    .finally(() => {
      if (collaboratorRankingIdsInFlight.get(userId) === pending) {
        collaboratorRankingIdsInFlight.delete(userId)
      }
    })

  collaboratorRankingIdsInFlight.set(userId, pending)
  return pending
}

export async function getAllowedRankingIds(
  session: SessionPayload | null
): Promise<AllowedRankingIds> {
  if (!session) return []
  if (session.role === "admin") return null
  if (session.role !== "collaborator") return []
  const userId = toUserId(session)
  if (!userId) return []
  return getCollaboratorRankingIds(userId)
}

export async function canManageRanking(
  session: SessionPayload | null,
  rankingId: number
) {
  const allowed = await getAllowedRankingIds(session)
  if (allowed === null) return true
  return allowed.includes(rankingId)
}
