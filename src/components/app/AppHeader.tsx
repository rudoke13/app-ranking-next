import Link from "next/link"

import LogoutButton from "@/components/app/LogoutButton"
import UserAvatar from "@/components/app/UserAvatar"
import { Badge } from "@/components/ui/badge"
import type { Role } from "@/lib/auth/types"
import ThemeToggle from "@/components/app/ThemeToggle"

export type AppHeaderProps = {
  name: string
  role: Role
  avatarUrl?: string | null
  logoUrl?: string | null
  logoLabel?: string
}

const roleLabel: Record<Role, string> = {
  admin: "Admin",
  collaborator: "Colaborador",
  player: "Jogador",
  member: "Jogador",
}

export default function AppHeader({
  name,
  role,
  avatarUrl,
  logoUrl,
  logoLabel = "TCC",
}: AppHeaderProps) {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Ranking Tênis TCC"

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 text-base font-semibold tracking-tight text-primary sm:text-lg"
        >
          <UserAvatar
            name={appName}
            src={logoUrl}
            size="clamp(40px, 5vw, 48px)"
            fallbackLabel={logoLabel}
            className="text-sm sm:text-base"
          />
          <span>{appName}</span>
        </Link>
        <div className="flex items-center gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <UserAvatar
              name={name}
              src={avatarUrl}
              size={32}
              fallbackLabel={role === "admin" ? "TCC" : undefined}
            />
            <span>
              Olá, <span className="font-semibold text-foreground">{name}</span>
            </span>
            {role === "admin" || role === "collaborator" ? (
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/10 text-primary"
              >
                {roleLabel[role]}
              </Badge>
            ) : null}
          </div>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>
    </header>
  )
}
