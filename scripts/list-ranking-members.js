/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

const slug = process.argv[2] || "ranking-masculino"

const normalizeName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()"'`.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()

async function main() {
  const ranking = await prisma.rankings.findFirst({
    where: { slug },
    select: { id: true, name: true, slug: true },
  })

  if (!ranking) {
    throw new Error(`Ranking slug "${slug}" nao encontrado.`)
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

  members.forEach((member) => {
    const full = `${member.users.first_name || ""} ${member.users.last_name || ""}`.trim()
    const nickname = member.users.nickname ? ` (${member.users.nickname})` : ""
    const line = `${String(member.user_id).padStart(4, " ")} | ${full}${nickname}`.trim()
    const normalized = normalizeName(`${full} ${member.users.nickname || ""}`)
    console.log(`${line} | ${normalized}`)
  })
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
