import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"

const bodySchema = z.object({
  reason: z.string().max(255).optional(),
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

  const body = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos." },
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

  return NextResponse.json(
    {
      ok: false,
      message:
        "Recusa desativada. O desafiante pode cancelar em ate 5 minutos.",
    },
    { status: 422 }
  )
}
