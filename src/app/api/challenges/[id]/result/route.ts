import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { hasAdminAccess } from "@/lib/domain/permissions"
import { ensureBaselineSnapshot, monthStartFrom } from "@/lib/domain/ranking"
import { normalizeAppDateTimeInput, parseAppDateTime } from "@/lib/timezone"

const penaltySchema = z.object({
  target: z.enum(["challenger", "challenged", "both"]),
  positions: z.number().int().min(1),
})

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
  penalties: z.array(penaltySchema).optional(),
})

export async function POST(
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

  const payload = await request.json().catch(() => null)
  const parsed = resultSchema.safeParse(payload)
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

  const createdAt = challenge.created_at?.getTime() ?? 0
  const cancelWindowOpen =
    createdAt > 0 && Date.now() - createdAt <= 5 * 60 * 1000

  if (challenge.status === "completed") {
    return NextResponse.json(
      { ok: false, message: "Resultado ja registrado para este desafio." },
      { status: 422 }
    )
  }

  const userId = Number(session.userId)
  const isParticipant =
    challenge.challenger_id === userId ||
    challenge.challenged_id === userId
  const isAdmin = hasAdminAccess(session)

  if (!isParticipant && !isAdmin) {
    return NextResponse.json(
      { ok: false, message: "Voce nao pode registrar este resultado." },
      { status: 403 }
    )
  }

  if (!isAdmin) {
    const isValid =
      challenge.status === "accepted" ||
      (challenge.status === "scheduled" && !cancelWindowOpen)
    if (!isValid) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Aguarde 5 minutos apos o desafio para registrar o resultado.",
        },
        { status: 422 }
      )
    }
  }

  if (isAdmin && !["accepted", "scheduled"].includes(challenge.status)) {
    return NextResponse.json(
      { ok: false, message: "O desafio nao pode receber resultado." },
      { status: 422 }
    )
  }

  const data = parsed.data
  const doubleWalkover =
    data.double_walkover ||
    (data.challenger_walkover && data.challenged_walkover) ||
    false

  if (!doubleWalkover && !data.winner) {
    return NextResponse.json(
      { ok: false, message: "Resultado invalido: vencedor obrigatorio." },
      { status: 422 }
    )
  }

  const playedAt =
    parseAppDateTime(normalizeAppDateTimeInput(data.played_at)) ?? new Date()
  const monthStart = monthStartFrom(playedAt)

  await ensureBaselineSnapshot(challenge.ranking_id, monthStart)

  const updatePayload = {
    winner: doubleWalkover ? null : data.winner ?? null,
    played_at: playedAt,
    result_reported_at: new Date(),
    challenger_games: data.challenger_games ?? null,
    challenged_games: data.challenged_games ?? null,
    challenger_tiebreak: data.challenger_tiebreak ?? null,
    challenged_tiebreak: data.challenged_tiebreak ?? null,
    challenger_walkover: doubleWalkover || data.challenger_walkover ? true : false,
    challenged_walkover: doubleWalkover || data.challenged_walkover ? true : false,
    challenger_retired: data.challenger_retired ? true : false,
    challenged_retired: data.challenged_retired ? true : false,
    status: "completed" as const,
    updated_at: new Date(),
  }

  const penalties = data.penalties ?? []

  await db.$transaction(async (tx) => {
    await tx.challenges.update({
      where: { id: challengeId },
      data: updatePayload,
    })

    await tx.challenge_penalties.deleteMany({
      where: { challenge_id: challengeId },
    })

    if (penalties.length > 0) {
      await tx.challenge_penalties.createMany({
        data: penalties.map((penalty) => ({
          challenge_id: challengeId,
          applies_to: penalty.target,
          positions: penalty.positions,
        })),
      })
    }

    await tx.challenge_events.create({
      data: {
        challenge_id: challengeId,
        event_type: "completed",
        payload: {
          winner: updatePayload.winner,
          played_at: playedAt.toISOString(),
          penalties,
        },
        created_by: userId,
      },
    })
  })

  return NextResponse.json({ ok: true, data: { status: "completed" } })
}
