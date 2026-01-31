import LoginCard from "@/components/auth/LoginCard"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const logoEmail =
  process.env.ADMIN_LOGO_EMAIL?.trim().toLowerCase() ??
  "rodolfo@rldigital.app.br"

async function resolveLogoUrl() {
  if (!logoEmail) return null
  try {
    const admin = await db.users.findUnique({
      where: { email: logoEmail },
      select: { avatarUrl: true },
    })
    return admin?.avatarUrl ?? null
  } catch {
    return null
  }
}

export default async function LoginPage() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Ranking Tênis TCC"
  const logoUrl = await resolveLogoUrl()

  return <LoginCard appName={appName} logoUrl={logoUrl} logoLabel="TCC" />
}
