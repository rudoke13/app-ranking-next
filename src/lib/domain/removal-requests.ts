import { db } from "@/lib/db"
import { removeRankingMembership } from "@/lib/domain/memberships"
import { createNotification } from "@/lib/domain/notifications"

const formatPlayerName = (
  first?: string | null,
  last?: string | null,
  nickname?: string | null
) => {
  if (nickname && nickname.trim()) return nickname.trim()
  const full = `${first ?? ""} ${last ?? ""}`.trim()
  return full || "Jogador"
}

type RemovalRequestResult =
  | { ok: true }
  | { ok: false; code: "no_membership" | "already_pending" | "not_pending" }

async function notifyAdminsRemovalRequested(params: {
  requestId: number
  userId: number
  userName: string
  rankingId: number
  rankingName: string
}) {
  const admins = await db.users.findMany({
    where: { role: "admin" },
    select: { id: true },
  })

  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        type: "removal_requested",
        title: "Pedido de saida de ranking",
        body: `${params.userName} pediu para sair de ${params.rankingName}. Aprove ou recuse na central de notificacoes.`,
        data: {
          requestId: params.requestId,
          userId: params.userId,
          userName: params.userName,
          rankingId: params.rankingId,
          rankingName: params.rankingName,
        },
      })
    )
  )
}

export async function createRemovalRequest(params: {
  userId: number
  rankingId: number
  reason?: string | null
}): Promise<RemovalRequestResult> {
  const membership = await db.ranking_memberships.findFirst({
    where: { user_id: params.userId, ranking_id: params.rankingId },
    select: { id: true },
  })
  if (!membership) {
    return { ok: false, code: "no_membership" }
  }

  const existing = await db.ranking_removal_requests.findFirst({
    where: {
      user_id: params.userId,
      ranking_id: params.rankingId,
      status: "pending",
    },
    select: { id: true },
  })
  if (existing) {
    return { ok: false, code: "already_pending" }
  }

  const [user, ranking] = await Promise.all([
    db.users.findUnique({
      where: { id: params.userId },
      select: { first_name: true, last_name: true, nickname: true },
    }),
    db.rankings.findUnique({
      where: { id: params.rankingId },
      select: { name: true },
    }),
  ])

  const userName = formatPlayerName(
    user?.first_name,
    user?.last_name,
    user?.nickname
  )
  const rankingName = ranking?.name ?? "o ranking"
  const reason = params.reason?.trim() || null

  const request = await db.ranking_removal_requests.create({
    data: {
      user_id: params.userId,
      ranking_id: params.rankingId,
      reason,
      status: "pending",
    },
  })

  await notifyAdminsRemovalRequested({
    requestId: request.id,
    userId: params.userId,
    userName,
    rankingId: params.rankingId,
    rankingName,
  })

  return { ok: true }
}

export async function listUserPendingRemovalRankingIds(userId: number) {
  const rows = await db.ranking_removal_requests.findMany({
    where: { user_id: userId, status: "pending" },
    select: { ranking_id: true },
  })
  return rows.map((row) => row.ranking_id)
}

export async function listPendingRemovalRequests() {
  const rows = await db.ranking_removal_requests.findMany({
    where: { status: "pending" },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: {
      id: true,
      reason: true,
      created_at: true,
      user_id: true,
      ranking_id: true,
      users: {
        select: { first_name: true, last_name: true, nickname: true },
      },
      rankings: { select: { name: true } },
    },
  })

  return rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    createdAt: row.created_at?.toISOString() ?? null,
    userId: row.user_id,
    rankingId: row.ranking_id,
    userName: formatPlayerName(
      row.users?.first_name,
      row.users?.last_name,
      row.users?.nickname
    ),
    rankingName: row.rankings?.name ?? "o ranking",
  }))
}

export async function approveRemovalRequest(
  requestId: number,
  adminId: number
): Promise<RemovalRequestResult> {
  const request = await db.ranking_removal_requests.findUnique({
    where: { id: requestId },
  })
  if (!request || request.status !== "pending") {
    return { ok: false, code: "not_pending" }
  }

  const ranking = await db.rankings.findUnique({
    where: { id: request.ranking_id },
    select: { name: true },
  })
  const rankingName = ranking?.name ?? "o ranking"

  await db.$transaction(async (tx) => {
    await removeRankingMembership(tx, {
      userId: request.user_id,
      rankingId: request.ranking_id,
    })
    await tx.ranking_removal_requests.update({
      where: { id: requestId },
      data: {
        status: "approved",
        resolved_by: adminId,
        resolved_at: new Date(),
      },
    })
  })

  await createNotification({
    userId: request.user_id,
    type: "removal_approved",
    title: "Saida aprovada",
    body: `Seu pedido para sair de ${rankingName} foi aprovado. Voce nao esta mais nessa categoria.`,
    data: { rankingId: request.ranking_id, rankingName },
  })

  return { ok: true }
}

export async function rejectRemovalRequest(
  requestId: number,
  adminId: number
): Promise<RemovalRequestResult> {
  const request = await db.ranking_removal_requests.findUnique({
    where: { id: requestId },
  })
  if (!request || request.status !== "pending") {
    return { ok: false, code: "not_pending" }
  }

  const ranking = await db.rankings.findUnique({
    where: { id: request.ranking_id },
    select: { name: true },
  })
  const rankingName = ranking?.name ?? "o ranking"

  await db.ranking_removal_requests.update({
    where: { id: requestId },
    data: {
      status: "rejected",
      resolved_by: adminId,
      resolved_at: new Date(),
    },
  })

  await createNotification({
    userId: request.user_id,
    type: "removal_rejected",
    title: "Saida recusada",
    body: `Seu pedido para sair de ${rankingName} foi recusado. Voce continua na categoria.`,
    data: { rankingId: request.ranking_id, rankingName },
  })

  return { ok: true }
}
