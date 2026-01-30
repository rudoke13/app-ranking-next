import "dotenv/config"

import { PrismaClient } from "@prisma/client"

const CSV_DATA = `ranking,desafiante,desafiado,data,placar,desafiado_em
Geral,Bruno Dedini,Pedro Henrique,2025-10-09 13:00,WO,2025-10-02 13:04
Geral,Rafael Calixto,Ícaro Felter,2025-10-16 08:09,8x6,2025-10-01 08:53
Geral,DDD,Marcos Mauad,2025-10-17 19:00,8x4,2025-10-02 08:28
Geral,Flavião,Marcos Geia,2025-10-20 17:00,6x8,2025-10-01 09:20
Geral,Jean Querido Nicolini,Julio Cesar Calliero,2025-10-21 18:31,8x5,2025-10-01 07:08
Geral,Murilo Lazarini,Marquinho,2025-10-21 19:30,9x7,2025-10-01 17:28
Geral,Rodolfo Lobão,Clovis De Paula,2025-10-21 21:30,6x8,2025-10-02 09:56
Geral,Vinícius Di Nucci,Igor Borges,2025-10-23 19:00,3x8,2025-10-02 07:57
Geral,José Pedro,Caio Nunes,2025-10-24 15:00,8x6,2025-10-01 05:56
Geral,Pedro Lotufo,Felipe Pifano Dias,2025-10-24 17:30,9x8,2025-10-02 07:00
Geral,Gabriel Pedon,Paulo Magalhães,2025-10-24 20:00,3x8,2025-10-02 08:34
Geral,Denis Martins,Thiago Silva,2025-10-25 17:15,8x2,2025-10-02 07:00
Geral,Marcelo Ramos,Rodolfo Lelis,2025-10-25 19:53,6x3 RET,2025-10-02 07:00
Geral,Maiara Menezes,Paulo Solera,2025-10-28 10:58,WO,2025-10-02 11:00
Geral,Tigü,Lucas Fernandes,2025-10-28 16:30,8x1,2025-10-02 11:09
Geral,Rafael Gonçalvez,João Vitor Coelho,2025-10-28 18:26,4x8,2025-10-02 08:11
Geral,Fred Vieira,Brasil,2025-10-29 12:32,8x2,2025-10-02 07:00
Geral,Cury,Matheus Coli,2025-10-29 17:02,WO,2025-10-01 07:00
Geral,Mineiro,Cristiano Mafort,2025-10-29 19:30,8x3,2025-10-02 07:00
Geral,Derek Ferreira,Rodolfo César,2025-10-29 20:45,2x8,2025-10-03 09:40
Geral,Willian Correa,Marcílio Fonseca,2025-10-30 08:49,8x9,2025-10-02 08:14
Geral,Ronaldo Ribeiro,Pedro Afonso,2025-10-30 08:59,WO,2025-10-03 09:47
Geral,André Emídio,Carlos Yuri,2025-10-30 12:00,8x1,2025-10-02 10:26
Geral,Bill,Ricardo Pavani,2025-10-30 16:00,8x3,2025-10-01 07:00
Geral,Matheus Machado,Felipe Betioli,2025-10-30 16:00,WO,2025-10-02 17:12
Geral,Fabrício Levi Maciel,Maurício Cesar,2025-10-30 19:07,8x6,2025-10-02 07:00
Geral,Felipe Favalessa,Samuel Feres,2025-10-30 21:32,1x8,2025-10-02 22:08`

type CsvRow = {
  ranking: string
  challenger: string
  challenged: string
  scheduledFor: string
  score: string
  challengedAt: string
}

type ScoreResult = {
  winner: "challenger" | "challenged" | null
  challengerGames: number | null
  challengedGames: number | null
  challengerWalkover: boolean
  challengedWalkover: boolean
  challengerRetired: boolean
  challengedRetired: boolean
}

const prisma = new PrismaClient()

const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()

const parseDateTimeUtc = (value: string) => {
  const [datePart, timePart] = value.trim().split(" ")
  if (!datePart || !timePart) {
    throw new Error(`Data invalida: "${value}"`)
  }

  const [year, month, day] = datePart.split("-").map(Number)
  const [hour, minute] = timePart.split(":").map(Number)

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    throw new Error(`Data invalida: "${value}"`)
  }

  return new Date(Date.UTC(year, month - 1, day, hour, minute))
}

const parseScore = (raw: string): ScoreResult => {
  const cleaned = raw.trim()
  const upper = cleaned.toUpperCase()

  if (upper === "WO" || upper === "W.O.") {
    return {
      winner: "challenger",
      challengerGames: null,
      challengedGames: null,
      challengerWalkover: false,
      challengedWalkover: true,
      challengerRetired: false,
      challengedRetired: false,
    }
  }

  const isRetired = upper.includes("RET")
  const scorePart = upper.replace("RET", "").trim()
  const parts = scorePart.split(/x|×/i)
  if (parts.length !== 2) {
    throw new Error(`Placar invalido: "${raw}"`)
  }

  const left = Number(parts[0])
  const right = Number(parts[1])
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    throw new Error(`Placar invalido: "${raw}"`)
  }

  const winner = left === right ? null : left > right ? "challenger" : "challenged"
  if (!winner) {
    throw new Error(`Placar sem vencedor: "${raw}"`)
  }

  return {
    winner,
    challengerGames: left,
    challengedGames: right,
    challengerWalkover: false,
    challengedWalkover: false,
    challengerRetired: isRetired && winner === "challenged",
    challengedRetired: isRetired && winner === "challenger",
  }
}

const parseCsv = (input: string): CsvRow[] => {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const rows: CsvRow[] = []
  const [, ...entries] = lines
  entries.forEach((line) => {
    const parts = line.split(",")
    if (parts.length < 6) {
      throw new Error(`Linha CSV invalida: "${line}"`)
    }
    const [ranking, challenger, challenged, scheduledFor, score, challengedAt] =
      parts.map((part) => part.trim())

    rows.push({
      ranking,
      challenger,
      challenged,
      scheduledFor,
      score,
      challengedAt,
    })
  })

  return rows
}

const getMonthKey = (date: Date) => {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

async function main() {
  const rows = parseCsv(CSV_DATA)
  const rankings = await prisma.rankings.findMany({
    select: { id: true, name: true, slug: true },
  })

  const rankingCache = new Map<string, number>()
  const membershipsCache = new Map<number, Map<string, number>>()
  const membershipDataCache = new Map<number, Map<number, number>>()
  const roundsCache = new Map<string, number | null>()

  const resolveRankingId = (label: string) => {
    if (rankingCache.has(label)) {
      return rankingCache.get(label) as number
    }

    const normalized = normalizeName(label)
    const explicitSlug = process.env.IMPORT_RANKING_SLUG?.trim()
    if (explicitSlug && normalized === "geral") {
      const bySlug = rankings.find((ranking) => ranking.slug === explicitSlug)
      if (!bySlug) {
        throw new Error(
          `Ranking slug "${explicitSlug}" nao encontrado para "${label}".`
        )
      }
      rankingCache.set(label, bySlug.id)
      return bySlug.id
    }

    const matches = rankings.filter((ranking) => {
      const name = normalizeName(ranking.name)
      const slug = normalizeName(ranking.slug)
      return name.includes(normalized) || slug.includes(normalized)
    })

    if (matches.length === 1) {
      rankingCache.set(label, matches[0].id)
      return matches[0].id
    }

    if (matches.length > 1) {
      throw new Error(
        `Ranking "${label}" ambiguo. Matches: ${matches
          .map((item) => `${item.name} (${item.slug})`)
          .join(", ")}. Defina IMPORT_RANKING_SLUG.`
      )
    }

    throw new Error(`Ranking "${label}" nao encontrado.`)
  }

  const buildMembershipMaps = async (rankingId: number) => {
    if (membershipsCache.has(rankingId)) return

    const members = await prisma.ranking_memberships.findMany({
      where: { ranking_id: rankingId },
      select: {
        user_id: true,
        position: true,
        users: { select: { first_name: true, last_name: true, nickname: true } },
      },
    })

    const nameMap = new Map<string, number>()
    const positionMap = new Map<number, number>()

    const register = (key: string, userId: number) => {
      if (!key) return
      const normalized = normalizeName(key)
      if (!normalized) return
      if (nameMap.has(normalized)) {
        throw new Error(`Nome duplicado no ranking: "${key}"`)
      }
      nameMap.set(normalized, userId)
    }

    members.forEach((member) => {
      const fullName = `${member.users.first_name ?? ""} ${member.users.last_name ?? ""}`.trim()
      register(fullName, member.user_id)
      if (member.users.nickname) {
        register(member.users.nickname, member.user_id)
      }
      positionMap.set(member.user_id, member.position ?? 0)
    })

    membershipsCache.set(rankingId, nameMap)
    membershipDataCache.set(rankingId, positionMap)
  }

  const resolveUserId = async (rankingId: number, name: string) => {
    await buildMembershipMaps(rankingId)
    const map = membershipsCache.get(rankingId)
    if (!map) {
      throw new Error(`Ranking ${rankingId} nao carregado.`)
    }
    const normalized = normalizeName(name)
    const userId = map.get(normalized)
    if (!userId) {
      throw new Error(`Jogador "${name}" nao encontrado no ranking.`)
    }
    return userId
  }

  const resolveRoundId = async (rankingId: number, monthKey: string) => {
    const cacheKey = `${rankingId}-${monthKey}`
    if (roundsCache.has(cacheKey)) {
      return roundsCache.get(cacheKey) as number | null
    }

    const [year, month] = monthKey.split("-").map(Number)
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      throw new Error(`Mes invalido: "${monthKey}"`)
    }
    const referenceMonth = new Date(Date.UTC(year, month - 1, 1))
    const round =
      (await prisma.rounds.findFirst({
        where: { ranking_id: rankingId, reference_month: referenceMonth },
        select: { id: true },
      })) ??
      (await prisma.rounds.findFirst({
        where: { ranking_id: null, reference_month: referenceMonth },
        select: { id: true },
      }))

    const roundId = round?.id ?? null
    roundsCache.set(cacheKey, roundId)
    return roundId
  }

  let createdCount = 0
  let skippedCount = 0

  for (const row of rows) {
    const rankingId = resolveRankingId(row.ranking)
    const challengerId = await resolveUserId(rankingId, row.challenger)
    const challengedId = await resolveUserId(rankingId, row.challenged)

    const scheduledFor = parseDateTimeUtc(row.scheduledFor)
    const createdAt = parseDateTimeUtc(row.challengedAt)
    const score = parseScore(row.score)

    const monthKey = getMonthKey(scheduledFor)
    const roundId = await resolveRoundId(rankingId, monthKey)
    const positionMap = membershipDataCache.get(rankingId)
    const challengerPosition = positionMap?.get(challengerId) ?? null
    const challengedPosition = positionMap?.get(challengedId) ?? null

    const existing = await prisma.challenges.findFirst({
      where: {
        ranking_id: rankingId,
        challenger_id: challengerId,
        challenged_id: challengedId,
        scheduled_for: scheduledFor,
      },
      select: { id: true },
    })

    if (existing) {
      skippedCount += 1
      continue
    }

    const challenge = await prisma.challenges.create({
      data: {
        ranking_id: rankingId,
        challenger_id: challengerId,
        challenged_id: challengedId,
        scheduled_for: scheduledFor,
        accepted_at: createdAt,
        played_at: scheduledFor,
        result_reported_at: scheduledFor,
        challenger_games: score.challengerGames,
        challenged_games: score.challengedGames,
        challenger_tiebreak: null,
        challenged_tiebreak: null,
        challenger_walkover: score.challengerWalkover,
        challenged_walkover: score.challengedWalkover,
        challenger_retired: score.challengerRetired,
        challenged_retired: score.challengedRetired,
        challenger_position_at_challenge: challengerPosition,
        challenged_position_at_challenge: challengedPosition,
        winner: score.winner,
        status: "completed",
        round_id: roundId,
        created_at: createdAt,
        updated_at: scheduledFor,
      },
    })

    await prisma.challenge_events.createMany({
      data: [
        {
          challenge_id: challenge.id,
          event_type: "created",
          payload: {
            ranking_id: rankingId,
            challenger_id: challengerId,
            challenged_id: challengedId,
            scheduled_for: scheduledFor.toISOString(),
            status: "scheduled",
          },
          created_by: challengerId,
        },
        {
          challenge_id: challenge.id,
          event_type: "completed",
          payload: {
            winner: score.winner,
            played_at: scheduledFor.toISOString(),
          },
          created_by: challengerId,
        },
      ],
    })

    createdCount += 1
  }

  console.log(`Desafios criados: ${createdCount}`)
  console.log(`Desafios ignorados (duplicados): ${skippedCount}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
