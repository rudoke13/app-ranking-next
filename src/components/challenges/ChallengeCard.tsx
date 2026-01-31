"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarDays, Flag, Swords } from "lucide-react"

import StatPill, { type StatPillTone } from "@/components/app/StatPill"
import UserAvatar from "@/components/app/UserAvatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiDelete, apiPatch, apiPost } from "@/lib/http"

const statusLabel = {
  scheduled: "Pendente",
  accepted: "Aceito",
  declined: "Recusado",
  completed: "Concluido",
  cancelled: "Cancelado",
} as const

const statusTone = {
  scheduled: "warning",
  accepted: "success",
  declined: "danger",
  completed: "success",
  cancelled: "neutral",
} as const

type ChallengeStatus = keyof typeof statusLabel

export type ChallengeItem = {
  id: number
  status: ChallengeStatus
  winner: "challenger" | "challenged" | null
  ranking: { id: number; name: string; slug: string }
  scheduledFor: string
  playedAt: string | null
  challengerGames: number | null
  challengedGames: number | null
  challengerTiebreak: number | null
  challengedTiebreak: number | null
  challengerWalkover: boolean
  challengedWalkover: boolean
  challengerRetired: boolean
  challengedRetired: boolean
  challenger: { id: number; name: string; avatarUrl: string | null }
  challenged: { id: number; name: string; avatarUrl: string | null }
  cancelWindowOpen: boolean
  cancelWindowClosesAt?: string | null
  canAccept: boolean
  canDecline: boolean
  canCancel: boolean
  canResult: boolean
}

export type ChallengeCardProps = {
  challenge: ChallengeItem
  isAdmin?: boolean
  onActionComplete?: () => void
  className?: string
}

export default function ChallengeCard({
  challenge,
  isAdmin = false,
  onActionComplete,
  className,
}: ChallengeCardProps) {
  const [actionMode, setActionMode] = useState<"result" | "edit" | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editScheduledFor, setEditScheduledFor] = useState("")
  const [editPlayedAt, setEditPlayedAt] = useState("")
  const [editResultType, setEditResultType] = useState("none")
  const [editChallengerGames, setEditChallengerGames] = useState("")
  const [editChallengedGames, setEditChallengedGames] = useState("")
  const [now, setNow] = useState(() => Date.now())

  const formatDateTime = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const scheduledLabel = formatDateTime(challenge.scheduledFor)
  const playedLabel = challenge.playedAt
    ? formatDateTime(challenge.playedAt)
    : null
  const cancelDeadline = useMemo(() => {
    if (!challenge.cancelWindowClosesAt) return null
    const value = new Date(challenge.cancelWindowClosesAt).getTime()
    return Number.isNaN(value) ? null : value
  }, [challenge.cancelWindowClosesAt])

  useEffect(() => {
    if (!cancelDeadline) return
    if (Date.now() >= cancelDeadline) {
      setNow(Date.now())
      return
    }
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [cancelDeadline])

  const cancelWindowOpen =
    cancelDeadline !== null ? now < cancelDeadline : challenge.cancelWindowOpen ?? false
  const statusDisplay: { label: string; tone: StatPillTone } =
    challenge.status === "scheduled"
      ? {
          label: cancelWindowOpen ? "Pendente" : "Valido",
          tone: cancelWindowOpen ? "warning" : "success",
        }
      : {
          label: statusLabel[challenge.status],
          tone: statusTone[challenge.status],
        }

  const toDateTimeInput = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""
    const pad = (val: number) => String(val).padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  const defaultResultType = useMemo(() => {
    if (challenge.status !== "completed") return "none"
    if (challenge.challengerWalkover && challenge.challengedWalkover) {
      return "double_wo"
    }
    if (challenge.challengedWalkover) {
      return "wo_challenger"
    }
    if (challenge.challengerWalkover) {
      return "wo_challenged"
    }
    if (
      challenge.challengerGames !== null &&
      challenge.challengedGames !== null
    ) {
      return "score"
    }
    return "none"
  }, [challenge])

  const scoreLabel = (() => {
    if (challenge.status !== "completed") return "—"
    if (challenge.challengerWalkover && challenge.challengedWalkover) {
      return "W.O. duplo"
    }
    if (challenge.challengerWalkover) {
      return `W.O. ${challenge.challenged.name}`
    }
    if (challenge.challengedWalkover) {
      return `W.O. ${challenge.challenger.name}`
    }
    if (
      challenge.challengerGames === null ||
      challenge.challengedGames === null
    ) {
      return "—"
    }
    const left =
      challenge.challengerTiebreak !== null
        ? `${challenge.challengerGames} (${challenge.challengerTiebreak})`
        : `${challenge.challengerGames}`
    const right =
      challenge.challengedTiebreak !== null
        ? `${challenge.challengedGames} (${challenge.challengedTiebreak})`
        : `${challenge.challengedGames}`
    const base = `${left} x ${right}`
    if (challenge.challengerRetired || challenge.challengedRetired) {
      return `${base} RET`
    }
    return base
  })()

  const scoreTone: StatPillTone =
    challenge.status !== "completed"
      ? "neutral"
      : scoreLabel.startsWith("W.O.") || scoreLabel.includes("RET")
      ? "warning"
      : "success"

  const canCancelNow = challenge.canCancel && (isAdmin || cancelWindowOpen)

  const cancelCountdown = useMemo(() => {
    if (!cancelDeadline || !cancelWindowOpen || isAdmin) return null
    const remainingMs = Math.max(0, cancelDeadline - now)
    const totalSeconds = Math.ceil(remainingMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }, [cancelDeadline, cancelWindowOpen, isAdmin, now])

  const showActions =
    (canCancelNow || challenge.canResult || isAdmin) && actionMode === null

  const runAction = async (endpoint: string, body?: unknown) => {
    setLoading(endpoint)
    setError(null)

    const response = await apiPost(`/api/challenges/${challenge.id}/${endpoint}`, body)
    if (!response.ok) {
      setError(response.message)
      setLoading(null)
      return
    }

    setActionMode(null)
    setLoading(null)
    onActionComplete?.()
  }

  const handleCancel = () => runAction("cancel")
  const handleResult = (winner: "challenger" | "challenged") =>
    runAction("result", { winner })

  const handleDelete = async () => {
    setLoading("delete")
    setError(null)
    const response = await apiDelete(`/api/challenges/${challenge.id}`)
    if (!response.ok) {
      setError(response.message)
      setLoading(null)
      return
    }
    setLoading(null)
    onActionComplete?.()
  }

  const openEdit = () => {
    setEditScheduledFor(toDateTimeInput(challenge.scheduledFor))
    setEditPlayedAt(toDateTimeInput(challenge.playedAt ?? challenge.scheduledFor))
    setEditResultType(defaultResultType)
    setEditChallengerGames(
      challenge.challengerGames !== null
        ? String(challenge.challengerGames)
        : ""
    )
    setEditChallengedGames(
      challenge.challengedGames !== null
        ? String(challenge.challengedGames)
        : ""
    )
    setActionMode("edit")
    setError(null)
  }

  const handleEdit = async () => {
    if (!editScheduledFor) {
      setError("Informe a data do desafio.")
      return
    }

    const resultType = editResultType
    let resultPayload: Record<string, unknown> | undefined

    if (resultType !== "none") {
      if (!editPlayedAt) {
        setError("Informe a data em que foi jogado.")
        return
      }
      if (resultType === "score") {
        if (!editChallengerGames.trim() || !editChallengedGames.trim()) {
          setError("Informe o placar do resultado.")
          return
        }
        const challengerGames = Number(editChallengerGames)
        const challengedGames = Number(editChallengedGames)
        if (
          !Number.isInteger(challengerGames) ||
          !Number.isInteger(challengedGames) ||
          challengerGames < 0 ||
          challengedGames < 0
        ) {
          setError("Informe o placar do resultado.")
          return
        }
        if (challengerGames === challengedGames) {
          setError("O placar nao pode ser empate.")
          return
        }
        resultPayload = {
          winner: challengerGames > challengedGames ? "challenger" : "challenged",
          played_at: editPlayedAt,
          challenger_games: challengerGames,
          challenged_games: challengedGames,
        }
      } else if (resultType === "wo_challenger") {
        resultPayload = {
          winner: "challenger",
          played_at: editPlayedAt,
          challenged_walkover: true,
        }
      } else if (resultType === "wo_challenged") {
        resultPayload = {
          winner: "challenged",
          played_at: editPlayedAt,
          challenger_walkover: true,
        }
      } else if (resultType === "double_wo") {
        resultPayload = {
          double_walkover: true,
          played_at: editPlayedAt,
        }
      }
    }

    setLoading("edit")
    setError(null)
    const response = await apiPatch(`/api/challenges/${challenge.id}`, {
      scheduled_for: editScheduledFor,
      result: resultPayload,
    })

    if (!response.ok) {
      setError(response.message)
      setLoading(null)
      return
    }

    setLoading(null)
    setActionMode(null)
    onActionComplete?.()
  }

  return (
    <Card className={cn("shadow-none", className)}>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Swords className="size-4 text-primary" />
            {challenge.ranking.name}
          </div>
          <StatPill
            label={statusDisplay.label}
            tone={statusDisplay.tone}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar
              name={challenge.challenger.name}
              src={challenge.challenger.avatarUrl}
              size={36}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {challenge.challenger.name}
              </p>
              <p className="text-xs text-muted-foreground">Desafiante</p>
            </div>
          </div>
          <div className="flex w-full min-w-0 flex-col items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:w-auto">
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="size-3" />
              Desafio: {scheduledLabel}
            </span>
            {playedLabel ? (
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="size-3" />
                Jogo: {playedLabel}
              </span>
            ) : null}
            <div className="flex w-full min-w-0 items-center gap-2 text-foreground/70">
              <Flag className="size-3" />
              <StatPill
                label={scoreLabel}
                tone={scoreTone}
                className="min-w-0 max-w-full px-3 py-1 text-sm font-semibold"
              />
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3 sm:justify-end sm:text-right">
            <UserAvatar
              name={challenge.challenged.name}
              src={challenge.challenged.avatarUrl}
              size={36}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {challenge.challenged.name}
              </p>
              <p className="text-xs text-muted-foreground">Desafiado</p>
            </div>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {actionMode === "result" ? (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              Selecione o vencedor para registrar o resultado.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => handleResult("challenger")}
                disabled={loading === "result"}
              >
                Vitoria {challenge.challenger.name}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleResult("challenged")}
                disabled={loading === "result"}
              >
                Vitoria {challenge.challenged.name}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setActionMode(null)}
                disabled={loading === "result"}
              >
                Fechar
              </Button>
            </div>
          </div>
        ) : null}

        {actionMode === "edit" ? (
          <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`edit-date-${challenge.id}`}>Data do desafio</Label>
                <Input
                  id={`edit-date-${challenge.id}`}
                  type="datetime-local"
                  value={editScheduledFor}
                  onChange={(event) => setEditScheduledFor(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`edit-result-${challenge.id}`}>
                  Tipo de resultado
                </Label>
                <Select value={editResultType} onValueChange={setEditResultType}>
                  <SelectTrigger id={`edit-result-${challenge.id}`}>
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
              {editResultType !== "none" ? (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`edit-played-${challenge.id}`}>Jogado em</Label>
                  <Input
                    id={`edit-played-${challenge.id}`}
                    type="datetime-local"
                    value={editPlayedAt}
                    onChange={(event) => setEditPlayedAt(event.target.value)}
                  />
                </div>
              ) : null}
              {editResultType === "score" ? (
                <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`edit-score-challenger-${challenge.id}`}>
                      Games do desafiante
                    </Label>
                    <Input
                      id={`edit-score-challenger-${challenge.id}`}
                      type="number"
                      min={0}
                      value={editChallengerGames}
                      onChange={(event) =>
                        setEditChallengerGames(event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`edit-score-challenged-${challenge.id}`}>
                      Games do desafiado
                    </Label>
                    <Input
                      id={`edit-score-challenged-${challenge.id}`}
                      type="number"
                      min={0}
                      value={editChallengedGames}
                      onChange={(event) =>
                        setEditChallengedGames(event.target.value)
                      }
                    />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={handleEdit}
                disabled={loading === "edit"}
              >
                {loading === "edit" ? "Salvando..." : "Salvar alteracoes"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setActionMode(null)}
                disabled={loading === "edit"}
              >
                Fechar
              </Button>
            </div>
          </div>
        ) : null}

        {showActions ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {canCancelNow ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                disabled={loading === "cancel"}
              >
                <Flag className="size-4" />
                {loading === "cancel" ? "Cancelando..." : "Cancelar"}
              </Button>
            ) : null}
            {challenge.canResult ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setActionMode("result")}
              >
                Resultado
              </Button>
            ) : null}
            {isAdmin ? (
              <Button
                size="sm"
                variant="outline"
                onClick={openEdit}
                disabled={loading === "edit"}
              >
                Editar
              </Button>
            ) : null}
            {isAdmin && challenge.status === "cancelled" ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDelete}
                disabled={loading === "delete"}
              >
                {loading === "delete" ? "Apagando..." : "Apagar"}
              </Button>
            ) : null}
            </div>
            {cancelCountdown ? (
              <p className="text-xs text-muted-foreground">
                Cancelamento expira em {cancelCountdown}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
