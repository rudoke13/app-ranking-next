import type { Role, SessionPayload } from "@/lib/auth/types"

type MockUser = {
  userId: string
  name: string
  email: string
  password: string
  role: Role
  sessionToken: string
}

const mockUsers: MockUser[] = [
  {
    userId: "1",
    name: "Administrador",
    email: "admin@tcc.com",
    password: "admin123",
    role: "admin",
    sessionToken: "mock-admin",
  },
  {
    userId: "2",
    name: "Rodolfo Lelis",
    email: "player@tcc.com",
    password: "player123",
    role: "player",
    sessionToken: "mock-player",
  },
]

export function authenticate(email: string, password: string): SessionPayload | null {
  const normalizedEmail = email.trim().toLowerCase()

  const user = mockUsers.find(
    (entry) => entry.email.toLowerCase() === normalizedEmail
  )

  if (!user || user.password !== password) {
    return null
  }

  const { password: _password, ...session } = user
  void _password
  return session
}
