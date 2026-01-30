import "dotenv/config"

import { PrismaClient } from "@prisma/client"

const CSV_DATA = `ranking,desafiante,desafiado,data,placar,desafiado_em
Ranking Masculino Geral,Marcos Geia,Pedro Lotufo,2025-11-11 05:45,8x9,2025-11-04 07:00
Ranking Masculino Geral,Igor Borges,Matheus Coli,2025-11-11 19:00,8x6,2025-11-03 09:26
Ranking Masculino Geral,Clovis De Paula,Pedro Henrique,2025-11-15 16:00,WO,2025-11-04 07:00
Ranking Masculino Geral,Samuel Feres,Denis Togoro,2025-11-20 09:06,9x8,2025-11-04 08:04
Ranking Masculino Geral,William Kie,Jorginho,2025-11-20 10:00,8x3,2025-11-04 07:33
Ranking Masculino Geral,Willian Correa,Jean Querido Nicolini,2025-11-20 10:00,8x4,2025-11-04 07:46
Ranking Masculino Geral,Ricardo Pavani,Rodolfo César,2025-11-21 16:00,0x8,2025-11-03 09:08
Ranking Masculino Geral,Maiara Menezes,Rafael Calixto,2025-11-21 16:20,6x8,2025-11-04 07:00
Ranking Masculino Geral,Fabrício Levi Maciel,Gisiel Rezende,2025-11-21 16:21,WO,2025-11-04 07:00
Ranking Masculino Geral,Derek Ferreira,Hugo Basili,2025-11-23 12:15,8x5,2025-11-04 07:00
Ranking Masculino Geral,Marcelo Ramos,José Pedro,2025-11-23 13:00,2x8,2025-11-04 09:30
Ranking Masculino Geral,Du Saraiva,Paulo Magalhães,2025-11-25 16:00,3x8,2025-11-04 08:19
Ranking Masculino Geral,Mineiro,Flavião,2025-11-25 19:00,9x7,2025-11-04 07:27
Ranking Masculino Geral,Gabriel Pedon,Celso Rosa,2025-11-25 19:30,8x1,2025-11-04 07:49
Ranking Masculino Geral,João Vitor Coelho,Bill,2025-11-26 10:30,8x4,2025-11-03 07:29
Ranking Masculino Geral,Rodolfo Lelis,Caio Nunes,2025-11-26 20:00,4x8,2025-11-03 07:56
Ranking Masculino Geral,Bruno Dedini,Tigú,2025-11-26 20:10,9x8,2025-11-04 07:58
Ranking Masculino Geral,André Emídio,Thiago Aguiar de Oliveira,2025-11-26 21:00,8x0,2025-11-04 20:01
Ranking Masculino Geral,Denis Martins,Brasil,2025-11-27 19:00,8x2,2025-11-04 11:42
Ranking Masculino Geral,DDD,Maurício Cesar,2025-11-28 07:00,5x8,2025-11-04 07:00
Ranking Masculino Geral,Lucas Fernandes,Marcos Mauad,2025-11-28 11:50,8x5,2025-11-04 07:11
Ranking Masculino Geral,Felipe Pifano Dias,Lucas Bueno,2025-11-28 11:51,WO,2025-11-03 07:06
Ranking Masculino Geral,Felipe Favalessa,Ronaldo Ribeiro,2025-11-28 11:52,WO,2025-11-04 07:03
Ranking Masculino Geral,Lucas Neves,Murilo Lazarini,2025-11-28 12:00,6x8,2025-11-03 10:22
Ranking Masculino Geral,Rafael Gonçalvez,Cury,2025-11-28 12:00,WO,2025-11-04 07:28
Ranking Masculino Geral,Rodolfo Lobão,Ederson Araujo,2025-11-29 15:00,WO,2025-11-04 19:57
Ranking Masculino Geral,Renato 6zero,Marcilio Fonseca,2025-11-29 21:18,WO,2025-11-05 11:17
Ranking Masculino Geral,Ícaro Felter,Thiago Silva,,5x8,2025-11-03 07:00`

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

const NAME_ALIASES: Record<string, string> = {}

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
        const existing = nameMap.get(normalized)
        if (existing && existing !== userId) {
          throw new Error(`Nome duplicado no ranking: "${key}"`)
        }
        return
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
    const alias = NAME_ALIASES[normalized]
    const userId = map.get(alias ?? normalized)
    return userId ?? null
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
  let updatedCount = 0
  let skippedCount = 0
  let skippedMissingCount = 0
  let skippedInvalidCount = 0
  const missingPlayers = new Set<string>()
  const invalidRows: string[] = []

  for (const row of rows) {
    if (!row.scheduledFor) {
      skippedInvalidCount += 1
      invalidRows.push(
        `${row.challenger} vs ${row.challenged} (data ausente)`
      )
      continue
    }

    const rankingId = resolveRankingId(row.ranking)
    const challengerId = await resolveUserId(rankingId, row.challenger)
    const challengedId = await resolveUserId(rankingId, row.challenged)

    if (!challengerId || !challengedId) {
      skippedMissingCount += 1
      if (!challengerId) missingPlayers.add(row.challenger)
      if (!challengedId) missingPlayers.add(row.challenged)
      continue
    }

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
      select: {
        id: true,
        status: true,
        accepted_at: true,
        challenger_position_at_challenge: true,
        challenged_position_at_challenge: true,
      },
    })

    if (existing && existing.status === "completed") {
      skippedCount += 1
      continue
    }

    const updatePayload = {
      accepted_at: existing?.accepted_at ?? createdAt,
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
      challenger_position_at_challenge:
        existing?.challenger_position_at_challenge ?? challengerPosition,
      challenged_position_at_challenge:
        existing?.challenged_position_at_challenge ?? challengedPosition,
      winner: score.winner,
      status: "completed" as const,
      round_id: roundId,
      updated_at: scheduledFor,
    }

    if (existing) {
      await prisma.challenges.update({
        where: { id: existing.id },
        data: updatePayload,
      })

      const completedEvent = await prisma.challenge_events.findFirst({
        where: { challenge_id: existing.id, event_type: "completed" },
        select: { id: true },
      })

      if (!completedEvent) {
        await prisma.challenge_events.create({
          data: {
            challenge_id: existing.id,
            event_type: "completed",
            payload: {
              winner: score.winner,
              played_at: scheduledFor.toISOString(),
            },
            created_by: challengerId,
          },
        })
      }

      updatedCount += 1
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
  console.log(`Desafios atualizados: ${updatedCount}`)
  console.log(`Desafios ignorados (ja completos): ${skippedCount}`)
  console.log(`Desafios ignorados (jogador ausente): ${skippedMissingCount}`)
  console.log(`Desafios ignorados (linha invalida): ${skippedInvalidCount}`)
  if (missingPlayers.size > 0) {
    console.log("Jogadores nao encontrados no ranking:")
    Array.from(missingPlayers)
      .sort((a, b) => a.localeCompare(b))
      .forEach((name) => console.log(`- ${name}`))
  }
  if (invalidRows.length > 0) {
    console.log("Linhas ignoradas (dados ausentes):")
    invalidRows.forEach((row) => console.log(`- ${row}`))
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
