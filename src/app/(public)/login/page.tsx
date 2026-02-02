import LoginCard from "@/components/auth/LoginCard"
import { getAppBranding } from "@/lib/branding"

export const dynamic = "force-dynamic"

export default async function LoginPage() {
  const branding = await getAppBranding()
  const appName = branding.appName
  const logoUrl = branding.logoUrl

  return <LoginCard appName={appName} logoUrl={logoUrl} logoLabel="TCC" />
}
