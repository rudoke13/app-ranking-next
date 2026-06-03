# Módulo — Infra & Deploy

**Localização:** `Dockerfile`, `docker-compose.yaml`, `docker/`, `next.config.ts`, `.env*`, `docs/DEPLOY_COOLIFY.md`.

## Build & runtime

- **Next.js `standalone`** (`next.config.ts`): o build gera `.next/standalone/server.js`, copiado para uma imagem enxuta.
- **Dockerfile** multi-stage (deps → build → runner), Alpine + `libc6-compat`, porta **3000**.
- Start em produção: `prisma generate && node .next/standalone/server.js` (`npm run start:prod`).
- Healthcheck: `GET /api/health`.

## Scripts npm

```bash
npm run dev                 # desenvolvimento (next dev)
npm run build               # build (next build --webpack)
npm run start               # next start
npm run start:prod          # prisma generate + standalone server
npm run prisma:generate
npm run prisma:migrate:deploy
npm run lint
```

## Ambiente local

- `docker-compose.yaml` sobe serviços de apoio (MinIO; há também config MySQL legada em `docker/mysql`, ver nota abaixo).
- `.env.local` / `.env` para variáveis. `.env.example` é o template.

## Deploy em produção (Coolify)

Guia completo: [DEPLOY_COOLIFY.md](../DEPLOY_COOLIFY.md). Resumo:

1. **App service** — build pack Dockerfile, porta 3000, healthcheck `/api/health`.
2. **PostgreSQL** — Supabase: `DATABASE_URL` (pooler 6543, pgbouncer) + `DIRECT_URL` (direto 5432, para migrations). Schema `ranking_tcc`.
3. **MinIO** — serviço no Coolify, portas 9000 (API) / 9001 (console), domínios com SSL, bucket `S3_BUCKET`.
4. **Prisma** — não rodar seed automático; rodar migrations manualmente quando houver.
5. **Rollback** — "Redeploy previous image"; manter backups de Postgres e do volume MinIO.

## Variáveis de ambiente (referência)

| Var | Uso |
|-----|-----|
| `DATABASE_URL`, `DIRECT_URL` | Postgres (app / migrations). |
| `JWT_SECRET` | Assinatura da sessão. **Obrigatório.** |
| `NODE_ENV` | `production` em prod (ativa cookie `secure`). |
| `APP_URL`, `INTERNAL_APP_URL` | URLs do app. |
| `S3_*` | Storage (ver [modules/storage](./storage.md)). |
| `NEXT_PUBLIC_APP_NAME` | Nome padrão (fallback do branding). |
| `ADMIN_LOGO_EMAIL` | E-mail do admin usado como fallback de logo. |
| `APP_TIMEZONE` | `America/Sao_Paulo`. |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Envio de e-mail (reset de senha). |
| `JWT_VERIFY_CACHE_TTL_MS`, `SESSION_TOKEN_CACHE_TTL_MS`, `COLLABORATOR_RANKING_IDS_CACHE_TTL_MS` | Ajuste fino dos caches (ver [superpowers/caching-layers](../superpowers/caching-layers.md)). |

## E-mail

`src/lib/email/mailer.ts` (nodemailer) envia o e-mail de reset de senha usando as variáveis `SMTP_*`. Sem SMTP configurado, o fluxo de reset não entrega o e-mail.

## Checklist de teste pós-deploy

- Login admin e player.
- Upload de avatar (presigned + CORS).
- Listar rankings/jogadores.
- Criar desafio e registrar resultado.
- Acessar páginas admin.
- `/api/health` retornando `{ ok: true }`.

## Nota sobre MySQL legado

`docker/mysql`, `docker-compose.yaml` e `ranking_tcc_dump.sql` são de uma fase MySQL anterior. O banco atual é **PostgreSQL**. Ao reorganizar infra, considerar remover/explicitar esse legado para evitar confusão.
