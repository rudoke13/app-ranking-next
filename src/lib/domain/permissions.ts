import type { Role, SessionPayload } from "@/lib/auth/types"

export function isAdminRole(role?: Role | null) {
  return role === "admin"
}

export function isCollaboratorRole(role?: Role | null) {
  return role === "collaborator"
}

export function hasAdminAccess(session: SessionPayload | null) {
  return session?.role === "admin"
}

export function hasStaffAccess(session: SessionPayload | null) {
  return session?.role === "admin" || session?.role === "collaborator"
}
