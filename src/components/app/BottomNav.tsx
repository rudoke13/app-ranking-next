"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { getNavItems } from "@/lib/nav"
import { cn } from "@/lib/utils"
import type { Role } from "@/lib/auth/types"

export type BottomNavProps = {
  role?: Role
}

export default function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname()
  const items = getNavItems(role ?? "player")

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-primary/30 bg-primary backdrop-blur dark:border-[#15465f] dark:bg-[#0a2f43]"
      aria-label="Navegação principal"
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-around gap-1 px-3 py-2">
        {items.map((item) => {
          const isActive = item.activePaths?.some((path) =>
            pathname.startsWith(path)
          )
            ? true
            : pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary-foreground/15 text-primary-foreground shadow-sm dark:bg-white/10 dark:text-white"
                  : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
              )}
            >
              <Icon className="size-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
