import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"

const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Sao_Paulo"
let appMonthFormatter: Intl.DateTimeFormat | null = null
try {
  appMonthFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  })
} catch {
  appMonthFormatter = null
}
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
} as const
const PRIVATE_SHORT_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
  Vary: "Cookie",
} as const

const jsonResponse = (body: unknown, init?: { status?: number }) =>
  NextResponse.json(body, {
    status: init?.status,
    headers:
      init?.status && init.status >= 400
        ? NO_STORE_HEADERS
        : PRIVATE_SHORT_CACHE_HEADERS,
  })

const monthValueFromDateOnly = (value: Date) => {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

const monthValueInTz = (value: Date) => {
  if (appMonthFormatter) {
    const parts = appMonthFormatter.formatToParts(value)
    const year = parts.find((part) => part.type === "year")?.value
    const month = parts.find((part) => part.type === "month")?.value
    if (year && month) {
      return `${year}-${month}`
    }
  }

  return monthValueFromDateOnly(value)
}

type MonthsPayload = {
  months: string[]
  currentMonth: string | null
}

type MonthsCacheEntry = {
  cachedAt: number
  data: MonthsPayload
}

const MONTHS_CACHE_TTL_MS = 30_000
let monthsCache: MonthsCacheEntry | null = null
let monthsInFlight: Promise<MonthsPayload> | null = null

const readMonthsCache = () => {
  if (!monthsCache) return null
  if (Date.now() - monthsCache.cachedAt > MONTHS_CACHE_TTL_MS) {
    monthsCache = null
    return null
  }
  return monthsCache.data
}

export async function GET(request: Request) {
  const session = await getSessionFromCookies()
  if (!session) {
    return jsonResponse(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const searchParams = new URL(request.url).searchParams
  const freshParam = (searchParams.get("fresh") ?? "").toLowerCase()
  const forceFresh =
    freshParam === "1" || freshParam === "true" || freshParam === "yes"

  if (!forceFresh) {
    const cached = readMonthsCache()
    if (cached) {
      return jsonResponse({ ok: true, data: cached })
    }

    if (monthsInFlight) {
      const data = await monthsInFlight
      return jsonResponse({ ok: true, data })
    }
  }

  const loadMonths = async (): Promise<MonthsPayload> => {
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

    return { months, currentMonth }
  }

  const inFlight = loadMonths()
  if (!forceFresh) {
    monthsInFlight = inFlight
  }
  const payload = await inFlight.finally(() => {
    if (monthsInFlight === inFlight) {
      monthsInFlight = null
    }
  })

  monthsCache = {
    cachedAt: Date.now(),
    data: payload,
  }

  return jsonResponse({ ok: true, data: payload })
}
