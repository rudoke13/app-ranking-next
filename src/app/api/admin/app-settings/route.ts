import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { hasAdminAccess } from "@/lib/domain/permissions"

const optionalString = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value === "string") {
        const trimmed = value.trim()
        return trimmed.length ? trimmed : null
      }
      return value
    },
    z.string().max(max).nullable().optional()
  )

const optionalUrl = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      const trimmed = value.trim()
      return trimmed.length ? trimmed : null
    }
    return value
  },
  z.string().url().nullable().optional()
)

const patchSchema = z
  .object({
    appName: optionalString(150),
    logoUrl: optionalUrl,
    faviconUrl: optionalUrl,
    pwaIconUrl: optionalUrl,
    maintenanceEnabled: z.boolean().optional(),
    maintenanceMessage: optionalString(1000),
  })
  .strict()

const toPayload = (settings: {
  app_name: string | null
  logo_url: string | null
  favicon_url: string | null
  pwa_icon_url: string | null
  maintenance_enabled: boolean
  maintenance_message: string | null
}) => ({
  appName: settings.app_name,
  logoUrl: settings.logo_url,
  faviconUrl: settings.favicon_url,
  pwaIconUrl: settings.pwa_icon_url,
  maintenanceEnabled: settings.maintenance_enabled,
  maintenanceMessage: settings.maintenance_message,
})

export async function GET() {
  const session = await getSessionFromCookies()
  if (!hasAdminAccess(session)) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  try {
    const settings = await db.app_settings.findFirst({
      orderBy: { id: "asc" },
    })

    return NextResponse.json({
      ok: true,
      data: settings
        ? toPayload(settings)
        : {
            appName: null,
            logoUrl: null,
            faviconUrl: null,
            pwaIconUrl: null,
            maintenanceEnabled: false,
            maintenanceMessage: null,
          },
    })
  } catch (error) {
    console.error("Failed to load app settings", error)
    return NextResponse.json(
      { ok: false, message: "Nao foi possivel carregar as configuracoes." },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  const session = await getSessionFromCookies()
  if (!hasAdminAccess(session)) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const payload = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const existing = await db.app_settings.findFirst({
      orderBy: { id: "asc" },
    })

    const updateData = {
      app_name: parsed.data.appName,
      logo_url: parsed.data.logoUrl,
      favicon_url: parsed.data.faviconUrl,
      pwa_icon_url: parsed.data.pwaIconUrl,
      maintenance_enabled:
        parsed.data.maintenanceEnabled ?? existing?.maintenance_enabled ?? false,
      maintenance_message: parsed.data.maintenanceMessage,
      updated_at: new Date(),
      updated_by: Number(session?.userId) || null,
    }

    const settings = existing
      ? await db.app_settings.update({
          where: { id: existing.id },
          data: updateData,
        })
      : await db.app_settings.create({
          data: {
            app_name: updateData.app_name ?? null,
            logo_url: updateData.logo_url ?? null,
            favicon_url: updateData.favicon_url ?? null,
            pwa_icon_url: updateData.pwa_icon_url ?? null,
            maintenance_enabled: updateData.maintenance_enabled,
            maintenance_message: updateData.maintenance_message ?? null,
            updated_at: updateData.updated_at,
            updated_by: updateData.updated_by,
          },
        })

    return NextResponse.json({ ok: true, data: toPayload(settings) })
  } catch (error) {
    console.error("Failed to update app settings", error)
    return NextResponse.json(
      { ok: false, message: "Nao foi possivel salvar as configuracoes." },
      { status: 500 }
    )
  }
}
