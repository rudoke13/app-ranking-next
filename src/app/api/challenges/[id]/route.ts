import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { hasAdminAccess } from "@/lib/domain/permissions"
import { ensureBaselineSnapshot, monthStartFrom } from "@/lib/domain/ranking"
import { normalizeAppDateTimeInput, parseAppDateTime } from "@/lib/timezone"

const resultSchema = z.object({
  winner: z.enum(["challenger", "challenged"]).optional(),
  played_at: z.string().optional(),
  challenger_games: z.number().int().min(0).optional().nullable(),
  challenged_games: z.number().int().min(0).optional().nullable(),
  challenger_tiebreak: z.number().int().min(0).optional().nullable(),
  challenged_tiebreak: z.number().int().min(0).optional().nullable(),
  challenger_walkover: z.boolean().optional(),
  challenged_walkover: z.boolean().optional(),
  challenger_retired: z.boolean().optional(),
  challenged_retired: z.boolean().optional(),
  double_walkover: z.boolean().optional(),
})

const updateSchema = z.object({
  scheduled_for: z.string().optional(),
  result: resultSchema.optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const { id } = await params
  const challengeId = Number(id)
  if (!Number.isFinite(challengeId)) {
    return NextResponse.json(
      { ok: false, message: "Desafio invalido." },
      { status: 400 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const challenge = await db.challenges.findUnique({
    where: { id: challengeId },
  })

  if (!challenge) {
    return NextResponse.json(
      { ok: false, message: "Desafio nao encontrado." },
      { status: 404 }
    )
  }

  const isAdmin = hasAdminAccess(session)
  const userId = Number(session.userId)
  const isParticipant =
    challenge.challenger_id === userId || challenge.challenged_id === userId

  if (!isAdmin) {
    if (!isParticipant) {
      return NextResponse.json(
        { ok: false, message: "Acesso restrito." },
        { status: 403 }
      )
    }

    if (parsed.data.result) {
      return NextResponse.json(
        { ok: false, message: "Apenas o admin pode editar o resultado aqui." },
        { status: 403 }
      )
    }

    if (parsed.data.scheduled_for === undefined) {
      return NextResponse.json(
        { ok: false, message: "Nenhuma alteracao enviada." },
        { status: 400 }
      )
    }

    if (!["scheduled", "accepted"].includes(challenge.status)) {
      return NextResponse.json(
        { ok: false, message: "O desafio nao pode ser reagendado." },
        { status: 422 }
      )
    }
  }

  const updates: Record<string, unknown> = {}
  const payloadResult = parsed.data.result

  if (parsed.data.scheduled_for !== undefined) {
    const scheduledFor = parseAppDateTime(
      normalizeAppDateTimeInput(parsed.data.scheduled_for)
    )
    if (!scheduledFor) {
      return NextResponse.json(
        { ok: false, message: "Data do desafio invalida." },
        { status: 400 }
      )
    }
    updates.scheduled_for = scheduledFor
  }

  if (payloadResult) {
    const doubleWalkover =
      payloadResult.double_walkover ||
      (payloadResult.challenger_walkover &&
        payloadResult.challenged_walkover) ||
      false

    if (!doubleWalkover && !payloadResult.winner) {
      return NextResponse.json(
        { ok: false, message: "Resultado invalido: vencedor obrigatorio." },
        { status: 422 }
      )
    }

    const scheduledFallback =
      (updates.scheduled_for as Date | undefined) ??
      challenge.played_at ??
      challenge.scheduled_for

    const playedAt =
      parseAppDateTime(normalizeAppDateTimeInput(payloadResult.played_at)) ??
      scheduledFallback
    if (!playedAt) {
      return NextResponse.json(
        { ok: false, message: "Data do resultado invalida." },
        { status: 400 }
      )
    }

    await ensureBaselineSnapshot(
      challenge.ranking_id,
      monthStartFrom(playedAt)
    )

    updates.winner = doubleWalkover ? null : payloadResult.winner ?? null
    updates.played_at = playedAt
    updates.result_reported_at = new Date()
    updates.challenger_games = payloadResult.challenger_games ?? null
    updates.challenged_games = payloadResult.challenged_games ?? null
    updates.challenger_tiebreak = payloadResult.challenger_tiebreak ?? null
    updates.challenged_tiebreak = payloadResult.challenged_tiebreak ?? null
    updates.challenger_walkover =
      doubleWalkover || payloadResult.challenger_walkover ? true : false
    updates.challenged_walkover =
      doubleWalkover || payloadResult.challenged_walkover ? true : false
    updates.challenger_retired = payloadResult.challenger_retired ? true : false
    updates.challenged_retired = payloadResult.challenged_retired ? true : false
    updates.status = "completed"
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { ok: false, message: "Nenhuma alteracao enviada." },
      { status: 400 }
    )
  }

  await db.$transaction(async (tx) => {
    await tx.challenges.update({
      where: { id: challengeId },
      data: {
        ...updates,
        updated_at: new Date(),
      },
    })

    await tx.challenge_events.create({
      data: {
        challenge_id: challengeId,
        event_type: "updated",
        payload: {
          scheduled_for: updates.scheduled_for
            ? (updates.scheduled_for as Date).toISOString()
            : null,
          result: payloadResult ?? null,
        },
        created_by: userId,
      },
    })
  })

  return NextResponse.json({ ok: true, data: { status: "updated" } })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params
  const challengeId = Number(id)
  if (!Number.isFinite(challengeId)) {
    return NextResponse.json(
      { ok: false, message: "Desafio invalido." },
      { status: 400 }
    )
  }

  const challenge = await db.challenges.findUnique({
    where: { id: challengeId },
    select: { id: true, status: true },
  })

  if (!challenge) {
    return NextResponse.json(
      { ok: false, message: "Desafio nao encontrado." },
      { status: 404 }
    )
  }

  if (challenge.status !== "cancelled") {
    return NextResponse.json(
      { ok: false, message: "Somente desafios cancelados podem ser removidos." },
      { status: 422 }
    )
  }

  await db.challenges.delete({ where: { id: challengeId } })

  return NextResponse.json({ ok: true, data: { status: "deleted" } })
}
