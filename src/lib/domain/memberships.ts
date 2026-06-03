import { Prisma } from "@prisma/client"

/**
 * Remove o vinculo de um jogador com uma categoria (ranking) e recompacta as
 * posicoes dos jogadores ativos que estavam abaixo dele, evitando "buracos".
 * Aceita o client transacional para ser usado dentro de uma transacao.
 *
 * Retorna { id, ranking_id } do vinculo removido, ou null se nao existir.
 */
export async function removeRankingMembership(
  client: Prisma.TransactionClient,
  params: { userId: number; rankingId?: number; membershipId?: number }
) {
  const membership = await client.ranking_memberships.findFirst({
    where: {
      user_id: params.userId,
      ...(params.membershipId
        ? { id: params.membershipId }
        : params.rankingId
        ? { ranking_id: params.rankingId }
        : {}),
    },
  })

  if (!membership) return null

  if (
    !membership.is_suspended &&
    membership.position &&
    membership.position > 0
  ) {
    await client.ranking_memberships.updateMany({
      where: {
        ranking_id: membership.ranking_id,
        NOT: { is_suspended: true },
        id: { not: membership.id },
        position: { gt: membership.position },
      },
      data: { position: { decrement: 1 } },
    })
  }

  await client.ranking_memberships.delete({ where: { id: membership.id } })

  return { id: membership.id, ranking_id: membership.ranking_id }
}
