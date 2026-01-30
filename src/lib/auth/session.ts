import { cookies } from "next/headers"
import type { NextResponse } from "next/server"

import { verifySession } from "@/lib/auth/jwt"
import { db } from "@/lib/db"
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/auth/types"

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

  const user = await db.users.findUnique({
    where: { id: userId },
    select: { sessionToken: true },
  })

  if (!user?.sessionToken || user.sessionToken !== session.sessionToken) {
    return null
  }

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
