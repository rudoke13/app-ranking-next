import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"
import { formatMonthYearPt, monthKeyFromValue, shiftMonthValue } from "@/lib/date"
import { db } from "@/lib/db"
import { getBluePointEvaluation } from "@/lib/domain/blue-point"
import { hasAdminAccess } from "@/lib/domain/permissions"
import { rankingConfig } from "@/lib/domain/ranking"

const NO_STORE_HEADERS = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
} as const

const jsonResponse = (body: unknown, init?: { status?: number }) =>
  NextResponse.json(body, {
    status: init?.status,
    headers: NO_STORE_HEADERS,
  })

const monthValueFromDate = (value: Date) => {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

const currentMonthStart = () => {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

type RankingRow = {
  id: number
  name: string
  slug: string
  description: string | null
}

const HISTORY_MONTH_COUNT = 4

const buildHistoryMonthValues = (referenceMonthValue: string) => {
  const values: string[] = []

  for (let index = 0; index < HISTORY_MONTH_COUNT; index += 1) {
    values.push(shiftMonthValue(referenceMonthValue, -index))
  }

  return values
}

export async function GET(request: Request) {
  const session = await getSessionFromCookies()
  if (!hasAdminAccess(session)) {
    return jsonResponse(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const searchParams = new URL(request.url).searchParams
  const rankingIdParam = searchParams.get("rankingId")
  const rankingId =
    rankingIdParam && rankingIdParam !== "all" ? Number(rankingIdParam) : null

  if (
    rankingIdParam &&
    rankingIdParam !== "all" &&
    (!Number.isFinite(rankingId) || Number(rankingId) <= 0)
  ) {
    return jsonResponse(
      { ok: false, message: "Categoria invalida." },
      { status: 400 }
    )
  }

  const rankings = await db.rankings.findMany({
    where: rankingId !== null ? { id: rankingId } : undefined,
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
    },
    orderBy: { name: "asc" },
  })

  if (rankingId !== null && !rankings.length) {
    return jsonResponse(
      { ok: false, message: "Categoria nao encontrada." },
      { status: 404 }
    )
  }

  const openRounds = await db.rounds.findMany({
    where: { status: "open" },
    select: {
      ranking_id: true,
      reference_month: true,
    },
    orderBy: [{ reference_month: "desc" }, { id: "desc" }],
  })

  const openRoundByRanking = new Map<number, Date>()
  let globalOpenMonth: Date | null = null

  for (const round of openRounds) {
    if (round.ranking_id === null) {
      globalOpenMonth ??= round.reference_month
      continue
    }

    if (!openRoundByRanking.has(round.ranking_id)) {
      openRoundByRanking.set(round.ranking_id, round.reference_month)
    }
  }

  const fallbackMonth = currentMonthStart()
  const payload = await Promise.all(
    rankings.map(async (ranking: RankingRow) => {
      const referenceMonthDate =
        openRoundByRanking.get(ranking.id) ?? globalOpenMonth ?? fallbackMonth
      const referenceMonthValue = monthValueFromDate(referenceMonthDate)
      const historyMonthValues = buildHistoryMonthValues(referenceMonthValue)
      const oldestHistoryMonth = historyMonthValues[historyMonthValues.length - 1]
      const oldestHistoryStart = monthKeyFromValue(oldestHistoryMonth)
      const historyEndExclusive = monthKeyFromValue(
        shiftMonthValue(referenceMonthValue, 1)
      )
      const evaluation = await getBluePointEvaluation({
        rankingId: ranking.id,
        monthStart: referenceMonthDate,
      })
      const historyMonthKeys = historyMonthValues
        .map((value) => monthKeyFromValue(value))
        .filter((value) => !Number.isNaN(value.getTime()))

      const [historyChallenges, blueHistory] = await Promise.all([
        db.challenges.findMany({
          where: {
            ranking_id: ranking.id,
            status: { not: "cancelled" },
            OR: [
              {
                played_at: {
                  gte: oldestHistoryStart,
                  lt: historyEndExclusive,
                },
              },
              {
                played_at: null,
                scheduled_for: {
                  gte: oldestHistoryStart,
                  lt: historyEndExclusive,
                },
              },
            ],
          },
          select: {
            challenger_id: true,
            challenged_id: true,
            scheduled_for: true,
            played_at: true,
          },
        }),
        db.blue_point_history.findMany({
          where: {
            ranking_id: ranking.id,
            month_key: {
              in: historyMonthKeys,
            },
          },
          select: {
            user_id: true,
            month_key: true,
          },
        }),
      ])

      const historyMonthSet = new Set(historyMonthValues)
      const challengedCountByUserMonth = new Map<string, number>()
      const totalMatchesByUserMonth = new Map<string, number>()

      for (const challenge of historyChallenges) {
        const refDate = challenge.played_at ?? challenge.scheduled_for
        if (!refDate) continue
        const historyMonthValue = monthValueFromDate(refDate)
        if (!historyMonthSet.has(historyMonthValue)) continue

        const challengerKey = `${challenge.challenger_id}:${historyMonthValue}`
        const challengedKey = `${challenge.challenged_id}:${historyMonthValue}`

        totalMatchesByUserMonth.set(
          challengerKey,
          (totalMatchesByUserMonth.get(challengerKey) ?? 0) + 1
        )
        totalMatchesByUserMonth.set(
          challengedKey,
          (totalMatchesByUserMonth.get(challengedKey) ?? 0) + 1
        )
        challengedCountByUserMonth.set(
          challengedKey,
          (challengedCountByUserMonth.get(challengedKey) ?? 0) + 1
        )
      }

      const bluePointMonthsByUser = new Map<number, Set<string>>()
      for (const row of blueHistory) {
        const monthValue = monthValueFromDate(row.month_key)
        const months = bluePointMonthsByUser.get(row.user_id) ?? new Set<string>()
        months.add(monthValue)
        bluePointMonthsByUser.set(row.user_id, months)
      }

      const players = evaluation.items
        .slice()
        .sort((a, b) => {
          if (a.position === b.position) return a.name.localeCompare(b.name)
          return a.position - b.position
        })
        .map((item) => ({
          userId: item.userId,
          name: item.name,
          avatarUrl: item.avatarUrl,
          position: item.position,
          challengedCountInMonth: item.challengedCountInMonth,
          totalMatchesInMonth: item.totalMatchesInMonth,
          recentChallengeCount: item.recentChallengeCount,
          recentChallengeMonths: item.recentChallengeMonths.map((value) => ({
            value,
            label: formatMonthYearPt(value),
          })),
          shouldBeBluePoint: item.enabled,
          currentBluePoint: item.currentBluePoint,
          locked: item.locked,
          hasChallengeInMonth: item.hasChallengeInMonth,
          challengedConsecutive: item.challengedConsecutive,
          reason: item.reason,
          isSuspended: item.isSuspended,
          isAccessChallenge: item.isAccessChallenge,
          monthHistory: historyMonthValues.map((value) => {
            const historyKey = `${item.userId}:${value}`
            const bluePointMonths = bluePointMonthsByUser.get(item.userId)
            const wasBluePoint =
              value === referenceMonthValue
                ? item.currentBluePoint || Boolean(bluePointMonths?.has(value))
                : Boolean(bluePointMonths?.has(value))

            return {
              month: {
                value,
                label: formatMonthYearPt(value),
              },
              challengedCount:
                challengedCountByUserMonth.get(historyKey) ?? 0,
              totalMatches: totalMatchesByUserMonth.get(historyKey) ?? 0,
              wasBluePoint,
            }
          }),
        }))

      return {
        id: ranking.id,
        name: ranking.name,
        slug: ranking.slug,
        description: ranking.description,
        referenceMonth: {
          value: referenceMonthValue,
          label: formatMonthYearPt(referenceMonthValue),
        },
        historyMonths: historyMonthValues.map((value) => ({
          value,
          label: formatMonthYearPt(value),
        })),
        recentWindowMonths: evaluation.recentMonthKeys.map((value) => ({
          value,
          label: formatMonthYearPt(value),
        })),
        summary: {
          players: players.length,
          shouldBeBluePoint: players.filter((player) => player.shouldBeBluePoint)
            .length,
          currentBluePoint: players.filter((player) => player.currentBluePoint)
            .length,
          challengedInMonth: players.filter(
            (player) => player.challengedCountInMonth > 0
          ).length,
        },
        players,
      }
    })
  )

  return jsonResponse({
    ok: true,
    data: {
      threshold: Math.max(
        1,
        rankingConfig.bluePointPolicy.consecutiveChallengesThreshold
      ),
      rankings: payload,
      generatedAt: new Date().toISOString(),
    },
  })
}
