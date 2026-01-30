export function getInitials(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return "?"

  const parts = trimmed.split(/\s+/)
  const first = parts[0]?.[0] ?? ""
  const second = parts[1]?.[0] ?? ""

  return `${first}${second}`.toUpperCase()
}
