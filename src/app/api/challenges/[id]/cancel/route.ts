import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { hasAdminAccess } from "@/lib/domain/permissions"

export async function POST(
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
  })

  if (!challenge) {
    return NextResponse.json(
      { ok: false, message: "Desafio nao encontrado." },
      { status: 404 }
    )
  }

  const isAdmin = hasAdminAccess(session)
  const userId = Number(session.userId)

  if (
    challenge.status !== "scheduled" &&
    !(isAdmin && challenge.status === "accepted")
  ) {
    return NextResponse.json(
      { ok: false, message: "Este desafio nao pode mais ser cancelado." },
      { status: 422 }
    )
  }

  if (!isAdmin && challenge.challenger_id !== userId) {
    return NextResponse.json(
      { ok: false, message: "Somente o desafiante pode cancelar este desafio." },
      { status: 403 }
    )
  }

  if (!isAdmin && challenge.created_at) {
    const createdAt = challenge.created_at.getTime()
    const now = Date.now()
    if (now - createdAt > 5 * 60 * 1000) {
      return NextResponse.json(
        { ok: false, message: "Prazo de cancelamento expirado (5 minutos)." },
        { status: 422 }
      )
    }
  }

  await db.$transaction(async (tx) => {
    await tx.challenges.update({
      where: { id: challengeId },
      data: {
        status: "cancelled",
        cancelled_by_admin: isAdmin,
        updated_at: new Date(),
      },
    })

    await tx.challenge_events.create({
      data: {
        challenge_id: challengeId,
        event_type: "cancelled",
        payload: {
          by: userId,
          admin: isAdmin,
        },
        created_by: userId,
      },
    })
  })

  return NextResponse.json({ ok: true, data: { status: "cancelled" } })
}
