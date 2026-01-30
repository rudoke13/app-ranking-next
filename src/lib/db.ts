import { PrismaClient } from "@prisma/client"

type PrismaGlobal = typeof globalThis & {
  prisma?: PrismaClient
}

const globalForPrisma = globalThis as PrismaGlobal
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

const createClient = () =>
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })

const missingDbProxy = new Proxy(
  {},
  {
    get() {
      throw new Error("DATABASE_URL is not set")
    },
  },
) as PrismaClient

export const db = hasDatabaseUrl
  ? globalForPrisma.prisma ?? createClient()
  : missingDbProxy

if (process.env.NODE_ENV !== "production" && hasDatabaseUrl) {
  globalForPrisma.prisma = db
}
