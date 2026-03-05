"use client"

import { memo, useEffect, useMemo, useState } from "react"
import { CalendarDays, Flag, Swords } from "lucide-react"

import StatPill, { type StatPillTone } from "@/components/app/StatPill"
import UserAvatar from "@/components/app/UserAvatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { formatDateTimeInAppTz, toDateTimeInputInAppTz } from "@/lib/timezone-client"
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

const getCancelTickMs = (remainingMs: number) => {
  if (remainingMs > 6 * 60 * 60 * 1000) return 60_000
  if (remainingMs > 60 * 60 * 1000) return 30_000
  if (remainingMs > 10 * 60 * 1000) return 5_000
  if (remainingMs > 60 * 1000) return 1_000
  return 500
}

const compactWoName = (name: string) => {
  const withoutNickname = name.replace(/"[^"]*"/g, "").trim()
  const tokens = withoutNickname.split(/\s+/).filter(Boolean)
  const compact = tokens.slice(0, 2).join(" ")
  const base = compact || withoutNickname || name
  return base.length > 22 ? `${base.slice(0, 21)}…` : base
}

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
  canCancel: boolean
  canResult: boolean
}

export type ChallengeCardProps = {
  challenge: ChallengeItem
  isAdmin?: boolean
  onActionComplete?: () => void
  className?: string
}

function ChallengeCardComponent({
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
  const [editChallengerTiebreak, setEditChallengerTiebreak] = useState("")
  const [editChallengedTiebreak, setEditChallengedTiebreak] = useState("")
  const [resultType, setResultType] = useState("score")
  const [resultPlayedAt, setResultPlayedAt] = useState("")
  const [resultChallengerGames, setResultChallengerGames] = useState("")
  const [resultChallengedGames, setResultChallengedGames] = useState("")
  const [resultChallengerTiebreak, setResultChallengerTiebreak] = useState("")
  const [resultChallengedTiebreak, setResultChallengedTiebreak] = useState("")
  const [internalNow, setInternalNow] = useState(() => Date.now())
  const now = internalNow

  const scheduledLabel = formatDateTimeInAppTz(challenge.scheduledFor, {
    second: "2-digit",
  })
  const playedLabel = challenge.playedAt
    ? formatDateTimeInAppTz(challenge.playedAt, { second: "2-digit" })
    : null
  const cancelDeadline = useMemo(() => {
    if (!challenge.cancelWindowClosesAt) return null
    const value = new Date(challenge.cancelWindowClosesAt).getTime()
    return Number.isNaN(value) ? null : value
  }, [challenge.cancelWindowClosesAt])

  useEffect(() => {
    if (isAdmin) return
    if (!cancelDeadline) return
    let cancelled = false
    let timeout: ReturnType<typeof setTimeout> | null = null

    const scheduleTick = () => {
      const nowValue = Date.now()
      setInternalNow(nowValue)

      const remainingMs = cancelDeadline - nowValue
      if (remainingMs <= 0) return

      timeout = setTimeout(() => {
        if (!cancelled) {
          scheduleTick()
        }
      }, getCancelTickMs(remainingMs))
    }

    scheduleTick()

    return () => {
      cancelled = true
      if (timeout) clearTimeout(timeout)
    }
  }, [cancelDeadline, isAdmin])

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
      return `W.O. ${compactWoName(challenge.challenged.name)}`
    }
    if (challenge.challengedWalkover) {
      return `W.O. ${compactWoName(challenge.challenger.name)}`
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

  const formatGames = (games: number | null, tiebreak: number | null) => {
    if (games === null) return "-"
    if (tiebreak !== null) return `${games} (${tiebreak})`
    return String(games)
  }

  const challengerLineScore = (() => {
    if (challenge.status !== "completed") return "-"
    if (challenge.challengerWalkover && challenge.challengedWalkover) return "W.O."
    if (challenge.challengerWalkover) return "W.O."
    if (challenge.challengedWalkover) return "Vencedor"
    return formatGames(challenge.challengerGames, challenge.challengerTiebreak)
  })()

  const challengedLineScore = (() => {
    if (challenge.status !== "completed") return "-"
    if (challenge.challengerWalkover && challenge.challengedWalkover) return "W.O."
    if (challenge.challengerWalkover) return "Vencedor"
    if (challenge.challengedWalkover) return "W.O."
    return formatGames(challenge.challengedGames, challenge.challengedTiebreak)
  })()

  const challengerLineTone: StatPillTone =
    challenge.status !== "completed"
      ? "neutral"
      : challenge.winner === "challenger"
      ? "success"
      : challenge.winner === "challenged"
      ? "danger"
      : "warning"

  const challengedLineTone: StatPillTone =
    challenge.status !== "completed"
      ? "neutral"
      : challenge.winner === "challenged"
      ? "success"
      : challenge.winner === "challenger"
      ? "danger"
      : "warning"

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

  const openResult = () => {
    setResultChallengerGames("")
    setResultChallengedGames("")
    setResultChallengerTiebreak("")
    setResultChallengedTiebreak("")
    setResultType("score")
    setResultPlayedAt(
      toDateTimeInputInAppTz(challenge.playedAt ?? challenge.scheduledFor)
    )
    setActionMode("result")
    setError(null)
  }

  const handleDelete = async () => {
    if (!isAdmin) return

    const confirmed = window.confirm(
      "Tem certeza que deseja apagar este desafio definitivamente? Essa acao nao pode ser desfeita."
    )

    if (!confirmed) return

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
    setEditScheduledFor(toDateTimeInputInAppTz(challenge.scheduledFor))
    setEditPlayedAt(
      toDateTimeInputInAppTz(challenge.playedAt ?? challenge.scheduledFor)
    )
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
    setEditChallengerTiebreak(
      challenge.challengerTiebreak !== null
        ? String(challenge.challengerTiebreak)
        : ""
    )
    setEditChallengedTiebreak(
      challenge.challengedTiebreak !== null
        ? String(challenge.challengedTiebreak)
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
        const challengerTiebreak = editChallengerTiebreak.trim()
          ? Number(editChallengerTiebreak)
          : null
        const challengedTiebreak = editChallengedTiebreak.trim()
          ? Number(editChallengedTiebreak)
          : null

        if (
          (challengerTiebreak !== null && challengedTiebreak === null) ||
          (challengerTiebreak === null && challengedTiebreak !== null)
        ) {
          setError("Informe o tiebreak para ambos os jogadores.")
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
          setError("Informe o tiebreak corretamente.")
          return
        }

        resultPayload = {
          winner: challengerGames > challengedGames ? "challenger" : "challenged",
          played_at: editPlayedAt,
          challenger_games: challengerGames,
          challenged_games: challengedGames,
          challenger_tiebreak: challengerTiebreak,
          challenged_tiebreak: challengedTiebreak,
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

  const handleResultSubmit = async () => {
    const playedAt = resultPlayedAt || undefined

    if (resultType === "score") {
      if (!resultChallengerGames.trim() || !resultChallengedGames.trim()) {
        setError("Informe o placar do resultado.")
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
        setError("Informe o placar do resultado.")
        return
      }

      if (challengerGames === challengedGames) {
        setError("O placar nao pode ser empate.")
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
        setError("Informe o tiebreak para ambos os jogadores.")
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
        setError("Informe o tiebreak corretamente.")
        return
      }

      const winner =
        challengerGames > challengedGames ? "challenger" : "challenged"

      await runAction("result", {
        winner,
        played_at: playedAt,
        challenger_games: challengerGames,
        challenged_games: challengedGames,
        challenger_tiebreak: challengerTiebreak,
        challenged_tiebreak: challengedTiebreak,
      })
      return
    }

    if (resultType === "wo_challenger") {
      await runAction("result", {
        winner: "challenger",
        played_at: playedAt,
        challenged_walkover: true,
      })
      return
    }

    if (resultType === "wo_challenged") {
      await runAction("result", {
        winner: "challenged",
        played_at: playedAt,
        challenger_walkover: true,
      })
      return
    }

    await runAction("result", {
      double_walkover: true,
      played_at: playedAt,
    })
  }

  const handleSchedule = async () => {
    if (!resultPlayedAt) {
      setError("Informe a data do jogo.")
      return
    }

    setLoading("schedule")
    setError(null)
    const response = await apiPatch(`/api/challenges/${challenge.id}`, {
      scheduled_for: resultPlayedAt,
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
    <Card
      className={cn(
        "shadow-none [content-visibility:auto] [contain-intrinsic-size:180px]",
        className
      )}
    >
      <CardContent className="space-y-2.5 p-3.5 sm:p-4">
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

        <div className="space-y-2">
          <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border bg-muted/20 px-2.5 py-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <UserAvatar
                name={challenge.challenger.name}
                src={challenge.challenger.avatarUrl}
                size={32}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {challenge.challenger.name}
                </p>
                <p className="text-xs text-muted-foreground">Desafiante</p>
              </div>
            </div>
            <StatPill
              label={challengerLineScore}
              tone={challengerLineTone}
              className="shrink-0 px-2.5 py-1 text-sm font-semibold"
            />
          </div>

          <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border bg-muted/20 px-2.5 py-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <UserAvatar
                name={challenge.challenged.name}
                src={challenge.challenged.avatarUrl}
                size={32}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {challenge.challenged.name}
                </p>
                <p className="text-xs text-muted-foreground">Desafiado</p>
              </div>
            </div>
            <StatPill
              label={challengedLineScore}
              tone={challengedLineTone}
              className="shrink-0 px-2.5 py-1 text-sm font-semibold"
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/10 px-2.5 py-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3" />
              Desafio: {scheduledLabel}
            </span>
            {playedLabel ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3" />
                Jogo: {playedLabel}
              </span>
            ) : null}
            <span className="ml-auto inline-flex w-full min-w-0 items-center justify-between gap-1.5 text-foreground/80 sm:w-auto sm:justify-end">
              <Flag className="size-3" />
              PLACAR
              <StatPill
                label={scoreLabel}
                tone={scoreTone}
                className="min-w-0 max-w-[60vw] overflow-hidden px-2.5 py-1 text-sm font-bold sm:max-w-[18rem]"
              />
            </span>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {actionMode === "result" ? (
          <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              Informe o horario do jogo e o resultado.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`result-played-${challenge.id}`}>
                  Data do jogo
                </Label>
                <Input
                  id={`result-played-${challenge.id}`}
                  type="datetime-local"
                  step="1"
                  value={resultPlayedAt}
                  onChange={(event) => setResultPlayedAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`result-type-${challenge.id}`}>
                  Tipo de resultado
                </Label>
                <Select value={resultType} onValueChange={setResultType}>
                  <SelectTrigger id={`result-type-${challenge.id}`}>
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
                <Label htmlFor={`result-score-challenger-${challenge.id}`}>
                  Games do desafiante
                </Label>
                <Input
                  id={`result-score-challenger-${challenge.id}`}
                  type="number"
                  min={0}
                  value={resultChallengerGames}
                  onChange={(event) =>
                    setResultChallengerGames(event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`result-score-challenged-${challenge.id}`}>
                  Games do desafiado
                </Label>
                <Input
                  id={`result-score-challenged-${challenge.id}`}
                  type="number"
                  min={0}
                  value={resultChallengedGames}
                  onChange={(event) =>
                    setResultChallengedGames(event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`result-tiebreak-challenger-${challenge.id}`}>
                  Tiebreak do desafiante (opcional)
                </Label>
                <Input
                  id={`result-tiebreak-challenger-${challenge.id}`}
                  type="number"
                  min={0}
                  value={resultChallengerTiebreak}
                  onChange={(event) =>
                    setResultChallengerTiebreak(event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`result-tiebreak-challenged-${challenge.id}`}>
                  Tiebreak do desafiado (opcional)
                </Label>
                <Input
                  id={`result-tiebreak-challenged-${challenge.id}`}
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
                onClick={handleResultSubmit}
                disabled={loading === "result"}
              >
                {loading === "result" ? "Salvando..." : "Salvar resultado"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSchedule}
                disabled={loading === "schedule"}
              >
                {loading === "schedule" ? "Salvando..." : "Salvar horario"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setActionMode(null)}
                disabled={loading === "result" || loading === "schedule"}
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
                  <div className="space-y-2">
                    <Label htmlFor={`edit-tiebreak-challenger-${challenge.id}`}>
                      Tiebreak do desafiante (opcional)
                    </Label>
                    <Input
                      id={`edit-tiebreak-challenger-${challenge.id}`}
                      type="number"
                      min={0}
                      value={editChallengerTiebreak}
                      onChange={(event) =>
                        setEditChallengerTiebreak(event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`edit-tiebreak-challenged-${challenge.id}`}>
                      Tiebreak do desafiado (opcional)
                    </Label>
                    <Input
                      id={`edit-tiebreak-challenged-${challenge.id}`}
                      type="number"
                      min={0}
                      value={editChallengedTiebreak}
                      onChange={(event) =>
                        setEditChallengedTiebreak(event.target.value)
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
                variant="default"
                className="shadow-sm"
                onClick={openResult}
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
            {isAdmin ? (
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

const challengeCardPropsAreEqual = (
  prev: Readonly<ChallengeCardProps>,
  next: Readonly<ChallengeCardProps>
) =>
  prev.challenge === next.challenge &&
  prev.isAdmin === next.isAdmin &&
  prev.onActionComplete === next.onActionComplete &&
  prev.className === next.className

const ChallengeCard = memo(ChallengeCardComponent, challengeCardPropsAreEqual)

export default ChallengeCard
