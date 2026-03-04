import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { z } from "zod"
import bcrypt from "bcryptjs"

import { signSession } from "@/lib/auth/jwt"
import { primeSessionTokenCache, setSessionCookie } from "@/lib/auth/session"
import type { Role, SessionPayload } from "@/lib/auth/types"
import { db } from "@/lib/db"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(request: Request) {
  const startedAt = performance.now()
  const body = await request.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)

  const buildTimingHeader = (timings: Array<[string, number]>) =>
    timings.map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`).join(", ")

  if (!parsed.success) {
    const response = NextResponse.json(
      { ok: false, message: "Dados inválidos" },
      { status: 400 }
    )
    response.headers.set(
      "Server-Timing",
      buildTimingHeader([["total", performance.now() - startedAt]])
    )
    return response
  }

  const email = parsed.data.email.trim().toLowerCase()
  const findUserStartedAt = performance.now()
  const user = await db.users.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      password_hash: true,
      role: true,
      nickname: true,
      first_name: true,
      last_name: true,
      avatarUrl: true,
    },
  })
  const findUserMs = performance.now() - findUserStartedAt

  if (!user) {
    const response = NextResponse.json(
      { ok: false, message: "Credenciais inválidas" },
      { status: 401 }
    )
    response.headers.set(
      "Server-Timing",
      buildTimingHeader([
        ["db_user", findUserMs],
        ["total", performance.now() - startedAt],
      ])
    )
    return response
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
    const response = NextResponse.json(
      { ok: false, message: "Credenciais inválidas" },
      { status: 401 }
    )
    response.headers.set(
      "Server-Timing",
      buildTimingHeader([
        ["db_user", findUserMs],
        ["total", performance.now() - startedAt],
      ])
    )
    return response
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
  const updateTokenStartedAt = performance.now()
  await db.users.update({
    where: { id: user.id },
    data: { sessionToken },
  })
  const updateTokenMs = performance.now() - updateTokenStartedAt
  primeSessionTokenCache(user.id, sessionToken)

  const session: SessionPayload = {
    userId: String(user.id),
    name: displayName,
    email: user.email,
    role,
    sessionToken,
    avatarUrl: user.avatarUrl ?? null,
  }

  const token = await signSession(session)
  const response = NextResponse.json({
    ok: true,
    user: { name: session.name, role: session.role },
  })

  setSessionCookie(response, token)
  response.headers.set(
    "Server-Timing",
    buildTimingHeader([
      ["db_user", findUserMs],
      ["db_update", updateTokenMs],
      ["total", performance.now() - startedAt],
    ])
  )

  return response
}
