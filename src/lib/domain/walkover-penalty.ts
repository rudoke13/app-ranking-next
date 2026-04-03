import { formatMonthYearPt, monthKeyFromValue, shiftMonthValue } from "@/lib/date"
import { db } from "@/lib/db"

export const WALKOVER_PENALTY_TRIGGER_STREAK = 2
export const WALKOVER_PENALTY_POSITIONS = 10

type PlayedMonthRow = { month_start: Date }

type WalkoverChallengeRow = {
  challenger_id: number
  challenged_id: number
  scheduled_for: Date
  played_at: Date | null
  challenger_walkover: boolean | null
  challenged_walkover: boolean | null
}

export type WalkoverPenaltyMonthItem = {
  month: { value: string; label: string }
  tookWalkover: boolean
  walkoverCount: number
  streak: number
  penaltyForNextRound: boolean
}

export type WalkoverPenaltyHistory = {
  triggerStreak: number
  penaltyPositions: number
  currentStreak: number
  months: WalkoverPenaltyMonthItem[]
}

export type AutomaticWalkoverPenalty = {
  userId: number
  positionsDown: number
  triggerMonths: [string, string]
}

const monthValueFromDate = (value: Date) => {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

const resolveChallengeMonthValue = (challenge: WalkoverChallengeRow) =>
  monthValueFromDate(challenge.played_at ?? challenge.scheduled_for)

const didUserTakeWalkover = (challenge: WalkoverChallengeRow, userId: number) => {
  if (challenge.challenger_id === userId && challenge.challenger_walkover) {
    return true
  }
  if (challenge.challenged_id === userId && challenge.challenged_walkover) {
    return true
  }
  return false
}

export async function listRankingReferenceMonths(
  rankingId: number,
  baseMonth: string,
  take = 6
) {
  const baseMonthStart = monthKeyFromValue(baseMonth)
  if (Number.isNaN(baseMonthStart.getTime())) {
    return [baseMonth]
  }

  const roundRows = await db.rounds.findMany({
    where: {
      reference_month: { lte: baseMonthStart },
      OR: [{ ranking_id: rankingId }, { ranking_id: null }],
    },
    distinct: ["reference_month"],
    select: { reference_month: true },
    orderBy: { reference_month: "desc" },
    take: Math.max(24, take * 4),
  })

  const monthsSet = new Set(
    roundRows.map((row) => monthValueFromDate(row.reference_month))
  )

  if (monthsSet.size < take) {
    const playedMonthRows = await db.$queryRaw<PlayedMonthRow[]>`
      SELECT month_start
      FROM (
        SELECT date_trunc('month', scheduled_for)::date AS month_start
        FROM challenges
        WHERE ranking_id = ${rankingId}
          AND scheduled_for IS NOT NULL
          AND status <> 'cancelled'
          AND scheduled_for <= ${baseMonthStart}
        UNION
        SELECT date_trunc('month', played_at)::date AS month_start
        FROM challenges
        WHERE ranking_id = ${rankingId}
          AND played_at IS NOT NULL
          AND status <> 'cancelled'
          AND played_at <= ${baseMonthStart}
      ) AS months
      ORDER BY month_start DESC
      LIMIT ${Math.max(24, take * 4)}
    `

    for (const row of playedMonthRows) {
      monthsSet.add(monthValueFromDate(row.month_start))
      if (monthsSet.size >= take) break
    }
  }

  monthsSet.add(baseMonth)

  return Array.from(monthsSet)
    .filter((value) => value <= baseMonth)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, take)
}

export async function getPlayerWalkoverPenaltyHistory(
  rankingId: number,
  userId: number,
  baseMonth: string,
  take = 6
): Promise<WalkoverPenaltyHistory> {
  const months = await listRankingReferenceMonths(rankingId, baseMonth, take)
  const orderedMonths = months.length ? months : [baseMonth]
  const oldestStart = monthKeyFromValue(orderedMonths[orderedMonths.length - 1])
  const endExclusive = monthKeyFromValue(shiftMonthValue(orderedMonths[0], 1))

  if (
    Number.isNaN(oldestStart.getTime()) ||
    Number.isNaN(endExclusive.getTime())
  ) {
    return {
      triggerStreak: WALKOVER_PENALTY_TRIGGER_STREAK,
      penaltyPositions: WALKOVER_PENALTY_POSITIONS,
      currentStreak: 0,
      months: orderedMonths.map((value) => ({
        month: { value, label: formatMonthYearPt(value) },
        tookWalkover: false,
        walkoverCount: 0,
        streak: 0,
        penaltyForNextRound: false,
      })),
    }
  }

  const challenges = await db.challenges.findMany({
    where: {
      ranking_id: rankingId,
      status: "completed",
      AND: [
        {
          OR: [
            {
              played_at: { gte: oldestStart, lt: endExclusive },
            },
            {
              played_at: null,
              scheduled_for: { gte: oldestStart, lt: endExclusive },
            },
          ],
        },
        {
          OR: [{ challenger_id: userId }, { challenged_id: userId }],
        },
      ],
    },
    select: {
      challenger_id: true,
      challenged_id: true,
      scheduled_for: true,
      played_at: true,
      challenger_walkover: true,
      challenged_walkover: true,
    },
  })

  const monthMap = new Map(
    orderedMonths.map((value) => [
      value,
      {
        month: { value, label: formatMonthYearPt(value) },
        tookWalkover: false,
        walkoverCount: 0,
        streak: 0,
        penaltyForNextRound: false,
      },
    ])
  )

  for (const challenge of challenges) {
    const monthValue = resolveChallengeMonthValue(challenge)
    const item = monthMap.get(monthValue)
    if (!item) continue
    if (!didUserTakeWalkover(challenge, userId)) continue
    item.tookWalkover = true
    item.walkoverCount += 1
  }

  let streak = 0
  orderedMonths
    .slice()
    .reverse()
    .forEach((value) => {
      const item = monthMap.get(value)
      if (!item) return
      streak = item.tookWalkover ? streak + 1 : 0
      item.streak = streak
      item.penaltyForNextRound = streak >= WALKOVER_PENALTY_TRIGGER_STREAK
    })

  const latestMonth = monthMap.get(orderedMonths[0])

  return {
    triggerStreak: WALKOVER_PENALTY_TRIGGER_STREAK,
    penaltyPositions: WALKOVER_PENALTY_POSITIONS,
    currentStreak: latestMonth?.streak ?? 0,
    months: orderedMonths.map((value) => monthMap.get(value)!).filter(Boolean),
  }
}

export async function getAutomaticWalkoverPenaltiesForRound(
  rankingId: number,
  referenceMonth: string,
  candidateUserIds: number[]
): Promise<AutomaticWalkoverPenalty[]> {
  const months = await listRankingReferenceMonths(rankingId, referenceMonth, 3)
  const currentIndex = months.indexOf(referenceMonth)
  const previousMonth =
    currentIndex >= 0 ? months[currentIndex + 1] ?? null : months[1] ?? null

  if (!previousMonth) {
    return []
  }

  const start = monthKeyFromValue(previousMonth)
  const endExclusive = monthKeyFromValue(shiftMonthValue(referenceMonth, 1))
  if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime())) {
    return []
  }

  const challenges = await db.challenges.findMany({
    where: {
      ranking_id: rankingId,
      status: "completed",
      OR: [
        {
          played_at: { gte: start, lt: endExclusive },
        },
        {
          played_at: null,
          scheduled_for: { gte: start, lt: endExclusive },
        },
      ],
    },
    select: {
      challenger_id: true,
      challenged_id: true,
      scheduled_for: true,
      played_at: true,
      challenger_walkover: true,
      challenged_walkover: true,
    },
  })

  const walkoverMonthsByUser = new Map<number, Set<string>>()

  for (const challenge of challenges) {
    const monthValue = resolveChallengeMonthValue(challenge)
    if (monthValue !== previousMonth && monthValue !== referenceMonth) {
      continue
    }

    if (challenge.challenger_walkover) {
      const bucket =
        walkoverMonthsByUser.get(challenge.challenger_id) ?? new Set<string>()
      bucket.add(monthValue)
      walkoverMonthsByUser.set(challenge.challenger_id, bucket)
    }

    if (challenge.challenged_walkover) {
      const bucket =
        walkoverMonthsByUser.get(challenge.challenged_id) ?? new Set<string>()
      bucket.add(monthValue)
      walkoverMonthsByUser.set(challenge.challenged_id, bucket)
    }
  }

  return Array.from(new Set(candidateUserIds))
    .filter((userId) => {
      const monthsForUser = walkoverMonthsByUser.get(userId)
      return Boolean(
        monthsForUser?.has(previousMonth) && monthsForUser.has(referenceMonth)
      )
    })
    .map((userId) => ({
      userId,
      positionsDown: WALKOVER_PENALTY_POSITIONS,
      triggerMonths: [previousMonth, referenceMonth] as [string, string],
    }))
}
