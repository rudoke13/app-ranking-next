import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionFromCookies } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { hasAdminAccess } from "@/lib/domain/permissions"
import { slugify } from "@/lib/slug"

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional().nullable(),
})

const buildUniqueSlug = async (base: string) => {
  const candidates = await db.rankings.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  })
  const used = new Set(candidates.map((row) => row.slug))
  if (!used.has(base)) return base

  let suffix = 2
  while (used.has(`${base}-${suffix}`)) {
    suffix += 1
  }
  return `${base}-${suffix}`
}

export async function GET() {
  const session = await getSessionFromCookies()
  if (!hasAdminAccess(session)) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const rankings = await db.rankings.findMany({
    orderBy: { name: "asc" },
  })

  const counts = await db.ranking_memberships.groupBy({
    by: ["ranking_id"],
    where: { is_suspended: false },
    _count: { _all: true },
  })

  const countMap = new Map(
    counts.map((item) => [item.ranking_id, item._count._all])
  )

  return NextResponse.json({
    ok: true,
    data: rankings.map((ranking) => ({
      id: ranking.id,
      name: ranking.name,
      slug: ranking.slug,
      description: ranking.description,
      isActive: ranking.is_active,
      activePlayers: countMap.get(ranking.id) ?? 0,
    })),
  })
}

export async function POST(request: Request) {
  const session = await getSessionFromCookies()
  if (!hasAdminAccess(session)) {
    return NextResponse.json(
      { ok: false, message: "Nao autorizado." },
      { status: 401 }
    )
  }

  const payload = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dados invalidos.", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const baseSlug = slugify(parsed.data.name)
  const slug = await buildUniqueSlug(baseSlug)

  const ranking = await db.rankings.create({
    data: {
      name: parsed.data.name,
      slug,
      description: parsed.data.description ?? null,
      is_active: true,
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
      activePlayers: 0,
    },
  })
}
