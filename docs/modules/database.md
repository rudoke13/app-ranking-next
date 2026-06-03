# Módulo — Banco de dados (Prisma / PostgreSQL)

**Localização:** `prisma/schema.prisma`, `prisma/seed.ts`, `prisma/*.sql`, `src/lib/db.ts`.

- **Provider:** PostgreSQL (em produção, Supabase). `DATABASE_URL` (pooler/pgbouncer) + `DIRECT_URL` (conexão direta para migrations).
- **ORM:** Prisma 6. Cliente singleton em `src/lib/db.ts` (exportado como `db`).
- **Schema dedicado:** as conexões usam `schema=ranking_tcc`.

## Modelos (tabelas)

| Tabela | Papel |
|--------|-------|
| `users` | Pessoas. Papel, dados pessoais, `password_hash`, `session_token`, `avatar_path`, token de reset. |
| `rankings` | Categorias de ranking. `slug` único, `is_active`, `only_for_enrolled_players`. |
| `ranking_memberships` | Vínculo jogador↔ranking. `position`, `points`, flags (`is_blue_point`, `is_access_challenge`, `is_locked`, `is_suspended`, `license_position`). Único por (ranking, user). |
| `collaborator_rankings` | Quais rankings um colaborador pode gerenciar. |
| `rounds` | Rodadas mensais. Janelas de tempo, `status`, destaque. Pode ser global (`ranking_id = null`). |
| `challenges` | Desafios. Participantes, agenda, resultado (games/tiebreak/WO/retired), `winner`, `status`, `round_id`, posições no momento do desafio. |
| `challenge_events` | Auditoria de desafio (created/updated/completed/cancelled) + autor. |
| `challenge_penalties` | Penalidades manuais por desafio (`applies_to`, `positions`). |
| `ranking_snapshots` | Foto das posições por mês: `start` e `end`. Único por (ranking, mês, tipo, user). |
| `round_logs` | Linhas explicativas do recálculo + marcador `MANUAL_ORDER`. |
| `blue_point_history` | Concessões de ponto azul (motivo, mês). Único por (ranking, user, mês, motivo). |
| `app_settings` | Branding (nome/logo/favicon/pwa) + modo manutenção. |

## Enums

- `users_role`: admin · collaborator · player · member
- `users_gender`: male · female · other
- `challenges_status`: scheduled · accepted · declined · completed · cancelled
- `challenges_winner`: challenger · challenged
- `challenge_events_event_type`: created · updated · completed · cancelled
- `challenge_penalties_applies_to`: challenger · challenged · both
- `ranking_snapshots_snapshot_type`: start · end
- `rounds_status`: draft · open · closed
- `blue_point_history_reason`: consecutive_challenges · no_reachable_opponent · manual

## Relacionamentos-chave

- `challenges` → `users` duas vezes (challenger/challenged) + `rankings` + `rounds`.
- `ranking_memberships`, `ranking_snapshots`, `blue_point_history` → `rankings` + `users`.
- `rounds` → `rankings` (opcional) + `users` (featured/updated_by).
- Deleções em cascata a partir de `rankings`/`users` na maioria dos vínculos.

## Índices

O schema tem índices voltados às consultas quentes: desafios por `(ranking, status, scheduled_for/played_at)` e por participante+status; memberships por posição e por flags de ponto azul/suspensão; snapshots por `(ranking, mês, tipo)`; rounds por status/mês. Há SQL extra de performance em `prisma/performance_indexes_supabase.sql`.

## Scripts SQL auxiliares

- `prisma/add_rankings_only_for_enrolled_players.sql` — adiciona/ajusta a flag.
- `prisma/performance_indexes_supabase.sql` — índices de performance para Supabase.

## Seed

`prisma/seed.ts` (rodar com `npx prisma db seed`): cria usuários base (ex.: `admin@tcc.com`/`admin123`, players) e dados iniciais. **Não rodar automaticamente em produção** (ver DEPLOY).

## Scripts de dados (`scripts/`)

Scripts `tsx`/`node` pontuais, históricos, para importar desafios e atualizar snapshots de meses específicos (ex.: `import-challenges-nov-2025-*.ts`, `update-snapshot-2025-10-geral.ts`, `close-open-rounds-to-feb.js`). São operações administrativas one-off; revisar antes de reexecutar.

## Comandos úteis

```bash
npm run prisma:generate          # gerar client
npm run prisma:migrate:deploy    # aplicar migrations (usa DIRECT_URL)
npx prisma db seed               # popular dados base
npx prisma studio                # inspecionar dados
```

## Legado (atenção)

Há `docker/mysql/`, `docker-compose.yaml` e `ranking_tcc_dump.sql` remanescentes de um setup **MySQL** anterior. O schema atual é **PostgreSQL** — tratar o MySQL como legado e não como fonte de verdade.
