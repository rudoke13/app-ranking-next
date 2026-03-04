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
  __sessionTokenInFlight?: Map<number, Promise<string | null>>
}

const sessionCacheGlobal = globalThis as SessionCacheGlobal
const sessionTokenCache =
  sessionCacheGlobal.__sessionTokenCache ??
  new Map<number, SessionTokenCacheEntry>()
const sessionTokenInFlight =
  sessionCacheGlobal.__sessionTokenInFlight ??
  new Map<number, Promise<string | null>>()

if (!sessionCacheGlobal.__sessionTokenCache) {
  sessionCacheGlobal.__sessionTokenCache = sessionTokenCache
}

if (!sessionCacheGlobal.__sessionTokenInFlight) {
  sessionCacheGlobal.__sessionTokenInFlight = sessionTokenInFlight
}

const SESSION_TOKEN_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.SESSION_TOKEN_CACHE_TTL_MS ?? "300000") || 0
)
const MAX_SESSION_TOKEN_CACHE_ENTRIES = 500

const pruneSessionTokenCache = () => {
  while (sessionTokenCache.size > MAX_SESSION_TOKEN_CACHE_ENTRIES) {
    const oldestKey = sessionTokenCache.keys().next().value
    if (oldestKey === undefined) break
    sessionTokenCache.delete(oldestKey)
  }
}

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
  pruneSessionTokenCache()
}

const readSessionTokenFromDb = async (userId: number) => {
  const pending = sessionTokenInFlight.get(userId)
  if (pending) {
    return pending
  }

  const fetchPromise = db.users
    .findUnique({
      where: { id: userId },
      select: { sessionToken: true },
    })
    .then((user) => user?.sessionToken ?? null)
    .finally(() => {
      if (sessionTokenInFlight.get(userId) === fetchPromise) {
        sessionTokenInFlight.delete(userId)
      }
    })

  sessionTokenInFlight.set(userId, fetchPromise)
  return fetchPromise
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
    if (cachedToken === expectedSessionToken) {
      return session
    }
    // Cache pode ficar stale entre instancias/deploys; valida no banco antes de negar.
    clearSessionTokenCache(userId)
  }

  const dbSessionToken = await readSessionTokenFromDb(userId)

  if (!dbSessionToken || dbSessionToken !== expectedSessionToken) {
    clearSessionTokenCache(userId)
    return null
  }

  setCachedToken(userId, dbSessionToken)
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
