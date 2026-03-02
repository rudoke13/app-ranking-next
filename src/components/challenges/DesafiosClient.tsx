"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CircleX, Clock, Filter, Swords, Trophy } from "lucide-react"

import ChallengeCard, {
  type ChallengeItem,
} from "@/components/challenges/ChallengeCard"
import EmptyState from "@/components/app/EmptyState"
import SectionTitle from "@/components/app/SectionTitle"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { apiGet, apiPost } from "@/lib/http"
import { resolveChallengeWinner } from "@/lib/challenges/result"
import {
  formatMonthYearInAppTz,
  nowInAppTimeZone,
  toDateTimeInputInAppTz,
} from "@/lib/timezone-client"

type RankingItem = {
  id: number
  name: string
  slug: string
}

export type DesafiosClientProps = {
  isAdmin?: boolean
}

const monthValue = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

const monthLabel = (date: Date) => formatMonthYearInAppTz(date)

const monthDateFromValue = (value: string) => {
  const [yearRaw, monthRaw] = value.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return new Date(value)
  }
  return new Date(year, month - 1, 1)
}

const formatName = (
  first?: string | null,
  last?: string | null,
  nickname?: string | null
) => {
  const full = `${first ?? ""} ${last ?? ""}`.trim()
  const nick = (nickname ?? "").trim()
  if (!full && !nick) return "Jogador"
  if (nick && full) return `${full} \"${nick}\"`
  return nick || full
}

const statusOptions = [
  { value: "all", label: "Todos" },
  { value: "scheduled", label: "Pendentes" },
  { value: "accepted", label: "Aceitos" },
  { value: "declined", label: "Recusados" },
  { value: "completed", label: "Concluidos" },
  { value: "cancelled", label: "Cancelados" },
]

const sortOptions = [
  { value: "recent", label: "Mais recentes" },
  { value: "oldest", label: "Mais antigos" },
  { value: "pending_first", label: "Pendentes primeiro" },
  { value: "completed_first", label: "Concluidos primeiro" },
  { value: "played_recent", label: "Resultados recentes" },
  { value: "challenger", label: "Nome do desafiante" },
]

type RankingPlayer = {
  userId: number
  position: number
  firstName: string
  lastName: string
  nickname: string | null
  isSuspended: boolean
}

type RankingPlayersResponse = {
  players: RankingPlayer[]
  suspended: RankingPlayer[]
}

type MonthOption = {
  value: string
  label: string
}

export default function DesafiosClient({
  isAdmin = false,
}: DesafiosClientProps) {
  const [rankings, setRankings] = useState<RankingItem[]>([])
  const [rankingFilter, setRankingFilter] = useState("all")
  const [monthFilter, setMonthFilter] = useState(monthValue(nowInAppTimeZone()))
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortFilter, setSortFilter] = useState("recent")
  const [challenges, setChallenges] = useState<ChallengeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createRankingId, setCreateRankingId] = useState("")
  const [createChallengerId, setCreateChallengerId] = useState("")
  const [createChallengedId, setCreateChallengedId] = useState("")
  const [createScheduledFor, setCreateScheduledFor] = useState(
    toDateTimeInputInAppTz(nowInAppTimeZone())
  )
  const [createResultType, setCreateResultType] = useState("none")
  const [createChallengerGames, setCreateChallengerGames] = useState("")
  const [createChallengedGames, setCreateChallengedGames] = useState("")
  const [createChallengerTiebreak, setCreateChallengerTiebreak] = useState("")
  const [createChallengedTiebreak, setCreateChallengedTiebreak] = useState("")
  const [createPlayers, setCreatePlayers] = useState<RankingPlayer[]>([])
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)
  const [createPlayersLoading, setCreatePlayersLoading] = useState(false)
  const [monthOptions, setMonthOptions] = useState<MonthOption[]>([])
  const initializedRef = useRef(false)

  const fallbackMonths = useMemo(() => {
    const list: MonthOption[] = []
    const now = nowInAppTimeZone()
    const base = new Date(now.getFullYear(), now.getMonth(), 1)
    for (let index = 0; index < 6; index += 1) {
      const date = new Date(base)
      date.setMonth(base.getMonth() - index)
      list.push({ value: monthValue(date), label: monthLabel(date) })
    }
    return list
  }, [])

  const months = monthOptions.length ? monthOptions : fallbackMonths

  const challengeMetrics = useMemo(() => {
    let games = 0
    let wins = 0
    let losses = 0
    let pending = 0

    challenges.forEach((challenge) => {
      if (challenge.status === "scheduled" || challenge.status === "accepted") {
        pending += 1
      }
      if (challenge.status !== "completed") return
      games += 1
      const winner = resolveChallengeWinner({
        winner: challenge.winner,
        challengerGames: challenge.challengerGames,
        challengedGames: challenge.challengedGames,
        challengerWalkover: challenge.challengerWalkover,
        challengedWalkover: challenge.challengedWalkover,
      })
      if (!winner) return

      if (winner === "challenger") {
        wins += 1
      } else if (winner === "challenged") {
        losses += 1
      }
    })

    return { games, wins, losses, pending }
  }, [challenges])

  const loadRankings = useCallback(async () => {
    const response = await apiGet<RankingItem[]>("/api/rankings")
    if (response.ok) {
      setRankings(response.data)
    }
  }, [])

  const loadMonths = useCallback(async () => {
    const response = await apiGet<{ months: string[]; currentMonth?: string }>(
      "/api/challenges/months"
    )
    if (!response.ok) {
      setMonthOptions([])
      return monthValue(new Date())
    }

    const current =
      response.data.currentMonth ?? monthValue(nowInAppTimeZone())
    const list = response.data.months
      .map((value) => ({ value, label: monthLabel(monthDateFromValue(value)) }))
      .sort((a, b) => b.value.localeCompare(a.value))

    const defaultMonth = list.some((item) => item.value === current)
      ? current
      : list[0]?.value

    setMonthOptions(list)
    if (defaultMonth) {
      setMonthFilter(defaultMonth)
      return defaultMonth
    }
    return current
  }, [])

  const loadChallenges = useCallback(
    async (monthOverride?: string) => {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (rankingFilter !== "all") params.set("ranking", rankingFilter)
    const monthValue = monthOverride ?? monthFilter
    if (monthValue) params.set("month", monthValue)
    if (statusFilter !== "all") params.set("status", statusFilter)
    if (sortFilter) params.set("sort", sortFilter)

    const response = await apiGet<ChallengeItem[]>(
      `/api/challenges?${params.toString()}`
    )

    if (!response.ok) {
      setError(response.message)
      setLoading(false)
      return
    }

    setChallenges(response.data)
    setLoading(false)
  },
  [rankingFilter, monthFilter, statusFilter, sortFilter]
  )

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const init = async () => {
      await loadRankings()
      const current = await loadMonths()
      await loadChallenges(current)
    }
    init()
  }, [loadRankings, loadMonths, loadChallenges])

  useEffect(() => {
    if (!months.length) return
    const hasCurrent = months.some((option) => option.value === monthFilter)
    if (!hasCurrent) {
      setMonthFilter(months[0]?.value ?? monthValue(nowInAppTimeZone()))
    }
  }, [months, monthFilter])

  useEffect(() => {
    if (!isAdmin) return
    if (!rankings.length) return
    setCreateRankingId((current) => {
      if (current) return current
      if (rankingFilter !== "all") return rankingFilter
      return String(rankings[0]?.id ?? "")
    })
  }, [isAdmin, rankings, rankingFilter])

  useEffect(() => {
    if (!isAdmin || !createRankingId) return
    let mounted = true
    const loadPlayers = async () => {
      setCreatePlayersLoading(true)
      const response = await apiGet<RankingPlayersResponse>(
        `/api/rankings/${createRankingId}/players`
      )
      if (!mounted) return

      if (!response.ok) {
        setCreatePlayers([])
        setCreatePlayersLoading(false)
        return
      }

      const combined = [...response.data.players, ...response.data.suspended]
      setCreatePlayers(combined)
      setCreatePlayersLoading(false)
    }

    setCreateChallengerId("")
    setCreateChallengedId("")
    setCreateError(null)
    setCreateSuccess(null)
    setCreateResultType("none")
    setCreateChallengerGames("")
    setCreateChallengedGames("")
    setCreateChallengerTiebreak("")
    setCreateChallengedTiebreak("")
    loadPlayers()

    return () => {
      mounted = false
    }
  }, [isAdmin, createRankingId])

  const handleCreateChallenge = async () => {
    if (!createRankingId || !createChallengerId || !createChallengedId) {
      setCreateError("Selecione ranking, desafiante e desafiado.")
      return
    }

    if (createChallengerId === createChallengedId) {
      setCreateError("Selecione jogadores diferentes.")
      return
    }

    const resultType = createResultType
    let resultPayload: Record<string, unknown> | null = null

    if (resultType !== "none") {
      if (resultType === "score") {
        if (!createChallengerGames.trim() || !createChallengedGames.trim()) {
          setCreateError("Informe o placar do resultado.")
          return
        }

        const challengerGames = Number(createChallengerGames)
        const challengedGames = Number(createChallengedGames)

        if (
          !Number.isInteger(challengerGames) ||
          !Number.isInteger(challengedGames) ||
          challengerGames < 0 ||
          challengedGames < 0
        ) {
          setCreateError("Informe o placar do resultado.")
          return
        }

        if (challengerGames === challengedGames) {
          setCreateError("O placar nao pode ser empate.")
          return
        }

        const challengerTiebreak = createChallengerTiebreak.trim()
          ? Number(createChallengerTiebreak)
          : null
        const challengedTiebreak = createChallengedTiebreak.trim()
          ? Number(createChallengedTiebreak)
          : null

        if (
          (challengerTiebreak !== null && challengedTiebreak === null) ||
          (challengerTiebreak === null && challengedTiebreak !== null)
        ) {
          setCreateError("Informe o tiebreak para ambos os jogadores.")
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
          setCreateError("Informe o tiebreak corretamente.")
          return
        }

        resultPayload = {
          winner: challengerGames > challengedGames ? "challenger" : "challenged",
          played_at: createScheduledFor || undefined,
          challenger_games: challengerGames,
          challenged_games: challengedGames,
          challenger_tiebreak: challengerTiebreak,
          challenged_tiebreak: challengedTiebreak,
        }
      } else if (resultType === "wo_challenger") {
        resultPayload = {
          winner: "challenger",
          played_at: createScheduledFor || undefined,
          challenged_walkover: true,
        }
      } else if (resultType === "wo_challenged") {
        resultPayload = {
          winner: "challenged",
          played_at: createScheduledFor || undefined,
          challenger_walkover: true,
        }
      } else if (resultType === "double_wo") {
        resultPayload = {
          double_walkover: true,
          played_at: createScheduledFor || undefined,
        }
      }
    }

    setCreateLoading(true)
    setCreateError(null)
    setCreateSuccess(null)

    const response = await apiPost<{ id: number }>("/api/challenges", {
      ranking_id: Number(createRankingId),
      challenger_id: Number(createChallengerId),
      challenged_id: Number(createChallengedId),
      scheduled_for: createScheduledFor || undefined,
    })

    if (!response.ok) {
      setCreateError(response.message)
      setCreateLoading(false)
      return
    }

    const challengeId = response.data.id

    if (resultPayload) {
      const resultResponse = await apiPost(
        `/api/challenges/${challengeId}/result`,
        resultPayload
      )

      if (!resultResponse.ok) {
        setCreateError(
          `Desafio criado, mas falhou registrar resultado: ${resultResponse.message}`
        )
        setCreateLoading(false)
        loadChallenges()
        return
      }

      setCreateSuccess("Desafio criado e resultado registrado.")
    } else {
      setCreateSuccess("Desafio criado com sucesso.")
    }

    setCreateLoading(false)
    loadChallenges()
    loadMonths()
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Desafios"
        subtitle="Filtre por categoria e acompanhe os convites"
        action={
          isAdmin ? (
            <Button variant="outline" onClick={() => setShowCreate(!showCreate)}>
              {showCreate ? "Fechar" : "Novo desafio"}
            </Button>
          ) : undefined
        }
      />

      {isAdmin && showCreate ? (
        <Card>
          <CardContent className="space-y-4 py-6">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Criar desafio manual
              </p>
              <p className="text-xs text-muted-foreground">
                Escolha o ranking, os jogadores e a data do desafio.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-ranking">Ranking</Label>
                <Select
                  value={createRankingId}
                  onValueChange={setCreateRankingId}
                >
                  <SelectTrigger id="create-ranking" className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {rankings.map((ranking) => (
                      <SelectItem key={ranking.id} value={String(ranking.id)}>
                        {ranking.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-date">Data do desafio</Label>
                <Input
                  id="create-date"
                  type="datetime-local"
                  value={createScheduledFor}
                  onChange={(event) => setCreateScheduledFor(event.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-challenger">Desafiante</Label>
                <Select
                  value={createChallengerId}
                  onValueChange={setCreateChallengerId}
                  disabled={!createRankingId || createPlayersLoading}
                >
                  <SelectTrigger id="create-challenger" className="w-full">
                    <SelectValue
                      placeholder={
                        createPlayersLoading
                          ? "Carregando..."
                          : "Selecione"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {createPlayers.map((player) => {
                      const label = `${formatName(
                        player.firstName,
                        player.lastName,
                        player.nickname
                      )} (${player.position || "-"})${
                        player.isSuspended ? " - Licenca" : ""
                      }`
                      return (
                        <SelectItem
                          key={`challenger-${player.userId}`}
                          value={String(player.userId)}
                        >
                          {label}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-challenged">Desafiado</Label>
                <Select
                  value={createChallengedId}
                  onValueChange={setCreateChallengedId}
                  disabled={!createRankingId || createPlayersLoading}
                >
                  <SelectTrigger id="create-challenged" className="w-full">
                    <SelectValue
                      placeholder={
                        createPlayersLoading
                          ? "Carregando..."
                          : "Selecione"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {createPlayers.map((player) => {
                      const label = `${formatName(
                        player.firstName,
                        player.lastName,
                        player.nickname
                      )} (${player.position || "-"})${
                        player.isSuspended ? " - Licenca" : ""
                      }`
                      return (
                        <SelectItem
                          key={`challenged-${player.userId}`}
                          value={String(player.userId)}
                        >
                          {label}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Resultado (opcional)
                </p>
                <p className="text-xs text-muted-foreground">
                  Informe o resultado agora ou deixe em branco para registrar depois.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="create-result-type">Tipo de resultado</Label>
                  <Select
                    value={createResultType}
                    onValueChange={setCreateResultType}
                  >
                    <SelectTrigger id="create-result-type" className="w-full">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem resultado</SelectItem>
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
                {createResultType === "score" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="create-score-challenger">
                        Games do desafiante
                      </Label>
                      <Input
                        id="create-score-challenger"
                        type="number"
                        min={0}
                        value={createChallengerGames}
                        onChange={(event) =>
                          setCreateChallengerGames(event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-score-challenged">
                        Games do desafiado
                      </Label>
                      <Input
                        id="create-score-challenged"
                        type="number"
                        min={0}
                        value={createChallengedGames}
                        onChange={(event) =>
                          setCreateChallengedGames(event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-tiebreak-challenger">
                        Tiebreak do desafiante (opcional)
                      </Label>
                      <Input
                        id="create-tiebreak-challenger"
                        type="number"
                        min={0}
                        value={createChallengerTiebreak}
                        onChange={(event) =>
                          setCreateChallengerTiebreak(event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-tiebreak-challenged">
                        Tiebreak do desafiado (opcional)
                      </Label>
                      <Input
                        id="create-tiebreak-challenged"
                        type="number"
                        min={0}
                        value={createChallengedTiebreak}
                        onChange={(event) =>
                          setCreateChallengedTiebreak(event.target.value)
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {createError ? (
              <p className="text-xs text-destructive" role="alert">
                {createError}
              </p>
            ) : null}
            {createSuccess ? (
              <p className="text-xs text-success" role="status">
                {createSuccess}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleCreateChallenge} disabled={createLoading}>
                {createLoading ? "Salvando..." : "Salvar desafio"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCreate(false)}
                disabled={createLoading}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2">
            <Label htmlFor="ranking-select">Ranking</Label>
            <Select value={rankingFilter} onValueChange={setRankingFilter}>
              <SelectTrigger id="ranking-select" className="w-full">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {rankings.map((ranking) => (
                  <SelectItem key={ranking.id} value={String(ranking.id)}>
                    {ranking.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="month-select">Mes</Label>
            <Select
              value={monthFilter}
              onValueChange={(value) => {
                setMonthFilter(value)
                loadChallenges(value)
              }}
            >
              <SelectTrigger id="month-select" className="w-full">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {months.map((month) => (
                  <SelectItem key={month.value} value={month.value}>
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status-select">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="status-select" className="w-full">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-select">Ordenar por</Label>
            <Select value={sortFilter} onValueChange={setSortFilter}>
              <SelectTrigger id="order-select" className="w-full">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => loadChallenges()}>
              <Filter className="size-4" />
              Filtrar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={`challenge-metric-${index}`} className="h-24 w-full" />
            ))
          ) : (
            <>
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Jogos</span>
                  <Swords className="size-4 text-primary" />
                </div>
                <p className="mt-2 text-2xl font-semibold">
                  {challengeMetrics.games}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Concluidos no filtro
                </p>
              </div>
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Pendentes</span>
                  <Clock className="size-4 text-warning" />
                </div>
                <p className="mt-2 text-2xl font-semibold">
                  {challengeMetrics.pending}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Desafios agendados ou aceitos
                </p>
              </div>
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Vitorias</span>
                  <Trophy className="size-4 text-success" />
                </div>
                <p className="mt-2 text-2xl font-semibold">
                  {challengeMetrics.wins}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Resultados confirmados
                </p>
              </div>
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Derrotas</span>
                  <CircleX className="size-4 text-destructive" />
                </div>
                <p className="mt-2 text-2xl font-semibold">
                  {challengeMetrics.losses}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Resultados confirmados
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={`challenge-skeleton-${index}`} className="h-32" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          title="Nao foi possivel carregar os desafios"
          description={error}
        />
      ) : challenges.length ? (
        <div className="space-y-4">
          {challenges.map((challenge, index) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              isAdmin={isAdmin}
              onActionComplete={loadChallenges}
              className={
                index % 2 === 0
                  ? "bg-sky-50/80 dark:bg-slate-900/60"
                  : "bg-white dark:bg-slate-800/60"
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nenhum desafio encontrado"
          description={
            isAdmin
              ? "Use os filtros acima ou crie um novo desafio para comecar."
              : "Use os filtros acima para acompanhar seus desafios."
          }
          icon={<Swords className="size-5" />}
          action={
            isAdmin ? (
              <Button
                className="bg-success text-success-foreground hover:bg-success/90"
                onClick={() => setShowCreate(true)}
              >
                Criar desafio
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  )
}
