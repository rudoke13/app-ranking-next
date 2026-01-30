import { NextResponse } from "next/server"
import { z } from "zod"
import { createHash } from "crypto"
import bcrypt from "bcryptjs"

import { db } from "@/lib/db"

const bodySchema = z.object({
  token: z.string().min(10),
  password: z.string().min(6),
})

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex")

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(payload)

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos." },
      { status: 400 }
    )
  }

  const hashed = hashToken(parsed.data.token)
  const now = new Date()

  const user = await db.users.findFirst({
    where: {
      password_reset_token: hashed,
      password_reset_expires_at: { gt: now },
    },
  })

  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Token invalido ou expirado." },
      { status: 422 }
    )
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10)

  await db.users.update({
    where: { id: user.id },
    data: {
      password_hash: passwordHash,
      password_reset_token: null,
      password_reset_expires_at: null,
      must_reset_password: false,
      sessionToken: null,
    },
  })

  return NextResponse.json({ ok: true, data: { message: "Senha atualizada." } })
}
