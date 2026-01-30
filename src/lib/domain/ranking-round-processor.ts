import { RankingSimulator } from "@/lib/domain/ranking-simulator"

export type RankingBaselineRow = {
  id: number | string
  pos?: number
  name?: string | null
  nome?: string | null
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
}

export type RankingRoundEvent = {
  challengeId?: number | null
  challengerId: number
  challengedId: number
  result: "challenger_win" | "challenger_loss" | "double_wo"
  isAccess: boolean
  accessLimit?: number | null
  ignoreRules?: boolean
  challengerSnapshot?: number | null
  challengedSnapshot?: number | null
  playedAt?: Date | null
  sourceIndex?: number
}

export type RankingRoundResult = {
  rankingAtualizado: Array<Record<string, unknown>>
  logExplicativo: string[]
  violacoes: string[]
}

const normalizeRanking = (ranking: RankingBaselineRow[]) => {
  if (!ranking.length) return []
  const sorted = [...ranking].sort(
    (a, b) => (Number(a.pos ?? 0) || 0) - (Number(b.pos ?? 0) || 0)
  )

  let pos = 1
  return sorted.map((row) => {
    if (row.id === undefined || row.id === null) {
      throw new Error('Ranking deve conter a chave "id".')
    }
    return {
      ...row,
      id: String(row.id),
      pos: pos++,
    }
  })
}

const topPositionForEvent = (
  event: RankingRoundEvent,
  baselineByUser: Record<number, number>
) => {
  const positions: number[] = []

  if (event.challengerSnapshot) {
    positions.push(event.challengerSnapshot)
  } else if (baselineByUser[event.challengerId]) {
    positions.push(baselineByUser[event.challengerId])
  }

  if (event.challengedSnapshot) {
    positions.push(event.challengedSnapshot)
  } else if (baselineByUser[event.challengedId]) {
    positions.push(baselineByUser[event.challengedId])
  }

  const valid = positions.filter((value) => value > 0)
  if (!valid.length) return Number.MAX_SAFE_INTEGER
  return Math.min(...valid)
}

const playerName = (info: Record<string, unknown>, playerId: string) => {
  const row = info[playerId] as RankingBaselineRow | undefined
  if (!row) return playerId

  const name =
    row.nome ||
    row.name ||
    row.full_name ||
    (row.first_name || row.last_name
      ? `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()
      : "")

  return name || playerId
}

const buildLogs = (
  events: Array<{
    tipo: string
    challenger: string
    challenged: string
    isAccess?: boolean
  }>,
  info: Record<string, unknown>,
  finalPositions: Record<string, number>
) => {
  const logs: string[] = []
  for (const event of events) {
    const challengerName = playerName(info, event.challenger)
    const challengedName = playerName(info, event.challenged)

    if (event.tipo === "challenger_win") {
      logs.push(
        `${challengerName} venceu ${challengedName}; assumiu a posicao ${finalPositions[event.challenger] ?? 0}.`
      )
      continue
    }

    if (event.tipo === "challenger_loss") {
      if (event.isAccess) {
        logs.push(
          `Desafio de acesso: ${challengerName} perdeu para ${challengedName} e foi para a ultima posicao.`
        )
        continue
      }
      logs.push(
        `${challengerName} perdeu para ${challengedName}; caiu para a posicao ${finalPositions[event.challenger] ?? 0}.`
      )
      continue
    }

    if (event.tipo === "double_wo") {
      logs.push(
        `${challengerName} e ${challengedName} tiveram WO duplo; ambos cairam uma posicao.`
      )
    }
  }
  return logs
}

export function atualizarRanking(
  rankingAnterior: RankingBaselineRow[],
  resultadosRodada: RankingRoundEvent[],
  maxPositionsUp: number
): RankingRoundResult {
  const violacoes: string[] = []

  const baseline = normalizeRanking(rankingAnterior)
  if (!baseline.length) {
    return { rankingAtualizado: [], logExplicativo: [], violacoes: [] }
  }

  const playerInfo: Record<string, RankingBaselineRow> = {}
  const baselinePositions: Record<number, number> = {}
  const baselineByUser: Record<number, number> = {}

  for (const row of baseline) {
    const playerId = String(row.id)
    const position = Number(row.pos ?? 0)
    const userId = Number(row.id)
    playerInfo[playerId] = row
    baselinePositions[position] = userId
    baselineByUser[userId] = position
  }

  const eventLogEntries: Array<{
    tipo: string
    challenger: string
    challenged: string
    isAccess?: boolean
  }> = []
  const normalizedEvents: Array<RankingRoundEvent & { playedAtValue: number; sourceIndex: number }> = []
  const seenChallenges = new Set<number>()

  resultadosRodada.forEach((rawEvent, index) => {
    const challengeId = rawEvent.challengeId ?? null
    if (challengeId !== null) {
      if (seenChallenges.has(challengeId)) return
      seenChallenges.add(challengeId)
    }

    if (!rawEvent.challengerId || !rawEvent.challengedId || !rawEvent.result) {
      violacoes.push(
        `DADO_INCOMPLETO: desafio ${challengeId ?? "sem id"} com dados incompletos.`
      )
      return
    }

    normalizedEvents.push({
      ...rawEvent,
      playedAtValue: rawEvent.playedAt ? rawEvent.playedAt.getTime() : 0,
      sourceIndex: rawEvent.sourceIndex ?? index,
    })

    eventLogEntries.push({
      tipo: rawEvent.result,
      challenger: String(rawEvent.challengerId),
      challenged: String(rawEvent.challengedId),
      isAccess: rawEvent.isAccess,
    })
  })

  const simulator = new RankingSimulator(baselinePositions)

  normalizedEvents.sort((a, b) => {
    const topA = topPositionForEvent(a, baselineByUser)
    const topB = topPositionForEvent(b, baselineByUser)
    if (topA === topB) {
      if (a.playedAtValue === b.playedAtValue) {
        return a.sourceIndex - b.sourceIndex
      }
      return a.playedAtValue - b.playedAtValue
    }
    return topA - topB
  })

  const maxStandard = maxPositionsUp > 0 ? maxPositionsUp : 10

  for (const event of normalizedEvents) {
    const challengerId = event.challengerId
    const challengedId = event.challengedId
    const result = event.result

    const challengerBaseline = baselineByUser[challengerId]
    const challengedBaseline = baselineByUser[challengedId]

    const matchLabel = () => {
      const base = event.challengeId
        ? `Desafio ${event.challengeId}`
        : "Desafio"
      const challengerName = playerName(playerInfo, String(challengerId))
      const challengedName = playerName(playerInfo, String(challengedId))
      return `${base}: ${challengerName} x ${challengedName}`
    }

    if (!challengerBaseline || !challengedBaseline) {
      violacoes.push(
        `PLAYER_NOT_FOUND: ${matchLabel()} nao esta no ranking base.`
      )
      continue
    }

    const baselineOrderValid = challengerBaseline > challengedBaseline
    const snapshotChallenger = event.challengerSnapshot ?? challengerBaseline
    const snapshotChallenged = event.challengedSnapshot ?? challengedBaseline

    let challengerSnapshot = snapshotChallenger
    let challengedSnapshot = snapshotChallenged

    if (
      challengerSnapshot <= challengedSnapshot &&
      baselineOrderValid &&
      (event.challengerSnapshot || event.challengedSnapshot)
    ) {
      challengerSnapshot = challengerBaseline
      challengedSnapshot = challengedBaseline
    }

    if (challengerSnapshot <= challengedSnapshot) {
      violacoes.push(
        `INVALID_CHALLENGE_ORDER: ${matchLabel()} (posicoes ${challengerSnapshot} x ${challengedSnapshot}).`
      )
      continue
    }

    const distance = challengerSnapshot - challengedSnapshot

    if (!event.ignoreRules) {
      if (
        event.isAccess &&
        event.accessLimit &&
        challengedSnapshot < event.accessLimit
      ) {
        violacoes.push(
          `ACESSO_FORA_INTERVALO: ${matchLabel()} (limite ${event.accessLimit}).`
        )
        continue
      }

      if (!event.isAccess && distance > maxStandard) {
        violacoes.push(
          `MAX_10_ACIMA: ${matchLabel()} (${distance} posicoes acima; limite ${maxStandard}).`
        )
        continue
      }
    }

    if (result === "double_wo") {
      simulator.applyPenalty(challengerId, 1, baseline.length)
      simulator.applyPenalty(challengedId, 1, baseline.length)
      continue
    }

    if (result === "challenger_win") {
      simulator.applyVictory(challengerId, challengedId, challengedSnapshot)
      continue
    }

    if (result === "challenger_loss") {
      if (event.isAccess) {
        simulator.applyPenalty(challengerId, baseline.length, baseline.length)
      } else {
        simulator.applyDefeat(
          challengerId,
          challengerSnapshot,
          Math.max(1, distance),
          baseline.length
        )
      }
      simulator.markDefenseWin(challengedId)
    }
  }

  const rankingAtualizado: Array<Record<string, unknown>> = []
  const finalPositions: Record<string, number> = {}

  const resultPositions = simulator.result()
  Object.entries(resultPositions).forEach(([pos, userId]) => {
    const key = String(userId)
    const info = playerInfo[key] ?? { id: key }
    const position = Number(pos)
    rankingAtualizado.push({ ...info, id: key, pos: position })
    finalPositions[key] = position
  })

  const logs = buildLogs(eventLogEntries, playerInfo, finalPositions)

  return {
    rankingAtualizado,
    logExplicativo: logs,
    violacoes: Array.from(new Set(violacoes)),
  }
}
