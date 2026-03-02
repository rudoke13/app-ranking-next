import { NextResponse } from "next/server"

import {
  clearSessionCookie,
  clearSessionTokenCache,
  getSessionFromCookies,
} from "@/lib/auth/session"
import { db } from "@/lib/db"

export async function POST() {
  const session = await getSessionFromCookies()
  const userId = session?.userId ? Number(session.userId) : null
  if (userId && Number.isFinite(userId)) {
    await db.users.update({
      where: { id: userId },
      data: { sessionToken: null },
    })
    clearSessionTokenCache(userId)
  }
  const response = NextResponse.json({ ok: true })
  clearSessionCookie(response)
  return response
}
