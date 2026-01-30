import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"

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

  return NextResponse.json(
    {
      ok: false,
      message:
        "Aceite desativado. O desafio fica valido automaticamente apos 5 minutos.",
    },
    { status: 422 }
  )
}
