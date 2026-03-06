const TRUE_VALUES = new Set(["1", "true", "yes", "on"])
const FALSE_VALUES = new Set(["0", "false", "no", "off"])

export const SHOW_OTHER_RANKINGS_COOKIE = "show_other_rankings"
export const VISIBLE_RANKING_IDS_COOKIE = "visible_ranking_ids"

const readCookieValue = (
  cookieHeader: string | null | undefined,
  cookieName: string
) => {
  if (!cookieHeader) return null

  const pairs = cookieHeader.split(";")
  for (const pair of pairs) {
    const separator = pair.indexOf("=")
    if (separator <= 0) continue
    const key = pair.slice(0, separator).trim()
    if (key !== cookieName) continue
    const rawValue = pair.slice(separator + 1).trim()
    try {
      return decodeURIComponent(rawValue)
    } catch {
      return rawValue
    }
  }

  return null
}

const normalizeRankingIds = (ids: number[]) => {
  const normalized = new Set<number>()
  for (const value of ids) {
    if (!Number.isInteger(value)) continue
    if (value <= 0) continue
    normalized.add(value)
  }
  return Array.from(normalized).sort((a, b) => a - b)
}

export const parseShowOtherRankingsValue = (
  value: string | null | undefined
): boolean => {
  if (!value) return true
  const normalized = value.trim().toLowerCase()
  if (FALSE_VALUES.has(normalized)) return false
  if (TRUE_VALUES.has(normalized)) return true
  return true
}

export const serializeShowOtherRankingsValue = (value: boolean) =>
  value ? "1" : "0"

export const parseVisibleRankingIdsValue = (
  value: string | null | undefined
): number[] | null => {
  if (value === null || value === undefined) return null

  const trimmed = value.trim()
  if (!trimmed) return []

  const parsed = trimmed
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item))

  return normalizeRankingIds(parsed)
}

export const serializeVisibleRankingIdsValue = (ids: number[]) =>
  normalizeRankingIds(ids).join(",")

export const readShowOtherRankingsFromCookieHeader = (
  cookieHeader: string | null | undefined
) => {
  return parseShowOtherRankingsValue(
    readCookieValue(cookieHeader, SHOW_OTHER_RANKINGS_COOKIE)
  )
}

export const readVisibleRankingIdsFromCookieHeader = (
  cookieHeader: string | null | undefined
) =>
  parseVisibleRankingIdsValue(
    readCookieValue(cookieHeader, VISIBLE_RANKING_IDS_COOKIE)
  )
