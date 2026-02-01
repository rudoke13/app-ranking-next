"use client"

import { useEffect, useMemo, useState, type DragEvent } from "react"
import Link from "next/link"
import { GripVertical, Pencil, Swords, TriangleAlert, Users, X } from "lucide-react"

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
import { apiGet, apiPatch, apiPost } from "@/lib/http"
import { formatMonthYearPt, shiftMonthValue } from "@/lib/date"

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

type RankingItem = {
  id: number
  name: string
  slug: string
  description?: string | null
  activePlayers: number
  isUserMember?: boolean
}

type PlayerSummary = {
  role: "challenger" | "challenged"
  roleLabel: string
  opponentName: string
  position: number | null
  status: "scheduled" | "accepted" | "declined" | "completed" | "cancelled"
  result: "win" | "loss" | "pending"
}

type PlayerItem = {
  membershipId: number
  userId: number
  position: number
  points: number
  firstName: string
  lastName: string
  nickname: string | null
  avatarUrl: string | null
  isBluePoint: boolean
  isAccessChallenge: boolean
  isSuspended: boolean
  isLocked: boolean
  summary: PlayerSummary | null
}

type PlayersResponse = {
  viewerId: number
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

export type RankingListProps = {
  isAdmin?: boolean
}

export default function RankingList({ isAdmin = false }: RankingListProps) {
  const [rankings, setRankings] = useState<RankingItem[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [playersData, setPlayersData] = useState<PlayersResponse | null>(null)
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
  const [now, setNow] = useState(() => Date.now())
  const [releaseFlashAt, setReleaseFlashAt] = useState<number | null>(null)
  const [editingPlayer, setEditingPlayer] = useState<PlayerItem | null>(null)
  const [editForm, setEditForm] = useState({
    isBluePoint: false,
    isSuspended: false,
    isAccessChallenge: false,
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const resetSelectionState = () => {
    setEditing(false)
    setDraftPlayers([])
    setReorderError(null)
    setDraggingId(null)
    setAdminActionError(null)
    setAdminActionSuccess(null)
    setAdminActionLoading(null)
    setAdminMonth("")
    setNextRoundMonth("")
    setEditingPlayer(null)
    setEditSaving(false)
    setEditError(null)
  }

  const handleSelectRanking = (nextId: string) => {
    if (nextId === selectedId) return
    setSelectedId(nextId)
    resetSelectionState()
  }

  useEffect(() => {
    let mounted = true

    const loadRankings = async () => {
      setLoadingRankings(true)
      setLoadError(null)
      const response = await apiGet<RankingItem[]>("/api/rankings")
      if (!mounted) return

      if (!response.ok) {
        setLoadError(response.message)
        setLoadingRankings(false)
        return
      }

      setRankings(response.data)
      const ordered = [
        ...response.data.filter((item) => item.isUserMember),
        ...response.data.filter((item) => !item.isUserMember),
      ]
      setRankings(ordered)
      setSelectedId((current) =>
        current || (ordered[0] ? String(ordered[0].id) : "")
      )
      setLoadingRankings(false)
    }

    loadRankings()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const loadPlayers = async () => {
      if (!selectedId) return
      setLoadingPlayers(true)
      setLoadError(null)
      const params = new URLSearchParams()
      if (adminMonth) {
        params.set("month", adminMonth)
      }
      const url = params.toString()
        ? `/api/rankings/${selectedId}/players?${params.toString()}`
        : `/api/rankings/${selectedId}/players`
      const response = await apiGet<PlayersResponse>(url)
      if (!mounted) return

      if (!response.ok) {
        setLoadError(response.message)
        setLoadingPlayers(false)
        return
      }

      setPlayersData(response.data)
      setLoadingPlayers(false)
    }

    loadPlayers()

    return () => {
      mounted = false
    }
  }, [selectedId, adminMonth])

  const openMonthValue = playersData?.currentMonth ?? ""
  const requestedMonthValue = playersData?.month?.value ?? ""
  const selectedAdminMonth = adminMonth || requestedMonthValue
  const isOpenMonthSelected = !openMonthValue || selectedAdminMonth === openMonthValue
  const canRestore = Boolean(selectedAdminMonth) && isOpenMonthSelected
  const canCloseMonth = Boolean(selectedAdminMonth) && isOpenMonthSelected
  const allowedMaxBase = openMonthValue || requestedMonthValue
  const allowedMax =
    adminMonth && adminMonth > allowedMaxBase ? adminMonth : allowedMaxBase

  const activePlayers = editing
    ? draftPlayers
    : playersData?.players ?? []

  const viewerEntry =
    playersData?.players.find((player) => player.userId === playersData.viewerId) ??
    playersData?.suspended.find((player) => player.userId === playersData.viewerId) ??
    null
  const viewerPosition = viewerEntry?.position ?? 0
  const viewerIsBlue = Boolean(viewerEntry?.isBluePoint)
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
      return { deadline: blueStartAt, label: "Ponto azul em" }
    }
    return { deadline: null as number | null, label: "" }
  }, [playersData, phase, viewerIsBlue, blueStartAt, openStartAt])

  useEffect(() => {
    if (!countdownInfo.deadline) return
    if (Date.now() >= countdownInfo.deadline) {
      setNow(Date.now())
      return
    }
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [countdownInfo.deadline])

  const countdownLabel = useMemo(() => {
    if (!countdownInfo.deadline) return null
    const remainingMs = countdownInfo.deadline - now
    if (remainingMs <= 0) return "00:00"
    const totalSeconds = Math.ceil(remainingMs / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    const hh = String(hours).padStart(2, "0")
    const mm = String(minutes).padStart(2, "0")
    const ss = String(seconds).padStart(2, "0")
    return hours > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`
  }, [countdownInfo.deadline, now])

  const countdownText =
    countdownLabel && countdownInfo.label
      ? `${countdownInfo.label} ${countdownLabel}`
      : null

  useEffect(() => {
    if (!countdownInfo.deadline) return
    if (Date.now() >= countdownInfo.deadline) return
    const timeout = setTimeout(() => {
      setNow(Date.now())
      setReleaseFlashAt(Date.now())
    }, Math.max(0, countdownInfo.deadline - Date.now()) + 50)
    return () => clearTimeout(timeout)
  }, [countdownInfo.deadline])

  useEffect(() => {
    if (!releaseFlashAt) return
    const timeout = setTimeout(() => setReleaseFlashAt(null), 2500)
    return () => clearTimeout(timeout)
  }, [releaseFlashAt])


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

  const clientPhase = useMemo(() => {
    if (!playersData) return null
    const current = now
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
  }, [playersData, now, windowTimes])

  const effectivePhase = clientPhase ?? playersData?.challengeWindow.phase ?? "open"
  const clientCanChallenge = effectivePhase === "blue" || effectivePhase === "open"
  const showReleaseFlash = Boolean(releaseFlashAt) && clientCanChallenge

  const getRuleMessage = () => {
    if (!playersData) return ""
    const message = playersData.challengeWindow.message?.trim()
    if (message) return message
    const phase = effectivePhase
    const formatDate = (value?: string | null) =>
      value
        ? new Date(value).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : ""
    if (phase === "before") {
      return `Rodada abre em ${formatDate(
        playersData.challengeWindow.roundStart
      )}.`
    }
    if (phase === "waiting_blue") {
      return `Os desafios ainda nao estao liberados. A janela de ponto azul inicia em ${formatDate(
        playersData.challengeWindow.unlockAt
      )}.`
    }
    if (phase === "closed") {
      return "Periodo da rodada encerrado."
    }
    if (phase === "blue") {
      return "Periodo exclusivo para ponto azul."
    }
    if (phase === "waiting_open") {
      return `Os desafios livres serao liberados em ${formatDate(
        playersData.challengeWindow.openStart
      )}.`
    }
    if (phase === "after_open") {
      return "Janela de desafios livres encerrada."
    }
    return "Desafios livres ativos."
  }

  const canSaveOrder =
    editing && !!playersData && draftPlayers.length === playersData.players.length

  const monthOptions = (() => {
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
  })()

  const closeTargetOptions = (() => {
    if (!selectedAdminMonth) return []
    const options: Array<{ value: string; label: string }> = []
    let cursor = nextMonthValue(selectedAdminMonth)
    for (let index = 0; index < 12; index += 1) {
      options.push({ value: cursor, label: formatMonthYearPt(cursor) })
      cursor = nextMonthValue(cursor)
    }
    return options
  })()

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

  const refreshPlayers = async (rankingId?: number, monthOverride?: string) => {
    const targetId = rankingId ? String(rankingId) : selectedId
    if (!targetId) return
    const params = new URLSearchParams()
    const monthValue = monthOverride ?? adminMonth
    if (monthValue) {
      params.set("month", monthValue)
    }
    const url = params.toString()
      ? `/api/rankings/${targetId}/players?${params.toString()}`
      : `/api/rankings/${targetId}/players`
    setLoadingPlayers(true)
    setLoadError(null)

    const response = await apiGet<PlayersResponse>(url)

    if (!response.ok) {
      setLoadError(response.message)
      setLoadingPlayers(false)
      return
    }

    setPlayersData(response.data)
    setLoadingPlayers(false)
  }

  const openEditModal = (player: PlayerItem) => {
    if (!isAdmin) return
    setEditingPlayer(player)
    setEditForm({
      isBluePoint: Boolean(player.isBluePoint),
      isSuspended: Boolean(player.isSuspended),
      isAccessChallenge: Boolean(player.isAccessChallenge),
    })
    setEditError(null)
  }

  const closeEditModal = () => {
    setEditingPlayer(null)
    setEditSaving(false)
    setEditError(null)
  }

  const handleSavePlayer = async () => {
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

    await refreshPlayers(playersData.ranking.id, adminMonth)
    setEditSaving(false)
    setEditingPlayer(null)
  }

  const handleChallenge = async (playerId: number) => {
    if (!playersData) return
    setActionLoading(playerId)
    setActionError(null)

    const monthValue = playersData.month?.value
    const scheduledFor = monthValue ? `${monthValue}-01T12:00` : undefined

    const response = await apiPost<{ id: number }>("/api/challenges", {
      ranking_id: playersData.ranking.id,
      challenged_id: playerId,
      scheduled_for: scheduledFor,
    })

    if (!response.ok) {
      setActionError(response.message)
      setActionLoading(null)
      return
    }

    await refreshPlayers(playersData.ranking.id, adminMonth)
    setActionLoading(null)
  }

  const handleEditToggle = () => {
    if (!playersData || !isAdmin) return
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
  }

  const handleDragStart = (
    event: DragEvent<HTMLDivElement>,
    playerId: number
  ) => {
    if (!editing) return
    setDraggingId(playerId)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", String(playerId))
  }

  const handleDragOver = (
    event: DragEvent<HTMLDivElement>,
    overId: number
  ) => {
    if (!editing || draggingId === null || draggingId === overId) return
    event.preventDefault()
    setDraftPlayers((current) => {
      const oldIndex = current.findIndex((player) => player.userId === draggingId)
      const newIndex = current.findIndex((player) => player.userId === overId)
      if (oldIndex === -1 || newIndex === -1) return current
      const next = [...current]
      const [moved] = next.splice(oldIndex, 1)
      next.splice(newIndex, 0, moved)
      return next
    })
  }

  const handleDragEnd = () => {
    setDraggingId(null)
  }

  const handleSaveOrder = async () => {
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

    await refreshPlayers(playersData.ranking.id, adminMonth)

    setEditing(false)
    setDraftPlayers([])
    setDraggingId(null)
    setReorderLoading(false)
  }

  const handleCancelOrder = () => {
    setEditing(false)
    setDraftPlayers([])
    setReorderError(null)
    setDraggingId(null)
  }

  const runAdminAction = async (
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

    setAdminActionLoading(action)
    setAdminActionError(null)
    setAdminActionSuccess(null)

    const payload: { referenceMonth: string; targetMonth?: string } = {
      referenceMonth: month,
    }
    if (action === "rollover") {
      payload.targetMonth = nextRoundMonth
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
      await refreshPlayers(playersData.ranking.id, nextMonth)
    } else {
      await refreshPlayers(playersData.ranking.id, month)
    }
    setAdminActionLoading(null)
  }

  if (loadingRankings) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={`ranking-skeleton-${index}`} className="shadow-none">
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
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
      <div className="grid gap-4 md:grid-cols-3">
        {rankings.map((category) => (
          <Card
            key={category.id}
            className={
              selectedId === String(category.id)
                ? "border-primary/40 bg-primary/5 shadow-none"
                : "shadow-none"
            }
            role="button"
            tabIndex={0}
            onClick={() => handleSelectRanking(String(category.id))}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                handleSelectRanking(String(category.id))
              }
            }}
          >
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                {category.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="size-4" />
                {category.activePlayers} jogadores ativos
              </div>
              <p className="text-xs text-muted-foreground">
                {category.description || "Categoria em andamento"}
              </p>
            </CardContent>
          </Card>
        ))}
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
            <div className="rounded-lg border border-warning/30 bg-warning/15 p-4 text-sm text-warning-foreground">
              <div className="flex items-center gap-2 font-semibold">
                <TriangleAlert className="size-4" />
                Regra da rodada
              </div>
              <div className="mt-1 space-y-1 text-xs text-warning-foreground/80">
                <p>{getRuleMessage()}</p>
                {playersData.challengeWindow.requiresBlue ? (
                  <p>Somente jogadores ponto azul podem desafiar.</p>
                ) : null}
                {playersData.challengeWindow.requiresRegular ? (
                  <p>Somente jogadores regulares podem desafiar.</p>
                ) : null}
                {playersData.accessThreshold ? (
                  <p>Jogadores de acesso so podem desafiar em desafios livres.</p>
                ) : null}
                {playersData.accessThreshold ? (
                  <p>
                    Jogadores de acesso podem desafiar a partir da posicao{" "}
                    {playersData.accessThreshold}.
                  </p>
                ) : null}
                {playersData.accessThreshold ? (
                  <p>Se perderem um desafio de acesso, vao para a ultima posicao.</p>
                ) : null}
              </div>
            </div>
            {showReleaseFlash ? (
              <div className="rounded-lg border border-success/40 bg-success/10 px-4 py-2 text-sm text-success-foreground">
                Desafios liberados agora. Corra para desafiar!
              </div>
            ) : null}

            {isAdmin ? (
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

            {isAdmin ? (
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
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/admin/config?rankingId=${playersData.ranking.id}`}
                    >
                      Programar datas
                    </Link>
                  </Button>
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
                activePlayers.map((player, index) => {
                    const badgeClassName =
                      "px-1.5 py-0.5 text-[10px] leading-none sm:px-2 sm:py-1 sm:text-xs"
                    const name = formatName(
                      player.firstName,
                      player.lastName,
                      player.nickname
                    )
                    const positionLabel =
                      player.position > 0 ? `#${player.position}` : "-"
                    const statusBadges: Array<{
                      label: string
                      tone: StatPillTone
                      className?: string
                    }> = []

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
                          label:
                            player.summary.result === "win"
                              ? "Vitoria"
                              : "Derrota",
                          tone: resultTone[player.summary.result],
                          className: badgeClassName,
                        })
                      } else if (player.summary.status) {
                        const labelMap: Record<PlayerSummary["status"], string> = {
                          scheduled: "Pendente",
                          accepted: "Aceito",
                          declined: "Recusado",
                          completed: "Concluido",
                          cancelled: "Cancelado",
                        }

                        statusBadges.push({
                          label: labelMap[player.summary.status],
                          tone: statusTone[player.summary.status],
                          className: badgeClassName,
                        })
                      }
                    }

                    const isSelf = player.userId === playersData.viewerId
                    const showChallenge = !editing
                    const isBluePhase = effectivePhase === "blue"
                    const isOpenPhase = effectivePhase === "open"
                    const typeAllowed = viewerIsSuspended
                      ? false
                      : isBluePhase
                      ? viewerIsBlue
                      : isOpenPhase
                      ? !viewerIsBlue
                      : true
                    const withinRange =
                      viewerPosition > 0 &&
                      player.position > 0 &&
                      player.position < viewerPosition &&
                      viewerPosition - player.position <= maxUp
                    const accessAllowed =
                      viewerIsAccess &&
                      !!playersData.accessThreshold &&
                      player.position >= playersData.accessThreshold
                    const rangeAllowed = viewerIsAccess ? accessAllowed : withinRange
                    const targetHasChallenge = Boolean(player.summary)
                    const canChallenge =
                      showChallenge &&
                      clientCanChallenge &&
                      typeAllowed &&
                      rangeAllowed &&
                      !viewerHasChallenge &&
                      !targetHasChallenge &&
                      !player.isSuspended &&
                      !isSelf
                    const showCountdown =
                      Boolean(countdownText) &&
                      !viewerIsSuspended &&
                      showChallenge &&
                      rangeAllowed &&
                      !viewerHasChallenge &&
                      !targetHasChallenge &&
                      !player.isSuspended &&
                      !isSelf
                    const isDragging = draggingId === player.userId
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
                    const showAdminEdit = isAdmin && !editing

                    return (
                      <Card
                        key={player.userId}
                        className={`shadow-none ${
                          editing ? "cursor-grab border-dashed" : ""
                        } py-2 sm:py-6 ${rowTone} ${blueHighlight} ${
                          isDragging ? "ring-2 ring-primary/30 opacity-70" : ""
                        }`}
                        draggable={editing}
                        onDragStart={(event) =>
                          handleDragStart(event, player.userId)
                        }
                        onDragOver={(event) => handleDragOver(event, player.userId)}
                        onDrop={handleDragEnd}
                        onDragEnd={handleDragEnd}
                        aria-grabbed={editing && isDragging}
                      >
                        <CardContent className="flex items-start justify-between gap-2 px-3 sm:items-center sm:gap-3 sm:px-6">
                          <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-4">
                            {editing ? (
                              <div className="flex size-6 items-center justify-center text-muted-foreground sm:size-8">
                                <GripVertical className="size-3.5 sm:size-5" />
                              </div>
                            ) : null}
                            <UserAvatar
                              name={name}
                              src={player.avatarUrl}
                              size="clamp(26px, 8vw, 36px)"
                            />
                            <div className="min-w-0 space-y-1.5">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground shadow-sm sm:size-9 sm:text-xs">
                                  {positionLabel}
                                </div>
                                <p className="truncate text-[12px] font-semibold text-foreground sm:text-sm sm:whitespace-normal">
                                  {name}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {statusBadges.length ? (
                                  statusBadges.map((status) => (
                                    <StatPill
                                      key={`${player.userId}-${status.label}`}
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
                              {showCountdown ? (
                                <p className="text-[10px] font-semibold text-destructive sm:text-xs">
                                  {countdownText}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          {showChallenge || showAdminEdit ? (
                            <div className="flex shrink-0 flex-row flex-wrap items-center gap-1.5 sm:w-auto sm:flex-row sm:items-center">
                              {showChallenge ? (
                                <Button
                                  className="h-8 w-8 px-0 text-[11px] sm:h-9 sm:w-auto sm:px-4 sm:text-sm"
                                  disabled={
                                    !canChallenge ||
                                    actionLoading === player.userId
                                  }
                                  onClick={() => handleChallenge(player.userId)}
                                  aria-label="Desafiar"
                                >
                                  <Swords className="size-4 sm:hidden" />
                                  <span className="hidden sm:inline">
                                  {actionLoading === player.userId
                                    ? "Enviando..."
                                    : "Desafiar"}
                                  </span>
                                </Button>
                              ) : null}
                              {showAdminEdit ? (
                                <Button
                                  className="h-8 w-8 px-0 text-[11px] sm:h-9 sm:w-auto sm:px-4 sm:text-sm"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEditModal(player)}
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
                })
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum jogador ativo encontrado neste ranking.
                </p>
              )}
            </div>
          </div>
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
