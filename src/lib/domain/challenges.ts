import { db } from "@/lib/db"
import { monthStartFrom } from "@/lib/domain/ranking"

export type ChallengeWindow = {
  roundStart: Date
  roundEnd: Date | null
  blueStart: Date
  blueEnd: Date | null
  openStart: Date
  openEnd: Date | null
}

export type ChallengeWindowState = {
  phase:
    | "before"
    | "waiting_blue"
    | "closed"
    | "blue"
    | "waiting_open"
    | "after_open"
    | "open"
  canChallenge: boolean
  requiresBlue: boolean
  requiresRegular: boolean
  message: string
  unlockAt: Date | null
  roundStart: Date
  blueStart: Date
  blueEnd: Date | null
  openStart: Date
  openEnd: Date | null
  roundEnd: Date | null
}

export async function resolveChallengeWindows(
  rankingId: number,
  moment: Date
): Promise<ChallengeWindow> {
  const fallbackMonthStart = monthStartFrom(moment)
  const openRounds = await db.rounds.findMany({
    where: {
      status: "open",
      OR: [{ ranking_id: rankingId }, { ranking_id: null }],
    },
    orderBy: [{ reference_month: "desc" }, { id: "desc" }],
  })

  const round =
    openRounds.find((item) => item.ranking_id === rankingId) ??
    openRounds.find((item) => item.ranking_id === null) ??
    null

  if (round && round.blue_point_opens_at && round.open_challenges_at) {
    const roundStart = round.round_opens_at ?? new Date(fallbackMonthStart)
    const roundEnd = round.matches_deadline ?? null

    let blueStart = new Date(round.blue_point_opens_at)
    let blueEnd = round.blue_point_closes_at
      ? new Date(round.blue_point_closes_at)
      : null

    let openStart = new Date(round.open_challenges_at)
    let openEnd = round.open_challenges_end_at
      ? new Date(round.open_challenges_end_at)
      : round.matches_deadline
      ? new Date(round.matches_deadline)
      : null

    if (blueStart < roundStart) {
      blueStart = new Date(roundStart)
    }

    if (blueEnd && blueEnd < blueStart) {
      blueEnd = new Date(blueStart)
    }

    if (!blueEnd) {
      blueEnd = new Date(openStart)
    }

    if (openStart < blueStart) {
      openStart = new Date(blueStart)
    }

    if (blueEnd && openStart < blueEnd) {
      openStart = new Date(blueEnd)
    }

    if (openEnd && roundEnd && openEnd > roundEnd) {
      openEnd = new Date(roundEnd)
    }

    return {
      roundStart,
      roundEnd,
      blueStart,
      blueEnd,
      openStart,
      openEnd,
    }
  }

  const fallbackRoundStart = fallbackMonthStart
  const fallbackRoundEnd = new Date(fallbackRoundStart)
  fallbackRoundEnd.setDate(fallbackRoundEnd.getDate() + 30)

  const fallbackBlueStart = new Date(fallbackRoundStart)
  fallbackBlueStart.setHours(7, 0, 0, 0)

  const fallbackBlueEnd = new Date(fallbackBlueStart)
  fallbackBlueEnd.setHours(fallbackBlueEnd.getHours() + 24)

  return {
    roundStart: fallbackRoundStart,
    roundEnd: fallbackRoundEnd,
    blueStart: fallbackBlueStart,
    blueEnd: fallbackBlueEnd,
    openStart: fallbackBlueEnd,
    openEnd: fallbackRoundEnd,
  }
}

export function toWindowState(
  window: ChallengeWindow,
  now: Date = new Date()
): ChallengeWindowState {
  const formatMessageDate = (date: Date) =>
    date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

  if (now < window.roundStart) {
    return {
      phase: "before",
      canChallenge: false,
      requiresBlue: false,
      requiresRegular: false,
      message: `Rodada abre em ${formatMessageDate(window.roundStart)}.`,
      unlockAt: window.roundStart,
      ...window,
    }
  }

  if (window.roundEnd && now > window.roundEnd) {
    return {
      phase: "closed",
      canChallenge: false,
      requiresBlue: false,
      requiresRegular: false,
      message: "Periodo da rodada encerrado.",
      unlockAt: null,
      ...window,
    }
  }

  if (now < window.blueStart) {
    return {
      phase: "waiting_blue",
      canChallenge: false,
      requiresBlue: false,
      requiresRegular: false,
      message: `Os desafios ainda nao estao liberados. A janela de ponto azul inicia em ${formatMessageDate(
        window.blueStart
      )}.`,
      unlockAt: window.blueStart,
      ...window,
    }
  }

  const blueEnd = window.blueEnd ?? window.openStart
  if (now < blueEnd) {
    return {
      phase: "blue",
      canChallenge: true,
      requiresBlue: true,
      requiresRegular: false,
      message: "Periodo exclusivo para ponto azul.",
      unlockAt: window.openStart,
      ...window,
    }
  }

  if (now < window.openStart) {
    return {
      phase: "waiting_open",
      canChallenge: false,
      requiresBlue: false,
      requiresRegular: false,
      message: `Os desafios livres serao liberados em ${formatMessageDate(
        window.openStart
      )}.`,
      unlockAt: window.openStart,
      ...window,
    }
  }

  if (window.openEnd && now >= window.openEnd) {
    return {
      phase: "after_open",
      canChallenge: false,
      requiresBlue: false,
      requiresRegular: false,
      message: "Janela de desafios livres encerrada.",
      unlockAt: null,
      ...window,
    }
  }

  return {
    phase: "open",
    canChallenge: true,
    requiresBlue: false,
    requiresRegular: false,
    message: "Desafios livres ativos.",
    unlockAt: null,
    ...window,
  }
}
