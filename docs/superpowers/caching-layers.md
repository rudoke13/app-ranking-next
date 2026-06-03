# Superpower — Camadas de cache

O app usa **caches em memória de processo** para reduzir carga no banco em pontos quentes. Todos têm TTL configurável por env e são **por instância** (não compartilhados entre réplicas) — por isso há revalidação no banco onde a correção importa.

## Resumo

| Cache | Arquivo | Chave → valor | TTL (env, padrão) | Revalida no DB? |
|-------|---------|---------------|-------------------|-----------------|
| Verificação de JWT | `lib/auth/jwt.ts` | token → payload | `JWT_VERIFY_CACHE_TTL_MS` (10s) | — (assinatura) |
| session_token | `lib/auth/session.ts` | userId → token | `SESSION_TOKEN_CACHE_TTL_MS` (5min) | **sim**, ao divergir |
| Rankings de colaborador | `lib/domain/collaborator-access.ts` | userId → rankingIds | `COLLABORATOR_RANKING_IDS_CACHE_TTL_MS` (60s) | — |
| Janelas de rodada | `lib/domain/challenges.ts` | rankingId → rounds | 5s (constante) | — |
| Branding | `lib/branding.ts` | global | 60s (Next cache) | — |

## 1. Verificação de JWT (`jwt.ts`)
Cache `token → SessionPayload|null`, TTL 10s, máx. 500 entradas. Evita reverificar a mesma assinatura em rajada de requests. Cacheia inclusive falhas (`null`).

## 2. session_token (`session.ts`)
Cache `userId → session_token` (TTL 5min) + de-dupe de leituras in-flight (`sessionTokenInFlight`).

Fluxo em `getSessionFromCookies`:
1. Verifica JWT → extrai `userId` e `sessionToken` esperado.
2. Se há token em cache **igual** ao esperado → sessão válida (sem ir ao banco).
3. Se em cache mas **diferente** → limpa o cache e **lê o banco** (cache pode estar stale entre deploys/instâncias).
4. Confirma contra `users.session_token`; se diferir/ausente → nega.

`primeSessionTokenCache` / `clearSessionTokenCache` mantêm coerência em login/logout. Limite de 500 entradas com poda FIFO.

> **Por que importa:** é o que permite caches longos sem "prender" sessões revogadas — a divergência sempre cai para a verdade do banco antes de negar.

## 3. Rankings de colaborador (`collaborator-access.ts`)
Cache `userId → number[]` (rankings gerenciáveis), TTL 60s, máx. 300 entradas, de-dupe in-flight. Reduz consultas a `collaborator_rankings` nas rotas admin. Guardado em `globalThis` para sobreviver a hot-reload em dev.

## 4. Janelas de rodada (`challenges.ts`)
Cache `rankingId → { openRankingRound, openGlobalRound }`, TTL **5s**. As janelas são lidas com altíssima frequência (toda checagem de "posso desafiar"); 5s evita martelar o banco sem perceptível desatualização.

## 5. Branding (`branding.ts`)
`getAppBranding()` usa cache do Next (60s) sobre `app_settings`. Ver [branding-pwa-maintenance](./branding-pwa-maintenance.md).

## Implicações em múltiplas réplicas

- Caches são **locais ao processo**. Com N réplicas, uma mudança (ex.: logout, troca de permissão de colaborador, edição de branding) pode levar até o TTL para refletir em todas.
- Pontos sensíveis à correção (sessão) **revalidam no banco** ao divergir — então a inconsistência é de *performance*, não de *segurança*.
- Branding/janelas/colaborador toleram alguns segundos de atraso por design.

## Ao mexer aqui

- Ajuste TTLs por env, sem alterar código.
- Se mudar para cache distribuído (Redis), preserve o padrão "cache otimista + revalidação no banco para sessão".
- Não cacheie dados de autorização **sem** caminho de revalidação.
