import { db } from "@/lib/db"

export type RankingSummary = {
  id: number
  name: string
  slug: string
  description: string | null
}

export type RankingPlayer = {
  userId: number
  name: string
  nickname: string | null
  avatarUrl: string | null
  position: number | null
  points: number
  isBluePoint: boolean
  isLocked: boolean
  isSuspended: boolean
}

export async function getRankings(): Promise<RankingSummary[]> {
  const rankings = await db.rankings.findMany({
    orderBy: { name: "asc" },
  })

  return rankings.map((ranking) => ({
    id: ranking.id,
    name: ranking.name,
    slug: ranking.slug,
    description: ranking.description,
  }))
}

export async function getRankingPlayers(
  rankingId: number
): Promise<RankingPlayer[]> {
  const memberships = await db.ranking_memberships.findMany({
    where: {
      ranking_id: rankingId,
    },
    select: {
      user_id: true,
      position: true,
      points: true,
      is_blue_point: true,
      is_locked: true,
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
    orderBy: [{ position: "asc" }, { points: "desc" }],
  })

  return memberships.map((membership) => ({
    userId: membership.user_id,
    name: `${membership.users.first_name} ${membership.users.last_name}`.trim(),
    nickname: membership.users.nickname,
    avatarUrl: membership.users.avatarUrl ?? null,
    position: membership.position ?? null,
    points: membership.points ?? 0,
    isBluePoint: Boolean(membership.is_blue_point),
    isLocked: Boolean(membership.is_locked),
    isSuspended: Boolean(membership.is_suspended),
  }))
}
