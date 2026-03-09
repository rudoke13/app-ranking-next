import nodemailer from "nodemailer"

const env = (key: string) => process.env[key]?.trim() ?? ""

const isConfigured = () =>
  Boolean(env("SMTP_HOST") && env("SMTP_PORT") && env("SMTP_USER") && env("SMTP_PASS"))

const resolvePort = () => {
  const raw = env("SMTP_PORT")
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 587
}

const resolveSecure = (port: number) => port === 465

const resolveFrom = () => {
  const from = env("SMTP_FROM")
  return from || env("SMTP_USER") || "no-reply@tcc.com.br"
}

const normalizeUrlCandidate = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    return new URL(normalized)
  } catch {
    return null
  }
}

const isLocalUrl = (value: URL) =>
  value.hostname === "localhost" ||
  value.hostname === "127.0.0.1" ||
  value.hostname === "0.0.0.0"

const resolveAppUrl = (fallbackUrl?: string | null) => {
  const candidates = [
    env("APP_URL"),
    env("NEXT_PUBLIC_APP_URL"),
    fallbackUrl ?? "",
    env("VERCEL_PROJECT_PRODUCTION_URL"),
    env("VERCEL_URL"),
  ]
    .map(normalizeUrlCandidate)
    .filter((value): value is URL => Boolean(value))

  const firstPublic = candidates.find((value) => !isLocalUrl(value))
  if (firstPublic) {
    return firstPublic.toString().replace(/\/+$/, "")
  }

  const firstLocal = candidates[0]
  if (firstLocal) {
    return firstLocal.toString().replace(/\/+$/, "")
  }

  return "http://localhost:3000"
}

export async function sendPasswordResetEmail({
  to,
  token,
  appUrl,
}: {
  to: string
  token: string
  appUrl?: string | null
}) {
  const link = `${resolveAppUrl(appUrl)}/reset-password?token=${encodeURIComponent(token)}`

  if (!isConfigured()) {
    // In local/dev without SMTP configured, log the link.
    // This keeps the flow working while the admin fills credentials.
    console.log(`[Password Reset] ${to} -> ${link}`)
    return
  }

  const port = resolvePort()
  const transport = nodemailer.createTransport({
    host: env("SMTP_HOST"),
    port,
    secure: resolveSecure(port),
    auth: {
      user: env("SMTP_USER"),
      pass: env("SMTP_PASS"),
    },
  })

  await transport.sendMail({
    from: resolveFrom(),
    to,
    subject: "Recuperacao de senha - Ranking TCC",
    text: `Use o link abaixo para redefinir sua senha:\n\n${link}\n\nSe voce nao solicitou, ignore este email.`,
  })
}
