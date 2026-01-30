import "dotenv/config"

import { PrismaClient } from "@prisma/client"

const SNAPSHOT_MONTH = "2025-11"
const RANKING_SLUG = "ranking-masculino"
const WRITE_START_SNAPSHOT = false

const POSITIONS: Array<{ position: number; name: string }> = [
  { position: 1, name: "Rodolfo César" },
  { position: 2, name: "Murilo Lazarini" },
  { position: 3, name: "Marcos Filho" },
  { position: 4, name: "Lucas Neves" },
  { position: 5, name: "Matheus Coli" },
  { position: 6, name: "Zé Pedro" },
  { position: 7, name: "Caio Nunes" },
  { position: 8, name: "Valter Jr (Bill)" },
  { position: 9, name: "Ricardo Pavani" },
  { position: 10, name: "Hugo Basili" },
  { position: 11, name: "Marcelo Ramos" },
  { position: 12, name: "Rodolfo Lelis" },
  { position: 13, name: "João Victor" },
  { position: 14, name: "Cury" },
  { position: 15, name: "Igor Borges" },
  { position: 16, name: "Fred Vieira" },
  { position: 17, name: "Derek Ferreira" },
  { position: 18, name: "Ricardo Brasil" },
  { position: 19, name: "Allan Bradley" },
  { position: 20, name: "Marcos Alvarenga" },
  { position: 21, name: "Rafael Gonçalvez" },
  { position: 22, name: "Pedro Machado (PPR)" },
  { position: 23, name: "Denis Martins" },
  { position: 24, name: "Thiago Silva" },
  { position: 25, name: "Jorginho" },
  { position: 26, name: "Lucas Bueno" },
  { position: 27, name: "Pedro Lotufo" },
  { position: 28, name: "Felipe Dias" },
  { position: 29, name: "Marcos Geia" },
  { position: 30, name: "Gisiel Resende" },
  { position: 31, name: "Marcilio Fonseca" },
  { position: 32, name: "Rafael Calixto" },
  { position: 33, name: "Ícaro Felter" },
  { position: 34, name: "Willian Kie" },
  { position: 35, name: "Jean Querido" },
  { position: 36, name: "Júlio Calliero" },
  { position: 37, name: "Fabrício Levi Maciel" },
  { position: 38, name: "William Correa" },
  { position: 39, name: "Maurício César" },
  { position: 40, name: "Gustavo Fonseca" },
  { position: 41, name: "Maiara" },
  { position: 42, name: "Flavião" },
  { position: 43, name: "Paulo Solera" },
  { position: 44, name: "Paulo Magalhães" },
  { position: 45, name: "Gleidon Mineiro" },
  { position: 46, name: "Cristiano Mafort" },
  { position: 47, name: "Gustavo (DDD)" },
  { position: 48, name: "Marcos César Mauad" },
  { position: 49, name: "Tiago (Tigú)" },
  { position: 50, name: "Lucas Fernandes" },
  { position: 51, name: "Eduardo Marcondes" },
  { position: 52, name: "Celso Rosa" },
  { position: 53, name: "Kaique Oliveira" },
  { position: 54, name: "Bruno Dedini" },
  { position: 55, name: "Pedro Henrique" },
  { position: 56, name: "Marcio Marcondes" },
  { position: 57, name: "Thiago Oliveira" },
  { position: 58, name: "André Castilho" },
  { position: 59, name: "Lucca Bianchi" },
  { position: 60, name: "Gabriel Pedon" },
  { position: 61, name: "Rafael Castro" },
  { position: 62, name: "Clóvis de Paula" },
  { position: 63, name: "Denis Togoro" },
  { position: 64, name: "Enzo Victor" },
  { position: 65, name: "André Emídio" },
  { position: 66, name: "Carlos Yuri" },
  { position: 67, name: "Eduardo Safady" },
  { position: 68, name: "Ederson Araújo" },
  { position: 69, name: "André Augustinho" },
  { position: 70, name: "Diogo Sandret" },
  { position: 71, name: "Beto Rezende" },
  { position: 72, name: "Rodolfo Lobão" },
  { position: 73, name: "Samuel Feres" },
  { position: 74, name: "Áquila Cardoso" },
  { position: 75, name: "Paulinho" },
  { position: 76, name: "Ronaldo Ribeiro" },
  { position: 77, name: "Murilo Lorena" },
  { position: 78, name: "Fábio da Motta" },
  { position: 79, name: "Felipe Favalessa" },
  { position: 80, name: "Gilson César" },
  { position: 81, name: "Enzo Uliani" },
  { position: 82, name: "Matheus Machado" },
  { position: 83, name: "Felipe Betioli" },
  { position: 84, name: "Du Saraiva" },
  { position: 85, name: "Renato (6 Zero)" },
]

const NAME_ALIASES: Record<string, string[]> = {
  "valter jr bill": ["valter jr", "bill"],
  "pedro machado ppr": ["pedro machado", "pedro ppr", "ppr"],
  "tiago tigu": ["tiago", "tigu"],
  "gustavo ddd": ["gustavo", "ddd"],
  "ze pedro": ["ze pedro", "jose pedro", "ze pedro 6"],
  "rafael goncalvez": ["rafael goncalves"],
  "gisiel resende": ["gisiel rezende"],
  "maiara": ["maiara", "maiara menezes"],
  "joao victor": ["joao vitor", "joao vitor coelho"],
  "ricardo brasil": ["ricardo virgilio", "brasil"],
  "vinicius di nucci": ["vinicius di nucci"],
  "william correa": ["willian correa"],
  "willian kie": ["william kie"],
  "allan bradley": ["allan bradley vieira"],
  "felipe dias": ["felipe pifano dias"],
  "julio calliero": ["julio cesar calliero"],
  "jean querido": ["jean querido nicolini"],
  "marcos cesar mauad": ["marcos mauad"],
  "eduardo marcondes": ["eduardo de mattos marcondes"],
  "thiago oliveira": ["thiago aguiar de oliveira"],
  "fabio da motta": ["fabio da motta machado", "fabio motta"],
  "aquila cardoso": ["aquila cardoso", "aquila"],
  "du saraiva": ["du saraiva", "eduardo du saraiva"],
  "renato 6 zero": ["renato 6zero", "renato 6 zero", "renato seis zero"],
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
