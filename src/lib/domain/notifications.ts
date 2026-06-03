import { Prisma } from "@prisma/client"

import { db } from "@/lib/db"

export type NotificationType =
  | "challenge_received"
  | "removal_requested"
  | "removal_approved"
  | "removal_rejected"

const formatPlayerName = (
  first?: string | null,
  last?: string | null,
  nickname?: string | null
) => {
  const full = `${first ?? ""} ${last ?? ""}`.trim()
  if (nickname && nickname.trim()) {
    return nickname.trim()
  }
  return full || "Jogador"
}

export async function createNotification(input: {
  userId: number
  type: NotificationType
  title: string
  body?: string | null
  data?: Record<string, unknown> | null
}) {
  const data: Prisma.notificationsUncheckedCreateInput = {
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
  }
  if (input.data) {
    data.data = input.data as Prisma.InputJsonValue
  }
  return db.notifications.create({ data })
}

export async function listNotifications(userId: number, limit = 30) {
  return db.notifications.findMany({
    where: { user_id: userId },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(limit, 1), 100),
  })
}

export async function countUnreadNotifications(userId: number) {
  return db.notifications.count({
    where: { user_id: userId, is_read: false },
  })
}

export async function markNotificationRead(userId: number, id: number) {
  return db.notifications.updateMany({
    where: { id, user_id: userId, is_read: false },
    data: { is_read: true, read_at: new Date() },
  })
}

export async function markAllNotificationsRead(userId: number) {
  return db.notifications.updateMany({
    where: { user_id: userId, is_read: false },
    data: { is_read: true, read_at: new Date() },
  })
}

/**
 * Notifica o jogador desafiado (B) de que A o desafiou, incentivando ambos
 * a combinarem o jogo o quanto antes. Inclui dados para a acao de WhatsApp.
 */
export async function notifyChallengeReceived(params: {
  challengeId: number
  rankingId: number
  rankingName: string
  challengerId: number
  challengedId: number
  scheduledFor: Date
}) {
  const challenger = await db.users.findUnique({
    where: { id: params.challengerId },
    select: {
      first_name: true,
      last_name: true,
      nickname: true,
      phone: true,
    },
  })

  const challengerName = formatPlayerName(
    challenger?.first_name,
    challenger?.last_name,
    challenger?.nickname
  )

  return createNotification({
    userId: params.challengedId,
    type: "challenge_received",
    title: "Voce foi desafiado!",
    body: `${challengerName} desafiou voce em ${params.rankingName}. Combinem o jogo o quanto antes e nao deixem para o final da rodada.`,
    data: {
      challengeId: params.challengeId,
      rankingId: params.rankingId,
      rankingName: params.rankingName,
      challengerId: params.challengerId,
      challengerName,
      challengerPhone: challenger?.phone ?? null,
      scheduledFor: params.scheduledFor.toISOString(),
    },
  })
}
