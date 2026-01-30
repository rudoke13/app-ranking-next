import type { Role, SessionPayload } from "@/lib/auth/types"

export function isAdminRole(role?: Role | null) {
  return role === "admin"
}

export function hasAdminAccess(session: SessionPayload | null) {
  return session?.role === "admin"
}
