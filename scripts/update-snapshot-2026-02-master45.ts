import "dotenv/config"

import { PrismaClient } from "@prisma/client"

const SNAPSHOT_MONTH = "2026-02"
const RANKING_SLUG = "ranking-master-45"
const WRITE_START_SNAPSHOT = false

const POSITIONS: Array<{ position: number; name: string }> = [
  { position: 1, name: "Gilson Valle" },
  { position: 2, name: "Paulo Dantas" },
  { position: 3, name: "Airton" },
  { position: 4, name: "Rogerio Zaiter" },
  { position: 5, name: "Rodrigo Sillos" },
  { position: 6, name: "Fábio (Pesco)" },
  { position: 7, name: "Maurício Negrini" },
  { position: 8, name: "Matheus (Croza)" },
  { position: 9, name: "Paulo (Mocó)" },
  { position: 10, name: "Rubens (Rubinho)" },
  { position: 11, name: "Jarô" },
  { position: 12, name: "Albert Nunes" },
  { position: 13, name: "Rogério Botini" },
  { position: 14, name: "Carlos Barbosa Lima" },
  { position: 15, name: "Rodrigo Kako" },
  { position: 16, name: "Cassiano Ricardo" },
  { position: 17, name: "Luis Gustavo" },
  { position: 18, name: "Xuxa" },
  { position: 19, name: "Henrique Groh" },
  { position: 20, name: "Vinícius Di Nucci" },
  { position: 21, name: "Jorge Rodrigues" },
  { position: 22, name: "Pedro Pedroso" },
  { position: 23, name: "André Santana" },
  { position: 24, name: "Marcelo Palhares" },
  { position: 25, name: "Renato Zaragoza" },
  { position: 26, name: "Marcos Alves" },
  { position: 27, name: "Paulo Henrique (PH)" },
  { position: 28, name: "Figico" },
  { position: 29, name: "Iuri Pinheiro" },
  { position: 30, name: "Andrey Figueiredo" },
  { position: 31, name: "Alexander" },
  { position: 32, name: "Mario Filaretti" },
  { position: 33, name: "Euler Timóteo" },
  { position: 34, name: "Gilberto Damasceno" },
  { position: 35, name: "Carlão" },
  { position: 36, name: "Célio Assis" },
  { position: 37, name: "Neto" },
  { position: 38, name: "Márcio Papavero" },
  { position: 39, name: "Eric Moeller" },
  { position: 40, name: "Alexandre Rizzato" },
  { position: 41, name: "Mário Sérgio" },
  { position: 42, name: "Ricardo Brandolt" },
  { position: 43, name: "Ricardo Fló" },
  { position: 44, name: "Washington Ferri" },
  { position: 45, name: "Fernando Fernandes" },
  { position: 46, name: "Rodrigo Giovanetti" },
  { position: 47, name: "Roberto Maciel" },
  { position: 48, name: "Luís Emerson" },
  { position: 49, name: "Luciano Machado" },
  { position: 50, name: "Maurício Puschel" },
  { position: 51, name: "Santiago" },
  { position: 52, name: "Chris (Christopher)" },
  { position: 53, name: "Mauro Tomé" },
  { position: 54, name: "Luiz Henrique" },
]

const NAME_ALIASES: Record<string, string[]> = {
  "fabio pesco": ["fabio pesco", "pesco"],
  "rogerio zaiter": ["zaiter"],
  "rubens rubinho": ["rubinho"],
  "matheus croza": ["croza"],
  "paulo moco": ["moco", "moço"],
  "ricardo flo": ["ricardo flo"],
  "euler timoteo": ["euler"],
  "renato zaragoza": ["renato zaragoza drago"],
  "luis gustavo": ["luis gustavo f pereira", "luis gustavo pereira"],
  "paulo henrique ph": ["paulo henrique", "ph"],
  "henrique groh": ["henrique ricardo emilio groh"],
  "rogerio botini": ["botini"],
  "andre santana": ["andre sant ana", "andre santana"],
  "alexander": ["alexander rodrigues"],
  "carlao": ["carlao", "carlao 33"],
  "jaro": ["jaro jaro"],
  "neto": ["eugenio de araujo neto"],
  "chris christopher": ["christopher james quinn", "chris"],
  "mauro tome": ["mauro tome"],
  "luiz henrique": ["luiz henrique", "luis henrique lopes", "luis henrique"],
}

const prisma = new PrismaClient()

const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()"'`.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()

const stripParentheses = (value: string) =>
  value.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim()

const extractParenContent = (value: string) => {
  const matches = value.match(/\(([^)]+)\)/g) ?? []
  return matches
    .map((match) => match.replace(/[()]/g, "").trim())
    .filter(Boolean)
}

const getBusinessDay = (monthStart: Date, index: number) => {
  const date = new Date(monthStart)
  let count = 0

  while (count < index) {
    const day = date.getDay()
    if (day !== 0 && day !== 6) {
      count += 1
      if (count === index) break
    }
    date.setDate(date.getDate() + 1)
  }

  return date
}

async function ensureOpenRound(rankingId: number, monthKey: Date) {
  const existing = await prisma.rounds.findFirst({
    where: { ranking_id: rankingId, reference_month: monthKey },
    select: { id: true },
  })

  if (existing) {
    await prisma.rounds.update({
      where: { id: existing.id },
      data: { status: "open", closed_at: null },
    })
    return
  }

  const monthStartLocal = new Date(
    monthKey.getUTCFullYear(),
    monthKey.getUTCMonth(),
    1,
    0,
    0,
    0,
    0
  )

  const roundOpen = new Date(monthStartLocal)
  roundOpen.setHours(7, 0, 0, 0)

  const roundClose = new Date(monthStartLocal)
  roundClose.setMonth(roundClose.getMonth() + 1)
  roundClose.setDate(0)
  roundClose.setHours(23, 59, 0, 0)

  const blueDay = getBusinessDay(monthStartLocal, 1)
  const blueOpen = new Date(blueDay)
  blueOpen.setHours(7, 0, 0, 0)

  const blueClose = new Date(blueDay)
  blueClose.setHours(23, 59, 0, 0)

  const freeDay = getBusinessDay(monthStartLocal, 2)
  const openStart = new Date(freeDay)
  openStart.setHours(7, 0, 0, 0)

  const openEnd = new Date(freeDay)
  openEnd.setHours(23, 59, 0, 0)

  await prisma.rounds.create({
    data: {
      title: `Rodada ${monthStartLocal.toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      })}`,
      reference_month: monthKey,
      ranking_id: rankingId,
      round_opens_at: roundOpen,
      blue_point_opens_at: blueOpen,
      blue_point_closes_at: blueClose,
      open_challenges_at: openStart,
      open_challenges_end_at: openEnd,
      matches_deadline: roundClose,
      status: "open",
    },
  })
}

async function main() {
  const ranking = await prisma.rankings.findFirst({
    where: { slug: RANKING_SLUG },
    select: { id: true, name: true, slug: true },
  })

  if (!ranking) {
    throw new Error(`Ranking slug "${RANKING_SLUG}" nao encontrado.`)
  }

  const members = await prisma.ranking_memberships.findMany({
    where: { ranking_id: ranking.id },
    select: {
      user_id: true,
      position: true,
      users: { select: { first_name: true, last_name: true, nickname: true } },
    },
    orderBy: { position: "asc" },
  })

  if (!members.length) {
    throw new Error("Ranking sem participantes.")
  }

  const membershipIndex = new Map<string, number[]>()
  const globalIndex = new Map<string, number[]>()
  const addIndex = (
    index: Map<string, number[]>,
    label: string | null | undefined,
    userId: number
  ) => {
    const normalized = label ? normalizeName(label) : ""
    if (!normalized) return
    const existing = index.get(normalized) ?? []
    if (!existing.includes(userId)) {
      existing.push(userId)
      index.set(normalized, existing)
    }
  }

  members.forEach((member) => {
    const full = `${member.users.first_name ?? ""} ${member.users.last_name ?? ""}`.trim()
    const nickname = member.users.nickname?.trim() ?? ""
    addIndex(membershipIndex, full, member.user_id)
    addIndex(membershipIndex, nickname, member.user_id)
    if (full && nickname) {
      addIndex(membershipIndex, `${full} ${nickname}`, member.user_id)
    }
  })

  const users = await prisma.users.findMany({
    select: { id: true, first_name: true, last_name: true, nickname: true },
  })

  users.forEach((user) => {
    const full = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()
    const nickname = user.nickname?.trim() ?? ""
    addIndex(globalIndex, full, user.id)
    addIndex(globalIndex, nickname, user.id)
    if (full && nickname) {
      addIndex(globalIndex, `${full} ${nickname}`, user.id)
    }
  })

  const resolveUserId = (label: string, index: Map<string, number[]>) => {
    const keys = new Set<string>()
    const normalized = normalizeName(label)
    if (normalized) {
      keys.add(normalized)
    }

    const stripped = stripParentheses(label)
    const normalizedStripped = normalizeName(stripped)
    if (normalizedStripped) {
      keys.add(normalizedStripped)
    }

    extractParenContent(label).forEach((part) => {
      const normalizedPart = normalizeName(part)
      if (normalizedPart) {
        keys.add(normalizedPart)
      }
    })

    const aliasKeys = NAME_ALIASES[normalized] ?? []
    aliasKeys.forEach((alias) => {
      const normalizedAlias = normalizeName(alias)
      if (normalizedAlias) {
        keys.add(normalizedAlias)
      }
    })

    const matched = new Set<number>()
    keys.forEach((key) => {
      const found = index.get(key) ?? []
      found.forEach((userId) => matched.add(userId))
    })

    return Array.from(matched)
  }

  const assigned = new Map<number, string>()
  const unresolved: string[] = []
  const ambiguous: Array<{ label: string; userIds: number[] }> = []

  const resolvedPositions = POSITIONS.map((entry) => {
    let matches = resolveUserId(entry.name, membershipIndex)
    const matchedFromRanking = matches.length > 0
    if (!matches.length) {
      matches = resolveUserId(entry.name, globalIndex)
    }
    if (matches.length === 0) {
      unresolved.push(entry.name)
      return null
    }
    if (matches.length > 1) {
      ambiguous.push({ label: entry.name, userIds: matches })
      return null
    }
    const userId = matches[0]
    if (assigned.has(userId)) {
      ambiguous.push({ label: entry.name, userIds: [userId] })
      return null
    }
    assigned.set(userId, entry.name)
    if (!matchedFromRanking) {
      console.warn(
        `Aviso: jogador "${entry.name}" nao esta no ranking atual (user_id ${userId}).`
      )
    }
    return { position: entry.position, userId }
  })

  if (unresolved.length || ambiguous.length) {
    if (unresolved.length) {
      console.error("Nomes nao encontrados:")
      unresolved.forEach((name) => console.error(`- ${name}`))
    }
    if (ambiguous.length) {
      console.error("Nomes ambiguos:")
      ambiguous.forEach((item) =>
        console.error(`- ${item.label} (ids: ${item.userIds.join(", ")})`)
      )
    }
    process.exit(1)
  }

  const positions = resolvedPositions.filter(Boolean) as Array<{
    position: number
    userId: number
  }>

  const unassignedMembers = members.filter(
    (member) => !assigned.has(member.user_id)
  )
  if (unassignedMembers.length) {
    console.warn("Aviso: jogadores do ranking atual sem posicao no snapshot:")
    unassignedMembers.forEach((member) => {
      const full = `${member.users.first_name ?? ""} ${member.users.last_name ?? ""}`.trim()
      const nickname = member.users.nickname?.trim()
      console.warn(
        `- ${full || nickname || `ID ${member.user_id}`} (id ${member.user_id})`
      )
    })
  }

  const [yearRaw, monthRaw] = SNAPSHOT_MONTH.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const monthStart = new Date(Date.UTC(year, month - 1, 1))
  if (!Number.isFinite(year) || !Number.isFinite(month) || Number.isNaN(monthStart.getTime())) {
    throw new Error("Mes invalido.")
  }

  await prisma.ranking_snapshots.deleteMany({
    where: {
      ranking_id: ranking.id,
      round_month: monthStart,
      snapshot_type: "end",
    },
  })

  await prisma.ranking_snapshots.createMany({
    data: positions.map((entry) => ({
      ranking_id: ranking.id,
      round_month: monthStart,
      snapshot_type: "end" as const,
      user_id: entry.userId,
      position: entry.position,
    })),
    skipDuplicates: true,
  })

  if (WRITE_START_SNAPSHOT) {
    await prisma.ranking_snapshots.deleteMany({
      where: {
        ranking_id: ranking.id,
        round_month: monthStart,
        snapshot_type: "start",
      },
    })

    await prisma.ranking_snapshots.createMany({
      data: positions.map((entry) => ({
        ranking_id: ranking.id,
        round_month: monthStart,
        snapshot_type: "start" as const,
        user_id: entry.userId,
        position: entry.position,
      })),
      skipDuplicates: true,
    })
  }

  await ensureOpenRound(ranking.id, monthStart)

  for (const entry of positions) {
    await prisma.ranking_memberships.updateMany({
      where: { ranking_id: ranking.id, user_id: entry.userId },
      data: { position: entry.position },
    })
  }

  console.log(
    `Snapshot atualizado para ${ranking.name} (${SNAPSHOT_MONTH}), ${positions.length} jogadores.`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
