"use client"

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
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
import { apiGet, apiPatch, apiPost } from "@/lib/http"
import { prefetchApiGet } from "@/lib/http-prefetch"
import {
  formatDateTimeInAppTz,
  formatMonthYearInAppTz,
  toDateTimeInputInAppTz,
} from "@/lib/timezone-client"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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

const monthKeyFromValue = (value: string | null) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

type DashboardData = {
  viewerId: number
  isAdmin: boolean
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

const EMPTY_LICENSE_PLAYERS: DashboardData["licensePlayers"] = []
const EMPTY_INACTIVE_PLAYERS: DashboardData["inactivePlayers"] = []
const EMPTY_RECEIVED_CHALLENGES: DashboardData["received"] = []
const EMPTY_MY_CHALLENGES: DashboardData["myChallenges"] = []
const EMPTY_RECENT_RESULTS: DashboardData["recentResults"] = []

const DASHBOARD_CACHE_TTL_MS = 30_000

type DashboardCacheEntry = {
  data: DashboardData
  cachedAt: number
}

type DashboardFetchResult = {
  data: DashboardData | null
  error: string | null
}

let dashboardCache: DashboardCacheEntry | null = null
let dashboardInFlight: Promise<DashboardFetchResult> | null = null

const formatDate = (value: string | null) => {
  return formatDateTimeInAppTz(value, { second: "2-digit" })
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

export default function DashboardCards() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultOpenId, setResultOpenId] = useState<number | null>(null)
  const [resultType, setResultType] = useState("score")
  const [resultPlayedAt, setResultPlayedAt] = useState("")
  const [resultChallengerGames, setResultChallengerGames] = useState("")
  const [resultChallengedGames, setResultChallengedGames] = useState("")
  const [resultChallengerTiebreak, setResultChallengerTiebreak] = useState("")
  const [resultChallengedTiebreak, setResultChallengedTiebreak] = useState("")
  const [resultError, setResultError] = useState<string | null>(null)
  const [resultLoading, setResultLoading] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const deferredLicensePlayers = useDeferredValue(
    data?.licensePlayers ?? EMPTY_LICENSE_PLAYERS
  )
  const deferredInactivePlayers = useDeferredValue(
    data?.inactivePlayers ?? EMPTY_INACTIVE_PLAYERS
  )
  const deferredReceivedChallenges = useDeferredValue(
    data?.received ?? EMPTY_RECEIVED_CHALLENGES
  )
  const deferredMyChallenges = useDeferredValue(
    data?.myChallenges ?? EMPTY_MY_CHALLENGES
  )
  const deferredRecentResults = useDeferredValue(
    data?.recentResults ?? EMPTY_RECENT_RESULTS
  )

  const loadDashboard = useCallback(
    async (options?: { preserveUi?: boolean; fresh?: boolean }) => {
      const preserveUi = options?.preserveUi ?? false
      const fresh = options?.fresh ?? false
      const finish = () => {
        if (!mountedRef.current) return
        if (preserveUi) {
          setRefreshing(false)
        } else {
          setLoading(false)
        }
      }

      if (preserveUi) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      const now = Date.now()
      if (
        !fresh &&
        dashboardCache &&
        now - dashboardCache.cachedAt <= DASHBOARD_CACHE_TTL_MS
      ) {
        if (mountedRef.current) {
          setError(null)
          setData(dashboardCache.data)
        }
        finish()
        return
      }

      const pending =
        !fresh && dashboardInFlight
          ? dashboardInFlight
          : apiGet<DashboardData>("/api/dashboard", {
              cacheTtlMs: DASHBOARD_CACHE_TTL_MS,
              fresh,
            }).then((response): DashboardFetchResult =>
              response.ok
                ? { data: response.data, error: null }
                : { data: null, error: response.message }
            )

      if (!fresh && !dashboardInFlight) {
        dashboardInFlight = pending
      }

      const result = await pending
      if (!fresh && dashboardInFlight === pending) {
        dashboardInFlight = null
      }

      if (!mountedRef.current) return

      if (!result.data) {
        setError(result.error ?? "Erro ao carregar dados.")
        finish()
        return
      }

      dashboardCache = {
        data: result.data,
        cachedAt: Date.now(),
      }
      setError(null)
      setData(result.data)
      finish()
    },
    []
  )

  useEffect(() => {
    mountedRef.current = true
    void loadDashboard()
    return () => {
      mountedRef.current = false
    }
  }, [loadDashboard])

  const monthLabel = useMemo(
    () =>
      data?.round
        ? formatMonthYearInAppTz(data.round.referenceMonth, "Rodada")
        : "Rodada",
    [data]
  )
  const currentRoundKey = useMemo(
    () => (data?.round ? monthKeyFromValue(data.round.referenceMonth) : null),
    [data]
  )
  const welcomeMessage = useMemo(() => {
    const pendingCount = data?.stats.myPendingCount ?? 0
    return pendingCount > 0
      ? `Voce tem ${pendingCount} desafios pendentes nesta rodada.`
      : "Sem desafios pendentes nesta rodada."
  }, [data?.stats.myPendingCount])
  const receivedChallenges = useMemo(() => {
    return deferredReceivedChallenges.map((challenge) => ({
      ...challenge,
      scheduledLabel: formatDate(challenge.scheduledFor),
    }))
  }, [deferredReceivedChallenges])
  const recentResults = useMemo(() => {
    return deferredRecentResults.map((result) => ({
      ...result,
      scoreLabel: formatScore(result.score),
      playedLabel: formatDate(result.playedAt),
    }))
  }, [deferredRecentResults])

  useEffect(() => {
    if (!data) return
    prefetchApiGet("/api/rankings", { minIntervalMs: 25_000 })
    prefetchApiGet("/api/challenges/months", { minIntervalMs: 25_000 })
    if (currentRoundKey) {
      prefetchApiGet(`/api/challenges?month=${currentRoundKey}&sort=recent`, {
        minIntervalMs: 25_000,
      })
    }
  }, [currentRoundKey, data])

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
  const isAdmin = data.isAdmin

  const openResultFor = (challenge: DashboardData["myChallenges"][number]) => {
    setResultOpenId(challenge.id)
    setResultType("score")
    setResultPlayedAt(toDateTimeInputInAppTz(challenge.scheduledFor))
    setResultChallengerGames("")
    setResultChallengedGames("")
    setResultChallengerTiebreak("")
    setResultChallengedTiebreak("")
    setResultError(null)
  }

  const handleSaveSchedule = async (challengeId: number) => {
    if (!resultPlayedAt) {
      setResultError("Informe a data do jogo.")
      return
    }
    setResultLoading("schedule")
    setResultError(null)

    const response = await apiPatch(`/api/challenges/${challengeId}`, {
      scheduled_for: resultPlayedAt,
    })

    if (!response.ok) {
      setResultError(response.message)
      setResultLoading(null)
      return
    }

    setResultLoading(null)
    setResultOpenId(null)
    loadDashboard({ preserveUi: true, fresh: true })
  }

  const handleSaveResult = async (challengeId: number) => {
    const playedAt = resultPlayedAt || undefined

    if (resultType === "score") {
      if (!resultChallengerGames.trim() || !resultChallengedGames.trim()) {
        setResultError("Informe o placar do resultado.")
        return
      }

      const challengerGames = Number(resultChallengerGames)
      const challengedGames = Number(resultChallengedGames)

      if (
        !Number.isInteger(challengerGames) ||
        !Number.isInteger(challengedGames) ||
        challengerGames < 0 ||
        challengedGames < 0
      ) {
        setResultError("Informe o placar do resultado.")
        return
      }

      if (challengerGames === challengedGames) {
        setResultError("O placar nao pode ser empate.")
        return
      }

      const challengerTiebreak = resultChallengerTiebreak.trim()
        ? Number(resultChallengerTiebreak)
        : null
      const challengedTiebreak = resultChallengedTiebreak.trim()
        ? Number(resultChallengedTiebreak)
        : null

      if (
        (challengerTiebreak !== null && challengedTiebreak === null) ||
        (challengerTiebreak === null && challengedTiebreak !== null)
      ) {
        setResultError("Informe o tiebreak para ambos os jogadores.")
        return
      }

      if (
        challengerTiebreak !== null &&
        challengedTiebreak !== null &&
        (!Number.isInteger(challengerTiebreak) ||
          !Number.isInteger(challengedTiebreak) ||
          challengerTiebreak < 0 ||
          challengedTiebreak < 0)
      ) {
        setResultError("Informe o tiebreak corretamente.")
        return
      }

      const winner =
        challengerGames > challengedGames ? "challenger" : "challenged"

      setResultLoading("result")
      const response = await apiPost(`/api/challenges/${challengeId}/result`, {
        winner,
        played_at: playedAt,
        challenger_games: challengerGames,
        challenged_games: challengedGames,
        challenger_tiebreak: challengerTiebreak,
        challenged_tiebreak: challengedTiebreak,
      })

      if (!response.ok) {
        setResultError(response.message)
        setResultLoading(null)
        return
      }

      setResultLoading(null)
      setResultOpenId(null)
      loadDashboard({ preserveUi: true, fresh: true })
      return
    }

    setResultLoading("result")
    const payload =
      resultType === "wo_challenger"
        ? {
            winner: "challenger",
            played_at: playedAt,
            challenged_walkover: true,
          }
        : resultType === "wo_challenged"
        ? {
            winner: "challenged",
            played_at: playedAt,
            challenger_walkover: true,
          }
        : {
            double_walkover: true,
            played_at: playedAt,
          }

    const response = await apiPost(
      `/api/challenges/${challengeId}/result`,
      payload
    )

    if (!response.ok) {
      setResultError(response.message)
      setResultLoading(null)
      return
    }

    setResultLoading(null)
    setResultOpenId(null)
    loadDashboard({ preserveUi: true, fresh: true })
  }

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
      {refreshing ? (
        <p className="text-xs text-muted-foreground">Atualizando dados...</p>
      ) : null}

      <Card className="border-primary/20 bg-primary/10">
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="size-4" />
            <span className="text-sm font-semibold">Bem-vindo de volta!</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {welcomeMessage}
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
          {deferredLicensePlayers.length ? (
            deferredLicensePlayers.map((player) => (
              <div
                key={player.id}
                className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between [content-visibility:auto] [contain-intrinsic-size:72px]"
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

      {isAdmin ? (
        <>
          <SectionTitle
            title="Jogadores inativos"
            subtitle="Fora do ranking nesta rodada"
          />
          <Card>
            <CardContent className="space-y-3">
              {deferredInactivePlayers.length ? (
                deferredInactivePlayers.map((player) => (
                  <div
                    key={player.id}
                    className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between [content-visibility:auto] [contain-intrinsic-size:72px]"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={player.name}
                        src={player.avatarUrl}
                        size={36}
                      />
                      <div>
                        <p className="font-semibold text-foreground">
                          {player.name}
                        </p>
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
        </>
      ) : null}

      <SectionTitle
        title="Historico de desafios recebidos"
        subtitle="Ultimos convites recebidos"
      />
      {receivedChallenges.length ? (
        <div className="grid gap-4 md:grid-cols-3">
          {receivedChallenges.map((challenge) => (
            <Card key={challenge.id} className="shadow-none">
              <CardContent className="space-y-3 [content-visibility:auto] [contain-intrinsic-size:108px]">
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
                  {challenge.scheduledLabel}
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
      {deferredMyChallenges.length ? (
        <div className="space-y-3">
          {deferredMyChallenges.map((challenge) => {
            const opponent = challenge.isChallenger
              ? challenge.challenged
              : challenge.challenger
            const isPending =
              challenge.status === "scheduled" || challenge.status === "accepted"
            const challengeKey = monthKeyFromValue(challenge.scheduledFor)
            const canUpdate =
              isPending &&
              (!currentRoundKey || challengeKey === currentRoundKey)
            const isOpen = resultOpenId === challenge.id

            return (
              <Card key={challenge.id} className="shadow-none">
                <CardContent className="space-y-4 [content-visibility:auto] [contain-intrinsic-size:136px]">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
                    {canUpdate ? (
                      <Button
                        variant="default"
                        className="w-full shadow-sm sm:w-auto"
                        onClick={() => openResultFor(challenge)}
                      >
                        Atualizar placar
                      </Button>
                    ) : null}
                  </div>

                  {isOpen ? (
                    <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
                      {resultError ? (
                        <p className="text-xs text-destructive">{resultError}</p>
                      ) : null}
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor={`dashboard-played-${challenge.id}`}>
                            Data do jogo
                          </Label>
                          <Input
                            id={`dashboard-played-${challenge.id}`}
                            type="datetime-local"
                            step="1"
                            value={resultPlayedAt}
                            onChange={(event) =>
                              setResultPlayedAt(event.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`dashboard-type-${challenge.id}`}>
                            Tipo de resultado
                          </Label>
                          <Select value={resultType} onValueChange={setResultType}>
                            <SelectTrigger id={`dashboard-type-${challenge.id}`}>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="score">Placar</SelectItem>
                              <SelectItem value="wo_challenger">
                                W.O. para o desafiante
                              </SelectItem>
                              <SelectItem value="wo_challenged">
                                W.O. para o desafiado
                              </SelectItem>
                              <SelectItem value="double_wo">W.O. duplo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {resultType === "score" ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label
                              htmlFor={`dashboard-score-challenger-${challenge.id}`}
                            >
                              Games do desafiante
                            </Label>
                            <Input
                              id={`dashboard-score-challenger-${challenge.id}`}
                              type="number"
                              min={0}
                              value={resultChallengerGames}
                              onChange={(event) =>
                                setResultChallengerGames(event.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label
                              htmlFor={`dashboard-score-challenged-${challenge.id}`}
                            >
                              Games do desafiado
                            </Label>
                            <Input
                              id={`dashboard-score-challenged-${challenge.id}`}
                              type="number"
                              min={0}
                              value={resultChallengedGames}
                              onChange={(event) =>
                                setResultChallengedGames(event.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label
                              htmlFor={`dashboard-tiebreak-challenger-${challenge.id}`}
                            >
                              Tiebreak do desafiante (opcional)
                            </Label>
                            <Input
                              id={`dashboard-tiebreak-challenger-${challenge.id}`}
                              type="number"
                              min={0}
                              value={resultChallengerTiebreak}
                              onChange={(event) =>
                                setResultChallengerTiebreak(event.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label
                              htmlFor={`dashboard-tiebreak-challenged-${challenge.id}`}
                            >
                              Tiebreak do desafiado (opcional)
                            </Label>
                            <Input
                              id={`dashboard-tiebreak-challenged-${challenge.id}`}
                              type="number"
                              min={0}
                              value={resultChallengedTiebreak}
                              onChange={(event) =>
                                setResultChallengedTiebreak(event.target.value)
                              }
                            />
                          </div>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveResult(challenge.id)}
                          disabled={resultLoading === "result"}
                        >
                          {resultLoading === "result"
                            ? "Salvando..."
                            : "Salvar resultado"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSaveSchedule(challenge.id)}
                          disabled={resultLoading === "schedule"}
                        >
                          {resultLoading === "schedule"
                            ? "Salvando..."
                            : "Salvar horario"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setResultOpenId(null)}
                          disabled={
                            resultLoading === "result" ||
                            resultLoading === "schedule"
                          }
                        >
                          Fechar
                        </Button>
                      </div>
                    </div>
                  ) : null}
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
      {recentResults.length ? (
        <div className="grid gap-4 md:grid-cols-3">
          {recentResults.map((result) => (
            <Card key={result.id} className="shadow-none">
              <CardContent className="space-y-3 [content-visibility:auto] [contain-intrinsic-size:108px]">
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
                  <span>{result.scoreLabel}</span>
                  <div className="flex items-center gap-1">
                    <CircleCheck className="size-3 text-success" />
                    {result.playedLabel}
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
