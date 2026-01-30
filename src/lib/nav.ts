import type { LucideIcon } from "lucide-react"
import { Home, Shield, Swords, Trophy, User } from "lucide-react"

import type { Role } from "@/lib/auth/types"

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  activePaths?: string[]
}

export const baseNavItems: NavItem[] = [
  {
    label: "Geral",
    href: "/dashboard",
    icon: Home,
  },
  {
    label: "Ranking",
    href: "/ranking",
    icon: Trophy,
  },
  {
    label: "Desafios",
    href: "/desafios",
    icon: Swords,
  },
  {
    label: "Perfil",
    href: "/perfil",
    icon: User,
  },
]

const adminNavItem: NavItem = {
  label: "Admin",
  href: "/admin/usuarios",
  icon: Shield,
  activePaths: ["/admin"],
}

export function getNavItems(role: Role) {
  if (role === "admin") {
    return [...baseNavItems, adminNavItem]
  }

  return baseNavItems
}
