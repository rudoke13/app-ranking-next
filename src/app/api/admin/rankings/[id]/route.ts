import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { hasAdminAccess } from "@/lib/domain/permissions"

const patchSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    description: z.string().max(1000).optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .strict()

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies()
  if (!hasAdminAccess(session)) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const { id } = await params
  const rankingId = Number(id)
  if (!Number.isFinite(rankingId)) {
    return NextResponse.json(
      { ok: false, message: "Ranking invalido." },
      { status: 400 }
    )
  }

  const payload = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const existing = await db.rankings.findUnique({
    where: { id: rankingId },
  })

  if (!existing) {
    return NextResponse.json(
      { ok: false, message: "Ranking nao encontrado." },
      { status: 404 }
    )
  }

  const ranking = await db.rankings.update({
    where: { id: rankingId },
    data: {
      name: parsed.data.name ?? undefined,
      description: parsed.data.description,
      is_active: parsed.data.isActive ?? undefined,
    },
  })

  return NextResponse.json({
    ok: true,
    data: {
      id: ranking.id,
      name: ranking.name,
      slug: ranking.slug,
      description: ranking.description,
      isActive: ranking.is_active,
    },
  })
}
