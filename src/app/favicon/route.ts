import { NextResponse } from "next/server"

import { getAdminLogoUrl } from "@/lib/branding"

const inferContentType = (url: string) => {
  const clean = url.split("?")[0]
  const ext = clean.split(".").pop()?.toLowerCase()
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "webp") return "image/webp"
  if (ext === "png") return "image/png"
  if (ext === "svg") return "image/svg+xml"
  return "image/png"
}

export async function GET(request: Request) {
  const logoUrl = await getAdminLogoUrl()

  if (logoUrl) {
    try {
      const response = await fetch(logoUrl, { cache: "no-store" })
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer())
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type":
              response.headers.get("content-type") ?? inferContentType(logoUrl),
            "Cache-Control": "public, max-age=3600",
          },
        })
      }
    } catch {}
  }

  return NextResponse.redirect(new URL("/favicon.ico", request.url))
}
