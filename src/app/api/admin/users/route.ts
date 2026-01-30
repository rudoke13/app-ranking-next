import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { Prisma } from "@prisma/client"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { hasAdminAccess } from "@/lib/domain/permissions"

const DEFAULT_PASSWORD = "player123"

const formatName = (
  first?: string | null,
  last?: string | null,
  nickname?: string | null
) => {
  const full = `${first ?? ""} ${last ?? ""}`.trim()
  const nick = (nickname ?? "").trim()

  if (!full && !nick) return "Jogador"
  if (nick && full) return `${full} "${nick}"`
  return nick || full
}

const createSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  nickname: z.string().max(100).optional().nullable(),
  email: z.string().email(),
  phone: z.string().max(30).optional().nullable(),
  birth_date: z.string().optional().nullable(),
  role: z.enum(["admin", "player", "collaborator", "member"]).optional(),
  ranking_id: z.number().int().positive().optional(),
  password: z.string().min(4).max(100).optional(),
})

export async function POST(request: Request) {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  if (!hasAdminAccess(session)) {
    return NextResponse.json(
      { ok: false, message: "Acesso restrito." },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const firstName = parsed.data.first_name.trim()
  const lastName = parsed.data.last_name.trim()
  const nickname = parsed.data.nickname?.trim() ?? ""
  const email = parsed.data.email.trim().toLowerCase()
  const phone = parsed.data.phone?.trim() ?? ""
  const birthDateInput = parsed.data.birth_date?.trim() ?? ""
  const role = parsed.data.role ?? "player"
  const rankingId = parsed.data.ranking_id
  const passwordInput = parsed.data.password?.trim()
  const passwordValue = passwordInput ? passwordInput : DEFAULT_PASSWORD
  const mustResetPassword = !passwordInput

  if (!firstName || !lastName) {
    return NextResponse.json(
      { ok: false, message: "Nome e sobrenome sao obrigatorios." },
      { status: 400 }
    )
  }

  if ((role === "player" || role === "member") && rankingId === undefined) {
    return NextResponse.json(
      { ok: false, message: "Informe a categoria do ranking." },
      { status: 422 }
    )
  }

  const birthDate = birthDateInput ? new Date(birthDateInput) : null
  if (birthDateInput && (!birthDate || Number.isNaN(birthDate.getTime()))) {
    return NextResponse.json(
      { ok: false, message: "Data de nascimento invalida." },
      { status: 400 }
    )
  }

  const existing = await db.users.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json(
      { ok: false, message: "Email ja cadastrado." },
      { status: 409 }
    )
  }

  if (rankingId !== undefined) {
    const ranking = await db.rankings.findUnique({
      where: { id: rankingId },
      select: { id: true },
    })
    if (!ranking) {
      return NextResponse.json(
        { ok: false, message: "Ranking nao encontrado." },
        { status: 404 }
      )
    }
  }

  try {
    const passwordHash = await bcrypt.hash(passwordValue, 10)

    const result = await db.$transaction(async (tx) => {
      const user = await tx.users.create({
        data: {
          first_name: firstName,
          last_name: lastName,
          nickname: nickname ? nickname : null,
          email,
          phone: phone ? phone : null,
          birth_date: birthDate,
          role,
          password_hash: passwordHash,
          must_reset_password: mustResetPassword,
        },
      })

      let membership: {
        id: number
        ranking_id: number
        position: number | null
        license_position: number | null
        is_blue_point: boolean | null
        is_access_challenge: boolean
        is_suspended: boolean | null
        ranking_name: string
      } | null = null

      if (rankingId !== undefined) {
        const maxPosition = await tx.ranking_memberships.aggregate({
          where: { ranking_id: rankingId },
          _max: { position: true },
        })
        const nextPosition = (maxPosition._max.position ?? 0) + 1

        const createdMembership = await tx.ranking_memberships.create({
          data: {
            ranking_id: rankingId,
            user_id: user.id,
            position: nextPosition,
          },
          select: {
            id: true,
            ranking_id: true,
            position: true,
            license_position: true,
            is_blue_point: true,
            is_access_challenge: true,
            is_suspended: true,
            rankings: { select: { name: true } },
          },
        })

        membership = {
          id: createdMembership.id,
          ranking_id: createdMembership.ranking_id,
          position: createdMembership.position ?? null,
          license_position: createdMembership.license_position ?? null,
          is_blue_point: createdMembership.is_blue_point,
          is_access_challenge: createdMembership.is_access_challenge,
          is_suspended: createdMembership.is_suspended,
          ranking_name: createdMembership.rankings.name,
        }
      }

      return { user, membership }
    })

    return NextResponse.json(
      {
        ok: true,
        data: {
          id: result.user.id,
          name: formatName(
            result.user.first_name,
            result.user.last_name,
            result.user.nickname
          ),
          firstName: result.user.first_name,
          lastName: result.user.last_name,
          nickname: result.user.nickname,
          email: result.user.email,
          phone: result.user.phone ?? null,
          birthDate: result.user.birth_date
            ? result.user.birth_date.toISOString()
            : null,
          role: result.user.role,
          avatarUrl: result.user.avatarUrl ?? null,
          memberships: result.membership
            ? [
                {
                  id: result.membership.id,
                  rankingId: result.membership.ranking_id,
                  rankingName: result.membership.ranking_name,
                  position: result.membership.position,
                  licensePosition: result.membership.license_position ?? null,
                  isBluePoint: Boolean(result.membership.is_blue_point),
                  isAccessChallenge: Boolean(
                    result.membership.is_access_challenge
                  ),
                  isSuspended: Boolean(result.membership.is_suspended),
                },
              ]
            : [],
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { ok: false, message: "Email ja cadastrado." },
          { status: 409 }
        )
      }
    }
    return NextResponse.json(
      { ok: false, message: "Falha ao criar usuario." },
      { status: 500 }
    )
  }
}

export async function GET() {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  if (!hasAdminAccess(session)) {
    return NextResponse.json(
      { ok: false, message: "Acesso restrito." },
      { status: 403 }
    )
  }

  const users = await db.users.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      nickname: true,
      email: true,
      phone: true,
      birth_date: true,
      role: true,
      avatarUrl: true,
      ranking_memberships: {
        select: {
          id: true,
          ranking_id: true,
          position: true,
          license_position: true,
          is_blue_point: true,
          is_access_challenge: true,
          is_suspended: true,
          rankings: { select: { name: true } },
        },
        orderBy: { ranking_id: "asc" },
      },
    },
  })

  return NextResponse.json({
    ok: true,
    data: users.map((user) => ({
      id: user.id,
      name: formatName(user.first_name, user.last_name, user.nickname),
      firstName: user.first_name,
      lastName: user.last_name,
      nickname: user.nickname,
      email: user.email,
      phone: user.phone ?? null,
      birthDate: user.birth_date ? user.birth_date.toISOString() : null,
      role: user.role,
      avatarUrl: user.avatarUrl ?? null,
      memberships: user.ranking_memberships.map((membership) => ({
        id: membership.id,
        rankingId: membership.ranking_id,
        rankingName: membership.rankings.name,
        position: membership.position ?? null,
        licensePosition: membership.license_position ?? null,
        isBluePoint: Boolean(membership.is_blue_point),
        isAccessChallenge: Boolean(membership.is_access_challenge),
        isSuspended: Boolean(membership.is_suspended),
      })),
    })),
  })
}
