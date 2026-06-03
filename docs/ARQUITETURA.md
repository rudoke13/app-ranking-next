# Arquitetura

## Visão geral

Ranking TCC é um **monólito Next.js 16 (App Router)** que serve tanto o frontend (React Server/Client Components) quanto a API (Route Handlers em `src/app/api/**`). Não há backend separado — tudo roda no mesmo processo Node (`server.js` do build `standalone`).

```
┌────────────────────────────────────────────────────────────────┐
│                        Navegador (PWA)                          │
│   Páginas SSR + Client Components (fetch /api/*)                 │
└───────────────┬────────────────────────────────────────────────┘
                │  cookie httpOnly  tcc_session (JWT)
                ▼
┌────────────────────────────────────────────────────────────────┐
│                     Next.js (processo único)                    │
│                                                                 │
│  proxy (middleware)  →  gating de rota por papel                │
│        │                                                        │
│        ├── (public)  /login /forgot-password /reset-password    │
│        ├── (app)     SessionGate → Header/Nav + páginas          │
│        └── /api/**   Route Handlers (REST)                       │
│                          │                                      │
│                  src/lib/domain/** (regras de negócio)          │
│                          │                                      │
│             ┌────────────┼─────────────┐                        │
│             ▼            ▼             ▼                         │
│        Prisma        S3 SDK       nodemailer                    │
└──────────┬───────────────┬─────────────┬───────────────────────┘
           ▼               ▼             ▼
     PostgreSQL        MinIO/S3        SMTP
     (Supabase)        (avatares,      (reset de
                       branding)        senha)
```

## Camadas

| Camada | Localização | Responsabilidade |
|--------|-------------|------------------|
| **Roteamento/Gating** | `src/proxy.ts` | Redireciona não autenticados para `/login`; restringe `/admin/*` por papel. |
| **Páginas (UI)** | `src/app/(app)`, `src/app/(public)` | Server Components que montam a tela e injetam dados iniciais; Client Components para interatividade. |
| **API (REST)** | `src/app/api/**/route.ts` | Endpoints HTTP. Validam sessão/permissão, fazem parse (zod) e delegam ao domínio. |
| **Domínio** | `src/lib/domain/**` | Regras de negócio puras + orquestração (ranking, ponto azul, desafios, rodadas, penalidades). **É o núcleo do sistema.** |
| **Infra/lib** | `src/lib/{auth,storage,email,...}` | Sessão/JWT, S3, e-mail, datas, timezone, slug, http helpers. |
| **Dados** | `prisma/schema.prisma` + `src/lib/db.ts` | Cliente Prisma singleton e schema. |

## Fluxo de uma requisição autenticada

1. Navegador chama `/api/...` com o cookie `tcc_session`.
2. (Para páginas) `proxy.ts` valida o JWT e o papel antes de renderizar.
3. O handler chama `getSessionFromCookies()` → verifica o JWT (`jose`) e confere o `sessionToken` contra o banco (com cache em memória — ver [caching-layers](./superpowers/caching-layers.md)).
4. Verifica permissão (`hasAdminAccess`, `canManageRanking`, etc.).
5. Executa a lógica no domínio e responde JSON no formato `{ ok, data | message }`.

## Autenticação (resumo)

- Login gera um `sessionToken` aleatório salvo em `users.session_token` e o embute num **JWT** (`jose`, HS256, validade 1 ano) gravado no cookie `tcc_session` (httpOnly, sameSite lax, secure em produção).
- Cada request valida o JWT **e** confere se o `sessionToken` do token bate com o do banco — permitindo invalidar sessões (logout/troca de senha) ao trocar o token no banco.
- Detalhe completo em [`modules/auth.md`](./modules/auth.md).

## Modelo de papéis

`admin` · `collaborator` · `player` · `member` (enum `users_role`).

- **admin** — acesso total (todas as telas `/admin`, todos os rankings).
- **collaborator** — staff com acesso a rankings específicos (`collaborator_rankings`) e a um subconjunto de telas admin (`/admin/usuarios`, `/admin/rodadas`, `/admin/config`).
- **player / member** — participantes do ranking.

Ver [`specs/05-papeis-e-permissoes.md`](./specs/05-papeis-e-permissoes.md).

## Conceito central: Rodada (mês) → Desafios → Recálculo

O sistema é organizado em **rodadas mensais**. Em cada rodada existem janelas de tempo (ponto azul → desafios livres → prazo). Jogadores criam **desafios**; ao fim do mês o admin **fecha/recalcula** a rodada, o que aplica os resultados às posições, grava penalidades e snapshots, e faz o **rollover** para o mês seguinte.

```
Snapshot START ──► Desafios do mês ──► closeRound() ──► Snapshot END + posições novas ──► rollover ──► próxima rodada
```

Esse pipeline é o coração do app e está documentado em detalhe em:
- [`specs/04-rodadas-e-janelas.md`](./specs/04-rodadas-e-janelas.md) (visão de produto)
- [`superpowers/snapshot-restore-rollover.md`](./superpowers/snapshot-restore-rollover.md) e [`superpowers/ranking-simulator.md`](./superpowers/ranking-simulator.md) (motor)

## Estrutura de pastas (código)

```
src/
├── app/
│   ├── (app)/          # telas autenticadas (dashboard, ranking, desafios, perfil, admin/*)
│   ├── (public)/       # login, forgot-password, reset-password
│   ├── api/            # Route Handlers (REST) — ver modules/api.md
│   ├── layout.tsx      # root layout + tema + metadata/branding
│   └── manifest.ts     # PWA manifest dinâmico
├── components/
│   ├── app/  auth/  challenges/  dashboard/  profile/  ranking/  admin/   # de domínio
│   └── ui/             # design system (shadcn/Radix)
├── lib/
│   ├── auth/           # jwt, session, types
│   ├── domain/         # ★ regras de negócio
│   ├── storage/        # s3, avatar
│   ├── email/          # mailer
│   └── (date, timezone, branding, slug, http, nav, whatsapp...)
└── proxy.ts            # middleware de gating
prisma/                 # schema, seed, SQL auxiliares
scripts/                # importações/atualizações pontuais de dados (tsx/node)
docker/                 # configs de mysql/minio (ambiente local)
```

> **Nota histórica:** há arquivos `docker/mysql`, `docker-compose.yaml` e `ranking_tcc_dump.sql` que remetem a um setup MySQL anterior. O schema **atual é PostgreSQL** (`provider = "postgresql"`). Tratar o MySQL como legado ao mexer em infra.

## Decisões e características relevantes

- **Caches em memória de processo** para sessão, verificação de JWT, rankings de colaborador e janelas de rodada — reduzem carga no DB sob tráfego. Ver [caching-layers](./superpowers/caching-layers.md). Atenção: são **por instância**; em múltiplas réplicas há janela de inconsistência (tratada com revalidação no banco).
- **Branding dinâmico** (nome, logo, favicon, ícone PWA, modo manutenção) vem da tabela `app_settings`, com cache de 60s. Ver [branding-pwa-maintenance](./superpowers/branding-pwa-maintenance.md).
- **Snapshots** (`ranking_snapshots`) preservam a foto do ranking no início (`start`) e fim (`end`) de cada mês, permitindo recalcular e restaurar com segurança.
- **Idempotência de recálculo:** `closeRound` reconstrói o baseline a partir de snapshot/hints e regrava snapshots e logs, podendo ser reexecutado.
