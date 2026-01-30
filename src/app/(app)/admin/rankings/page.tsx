"use client"

import { useEffect, useState } from "react"

import SectionTitle from "@/components/app/SectionTitle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { apiGet } from "@/lib/http"

type RankingItem = {
  id: number
  name: string
  slug: string
  description: string | null
  activePlayers: number
}

export default function AdminRankingsPage() {
  const [rankings, setRankings] = useState<RankingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRankings = async () => {
    setLoading(true)
    const response = await apiGet<RankingItem[]>("/api/rankings")
    if (!response.ok) {
      setError(response.message)
      setLoading(false)
      return
    }

    setRankings(response.data)
    setLoading(false)
  }

  useEffect(() => {
    loadRankings()
  }, [])

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Administracao de rankings"
        subtitle="Categorias e configuracoes ativas"
        action={<Button>Novo ranking</Button>}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rankings cadastrados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={`ranking-skeleton-${index}`} className="h-20" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            rankings.map((ranking) => (
              <div
                key={ranking.id}
                className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {ranking.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ranking.description ?? "Sem descricao"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {ranking.activePlayers} ativos
                  </Badge>
                  <Badge variant="outline">{ranking.slug}</Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
