"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  CalendarDays,
  CircleCheck,
  Sparkles,
  Swords,
  Trophy,
} from "lucide-react"

import EmptyState from "@/components/app/EmptyState"
import SectionTitle from "@/components/app/SectionTitle"
import StatPill from "@/components/app/StatPill"
import UserAvatar from "@/components/app/UserAvatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { apiGet } from "@/lib/http"
import { formatDateInAppTz, formatMonthYearInAppTz } from "@/lib/timezone-client"

const statusTone = {
  scheduled: "warning",
  accepted: "success",
  declined: "danger",
  completed: "success",
  cancelled: "neutral",
} as const

const statusLabel = {
  scheduled: "Pendente",
  accepted: "Aceito",
  declined: "Recusado",
  completed: "Confirmado",
  cancelled: "Cancelado",
} as const

const resultTone = {
  win: "success",
  loss: "danger",
  pending: "neutral",
} as const

type DashboardData = {
  viewerId: number
  defaultRanking: {
    id: number
    name: string
    slug: string
    position: number | null
  } | null
  round: {
    id: number
    title: string
    referenceMonth: string
    rankingName: string
    bluePointOpensAt: string
    openChallengesAt: string
    matchesDeadline: string
    status: string
  } | null
  stats: {
    activePlayers: number
    bluePoints: number
    challengeMonthCount: number
    pendingMonthCount: number
    myPendingCount: number
    myPosition: number | null
  }
  licensePlayers: {
    id: number
    name: string
    avatarUrl: string | null
  }[]
  inactivePlayers: {
    id: number
    name: string
    avatarUrl: string | null
  }[]
  received: {
    id: number
    status: keyof typeof statusLabel
    scheduledFor: string
    opponent: string
  }[]
  myChallenges: {
    id: number
    status: keyof typeof statusLabel
    scheduledFor: string
    ranking: string
    isChallenger: boolean
    challenger: { id: number; name: string; avatarUrl: string | null }
    challenged: { id: number; name: string; avatarUrl: string | null }
  }[]
  recentResults: {
    id: number
    winner: "challenger" | "challenged" | null
    result: "win" | "loss" | "pending"
    playedAt: string | null
    challenger: { id: number; name: string }
    challenged: { id: number; name: string }
    score: {
      challengerGames: number | null
      challengedGames: number | null
      challengerTiebreak: number | null
      challengedTiebreak: number | null
      challengerWalkover: boolean
      challengedWalkover: boolean
    }
  }[]
}

const formatDate = (value: string | null) => {
  return formatDateInAppTz(value)
}

const formatScore = (score: DashboardData["recentResults"][number]["score"]) => {
  if (score.challengerWalkover || score.challengedWalkover) return "W.O."
  if (score.challengerGames === null || score.challengedGames === null) return "-"
  let base = `${score.challengerGames}/${score.challengedGames}`
  if (score.challengerTiebreak !== null && score.challengedTiebreak !== null) {
    base = `${base} (${score.challengerTiebreak}/${score.challengedTiebreak})`
  }
  return base
}

export type DashboardCardsProps = {
  isAdmin?: boolean
}

export default function DashboardCards({ isAdmin = false }: DashboardCardsProps) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const loadDashboard = async () => {
      setLoading(true)
      const response = await apiGet<DashboardData>("/api/dashboard")
      if (!mounted) return

      if (!response.ok) {
        setError(response.message)
        setLoading(false)
        return
      }

      setData(response.data)
      setLoading(false)
    }

    loadDashboard()

    return () => {
      mounted = false
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <EmptyState
        title="Nao foi possivel carregar o dashboard"
        description={error ?? "Tente novamente em alguns instantes."}
      />
    )
  }

  const monthLabel = data.round
    ? formatMonthYearInAppTz(data.round.referenceMonth, "Rodada")
    : "Rodada"

  return (
    <div className="space-y-8">
      <SectionTitle
        title="Dashboard"
        subtitle="Resumo do ranking neste mes"
        action={
          isAdmin ? (
            <Button
              asChild
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              <Link href="/ranking">
                <Swords className="size-4" />
                Desafiar
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Card className="border-primary/20 bg-primary/10">
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="size-4" />
            <span className="text-sm font-semibold">Bem-vindo de volta!</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {data.stats.myPendingCount > 0
              ? `Voce tem ${data.stats.myPendingCount} desafios pendentes nesta rodada.`
              : "Sem desafios pendentes nesta rodada."}
          </p>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Rodada do mes</CardTitle>
              <CardDescription>{monthLabel}</CardDescription>
            </div>
            <Badge variant="secondary" className="gap-1">
              <CalendarDays className="size-3" />
              {data.round?.status === "open" ? "Em andamento" : "Fechada"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Jogadores ativos</p>
            <p className="text-2xl font-semibold">{data.stats.activePlayers}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatPill tone="info" label={`${data.stats.bluePoints} ponto azul`} />
            </div>
          </div>
          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Desafios do mes</p>
            <p className="text-2xl font-semibold">
              {data.stats.challengeMonthCount}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatPill
                tone="warning"
                label={`${data.stats.pendingMonthCount} pendentes no ranking`}
              />
              <StatPill
                tone="neutral"
                label={`${data.stats.myPendingCount} seus pendentes`}
              />
            </div>
          </div>
          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Sua posicao</p>
            <p className="text-2xl font-semibold">
              {data.stats.myPosition ? `#${data.stats.myPosition}` : "-"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatPill tone="neutral" label="Atualizado hoje" />
            </div>
          </div>
        </CardContent>
      </Card>

      <SectionTitle
        title="Jogadores em licenca"
        subtitle="Voltam em breve para o ranking"
      />
      <Card>
        <CardContent className="space-y-3">
          {data.licensePlayers.length ? (
            data.licensePlayers.map((player) => (
              <div
                key={player.id}
                className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar name={player.name} src={player.avatarUrl} size={36} />
                  <div>
                    <p className="font-semibold text-foreground">{player.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Licenca ativa nesta rodada
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">Licenca</Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum jogador em licenca nesta rodada.
            </p>
          )}
        </CardContent>
      </Card>

      <SectionTitle
        title="Jogadores inativos"
        subtitle="Fora do ranking nesta rodada"
      />
      <Card>
        <CardContent className="space-y-3">
          {data.inactivePlayers.length ? (
            data.inactivePlayers.map((player) => (
              <div
                key={player.id}
                className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar name={player.name} src={player.avatarUrl} size={36} />
                  <div>
                    <p className="font-semibold text-foreground">{player.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Inativo nesta rodada
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">Inativo</Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum jogador inativo nesta rodada.
            </p>
          )}
        </CardContent>
      </Card>

      <SectionTitle
        title="Historico de desafios recebidos"
        subtitle="Ultimos convites recebidos"
      />
      {data.received.length ? (
        <div className="grid gap-4 md:grid-cols-3">
          {data.received.map((challenge) => (
            <Card key={challenge.id} className="shadow-none">
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">
                    {challenge.opponent}
                  </p>
                  <StatPill
                    tone={statusTone[challenge.status]}
                    label={statusLabel[challenge.status]}
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="size-3" />
                  {formatDate(challenge.scheduledFor)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Sem desafios recebidos"
          description="Voce ainda nao recebeu convites nesta rodada."
        />
      )}

      <SectionTitle
        title="Meus desafios"
        subtitle="Atualize os resultados das partidas"
      />
      {data.myChallenges.length ? (
        <div className="space-y-3">
          {data.myChallenges.map((challenge) => {
            const opponent = challenge.isChallenger
              ? challenge.challenged
              : challenge.challenger

            return (
              <Card key={challenge.id} className="shadow-none">
                <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={opponent.name}
                      src={opponent.avatarUrl}
                      size={40}
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {opponent.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">{challenge.ranking}</Badge>
                        <span>{formatDate(challenge.scheduledFor)}</span>
                        <StatPill
                          tone={statusTone[challenge.status]}
                          label={statusLabel[challenge.status]}
                        />
                      </div>
                    </div>
                  </div>
                  <Button asChild variant="outline" className="w-full sm:w-auto">
                    <Link href="/desafios">Atualizar</Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <EmptyState
          title="Sem desafios cadastrados"
          description="Inicie um desafio para movimentar o ranking."
        />
      )}

      <SectionTitle
        title="Resultados recentes"
        subtitle="Suas ultimas partidas confirmadas"
      />
      {data.recentResults.length ? (
        <div className="grid gap-4 md:grid-cols-3">
          {data.recentResults.map((result) => (
            <Card key={result.id} className="shadow-none">
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Trophy className="size-4 text-primary" />
                    {result.challenger.name} x {result.challenged.name}
                  </div>
                  <StatPill
                    tone={resultTone[result.result]}
                    label={
                      result.result === "win"
                        ? "Vitoria"
                        : result.result === "loss"
                        ? "Derrota"
                        : "Pendente"
                    }
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatScore(result.score)}</span>
                  <div className="flex items-center gap-1">
                    <CircleCheck className="size-3 text-success" />
                    {formatDate(result.playedAt)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Sem resultados recentes"
          description="Quando um desafio for concluido ele aparecera aqui."
        />
      )}
    </div>
  )
}
