import type { SessionPayload } from "@/lib/auth/types"
import { db } from "@/lib/db"

export type AllowedRankingIds = number[] | null

const toUserId = (session: SessionPayload | null) => {
  if (!session?.userId) return null
  const userId = Number(session.userId)
  return Number.isFinite(userId) ? userId : null
}

export async function getCollaboratorRankingIds(userId: number) {
  const rows = await db.collaborator_rankings.findMany({
    where: { user_id: userId },
    select: { ranking_id: true },
  })
  return rows.map((row) => row.ranking_id)
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

