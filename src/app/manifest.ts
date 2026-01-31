import type { MetadataRoute } from "next"

import { getAdminLogoUrl } from "@/lib/branding"

const inferIconType = (url: string) => {
  const clean = url.split("?")[0]
  const ext = clean.split(".").pop()?.toLowerCase()
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "webp") return "image/webp"
  if (ext === "png") return "image/png"
  return "image/png"
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Ranking Tênis TCC"
  const logoUrl = await getAdminLogoUrl()
  const icons = logoUrl
    ? [
        {
          src: logoUrl,
          sizes: "192x192",
          type: inferIconType(logoUrl),
        },
        {
          src: logoUrl,
          sizes: "512x512",
          type: inferIconType(logoUrl),
        },
      ]
    : [
        {
          src: "/favicon.ico",
          sizes: "32x32",
          type: "image/x-icon",
        },
      ]

  return {
    name: appName,
    short_name: appName,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b1218",
    theme_color: "#0b5a78",
    icons,
  }
}
