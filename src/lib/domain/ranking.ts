import { monthKeyFromDate } from "@/lib/date"
import { db } from "@/lib/db"

export const rankingConfig = {
  maxPositionsUp: 10,
  inactiveMonths: [] as number[],
  accessEntryRules: {
    "ranking-masculino": 30,
    "ranking-feminino": 10,
    "ranking-master-45": 20,
  },
  bluePointPolicy: {
    consecutiveChallengesThreshold: 2,
    rangeLimit: 10,
  },
}

export function getAccessThreshold(slug?: string | null) {
  if (!slug) return null
  const value =
    rankingConfig.accessEntryRules[
      slug as keyof typeof rankingConfig.accessEntryRules
    ]
  return value === undefined ? null : Number(value)
}

export function maxPositionsUp() {
  return rankingConfig.maxPositionsUp
}

export function monthStartFrom(value: Date) {
  return monthKeyFromDate(value)
}

export function monthDiff(from: Date, to: Date) {
  return (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth())
}

export function nextActiveMonth(from: Date) {
  const next = new Date(from)
  next.setDate(1)
  next.setHours(0, 0, 0, 0)
  let guard = 0
  do {
    next.setMonth(next.getMonth() + 1)
    guard += 1
    if (guard > 24) {
      break
    }
  } while (rankingConfig.inactiveMonths.includes(next.getMonth() + 1))

  return next
}

export async function ensureBaselineSnapshot(
  rankingId: number,
  monthStart: Date
) {
  const existing = await db.ranking_snapshots.findFirst({
    where: {
      ranking_id: rankingId,
      round_month: monthStart,
      snapshot_type: "start",
    },
    select: { id: true },
  })

  if (existing) {
    return
  }

  const members = await db.ranking_memberships.findMany({
    where: { ranking_id: rankingId },
    orderBy: { position: "asc" },
  })

  if (members.length === 0) {
    return
  }

  const data = members.map((member, index) => ({
    ranking_id: rankingId,
    round_month: monthStart,
    snapshot_type: "start" as const,
    user_id: member.user_id,
    position: index + 1,
  }))

  await db.ranking_snapshots.createMany({
    data,
    skipDuplicates: true,
  })
}
