import { SignJWT, jwtVerify } from "jose"

import type { SessionPayload } from "@/lib/auth/types"
import { SESSION_MAX_AGE } from "@/lib/auth/types"

const JWT_ALG = "HS256"
const JWT_VERIFY_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.JWT_VERIFY_CACHE_TTL_MS ?? "10000") || 0
)
const MAX_JWT_VERIFY_CACHE_ENTRIES = 500

type JwtVerifyCacheEntry = {
  expiresAt: number
  payload: SessionPayload | null
}

type JwtCacheGlobal = typeof globalThis & {
  __jwtVerifyCache?: Map<string, JwtVerifyCacheEntry>
}

const jwtCacheGlobal = globalThis as JwtCacheGlobal
const jwtVerifyCache =
  jwtCacheGlobal.__jwtVerifyCache ?? new Map<string, JwtVerifyCacheEntry>()

if (!jwtCacheGlobal.__jwtVerifyCache) {
  jwtCacheGlobal.__jwtVerifyCache = jwtVerifyCache
}

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
  if (JWT_VERIFY_CACHE_TTL_MS > 0) {
    const cached = jwtVerifyCache.get(token)
    if (cached) {
      if (cached.expiresAt > Date.now()) {
        return cached.payload
      }
      jwtVerifyCache.delete(token)
    }
  }

  const cachePayload = (payload: SessionPayload | null) => {
    if (JWT_VERIFY_CACHE_TTL_MS <= 0) return

    if (jwtVerifyCache.size >= MAX_JWT_VERIFY_CACHE_ENTRIES) {
      const oldestKey = jwtVerifyCache.keys().next().value
      if (oldestKey) jwtVerifyCache.delete(oldestKey)
    }

    jwtVerifyCache.set(token, {
      payload,
      expiresAt: Date.now() + JWT_VERIFY_CACHE_TTL_MS,
    })
  }

  try {
    const { payload } = await jwtVerify<SessionPayload>(token, getJwtSecret())
    cachePayload(payload)
    return payload
  } catch {
    cachePayload(null)
    return null
  }
}
