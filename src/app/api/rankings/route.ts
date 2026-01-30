import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"

export async function GET() {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const rankings = await db.rankings.findMany({
    orderBy: { name: "asc" },
  })

  const userId = Number(session.userId)
  const userMemberships = Number.isFinite(userId)
    ? await db.ranking_memberships.findMany({
        where: { user_id: userId },
        select: { ranking_id: true },
      })
    : []

  const memberSet = new Set(userMemberships.map((item) => item.ranking_id))

  const counts = await db.ranking_memberships.groupBy({
    by: ["ranking_id"],
    where: { is_suspended: false },
    _count: { _all: true },
  })

  const countMap = new Map(
    counts.map((item) => [item.ranking_id, item._count._all])
  )

  return NextResponse.json({
    ok: true,
    data: rankings.map((ranking) => ({
      id: ranking.id,
      name: ranking.name,
      slug: ranking.slug,
      description: ranking.description,
      activePlayers: countMap.get(ranking.id) ?? 0,
      isUserMember: memberSet.has(ranking.id),
    })),
  })
}
