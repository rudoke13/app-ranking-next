"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

import SectionTitle from "@/components/app/SectionTitle"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { apiGet, apiPatch } from "@/lib/http"

type RankingItem = {
  id: number
  name: string
}

type ConfigData = {
  reference_month: string
  ranking_id: number | null
  round_opens_at: string | null
  round_closes_at: string | null
  blue_point_opens_at: string | null
  blue_point_closes_at: string | null
  open_challenges_at: string | null
  open_challenges_end_at: string | null
}

const toInputValue = (value: string | Date | null) => {
  if (!value) return ""
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (num: number) => String(num).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const businessDay = (monthStart: Date, index: number) => {
  const date = new Date(monthStart)
  let count = 0

  while (count < index) {
    const day = date.getDay()
    if (day !== 0 && day !== 6) {
      count += 1
      if (count === index) break
    }
    date.setDate(date.getDate() + 1)
  }

  return date
}

const setTime = (date: Date, hour: number, minute = 0) => {
  const value = new Date(date)
  value.setHours(hour, minute, 0, 0)
  return value
}

export default function AdminConfigPage() {
  const searchParams = useSearchParams()
  const [rankings, setRankings] = useState<RankingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [rankingId, setRankingId] = useState("general")
  const [initialized, setInitialized] = useState(false)
  const [referenceMonth, setReferenceMonth] = useState("")
  const [form, setForm] = useState({
    round_opens_at: "",
    round_closes_at: "",
    blue_point_opens_at: "",
    blue_point_closes_at: "",
    open_challenges_at: "",
    open_challenges_end_at: "",
  })

  const loadConfig = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    const params = new URLSearchParams()
    if (rankingId !== "general") params.set("rankingId", rankingId)

    const [configResponse, rankingsResponse] = await Promise.all([
      apiGet<ConfigData>(`/api/admin/config?${params.toString()}`),
      apiGet<RankingItem[]>("/api/rankings"),
    ])

    if (!configResponse.ok) {
      setError(configResponse.message)
      setLoading(false)
      return
    }

    if (rankingsResponse.ok) {
      setRankings(rankingsResponse.data)
    }

    setReferenceMonth(configResponse.data.reference_month ?? "")

    setForm({
      round_opens_at: toInputValue(configResponse.data.round_opens_at),
      round_closes_at: toInputValue(configResponse.data.round_closes_at),
      blue_point_opens_at: toInputValue(configResponse.data.blue_point_opens_at),
      blue_point_closes_at: toInputValue(
        configResponse.data.blue_point_closes_at
      ),
      open_challenges_at: toInputValue(configResponse.data.open_challenges_at),
      open_challenges_end_at: toInputValue(
        configResponse.data.open_challenges_end_at
      ),
    })

    setLoading(false)
  }, [rankingId])

  useEffect(() => {
    if (!initialized) {
      const rankingParam = searchParams.get("rankingId")
      if (rankingParam) {
        setRankingId(rankingParam)
      }
      setInitialized(true)
      return
    }

    loadConfig()
  }, [rankingId, initialized, searchParams, loadConfig])

  const handleQuickSet = () => {
    let baseDate = form.round_opens_at
      ? new Date(form.round_opens_at)
      : null
    if (!baseDate || Number.isNaN(baseDate.getTime())) {
      if (referenceMonth) {
        const [yearRaw, monthRaw] = referenceMonth.split("-")
        const year = Number(yearRaw)
        const month = Number(monthRaw)
        if (Number.isFinite(year) && Number.isFinite(month)) {
          baseDate = new Date(year, month - 1, 1, 0, 0, 0, 0)
        }
      }
    }
    if (!baseDate || Number.isNaN(baseDate.getTime())) {
      baseDate = new Date()
    }

    const monthStart = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      1
    )
    const blueDay = businessDay(monthStart, 1)
    const freeDay = businessDay(monthStart, 2)

    setForm((current) => ({
      ...current,
      blue_point_opens_at: toInputValue(setTime(blueDay, 7)),
      blue_point_closes_at: toInputValue(setTime(blueDay, 23, 59)),
      open_challenges_at: toInputValue(setTime(freeDay, 7)),
      open_challenges_end_at: toInputValue(setTime(freeDay, 23, 59)),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    const payload = {
      ranking_id: rankingId === "general" ? null : Number(rankingId),
      round_opens_at: form.round_opens_at,
      round_closes_at: form.round_closes_at,
      blue_point_opens_at: form.blue_point_opens_at,
      blue_point_closes_at: form.blue_point_closes_at,
      open_challenges_at: form.open_challenges_at,
      open_challenges_end_at: form.open_challenges_end_at,
    }

    const response = await apiPatch<ConfigData>("/api/admin/config", payload)
    if (!response.ok) {
      setError(response.message)
      setSaving(false)
      return
    }

    setSuccess("Configuracao salva com sucesso.")
    setSaving(false)
    loadConfig()
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Configuracao da rodada"
        subtitle="Defina abertura, ponto azul e desafios livres"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parametros de calendario</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-52 w-full" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Ranking</Label>
                  <Select value={rankingId} onValueChange={setRankingId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">Geral</SelectItem>
                      {rankings.map((ranking) => (
                        <SelectItem key={ranking.id} value={String(ranking.id)}>
                          {ranking.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                <p>
                  Sugestao rapida: primeiro dia util para ponto azul e segundo
                  dia util para desafios livres.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={handleQuickSet}
                >
                  Aplicar sugestao
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Inicio da rodada</Label>
                  <Input
                    type="datetime-local"
                    value={form.round_opens_at}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        round_opens_at: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Encerramento da rodada</Label>
                  <Input
                    type="datetime-local"
                    value={form.round_closes_at}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        round_closes_at: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ponto azul inicia</Label>
                  <Input
                    type="datetime-local"
                    value={form.blue_point_opens_at}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        blue_point_opens_at: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ponto azul encerra</Label>
                  <Input
                    type="datetime-local"
                    value={form.blue_point_closes_at}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        blue_point_closes_at: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Desafios livres iniciam</Label>
                  <Input
                    type="datetime-local"
                    value={form.open_challenges_at}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        open_challenges_at: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Desafios livres encerram</Label>
                  <Input
                    type="datetime-local"
                    value={form.open_challenges_end_at}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        open_challenges_end_at: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              {success ? (
                <p className="text-sm text-success">{success}</p>
              ) : null}

              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
