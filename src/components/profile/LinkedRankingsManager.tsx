"use client"

import { useState } from "react"

import { useDialog } from "@/components/app/DialogProvider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { apiPost } from "@/lib/http"

type LinkedRanking = {
  id: number
  name: string
  position: number | null
}

export default function LinkedRankingsManager({
  rankings,
  initialPendingRankingIds,
}: {
  rankings: LinkedRanking[]
  initialPendingRankingIds: number[]
}) {
  const dialog = useDialog()
  const [pending, setPending] = useState<number[]>(initialPendingRankingIds)
  const [loadingId, setLoadingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!rankings.length) {
    return (
      <span className="text-sm text-muted-foreground">
        Nenhum ranking vinculado.
      </span>
    )
  }

  const requestLeave = async (ranking: LinkedRanking) => {
    const confirmed = await dialog.confirm({
      title: `Pedir para sair de ${ranking.name}?`,
      description:
        "Um administrador vai analisar e aprovar seu pedido. Voce sera notificado da decisao.",
      confirmLabel: "Pedir saida",
    })
    if (!confirmed) return

    setLoadingId(ranking.id)
    setError(null)
    const response = await apiPost(`/api/me/removal-requests`, {
      ranking_id: ranking.id,
    })
    setLoadingId(null)

    if (!response.ok) {
      setError(response.message)
      return
    }

    setPending((current) =>
      current.includes(ranking.id) ? current : [...current, ranking.id]
    )
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {rankings.map((ranking) => {
        const isPending = pending.includes(ranking.id)
        return (
          <div
            key={ranking.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background/60 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{ranking.name}</Badge>
              {ranking.position ? (
                <span className="text-xs text-muted-foreground">
                  Posicao {ranking.position}
                </span>
              ) : null}
            </div>
            {isPending ? (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Pedido de saida pendente
              </span>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={loadingId === ranking.id}
                onClick={() => requestLeave(ranking)}
              >
                {loadingId === ranking.id ? "Enviando..." : "Pedir para sair"}
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
