import { PrismaClient } from "@prisma/client"

type PrismaGlobal = typeof globalThis & {
  prisma?: PrismaClient
}

const globalForPrisma = globalThis as PrismaGlobal
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set")
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db
}
