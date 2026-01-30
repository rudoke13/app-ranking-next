import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { monthKeyFromValue, monthStartLocalFromValue } from "@/lib/date"
import { db } from "@/lib/db"
import { hasAdminAccess } from "@/lib/domain/permissions"

const createSchema = z.object({
  title: z.string().min(3).max(150),
  reference_month: z.string().regex(/^\d{4}-\d{2}$/),
  ranking_id: z.number().int().positive().optional().nullable(),
})

const monthLabel = (value: Date) =>
  value.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })

export async function GET() {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  if (!hasAdminAccess(session)) {
    return NextResponse.json(
      { ok: false, message: "Acesso restrito." },
      { status: 403 }
    )
  }

  const rounds = await db.rounds.findMany({
    include: { rankings: true },
    orderBy: [{ reference_month: "desc" }, { id: "desc" }],
  })

  return NextResponse.json({
    ok: true,
    data: rounds.map((round) => ({
      id: round.id,
      title: round.title,
      status: round.status,
      referenceMonth: round.reference_month.toISOString().slice(0, 7),
      referenceLabel: monthLabel(round.reference_month),
      ranking: round.rankings
        ? { id: round.rankings.id, name: round.rankings.name }
        : null,
      openChallengesAt: round.open_challenges_at.toISOString(),
      matchesDeadline: round.matches_deadline.toISOString(),
    })),
  })
}

export async function POST(request: Request) {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  if (!hasAdminAccess(session)) {
    return NextResponse.json(
      { ok: false, message: "Acesso restrito." },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const monthKey = monthKeyFromValue(parsed.data.reference_month)
  const monthStart = monthStartLocalFromValue(parsed.data.reference_month)
  if (Number.isNaN(monthKey.getTime()) || Number.isNaN(monthStart.getTime())) {
    return NextResponse.json(
      { ok: false, message: "Mes de referencia invalido." },
      { status: 400 }
    )
  }

  const monthEnd = new Date(monthStart)
  monthEnd.setMonth(monthEnd.getMonth() + 1)
  monthEnd.setDate(0)
  monthEnd.setHours(23, 59, 0, 0)

  const blueStart = new Date(monthStart)
  blueStart.setHours(7, 0, 0, 0)

  const blueEnd = new Date(blueStart)
  blueEnd.setHours(23, 59, 0, 0)

  const openStart = new Date(monthStart)
  openStart.setHours(9, 0, 0, 0)

  const openEnd = new Date(monthEnd)

  const created = await db.rounds.create({
    data: {
      title: parsed.data.title.trim(),
      reference_month: monthKey,
      ranking_id: parsed.data.ranking_id ?? null,
      round_opens_at: monthStart,
      blue_point_opens_at: blueStart,
      blue_point_closes_at: blueEnd,
      open_challenges_at: openStart,
      open_challenges_end_at: openEnd,
      matches_deadline: monthEnd,
      status: "open",
      updated_by: Number(session.userId),
    },
  })

  return NextResponse.json({ ok: true, data: { id: created.id } }, { status: 201 })
}
