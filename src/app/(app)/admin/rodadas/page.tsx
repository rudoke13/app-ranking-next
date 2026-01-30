"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import SectionTitle from "@/components/app/SectionTitle"
import { Badge } from "@/components/ui/badge"
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
import { apiGet, apiPost } from "@/lib/http"

type RoundItem = {
  id: number
  title: string
  status: string
  referenceMonth: string
  referenceLabel: string
  ranking: { id: number; name: string } | null
  openChallengesAt: string
  matchesDeadline: string
}

type RankingItem = {
  id: number
  name: string
}

const monthValue = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

const monthLabel = (date: Date) =>
  date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })

export default function AdminRodadasPage() {
  const [rounds, setRounds] = useState<RoundItem[]>([])
  const [rankings, setRankings] = useState<RankingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [month, setMonth] = useState(monthValue(new Date()))
  const [rankingId, setRankingId] = useState("all")
  const [saving, setSaving] = useState(false)

  const months = useMemo(() => {
    const list: { value: string; label: string }[] = []
    const base = new Date()
    for (let index = 0; index < 6; index += 1) {
      const date = new Date(base)
      date.setMonth(base.getMonth() + index)
      list.push({ value: monthValue(date), label: monthLabel(date) })
    }
    return list
  }, [])

  const loadData = async () => {
    setLoading(true)
    const [roundsResponse, rankingsResponse] = await Promise.all([
      apiGet<RoundItem[]>("/api/admin/rounds"),
      apiGet<RankingItem[]>("/api/rankings"),
    ])

    if (!roundsResponse.ok) {
      setError(roundsResponse.message)
      setLoading(false)
      return
    }

    if (rankingsResponse.ok) {
      setRankings(rankingsResponse.data)
    }

    setRounds(roundsResponse.data)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreate = async () => {
    if (!title.trim()) {
      setError("Informe um titulo para a rodada.")
      return
    }

    setSaving(true)
    setError(null)

    const response = await apiPost("/api/admin/rounds", {
      title,
      reference_month: month,
      ranking_id: rankingId === "all" ? null : Number(rankingId),
    })

    if (!response.ok) {
      setError(response.message)
      setSaving(false)
      return
    }

    setTitle("")
    setSaving(false)
    loadData()
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Administracao de rodadas"
        subtitle="Calendario e abertura de desafios"
        action={
          <Button asChild variant="outline">
            <Link href="/admin/config">Configurar datas</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova rodada</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Titulo</Label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Rodada de Setembro"
            />
          </div>
          <div className="space-y-2">
            <Label>Mes</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {months.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ranking</Label>
            <Select value={rankingId} onValueChange={setRankingId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Geral</SelectItem>
                {rankings.map((ranking) => (
                  <SelectItem key={ranking.id} value={String(ranking.id)}>
                    {ranking.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-4">
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Criando..." : "Criar rodada"}
            </Button>
          </div>
          {error ? (
            <p className="text-sm text-destructive md:col-span-4">{error}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rodadas registradas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={`round-skeleton-${index}`} className="h-20" />
              ))}
            </div>
          ) : rounds.length ? (
            rounds.map((round) => (
              <div
                key={round.id}
                className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {round.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {round.referenceLabel} {round.ranking ? `- ${round.ranking.name}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{round.status}</Badge>
                  <Badge variant="outline">{round.referenceMonth}</Badge>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma rodada cadastrada.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
