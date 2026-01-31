import AppHeader from "@/components/app/AppHeader"
import BottomNav from "@/components/app/BottomNav"
import PageContainer from "@/components/app/PageContainer"
import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"

export default async function SessionGate({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSessionFromCookies()
  const role = session?.role ?? "player"
  let name = session?.name ?? "Rodolfo Lelis"
  let avatarUrl: string | null = null
  let logoUrl: string | null = null

  const logoEmail =
    process.env.ADMIN_LOGO_EMAIL?.trim().toLowerCase() ??
    "rodolfo@rldigital.app.br"

  if (session?.userId) {
    const userId = Number(session.userId)
    if (Number.isFinite(userId)) {
      try {
        const user = await db.users.findUnique({
          where: { id: userId },
          select: {
            avatarUrl: true,
            first_name: true,
            last_name: true,
            nickname: true,
          },
        })

        if (user) {
          avatarUrl = user.avatarUrl ?? null
          const fullName = `${user.first_name} ${user.last_name}`.trim()
          name = (user.nickname ?? fullName) || name
        }
      } catch {
        // Ignore avatar lookup failures to keep layout responsive.
      }
    }
  }

  if (logoEmail) {
    try {
      const admin = await db.users.findUnique({
        where: { email: logoEmail },
        select: { avatarUrl: true },
      })
      logoUrl = admin?.avatarUrl ?? null
    } catch {
      // Ignore logo lookup failures.
    }
  }

  return (
    <>
      <AppHeader
        name={name}
        role={role}
        avatarUrl={avatarUrl}
        logoUrl={logoUrl}
        logoLabel="TCC"
      />
      <PageContainer>{children}</PageContainer>
      <BottomNav role={role} />
    </>
  )
}
