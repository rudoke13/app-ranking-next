import { NextResponse } from "next/server"
import { z } from "zod"
import { createHash, randomBytes } from "crypto"

import { db } from "@/lib/db"
import { sendPasswordResetEmail } from "@/lib/email/mailer"

const bodySchema = z.object({
  email: z.string().email(),
})

const TOKEN_TTL_MS = 60 * 60 * 1000

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex")

const resolveRequestAppUrl = (request: Request) => {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()

  if (forwardedHost) {
    const protocol = forwardedProto || "https"
    return `${protocol}://${forwardedHost}`
  }

  const host = request.headers.get("host")?.trim()
  if (host) {
    const isLocalHost =
      host.includes("localhost") ||
      host.startsWith("127.0.0.1") ||
      host.startsWith("0.0.0.0")
    return `${isLocalHost ? "http" : "https"}://${host}`
  }

  try {
    return new URL(request.url).origin
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(payload)

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos." },
      { status: 400 }
    )
  }

  const email = parsed.data.email.trim().toLowerCase()
  const user = await db.users.findUnique({ where: { email } })

  if (user) {
    const token = randomBytes(32).toString("hex")
    const hashed = hashToken(token)
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)

    await db.users.update({
      where: { id: user.id },
      data: {
        password_reset_token: hashed,
        password_reset_expires_at: expiresAt,
        must_reset_password: true,
      },
    })

    await sendPasswordResetEmail({
      to: email,
      token,
      appUrl: resolveRequestAppUrl(request),
    })
  }

  return NextResponse.json({
    ok: true,
    data: { message: "Se o e-mail existir, enviaremos as instrucoes." },
  })
}
