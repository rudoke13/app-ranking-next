"use client"

import { useEffect, useMemo, useState } from "react"

import SectionTitle from "@/components/app/SectionTitle"
import UserAvatar from "@/components/app/UserAvatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { apiGet } from "@/lib/http"

type RankingSummary = {
  players: number
  shouldBeBluePoint: number
  currentBluePoint: number
  challengedInMonth: number
}

type MonthItem = {
  value: string
  label: string
}

type PlayerMonthHistory = {
  month: MonthItem
  challengedCount: number
  totalMatches: number
  wasBluePoint: boolean
}

type BluePointPlayer = {
  userId: number
  name: string
  avatarUrl: string | null
  position: number
  challengedCountInMonth: number
  totalMatchesInMonth: number
  recentChallengeCount: number
  recentChallengeMonths: MonthItem[]
  lastUnusedBluePointMonth: MonthItem | null
  shouldBeBluePoint: boolean
  currentBluePoint: boolean
  locked: boolean
  hasChallengeInMonth: boolean
  challengedConsecutive: boolean
  reason:
    | "consecutive_challenges"
    | "no_reachable_opponent"
    | "unused_previous_blue_point"
    | null
  isSuspended: boolean
  isAccessChallenge: boolean
  monthHistory: PlayerMonthHistory[]
}

type BluePointRanking = {
  id: number
  name: string
  slug: string
  description: string | null
  referenceMonth: MonthItem
  historyMonths: MonthItem[]
  recentWindowMonths: MonthItem[]
  summary: RankingSummary
  players: BluePointPlayer[]
}

type BluePointHistoryData = {
  threshold: number
  rankings: BluePointRanking[]
  generatedAt: string
}

const summaryCardClassName =
  "rounded-lg border bg-muted/30 p-4 shadow-none"

const reasonLabel = (
  player: BluePointPlayer,
  threshold: number
) => {
  if (player.position === 1) {
    return "O numero 1 da categoria nunca entra como ponto azul."
  }

  if (player.reason === "consecutive_challenges") {
    return `Vai virar ponto azul porque foi desafiado em ${threshold} meses seguidos.`
  }

  if (player.reason === "no_reachable_opponent") {
    return "Vai virar ponto azul porque nao tem adversario valido disponivel."
  }

  if (player.reason === "unused_previous_blue_point") {
    if (player.lastUnusedBluePointMonth) {
      return `Nao vai ser ponto azul porque teve o beneficio em ${player.lastUnusedBluePointMonth.label} e nao usou. A regra reiniciou a partir desse mes.`
    }
    return "Nao vai ser ponto azul porque teve o beneficio e nao usou. A regra reiniciou."
  }

  return "Ainda nao atende a regra atual do ponto azul."
}

export default function BluePointHistoryPage() {
  const [data, setData] = useState<BluePointHistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rankingFilter, setRankingFilter] = useState("all")

  const loadData = async () => {
    setLoading(true)
    setError(null)

    const response = await apiGet<BluePointHistoryData>(
      "/api/admin/blue-point-history"
    )

    if (!response.ok) {
      setError(response.message)
      setLoading(false)
      return
    }

    setData(response.data)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const visibleRankings = useMemo(() => {
    if (!data) return []
    if (rankingFilter === "all") return data.rankings
    return data.rankings.filter((ranking) => String(ranking.id) === rankingFilter)
  }, [data, rankingFilter])

  const globalSummary = useMemo(() => {
    return visibleRankings.reduce(
      (accumulator, ranking) => ({
        rankings: accumulator.rankings + 1,
        players: accumulator.players + ranking.summary.players,
        shouldBeBluePoint:
          accumulator.shouldBeBluePoint + ranking.summary.shouldBeBluePoint,
        currentBluePoint:
          accumulator.currentBluePoint + ranking.summary.currentBluePoint,
      }),
      {
        rankings: 0,
        players: 0,
        shouldBeBluePoint: 0,
        currentBluePoint: 0,
      }
    )
  }, [visibleRankings])

  const threshold = data?.threshold ?? 2

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Historico de ponto azul"
        subtitle="Painel administrativo com a regra atual do app por categoria"
        action={
          <Button onClick={loadData} variant="outline" disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros e regra</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Categoria</p>
            <Select value={rankingFilter} onValueChange={setRankingFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {data?.rankings.map((ranking) => (
                  <SelectItem key={ranking.id} value={String(ranking.id)}>
                    {ranking.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Regra usada nesta tela</p>
            <p className="mt-1">
              O jogador fica ponto azul quando eh desafiado em{" "}
              <span className="font-semibold text-foreground">
                {threshold} meses seguidos
              </span>{" "}
              nos meses anteriores validos da categoria
              {" "}
              ou quando fica{" "}
              <span className="font-semibold text-foreground">
                sem adversario valido
              </span>{" "}
              para desafiar no periodo aberto. Se ele ganhar o beneficio e nao usar
              no mes seguinte, a contagem zera e ele precisa recomecar a sequencia.
              O numero 1 nunca entra nessa regra.
            </p>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={`blue-point-summary-${index}`} className="h-28" />
            ))}
          </div>
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={`blue-point-list-${index}`} className="h-72" />
            ))}
          </div>
        </>
      ) : error ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className={summaryCardClassName}>
              <CardContent className="space-y-2 p-0">
                <p className="text-sm text-muted-foreground">Categorias</p>
                <p className="text-3xl font-semibold text-foreground">
                  {globalSummary.rankings}
                </p>
              </CardContent>
            </Card>
            <Card className={summaryCardClassName}>
              <CardContent className="space-y-2 p-0">
                <p className="text-sm text-muted-foreground">Jogadores</p>
                <p className="text-3xl font-semibold text-foreground">
                  {globalSummary.players}
                </p>
              </CardContent>
            </Card>
            <Card className={summaryCardClassName}>
              <CardContent className="space-y-2 p-0">
                <p className="text-sm text-muted-foreground">
                  Vao virar ponto azul
                </p>
                <p className="text-3xl font-semibold text-sky-600">
                  {globalSummary.shouldBeBluePoint}
                </p>
              </CardContent>
            </Card>
            <Card className={summaryCardClassName}>
              <CardContent className="space-y-2 p-0">
                <p className="text-sm text-muted-foreground">
                  Ja marcados no ranking
                </p>
                <p className="text-3xl font-semibold text-emerald-600">
                  {globalSummary.currentBluePoint}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {visibleRankings.map((ranking) => (
              <Card key={ranking.id}>
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle className="text-base">{ranking.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {ranking.description ?? "Categoria sem descricao"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        Rodada aberta: {ranking.referenceMonth.label}
                      </Badge>
                      <Badge variant="secondary">
                        {ranking.summary.players} jogadores
                      </Badge>
                      <Badge className="border-sky-200 bg-sky-50 text-sky-700">
                        {ranking.summary.shouldBeBluePoint} pela regra
                      </Badge>
                      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        {ranking.summary.currentBluePoint} marcados
                      </Badge>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {ranking.historyMonths.map((month) => (
                      <Badge
                        key={`${ranking.id}-history-${month.value}`}
                        variant="outline"
                        className="bg-transparent"
                      >
                        Conferencia: {month.label}
                      </Badge>
                    ))}
                    {ranking.recentWindowMonths.length ? (
                      ranking.recentWindowMonths.map((month) => (
                        <Badge
                          key={`${ranking.id}-${month.value}`}
                          variant="outline"
                          className="bg-transparent"
                        >
                          Mes de referencia: {month.label}
                        </Badge>
                      ))
                    ) : null}
                    {ranking.recentWindowMonths.length < threshold ? (
                      <Badge variant="outline" className="bg-transparent">
                        Ainda nao ha meses anteriores suficientes para a regra sequencial.
                      </Badge>
                    ) : null}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {ranking.players.length ? (
                    ranking.players.map((player) => (
                      <div
                        key={`${ranking.id}-${player.userId}`}
                        className="rounded-xl border bg-muted/20 p-4"
                      >
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="flex min-w-0 gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                              #{player.position}
                            </div>
                            <UserAvatar
                              name={player.name}
                              src={player.avatarUrl}
                              size={44}
                              sizes="44px"
                              className="shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {player.name}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Badge
                                  className={
                                    player.shouldBeBluePoint
                                      ? "border-sky-200 bg-sky-50 text-sky-700"
                                      : "border-slate-200 bg-slate-50 text-slate-700"
                                  }
                                >
                                  {player.shouldBeBluePoint
                                    ? "Vai ser ponto azul"
                                    : "Nao vai ser ponto azul"}
                                </Badge>
                                {player.position === 1 ? (
                                  <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700">
                                    Lider nunca entra
                                  </Badge>
                                ) : null}
                                <Badge
                                  className={
                                    player.currentBluePoint
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : "border-slate-200 bg-slate-50 text-slate-700"
                                  }
                                >
                                  {player.currentBluePoint
                                    ? "Ja marcado no ranking"
                                    : "Ainda nao marcado"}
                                </Badge>
                                {player.locked ? (
                                  <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                                    Sem alvo valido
                                  </Badge>
                                ) : null}
                                {player.challengedConsecutive ? (
                                  <Badge className="border-sky-200 bg-sky-50 text-sky-700">
                                    Meses seguidos desafiado
                                  </Badge>
                                ) : null}
                                {player.reason === "unused_previous_blue_point" ? (
                                  <Badge className="border-rose-200 bg-rose-50 text-rose-700">
                                    Regra reiniciada
                                  </Badge>
                                ) : null}
                                {player.isAccessChallenge ? (
                                  <Badge variant="outline">Desafio de acesso</Badge>
                                ) : null}
                                {player.isSuspended ? (
                                  <Badge variant="destructive">Suspenso</Badge>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-3">
                            <div className="rounded-lg border bg-background p-3">
                              <p className="text-xs text-muted-foreground">
                                Foi desafiado no mes
                              </p>
                              <p className="text-lg font-semibold text-foreground">
                                {player.challengedCountInMonth}x
                              </p>
                            </div>
                            <div className="rounded-lg border bg-background p-3">
                              <p className="text-xs text-muted-foreground">
                                Jogos no mes
                              </p>
                              <p className="text-lg font-semibold text-foreground">
                                {player.totalMatchesInMonth}
                              </p>
                            </div>
                            <div className="rounded-lg border bg-background p-3">
                              <p className="text-xs text-muted-foreground">
                                Meses seguidos
                              </p>
                              <p className="text-lg font-semibold text-foreground">
                                {player.recentChallengeCount}/{threshold}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          <p className="text-xs text-muted-foreground">
                            {reasonLabel(player, threshold)}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {player.recentChallengeMonths.length ? (
                              player.recentChallengeMonths.map((month) => (
                                <Badge
                                  key={`${player.userId}-${month.value}`}
                                  variant="outline"
                                  className="bg-transparent"
                                >
                                  Desafiado em {month.label}
                                </Badge>
                              ))
                            ) : (
                              <Badge variant="outline" className="bg-transparent">
                                Sem desafios recebidos na janela atual
                              </Badge>
                            )}
                            {player.lastUnusedBluePointMonth ? (
                              <Badge variant="outline" className="bg-transparent">
                                Beneficio nao usado em {player.lastUnusedBluePointMonth.label}
                              </Badge>
                            ) : null}
                            {!player.hasChallengeInMonth ? (
                              <Badge variant="outline" className="bg-transparent">
                                Ainda sem desafio no mes atual
                              </Badge>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                          {player.monthHistory.map((history) => (
                            <div
                              key={`${player.userId}-${history.month.value}`}
                              className="rounded-lg border bg-background p-3"
                            >
                              <p className="text-xs font-medium text-foreground">
                                {history.month.label}
                              </p>
                              <p className="mt-2 text-xs text-muted-foreground">
                                Desafiado: {history.challengedCount}x
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Jogos: {history.totalMatches}
                              </p>
                              <Badge
                                className={
                                  history.wasBluePoint
                                    ? "mt-2 border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "mt-2 border-slate-200 bg-slate-50 text-slate-700"
                                }
                              >
                                {history.wasBluePoint
                                  ? "Foi ponto azul"
                                  : "Nao foi ponto azul"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhum jogador encontrado nesta categoria.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
