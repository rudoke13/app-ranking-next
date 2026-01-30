import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"

const monthValueUtc = (value: Date) => {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
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
      take: 200,
    }),
    db.rounds.findFirst({
      where: { status: "open" },
      select: { reference_month: true },
      orderBy: { reference_month: "desc" },
    }),
  ])

  const monthSet = new Set<string>()

  rounds.forEach((round) => {
    monthSet.add(monthValueUtc(round.reference_month))
  })

  challenges.forEach((challenge) => {
    const value =
      challenge.played_at ?? challenge.scheduled_for ?? challenge.created_at
    if (value) {
      monthSet.add(monthValueUtc(value))
    }
  })

  const currentMonth = openRound?.reference_month
    ? monthValueUtc(openRound.reference_month)
    : monthValueUtc(new Date())

  monthSet.add(currentMonth)

  const months = Array.from(monthSet)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 24)

  return NextResponse.json({ ok: true, data: { months, currentMonth } })
}
