"use client"

import {
  memo,
  useDeferredValue,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react"
import Link from "next/link"
import {
  ChevronDown,
  ChevronUp,
  Eye,
  GripVertical,
  Pencil,
  Swords,
  Users,
  X,
} from "lucide-react"

import EmptyState from "@/components/app/EmptyState"
import StatPill, { type StatPillTone } from "@/components/app/StatPill"
import UserAvatar from "@/components/app/UserAvatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiGet, apiPatch, apiPost, type ApiResult } from "@/lib/http"
import { prefetchApiGet } from "@/lib/http-prefetch"
import { formatMonthYearPt, shiftMonthValue } from "@/lib/date"
import { cn } from "@/lib/utils"
import {
  consumeRankingVisibilityRefreshMarker,
  RANKING_VISIBILITY_UPDATED_EVENT,
  readRankingVisibilityRefreshMarker,
} from "@/lib/preferences/ranking-visibility-client"
import {
  CHALLENGES_UPDATED_EVENT,
  consumeChallengesRefreshMarker,
  markChallengesUpdated,
  readChallengesRefreshMarker,
} from "@/lib/preferences/challenge-refresh-client"
import {
  nowInAppTimeZone,
  toDateTimeInputInAppTz,
} from "@/lib/timezone-client"

const statusTone = {
  scheduled: "warning",
  accepted: "success",
  declined: "danger",
  completed: "success",
  cancelled: "neutral",
} as const

const resultTone = {
  win: "success",
  loss: "danger",
  pending: "warning",
} as const

const statusLabelMap: Record<PlayerSummary["status"], string> = {
  scheduled: "Pendente",
  accepted: "Aceito",
  declined: "Recusado",
  completed: "Concluido",
  cancelled: "Cancelado",
}

type RankingItem = {
  id: number
  name: string
  slug: string
  description?: string | null
  activePlayers: number
  isUserMember?: boolean
}

type PlayerSummary = {
  status: "scheduled" | "accepted" | "declined" | "completed" | "cancelled"
  result: "win" | "loss" | "pending"
}

type PlayerItem = {
  membershipId: number
  userId: number
  position: number
  firstName: string
  lastName: string
  nickname: string | null
  avatarUrl: string | null
  isBluePoint: boolean
  isAccessChallenge: boolean
  isSuspended: boolean
  summary: PlayerSummary | null
}

type PlayersResponse = {
  serverNow?: string
  viewerId: number
  canManage?: boolean
  canManageAll?: boolean
  ranking: RankingItem
  month: { value: string; label: string }
  currentMonth?: string
  months?: string[]
  accessThreshold: number | null
  maxPositionsUp?: number
  challengeWindow: {
    phase: string
    canChallenge: boolean
    requiresBlue: boolean
    requiresRegular: boolean
    viewerBlueCanChallengeInOpen?: boolean
    message: string
    unlockAt: string | null
    roundStart?: string
    blueStart?: string
    blueEnd?: string | null
    openStart?: string
    openEnd?: string | null
    roundEnd?: string | null
  }
  players: PlayerItem[]
  suspended: PlayerItem[]
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

type PlayerHistoryResponse = {
  player: {
    userId: number
    name: string
    avatarUrl: string | null
  }
  months: PlayerHistoryMonth[]
}

const formatName = (first: string, last: string, nickname?: string | null) => {
  const full = `${first} ${last}`.trim()
  const nick = (nickname ?? "").trim()
  if (!full && !nick) return "Jogador"
  if (nick && full) return `${full} "${nick}"`
  return nick || full
}

const formatAdminIssues = (issues: unknown) => {
  if (!Array.isArray(issues)) return null
  const lines = issues
    .filter((issue): issue is string => typeof issue === "string")
    .map((issue) => issue.trim())
    .filter(Boolean)
  if (!lines.length) return null
  return lines.join("\n")
}

const nextMonthValue = (value: string) => shiftMonthValue(value, 1)
const isUnauthorizedMessage = (message: string) =>
  /nao autorizado|não autorizado|unauthorized/i.test(message)

const formatCategoryCardName = (name?: string | null, slug?: string) => {
  const normalizedName = typeof name === "string" ? name.trim() : ""
  const cleaned = normalizedName.replace(/^ranking\s+/i, "").trim()
  if (cleaned) return cleaned
  if (normalizedName) return normalizedName
  if (slug) return slug.replace(/-/g, " ").trim()
  return "Categoria"
}

const getCountdownTickMs = (remainingMs: number) => {
  if (remainingMs > 0) return 1_000
  return 1_000
}

const formatCountdownLabel = (remainingMs: number) => {
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const hh = String(hours).padStart(2, "0")
  const mm = String(minutes).padStart(2, "0")
  const ss = String(seconds).padStart(2, "0")
  return hours > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`
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

const PLAYERS_CACHE_TTL_MS = 30_000
const RANKINGS_CACHE_TTL_MS = 180_000
const MAX_PLAYERS_CLIENT_CACHE_ENTRIES = 80

type PlayersCacheEntry = {
  data: PlayersResponse
  cachedAt: number
}

type RankingsCacheEntry = {
  data: RankingItem[]
  cachedAt: number
}

let rankingsCache: RankingsCacheEntry | null = null
const playersCacheStore = new Map<string, PlayersCacheEntry>()
const playersInFlightStore = new Map<string, Promise<ApiResult<PlayersResponse>>>()

const clearRankingClientCaches = () => {
  rankingsCache = null
  playersCacheStore.clear()
  playersInFlightStore.clear()
}

const writePlayersClientCache = (cacheKey: string, data: PlayersResponse) => {
  if (playersCacheStore.size >= MAX_PLAYERS_CLIENT_CACHE_ENTRIES) {
    const oldestKey = playersCacheStore.keys().next().value
    if (oldestKey) {
      playersCacheStore.delete(oldestKey)
    }
  }
  playersCacheStore.set(cacheKey, {
    data,
    cachedAt: nowInAppTimeZone().getTime(),
  })
}

const primePlayersClientCache = (rankingId: string) => {
  const cacheKey = `${rankingId}:open`
  const now = nowInAppTimeZone().getTime()
  const cached = playersCacheStore.get(cacheKey)
  if (cached && now - cached.cachedAt <= PLAYERS_CACHE_TTL_MS) {
    return
  }
  if (playersInFlightStore.has(cacheKey)) {
    return
  }

  const pending = apiGet<PlayersResponse>(`/api/rankings/${rankingId}/players`)
    .then((response) => {
      if (response.ok) {
        writePlayersClientCache(cacheKey, response.data)
      }
      return response
    })
    .finally(() => {
      if (playersInFlightStore.get(cacheKey) === pending) {
        playersInFlightStore.delete(cacheKey)
      }
    })

  playersInFlightStore.set(cacheKey, pending)
}

const invalidatePlayersCacheForRanking = (rankingId: string) => {
  for (const key of playersCacheStore.keys()) {
    if (key.startsWith(`${rankingId}:`)) {
      playersCacheStore.delete(key)
    }
  }
}

const primeTopRankingsCache = (rankings: RankingItem[]) => {
  if (!rankings.length) return
  rankings
    .slice(0, 3)
    .map((ranking) => String(ranking.id))
    .forEach((rankingId) => {
      primePlayersClientCache(rankingId)
    })
}

const getCategoryGridClassName = (count: number) => {
  if (count <= 1) return "grid grid-cols-1 gap-2 sm:gap-3"
  if (count === 2) return "grid grid-cols-2 gap-2 sm:gap-3"
  if (count === 3) return "grid grid-cols-2 gap-2 md:grid-cols-3 sm:gap-3"
  if (count === 4) return "grid grid-cols-2 gap-2 md:grid-cols-4 sm:gap-3"
  if (count === 5) return "grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5 sm:gap-3"
  return "grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5 sm:gap-3"
}

const sortRankingsByMembership = (a: RankingItem, b: RankingItem) => {
  const membershipDiff =
    Number(Boolean(b.isUserMember)) - Number(Boolean(a.isUserMember))
  if (membershipDiff !== 0) return membershipDiff
  return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
}

type RankingCategoryCardProps = {
  category: RankingItem
  isSelected: boolean
  onSelect: (id: string) => void
}

type PlayerStatusBadge = {
  label: string
  tone: StatPillTone
  className?: string
}

type ActivePlayerCardView = {
  player: PlayerItem
  name: string
  positionLabel: string
  canMoveUp: boolean
  canMoveDown: boolean
  statusBadges: PlayerStatusBadge[]
  showChallengeButton: boolean
  challengeDisabled: boolean
  canChallenge: boolean
  showCountdown: boolean
  showAdminEdit: boolean
  cardClassName: string
}

const RankingCategoryCard = memo(function RankingCategoryCard({
  category,
  isSelected,
  onSelect,
}: RankingCategoryCardProps) {
  const categoryName =
    formatCategoryCardName(category.name, category.slug) ||
    (category.slug ? category.slug.replace(/-/g, " ").trim() : "") ||
    `Categoria ${category.id}`
  const selectedClass = isSelected
    ? "relative min-h-[74px] cursor-pointer gap-0 p-0 border-primary/70 bg-primary/12 shadow-none ring-1 ring-primary/35 transition-colors"
    : category.isUserMember
    ? "relative min-h-[74px] cursor-pointer gap-0 p-0 border-primary/45 bg-primary/10 shadow-none ring-1 ring-primary/25 transition-colors"
    : "relative min-h-[74px] cursor-pointer gap-0 p-0 shadow-none transition-colors hover:border-primary/25"

  return (
    <Card
      className={selectedClass}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(String(category.id))}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onSelect(String(category.id))
        }
      }}
    >
      <div className="flex h-full min-w-0 flex-col justify-between gap-1 px-3 py-2">
        <p
          className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold leading-none text-slate-900 dark:text-slate-100 sm:text-base"
          title={categoryName}
        >
          {categoryName}
        </p>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3.5 shrink-0" />
            <span className="truncate">{category.activePlayers} ativos</span>
          </div>
          {category.isUserMember ? (
            <StatPill
              label="Inscrito"
              tone="info"
              className="shrink-0 px-1.5 py-0 text-[10px]"
            />
          ) : null}
        </div>
      </div>
    </Card>
  )
})

type RankingPlayerCardProps = {
  row: ActivePlayerCardView
  isSelected: boolean
  editing: boolean
  isDragging: boolean
  isActionLoading: boolean
  countdownText: string
  onOpenHistory: (playerId: number) => void
  onChallenge: (playerId: number) => void
  onOpenEdit: (player: PlayerItem) => void
  onMoveUp: (playerId: number) => void
  onMoveDown: (playerId: number) => void
  onDragStart: (event: DragEvent<HTMLDivElement>, playerId: number) => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>, playerId: number) => void
  onDragEnd: () => void
}

const RankingPlayerCard = memo(
  function RankingPlayerCard({
    row,
    isSelected,
    editing,
    isDragging,
    isActionLoading,
    countdownText,
    onOpenHistory,
    onChallenge,
    onOpenEdit,
    onMoveUp,
    onMoveDown,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
  }: RankingPlayerCardProps) {
    const badgeClassName =
      "px-1.5 py-0.5 text-[10px] leading-none sm:px-2 sm:py-1 sm:text-xs"

    return (
      <Card
        className={`shadow-none ${
          editing ? "cursor-grab border-dashed" : ""
        } py-2 sm:py-6 [content-visibility:auto] [contain-intrinsic-size:120px] ${row.cardClassName} ${
          isDragging ? "ring-2 ring-primary/30 opacity-70" : ""
        } ${isSelected ? "ring-2 ring-primary/40 border-primary/60" : ""} ${
          !isSelected && !isDragging ? "ring-0" : ""
        }`}
        draggable={editing}
        onDragStart={(event) => onDragStart(event, row.player.userId)}
        onDragOver={onDragOver}
        onDrop={(event) => onDrop(event, row.player.userId)}
        onDragEnd={onDragEnd}
        aria-grabbed={editing && isDragging}
      >
        <CardContent className="flex items-start justify-between gap-2 px-3 sm:items-center sm:gap-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-4">
            {editing ? (
              <div className="flex items-center gap-1">
                <div className="flex size-6 items-center justify-center text-muted-foreground sm:size-8">
                  <GripVertical className="size-3.5 sm:size-5" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 sm:h-6 sm:w-6"
                    disabled={!row.canMoveUp}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onMoveUp(row.player.userId)
                    }}
                    aria-label={`Mover ${row.name} para cima`}
                  >
                    <ChevronUp className="size-3 sm:size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 sm:h-6 sm:w-6"
                    disabled={!row.canMoveDown}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onMoveDown(row.player.userId)
                    }}
                    aria-label={`Mover ${row.name} para baixo`}
                  >
                    <ChevronDown className="size-3 sm:size-3.5" />
                  </Button>
                </div>
              </div>
            ) : null}
            {editing ? (
              <UserAvatar
                name={row.name}
                src={row.player.avatarUrl}
                size="clamp(26px, 8vw, 36px)"
                sizes="36px"
              />
            ) : (
              <button
                type="button"
                onClick={() => onOpenHistory(row.player.userId)}
                className={`group relative rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  isSelected
                    ? "ring-2 ring-primary/40"
                    : "ring-1 ring-primary/20 hover:ring-primary/40"
                }`}
                title="Abrir historico de confrontos"
                aria-label={`Abrir historico de confrontos de ${row.name}`}
              >
                <UserAvatar
                  name={row.name}
                  src={row.player.avatarUrl}
                  size="clamp(26px, 8vw, 36px)"
                  sizes="36px"
                />
                <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border border-background bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105 sm:size-[18px]">
                  <Eye className="size-2.5 sm:size-3" />
                </span>
              </button>
            )}
            <div className="min-w-0 space-y-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground shadow-sm sm:size-9 sm:text-xs">
                  {row.positionLabel}
                </div>
                <p className="truncate text-[12px] font-semibold text-foreground sm:text-sm sm:whitespace-normal">
                  {row.name}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {row.statusBadges.length ? (
                  row.statusBadges.map((status) => (
                    <StatPill
                      key={`${row.player.userId}-${status.label}`}
                      label={status.label}
                      tone={status.tone}
                      className={status.className}
                    />
                  ))
                ) : (
                  <StatPill
                    label="Sem historico"
                    tone="neutral"
                    className={badgeClassName}
                  />
                )}
              </div>
              {row.showChallengeButton ? (
                <p
                  className={cn(
                    "min-h-[14px] text-[10px] font-semibold sm:min-h-[16px] sm:text-xs",
                    row.showCountdown && countdownText
                      ? "text-destructive"
                      : "invisible"
                  )}
                  aria-hidden={!(row.showCountdown && countdownText)}
                >
                  {row.showCountdown && countdownText ? countdownText : "00:00"}
                </p>
              ) : null}
            </div>
          </div>
          {row.showChallengeButton || row.showAdminEdit ? (
            <div className="flex shrink-0 flex-row flex-wrap items-center gap-1.5 sm:w-auto sm:flex-row sm:items-center">
              {row.showChallengeButton ? (
                <Button
                  className="h-10 w-10 px-0 text-[11px] sm:h-9 sm:w-auto sm:px-4 sm:text-sm"
                  disabled={row.challengeDisabled || isActionLoading}
                  onClick={(event) => {
                    event.stopPropagation()
                    onChallenge(row.player.userId)
                  }}
                  aria-label="Desafiar"
                >
                  <Swords className="size-4 sm:hidden" />
                  <span className="hidden sm:inline">
                    {isActionLoading ? "Enviando..." : "Desafiar"}
                  </span>
                </Button>
              ) : null}
              {row.showAdminEdit ? (
                <Button
                  className="h-8 w-8 px-0 text-[11px] sm:h-9 sm:w-auto sm:px-4 sm:text-sm"
                  size="sm"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenEdit(row.player)
                  }}
                  aria-label="Editar"
                >
                  <Pencil className="size-3.5 sm:size-4" />
                  <span className="hidden sm:inline">Editar</span>
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    )
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.isSelected === next.isSelected &&
    prev.editing === next.editing &&
    prev.isDragging === next.isDragging &&
    prev.isActionLoading === next.isActionLoading &&
    prev.countdownText === next.countdownText
)

export default function RankingList() {
  const [rankings, setRankings] = useState<RankingItem[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null)
  const [playersData, setPlayersData] = useState<PlayersResponse | null>(null)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historyModalData, setHistoryModalData] =
    useState<PlayerHistoryResponse | null>(null)
  const [historyModalLoading, setHistoryModalLoading] = useState(false)
  const [historyModalError, setHistoryModalError] = useState<string | null>(null)
  const [loadingRankings, setLoadingRankings] = useState(true)
  const [loadingPlayers, setLoadingPlayers] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [draftPlayers, setDraftPlayers] = useState<PlayerItem[]>([])
  const [reorderError, setReorderError] = useState<string | null>(null)
  const [reorderLoading, setReorderLoading] = useState(false)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [adminMonth, setAdminMonth] = useState("")
  const [nextRoundMonth, setNextRoundMonth] = useState("")
  const [adminActionError, setAdminActionError] = useState<string | null>(null)
  const [adminActionSuccess, setAdminActionSuccess] = useState<string | null>(null)
  const [adminActionLoading, setAdminActionLoading] = useState<
    "recalculate" | "rollover" | "restore" | null
  >(null)
  const [rolloverAll, setRolloverAll] = useState(false)
  const [phaseNow, setPhaseNow] = useState(() => Date.now())
  const [serverOffsetMs, setServerOffsetMs] = useState(0)
  const [countdownText, setCountdownText] = useState("")
  const [editingPlayer, setEditingPlayer] = useState<PlayerItem | null>(null)
  const [editForm, setEditForm] = useState({
    isBluePoint: false,
    isSuspended: false,
    isAccessChallenge: false,
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [visibilityRefreshToken, setVisibilityRefreshToken] = useState(0)
  const playersDataRef = useRef<PlayersResponse | null>(null)
  const lastVisibilityMarkerRef = useRef<string | null>(null)
  const lastChallengeMarkerRef = useRef<string | null>(null)
  const canManage = Boolean(playersData?.canManage)
  const canManageAll = Boolean(playersData?.canManageAll)

  const resetSelectionState = useCallback(() => {
    setEditing(false)
    setDraftPlayers([])
    setReorderError(null)
    setDraggingId(null)
    setAdminActionError(null)
    setAdminActionSuccess(null)
    setAdminActionLoading(null)
    setAdminMonth("")
    setNextRoundMonth("")
    setRolloverAll(false)
    setSelectedPlayerId(null)
    setHistoryModalOpen(false)
    setHistoryModalData(null)
    setHistoryModalLoading(false)
    setHistoryModalError(null)
    setEditingPlayer(null)
    setEditSaving(false)
    setEditError(null)
  }, [])

  const redirectToLogin = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.href = "/login"
    }
  }, [])

  useEffect(() => {
    playersDataRef.current = playersData
  }, [playersData])

  useEffect(() => {
    if (typeof window === "undefined") return
    const pendingMarker = consumeRankingVisibilityRefreshMarker()
    lastVisibilityMarkerRef.current =
      pendingMarker ?? readRankingVisibilityRefreshMarker()
    if (pendingMarker) {
      clearRankingClientCaches()
      setVisibilityRefreshToken((current) => current + 1)
    }

    const pendingChallengeMarker = consumeChallengesRefreshMarker()
    lastChallengeMarkerRef.current =
      pendingChallengeMarker ?? readChallengesRefreshMarker()
    if (pendingChallengeMarker) {
      clearRankingClientCaches()
      setVisibilityRefreshToken((current) => current + 1)
    }

    const handleVisibilityUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ marker?: string }>).detail
      const marker =
        typeof detail?.marker === "string"
          ? detail.marker
          : readRankingVisibilityRefreshMarker()
      if (!marker || marker === lastVisibilityMarkerRef.current) {
        return
      }
      lastVisibilityMarkerRef.current = marker
      clearRankingClientCaches()
      setVisibilityRefreshToken((current) => current + 1)
    }

    const handleChallengesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ marker?: string }>).detail
      const marker =
        typeof detail?.marker === "string"
          ? detail.marker
          : readChallengesRefreshMarker()
      if (!marker || marker === lastChallengeMarkerRef.current) {
        return
      }
      lastChallengeMarkerRef.current = marker
      clearRankingClientCaches()
      setVisibilityRefreshToken((current) => current + 1)
    }

    window.addEventListener(
      RANKING_VISIBILITY_UPDATED_EVENT,
      handleVisibilityUpdated as EventListener
    )
    window.addEventListener(
      CHALLENGES_UPDATED_EVENT,
      handleChallengesUpdated as EventListener
    )
    return () => {
      window.removeEventListener(
        RANKING_VISIBILITY_UPDATED_EVENT,
        handleVisibilityUpdated as EventListener
      )
      window.removeEventListener(
        CHALLENGES_UPDATED_EVENT,
        handleChallengesUpdated as EventListener
      )
    }
  }, [])

  useEffect(() => {
    if (loadError && isUnauthorizedMessage(loadError)) {
      redirectToLogin()
    }
  }, [loadError, redirectToLogin])

  const handleSelectRanking = useCallback((nextId: string) => {
    if (nextId === selectedId) return
    setSelectedId(nextId)
    resetSelectionState()
  }, [resetSelectionState, selectedId])

  const handleSelectPlayer = useCallback((playerId: number) => {
    if (editing) return
    setSelectedPlayerId(playerId)
    setHistoryModalOpen(true)
  }, [editing])

  const closeHistoryModal = useCallback(() => {
    setHistoryModalOpen(false)
    setHistoryModalLoading(false)
    setHistoryModalError(null)
  }, [])

  useEffect(() => {
    let mounted = true

    const loadRankings = async () => {
      const now = nowInAppTimeZone().getTime()
      if (rankingsCache && now - rankingsCache.cachedAt <= RANKINGS_CACHE_TTL_MS) {
        const ordered = rankingsCache.data
        const firstRankingId = ordered[0] ? String(ordered[0].id) : ""
        primeTopRankingsCache(ordered)
        setRankings(ordered)
        setSelectedId((current) =>
          current && ordered.some((ranking) => String(ranking.id) === current)
            ? current
            : firstRankingId
        )
        setLoadingRankings(false)
        return
      }

      setLoadingRankings(true)
      setLoadError(null)
      const response = await apiGet<RankingItem[]>("/api/rankings")
      if (!mounted) return

      if (!response.ok) {
        if (isUnauthorizedMessage(response.message)) {
          redirectToLogin()
          return
        }
        setLoadError(response.message)
        setLoadingRankings(false)
        return
      }

      const ordered = [...response.data].sort(sortRankingsByMembership)
      const firstRankingId = ordered[0] ? String(ordered[0].id) : ""
      primeTopRankingsCache(ordered)
      rankingsCache = {
        data: ordered,
        cachedAt: Date.now(),
      }
      setRankings(ordered)
      setSelectedId((current) =>
        current && ordered.some((ranking) => String(ranking.id) === current)
          ? current
          : firstRankingId
      )
      setLoadingRankings(false)
    }

    loadRankings()

    return () => {
      mounted = false
    }
  }, [redirectToLogin, visibilityRefreshToken])

  useEffect(() => {
    let mounted = true

    const loadPlayers = async () => {
      if (!selectedId) return
      const params = new URLSearchParams()
      if (adminMonth) {
        params.set("month", adminMonth)
      }
      const url = params.toString()
        ? `/api/rankings/${selectedId}/players?${params.toString()}`
        : `/api/rankings/${selectedId}/players`

      const cacheKey = `${selectedId}:${adminMonth || "open"}`
      const cached = playersCacheStore.get(cacheKey)
      const now = nowInAppTimeZone().getTime()
      if (cached && now - cached.cachedAt <= PLAYERS_CACHE_TTL_MS) {
        setPlayersData(cached.data)
        setLoadingPlayers(false)
        return
      }
      const pendingCached = playersInFlightStore.get(cacheKey)
      if (pendingCached) {
        const pendingResult = await pendingCached
        if (!mounted) return
        if (!pendingResult.ok) {
          if (isUnauthorizedMessage(pendingResult.message)) {
            redirectToLogin()
            return
          }
          setLoadError(pendingResult.message)
          setLoadingPlayers(false)
          return
        }
        writePlayersClientCache(cacheKey, pendingResult.data)
        setPlayersData(pendingResult.data)
        setLoadingPlayers(false)
        return
      }

      const preserveUi = Boolean(playersDataRef.current)
      if (!preserveUi) {
        setLoadingPlayers(true)
      }
      setLoadError(null)
      const pending = apiGet<PlayersResponse>(url).finally(() => {
        if (playersInFlightStore.get(cacheKey) === pending) {
          playersInFlightStore.delete(cacheKey)
        }
      })
      playersInFlightStore.set(cacheKey, pending)
      const response = await pending
      if (!mounted) return

      if (!response.ok) {
        if (isUnauthorizedMessage(response.message)) {
          redirectToLogin()
          return
        }
        setLoadError(response.message)
        setLoadingPlayers(false)
        return
      }

      const serverNowMs = response.data.serverNow
        ? new Date(response.data.serverNow).getTime()
        : Number.NaN
      if (!Number.isNaN(serverNowMs)) {
        const offset = serverNowMs - now
        setServerOffsetMs(offset)
        setPhaseNow(now + offset)
      }

      writePlayersClientCache(cacheKey, response.data)
      setPlayersData(response.data)
      setLoadingPlayers(false)
    }

    loadPlayers()

    return () => {
      mounted = false
    }
  }, [selectedId, adminMonth, redirectToLogin, visibilityRefreshToken])

  useEffect(() => {
    if (!playersData) return
    const monthValue = playersData.month?.value
    if (monthValue) {
      prefetchApiGet(`/api/challenges?month=${monthValue}&sort=recent`, {
        minIntervalMs: 25_000,
      })
    }
    prefetchApiGet("/api/challenges/months", { minIntervalMs: 25_000 })
  }, [playersData])

  useEffect(() => {
    if (!playersData) {
      setSelectedPlayerId(null)
      return
    }

    const players = [...playersData.players, ...playersData.suspended]
    if (!players.length) {
      setSelectedPlayerId(null)
      return
    }

    setSelectedPlayerId((current) => {
      if (current && players.some((player) => player.userId === current)) {
        return current
      }
      const viewer = players.find((player) => player.userId === playersData.viewerId)
      return (viewer ?? players[0]).userId
    })
  }, [playersData])

  useEffect(() => {
    let mounted = true

    const loadPlayerHistory = async () => {
      if (!historyModalOpen || !playersData || !selectedPlayerId) return

      const rankingId = playersData.ranking.id
      const monthValue = playersData.month?.value

      setHistoryModalLoading(true)
      setHistoryModalError(null)
      setHistoryModalData(null)
      const params = new URLSearchParams()
      if (monthValue) {
        params.set("month", monthValue)
      }
      const response = await apiGet<PlayerHistoryResponse>(
        `/api/rankings/${rankingId}/players/${selectedPlayerId}/history${
          params.toString() ? `?${params.toString()}` : ""
        }`
      )

      if (!mounted) return
      if (!response.ok) {
        if (isUnauthorizedMessage(response.message)) {
          redirectToLogin()
          return
        }
        setHistoryModalError(response.message)
        setHistoryModalLoading(false)
        return
      }

      setHistoryModalData(response.data)
      setHistoryModalError(null)
      setHistoryModalLoading(false)
    }

    loadPlayerHistory()

    return () => {
      mounted = false
    }
  }, [historyModalOpen, playersData, redirectToLogin, selectedPlayerId])

  const openMonthValue = playersData?.currentMonth ?? ""
  const requestedMonthValue = playersData?.month?.value ?? ""
  const selectedAdminMonth = adminMonth || requestedMonthValue
  const isOpenMonthSelected = !openMonthValue || selectedAdminMonth === openMonthValue
  const canRestore = Boolean(selectedAdminMonth) && isOpenMonthSelected
  const canCloseMonth = Boolean(selectedAdminMonth) && isOpenMonthSelected
  const allowedMaxBase = openMonthValue || requestedMonthValue
  const allowedMax =
    adminMonth && adminMonth > allowedMaxBase ? adminMonth : allowedMaxBase

  const activePlayers = useMemo(
    () => (editing ? draftPlayers : playersData?.players ?? []),
    [draftPlayers, editing, playersData?.players]
  )
  const deferredActivePlayers = useDeferredValue(activePlayers)
  const listedPlayers = useMemo(
    () => playersData?.players ?? [],
    [playersData?.players]
  )
  const selectedPlayer = useMemo(() => {
    if (!selectedPlayerId) return null
    return (
      listedPlayers.find((player) => player.userId === selectedPlayerId) ?? null
    )
  }, [listedPlayers, selectedPlayerId])

  const viewerEntry = useMemo(() => {
    if (!playersData) return null
    return (
      playersData.players.find((player) => player.userId === playersData.viewerId) ??
      playersData.suspended.find((player) => player.userId === playersData.viewerId) ??
      null
    )
  }, [playersData])
  const viewerPosition = viewerEntry?.position ?? 0
  const viewerIsBlue = Boolean(viewerEntry?.isBluePoint)
  const viewerBlueCanChallengeInOpen = Boolean(
    playersData?.challengeWindow.viewerBlueCanChallengeInOpen
  )
  const viewerIsAccess = Boolean(viewerEntry?.isAccessChallenge)
  const viewerIsSuspended = Boolean(viewerEntry?.isSuspended)
  const viewerHasChallenge = Boolean(viewerEntry?.summary)
  const maxUp = playersData?.maxPositionsUp ?? 10

  const parseTime = (value?: string | null) => {
    if (!value) return null
    const parsed = new Date(value).getTime()
    return Number.isNaN(parsed) ? null : parsed
  }

  const phase = playersData?.challengeWindow.phase
  const blueStartAt = parseTime(playersData?.challengeWindow.blueStart)
  const openStartAt = parseTime(playersData?.challengeWindow.openStart)

  const countdownInfo = useMemo(() => {
    if (!playersData) return { deadline: null as number | null, label: "" }
    if (phase === "blue" && !viewerIsBlue) {
      return { deadline: openStartAt, label: "Desafios livres em" }
    }
    if (phase === "waiting_open") {
      return { deadline: openStartAt, label: "Desafios livres em" }
    }
    if (phase === "before" || phase === "waiting_blue") {
      if (viewerIsBlue) {
        return { deadline: blueStartAt, label: "Ponto azul em" }
      }
      return { deadline: openStartAt, label: "Desafios livres em" }
    }
    return { deadline: null as number | null, label: "" }
  }, [playersData, phase, viewerIsBlue, blueStartAt, openStartAt])

  const shouldTrackCountdown =
    Boolean(countdownInfo.deadline) &&
    !viewerIsSuspended &&
    !viewerHasChallenge &&
    activePlayers.length > 0

  useEffect(() => {
    const deadline = countdownInfo.deadline
    const label = countdownInfo.label
    if (!deadline || !label || !shouldTrackCountdown) {
      setCountdownText("")
      return
    }

    let timeout: ReturnType<typeof setTimeout> | null = null

    const tick = () => {
      const remaining = deadline - (Date.now() + serverOffsetMs)
      if (remaining <= 0) {
        setCountdownText((previous) => (previous ? "" : previous))
        return
      }
      const nextLabel = `${label} ${formatCountdownLabel(remaining)}`
      setCountdownText((previous) =>
        previous === nextLabel ? previous : nextLabel
      )
      timeout = setTimeout(tick, getCountdownTickMs(remaining))
    }

    tick()

    return () => {
      if (timeout) clearTimeout(timeout)
    }
  }, [
    countdownInfo.deadline,
    countdownInfo.label,
    serverOffsetMs,
    shouldTrackCountdown,
  ])

  const parseRequiredTime = (value?: string | null) => {
    if (!value) return null
    const parsed = new Date(value).getTime()
    return Number.isNaN(parsed) ? null : parsed
  }

  const windowTimes = useMemo(() => {
    return {
      roundStart: parseRequiredTime(playersData?.challengeWindow.roundStart),
      roundEnd: parseRequiredTime(playersData?.challengeWindow.roundEnd),
      blueStart: parseRequiredTime(playersData?.challengeWindow.blueStart),
      blueEnd: parseRequiredTime(playersData?.challengeWindow.blueEnd),
      openStart: parseRequiredTime(playersData?.challengeWindow.openStart),
      openEnd: parseRequiredTime(playersData?.challengeWindow.openEnd),
    }
  }, [playersData])

  useEffect(() => {
    if (!playersData) return
    const nowMs = Date.now() + serverOffsetMs
    setPhaseNow(nowMs)
    const nextBoundary = [
      windowTimes.roundStart,
      windowTimes.blueStart,
      windowTimes.blueEnd,
      windowTimes.openStart,
      windowTimes.openEnd,
      windowTimes.roundEnd,
    ]
      .filter((time): time is number => time !== null && time > nowMs)
      .sort((a, b) => a - b)[0]

    if (!nextBoundary) return

    const timeout = setTimeout(() => {
      setPhaseNow(Date.now() + serverOffsetMs)
    }, Math.max(500, nextBoundary - nowMs + 200))

    return () => clearTimeout(timeout)
  }, [
    playersData,
    serverOffsetMs,
    windowTimes.blueEnd,
    windowTimes.blueStart,
    windowTimes.openEnd,
    windowTimes.openStart,
    windowTimes.roundEnd,
    windowTimes.roundStart,
  ])

  const clientPhase = useMemo(() => {
    if (!playersData) return null
    const current = phaseNow
    const roundStart = windowTimes.roundStart
    const roundEnd = windowTimes.roundEnd
    const blueStart = windowTimes.blueStart
    const openStart = windowTimes.openStart

    if (!roundStart || !blueStart || !openStart) {
      return playersData.challengeWindow.phase
    }

    if (current < roundStart) return "before"
    if (roundEnd && current > roundEnd) return "closed"
    if (current < blueStart) return "waiting_blue"

    const blueEnd = windowTimes.blueEnd ?? openStart
    if (current < blueEnd) return "blue"
    if (current < openStart) return "waiting_open"
    if (windowTimes.openEnd && current >= windowTimes.openEnd) return "after_open"
    return "open"
  }, [phaseNow, playersData, windowTimes])

  const effectivePhase = clientPhase ?? playersData?.challengeWindow.phase ?? "open"
  const clientCanChallenge = effectivePhase === "blue" || effectivePhase === "open"
  const canSaveOrder =
    editing && !!playersData && draftPlayers.length === playersData.players.length
  const monthOptions = useMemo(() => {
    if (!playersData) return []
    const values = new Set<string>()
    if (playersData.months?.length) {
      playersData.months.forEach((value) => values.add(value))
    }
    if (playersData.month?.value) {
      values.add(playersData.month.value)
    }
    if (adminMonth) {
      values.add(adminMonth)
    }
    let options = Array.from(values)
      .sort((a, b) => b.localeCompare(a))
      .map((value) => ({ value, label: formatMonthYearPt(value) }))
    if (allowedMax) {
      options = options.filter((option) => option.value <= allowedMax)
    }
    return options
  }, [playersData, adminMonth, allowedMax])

  const closeTargetOptions = useMemo(() => {
    if (!selectedAdminMonth) return []
    const options: Array<{ value: string; label: string }> = []
    let cursor = nextMonthValue(selectedAdminMonth)
    for (let index = 0; index < 12; index += 1) {
      options.push({ value: cursor, label: formatMonthYearPt(cursor) })
      cursor = nextMonthValue(cursor)
    }
    return options
  }, [selectedAdminMonth])

  useEffect(() => {
    if (!selectedAdminMonth) return
    const defaultNext = nextMonthValue(selectedAdminMonth)
    setNextRoundMonth((current) => {
      if (!current || current <= selectedAdminMonth) {
        return defaultNext
      }
      return current
    })
  }, [selectedAdminMonth])

  const refreshPlayers = useCallback(async (
    rankingId?: number,
    monthOverride?: string,
    options?: { bypassCache?: boolean }
  ) => {
    const targetId = rankingId ? String(rankingId) : selectedId
    if (!targetId) return
    const params = new URLSearchParams()
    const monthValue = monthOverride ?? adminMonth
    if (monthValue) {
      params.set("month", monthValue)
    }
    if (options?.bypassCache) {
      params.set("fresh", "1")
    }
    const cacheKey = `${targetId}:${monthValue || "open"}`
    if (!options?.bypassCache) {
      const cached = playersCacheStore.get(cacheKey)
      const now = nowInAppTimeZone().getTime()
      if (cached && now - cached.cachedAt <= PLAYERS_CACHE_TTL_MS) {
        setPlayersData(cached.data)
        return
      }
      const pendingCached = playersInFlightStore.get(cacheKey)
      if (pendingCached) {
        const pendingResult = await pendingCached
        if (!pendingResult.ok) {
          if (isUnauthorizedMessage(pendingResult.message)) {
            redirectToLogin()
            return
          }
          setLoadError(pendingResult.message)
          setLoadingPlayers(false)
          return
        }
        writePlayersClientCache(cacheKey, pendingResult.data)
        setPlayersData(pendingResult.data)
        return
      }
    } else {
      invalidatePlayersCacheForRanking(targetId)
    }
    const url = params.toString()
      ? `/api/rankings/${targetId}/players?${params.toString()}`
      : `/api/rankings/${targetId}/players`
    if (!playersDataRef.current) {
      setLoadingPlayers(true)
    }
    setLoadError(null)

    const pending = apiGet<PlayersResponse>(url, {
      fresh: Boolean(options?.bypassCache),
    })
    playersInFlightStore.set(cacheKey, pending)
    const response = await pending.finally(() => {
      if (playersInFlightStore.get(cacheKey) === pending) {
        playersInFlightStore.delete(cacheKey)
      }
    })

    if (!response.ok) {
      if (isUnauthorizedMessage(response.message)) {
        redirectToLogin()
        return
      }
      setLoadError(response.message)
      setLoadingPlayers(false)
      return
    }

    writePlayersClientCache(cacheKey, response.data)
    setPlayersData(response.data)
    setLoadingPlayers(false)
  }, [adminMonth, redirectToLogin, selectedId])

  const openEditModal = useCallback((player: PlayerItem) => {
    if (!canManage) return
    setEditingPlayer(player)
    setEditForm({
      isBluePoint: Boolean(player.isBluePoint),
      isSuspended: Boolean(player.isSuspended),
      isAccessChallenge: Boolean(player.isAccessChallenge),
    })
    setEditError(null)
  }, [canManage])

  const closeEditModal = useCallback(() => {
    setEditingPlayer(null)
    setEditSaving(false)
    setEditError(null)
  }, [])

  const handleSavePlayer = useCallback(async () => {
    if (!editingPlayer || !playersData) return
    if (!editingPlayer.membershipId) {
      setEditError("Vinculo do jogador nao encontrado.")
      return
    }
    setEditSaving(true)
    setEditError(null)

    const response = await apiPatch<{ membership?: unknown }>(
      `/api/admin/users/${editingPlayer.userId}`,
      {
        membership: {
          id: editingPlayer.membershipId,
          ranking_id: playersData.ranking.id,
          is_blue_point: editForm.isBluePoint,
          is_suspended: editForm.isSuspended,
          is_access_challenge: editForm.isAccessChallenge,
        },
      }
    )

    if (!response.ok) {
      setEditError(response.message)
      setEditSaving(false)
      return
    }

    await refreshPlayers(playersData.ranking.id, adminMonth, { bypassCache: true })
    setEditSaving(false)
    setEditingPlayer(null)
  }, [adminMonth, editForm.isAccessChallenge, editForm.isBluePoint, editForm.isSuspended, editingPlayer, playersData, refreshPlayers])

  const handleChallenge = useCallback(async (playerId: number) => {
    if (!playersData) return
    setActionLoading(playerId)
    setActionError(null)

    const scheduledFor = toDateTimeInputInAppTz(nowInAppTimeZone())

    const response = await apiPost<{ id: number }>("/api/challenges", {
      ranking_id: playersData.ranking.id,
      challenged_id: playerId,
      scheduled_for: scheduledFor,
    })

    if (!response.ok) {
      setActionError(response.message)
      await refreshPlayers(playersData.ranking.id, adminMonth, { bypassCache: true })
      setActionLoading(null)
      return
    }

    markChallengesUpdated()
    await refreshPlayers(playersData.ranking.id, adminMonth, { bypassCache: true })
    setActionLoading(null)
  }, [adminMonth, playersData, refreshPlayers])

  const handleEditToggle = useCallback(() => {
    if (!playersData || !canManage) return
    if (!isOpenMonthSelected) {
      setReorderError("A ordenacao manual so pode ser feita no mes atual.")
      return
    }
    if (!editing) {
      setDraftPlayers(playersData.players)
      setEditing(true)
      setReorderError(null)
      return
    }
    setEditing(false)
    setDraftPlayers([])
    setReorderError(null)
  }, [canManage, editing, isOpenMonthSelected, playersData])

  const handleDragStart = useCallback((
    event: DragEvent<HTMLDivElement>,
    playerId: number
  ) => {
    if (!editing) return
    setDraggingId(playerId)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", String(playerId))
  }, [editing])

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!editing) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [editing])

  const handleDrop = useCallback((
    event: DragEvent<HTMLDivElement>,
    overId: number
  ) => {
    if (!editing) return
    event.preventDefault()
    const payload = event.dataTransfer.getData("text/plain")
    const draggedFromPayload = Number(payload)
    const draggedId = Number.isFinite(draggedFromPayload) && draggedFromPayload > 0
      ? draggedFromPayload
      : draggingId
    if (draggedId === null || draggedId === overId) {
      setDraggingId(null)
      return
    }
    setDraftPlayers((current) => {
      const oldIndex = current.findIndex((player) => player.userId === draggedId)
      const newIndex = current.findIndex((player) => player.userId === overId)
      if (oldIndex === -1 || newIndex === -1) return current
      const next = [...current]
      const [moved] = next.splice(oldIndex, 1)
      next.splice(newIndex, 0, moved)
      return next
    })
    setDraggingId(null)
  }, [draggingId, editing])

  const handleDragEnd = useCallback(() => {
    setDraggingId(null)
  }, [])

  const handleMovePlayer = useCallback((playerId: number, direction: -1 | 1) => {
    if (!editing) return
    setDraftPlayers((current) => {
      const currentIndex = current.findIndex((player) => player.userId === playerId)
      if (currentIndex === -1) return current
      const targetIndex = currentIndex + direction
      if (targetIndex < 0 || targetIndex >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(currentIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
  }, [editing])

  const handleMoveUp = useCallback((playerId: number) => {
    handleMovePlayer(playerId, -1)
  }, [handleMovePlayer])

  const handleMoveDown = useCallback((playerId: number) => {
    handleMovePlayer(playerId, 1)
  }, [handleMovePlayer])

  const handleSaveOrder = useCallback(async () => {
    if (!playersData || !editing) return
    if (!isOpenMonthSelected) {
      setReorderError("A ordenacao manual so pode ser feita no mes atual.")
      return
    }
    setReorderLoading(true)
    setReorderError(null)

    const orderedUserIds = draftPlayers.map((player) => player.userId)
    const response = await apiPost<{ message: string }>(
      `/api/admin/rankings/${playersData.ranking.id}/reorder`,
      {
        orderedUserIds,
        referenceMonth: selectedAdminMonth || playersData.month.value,
      }
    )

    if (!response.ok) {
      setReorderError(response.message)
      setReorderLoading(false)
      return
    }

    await refreshPlayers(playersData.ranking.id, adminMonth, { bypassCache: true })

    setEditing(false)
    setDraftPlayers([])
    setDraggingId(null)
    setReorderLoading(false)
  }, [adminMonth, draftPlayers, editing, isOpenMonthSelected, playersData, refreshPlayers, selectedAdminMonth])

  const handleCancelOrder = useCallback(() => {
    setEditing(false)
    setDraftPlayers([])
    setReorderError(null)
    setDraggingId(null)
  }, [])

  const runAdminAction = useCallback(async (
    action: "recalculate" | "rollover" | "restore"
  ) => {
    if (!playersData) return
    const month = selectedAdminMonth
    if (!month) {
      setAdminActionError("Informe o mes de referencia.")
      return
    }
    if (action === "restore" && !canRestore) {
      setAdminActionError(
        "Restaurar so esta disponivel para o mes aberto."
      )
      return
    }
    if (action === "rollover" && !nextRoundMonth) {
      setAdminActionError("Informe o mes que deve abrir a nova rodada.")
      return
    }

    const includeAll = canManageAll && rolloverAll

    if (action === "rollover" && includeAll) {
      const confirmed = window.confirm(
        "Isso vai fechar e abrir rodadas de TODAS as categorias. Deseja continuar?"
      )
      if (!confirmed) return
    }

    setAdminActionLoading(action)
    setAdminActionError(null)
    setAdminActionSuccess(null)

    const payload: { referenceMonth: string; targetMonth?: string; includeAll?: boolean } = {
      referenceMonth: month,
    }
    if (action === "rollover") {
      payload.targetMonth = nextRoundMonth
      payload.includeAll = includeAll
    }

    const response = await apiPost<{ message: string }>(
      `/api/admin/rankings/${playersData.ranking.id}/${action}`,
      payload
    )

    if (!response.ok) {
      const details = formatAdminIssues(response.issues)
      setAdminActionError(
        details ? `${response.message}\n${details}` : response.message
      )
      setAdminActionLoading(null)
      return
    }

    setAdminActionSuccess(response.data.message)
    if (action === "rollover") {
      const nextMonth = nextRoundMonth || nextMonthValue(month)
      setAdminMonth(nextMonth)
      await refreshPlayers(playersData.ranking.id, nextMonth, { bypassCache: true })
    } else {
      await refreshPlayers(playersData.ranking.id, month, { bypassCache: true })
    }
    setAdminActionLoading(null)
  }, [canManageAll, canRestore, nextRoundMonth, playersData, refreshPlayers, rolloverAll, selectedAdminMonth])

  const categoryCards = useMemo(
    () =>
      rankings.map((category) => (
        <RankingCategoryCard
          key={category.id}
          category={category}
          isSelected={selectedId === String(category.id)}
          onSelect={handleSelectRanking}
        />
      )),
    [handleSelectRanking, rankings, selectedId]
  )
  const categoryGridClassName = useMemo(
    () => getCategoryGridClassName(rankings.length),
    [rankings.length]
  )

  const activePlayerViews = useMemo(() => {
    return deferredActivePlayers.map((player, index) => {
      const badgeClassName =
        "px-1.5 py-0.5 text-[10px] leading-none sm:px-2 sm:py-1 sm:text-xs"
      const name = formatName(player.firstName, player.lastName, player.nickname)
      const positionLabel = editing
        ? `#${index + 1}`
        : player.position > 0
        ? `#${player.position}`
        : "-"
      const canMoveUp = editing && index > 0
      const canMoveDown = editing && index < deferredActivePlayers.length - 1
      const statusBadges: PlayerStatusBadge[] = []

      if (player.isBluePoint) {
        statusBadges.push({
          label: "Ponto azul",
          tone: "info",
          className:
            `${badgeClassName} border-sky-400 bg-sky-500/90 text-white shadow-sm dark:border-sky-300 dark:bg-sky-400/90 dark:text-slate-900`,
        })
      }

      if (player.isAccessChallenge) {
        statusBadges.push({ label: "Acesso", tone: "neutral" })
      }

      if (player.summary) {
        if (player.summary.result !== "pending") {
          statusBadges.push({
            label: player.summary.result === "win" ? "Vitoria" : "Derrota",
            tone: resultTone[player.summary.result],
            className: badgeClassName,
          })
        } else if (player.summary.status) {
          statusBadges.push({
            label: statusLabelMap[player.summary.status],
            tone: statusTone[player.summary.status],
            className: badgeClassName,
          })
        }
      }

      const isSelf = player.userId === (playersData?.viewerId ?? 0)
      const showChallenge = !editing
      const isBluePhase = effectivePhase === "blue"
      const isOpenPhase = effectivePhase === "open"
      const typeAllowed = viewerIsSuspended
        ? false
        : isBluePhase
        ? viewerIsBlue
        : isOpenPhase
        ? !viewerIsBlue || viewerBlueCanChallengeInOpen
        : true
      const targetBlueBlocked = isBluePhase && viewerIsBlue && player.isBluePoint
      const withinRange =
        viewerPosition > 0 &&
        player.position > 0 &&
        player.position < viewerPosition &&
        viewerPosition - player.position <= maxUp
      const accessAllowed =
        viewerIsAccess &&
        Boolean(playersData?.accessThreshold) &&
        player.position >= (playersData?.accessThreshold ?? 0)
      const rangeAllowed = viewerIsAccess ? accessAllowed : withinRange
      const targetHasChallenge = Boolean(player.summary)
      const showChallengeButton =
        showChallenge &&
        !viewerIsSuspended &&
        !targetBlueBlocked &&
        rangeAllowed &&
        !player.isSuspended &&
        !isSelf
      const canChallenge =
        showChallengeButton &&
        clientCanChallenge &&
        typeAllowed &&
        !viewerHasChallenge &&
        !targetHasChallenge
      const challengeDisabled = showChallengeButton && !canChallenge
      const showCountdown =
        !viewerIsSuspended &&
        showChallengeButton &&
        !viewerHasChallenge &&
        !targetHasChallenge &&
        !clientCanChallenge
      const baseRowTone =
        index % 2 === 0
          ? "bg-sky-50/80 dark:bg-slate-900/60"
          : "bg-white dark:bg-slate-800/60"
      const rowTone = player.isBluePoint
        ? "bg-sky-100 dark:bg-sky-900/45"
        : baseRowTone
      const blueHighlight = player.isBluePoint
        ? "border-sky-400/70 ring-1 ring-sky-300/60 dark:border-sky-400/60"
        : ""

      return {
        player,
        name,
        positionLabel,
        canMoveUp,
        canMoveDown,
        statusBadges,
        showChallengeButton,
        challengeDisabled,
        canChallenge,
        showCountdown,
        showAdminEdit: canManage && !editing,
        cardClassName: `${rowTone} ${blueHighlight}`,
      } satisfies ActivePlayerCardView
    })
  }, [
    deferredActivePlayers,
    canManage,
    clientCanChallenge,
    editing,
    effectivePhase,
    maxUp,
    playersData?.accessThreshold,
    playersData?.viewerId,
    viewerHasChallenge,
    viewerIsAccess,
    viewerIsBlue,
    viewerBlueCanChallengeInOpen,
    viewerIsSuspended,
    viewerPosition,
  ])

  const activePlayerCards = useMemo(
    () =>
      activePlayerViews.map((row) => (
        <RankingPlayerCard
          key={row.player.userId}
          row={row}
          isSelected={selectedPlayerId === row.player.userId}
          editing={editing}
          isDragging={draggingId === row.player.userId}
          isActionLoading={actionLoading === row.player.userId}
          countdownText={row.showCountdown ? countdownText : ""}
          onOpenHistory={handleSelectPlayer}
          onChallenge={handleChallenge}
          onOpenEdit={openEditModal}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
        />
      )),
    [
      actionLoading,
      activePlayerViews,
      countdownText,
      draggingId,
      editing,
      handleSelectPlayer,
      handleChallenge,
      handleMoveDown,
      handleMoveUp,
      handleDragEnd,
      handleDrop,
      handleDragOver,
      handleDragStart,
      openEditModal,
      selectedPlayerId,
    ]
  )

  if (loadingRankings) {
    return (
      <div className="space-y-6">
        <div
          className={getCategoryGridClassName(3)}
        >
          {Array.from({ length: 3 }).map((_, index) => (
            <Card
              key={`ranking-skeleton-${index}`}
              className="gap-0 p-0 shadow-none"
            >
              <div className="flex h-full items-center justify-between gap-2 px-3 py-2">
                <Skeleton className="h-3.5 w-28 sm:w-32" />
                <Skeleton className="h-4 w-10 rounded-full" />
              </div>
            </Card>
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (loadError) {
    return (
      <EmptyState
        title="Nao foi possivel carregar o ranking"
        description={loadError}
      />
    )
  }

  if (!rankings.length) {
    return (
      <EmptyState
        title="Nenhum ranking encontrado"
        description="Cadastre categorias para acompanhar os jogadores."
      />
    )
  }

  return (
    <div className="space-y-8">
      <div className={categoryGridClassName}>
        {categoryCards}
      </div>

      {loadingPlayers || !playersData ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {actionError ? (
              <p className="text-sm text-destructive" role="alert">
                {actionError}
              </p>
            ) : null}

            {canManage ? (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Ordenacao manual
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Arraste os jogadores ativos para ajustar a posicao.
                    </p>
                  </div>
                  {editing ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={handleSaveOrder}
                      disabled={reorderLoading || !canSaveOrder}
                    >
                      {reorderLoading ? "Salvando..." : "Salvar ordem"}
                    </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelOrder}
                        disabled={reorderLoading}
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleEditToggle}
                      disabled={
                        playersData.players.length === 0 || !isOpenMonthSelected
                      }
                    >
                      Modo edicao
                    </Button>
                  )}
                </div>
                  {reorderError ? (
                    <p className="mt-2 text-xs text-destructive" role="alert">
                      {reorderError}
                    </p>
                  ) : null}
                </div>
            ) : null}

            {canManage ? (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Administracao da rodada
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Programe datas e mantenha o ranking atualizado.
                    </p>
                  </div>
                  {canManageAll ? (
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/admin/config?rankingId=${playersData.ranking.id}`}
                      >
                        Programar datas
                      </Link>
                    </Button>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(220px,_2fr)_auto] sm:items-end">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="admin-month">Mes referencia</Label>
                      <Select
                        value={selectedAdminMonth}
                        onValueChange={setAdminMonth}
                      >
                        <SelectTrigger id="admin-month">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {monthOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="next-round-month">Abrir rodada em</Label>
                      <Select
                        value={nextRoundMonth}
                        onValueChange={setNextRoundMonth}
                        disabled={!closeTargetOptions.length || !canCloseMonth}
                      >
                        <SelectTrigger id="next-round-month">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {closeTargetOptions.length ? (
                            closeTargetOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem key="empty" value="empty" disabled>
                              Sem opcoes
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {canManageAll ? (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={rolloverAll}
                          onChange={(event) =>
                            setRolloverAll(event.target.checked)
                          }
                        />
                        Fechar todas as categorias (usar com cuidado)
                      </label>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => runAdminAction("recalculate")}
                      disabled={adminActionLoading !== null}
                    >
                      {adminActionLoading === "recalculate"
                        ? "Atualizando..."
                        : "Atualizar ranking"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runAdminAction("rollover")}
                      disabled={adminActionLoading !== null || !canCloseMonth}
                    >
                      {adminActionLoading === "rollover"
                        ? "Fechando..."
                        : "Fechar mes"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => runAdminAction("restore")}
                      disabled={adminActionLoading !== null || !canRestore}
                    >
                      {adminActionLoading === "restore"
                        ? "Restaurando..."
                        : "Restaurar"}
                    </Button>
                    </div>
                  </div>
                </div>
                {adminActionError ? (
                  <p
                    className="mt-2 whitespace-pre-line text-xs text-destructive"
                    role="alert"
                  >
                    {adminActionError}
                  </p>
                ) : null}
                {adminActionSuccess ? (
                  <p className="mt-2 text-xs text-success" role="status">
                    {adminActionSuccess}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-1.5 sm:space-y-3">
              {activePlayers.length ? (
                activePlayerCards
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum jogador ativo encontrado neste ranking.
                </p>
              )}
            </div>

          </div>
          {historyModalOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
              <div
                className="absolute inset-0 bg-black/50"
                onClick={closeHistoryModal}
              />
              <Card className="relative z-10 w-full max-w-3xl shadow-lg">
                <CardHeader className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-lg">
                      Historico de confrontos
                    </CardTitle>
                    <p className="truncate text-xs text-muted-foreground">
                      {historyModalData?.player.name ??
                        (selectedPlayer
                          ? formatName(
                              selectedPlayer.firstName,
                              selectedPlayer.lastName,
                              selectedPlayer.nickname
                            )
                          : "Jogador selecionado")}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={closeHistoryModal}
                    aria-label="Fechar"
                  >
                    <X className="size-4" />
                  </Button>
                </CardHeader>
                <CardContent className="max-h-[75vh] space-y-4 overflow-y-auto">
                  {historyModalLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-28 w-full" />
                      <Skeleton className="h-28 w-full" />
                    </div>
                  ) : historyModalError ? (
                    <p className="text-sm text-destructive">{historyModalError}</p>
                  ) : historyModalData ? (
                    <>
                      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                        <UserAvatar
                          name={historyModalData.player.name}
                          src={historyModalData.player.avatarUrl}
                          size="36px"
                          sizes="36px"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {historyModalData.player.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Posicao atual:{" "}
                            {selectedPlayer && selectedPlayer.position > 0
                              ? `#${selectedPlayer.position}`
                              : "-"}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {historyModalData.months.map((monthBlock) => (
                          <Card key={monthBlock.month.value} className="shadow-none">
                            <CardHeader className="pb-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <CardTitle className="text-sm">
                                  {monthBlock.month.label}
                                </CardTitle>
                                <StatPill
                                  label={
                                    monthBlock.wasBluePoint
                                      ? "Foi ponto azul"
                                      : "Nao foi ponto azul"
                                  }
                                  tone={monthBlock.wasBluePoint ? "info" : "neutral"}
                                  className="text-xs"
                                />
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-2">
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

                              {monthBlock.items.length ? (
                                <div className="space-y-2">
                                  {monthBlock.items.map((challenge) => {
                                    const selectedIsChallenger =
                                      challenge.challenger.id ===
                                      historyModalData.player.userId
                                    const opponent = selectedIsChallenger
                                      ? challenge.challenged
                                      : challenge.challenger
                                    const challengeDate =
                                      challenge.playedAt ?? challenge.scheduledFor
                                    return (
                                      <div
                                        key={`history-${monthBlock.month.value}-${challenge.id}`}
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
                                            historyModalData.player.userId
                                          )}
                                          tone={getPlayerChallengeTone(
                                            challenge,
                                            historyModalData.player.userId
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
                      Sem dados de historico para este jogador.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
          {editingPlayer ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
              <div
                className="absolute inset-0 bg-black/50"
                onClick={closeEditModal}
              />
              <Card className="relative z-10 w-full max-w-lg shadow-lg">
                <CardHeader className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">Editar jogador</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Ajuste o status do jogador no ranking.
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={closeEditModal}
                    aria-label="Fechar"
                  >
                    <X className="size-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Jogador</p>
                    <p className="text-sm font-semibold text-foreground">
                      {formatName(
                        editingPlayer.firstName,
                        editingPlayer.lastName,
                        editingPlayer.nickname
                      )}
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="edit-blue">Ponto azul</Label>
                      <Select
                        value={editForm.isBluePoint ? "yes" : "no"}
                        onValueChange={(value) =>
                          setEditForm((current) => ({
                            ...current,
                            isBluePoint: value === "yes",
                          }))
                        }
                      >
                        <SelectTrigger id="edit-blue">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Sim</SelectItem>
                          <SelectItem value="no">Nao</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-license">Em licenca</Label>
                      <Select
                        value={editForm.isSuspended ? "yes" : "no"}
                        onValueChange={(value) =>
                          setEditForm((current) => ({
                            ...current,
                            isSuspended: value === "yes",
                          }))
                        }
                      >
                        <SelectTrigger id="edit-license">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Sim</SelectItem>
                          <SelectItem value="no">Nao</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-access">Desafio de acesso</Label>
                      <Select
                        value={editForm.isAccessChallenge ? "yes" : "no"}
                        onValueChange={(value) =>
                          setEditForm((current) => ({
                            ...current,
                            isAccessChallenge: value === "yes",
                          }))
                        }
                      >
                        <SelectTrigger id="edit-access">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Sim</SelectItem>
                          <SelectItem value="no">Nao</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {editError ? (
                    <p className="text-xs text-destructive" role="alert">
                      {editError}
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                      variant="ghost"
                      onClick={closeEditModal}
                      disabled={editSaving}
                    >
                      Cancelar
                    </Button>
                    <Button onClick={handleSavePlayer} disabled={editSaving}>
                      {editSaving ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
