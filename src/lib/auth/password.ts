import bcrypt from "bcryptjs"

const BCRYPT_ROUNDS = 10

/**
 * Normaliza a senha removendo espacos nas extremidades. Aplicado tanto ao
 * gravar quanto ao validar, para que "senha " e "senha" sejam sempre tratadas
 * de forma identica (espacos acidentais no celular/autocompletar nao quebram o
 * login).
 */
export function normalizePassword(raw: string): string {
  return raw.trim()
}

/** Gera o hash bcrypt da senha ja normalizada. */
export function hashPassword(raw: string): Promise<string> {
  return bcrypt.hash(normalizePassword(raw), BCRYPT_ROUNDS)
}

/**
 * Valida a senha informada contra o hash armazenado. Aceita hashes bcrypt
 * ($2a$/$2b$/$2y$) e, como fallback legado, comparacao direta.
 */
export function verifyPassword(raw: string, storedHash: string): Promise<boolean> {
  const input = normalizePassword(raw)
  const isBcryptHash =
    storedHash.startsWith("$2a$") ||
    storedHash.startsWith("$2b$") ||
    storedHash.startsWith("$2y$")

  const normalizedHash = storedHash.startsWith("$2y$")
    ? `$2b$${storedHash.slice(4)}`
    : storedHash

  return isBcryptHash
    ? bcrypt.compare(input, normalizedHash)
    : Promise.resolve(input === storedHash)
}
