import { NextResponse } from "next/server"

import { getAdminLogoUrl } from "@/lib/branding"

export async function GET(request: Request) {
  const logoUrl = await getAdminLogoUrl()

  if (logoUrl) {
    return NextResponse.redirect(logoUrl, 307)
  }

  return NextResponse.redirect(new URL("/favicon.ico", request.url))
}
