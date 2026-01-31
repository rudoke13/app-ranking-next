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
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 backdrop-blur"
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
                "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
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
