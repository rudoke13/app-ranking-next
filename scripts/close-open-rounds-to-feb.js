/* eslint-disable @typescript-eslint/no-require-imports */
require("dotenv").config({ path: ".env.local" })
const { PrismaClient } = require("@prisma/client")

const TARGET_MONTH = process.argv[2] || "2026-02"
const RANKING_SLUGS = [
  "ranking-masculino",
  "ranking-feminino",
  "ranking-master-45",
]

const toMonthKey = (value) => {
  const [yearRaw, monthRaw] = value.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null
  }
  return new Date(Date.UTC(year, month - 1, 1))
}

const monthStartLocal = (value) => {
  const [yearRaw, monthRaw] = value.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null
  }
  return new Date(year, month - 1, 1, 0, 0, 0, 0)
}

const setTime = (date, hour, minute = 0) => {
  const value = new Date(date)
  value.setHours(hour, minute, 0, 0)
  return value
}

const businessDay = (monthStart, index) => {
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

const buildDefaults = (monthStart) => {
  const roundOpen = setTime(monthStart, 7)
  const roundClose = new Date(monthStart)
  roundClose.setMonth(roundClose.getMonth() + 1)
  roundClose.setDate(0)
  roundClose.setHours(23, 59, 0, 0)

  const blueDay = businessDay(monthStart, 1)
  const blueOpen = setTime(blueDay, 7)
  const blueClose = setTime(blueDay, 23, 59)

  const openDay = businessDay(monthStart, 2)
  const openStart = setTime(openDay, 7)
  const openEnd = setTime(openDay, 23, 59)

  return { roundOpen, roundClose, blueOpen, blueClose, openStart, openEnd }
}

const run = async () => {
  const monthKey = toMonthKey(TARGET_MONTH)
  const monthStart = monthStartLocal(TARGET_MONTH)
  if (!monthKey || !monthStart) {
    throw new Error("Mes alvo invalido.")
  }

  const db = new PrismaClient()

  try {
    const rankings = await db.rankings.findMany({
      where: { slug: { in: RANKING_SLUGS } },
      select: { id: true, slug: true, name: true },
    })

    if (!rankings.length) {
      throw new Error("Rankings nao encontrados.")
    }

    const now = new Date()
    const defaults = buildDefaults(monthStart)

    for (const ranking of rankings) {
      const closed = await db.rounds.updateMany({
        where: {
          ranking_id: ranking.id,
          status: "open",
          reference_month: { not: monthKey },
        },
        data: { status: "closed", closed_at: now, updated_by: null },
      })

      const existing = await db.rounds.findFirst({
        where: { ranking_id: ranking.id, reference_month: monthKey },
      })

      if (existing) {
        await db.rounds.update({
          where: { id: existing.id },
          data: { status: "open", closed_at: null },
        })
      } else {
        await db.rounds.create({
          data: {
            title: `Rodada ${monthStart.toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
            })}`,
            reference_month: monthKey,
            ranking_id: ranking.id,
            round_opens_at: defaults.roundOpen,
            blue_point_opens_at: defaults.blueOpen,
            blue_point_closes_at: defaults.blueClose,
            open_challenges_at: defaults.openStart,
            open_challenges_end_at: defaults.openEnd,
            matches_deadline: defaults.roundClose,
            status: "open",
            updated_by: null,
          },
        })
      }

      console.log(
        `[${ranking.slug}] fechados: ${closed.count} | aberto: ${TARGET_MONTH}`
      )
    }
  } finally {
    await db.$disconnect()
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
