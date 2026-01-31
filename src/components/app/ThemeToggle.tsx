"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"

type ThemeMode = "dark" | "light"

const getStoredTheme = (): ThemeMode => {
  if (typeof window === "undefined") return "dark"
  const stored = window.localStorage.getItem("theme")
  return stored === "light" ? "light" : "dark"
}

const applyTheme = (theme: ThemeMode) => {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", theme === "dark")
  window.localStorage.setItem("theme", theme)
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("dark")

  useEffect(() => {
    const stored = getStoredTheme()
    setTheme(stored)
    applyTheme(stored)
  }, [])

  const handleToggle = () => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark"
    setTheme(next)
    applyTheme(next)
  }

  const label = theme === "dark" ? "Modo claro" : "Modo escuro"

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      aria-label={label}
      title={label}
    >
      {theme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  )
}
