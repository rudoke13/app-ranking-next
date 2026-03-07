"use client"

export const CHALLENGE_REFRESH_MARKER_KEY = "challenge_refresh_marker"
export const CHALLENGES_UPDATED_EVENT = "challenges-updated"

export const markChallengesUpdated = () => {
  if (typeof window === "undefined") return null
  const marker = String(Date.now())
  try {
    window.sessionStorage.setItem(CHALLENGE_REFRESH_MARKER_KEY, marker)
  } catch {
    return marker
  }
  window.dispatchEvent(
    new CustomEvent(CHALLENGES_UPDATED_EVENT, {
      detail: { marker },
    })
  )
  return marker
}

export const readChallengesRefreshMarker = () => {
  if (typeof window === "undefined") return null
  return window.sessionStorage.getItem(CHALLENGE_REFRESH_MARKER_KEY)
}

export const consumeChallengesRefreshMarker = () => {
  if (typeof window === "undefined") return null
  const marker = window.sessionStorage.getItem(CHALLENGE_REFRESH_MARKER_KEY)
  if (!marker) return null
  window.sessionStorage.removeItem(CHALLENGE_REFRESH_MARKER_KEY)
  return marker
}
