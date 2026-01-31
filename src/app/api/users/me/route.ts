import { NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"

const updateSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  nickname: z.string().max(100).optional().nullable(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional().nullable(),
  birthDate: z.string().optional().nullable(),
  password: z.string().min(6).max(100).optional(),
})

const parseDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export async function POST(request: Request) {
  const session = await getSessionFromCookies()
  if (!session?.userId) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const userId = Number(session.userId)
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const payload = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(payload)

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos." },
      { status: 400 }
    )
  }

  const user = await db.users.findUnique({ where: { id: userId } })
  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Usuario nao encontrado." },
      { status: 404 }
    )
  }

  const updates: Record<string, unknown> = {}

  if (parsed.data.firstName !== undefined) {
    const value = parsed.data.firstName.trim()
    if (value) {
      updates.first_name = value
    }
  }

  if (parsed.data.lastName !== undefined) {
    const value = parsed.data.lastName.trim()
    if (value) {
      updates.last_name = value
    }
  }

  if (parsed.data.nickname !== undefined) {
    const value = parsed.data.nickname?.trim() ?? ""
    updates.nickname = value ? value : null
  }

  if (parsed.data.email !== undefined) {
    const value = parsed.data.email.trim().toLowerCase()
    if (value && value !== user.email) {
      const existing = await db.users.findUnique({ where: { email: value } })
      if (existing && existing.id !== user.id) {
        return NextResponse.json(
          { ok: false, message: "E-mail ja cadastrado." },
          { status: 409 }
        )
      }
      updates.email = value
    }
  }

  if (parsed.data.phone !== undefined) {
    const value = parsed.data.phone?.trim() ?? ""
    updates.phone = value ? value : null
  }

  if (parsed.data.birthDate !== undefined) {
    if (!parsed.data.birthDate) {
      updates.birth_date = null
    } else {
      const parsedDate = parseDate(parsed.data.birthDate)
      if (!parsedDate) {
        return NextResponse.json(
          { ok: false, message: "Data invalida." },
          { status: 400 }
        )
      }
      updates.birth_date = parsedDate
    }
  }

  if (parsed.data.password) {
    const passwordValue = parsed.data.password.trim()
    if (passwordValue) {
      const hashed = await bcrypt.hash(passwordValue, 10)
      updates.password_hash = hashed
      updates.must_reset_password = false
      updates.password_reset_token = null
      updates.password_reset_expires_at = null
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({
      ok: true,
      data: { message: "Nada para atualizar." },
    })
  }

  await db.users.update({
    where: { id: userId },
    data: updates,
  })

  return NextResponse.json({
    ok: true,
    data: { message: "Perfil atualizado." },
  })
}
