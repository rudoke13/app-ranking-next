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

  return (
    <>
      <AppHeader name={name} role={role} avatarUrl={avatarUrl} />
      <PageContainer>{children}</PageContainer>
      <BottomNav role={role} />
    </>
  )
}
