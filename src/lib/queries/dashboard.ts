import { db } from "@/lib/db"

export type RoundSummary = {
  id: number
  title: string
  referenceMonth: Date
  status: string
  rankingName: string | null
}

export type ChallengeSummary = {
  id: number
  scheduledFor: Date
  status: string
  rankingName: string | null
  opponentName: string
  isChallenger: boolean
}

export type DashboardSummary = {
  activeRound: RoundSummary | null
  receivedChallenges: ChallengeSummary[]
  myChallenges: ChallengeSummary[]
  recentResults: ChallengeSummary[]
}

function formatName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim()
}

export async function getDashboardSummary(userId: number): Promise<DashboardSummary> {
  const activeRound = await db.rounds.findFirst({
    orderBy: { reference_month: "desc" },
    include: { rankings: true },
  })

  const receivedChallenges = await db.challenges.findMany({
    where: {
      challenged_id: userId,
    },
    include: {
      rankings: true,
      users_challenges_challenger_idTousers: {
        select: { first_name: true, last_name: true },
      },
    },
    orderBy: { scheduled_for: "desc" },
    take: 5,
  })

  const myChallenges = await db.challenges.findMany({
    where: {
      challenger_id: userId,
    },
    include: {
      rankings: true,
      users_challenges_challenged_idTousers: {
        select: { first_name: true, last_name: true },
      },
    },
    orderBy: { scheduled_for: "desc" },
    take: 5,
  })

  const recentResults = await db.challenges.findMany({
    where: {
      OR: [{ challenger_id: userId }, { challenged_id: userId }],
      status: "completed",
    },
    include: {
      rankings: true,
      users_challenges_challenged_idTousers: {
        select: { first_name: true, last_name: true },
      },
      users_challenges_challenger_idTousers: {
        select: { first_name: true, last_name: true },
      },
    },
    orderBy: { played_at: "desc" },
    take: 5,
  })

  return {
    activeRound: activeRound
      ? {
          id: activeRound.id,
          title: activeRound.title,
          referenceMonth: activeRound.reference_month,
          status: activeRound.status,
          rankingName: activeRound.rankings?.name ?? null,
        }
      : null,
    receivedChallenges: receivedChallenges.map((challenge) => ({
      id: challenge.id,
      scheduledFor: challenge.scheduled_for,
      status: challenge.status,
      rankingName: challenge.rankings?.name ?? null,
      opponentName: formatName(
        challenge.users_challenges_challenger_idTousers.first_name,
        challenge.users_challenges_challenger_idTousers.last_name
      ),
      isChallenger: false,
    })),
    myChallenges: myChallenges.map((challenge) => ({
      id: challenge.id,
      scheduledFor: challenge.scheduled_for,
      status: challenge.status,
      rankingName: challenge.rankings?.name ?? null,
      opponentName: formatName(
        challenge.users_challenges_challenged_idTousers.first_name,
        challenge.users_challenges_challenged_idTousers.last_name
      ),
      isChallenger: true,
    })),
    recentResults: recentResults.map((challenge) => {
      const opponent =
        challenge.challenger_id === userId
          ? challenge.users_challenges_challenged_idTousers
          : challenge.users_challenges_challenger_idTousers

      return {
        id: challenge.id,
        scheduledFor: challenge.scheduled_for,
        status: challenge.status,
        rankingName: challenge.rankings?.name ?? null,
        opponentName: formatName(opponent.first_name, opponent.last_name),
        isChallenger: challenge.challenger_id === userId,
      }
    }),
  }
}
