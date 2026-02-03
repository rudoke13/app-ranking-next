const DEFAULT_APP_TIMEZONE = "America/Sao_Paulo"
const APP_TIMEZONE = process.env.APP_TIMEZONE?.trim() || DEFAULT_APP_TIMEZONE

const hasExplicitTimeZone = (value: string) =>
  /[zZ]|([+-]\d{2}:?\d{2})$/.test(value)

const parseDateTimeInTimeZone = (value: string, timeZone: string) => {
  const [datePart, timePart] = value.split("T")
  if (!datePart || !timePart) return null

  const [yearRaw, monthRaw, dayRaw] = datePart.split("-")
  const [hourRaw, minuteRaw, secondRaw] = timePart.split(":")

  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  const second = Number((secondRaw ?? "0").split(".")[0])

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null
  }

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0))
  if (Number.isNaN(utcGuess.getTime())) return null

  try {
    const zoned = new Date(
      utcGuess.toLocaleString("en-US", { timeZone })
    )
    if (Number.isNaN(zoned.getTime())) return null

    const diff = utcGuess.getTime() - zoned.getTime()
    return new Date(utcGuess.getTime() + diff)
  } catch {
    return null
  }
}

export const parseAppDateTime = (value?: string) => {
  if (!value) return null

  if (hasExplicitTimeZone(value)) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  if (value.includes("T")) {
    const parsed = parseDateTimeInTimeZone(value, APP_TIMEZONE)
    if (parsed) return parsed
  }

  const fallback = new Date(value)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

export const normalizeAppDateTimeInput = (value?: string) => {
  if (!value) return value
  if (!value.includes("T")) return value
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    const seconds = String(new Date().getSeconds()).padStart(2, "0")
    return `${value}:${seconds}`
  }
  return value
}
