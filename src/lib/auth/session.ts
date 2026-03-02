import { cookies } from "next/headers"
import type { NextResponse } from "next/server"

import { verifySession } from "@/lib/auth/jwt"
import { db } from "@/lib/db"
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/auth/types"

type SessionTokenCacheEntry = {
  sessionToken: string
  expiresAt: number
}

type SessionCacheGlobal = typeof globalThis & {
  __sessionTokenCache?: Map<number, SessionTokenCacheEntry>
}

const sessionCacheGlobal = globalThis as SessionCacheGlobal
const sessionTokenCache =
  sessionCacheGlobal.__sessionTokenCache ??
  new Map<number, SessionTokenCacheEntry>()

if (!sessionCacheGlobal.__sessionTokenCache) {
  sessionCacheGlobal.__sessionTokenCache = sessionTokenCache
}

const SESSION_TOKEN_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.SESSION_TOKEN_CACHE_TTL_MS ?? "5000") || 0
)

const getCachedToken = (userId: number) => {
  if (SESSION_TOKEN_CACHE_TTL_MS <= 0) return null
  const cached = sessionTokenCache.get(userId)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    sessionTokenCache.delete(userId)
    return null
  }
  return cached.sessionToken
}

const setCachedToken = (userId: number, sessionToken: string) => {
  if (SESSION_TOKEN_CACHE_TTL_MS <= 0) return
  sessionTokenCache.set(userId, {
    sessionToken,
    expiresAt: Date.now() + SESSION_TOKEN_CACHE_TTL_MS,
  })
}

export function primeSessionTokenCache(userId: number, sessionToken: string) {
  if (!Number.isFinite(userId) || userId <= 0 || !sessionToken) return
  setCachedToken(userId, sessionToken)
}

export function clearSessionTokenCache(userId: number) {
  if (!Number.isFinite(userId) || userId <= 0) return
  sessionTokenCache.delete(userId)
}

export async function getSessionFromCookies() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (!token) {
    return null
  }

  const session = await verifySession(token)
  if (!session?.sessionToken) {
    return null
  }

  const userId = Number(session.userId)
  if (!Number.isFinite(userId)) {
    return null
  }

  const expectedSessionToken = session.sessionToken
  const cachedToken = getCachedToken(userId)
  if (cachedToken) {
    return cachedToken === expectedSessionToken ? session : null
  }

  const user = await db.users.findUnique({
    where: { id: userId },
    select: { sessionToken: true },
  })

  if (!user?.sessionToken || user.sessionToken !== expectedSessionToken) {
    clearSessionTokenCache(userId)
    return null
  }

  setCachedToken(userId, user.sessionToken)
  return session
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
}
