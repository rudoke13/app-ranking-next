export type RankingMovement =
  | "static"
  | "rise"
  | "drop"
  | "penalty"
  | "defense_win"

export const RankingMovement = {
  STATIC: "static",
  RISE: "rise",
  DROP: "drop",
  PENALTY: "penalty",
  DEFENSE_WIN: "defense_win",
} as const

export class RankingSimulator {
  private order: number[] = []
  private baseline: Record<number, number> = {}
  private movement: Record<number, RankingMovement> = {}

  constructor(baselinePositions: Record<number, number>) {
    const entries = Object.entries(baselinePositions)
      .map(([pos, userId]) => [Number(pos), Number(userId)] as const)
      .filter(([pos, userId]) => Number.isFinite(pos) && userId > 0)
      .sort((a, b) => a[0] - b[0])

    for (const [position, userId] of entries) {
      this.order.push(userId)
      this.baseline[userId] = position
      this.movement[userId] = RankingMovement.STATIC
    }
  }

  applyVictory(
    challengerId: number,
    challengedId: number,
    challengedOriginalPosition: number
  ) {
    const memberCount = this.order.length
    if (memberCount < 2) return
    if (this.indexOf(challengerId) === -1 || this.indexOf(challengedId) === -1) {
      return
    }

    const currentChallengedPosition = this.indexOf(challengedId) + 1
    const basePosition =
      currentChallengedPosition > 0
        ? currentChallengedPosition
        : challengedOriginalPosition
    const targetPosition = Math.max(
      1,
      Math.min(basePosition, memberCount - 1)
    )

    this.remove(challengerId)
    this.remove(challengedId)
    this.insertAt(challengerId, targetPosition)
    this.insertAt(challengedId, targetPosition + 1)

    this.movement[challengerId] = RankingMovement.RISE
    this.movement[challengedId] = RankingMovement.DROP
  }

  applyDefeat(
    challengerId: number,
    challengerOriginalPosition: number,
    distance: number,
    memberCount: number
  ) {
    const currentIndex = this.indexOf(challengerId)
    if (currentIndex === -1) return

    const currentPosition = currentIndex + 1
    const basePosition =
      currentPosition > 0 ? currentPosition : challengerOriginalPosition

    this.remove(challengerId)
    const targetPosition = Math.max(
      1,
      Math.min(basePosition + distance, memberCount)
    )

    this.insertAt(challengerId, targetPosition)
    this.movement[challengerId] = RankingMovement.DROP
  }

  applyPenalty(userId: number, positionsDown: number, memberCount: number) {
    if (positionsDown <= 0) return
    const currentIndex = this.indexOf(userId)
    if (currentIndex === -1) return

    this.remove(userId)
    const limit = Math.min(memberCount, this.order.length + 1)
    const targetPosition = Math.min(limit, currentIndex + 1 + positionsDown)
    this.insertAt(userId, targetPosition)
    this.movement[userId] = RankingMovement.PENALTY
  }

  markDefenseWin(userId: number) {
    if (!(userId in this.baseline)) return
    const current = this.movement[userId] ?? RankingMovement.STATIC
    if (current === RankingMovement.DROP || current === RankingMovement.PENALTY) {
      return
    }
    this.movement[userId] = RankingMovement.DEFENSE_WIN
  }

  result(): Record<number, number> {
    const positions: Record<number, number> = {}
    this.order.forEach((userId, index) => {
      positions[index + 1] = userId
    })
    return positions
  }

  private remove(userId: number) {
    const index = this.indexOf(userId)
    if (index === -1) return
    this.order.splice(index, 1)
  }

  private insertAt(userId: number, position: number) {
    const clamped = Math.max(1, position)
    const index = Math.min(this.order.length, clamped - 1)
    this.order.splice(index, 0, userId)
  }

  private indexOf(userId: number) {
    return this.order.findIndex((id) => id === userId)
  }
}
