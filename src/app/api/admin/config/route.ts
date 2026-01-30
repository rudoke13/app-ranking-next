import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { monthKeyFromValue, monthStartLocalFromValue } from "@/lib/date"
import { db } from "@/lib/db"
import { hasAdminAccess } from "@/lib/domain/permissions"

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  rankingId: z.string().optional(),
})

const updateSchema = z.object({
  reference_month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  ranking_id: z.number().int().positive().optional().nullable(),
  round_opens_at: z.string().min(1),
  round_closes_at: z.string().min(1),
  blue_point_opens_at: z.string().min(1),
  blue_point_closes_at: z.string().min(1),
  open_challenges_at: z.string().min(1),
  open_challenges_end_at: z.string().min(1),
})

const toMonthKey = (value: string) => monthKeyFromValue(value)
const toMonthStartLocal = (value: string) => monthStartLocalFromValue(value)

const getBusinessDay = (monthStart: Date, index: number) => {
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

const toDateTime = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

const toIso = (value: Date | null) => (value ? value.toISOString() : null)

const toDateInput = (value: Date) => {
  const pad = (num: number) => String(num).padStart(2, "0")
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`
}

const toMonthValue = (value: Date) => {
  const pad = (num: number) => String(num).padStart(2, "0")
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}`
}

const buildDefaults = (monthStart: Date) => {
  const roundOpen = new Date(monthStart)
  roundOpen.setHours(7, 0, 0, 0)

  const roundClose = new Date(monthStart)
  roundClose.setMonth(roundClose.getMonth() + 1)
  roundClose.setDate(0)
  roundClose.setHours(23, 59, 0, 0)

  const blueDay = getBusinessDay(monthStart, 1)
  const blueOpen = new Date(blueDay)
  blueOpen.setHours(7, 0, 0, 0)

  const blueClose = new Date(blueDay)
  blueClose.setHours(23, 59, 0, 0)

  const freeDay = getBusinessDay(monthStart, 2)
  const openStart = new Date(freeDay)
  openStart.setHours(7, 0, 0, 0)

  const openEnd = new Date(freeDay)
  openEnd.setHours(23, 59, 0, 0)

  return {
    roundOpen,
    roundClose,
    blueOpen,
    blueClose,
    openStart,
    openEnd,
  }
}

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse({
    month: searchParams.get("month") || undefined,
    rankingId: searchParams.get("rankingId") || undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Filtros invalidos." },
      { status: 400 }
    )
  }

  const rankingId = parsed.data.rankingId
    ? Number(parsed.data.rankingId)
    : null

  const fallbackMonthValue =
    parsed.data.month ?? new Date().toISOString().slice(0, 7)
  const openRound = await db.rounds.findFirst({
    where: { ranking_id: rankingId, status: "open" },
    orderBy: { reference_month: "desc" },
  })
  const monthValue = openRound
    ? openRound.reference_month.toISOString().slice(0, 7)
    : fallbackMonthValue
  const monthKey = toMonthKey(monthValue)
  const monthStart = toMonthStartLocal(monthValue)
  if (Number.isNaN(monthKey.getTime()) || Number.isNaN(monthStart.getTime())) {
    return NextResponse.json(
      { ok: false, message: "Mes invalido." },
      { status: 400 }
    )
  }

  const where: { reference_month: Date; ranking_id?: number | null } = {
    reference_month: monthKey,
  }

  if (rankingId) {
    where.ranking_id = rankingId
  } else {
    where.ranking_id = null
  }

  const existing =
    openRound && openRound.reference_month.getTime() === monthKey.getTime()
      ? openRound
      : await db.rounds.findFirst({ where })
  const defaults = buildDefaults(monthStart)

  return NextResponse.json({
    ok: true,
    data: {
      reference_month: monthValue,
      ranking_id: rankingId,
      round_opens_at: toIso(existing?.round_opens_at ?? defaults.roundOpen),
      round_closes_at: toIso(existing?.matches_deadline ?? defaults.roundClose),
      blue_point_opens_at: toIso(existing?.blue_point_opens_at ?? defaults.blueOpen),
      blue_point_closes_at: toIso(
        existing?.blue_point_closes_at ?? defaults.blueClose
      ),
      open_challenges_at: toIso(existing?.open_challenges_at ?? defaults.openStart),
      open_challenges_end_at: toIso(
        existing?.open_challenges_end_at ?? defaults.openEnd
      ),
      title: existing?.title ?? null,
      id: existing?.id ?? null,
    },
  })
}

export async function PATCH(request: Request) {
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

  const payload = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(payload)

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const roundOpen = toDateTime(parsed.data.round_opens_at)
  const roundClose = toDateTime(parsed.data.round_closes_at)
  const blueOpen = toDateTime(parsed.data.blue_point_opens_at)
  const blueClose = toDateTime(parsed.data.blue_point_closes_at)
  const openStart = toDateTime(parsed.data.open_challenges_at)
  const openEnd = toDateTime(parsed.data.open_challenges_end_at)

  if (!roundOpen || !roundClose || !blueOpen || !blueClose || !openStart || !openEnd) {
    return NextResponse.json(
      { ok: false, message: "Datas invalidas." },
      { status: 400 }
    )
  }

  const rankingId = parsed.data.ranking_id ?? null

  const openRound = await db.rounds.findFirst({
    where: { ranking_id: rankingId, status: "open" },
    orderBy: { reference_month: "desc" },
  })

  let referenceMonthValue = parsed.data.reference_month ?? ""
  if (openRound) {
    referenceMonthValue = openRound.reference_month.toISOString().slice(0, 7)
  }

  if (!referenceMonthValue) {
    referenceMonthValue = toMonthValue(roundOpen)
  }

  const monthKey = monthKeyFromValue(referenceMonthValue)
  const monthStartLocal = monthStartLocalFromValue(referenceMonthValue)
  if (Number.isNaN(monthKey.getTime()) || Number.isNaN(monthStartLocal.getTime())) {
    return NextResponse.json(
      { ok: false, message: "Mes invalido." },
      { status: 400 }
    )
  }

  if (roundOpen > blueOpen) {
    return NextResponse.json(
      { ok: false, message: "A rodada deve iniciar antes do ponto azul." },
      { status: 422 }
    )
  }

  if (blueClose <= blueOpen) {
    return NextResponse.json(
      { ok: false, message: "Encerramento do ponto azul deve ser posterior." },
      { status: 422 }
    )
  }

  if (openStart <= blueClose) {
    return NextResponse.json(
      { ok: false, message: "Desafios livres devem iniciar apos o ponto azul." },
      { status: 422 }
    )
  }

  if (openEnd <= openStart) {
    return NextResponse.json(
      { ok: false, message: "Encerramento dos desafios livres deve ser posterior." },
      { status: 422 }
    )
  }

  if (roundClose <= roundOpen || roundClose <= openStart) {
    return NextResponse.json(
      { ok: false, message: "Encerramento da rodada deve ser posterior ao inicio." },
      { status: 422 }
    )
  }

  if (openEnd > roundClose) {
    return NextResponse.json(
      { ok: false, message: "Desafios livres devem encerrar antes do fim da rodada." },
      { status: 422 }
    )
  }

  const existing =
    openRound ??
    (await db.rounds.findFirst({
      where: {
        reference_month: monthKey,
        ranking_id: rankingId,
      },
    }))

  const title =
    existing?.title ??
    `Rodada ${monthStartLocal.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    })}`

  const data = {
    title,
    reference_month: monthKey,
    ranking_id: rankingId,
    round_opens_at: roundOpen,
    blue_point_opens_at: blueOpen,
    blue_point_closes_at: blueClose,
    open_challenges_at: openStart,
    open_challenges_end_at: openEnd,
    matches_deadline: roundClose,
    updated_by: Number(session.userId) || null,
  }

  if (existing) {
    await db.rounds.update({ where: { id: existing.id }, data })
  } else {
    await db.rounds.create({ data })
  }

  return NextResponse.json({
    ok: true,
    data: {
      reference_month: toMonthValue(monthStartLocal),
      ranking_id: rankingId,
      round_opens_at: toDateInput(roundOpen),
      round_closes_at: toDateInput(roundClose),
      blue_point_opens_at: toDateInput(blueOpen),
      blue_point_closes_at: toDateInput(blueClose),
      open_challenges_at: toDateInput(openStart),
      open_challenges_end_at: toDateInput(openEnd),
    },
  })
}
