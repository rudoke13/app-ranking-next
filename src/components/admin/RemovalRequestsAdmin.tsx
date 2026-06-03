"use client"

import { useCallback, useEffect, useState } from "react"

import { useDialog } from "@/components/app/DialogProvider"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { apiGet, apiPost } from "@/lib/http"

type RemovalRequest = {
  id: number
  userName: string
  rankingName: string
  reason: string | null
  createdAt: string | null
}

const formatDate = (iso: string | null) => {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function RemovalRequestsAdmin() {
  const dialog = useDialog()
  const [items, setItems] = useState<RemovalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const response = await apiGet<{ items: RemovalRequest[] }>(
      "/api/admin/removal-requests",
      { fresh: true }
    )
    if (response.ok) {
      setItems(response.data.items)
    } else {
      setError(response.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const resolve = async (item: RemovalRequest, action: "approve" | "reject") => {
    const confirmed = await dialog.confirm({
      title:
        action === "approve"
          ? `Aprovar saida de ${item.userName}?`
          : `Recusar saida de ${item.userName}?`,
      description:
        action === "approve"
          ? `${item.userName} sera removido de "${item.rankingName}" e as posicoes serao reorganizadas. O jogador sera notificado.`
          : `O pedido de ${item.userName} em "${item.rankingName}" sera recusado. O jogador sera notificado.`,
      confirmLabel: action === "approve" ? "Aprovar" : "Recusar",
      destructive: action === "approve",
    })
    if (!confirmed) return

    setActionId(item.id)
    setError(null)
    const response = await apiPost(
      `/api/admin/removal-requests/${item.id}/${action}`
    )
    setActionId(null)

    if (!response.ok) {
      setError(response.message)
      return
    }

    setItems((current) => current.filter((entry) => entry.id !== item.id))
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum pedido de saida pendente.
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-lg border bg-background/60 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">
                  {item.userName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Pediu para sair de{" "}
                  <span className="font-medium text-foreground">
                    {item.rankingName}
                  </span>
                </p>
                {item.reason ? (
                  <p className="text-xs text-muted-foreground">
                    Motivo: {item.reason}
                  </p>
                ) : null}
                {item.createdAt ? (
                  <p className="text-[11px] text-muted-foreground">
                    {formatDate(item.createdAt)}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionId === item.id}
                  onClick={() => resolve(item, "reject")}
                >
                  Recusar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={actionId === item.id}
                  onClick={() => resolve(item, "approve")}
                >
                  {actionId === item.id ? "..." : "Aprovar"}
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
