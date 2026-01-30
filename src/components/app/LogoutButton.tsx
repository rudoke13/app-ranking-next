"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function LogoutButton() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleLogout = async () => {
    setIsLoading(true)

    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } finally {
      router.push("/login")
      router.refresh()
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="gap-2"
      onClick={handleLogout}
      disabled={isLoading}
    >
      <LogOut className="size-4" />
      {isLoading ? "Saindo..." : "Sair"}
    </Button>
  )
}
