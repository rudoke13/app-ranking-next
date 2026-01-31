import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"

const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Sao_Paulo"

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
    return NextResponse.json(
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
    db.challenges.findMany({
      select: { scheduled_for: true, played_at: true, created_at: true },
      orderBy: { created_at: "desc" },
      take: 1000,
    }),
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
    const value =
      challenge.played_at ?? challenge.scheduled_for ?? challenge.created_at
    if (value) {
      monthSet.add(monthValueInTz(value))
    }
  })

  const currentMonth = openRound?.reference_month
    ? monthValueFromDateOnly(openRound.reference_month)
    : monthValueInTz(new Date())

  monthSet.add(currentMonth)

  const months = Array.from(monthSet)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 24)

  return NextResponse.json({ ok: true, data: { months, currentMonth } })
}
