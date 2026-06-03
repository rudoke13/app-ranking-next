# Módulo — Autenticação & Sessão

**Localização:** `src/lib/auth/`, `src/app/api/auth/`, `src/proxy.ts`.

## Arquivos

| Arquivo | Conteúdo |
|---------|----------|
| `src/lib/auth/types.ts` | `Role`, `SessionPayload`, `SESSION_COOKIE_NAME = "tcc_session"`, `SESSION_MAX_AGE = 1 ano`. |
| `src/lib/auth/jwt.ts` | `signSession` / `verifySession` (`jose`, HS256). Cache de verificação. |
| `src/lib/auth/session.ts` | `getSessionFromCookies`, set/clear cookie, cache de `session_token`. |
| `src/lib/auth/mock-users.ts` | Usuários mock (apoio/dev). |
| `src/proxy.ts` | Middleware de gating por rota/papel. |

## SessionPayload (conteúdo do JWT)

```ts
{ userId, name, email, role, sessionToken, avatarUrl? }
```

## Modelo de sessão

1. **Login** (`POST /api/auth/login`): valida senha (bcrypt) → gera `session_token` aleatório, grava em `users.session_token` → assina JWT com esse payload → cookie `tcc_session`.
2. **Cookie:** httpOnly, `sameSite: lax`, `secure` em produção, `path: /`, `maxAge` 1 ano.
3. **Verificação por request** (`getSessionFromCookies`):
   - Lê cookie → `verifySession` (valida assinatura/expiração).
   - Confere `session.sessionToken` **contra `users.session_token` no banco**.
   - Se o token do banco mudou (logout, troca de senha, login em outro lugar) → sessão inválida.

Essa dupla checagem (JWT + token no banco) permite **invalidar sessões** sem precisar de blacklist de JWT.

## Caches (ver [superpowers/caching-layers](../superpowers/caching-layers.md))

- **Verificação de JWT** (`jwt.ts`): cache token→payload, TTL `JWT_VERIFY_CACHE_TTL_MS` (padrão 10s). Evita re-verificar a mesma assinatura em rajada.
- **session_token do banco** (`session.ts`): cache userId→token, TTL `SESSION_TOKEN_CACHE_TTL_MS` (padrão 5 min), com de-dupe de requisições in-flight. Como o cache pode ficar stale entre instâncias/deploys, ao divergir ele **revalida no banco antes de negar**.
- `primeSessionTokenCache` / `clearSessionTokenCache` mantêm o cache coerente em login/logout.

## Rotas de auth (`/api/auth`)

| Rota | Método | Função |
|------|--------|--------|
| `/login` | POST | Autentica, cria sessão. |
| `/logout` | POST | Invalida sessão e limpa cookie. |
| `/validate` | GET | Confere sessão atual. |
| `/forgot` | POST | Inicia reset (gera token + envia e-mail). |
| `/reset` | POST | Conclui reset (valida token, troca senha). |

## Gating (`proxy.ts`)

Ver [specs/05-papeis-e-permissoes](../specs/05-papeis-e-permissoes.md). Resumo: públicas passam; demais exigem cookie válido; `/admin/*` restrito por papel (admin total; collaborator limitado a usuarios/rodadas/config).

## Variáveis de ambiente

```
JWT_SECRET                       # obrigatório (assinatura HS256)
JWT_VERIFY_CACHE_TTL_MS=10000
SESSION_TOKEN_CACHE_TTL_MS=300000
```

## Pontos de atenção ao mexer

- **Nunca** logar `JWT_SECRET` nem o `session_token`.
- Trocar de papel/permissão não invalida o JWT existente automaticamente — o JWT carrega `role` no payload. Para forçar revalidação de papel, é preciso renovar a sessão (regerar token).
- O `SESSION_MAX_AGE` é longo (1 ano); a revogação efetiva depende do `session_token` no banco.
