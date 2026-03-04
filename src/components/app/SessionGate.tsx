import AppHeader from "@/components/app/AppHeader"
import BottomNav from "@/components/app/BottomNav"
import MaintenanceView from "@/components/app/MaintenanceView"
import PageContainer from "@/components/app/PageContainer"
import { redirect } from "next/navigation"
import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { getAppBranding } from "@/lib/branding"

type UserProfileCacheEntry = {
  avatarUrl: string | null
  name: string
  expiresAt: number
}

type SessionGateCacheGlobal = typeof globalThis & {
  __sessionGateProfileCache?: Map<number, UserProfileCacheEntry>
}

const sessionGateCacheGlobal = globalThis as SessionGateCacheGlobal
const sessionGateProfileCache =
  sessionGateCacheGlobal.__sessionGateProfileCache ??
  new Map<number, UserProfileCacheEntry>()

if (!sessionGateCacheGlobal.__sessionGateProfileCache) {
  sessionGateCacheGlobal.__sessionGateProfileCache = sessionGateProfileCache
}

const SESSION_GATE_PROFILE_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.SESSION_GATE_PROFILE_CACHE_TTL_MS ?? "300000") || 0
)

const readCachedProfile = (userId: number) => {
  if (SESSION_GATE_PROFILE_CACHE_TTL_MS <= 0) return null
  const cached = sessionGateProfileCache.get(userId)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    sessionGateProfileCache.delete(userId)
    return null
  }
  return cached
}

const writeCachedProfile = (
  userId: number,
  profile: Omit<UserProfileCacheEntry, "expiresAt">
) => {
  if (SESSION_GATE_PROFILE_CACHE_TTL_MS <= 0) return
  sessionGateProfileCache.set(userId, {
    ...profile,
    expiresAt: Date.now() + SESSION_GATE_PROFILE_CACHE_TTL_MS,
  })
}

export default async function SessionGate({
  children,
}: {
  children: React.ReactNode
}) {
  const [session, branding] = await Promise.all([
    getSessionFromCookies(),
    getAppBranding(),
  ])
  if (!session) {
    redirect("/login")
  }

  const role = session.role
  let name = session.name
  const hasAvatarInSession = Boolean(
    Object.prototype.hasOwnProperty.call(session, "avatarUrl")
  )
  let avatarUrl: string | null = hasAvatarInSession
    ? session.avatarUrl ?? null
    : null

  if (branding.maintenanceEnabled && role !== "admin") {
    return (
      <MaintenanceView
        appName={branding.appName}
        logoUrl={branding.logoUrl}
        message={branding.maintenanceMessage}
      />
    )
  }

  if (!hasAvatarInSession) {
    const userId = Number(session.userId)
    if (Number.isFinite(userId)) {
      const cached = readCachedProfile(userId)
      if (cached) {
        avatarUrl = cached.avatarUrl
        name = cached.name || name
      } else {
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
            writeCachedProfile(userId, { avatarUrl, name })
          }
        } catch {
          // Ignore avatar lookup failures to keep layout responsive.
        }
      }
    }
  }

  return (
    <>
      <AppHeader
        name={name}
        role={role}
        avatarUrl={avatarUrl}
        logoUrl={branding.logoUrl}
        logoLabel="TCC"
        appName={branding.appName}
      />
      <PageContainer>{children}</PageContainer>
      <BottomNav role={role} />
    </>
  )
}
