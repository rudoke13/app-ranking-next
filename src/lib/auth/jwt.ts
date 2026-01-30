import { SignJWT, jwtVerify } from "jose"

import type { SessionPayload } from "@/lib/auth/types"
import { SESSION_MAX_AGE } from "@/lib/auth/types"

const JWT_ALG = "HS256"

function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("JWT_SECRET is not set")
  }
  return new TextEncoder().encode(secret)
}

export async function signSession(payload: SessionPayload) {
  const issuedAt = Math.floor(Date.now() / 1000)

  return new SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_MAX_AGE)
    .sign(getJwtSecret())
}

export async function verifySession(token: string) {
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, getJwtSecret())
    return payload
  } catch {
    return null
  }
}
