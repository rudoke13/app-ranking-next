"use client"

import { useEffect, useRef, useState } from "react"

import StatPill, { type StatPillTone } from "@/components/app/StatPill"
import UserAvatar from "@/components/app/UserAvatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiGet } from "@/lib/http"

type RankingSummary = {
  id: number
  name: string
  position: number | null
}

type ChallengeHistoryItem = {
  id: number
  status: "scheduled" | "accepted" | "declined" | "completed" | "cancelled"
  winner: "challenger" | "challenged" | null
  scheduledFor: string
  playedAt: string | null
  challengerGames: number | null
  challengedGames: number | null
  challengerWalkover: boolean
  challengedWalkover: boolean
  challengerRetired: boolean
  challengedRetired: boolean
  challenger: {
    id: number
    name: string
    avatarUrl: string | null
  }
  challenged: {
    id: number
    name: string
    avatarUrl: string | null
  }
}

type PlayerHistoryMonth = {
  month: { value: string; label: string }
  wasBluePoint: boolean
  stats: {
    total: number
    wins: number
    losses: number
    pending: number
  }
  items: ChallengeHistoryItem[]
}

type WalkoverPenaltyMonth = {
  month: { value: string; label: string }
  tookWalkover: boolean
  walkoverCount: number
  streak: number
  penaltyForNextRound: boolean
}

type PlayerHistoryResponse = {
  player: {
    userId: number
    name: string
    avatarUrl: string | null
  }
  walkoverPenalty: {
    triggerStreak: number
    penaltyPositions: number
    currentStreak: number
    months: WalkoverPenaltyMonth[]
  }
  months: PlayerHistoryMonth[]
}

type ProfileHistoryTabsProps = {
  userId: number
  rankings: RankingSummary[]
}

const statusTone = {
  scheduled: "warning",
  accepted: "success",
  declined: "danger",
  completed: "success",
  cancelled: "neutral",
} as const

const statusLabelMap: Record<ChallengeHistoryItem["status"], string> = {
  scheduled: "Pendente",
  accepted: "Aceito",
  declined: "Recusado",
  completed: "Concluido",
  cancelled: "Cancelado",
}

const formatChallengeDateTime = (value?: string | null) => {
  if (!value) return "Sem data"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Sem data"
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed)
}

const getChallengeScoreLabel = (challenge: ChallengeHistoryItem) => {
  if (challenge.challengerWalkover) return "W.O. (desafiante)"
  if (challenge.challengedWalkover) return "W.O. (desafiado)"
  if (challenge.challengerRetired) return "Desistencia (desafiante)"
  if (challenge.challengedRetired) return "Desistencia (desafiado)"
  if (
    challenge.challengerGames === null ||
    challenge.challengedGames === null
  ) {
    return "-"
  }
  return `${challenge.challengerGames}/${challenge.challengedGames}`
}

const getPlayerChallengeTone = (
  challenge: ChallengeHistoryItem,
  playerId: number
): StatPillTone => {
  if (challenge.status === "completed") {
    if (
      (challenge.winner === "challenger" && challenge.challenger.id === playerId) ||
      (challenge.winner === "challenged" && challenge.challenged.id === playerId)
    ) {
      return "success"
    }
    if (challenge.winner) return "danger"
  }
  return statusTone[challenge.status]
}

const getPlayerChallengeLabel = (
  challenge: ChallengeHistoryItem,
  playerId: number
) => {
  if (challenge.status === "completed") {
    if (
      (challenge.winner === "challenger" && challenge.challenger.id === playerId) ||
      (challenge.winner === "challenged" && challenge.challenged.id === playerId)
    ) {
      return "Vitoria"
    }
    if (challenge.winner) return "Derrota"
    return "Concluido"
  }
  return statusLabelMap[challenge.status]
}

const emptyHistoryState = (message: string | null = null) => ({
  loading: false,
  error: message,
  data: null as PlayerHistoryResponse | null,
})

export default function ProfileHistoryTabs({
  userId,
  rankings,
}: ProfileHistoryTabsProps) {
  const [activeTab, setActiveTab] = useState(String(rankings[0]?.id ?? ""))
  const requestedHistoryKeysRef = useRef(new Set<string>())
  const [historyByRanking, setHistoryByRanking] = useState<
    Record<number, ReturnType<typeof emptyHistoryState> & { loading: boolean }>
  >({})

  useEffect(() => {
    if (!rankings.length) return
    const exists = rankings.some((ranking) => String(ranking.id) === activeTab)
    if (!exists) {
      setActiveTab(String(rankings[0].id))
    }
  }, [activeTab, rankings])

  useEffect(() => {
    const rankingId = Number(activeTab)
    if (!rankingId) return
    const requestKey = `${userId}:${rankingId}`
    if (requestedHistoryKeysRef.current.has(requestKey)) {
      return
    }
    requestedHistoryKeysRef.current.add(requestKey)

    let cancelled = false
    setHistoryByRanking((current) => ({
      ...current,
      [rankingId]: { loading: true, error: null, data: null },
    }))

    apiGet<PlayerHistoryResponse>(`/api/rankings/${rankingId}/players/${userId}/history`)
      .then((response) => {
        if (cancelled) return
        setHistoryByRanking((current) => ({
          ...current,
          [rankingId]: response.ok
            ? { loading: false, error: null, data: response.data }
            : emptyHistoryState(
                response.message ?? "Nao foi possivel carregar seu historico."
              ),
        }))
      })
      .catch(() => {
        if (cancelled) return
        setHistoryByRanking((current) => ({
          ...current,
          [rankingId]: emptyHistoryState("Nao foi possivel carregar seu historico."),
        }))
      })

    return () => {
      cancelled = true
    }
  }, [activeTab, userId])

  if (!rankings.length) {
    return null
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>Meu historico nas categorias</CardTitle>
        <p className="text-sm text-muted-foreground">
          Acompanhe seus confrontos, ponto azul e a regra automatica de W.O. por
          categoria.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="h-auto w-full flex-wrap justify-start">
            {rankings.map((ranking) => (
              <TabsTrigger
                key={ranking.id}
                value={String(ranking.id)}
                className="flex-none"
              >
                {ranking.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {rankings.map((ranking) => {
            const state = historyByRanking[ranking.id]
            const data = state?.data ?? null
            const latestWalkoverMonth = data?.walkoverPenalty.months[0] ?? null

            return (
              <TabsContent
                key={ranking.id}
                value={String(ranking.id)}
                className="space-y-4"
              >
                {state?.loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-36 w-full" />
                    <Skeleton className="h-40 w-full" />
                  </div>
                ) : state?.error ? (
                  <p className="text-sm text-destructive">{state.error}</p>
                ) : data ? (
                  <>
                    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                      <UserAvatar
                        name={data.player.name}
                        src={data.player.avatarUrl}
                        size={40}
                        sizes="40px"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {data.player.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ranking.name} · Posicao atual:{" "}
                          {ranking.position ? `#${ranking.position}` : "-"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatPill
                          label={`Sequencia de W.O.: ${data.walkoverPenalty.currentStreak}/${data.walkoverPenalty.triggerStreak}`}
                          tone={
                            data.walkoverPenalty.currentStreak > 0
                              ? "warning"
                              : "neutral"
                          }
                        />
                        <StatPill
                          label={`Penalidade: ${data.walkoverPenalty.penaltyPositions} posicoes`}
                          tone="danger"
                        />
                        <StatPill
                          label={
                            latestWalkoverMonth?.penaltyForNextRound
                              ? "Perde 10 posicoes na proxima rodada"
                              : latestWalkoverMonth?.tookWalkover
                              ? "Tomou W.O. no mes atual"
                              : "Sem W.O. no mes atual"
                          }
                          tone={
                            latestWalkoverMonth?.penaltyForNextRound
                              ? "danger"
                              : latestWalkoverMonth?.tookWalkover
                              ? "warning"
                              : "neutral"
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Regra de W.O.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Se voce tomar W.O. em 2 rodadas seguidas, perde 10
                          posicoes para a rodada seguinte.
                        </p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {data.walkoverPenalty.months.map((month) => (
                          <Card key={`${ranking.id}-${month.month.value}`} className="gap-3 py-4 shadow-none">
                            <CardHeader className="space-y-2 px-4 pb-0">
                              <CardTitle className="text-sm">
                                {month.month.label}
                              </CardTitle>
                              <div className="flex flex-wrap gap-2">
                                <StatPill
                                  label={
                                    month.tookWalkover
                                      ? `${month.walkoverCount} W.O. sofrido${month.walkoverCount > 1 ? "s" : ""}`
                                      : "Sem W.O."
                                  }
                                  tone={month.tookWalkover ? "warning" : "neutral"}
                                  className="text-xs"
                                />
                                <StatPill
                                  label={`Sequencia ${month.streak}/${data.walkoverPenalty.triggerStreak}`}
                                  tone={month.streak > 0 ? "warning" : "neutral"}
                                  className="text-xs"
                                />
                                <StatPill
                                  label={
                                    month.penaltyForNextRound
                                      ? "Gera perda de 10 posicoes"
                                      : "Sem penalidade"
                                  }
                                  tone={
                                    month.penaltyForNextRound ? "danger" : "neutral"
                                  }
                                  className="text-xs"
                                />
                              </div>
                            </CardHeader>
                          </Card>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Historico de confrontos
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Ultimos meses desta categoria, com ponto azul e status
                          de cada jogo.
                        </p>
                      </div>

                      {data.months.map((monthBlock) => (
                        <Card key={`${ranking.id}-${monthBlock.month.value}`} className="shadow-none">
                          <CardHeader className="space-y-3 pb-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <CardTitle className="text-sm">
                                {monthBlock.month.label}
                              </CardTitle>
                              <div className="flex flex-wrap gap-2">
                                <StatPill
                                  label={
                                    monthBlock.wasBluePoint
                                      ? "Foi ponto azul"
                                      : "Nao foi ponto azul"
                                  }
                                  tone={
                                    monthBlock.wasBluePoint ? "info" : "neutral"
                                  }
                                  className="text-xs"
                                />
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <StatPill
                                label={`${monthBlock.stats.total} jogos`}
                                tone="neutral"
                                className="text-xs"
                              />
                              <StatPill
                                label={`${monthBlock.stats.wins} vitorias`}
                                tone="success"
                                className="text-xs"
                              />
                              <StatPill
                                label={`${monthBlock.stats.losses} derrotas`}
                                tone="danger"
                                className="text-xs"
                              />
                              <StatPill
                                label={`${monthBlock.stats.pending} pendentes`}
                                tone="warning"
                                className="text-xs"
                              />
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {monthBlock.items.length ? (
                              <div className="space-y-2">
                                {monthBlock.items.map((challenge) => {
                                  const selectedIsChallenger =
                                    challenge.challenger.id === data.player.userId
                                  const opponent = selectedIsChallenger
                                    ? challenge.challenged
                                    : challenge.challenger
                                  const challengeDate =
                                    challenge.playedAt ?? challenge.scheduledFor

                                  return (
                                    <div
                                      key={`${ranking.id}-${monthBlock.month.value}-${challenge.id}`}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">
                                          {selectedIsChallenger
                                            ? "vs "
                                            : "Desafiado por "}
                                          {opponent.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {getChallengeScoreLabel(challenge)} ·{" "}
                                          {formatChallengeDateTime(challengeDate)}
                                        </p>
                                      </div>
                                      <StatPill
                                        label={getPlayerChallengeLabel(
                                          challenge,
                                          data.player.userId
                                        )}
                                        tone={getPlayerChallengeTone(
                                          challenge,
                                          data.player.userId
                                        )}
                                        className="text-xs"
                                      />
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Sem confrontos neste mes.
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sem dados de historico para esta categoria.
                  </p>
                )}
              </TabsContent>
            )
          })}
        </Tabs>
      </CardContent>
    </Card>
  )
}
