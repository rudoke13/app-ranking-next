import { NextResponse } from "next/server"

import { getSessionFromCookies } from "@/lib/auth/session"

export async function GET() {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Sessao invalida." },
      { status: 401 }
    )
  }

  return NextResponse.json({ ok: true })
}
