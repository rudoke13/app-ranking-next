import LoginCard from "@/components/auth/LoginCard"
import { getAdminLogoUrl } from "@/lib/branding"

export const dynamic = "force-dynamic"

export default async function LoginPage() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Ranking Tênis TCC"
  const logoUrl = await getAdminLogoUrl()

  return <LoginCard appName={appName} logoUrl={logoUrl} logoLabel="TCC" />
}
