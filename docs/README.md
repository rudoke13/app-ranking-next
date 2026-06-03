# Documentação — Ranking TCC

Plataforma de **ranking e desafios de tênis** do TCC. App web (Next.js 16 / App Router) com PWA, autenticação por sessão JWT, banco PostgreSQL (Prisma) e armazenamento de mídia em S3/MinIO.

> Esta documentação foi escrita para servir de base **antes de mexer no código**. Ela descreve o que o sistema faz hoje, as regras de negócio reais (extraídas do código) e a organização técnica.

## Como a documentação está organizada

| Pasta | O que contém | Use quando… |
|-------|--------------|-------------|
| [`specs/`](./specs/) | **Especificações funcionais** — as regras de negócio por feature (rankings, desafios, ponto azul, rodadas, papéis). Linguagem de produto. | quiser entender *o que* o sistema faz e *por quê*. |
| [`modules/`](./modules/) | **Módulos técnicos** — como o código está dividido (auth, domain, api, frontend, storage, database, infra). | quiser saber *onde* está cada coisa no código. |
| [`superpowers/`](./superpowers/) | **Mecanismos avançados** — os motores que dão o diferencial: simulador de ranking, engine de ponto azul, snapshots/restore/rollover, penalidade de WO, camadas de cache, branding/PWA/manutenção. | for mexer na lógica crítica e precisar do detalhe fino. |

### Documentos transversais

- [`ARQUITETURA.md`](./ARQUITETURA.md) — visão geral da stack, fluxo de request, camadas e decisões.
- [`GLOSSARIO.md`](./GLOSSARIO.md) — termos do domínio (ponto azul, desafio de acesso, WO, rodada, snapshot…).
- [`DEPLOY_COOLIFY.md`](./DEPLOY_COOLIFY.md) — guia de deploy em produção (Coolify + Supabase + MinIO).

## Índice rápido

### Specs (regras de negócio)
- [Rankings e posições](./specs/01-rankings.md)
- [Desafios](./specs/02-desafios.md)
- [Ponto Azul](./specs/03-ponto-azul.md)
- [Rodadas e janelas de tempo](./specs/04-rodadas-e-janelas.md)
- [Papéis e permissões](./specs/05-papeis-e-permissoes.md)
- [Perfil e conta](./specs/06-perfil-e-conta.md)

### Módulos (técnico)
- [Autenticação & Sessão](./modules/auth.md)
- [Domínio (regras)](./modules/domain.md)
- [API (rotas REST)](./modules/api.md)
- [Frontend (páginas & componentes)](./modules/frontend.md)
- [Storage (S3/MinIO)](./modules/storage.md)
- [Banco de dados (Prisma/Postgres)](./modules/database.md)
- [Infra & Deploy](./modules/infra.md)

### Superpowers (mecanismos avançados)
- [Simulador de Ranking](./superpowers/ranking-simulator.md)
- [Engine de Ponto Azul](./superpowers/blue-point-engine.md)
- [Snapshot / Restore / Rollover](./superpowers/snapshot-restore-rollover.md)
- [Penalidade automática de Walkover](./superpowers/walkover-penalty.md)
- [Camadas de cache](./superpowers/caching-layers.md)
- [Branding, PWA & Manutenção](./superpowers/branding-pwa-maintenance.md)

## Stack resumida

- **Framework:** Next.js 16 (App Router, React 19, output `standalone`)
- **Linguagem:** TypeScript
- **DB:** PostgreSQL via Prisma 6 (em produção, Supabase com pgbouncer)
- **Auth:** JWT (`jose`, HS256) em cookie httpOnly + `session_token` no banco
- **Storage:** S3 / MinIO (`@aws-sdk/client-s3`, uploads via URL presigned)
- **UI:** Tailwind CSS 4 + componentes shadcn (Radix UI) + `lucide-react`
- **E-mail:** `nodemailer` (reset de senha)
- **Validação:** `zod`
- **Deploy:** Docker multi-stage → Coolify

## Convenções

- **Idioma do produto/UI:** português (pt-BR). Domínio e logs também.
- **Timezone:** `America/Sao_Paulo` (`APP_TIMEZONE`). Datas de rodada são interpretadas nesse fuso.
- **Slugs canônicos de ranking:** `ranking-masculino`, `ranking-feminino`, `ranking-master-45` (usados em regras de acesso e rollover).
