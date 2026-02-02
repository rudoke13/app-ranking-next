import type { MetadataRoute } from "next"

import { getAppBranding } from "@/lib/branding"

const inferIconType = (url: string) => {
  const clean = url.split("?")[0]
  const ext = clean.split(".").pop()?.toLowerCase()
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "webp") return "image/webp"
  if (ext === "png") return "image/png"
  return "image/png"
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getAppBranding()
  const appName = branding.appName
  const baseIcon = branding.pwaIconUrl ?? branding.logoUrl
  const icons = baseIcon
    ? [
        {
          src: baseIcon,
          sizes: "192x192",
          type: inferIconType(baseIcon),
        },
        {
          src: baseIcon,
          sizes: "512x512",
          type: inferIconType(baseIcon),
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
