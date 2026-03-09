const DEFAULT_COUNTRY_CODE = "55"

export const normalizeWhatsAppPhone = (phone: string | null | undefined) => {
  if (!phone) return null

  let digits = phone.replace(/\D/g, "").replace(/^0+/, "")
  if (!digits) return null

  if (digits.length === 10 || digits.length === 11) {
    digits = `${DEFAULT_COUNTRY_CODE}${digits}`
  }

  if (digits.length < 12 || digits.length > 15) {
    return null
  }

  return digits
}

export const buildWhatsAppUrl = (
  phone: string | null | undefined,
  message?: string | null
) => {
  const normalizedPhone = normalizeWhatsAppPhone(phone)
  if (!normalizedPhone) return null

  const text = message?.trim()
  if (!text) {
    return `https://wa.me/${normalizedPhone}`
  }

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(text)}`
}
