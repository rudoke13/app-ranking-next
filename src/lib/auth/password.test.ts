import assert from "node:assert/strict"
import { test } from "node:test"

import { hashPassword, normalizePassword, verifyPassword } from "./password"

test("normalizePassword remove espacos nas extremidades", () => {
  assert.equal(normalizePassword("  senha123  "), "senha123")
  assert.equal(normalizePassword("senha123"), "senha123")
})

test("senha gravada e validada autentica mesmo com espaco extra no login", async () => {
  // Perfil/admin gravam o hash da senha normalizada.
  const hash = await hashPassword("novaSenha123")

  // Login com a mesma senha, mas com espaco no fim (comum no celular).
  const ok = await verifyPassword("novaSenha123 ", hash)

  assert.equal(ok, true)
})

test("senha gravada com espaco autentica no login sem espaco", async () => {
  const hash = await hashPassword("novaSenha123 ")
  const ok = await verifyPassword("novaSenha123", hash)
  assert.equal(ok, true)
})

test("senha errada continua sendo rejeitada", async () => {
  const hash = await hashPassword("novaSenha123")
  const ok = await verifyPassword("outraSenha", hash)
  assert.equal(ok, false)
})

test("verifyPassword aceita hashes legados com prefixo $2y$", async () => {
  const bcrypt = (await import("bcryptjs")).default
  const legacy = (await bcrypt.hash("legado123", 10)).replace(/^\$2b\$/, "$2y$")
  const ok = await verifyPassword("legado123", legacy)
  assert.equal(ok, true)
})
