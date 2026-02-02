import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { z } from "zod"
import bcrypt from "bcryptjs"

import { signSession } from "@/lib/auth/jwt"
import { setSessionCookie } from "@/lib/auth/session"
import type { Role, SessionPayload } from "@/lib/auth/types"
import { db } from "@/lib/db"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados inválidos" },
      { status: 400 }
    )
  }

  const email = parsed.data.email.trim().toLowerCase()
  const user = await db.users.findUnique({ where: { email } })

  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Credenciais inválidas" },
      { status: 401 }
    )
  }

  const storedHash = user.password_hash
  const isBcryptHash =
    storedHash.startsWith("$2a$") ||
    storedHash.startsWith("$2b$") ||
    storedHash.startsWith("$2y$")

  const normalizedHash = storedHash.startsWith("$2y$")
    ? `$2b$${storedHash.slice(4)}`
    : storedHash

  const passwordMatches = isBcryptHash
    ? await bcrypt.compare(parsed.data.password, normalizedHash)
    : parsed.data.password === storedHash

  if (!passwordMatches) {
    return NextResponse.json(
      { ok: false, message: "Credenciais inválidas" },
      { status: 401 }
    )
  }

  const role: Role =
    user.role === "admin" || user.role === "collaborator"
      ? user.role
      : user.role === "member"
      ? "member"
      : "player"
  const displayName = user.nickname?.trim()
    ? user.nickname
    : `${user.first_name} ${user.last_name}`.trim()

  const sessionToken = randomBytes(32).toString("hex")
  await db.users.update({
    where: { id: user.id },
    data: { sessionToken },
  })

  const session: SessionPayload = {
    userId: String(user.id),
    name: displayName,
    email: user.email,
    role,
    sessionToken,
  }

  const token = await signSession(session)
  const response = NextResponse.json({
    ok: true,
    user: { name: session.name, role: session.role },
  })

  setSessionCookie(response, token)

  return response
}
