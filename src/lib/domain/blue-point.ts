import { monthKeyFromDate } from "@/lib/date"
import { db } from "@/lib/db"
import { getAccessThreshold, rankingConfig } from "@/lib/domain/ranking"

const toMonthStart = (value: string) => new Date(`${value}-01T00:00:00`)

const toMonthValueFromDate = (value: Date) => {
  const monthKey = monthKeyFromDate(value)
  if (Number.isNaN(monthKey.getTime())) return ""
  const year = monthKey.getUTCFullYear()
  const month = String(monthKey.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

const monthRange = (monthStart: Date) => {
  const start = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    1,
    0,
    0,
    0,
    0
  )
  const end = new Date(start)
  end.setMonth(end.getMonth() + 1)
  return { start, end }
}

const formatName = (
  first?: string | null,
  last?: string | null,
  nickname?: string | null
) => {
  const full = `${first ?? ""} ${last ?? ""}`.trim()
  if (nickname && nickname.trim()) {
    return full ? `${full} "${nickname.trim()}"` : nickname.trim()
  }
  return full || "Jogador"
}

const buildPositionMap = (positions: Record<number, number>) => {
  const map = new Map<number, number>()

  for (const [userIdRaw, positionRaw] of Object.entries(positions)) {
    const userId = Number(userIdRaw)
    const position = Number(positionRaw)
    if (!Number.isFinite(userId) || userId <= 0) continue
    if (!Number.isFinite(position) || position <= 0) continue
    map.set(userId, position)
  }

  return map
}

const resolveSnapshotPositions = async (
  rankingId: number,
  monthStart: Date
) => {
  const monthKey = monthKeyFromDate(monthStart)

  const endSnapshot = await db.ranking_snapshots.findMany({
    where: {
      ranking_id: rankingId,
      round_month: monthKey,
      snapshot_type: "end",
    },
    select: {
      user_id: true,
      position: true,
    },
    orderBy: { position: "asc" },
  })

  if (endSnapshot.length) {
    return new Map(endSnapshot.map((row) => [row.user_id, row.position]))
  }

  const startSnapshot = await db.ranking_snapshots.findMany({
    where: {
      ranking_id: rankingId,
      round_month: monthKey,
      snapshot_type: "start",
    },
    select: {
      user_id: true,
      position: true,
    },
    orderBy: { position: "asc" },
  })

  if (startSnapshot.length) {
    return new Map(startSnapshot.map((row) => [row.user_id, row.position]))
  }

  return new Map<number, number>()
}

const resolveRecentReferenceMonthKeys = async (
  rankingId: number,
  monthStart: Date,
  threshold: number
) => {
  const currentMonthKey = monthKeyFromDate(monthStart)

  const [roundRows, snapshotRows] = await Promise.all([
    db.rounds.findMany({
      where: {
        ranking_id: rankingId,
        reference_month: { lt: currentMonthKey },
      },
      select: { reference_month: true },
      orderBy: { reference_month: "desc" },
    }),
    db.ranking_snapshots.findMany({
      where: {
        ranking_id: rankingId,
        round_month: { lt: currentMonthKey },
      },
      select: { round_month: true },
      orderBy: { round_month: "desc" },
    }),
  ])

  const monthKeys = new Set<string>()

  for (const row of roundRows) {
    const monthKey = toMonthValueFromDate(row.reference_month)
    if (monthKey) monthKeys.add(monthKey)
  }

  for (const row of snapshotRows) {
    const monthKey = toMonthValueFromDate(row.round_month)
    if (monthKey) monthKeys.add(monthKey)
  }

  return Array.from(monthKeys)
    .sort((left, right) => right.localeCompare(left))
    .slice(0, threshold)
}

export type BluePointReason =
  | "consecutive_challenges"
  | "no_reachable_opponent"
  | null

export type BluePointEvaluationItem = {
  userId: number
  name: string
  avatarUrl: string | null
  position: number
  enabled: boolean
  locked: boolean
  reason: BluePointReason
  challengedConsecutive: boolean
  recentChallengeMonths: string[]
  recentChallengeCount: number
  challengedCountInMonth: number
  totalMatchesInMonth: number
  hasChallengeInMonth: boolean
  currentBluePoint: boolean
  currentLocked: boolean
  isAccessChallenge: boolean
  isSuspended: boolean
}

export type BluePointEvaluationResult = {
  threshold: number
  recentMonthKeys: string[]
  items: BluePointEvaluationItem[]
}

export async function getBluePointEvaluation({
  rankingId,
  monthStart,
  positionsByUser,
}: {
  rankingId: number
  monthStart: Date
  positionsByUser?: Record<number, number>
}): Promise<BluePointEvaluationResult> {
  const threshold = Math.max(
    1,
    rankingConfig.bluePointPolicy.consecutiveChallengesThreshold
  )

  const [members, ranking, snapshotPositions] = await Promise.all([
    db.ranking_memberships.findMany({
      where: { ranking_id: rankingId },
      select: {
        user_id: true,
        position: true,
        is_access_challenge: true,
        is_suspended: true,
        is_blue_point: true,
        is_locked: true,
        users: {
          select: {
            first_name: true,
            last_name: true,
            nickname: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ position: "asc" }, { user_id: "asc" }],
    }),
    db.rankings.findUnique({
      where: { id: rankingId },
      select: {
        id: true,
        slug: true,
      },
    }),
    positionsByUser
      ? Promise.resolve(new Map<number, number>())
      : resolveSnapshotPositions(rankingId, monthStart),
  ])

  if (!ranking) {
    throw new Error("Ranking nao encontrado.")
  }

  const accessLimit = getAccessThreshold(ranking.slug) ?? null
  const maxUp = rankingConfig.maxPositionsUp
  const positionByUser = positionsByUser
    ? buildPositionMap(positionsByUser)
    : snapshotPositions

  const { start, end } = monthRange(monthStart)

  const monthChallenges = await db.challenges.findMany({
    where: {
      ranking_id: rankingId,
      OR: [
        {
          status: "completed",
          OR: [
            {
              played_at: { gte: start, lt: end },
            },
            {
              played_at: null,
              scheduled_for: { gte: start, lt: end },
            },
          ],
        },
        {
          status: { in: ["scheduled", "accepted"] },
          scheduled_for: { gte: start, lt: end },
        },
      ],
    },
    select: { challenger_id: true, challenged_id: true },
  })

  const hasChallenge = new Set<number>()
  const challengedCountInMonth = new Map<number, number>()
  const totalMatchesInMonth = new Map<number, number>()

  for (const challenge of monthChallenges) {
    hasChallenge.add(challenge.challenger_id)
    hasChallenge.add(challenge.challenged_id)

    totalMatchesInMonth.set(
      challenge.challenger_id,
      (totalMatchesInMonth.get(challenge.challenger_id) ?? 0) + 1
    )
    totalMatchesInMonth.set(
      challenge.challenged_id,
      (totalMatchesInMonth.get(challenge.challenged_id) ?? 0) + 1
    )
    challengedCountInMonth.set(
      challenge.challenged_id,
      (challengedCountInMonth.get(challenge.challenged_id) ?? 0) + 1
    )
  }

  const recentMonthKeys = await resolveRecentReferenceMonthKeys(
    rankingId,
    monthStart,
    threshold
  )

  const challengedInRecentMonthsByUser = new Map<number, Set<string>>()

  if (recentMonthKeys.length >= threshold) {
    const selectedMonthKeys = new Set(recentMonthKeys)
    const oldestMonthKey = recentMonthKeys[recentMonthKeys.length - 1]
    const oldestMonthStart = toMonthStart(oldestMonthKey)

    const relevantChallenges = await db.challenges.findMany({
      where: {
        ranking_id: rankingId,
        status: { in: ["completed", "scheduled", "accepted"] },
        OR: [
          {
            played_at: { gte: oldestMonthStart, lt: start },
          },
          {
            played_at: null,
            scheduled_for: { gte: oldestMonthStart, lt: start },
          },
        ],
      },
      select: {
        challenged_id: true,
        played_at: true,
        scheduled_for: true,
      },
    })

    for (const challenge of relevantChallenges) {
      const refDate = challenge.played_at ?? challenge.scheduled_for
      if (!refDate) continue
      const monthKey = toMonthValueFromDate(refDate)
      if (!monthKey || !selectedMonthKeys.has(monthKey)) continue
      const months =
        challengedInRecentMonthsByUser.get(challenge.challenged_id) ??
        new Set<string>()
      months.add(monthKey)
      challengedInRecentMonthsByUser.set(challenge.challenged_id, months)
    }
  }

  const items = members.map((member) => {
    const userId = member.user_id
    const position = positionByUser.get(userId) ?? member.position ?? 0
    const recentChallengeMonths = Array.from(
      challengedInRecentMonthsByUser.get(userId) ?? []
    ).sort()
    const recentChallengeCount = recentChallengeMonths.length
    const challengedConsecutive =
      recentMonthKeys.length >= threshold &&
      recentMonthKeys.every((monthKey) =>
        challengedInRecentMonthsByUser.get(userId)?.has(monthKey)
      )

    let locked = false
    if (position > 1 && !member.is_suspended && !hasChallenge.has(userId)) {
      locked = true
      for (const target of members) {
        if (target.user_id === userId) continue
        if (target.is_suspended) continue

        const targetPos = positionByUser.get(target.user_id) ?? target.position ?? 0
        if (targetPos <= 0) continue

        if (member.is_access_challenge) {
          if (accessLimit && targetPos < accessLimit) continue
        } else {
          if (targetPos >= position) continue
          if (position - targetPos > maxUp) continue
        }

        if (member.is_blue_point && target.is_blue_point) continue
        if (hasChallenge.has(target.user_id)) continue
        locked = false
        break
      }
    }

    const enabled = (position > 1 && challengedConsecutive) || locked
    const reason: BluePointReason = locked
      ? "no_reachable_opponent"
      : challengedConsecutive
      ? "consecutive_challenges"
      : null
    const normalizedCurrentBluePoint =
      position > 1 ? Boolean(member.is_blue_point) : false
    const normalizedCurrentLocked =
      position > 1 ? Boolean(member.is_locked) : false

    return {
      userId,
      name: formatName(
        member.users.first_name,
        member.users.last_name,
        member.users.nickname
      ),
      avatarUrl: member.users.avatarUrl ?? null,
      position,
      enabled,
      locked,
      reason,
      challengedConsecutive,
      recentChallengeMonths,
      recentChallengeCount,
      challengedCountInMonth: challengedCountInMonth.get(userId) ?? 0,
      totalMatchesInMonth: totalMatchesInMonth.get(userId) ?? 0,
      hasChallengeInMonth: hasChallenge.has(userId),
      currentBluePoint: normalizedCurrentBluePoint,
      currentLocked: normalizedCurrentLocked,
      isAccessChallenge: Boolean(member.is_access_challenge),
      isSuspended: Boolean(member.is_suspended),
    }
  })

  return {
    threshold,
    recentMonthKeys,
    items,
  }
}

export async function persistBluePointEvaluation(
  rankingId: number,
  items: BluePointEvaluationItem[]
) {
  for (const item of items) {
    await db.ranking_memberships.updateMany({
      where: { ranking_id: rankingId, user_id: item.userId },
      data: { is_blue_point: item.enabled, is_locked: item.locked },
    })
  }
}
