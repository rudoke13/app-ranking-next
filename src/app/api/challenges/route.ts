import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { resolveChallengeWindows } from "@/lib/domain/challenges"
import { maxPositionsUp, ensureBaselineSnapshot, getAccessThreshold, monthStartFrom } from "@/lib/domain/ranking"
import { shiftMonthValue } from "@/lib/date"
import { hasAdminAccess } from "@/lib/domain/permissions"
import { normalizeAppDateTimeInput, parseAppDateTime } from "@/lib/timezone"

const createSchema = z.object({
  ranking_id: z.number().int().positive(),
  challenged_id: z.number().int().positive(),
  challenger_id: z.number().int().positive().optional(),
  scheduled_for: z.string().optional(),
})

const listSchema = z.object({
  ranking: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  status: z.enum(["scheduled", "accepted", "declined", "completed", "cancelled"]).optional(),
  sort: z
    .enum([
      "recent",
      "oldest",
      "played_recent",
      "pending_first",
      "completed_first",
      "challenger",
    ])
    .optional(),
})

const formatName = (first?: string | null, last?: string | null, nickname?: string | null) => {
  const full = `${first ?? ""} ${last ?? ""}`.trim()
  if (nickname && nickname.trim()) {
    return full ? `${full} "${nickname.trim()}"` : nickname.trim()
  }
  return full || "Jogador"
}

const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Sao_Paulo"

const toZonedMonthStart = (value: string) => {
  const [yearRaw, monthRaw] = value.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null
  const utc = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
  const tzDate = new Date(utc.toLocaleString("en-US", { timeZone: APP_TIMEZONE }))
  const offset = utc.getTime() - tzDate.getTime()
  return new Date(utc.getTime() + offset)
}

export async function GET(request: Request) {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const parsed = listSchema.safeParse({
    ranking: searchParams.get("ranking") || undefined,
    month: searchParams.get("month") || undefined,
    status: searchParams.get("status") || undefined,
    sort: searchParams.get("sort") || undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Filtros invalidos." },
      { status: 400 }
    )
  }

  const isAdmin = hasAdminAccess(session)
  const rankingFilter = parsed.data.ranking
  const statusFilter = parsed.data.status
  const sortKey = parsed.data.sort ?? "recent"

  const monthValue = parsed.data.month
  const monthStart = monthValue ? toZonedMonthStart(monthValue) : null
  const nextMonth = monthValue
    ? toZonedMonthStart(shiftMonthValue(monthValue, 1))
    : null

  let rankingId: number | null = null
  if (rankingFilter) {
    const asNumber = Number(rankingFilter)
    if (Number.isFinite(asNumber)) {
      rankingId = asNumber
    } else {
      const ranking = await db.rankings.findUnique({
        where: { slug: rankingFilter },
        select: { id: true },
      })
      rankingId = ranking?.id ?? null
    }
  }

  const where: Record<string, unknown> = {
    status: statusFilter ?? { not: "cancelled" },
  }

  if (rankingId) {
    where.ranking_id = rankingId
  }

  if (monthStart && nextMonth) {
    where.scheduled_for = {
      gte: monthStart,
      lt: nextMonth,
    }
  }

  if (!isAdmin) {
    where.rankings = { is_active: true }
  }

  const challenges = await db.challenges.findMany({
    where,
    select: {
      id: true,
      status: true,
      winner: true,
      ranking_id: true,
      scheduled_for: true,
      played_at: true,
      created_at: true,
      challenger_games: true,
      challenged_games: true,
      challenger_tiebreak: true,
      challenged_tiebreak: true,
      challenger_walkover: true,
      challenged_walkover: true,
      challenger_retired: true,
      challenged_retired: true,
      challenger_id: true,
      challenged_id: true,
      rankings: {
        select: { id: true, name: true, slug: true },
      },
      users_challenges_challenger_idTousers: {
        select: { id: true, first_name: true, last_name: true, nickname: true, avatarUrl: true },
      },
      users_challenges_challenged_idTousers: {
        select: { id: true, first_name: true, last_name: true, nickname: true, avatarUrl: true },
      },
    },
  })

  const sorted = [...challenges].sort((a, b) => {
    const timeFor = (item: typeof a) =>
      item.played_at?.getTime() ??
      item.scheduled_for?.getTime() ??
      item.created_at?.getTime() ??
      0

    switch (sortKey) {
      case "oldest":
        return timeFor(a) - timeFor(b)
      case "played_recent":
        return (b.played_at ? b.played_at.getTime() : 0) -
          (a.played_at ? a.played_at.getTime() : 0) ||
          timeFor(b) - timeFor(a)
      case "pending_first":
        return (
          (a.status === "scheduled" || a.status === "accepted" ? 0 : 1) -
            (b.status === "scheduled" || b.status === "accepted" ? 0 : 1) ||
          timeFor(a) - timeFor(b)
        )
      case "completed_first":
        return (
          (a.status === "completed" ? 0 : 1) -
            (b.status === "completed" ? 0 : 1) ||
          (b.played_at ? b.played_at.getTime() : 0) -
            (a.played_at ? a.played_at.getTime() : 0)
        )
      case "challenger":
        return formatName(
          a.users_challenges_challenger_idTousers.first_name,
          a.users_challenges_challenger_idTousers.last_name,
          a.users_challenges_challenger_idTousers.nickname
        ).localeCompare(
          formatName(
            b.users_challenges_challenger_idTousers.first_name,
            b.users_challenges_challenger_idTousers.last_name,
            b.users_challenges_challenger_idTousers.nickname
          )
        )
      default:
        return timeFor(b) - timeFor(a)
    }
  })

  const data = sorted.map((challenge) => {
    const challenger = challenge.users_challenges_challenger_idTousers
    const challenged = challenge.users_challenges_challenged_idTousers
    const isChallenger = Number(session.userId) === challenge.challenger_id
    const isChallenged = Number(session.userId) === challenge.challenged_id
    const createdAt = challenge.created_at?.getTime() ?? 0
    const cancelWindowOpen = Date.now() - createdAt <= 5 * 60 * 1000
    const cancelWindowClosesAt = challenge.created_at
      ? new Date(challenge.created_at.getTime() + 5 * 60 * 1000).toISOString()
      : null

    const canCancel =
      (challenge.status === "scheduled" ||
        (isAdmin && challenge.status === "accepted")) &&
      (isChallenger || isAdmin) &&
      (isAdmin || cancelWindowOpen)

    const canResult =
      (challenge.status === "accepted" ||
        (challenge.status === "scheduled" &&
          (isAdmin || !cancelWindowOpen))) &&
      (isChallenger || isChallenged || isAdmin)

    return {
      id: challenge.id,
      status: challenge.status,
      winner: challenge.winner,
      ranking: {
        id: challenge.rankings.id,
        name: challenge.rankings.name,
        slug: challenge.rankings.slug,
      },
      scheduledFor: challenge.scheduled_for.toISOString(),
      playedAt: challenge.played_at?.toISOString() ?? null,
      challengerGames: challenge.challenger_games ?? null,
      challengedGames: challenge.challenged_games ?? null,
      challengerTiebreak: challenge.challenger_tiebreak ?? null,
      challengedTiebreak: challenge.challenged_tiebreak ?? null,
      challengerWalkover: Boolean(challenge.challenger_walkover),
      challengedWalkover: Boolean(challenge.challenged_walkover),
      challengerRetired: Boolean(challenge.challenger_retired),
      challengedRetired: Boolean(challenge.challenged_retired),
      challenger: {
        id: challenger.id,
        name: formatName(
          challenger.first_name,
          challenger.last_name,
          challenger.nickname
        ),
        avatarUrl: challenger.avatarUrl ?? null,
      },
      challenged: {
        id: challenged.id,
        name: formatName(
          challenged.first_name,
          challenged.last_name,
          challenged.nickname
        ),
        avatarUrl: challenged.avatarUrl ?? null,
      },
      cancelWindowOpen,
      cancelWindowClosesAt,
      canAccept: false,
      canDecline: false,
      canCancel,
      canResult,
    }
  })

  return NextResponse.json({ ok: true, data })
}

export async function POST(request: Request) {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const isAdmin = hasAdminAccess(session)

  const payload = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(payload)

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const rankingId = parsed.data.ranking_id
  const challengedId = parsed.data.challenged_id
  const challengerId =
    isAdmin && parsed.data.challenger_id
      ? parsed.data.challenger_id
      : Number(session.userId)

  if (challengerId === challengedId) {
    return NextResponse.json(
      { ok: false, message: "Nao e possivel desafiar a si mesmo." },
      { status: 422 }
    )
  }

  const ranking = await db.rankings.findUnique({
    where: { id: rankingId },
  })

  if (!ranking || (!ranking.is_active && !isAdmin)) {
    return NextResponse.json(
      { ok: false, message: "Ranking invalido." },
      { status: 404 }
    )
  }

  const [challengerMembership, challengedMembership] = await Promise.all([
    db.ranking_memberships.findFirst({
      where: { ranking_id: rankingId, user_id: challengerId },
    }),
    db.ranking_memberships.findFirst({
      where: { ranking_id: rankingId, user_id: challengedId },
    }),
  ])

  if (!challengerMembership || !challengedMembership) {
    return NextResponse.json(
      {
        ok: false,
        message: "Ambos os jogadores precisam estar inscritos no ranking.",
      },
      { status: 422 }
    )
  }

  const now = new Date()
  if (!isAdmin) {
    const window = await resolveChallengeWindows(rankingId, now)

    if (now < window.roundStart) {
      return NextResponse.json(
        {
          ok: false,
          message: `A rodada ainda nao iniciou. Desafios liberados a partir de ${window.roundStart.toLocaleString("pt-BR")}.`,
        },
        { status: 422 }
      )
    }

    if (window.roundEnd && now > window.roundEnd) {
      return NextResponse.json(
        { ok: false, message: "O periodo desta rodada ja foi encerrado." },
        { status: 422 }
      )
    }

    if (now < window.blueStart) {
      return NextResponse.json(
        {
          ok: false,
          message: `Os desafios ainda nao estao liberados. A janela de ponto azul inicia em ${window.blueStart.toLocaleString("pt-BR")}.`,
        },
        { status: 422 }
      )
    }

    const bluePhaseEnd = window.blueEnd ?? window.openStart
    const isBluePhase = now < bluePhaseEnd

    if (isBluePhase) {
      if (!challengerMembership.is_blue_point) {
        return NextResponse.json(
          {
            ok: false,
            message: "Neste periodo apenas jogadores ponto azul podem desafiar.",
          },
          { status: 422 }
        )
      }
      if (challengedMembership.is_blue_point) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Durante o ponto azul nao e permitido desafiar outro jogador ponto azul.",
          },
          { status: 422 }
        )
      }
    } else {
      if (now < window.openStart) {
        return NextResponse.json(
          {
            ok: false,
            message: `Os desafios livres serao liberados em ${window.openStart.toLocaleString("pt-BR")}.`,
          },
          { status: 422 }
        )
      }

      if (window.openEnd && now > window.openEnd) {
        return NextResponse.json(
          {
            ok: false,
            message: "O periodo de desafios livres para este ranking ja encerrou.",
          },
          { status: 422 }
        )
      }

      if (challengerMembership.is_blue_point) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Apos a abertura dos desafios livres apenas jogadores regulares podem desafiar.",
          },
          { status: 422 }
        )
      }
    }

    if (challengerMembership.is_access_challenge) {
      if (now < window.openStart) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Jogadores de acesso so podem desafiar no periodo de desafios livres.",
          },
          { status: 422 }
        )
      }

      if (window.openEnd && now > window.openEnd) {
        return NextResponse.json(
          {
            ok: false,
            message: "Periodo de desafios livres encerrado para este ranking.",
          },
          { status: 422 }
        )
      }

      const accessLimit = getAccessThreshold(ranking.slug)
      if (accessLimit) {
        const totalMembers = await db.ranking_memberships.count({
          where: { ranking_id: rankingId },
        })
        const threshold = Math.min(accessLimit, totalMembers)
        if ((challengedMembership.position ?? 0) < threshold) {
          return NextResponse.json(
            {
              ok: false,
              message: `Jogadores de acesso so podem desafiar a partir da posicao ${threshold}.`,
            },
            { status: 422 }
          )
        }
      }
    }
  }

  const challengerPosition = challengerMembership.position ?? 0
  const challengedPosition = challengedMembership.position ?? 0

  if (!isAdmin) {
    if (
      !challengerMembership.is_access_challenge &&
      challengerPosition > 0 &&
      challengedPosition > 0
    ) {
      const difference = challengerPosition - challengedPosition
      if (difference > maxPositionsUp()) {
        return NextResponse.json(
          {
            ok: false,
            message: `Voce so pode desafiar ate ${maxPositionsUp()} posicoes acima.`,
          },
          { status: 422 }
        )
      }
    }
  }

  const scheduledFor =
    parseAppDateTime(normalizeAppDateTimeInput(parsed.data.scheduled_for)) ??
    now
  const monthStart = monthStartFrom(scheduledFor)
  const monthEnd = new Date(monthStart)
  monthEnd.setMonth(monthEnd.getMonth() + 1)

  if (!isAdmin) {
    const windowStatuses: Array<"scheduled" | "accepted" | "completed"> = [
      "scheduled",
      "accepted",
      "completed",
    ]
    const [existingByPlayer, pairChallenge] = await Promise.all([
      db.challenges.findFirst({
        where: {
          ranking_id: rankingId,
          status: { in: windowStatuses },
          AND: [
            {
              OR: [
                { challenger_id: challengerId },
                { challenged_id: challengerId },
                { challenger_id: challengedId },
                { challenged_id: challengedId },
              ],
            },
            {
              OR: [
                {
                  status: "completed",
                  played_at: {
                    gte: monthStart,
                    lt: monthEnd,
                  },
                },
                {
                  status: { in: ["scheduled", "accepted"] },
                  scheduled_for: {
                    gte: monthStart,
                    lt: monthEnd,
                  },
                },
              ],
            },
          ],
        },
        select: { id: true },
      }),
      db.challenges.findFirst({
        where: {
          ranking_id: rankingId,
          status: { in: windowStatuses },
          challenger_id: challengerId,
          challenged_id: challengedId,
          OR: [
            {
              status: "completed",
              played_at: {
                gte: monthStart,
                lt: monthEnd,
              },
            },
            {
              status: { in: ["scheduled", "accepted"] },
              scheduled_for: {
                gte: monthStart,
                lt: monthEnd,
              },
            },
          ],
        },
        select: { id: true },
      }),
    ])

    if (existingByPlayer) {
      return NextResponse.json(
        {
          ok: false,
          message: "Jogadores ja registraram desafio neste periodo.",
        },
        { status: 422 }
      )
    }

    if (pairChallenge) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Este confronto ja esta registrado nesta rodada. Aguarde a proxima rodada.",
        },
        { status: 422 }
      )
    }
  }

  await ensureBaselineSnapshot(rankingId, monthStart)

  const created = await db.$transaction(async (tx) => {
    const challenge = await tx.challenges.create({
      data: {
        ranking_id: rankingId,
        challenger_id: challengerId,
        challenged_id: challengedId,
        scheduled_for: scheduledFor,
        challenger_position_at_challenge: challengerPosition || null,
        challenged_position_at_challenge: challengedPosition || null,
        status: "scheduled",
        winner: null,
      },
    })

    await tx.challenge_events.create({
      data: {
        challenge_id: challenge.id,
        event_type: "created",
        payload: {
          ranking_id: rankingId,
          challenger_id: challengerId,
          challenged_id: challengedId,
          scheduled_for: scheduledFor.toISOString(),
          challenger_position_at_challenge: challengerPosition,
          challenged_position_at_challenge: challengedPosition,
          status: "scheduled",
        },
        created_by: challengerId,
      },
    })

    return challenge
  })

  return NextResponse.json(
    { ok: true, data: { id: created.id } },
    { status: 201 }
  )
}
