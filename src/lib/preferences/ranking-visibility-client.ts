"use client"

export const RANKING_VISIBILITY_REFRESH_MARKER_KEY =
  "ranking_visibility_refresh_marker"
export const RANKING_VISIBILITY_UPDATED_EVENT = "ranking-visibility-updated"

export const markRankingVisibilityUpdated = () => {
  if (typeof window === "undefined") return null
  const marker = String(Date.now())
  try {
    window.sessionStorage.setItem(
      RANKING_VISIBILITY_REFRESH_MARKER_KEY,
      marker
    )
  } catch {
    return marker
  }
  window.dispatchEvent(
    new CustomEvent(RANKING_VISIBILITY_UPDATED_EVENT, {
      detail: { marker },
    })
  )
  return marker
}

export const readRankingVisibilityRefreshMarker = () => {
  if (typeof window === "undefined") return null
  return window.sessionStorage.getItem(RANKING_VISIBILITY_REFRESH_MARKER_KEY)
}
