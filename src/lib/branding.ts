import { db } from "@/lib/db"

export const DEFAULT_ADMIN_LOGO_EMAIL = "rodolfo@rlfigital.app.br"

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
