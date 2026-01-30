const MONTHS_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]

export function formatMonthYearPt(value: string) {
  const [yearRaw, monthRaw] = value.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return value
  }

  const monthName = MONTHS_PT[month - 1] ?? value
  return `${monthName} ${year}`
}

export function shiftMonthValue(value: string, delta: number) {
  const [yearRaw, monthRaw] = value.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return value
  }

  const date = new Date(Date.UTC(year, month - 1, 1))
  date.setUTCMonth(date.getUTCMonth() + delta)

  const nextYear = date.getUTCFullYear()
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${nextYear}-${nextMonth}`
}

export function monthKeyFromValue(value: string) {
  const [yearRaw, monthRaw] = value.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return new Date(Number.NaN)
  }

  return new Date(Date.UTC(year, month - 1, 1))
}

export function monthStartLocalFromValue(value: string) {
  const [yearRaw, monthRaw] = value.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return new Date(Number.NaN)
  }

  return new Date(year, month - 1, 1)
}

export function monthKeyFromDate(value: Date) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return new Date(Number.NaN)
  }

  return new Date(Date.UTC(value.getFullYear(), value.getMonth(), 1))
}
