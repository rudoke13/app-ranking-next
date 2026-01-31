export type Role = "admin" | "player"

export type SessionPayload = {
  userId: string
  name: string
  email: string
  role: Role
  sessionToken: string
}

export const SESSION_COOKIE_NAME = "tcc_session"
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365
