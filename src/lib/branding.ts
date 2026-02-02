import { db } from "@/lib/db"

export const DEFAULT_ADMIN_LOGO_EMAIL = "rodolfo@rldigital.app.br"

export const ADMIN_LOGO_EMAIL = (
  process.env.ADMIN_LOGO_EMAIL ?? DEFAULT_ADMIN_LOGO_EMAIL
)
  .trim()
  .toLowerCase()

export async function getAdminLogoUrl() {
  if (!ADMIN_LOGO_EMAIL) return null
  try {
    const admin = await db.users.findUnique({
      where: { email: ADMIN_LOGO_EMAIL },
      select: { avatarUrl: true },
    })
    return admin?.avatarUrl ?? null
  } catch {
    return null
  }
}

export type AppBranding = {
  appName: string
  logoUrl: string | null
  faviconUrl: string | null
  pwaIconUrl: string | null
  maintenanceEnabled: boolean
  maintenanceMessage: string | null
}

export async function getAppBranding(): Promise<AppBranding> {
  const fallbackName =
    process.env.NEXT_PUBLIC_APP_NAME ?? "Ranking Tenis TCC"

  try {
    const settings = await db.app_settings.findFirst({
      orderBy: { id: "asc" },
    })

    const appName = settings?.app_name?.trim() || fallbackName
    const logoFallback = settings?.logo_url ? null : await getAdminLogoUrl()
    const logoUrl = settings?.logo_url ?? logoFallback
    const faviconUrl =
      settings?.favicon_url ?? settings?.logo_url ?? logoFallback
    const pwaIconUrl =
      settings?.pwa_icon_url ?? settings?.logo_url ?? logoFallback

    return {
      appName,
      logoUrl: logoUrl ?? null,
      faviconUrl: faviconUrl ?? null,
      pwaIconUrl: pwaIconUrl ?? null,
      maintenanceEnabled: settings?.maintenance_enabled ?? false,
      maintenanceMessage: settings?.maintenance_message ?? null,
    }
  } catch {
    const logoFallback = await getAdminLogoUrl()
    return {
      appName: fallbackName,
      logoUrl: logoFallback ?? null,
      faviconUrl: logoFallback ?? null,
      pwaIconUrl: logoFallback ?? null,
      maintenanceEnabled: false,
      maintenanceMessage: null,
    }
  }
}
