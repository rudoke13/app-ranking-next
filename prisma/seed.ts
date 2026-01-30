import "dotenv/config"
import bcrypt from "bcryptjs"

import { PrismaClient, users_role } from "@prisma/client"

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set")
}

const prisma = new PrismaClient()

async function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}

async function seedUsers() {
  const adminPassword = await hashPassword("admin123")
  const playerPassword = await hashPassword("player123")

  await prisma.users.upsert({
    where: { email: "admin@tcc.com" },
    update: {
      role: users_role.admin,
      first_name: "Administrador",
      last_name: "TCC",
      password_hash: adminPassword,
    },
    create: {
      role: users_role.admin,
      first_name: "Administrador",
      last_name: "TCC",
      email: "admin@tcc.com",
      password_hash: adminPassword,
      nickname: "Admin",
    },
  })

  await prisma.users.upsert({
    where: { email: "player@tcc.com" },
    update: {
      role: users_role.player,
      first_name: "Rodolfo",
      last_name: "Lelis",
      password_hash: playerPassword,
    },
    create: {
      role: users_role.player,
      first_name: "Rodolfo",
      last_name: "Lelis",
      email: "player@tcc.com",
      password_hash: playerPassword,
      nickname: "Rodo",
    },
  })
}

async function seedRankings() {
  const rankings = [
    {
      name: "Ranking Masculino Geral",
      slug: "ranking-masculino",
      description: "Ranking geral masculino do clube",
    },
    {
      name: "Ranking Feminino Geral",
      slug: "ranking-feminino",
      description: "Ranking geral feminino do clube",
    },
    {
      name: "Ranking Master 45+",
      slug: "ranking-master-45",
      description: "Ranking master para jogadores 45+",
    },
  ]

  for (const ranking of rankings) {
    await prisma.rankings.upsert({
      where: { slug: ranking.slug },
      update: { name: ranking.name, description: ranking.description },
      create: ranking,
    })
  }
}

async function main() {
  await seedUsers()
  await seedRankings()
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
