import { NextResponse, type NextRequest } from "next/server"

import { verifySession } from "@/lib/auth/jwt"
import { SESSION_COOKIE_NAME } from "@/lib/auth/types"

const publicRoutes = ["/login", "/forgot-password", "/reset-password"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const session = await verifySession(token)

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const cookie = request.headers.get("cookie") ?? ""
  const internalBase =
    process.env.INTERNAL_APP_URL?.trim() || request.nextUrl.origin
  const validation = await fetch(new URL("/api/auth/validate", internalBase), {
    headers: { cookie },
  })

  if (!validation.ok) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/ranking/:path*",
    "/desafios/:path*",
    "/perfil/:path*",
    "/admin/:path*",
  ],
}
