import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { Prisma } from "@prisma/client"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { getAllowedRankingIds } from "@/lib/domain/collaborator-access"
import { hasStaffAccess } from "@/lib/domain/permissions"

type MembershipUpdate = {
  ranking_id?: number
  is_blue_point?: boolean
  is_access_challenge?: boolean
  is_suspended?: boolean
  license_position?: number | null
  position?: number | null
}

const membershipSchema = z.object({
  id: z.number().int().positive().optional(),
  ranking_id: z.number().int().positive().optional(),
  move_to_ranking_id: z.number().int().positive().optional(),
  is_blue_point: z.boolean().optional(),
  is_access_challenge: z.boolean().optional(),
  is_suspended: z.boolean().optional(),
  license_position: z.number().int().min(1).optional().nullable(),
  position: z.number().int().min(1).optional().nullable(),
})

const updateSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  nickname: z.string().max(100).optional().nullable(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional().nullable(),
  birth_date: z.string().optional().nullable(),
  password: z.string().min(4).max(100).optional(),
  active: z.boolean().optional(),
  role: z.enum(["admin", "player", "collaborator", "member"]).optional(),
  avatarUrl: z.string().max(255).optional().nullable(),
  collaborator_ranking_ids: z.array(z.number().int().positive()).optional(),
  membership: membershipSchema.optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies()
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  if (!hasStaffAccess(session)) {
    return NextResponse.json(
      { ok: false, message: "Acesso restrito." },
      { status: 403 }
    )
  }

  const { id } = await params
  const userId = Number(id)
  if (!Number.isFinite(userId)) {
    return NextResponse.json(
      { ok: false, message: "Usuario invalido." },
      { status: 400 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const allowedRankingIds = await getAllowedRankingIds(session)
  const isCollaborator = allowedRankingIds !== null

  const existing = await db.users.findUnique({
    where: { id: userId },
    include: {
      ranking_memberships: {
        select: { id: true, ranking_id: true },
      },
    },
  })
  if (!existing) {
    return NextResponse.json(
      { ok: false, message: "Usuario nao encontrado." },
      { status: 404 }
    )
  }

  if (isCollaborator) {
    if (!allowedRankingIds.length) {
      return NextResponse.json(
        { ok: false, message: "Colaborador sem categorias liberadas." },
        { status: 403 }
      )
    }
    if (existing.role === "admin" || existing.role === "collaborator") {
      return NextResponse.json(
        { ok: false, message: "Nao e permitido editar este usuario." },
        { status: 403 }
      )
    }
    const hasAllowedMembership = existing.ranking_memberships.some((member) =>
      allowedRankingIds.includes(member.ranking_id)
    )
    if (!hasAllowedMembership && !parsed.data.membership) {
      return NextResponse.json(
        { ok: false, message: "Sem permissao para editar este jogador." },
        { status: 403 }
      )
    }
    if (parsed.data.role) {
      return NextResponse.json(
        { ok: false, message: "Colaborador nao pode alterar permissao." },
        { status: 403 }
      )
    }
  }

  const updates: Record<string, unknown> = {}
  const collaboratorRankingIds = parsed.data.collaborator_ranking_ids
  const uniqueCollaboratorRankings = collaboratorRankingIds
    ? Array.from(new Set(collaboratorRankingIds))
    : null
  const shouldClearCollaboratorAccess =
    session.role === "admin" &&
    parsed.data.role &&
    parsed.data.role !== "collaborator" &&
    existing.role === "collaborator"

  if (uniqueCollaboratorRankings) {
    if (session.role !== "admin") {
      return NextResponse.json(
        { ok: false, message: "Apenas admin pode ajustar colaborador." },
        { status: 403 }
      )
    }
    if (existing.role !== "collaborator") {
      return NextResponse.json(
        { ok: false, message: "Usuario nao e colaborador." },
        { status: 422 }
      )
    }
    if (uniqueCollaboratorRankings.length) {
      const rankingCount = await db.rankings.count({
        where: { id: { in: uniqueCollaboratorRankings } },
      })
      if (rankingCount !== uniqueCollaboratorRankings.length) {
        return NextResponse.json(
          { ok: false, message: "Categoria do ranking nao encontrada." },
          { status: 404 }
        )
      }
    }
  }

  if (parsed.data.first_name) updates.first_name = parsed.data.first_name.trim()
  if (parsed.data.last_name) updates.last_name = parsed.data.last_name.trim()
  if (parsed.data.nickname !== undefined) {
    const value = parsed.data.nickname?.trim() ?? ""
    updates.nickname = value ? value : null
  }
  if (parsed.data.email) updates.email = parsed.data.email.trim().toLowerCase()
  if (parsed.data.phone !== undefined) {
    const value = parsed.data.phone?.trim() ?? ""
    updates.phone = value ? value : null
  }
  if (parsed.data.birth_date !== undefined) {
    const value = parsed.data.birth_date?.trim() ?? ""
    if (!value) {
      updates.birth_date = null
    } else {
      const parsedDate = new Date(value)
      if (Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { ok: false, message: "Data de nascimento invalida." },
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
    }
  }
  if (parsed.data.role) updates.role = parsed.data.role
  if (parsed.data.avatarUrl !== undefined) {
    updates.avatarUrl = parsed.data.avatarUrl
  }

  const membershipInput = parsed.data.membership
  let membershipUpdates: MembershipUpdate = {}
  const moveToRankingId = membershipInput?.move_to_ranking_id
  const activeInput = parsed.data.active

  if (membershipInput) {
    if (!membershipInput.id && !membershipInput.ranking_id) {
      return NextResponse.json(
        { ok: false, message: "Informe o vinculo a ser atualizado." },
        { status: 400 }
      )
    }
    if (membershipInput.is_blue_point !== undefined) {
      membershipUpdates.is_blue_point = membershipInput.is_blue_point
    }
    if (membershipInput.is_access_challenge !== undefined) {
      membershipUpdates.is_access_challenge = membershipInput.is_access_challenge
    }
    if (membershipInput.is_suspended !== undefined) {
      membershipUpdates.is_suspended = membershipInput.is_suspended
    }
    if (membershipInput.license_position !== undefined) {
      membershipUpdates.license_position = membershipInput.license_position
    }
    if (membershipInput.position !== undefined) {
      membershipUpdates.position = membershipInput.position
    }
  }

  if (isCollaborator && membershipInput) {
    if (membershipInput.id) {
      const targetMembership = existing.ranking_memberships.find(
        (member) => member.id === membershipInput.id
      )
      if (!targetMembership) {
        return NextResponse.json(
          { ok: false, message: "Vinculo de ranking nao encontrado." },
          { status: 404 }
        )
      }
      if (!allowedRankingIds.includes(targetMembership.ranking_id)) {
        return NextResponse.json(
          { ok: false, message: "Sem permissao para este ranking." },
          { status: 403 }
        )
      }
    }

    if (
      membershipInput.ranking_id &&
      !allowedRankingIds.includes(membershipInput.ranking_id)
    ) {
      return NextResponse.json(
        { ok: false, message: "Sem permissao para este ranking." },
        { status: 403 }
      )
    }

    if (moveToRankingId && !allowedRankingIds.includes(moveToRankingId)) {
      return NextResponse.json(
        { ok: false, message: "Sem permissao para este ranking." },
        { status: 403 }
      )
    }
  }

  const hasMembershipIntent = Boolean(membershipInput)
  if (
    Object.keys(updates).length === 0 &&
    Object.keys(membershipUpdates).length === 0 &&
    moveToRankingId === undefined &&
    activeInput === undefined &&
    !hasMembershipIntent
  ) {
    return NextResponse.json(
      { ok: false, message: "Nenhuma alteracao enviada." },
      { status: 400 }
    )
  }

  try {
    const result = await db.$transaction(async (tx) => {
      let updatedUser = existing
      if (Object.keys(updates).length > 0) {
        updatedUser = await tx.users.update({
          where: { id: userId },
          data: updates,
          include: {
            ranking_memberships: {
              select: { id: true, ranking_id: true },
            },
          },
        })
      }

      let updatedMembership = null as null | {
        id: number
        ranking_id: number
        is_blue_point: boolean | null
        is_access_challenge: boolean
        is_suspended: boolean | null
        position: number | null
        license_position: number | null
      }

      const shouldHandleMembership =
        Boolean(membershipInput) &&
        (Object.keys(membershipUpdates).length > 0 ||
          moveToRankingId !== undefined ||
          (membershipInput?.ranking_id && !membershipInput?.id))

      if (shouldHandleMembership && membershipInput) {
        const membership = await tx.ranking_memberships.findFirst({
          where: {
            user_id: userId,
            ...(membershipInput.id
              ? { id: membershipInput.id }
              : membershipInput.ranking_id
              ? { ranking_id: membershipInput.ranking_id }
              : {}),
          },
        })

        if (!membership) {
          if (membershipInput.ranking_id && !membershipInput.id) {
            const maxPosition = await tx.ranking_memberships.aggregate({
              where: { ranking_id: membershipInput.ranking_id },
              _max: { position: true },
            })
            const nextPosition = (maxPosition._max.position ?? 0) + 1
            const createData: Prisma.ranking_membershipsUncheckedCreateInput = {
              ranking_id: membershipInput.ranking_id,
              user_id: userId,
              position: nextPosition,
            }

            if (membershipUpdates.is_blue_point !== undefined) {
              createData.is_blue_point = membershipUpdates.is_blue_point
            }
            if (membershipUpdates.is_access_challenge !== undefined) {
              createData.is_access_challenge = membershipUpdates.is_access_challenge
            }
            if (membershipUpdates.is_suspended !== undefined) {
              createData.is_suspended = membershipUpdates.is_suspended
            } else if (activeInput !== undefined) {
              createData.is_suspended = !activeInput
            }
            if (membershipUpdates.license_position !== undefined) {
              createData.license_position = membershipUpdates.license_position
            }

            updatedMembership = await tx.ranking_memberships.create({
              data: createData,
              select: {
                id: true,
                ranking_id: true,
                is_blue_point: true,
                is_access_challenge: true,
                is_suspended: true,
                position: true,
                license_position: true,
              },
            })
          } else {
            throw new Error("membership_not_found")
          }
        } else {
          if (
            membershipUpdates.is_suspended === true &&
            membershipUpdates.license_position === undefined
          ) {
            membershipUpdates.license_position = membership.position ?? null
          }

          if (moveToRankingId !== undefined) {
            if (membership.ranking_id === moveToRankingId) {
              throw new Error("membership_same_ranking")
            }

            const targetMembership = await tx.ranking_memberships.findFirst({
              where: { ranking_id: moveToRankingId, user_id: userId },
              select: { id: true },
            })

            if (targetMembership && targetMembership.id !== membership.id) {
              throw new Error("membership_target_exists")
            }

            const nextSuspended =
              membershipUpdates.is_suspended !== undefined
                ? Boolean(membershipUpdates.is_suspended)
                : Boolean(membership.is_suspended)

            membershipUpdates = {
              ...membershipUpdates,
              ranking_id: moveToRankingId,
              position: null,
              is_blue_point: false,
              is_access_challenge: false,
              is_suspended: nextSuspended,
            }
          }

          if (Object.keys(membershipUpdates).length > 0) {
            updatedMembership = await tx.ranking_memberships.update({
              where: { id: membership.id },
              data: membershipUpdates,
              select: {
                id: true,
                ranking_id: true,
                is_blue_point: true,
                is_access_challenge: true,
                is_suspended: true,
                position: true,
                license_position: true,
              },
            })
          } else {
            updatedMembership = {
              id: membership.id,
              ranking_id: membership.ranking_id,
              is_blue_point: membership.is_blue_point,
              is_access_challenge: membership.is_access_challenge,
              is_suspended: membership.is_suspended,
              position: membership.position,
              license_position: membership.license_position ?? null,
            }
          }
        }
      }

      if (activeInput !== undefined) {
        const where: Prisma.ranking_membershipsWhereInput = {
          user_id: userId,
        }
        if (isCollaborator) {
          where.ranking_id = { in: allowedRankingIds }
        }
        await tx.ranking_memberships.updateMany({
          where,
          data: { is_suspended: !activeInput },
        })
      }

      if (uniqueCollaboratorRankings) {
        await tx.collaborator_rankings.deleteMany({
          where: { user_id: userId },
        })
        if (uniqueCollaboratorRankings.length) {
          await tx.collaborator_rankings.createMany({
            data: uniqueCollaboratorRankings.map((rankingId) => ({
              ranking_id: rankingId,
              user_id: userId,
            })),
            skipDuplicates: true,
          })
        }
      }

      if (shouldClearCollaboratorAccess && !uniqueCollaboratorRankings) {
        await tx.collaborator_rankings.deleteMany({
          where: { user_id: userId },
        })
      }

      return { updatedUser, updatedMembership }
    })

    return NextResponse.json({
      ok: true,
      data: {
        id: result.updatedUser.id,
        role: result.updatedUser.role,
        avatarUrl: result.updatedUser.avatarUrl ?? null,
        membership: result.updatedMembership
          ? {
              ...result.updatedMembership,
              is_blue_point: Boolean(result.updatedMembership.is_blue_point),
              is_access_challenge: Boolean(
                result.updatedMembership.is_access_challenge
              ),
              is_suspended: Boolean(result.updatedMembership.is_suspended),
              license_position: result.updatedMembership.license_position ?? null,
            }
          : null,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === "membership_not_found") {
      return NextResponse.json(
        { ok: false, message: "Vinculo de ranking nao encontrado." },
        { status: 404 }
      )
    }
    if (error instanceof Error && error.message === "membership_target_exists") {
      return NextResponse.json(
        { ok: false, message: "Usuario ja esta vinculado a este ranking." },
        { status: 409 }
      )
    }
    if (error instanceof Error && error.message === "membership_same_ranking") {
      return NextResponse.json(
        { ok: false, message: "Selecione uma categoria diferente." },
        { status: 422 }
      )
    }

    return NextResponse.json(
      { ok: false, message: "Falha ao atualizar usuario." },
      { status: 500 }
    )
  }
}
