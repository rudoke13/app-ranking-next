const DEFAULT_APP_TIMEZONE = "America/Sao_Paulo"
const APP_TIMEZONE =
  process.env.NEXT_PUBLIC_APP_TIMEZONE?.trim() || DEFAULT_APP_TIMEZONE

type DateLike = string | Date | null | undefined

const toDate = (value: DateLike) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const getTimeZoneParts = (value: Date) => {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    const parts = formatter.formatToParts(value)
    const lookup = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? ""

    const year = Number(lookup("year"))
    const month = Number(lookup("month"))
    const day = Number(lookup("day"))
    const hour = Number(lookup("hour"))
    const minute = Number(lookup("minute"))
    const second = Number(lookup("second"))

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

    return { year, month, day, hour, minute, second }
  } catch {
    return null
  }
}

const formatInAppTimeZone = (
  value: DateLike,
  options: Intl.DateTimeFormatOptions,
  fallback: string
) => {
  const date = toDate(value)
  if (!date) return fallback
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: APP_TIMEZONE,
      ...options,
    }).format(date)
  } catch {
    return fallback
  }
}

export const formatDateTimeInAppTz = (
  value: DateLike,
  options: Intl.DateTimeFormatOptions = {},
  fallback = "—"
) =>
  formatInAppTimeZone(
    value,
    {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      ...options,
    },
    fallback
  )

export const formatDateInAppTz = (
  value: DateLike,
  options: Intl.DateTimeFormatOptions = {},
  fallback = "-"
) =>
  formatInAppTimeZone(
    value,
    {
      day: "2-digit",
      month: "2-digit",
      ...options,
    },
    fallback
  )

export const formatMonthYearInAppTz = (value: DateLike, fallback = "-") =>
  formatInAppTimeZone(
    value,
    {
      month: "long",
      year: "numeric",
    },
    fallback
  )

export const toDateTimeInputInAppTz = (value: DateLike) => {
  const date = toDate(value)
  if (!date) return ""
  const parts = getTimeZoneParts(date)
  if (!parts) return ""
  const pad = (num: number) => String(num).padStart(2, "0")
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(
    parts.hour
  )}:${pad(parts.minute)}`
}

export const nowInAppTimeZone = () => {
  const parts = getTimeZoneParts(new Date())
  if (!parts) return new Date()
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
}
