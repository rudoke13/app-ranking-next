import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { avatarUpdateData } from "@/lib/user/avatar-field"

const bodySchema = z.object({
  publicUrl: z.string().url(),
})

export async function POST(request: Request) {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(payload)

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "URL invalida." },
      { status: 400 }
    )
  }

  const baseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/, "")
  if (baseUrl && !parsed.data.publicUrl.startsWith(baseUrl)) {
    return NextResponse.json(
      { ok: false, message: "URL nao permitida." },
      { status: 400 }
    )
  }

  const userId = Number(session.userId)
  if (!Number.isFinite(userId)) {
    return NextResponse.json(
      { ok: false, message: "Usuario invalido." },
      { status: 400 }
    )
  }

  await db.users.update({
    where: { id: userId },
    data: avatarUpdateData(parsed.data.publicUrl),
  })

  return NextResponse.json({ ok: true })
}
