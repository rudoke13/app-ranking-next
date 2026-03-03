import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"

const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Sao_Paulo"
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
} as const

const jsonNoStore = (body: unknown, init?: { status?: number }) =>
  NextResponse.json(body, {
    status: init?.status,
    headers: NO_STORE_HEADERS,
  })

const monthValueFromDateOnly = (value: Date) => {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

const monthValueInTz = (value: Date) => {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TIMEZONE,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(value)
    const year = parts.find((part) => part.type === "year")?.value
    const month = parts.find((part) => part.type === "month")?.value
    if (year && month) {
      return `${year}-${month}`
    }
  } catch {}

  return monthValueFromDateOnly(value)
}

export async function GET() {
  const session = await getSessionFromCookies()
  if (!session) {
    return jsonNoStore(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const [rounds, challenges, openRound] = await Promise.all([
    db.rounds.findMany({
      distinct: ["reference_month"],
      select: { reference_month: true },
      orderBy: { reference_month: "desc" },
      take: 24,
    }),
    db.$queryRaw<Array<{ month_start: Date }>>`
      SELECT month_start
      FROM (
        SELECT date_trunc('month', scheduled_for)::date AS month_start
        FROM challenges
        WHERE scheduled_for IS NOT NULL
        UNION
        SELECT date_trunc('month', played_at)::date AS month_start
        FROM challenges
        WHERE played_at IS NOT NULL
      ) AS months
      ORDER BY month_start DESC
      LIMIT 24
    `,
    db.rounds.findFirst({
      where: { status: "open" },
      select: { reference_month: true },
      orderBy: { reference_month: "desc" },
    }),
  ])

  const monthSet = new Set<string>()

  rounds.forEach((round) => {
    monthSet.add(monthValueFromDateOnly(round.reference_month))
  })

  challenges.forEach((challenge) => {
    monthSet.add(monthValueInTz(challenge.month_start))
  })

  const currentMonth = openRound?.reference_month
    ? monthValueFromDateOnly(openRound.reference_month)
    : null

  if (currentMonth) {
    monthSet.add(currentMonth)
  }

  const months = Array.from(monthSet)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 24)

  return jsonNoStore({ ok: true, data: { months, currentMonth } })
}
