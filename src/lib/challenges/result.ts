export type ChallengeWinner = "challenger" | "challenged"
export type ChallengeWinnerValue = ChallengeWinner | null
export type ChallengeStatusValue =
  | "scheduled"
  | "accepted"
  | "declined"
  | "completed"
  | "cancelled"

type ChallengeResultSource = {
  winner?: string | null
  status?: string | null
  playedAt?: Date | null
  played_at?: Date | null
  challengerGames?: number | null
  challengedGames?: number | null
  challenger_games?: number | null
  challenged_games?: number | null
  challengerWalkover?: boolean | null
  challengedWalkover?: boolean | null
  challenger_walkover?: boolean | null
  challenged_walkover?: boolean | null
}

type ChallengeResultForUserSource = ChallengeResultSource & {
  userId: number
  challengerId: number
  challengedId: number
}

const isWinner = (value: string | null | undefined): value is ChallengeWinner =>
  value === "challenger" || value === "challenged"

const firstNumber = (...values: Array<number | null | undefined>) => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
  }
  return null
}

const firstBoolean = (...values: Array<boolean | null | undefined>) => {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value
    }
  }
  return false
}

export function resolveChallengeWinner(
  source: ChallengeResultSource
): ChallengeWinnerValue {
  if (isWinner(source.winner)) {
    return source.winner
  }

  const challengerWalkover = firstBoolean(
    source.challengerWalkover,
    source.challenger_walkover
  )
  const challengedWalkover = firstBoolean(
    source.challengedWalkover,
    source.challenged_walkover
  )

  if (challengerWalkover && challengedWalkover) {
    return null
  }
  if (challengerWalkover) {
    return "challenged"
  }
  if (challengedWalkover) {
    return "challenger"
  }

  const challengerGames = firstNumber(
    source.challengerGames,
    source.challenger_games
  )
  const challengedGames = firstNumber(
    source.challengedGames,
    source.challenged_games
  )

  if (challengerGames !== null && challengedGames !== null) {
    if (challengerGames > challengedGames) return "challenger"
    if (challengedGames > challengerGames) return "challenged"
  }

  return null
}

export function hasChallengeResultEvidence(source: ChallengeResultSource): boolean {
  if (resolveChallengeWinner(source)) return true
  if (source.playedAt || source.played_at) return true

  const challengerGames = firstNumber(
    source.challengerGames,
    source.challenger_games
  )
  const challengedGames = firstNumber(
    source.challengedGames,
    source.challenged_games
  )

  if (challengerGames !== null || challengedGames !== null) return true

  return firstBoolean(
    source.challengerWalkover,
    source.challenger_walkover,
    source.challengedWalkover,
    source.challenged_walkover
  )
}

export function resolveChallengeStatus(
  source: ChallengeResultSource
): ChallengeStatusValue {
  const status = source.status

  if (status === "cancelled") return "cancelled"
  if (status === "completed") return "completed"

  if (hasChallengeResultEvidence(source)) {
    return "completed"
  }

  if (status === "accepted") return "accepted"
  if (status === "declined") return "declined"
  return "scheduled"
}

export function resolveChallengeResultForUser(
  source: ChallengeResultForUserSource
): "win" | "loss" | "pending" {
  const winner = resolveChallengeWinner(source)
  if (!winner) return "pending"

  if (source.userId !== source.challengerId && source.userId !== source.challengedId) {
    return "pending"
  }

  if (winner === "challenger") {
    return source.userId === source.challengerId ? "win" : "loss"
  }

  return source.userId === source.challengedId ? "win" : "loss"
}
