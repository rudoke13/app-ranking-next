import { monthKeyFromDate } from "@/lib/date"
import { db } from "@/lib/db"
import {
  rankingConfig,
  getAccessThreshold,
  monthDiff,
  nextActiveMonth,
} from "@/lib/domain/ranking"
import {
  MANUAL_ORDER_LOG_LINE,
  MANUAL_ORDER_LOG_MESSAGE,
} from "@/lib/domain/round-overrides"
import {
  atualizarRanking,
  type RankingRoundEvent,
} from "@/lib/domain/ranking-round-processor"

const toMonthStart = (value: string) => new Date(`${value}-01T00:00:00`)

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

const shiftMonth = (value: Date | null | undefined, offset: number) => {
  if (!value) return null
  const shifted = new Date(value)
  shifted.setMonth(shifted.getMonth() + offset)
  return shifted
}

type BaselinePositions = Record<number, number>

const fetchSnapshot = async (
  rankingId: number,
  monthStart: Date,
  type: "start" | "end"
) => {
  const monthKey = monthKeyFromDate(monthStart)
  const rows = await db.ranking_snapshots.findMany({
    where: {
      ranking_id: rankingId,
      round_month: monthKey,
      snapshot_type: type,
    },
    select: { position: true, user_id: true },
    orderBy: { position: "asc" },
  })
  const map: BaselinePositions = {}
  rows.forEach((row) => {
    map[row.position] = row.user_id
  })
  return map
}

const storeSnapshot = async (
  rankingId: number,
  monthStart: Date,
  type: "start" | "end",
  positions: BaselinePositions
) => {
  const monthKey = monthKeyFromDate(monthStart)
  await db.ranking_snapshots.deleteMany({
    where: {
      ranking_id: rankingId,
      round_month: monthKey,
      snapshot_type: type,
    },
  })

  const entries = Object.entries(positions)
  if (!entries.length) return

  const uniqueByUser = new Map<number, number>()
  for (const [position, userId] of entries) {
    const id = Number(userId)
    const pos = Number(position)
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(pos) || pos <= 0) {
      continue
    }
    const current = uniqueByUser.get(id)
    if (!current || pos < current) {
      uniqueByUser.set(id, pos)
    }
  }

  if (!uniqueByUser.size) return

  await db.ranking_snapshots.createMany({
    data: Array.from(uniqueByUser.entries()).map(([userId, position]) => ({
      ranking_id: rankingId,
      round_month: monthKey,
      snapshot_type: type,
      user_id: userId,
      position,
    })),
    skipDuplicates: true,
  })
}

const buildBaselineFromHints = async (
  rankingId: number,
  monthStart: Date,
  members: Array<{ user_id: number; position: number | null }>
) => {
  const { start, end } = monthRange(monthStart)
  const hints = await db.challenges.findMany({
    where: {
      ranking_id: rankingId,
      scheduled_for: { gte: start, lt: end },
    },
    select: {
      challenger_id: true,
      challenged_id: true,
      challenger_position_at_challenge: true,
      challenged_position_at_challenge: true,
    },
  })

  const minByUser: Record<number, number> = {}
  for (const hint of hints) {
    const challengerId = hint.challenger_id
    const challengedId = hint.challenged_id
    const challengerPos = hint.challenger_position_at_challenge ?? 0
    const challengedPos = hint.challenged_position_at_challenge ?? 0

    if (challengerId && challengerPos > 0) {
      if (!minByUser[challengerId] || challengerPos < minByUser[challengerId]) {
        minByUser[challengerId] = challengerPos
      }
    }
    if (challengedId && challengedPos > 0) {
      if (!minByUser[challengedId] || challengedPos < minByUser[challengedId]) {
        minByUser[challengedId] = challengedPos
      }
    }
  }

  if (!Object.keys(minByUser).length) {
    return {}
  }

  const fallbackOrder: Record<number, number> = {}
  members.forEach((member, index) => {
    fallbackOrder[member.user_id] = member.position ?? index + 1
  })

  const list = members
    .filter((member) => minByUser[member.user_id])
    .map((member) => ({
      userId: member.user_id,
      hint: minByUser[member.user_id],
      fallback: fallbackOrder[member.user_id] ?? Number.MAX_SAFE_INTEGER,
    }))

  list.sort(
    (a, b) =>
      a.hint - b.hint || a.fallback - b.fallback || a.userId - b.userId
  )

  const assigned: Record<number, boolean> = {}
  const baseline: BaselinePositions = {}
  let position = 1

  for (const item of list) {
    if (assigned[item.userId]) continue
    baseline[position++] = item.userId
    assigned[item.userId] = true
  }

  members.forEach((member) => {
    if (assigned[member.user_id]) return
    baseline[position++] = member.user_id
    assigned[member.user_id] = true
  })

  return baseline
}

const buildFallbackBaseline = (
  members: Array<{ user_id: number }>
): BaselinePositions => {
  const baseline: BaselinePositions = {}
  let position = 1
  members.forEach((member) => {
    baseline[position++] = member.user_id
  })
  return baseline
}

const evaluateBluePoints = async (
  rankingId: number,
  monthStart: Date,
  positions: Record<number, number>
) => {
  const threshold = Math.max(
    1,
    rankingConfig.bluePointPolicy.consecutiveChallengesThreshold
  )
  const [members, ranking] = await Promise.all([
    db.ranking_memberships.findMany({
      where: { ranking_id: rankingId },
      select: {
        user_id: true,
        position: true,
        is_access_challenge: true,
        is_suspended: true,
        is_blue_point: true,
      },
    }),
    db.rankings.findUnique({
      where: { id: rankingId },
      select: { slug: true },
    }),
  ])

  const updateData: Array<{
    userId: number
    enabled: boolean
    locked: boolean
  }> = []

  const accessLimit = getAccessThreshold(ranking?.slug) ?? null
  const maxUp = rankingConfig.maxPositionsUp
  const positionByUser = new Map<number, number>()
  Object.entries(positions).forEach(([pos, userId]) => {
    const id = Number(userId)
    const position = Number(pos)
    if (Number.isFinite(id) && Number.isFinite(position)) {
      positionByUser.set(id, position)
    }
  })

  const { start, end } = monthRange(monthStart)
  const monthChallenges = await db.challenges.findMany({
    where: {
      ranking_id: rankingId,
      OR: [
        {
          status: "completed",
          played_at: { gte: start, lt: end },
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
  monthChallenges.forEach((challenge) => {
    hasChallenge.add(challenge.challenger_id)
    hasChallenge.add(challenge.challenged_id)
  })

  const membersById = new Map(members.map((member) => [member.user_id, member]))

  for (const member of members) {
    const userId = member.user_id
    const position =
      positionByUser.get(userId) ?? member.position ?? positions[userId] ?? 0
    let challengedConsecutive = true

    for (let index = 0; index < threshold; index += 1) {
      const monthCheck = new Date(monthStart)
      monthCheck.setMonth(monthCheck.getMonth() - index)
      const { start, end } = monthRange(monthCheck)
      const count = await db.challenges.count({
        where: {
          ranking_id: rankingId,
          challenged_id: userId,
          status: "completed",
          played_at: { gte: start, lt: end },
        },
      })
      if (count < 1) {
        challengedConsecutive = false
        break
      }
    }

    let locked = false
    if (
      position > 1 &&
      !member.is_suspended &&
      !hasChallenge.has(userId)
    ) {
      locked = true
      for (const target of members) {
        if (target.user_id === userId) continue
        if (target.is_suspended) continue
        const targetPos =
          positionByUser.get(target.user_id) ?? target.position ?? 0
        if (targetPos <= 0) continue
        const isAccess = Boolean(member.is_access_challenge)
        if (isAccess) {
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
    updateData.push({ userId, enabled, locked })
  }

  for (const item of updateData) {
    await db.ranking_memberships.updateMany({
      where: { ranking_id: rankingId, user_id: item.userId },
      data: { is_blue_point: item.enabled, is_locked: item.locked },
    })
  }
}

const buildPositionsFromMembers = (
  members: Array<{ user_id: number; position: number | null }>
): BaselinePositions => {
  const sorted = [...members].sort((a, b) => {
    const posA = a.position ?? Number.MAX_SAFE_INTEGER
    const posB = b.position ?? Number.MAX_SAFE_INTEGER
    if (posA === posB) return a.user_id - b.user_id
    return posA - posB
  })

  const positions: BaselinePositions = {}
  sorted.forEach((member, index) => {
    positions[index + 1] = member.user_id
  })
  return positions
}

type SnapshotClient = Pick<typeof db, "ranking_snapshots">

const storeEndSnapshot = async (
  client: SnapshotClient,
  rankingId: number,
  monthStart: Date,
  positions: BaselinePositions
) => {
  const monthKey = monthKeyFromDate(monthStart)
  await client.ranking_snapshots.deleteMany({
    where: {
      ranking_id: rankingId,
      round_month: monthKey,
      snapshot_type: "end",
    },
  })

  if (!Object.keys(positions).length) return

  const uniqueByUser = new Map<number, number>()
  for (const [position, userId] of Object.entries(positions)) {
    const id = Number(userId)
    const pos = Number(position)
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(pos) || pos <= 0) {
      continue
    }
    const current = uniqueByUser.get(id)
    if (!current || pos < current) {
      uniqueByUser.set(id, pos)
    }
  }

  if (!uniqueByUser.size) return

  await client.ranking_snapshots.createMany({
    data: Array.from(uniqueByUser.entries()).map(([userId, position]) => ({
      ranking_id: rankingId,
      round_month: monthKey,
      snapshot_type: "end" as const,
      user_id: userId,
      position,
    })),
    skipDuplicates: true,
  })
}

type CloseRoundOptions = {
  manualOverride?: boolean
  ignoreViolations?: boolean
  persistMemberships?: boolean
  closeStatus?: boolean
  closeGlobal?: boolean
}

export async function closeRound(
  rankingId: number,
  referenceMonth: string,
  actorId: number | null,
  options?: CloseRoundOptions
) {
  const monthStart = toMonthStart(referenceMonth)
  if (Number.isNaN(monthStart.getTime())) {
    throw new Error("Mes invalido.")
  }
  const monthKey = monthKeyFromDate(monthStart)

  const ranking = await db.rankings.findUnique({
    where: { id: rankingId },
    select: { id: true, slug: true },
  })

  if (!ranking) {
    throw new Error("Ranking nao encontrado.")
  }

  const members = await db.ranking_memberships.findMany({
    where: { ranking_id: rankingId },
    orderBy: { position: "asc" },
    select: {
      user_id: true,
      position: true,
      is_access_challenge: true,
      users: {
        select: { first_name: true, last_name: true, nickname: true },
      },
    },
  })

  if (!members.length) {
    return { log: [], violations: [], positions: {} }
  }

  const membersById = new Map(members.map((member) => [member.user_id, member]))
  const accessLimit = getAccessThreshold(ranking.slug) ?? null

  let baseline = await fetchSnapshot(rankingId, monthStart, "start")

  if (!Object.keys(baseline).length) {
    const previous = new Date(monthStart)
    previous.setMonth(previous.getMonth() - 1)
    baseline = await fetchSnapshot(rankingId, previous, "end")
  }

  if (!Object.keys(baseline).length) {
    baseline = await buildBaselineFromHints(
      rankingId,
      monthStart,
      members.map((member) => ({
        user_id: member.user_id,
        position: member.position ?? null,
      }))
    )
  }

  if (!Object.keys(baseline).length) {
    baseline = buildFallbackBaseline(
      members.map((member) => ({ user_id: member.user_id }))
    )
  }

  await storeSnapshot(rankingId, monthStart, "start", baseline)

  const manualOverrideFlag = options?.manualOverride === true
  const manualOverrideMarker = await db.round_logs.findFirst({
    where: {
      ranking_id: rankingId,
      reference_month: monthKey,
      line_no: MANUAL_ORDER_LOG_LINE,
      message: MANUAL_ORDER_LOG_MESSAGE,
    },
    select: { id: true },
  })
  const ignoreViolations =
    options?.ignoreViolations === true || Boolean(manualOverrideMarker)
  const forceManualClose = manualOverrideFlag && !ignoreViolations
  const persistMemberships = options?.persistMemberships !== false
  const closeStatus = options?.closeStatus !== false
  const closeGlobal = options?.closeGlobal === true

  if (forceManualClose) {
    const finalPositions = buildPositionsFromMembers(
      members.map((member) => ({
        user_id: member.user_id,
        position: member.position ?? null,
      }))
    )

    await db.$transaction(async (tx) => {
      if (persistMemberships) {
        for (const [position, userId] of Object.entries(finalPositions)) {
          await tx.ranking_memberships.updateMany({
            where: { ranking_id: rankingId, user_id: Number(userId) },
            data: { position: Number(position) },
          })
        }
      }

      await storeEndSnapshot(tx, rankingId, monthStart, finalPositions)

      await tx.round_logs.deleteMany({
        where: {
          ranking_id: rankingId,
          reference_month: monthKey,
        },
      })

      await tx.round_logs.create({
        data: {
          ranking_id: rankingId,
          reference_month: monthKey,
          line_no: 1,
          message: "Ranking fechado com ordem manual.",
        },
      })

      if (closeStatus) {
        await tx.rounds.updateMany({
          where: closeGlobal
            ? {
                reference_month: monthKey,
                OR: [{ ranking_id: rankingId }, { ranking_id: null }],
              }
            : { reference_month: monthKey, ranking_id: rankingId },
          data: { status: "closed", closed_at: new Date() },
        })
      }
    })

    if (persistMemberships) {
      await evaluateBluePoints(
        rankingId,
        monthStart,
        Object.fromEntries(
          Object.entries(finalPositions).map(([pos, userId]) => [
            Number(userId),
            Number(pos),
          ])
        )
      )
    }

    return {
      log: ["Ranking fechado com ordem manual."],
      violations: [],
      positions: finalPositions,
      manualOverride: true,
    }
  }

  const baselineRanking = Object.entries(baseline)
    .map(([pos, userId]) => {
      const member = membersById.get(Number(userId))
      const fullName = `${member?.users?.first_name ?? ""} ${member?.users?.last_name ?? ""}`.trim()
      const nickname = member?.users?.nickname?.trim() ?? ""
      return {
        id: Number(userId),
        pos: Number(pos),
        name: nickname || fullName || `Jogador ${userId}`,
        first_name: member?.users?.first_name ?? null,
        last_name: member?.users?.last_name ?? null,
      }
    })
    .sort((a, b) => a.pos - b.pos)

  const { start, end } = monthRange(monthStart)

  const challenges = await db.challenges.findMany({
    where: {
      ranking_id: rankingId,
      status: "completed",
      played_at: { gte: start, lt: end },
    },
    orderBy: [{ played_at: "asc" }, { id: "asc" }],
    select: {
      id: true,
      challenger_id: true,
      challenged_id: true,
      winner: true,
      challenger_walkover: true,
      challenged_walkover: true,
      played_at: true,
      challenger_position_at_challenge: true,
      challenged_position_at_challenge: true,
    },
  })

  const manualChallengeIds = new Set<number>()
  if (challenges.length) {
    const createdEvents = await db.challenge_events.findMany({
      where: {
        challenge_id: { in: challenges.map((challenge) => challenge.id) },
        event_type: "created",
      },
      select: {
        challenge_id: true,
        users: { select: { role: true } },
      },
    })

    createdEvents.forEach((event) => {
      if (event.users?.role === "admin") {
        manualChallengeIds.add(event.challenge_id)
      }
    })
  }

  const events: RankingRoundEvent[] = challenges.map((challenge, index) => {
    const challengerWo = Boolean(challenge.challenger_walkover)
    const challengedWo = Boolean(challenge.challenged_walkover)
    const result: RankingRoundEvent["result"] =
      challengerWo && challengedWo
        ? "double_wo"
        : challenge.winner === "challenger"
        ? "challenger_win"
        : "challenger_loss"

    const challengerMember = membersById.get(challenge.challenger_id)

    return {
      challengeId: challenge.id,
      challengerId: challenge.challenger_id,
      challengedId: challenge.challenged_id,
      result,
      isAccess: Boolean(challengerMember?.is_access_challenge),
      accessLimit: challengerMember?.is_access_challenge ? accessLimit : null,
      ignoreRules: manualChallengeIds.has(challenge.id),
      challengerSnapshot: challenge.challenger_position_at_challenge ?? null,
      challengedSnapshot: challenge.challenged_position_at_challenge ?? null,
      playedAt: challenge.played_at ?? null,
      sourceIndex: index,
    }
  })

  const resultado = atualizarRanking(
    baselineRanking,
    events,
    rankingConfig.maxPositionsUp
  )

  if (resultado.violacoes.length && !ignoreViolations) {
    return {
      log: resultado.logExplicativo,
      violations: resultado.violacoes,
      positions: baseline,
      manualOverride: false,
    }
  }

  const finalPositions: BaselinePositions = {}
  resultado.rankingAtualizado.forEach((row) => {
    const userId = Number(row.id)
    const position = Number(row.pos)
    if (userId > 0 && position > 0) {
      finalPositions[position] = userId
    }
  })

  await db.$transaction(async (tx) => {
    if (persistMemberships) {
      for (const [position, userId] of Object.entries(finalPositions)) {
        await tx.ranking_memberships.updateMany({
          where: { ranking_id: rankingId, user_id: Number(userId) },
          data: { position: Number(position) },
        })
      }
    }

    await storeEndSnapshot(tx, rankingId, monthStart, finalPositions)

    await tx.round_logs.deleteMany({
      where: {
        ranking_id: rankingId,
        reference_month: monthKey,
      },
    })

    if (resultado.logExplicativo.length) {
      await tx.round_logs.createMany({
        data: resultado.logExplicativo.map((message, index) => ({
          ranking_id: rankingId,
          reference_month: monthKey,
          line_no: index + 1,
          message,
        })),
      })
    }

    if (closeStatus) {
      await tx.rounds.updateMany({
        where: closeGlobal
          ? {
              reference_month: monthKey,
              OR: [{ ranking_id: rankingId }, { ranking_id: null }],
            }
          : { reference_month: monthKey, ranking_id: rankingId },
        data: { status: "closed", closed_at: new Date() },
      })
    }
  })

  if (persistMemberships) {
    await evaluateBluePoints(
      rankingId,
      monthStart,
      Object.fromEntries(
        Object.entries(finalPositions).map(([pos, userId]) => [Number(userId), Number(pos)])
      )
    )
  }

  return {
    log: resultado.logExplicativo,
    violations: ignoreViolations ? resultado.violacoes : [],
    positions: finalPositions,
    manualOverride: false,
  }
}

type RestoreSnapshotOptions = {
  preferEndSnapshot?: boolean
  persistMemberships?: boolean
}

export async function restoreSnapshot(
  rankingId: number,
  referenceMonth: string,
  options?: RestoreSnapshotOptions
) {
  const monthStart = toMonthStart(referenceMonth)
  if (Number.isNaN(monthStart.getTime())) {
    throw new Error("Mes invalido.")
  }

  let snapshot: BaselinePositions = {}
  let snapshotType: "start" | "end" = "start"

  if (options?.preferEndSnapshot) {
    snapshot = await fetchSnapshot(rankingId, monthStart, "end")
    snapshotType = "end"
  }

  if (!Object.keys(snapshot).length) {
    snapshot = await fetchSnapshot(rankingId, monthStart, "start")
    snapshotType = "start"
  }

  if (!Object.keys(snapshot).length) {
    throw new Error("Snapshot nao encontrado.")
  }

  if (options?.persistMemberships !== false) {
    await db.$transaction(async (tx) => {
      for (const [position, userId] of Object.entries(snapshot)) {
        await tx.ranking_memberships.updateMany({
          where: { ranking_id: rankingId, user_id: Number(userId) },
          data: { position: Number(position) },
        })
      }
    })
  }

  return { positions: snapshot, snapshotType }
}

type RolloverOptions = {
  skipRecalculate?: boolean
  targetMonth?: Date
  includeAll?: boolean
}

export async function rolloverRound(
  rankingId: number,
  referenceMonth: string,
  actorId: number | null,
  options?: RolloverOptions
) {
  const monthStart = toMonthStart(referenceMonth)
  if (Number.isNaN(monthStart.getTime())) {
    throw new Error("Mes invalido.")
  }
  const monthKey = monthKeyFromDate(monthStart)
  if (options?.targetMonth) {
    const diff = monthDiff(monthStart, options.targetMonth)
    if (diff < 1) {
      throw new Error("O mes de abertura deve ser posterior ao mes atual.")
    }
  }
  const nextMonth = options?.targetMonth ?? nextActiveMonth(monthStart)
  const monthOffset = Math.max(1, monthDiff(monthStart, nextMonth))
  const nextMonthKey = monthKeyFromDate(nextMonth)

  const rankings = await db.rankings.findMany({
    select: { id: true, slug: true },
  })

  const slugMap = new Map(rankings.map((row) => [row.slug, row.id]))
  const baseIds = [rankingId]
  const targetIds = Array.from(
    new Set(
      options?.includeAll
        ? [
            ...baseIds,
            slugMap.get("ranking-masculino"),
            slugMap.get("ranking-feminino"),
            slugMap.get("ranking-master-45"),
          ].filter((value) => typeof value === "number")
        : baseIds
    )
  ) as number[]

  if (!options?.skipRecalculate) {
    const violations: Array<{ rankingId: number; issues: string[] }> = []
    for (const targetRankingId of targetIds) {
      const result = await closeRound(
        targetRankingId,
        referenceMonth,
        actorId
      )
      if (result.violations.length) {
        violations.push({
          rankingId: targetRankingId,
          issues: result.violations,
        })
      }
    }

    if (violations.length) {
      const summary = violations
        .map(
          (item) =>
            `Ranking ${item.rankingId}: ${item.issues.join(", ")}`
        )
        .join(" | ")
      throw new Error(`Falha ao recalcular o ranking. ${summary}`)
    }
  }

  const baseNext = new Date(`${referenceMonth}-01T00:00:00`)
  baseNext.setMonth(baseNext.getMonth() + monthOffset)
  const defaultBlueStart = new Date(baseNext)
  defaultBlueStart.setHours(7, 0, 0, 0)
  const defaultBlueEnd = new Date(baseNext)
  defaultBlueEnd.setHours(23, 59, 0, 0)
  const defaultOpenStart = new Date(baseNext)
  defaultOpenStart.setDate(defaultOpenStart.getDate() + 1)
  defaultOpenStart.setHours(7, 0, 0, 0)
  const defaultOpenEnd = new Date(baseNext)
  defaultOpenEnd.setDate(defaultOpenEnd.getDate() + 2)
  defaultOpenEnd.setHours(23, 59, 0, 0)
  const defaultDeadline = new Date(baseNext)
  defaultDeadline.setHours(23, 59, 0, 0)

  for (const targetRankingId of targetIds) {
    const sourceRound =
      (await db.rounds.findFirst({
        where: { ranking_id: targetRankingId, reference_month: monthKey },
      })) ??
      (await db.rounds.findFirst({
        where: { ranking_id: null, reference_month: monthKey },
      }))

    if (sourceRound?.id) {
      const shouldCloseGlobal = options?.includeAll === true
      const shouldClose = sourceRound.ranking_id !== null || shouldCloseGlobal
      if (shouldClose) {
        await db.rounds.update({
          where: { id: sourceRound.id },
          data: { status: "closed", closed_at: new Date() },
        })
      }
    }

    const nextBlueStart =
      shiftMonth(sourceRound?.blue_point_opens_at, monthOffset) ?? defaultBlueStart
    const nextBlueEnd =
      shiftMonth(sourceRound?.blue_point_closes_at, monthOffset) ?? defaultBlueEnd
    const nextOpenStart =
      shiftMonth(sourceRound?.open_challenges_at, monthOffset) ?? defaultOpenStart
    const nextOpenEnd =
      shiftMonth(sourceRound?.open_challenges_end_at, monthOffset) ?? defaultOpenEnd
    const nextDeadline =
      shiftMonth(sourceRound?.matches_deadline, monthOffset) ?? defaultDeadline
    const nextFeaturedMatch =
      shiftMonth(sourceRound?.featured_match_at, monthOffset)
    const nextRoundOpens =
      shiftMonth(sourceRound?.round_opens_at, monthOffset)

    const title =
      sourceRound?.title?.trim() ||
      `Rodada ${baseNext.toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      })}`

    const existingNext = await db.rounds.findFirst({
      where: { ranking_id: targetRankingId, reference_month: nextMonthKey },
      select: { id: true },
    })

    const data = {
      title,
      reference_month: nextMonthKey,
      ranking_id: targetRankingId,
      round_opens_at: nextRoundOpens ?? null,
      blue_point_opens_at: nextBlueStart,
      blue_point_closes_at: nextBlueEnd,
      open_challenges_at: nextOpenStart,
      open_challenges_end_at: nextOpenEnd,
      matches_deadline: nextDeadline,
      featured_challenger_id: null,
      featured_challenged_id: null,
      featured_match_at: nextFeaturedMatch ?? null,
      featured_result: null,
      updated_by: actorId ?? null,
      status: "open" as const,
      closed_at: null,
    }

    if (existingNext) {
      await db.rounds.update({ where: { id: existingNext.id }, data })
    } else {
      await db.rounds.create({ data })
    }
  }
}
