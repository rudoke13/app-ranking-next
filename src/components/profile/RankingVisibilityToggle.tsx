"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { apiPost, invalidateApiGetCache } from "@/lib/http"
import { markRankingVisibilityUpdated } from "@/lib/preferences/ranking-visibility-client"
import { cn } from "@/lib/utils"

type RankingOption = {
  id: number
  name: string
}

type RankingVisibilityToggleProps = {
  initialShowOtherRankings: boolean
  initialVisibleRankingIds: number[] | null
  availableExtraRankings: RankingOption[]
}

export default function RankingVisibilityToggle({
  initialShowOtherRankings,
  initialVisibleRankingIds,
  availableExtraRankings,
}: RankingVisibilityToggleProps) {
  const router = useRouter()
  const [showOtherRankings, setShowOtherRankings] = useState(
    initialShowOtherRankings
  )
  const availableIdSet = new Set(availableExtraRankings.map((item) => item.id))
  const [visibleRankingIds, setVisibleRankingIds] = useState<number[]>(() => {
    if (initialVisibleRankingIds === null) {
      return availableExtraRankings.map((item) => item.id)
    }
    return initialVisibleRankingIds
      .filter((id) => availableIdSet.has(id))
      .sort((a, b) => a - b)
  })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const persistPreference = async (
    nextShowOtherRankings: boolean,
    nextVisibleRankingIds: number[]
  ) => {
    setError(null)
    setMessage(null)
    setIsSaving(true)

    const response = await apiPost<{
      showOtherRankings: boolean
      visibleRankingIds: number[] | null
    }>("/api/users/me", {
        showOtherRankings: nextShowOtherRankings,
        visibleRankingIds: nextVisibleRankingIds,
    })

    if (!response.ok) {
      setError(response.message ?? "Nao foi possivel atualizar a preferencia.")
      setIsSaving(false)
      return
    }

    invalidateApiGetCache()
    markRankingVisibilityUpdated()
    router.refresh()
    setShowOtherRankings(nextShowOtherRankings)
    setVisibleRankingIds(nextVisibleRankingIds)
    setMessage(
      nextShowOtherRankings
        ? "Visibilidade das categorias extras atualizada."
        : "Somente categorias vinculadas visiveis no ranking e desafios."
    )
    setIsSaving(false)
  }

  const toggleRankingId = (rankingId: number) => {
    const selected = new Set(visibleRankingIds)
    if (selected.has(rankingId)) {
      selected.delete(rankingId)
    } else {
      selected.add(rankingId)
    }
    const nextVisible = Array.from(selected).sort((a, b) => a - b)
    void persistPreference(
      true,
      nextVisible
    )
  }

  const enableOtherRankings = () => {
    const nextVisible =
      visibleRankingIds.length > 0
        ? visibleRankingIds
        : availableExtraRankings.map((item) => item.id)
    void persistPreference(true, nextVisible)
  }

  const showOnlyLinkedRankings = () =>
    void persistPreference(false, visibleRankingIds)

  const selectAll = () =>
    void persistPreference(
      true,
      availableExtraRankings.map((item) => item.id)
    )

  const clearAll = () => void persistPreference(true, [])

  return (
    <div className="space-y-2 rounded-lg border border-border/70 p-3">
      <p className="text-sm font-medium text-foreground">
        Visibilidade de categorias
      </p>
      <p className="text-xs text-muted-foreground">
        Suas categorias vinculadas sempre aparecem.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={showOtherRankings ? "default" : "outline"}
          onClick={enableOtherRankings}
          disabled={isSaving}
        >
          {isSaving && showOtherRankings ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : null}
          Escolher categorias extras
        </Button>
        <Button
          type="button"
          size="sm"
          variant={!showOtherRankings ? "default" : "outline"}
          onClick={showOnlyLinkedRankings}
          disabled={isSaving}
        >
          {isSaving && !showOtherRankings ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : null}
          Mostrar somente vinculadas
        </Button>
      </div>
      <div className="space-y-2 rounded-md border border-border/60 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Escolha exatamente quais categorias extras quer visualizar.
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={selectAll}
              disabled={isSaving || availableExtraRankings.length === 0}
            >
              Marcar todas
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={clearAll}
              disabled={isSaving || visibleRankingIds.length === 0}
            >
              Limpar extras
            </Button>
          </div>
        </div>
        {!showOtherRankings ? (
          <p className="text-xs text-muted-foreground">
            Atualmente voce esta vendo somente categorias vinculadas.
          </p>
        ) : null}
        {availableExtraRankings.length ? (
          <div className="flex flex-wrap gap-2">
            {availableExtraRankings.map((ranking) => {
              const isSelected = visibleRankingIds.includes(ranking.id)
              return (
                <button
                  key={ranking.id}
                  type="button"
                  onClick={() => toggleRankingId(ranking.id)}
                  disabled={isSaving}
                  aria-pressed={isSelected}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition",
                    isSelected
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  {isSelected ? <Check className="size-3" /> : null}
                  {ranking.name}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nao existem categorias extras disponiveis para seu perfil.
          </p>
        )}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {message ? <p className="text-xs text-success">{message}</p> : null}
    </div>
  )
}
